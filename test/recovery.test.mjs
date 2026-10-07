import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,readdirSync,mkdirSync,statSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { openDatabase,hashPassword } from '../src/db.mjs';
import { seedDemoScenarios,seedDemoPeople } from '../src/demo-data.mjs';
import { createBackup,verifyBackup,restoreBackup } from '../src/recovery.mjs';
import { createApp } from '../src/server.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'optical-recovery-')),path=join(dir,'source.sqlite'),db=openDatabase(path);
  db.prepare('INSERT INTO stores VALUES (?,?)').run('store-a','虚构门店');
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-manager','demo-manager','负责人（虚构）',hashPassword('recovery-password-only'),'manager','store-a');
  seedDemoScenarios(db);seedDemoPeople(db);
  const token='a'.repeat(64);db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token),'demo-manager','test-csrf',Date.now()+3600000);
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});return {dir,path,db,token};
}
test('verified online snapshot restores file/history/personnel and rejects old sessions without changing source',async t=>{
  const {dir,path,db,token}=fixture(t),file=db.prepare("SELECT bytes FROM attachment_blobs LIMIT 1").get().bytes;
  const backup=await createBackup(path,join(dir,'backups')),verified=await verifyBackup(backup.backup),originalHash=hash(readFileSync(backup.backup));
  assert.equal(verified.checks.counts.document_versions,8);assert.equal(verified.checks.counts.sessions,1);
  assert.equal(statSync(backup.backup).mode&0o777,0o600);assert.equal(statSync(backup.manifest).mode&0o777,0o600);
  const manifest=readFileSync(backup.manifest,'utf8');assert.ok(!manifest.includes('recovery-password-only')&&!manifest.includes('负责人')&&!manifest.includes('token_hash'));
  const restored=await restoreBackup(backup.backup,join(dir,'restored'));assert.equal(restored.sessions_revoked,1);assert.equal(hash(readFileSync(backup.backup)),originalHash);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,1);
  const app=createApp({databasePath:restored.database,mode:'test',logger:()=>{}});
  assert.deepEqual(Buffer.from(app.db.prepare('SELECT bytes FROM attachment_blobs LIMIT 1').get().bytes),Buffer.from(file));
  assert.equal(app.db.prepare("SELECT active FROM users WHERE id='demo-inactive'").get().active,0);
  assert.equal(app.db.prepare("SELECT must_change_password FROM user_security WHERE user_id='demo-onboarding'").get().must_change_password,1);
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await fetch(origin+'/api/me',{headers:{Cookie:`ow_session=${token}`}})).status,401);
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'demo-manager',password:'recovery-password-only'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(origin+'/api/customers',{headers:{Cookie:cookie}})).status,200);
  const receipt=JSON.parse(readFileSync(restored.receipt,'utf8'));assert.equal(receipt.checks.counts.sessions,0);assert.equal(receipt.backup_sha256,verified.sha256);
});
test('damaged backup fingerprint fails before creating a recovery destination',async t=>{
  const {dir,path}=fixture(t),backup=await createBackup(path,join(dir,'backups')),bytes=readFileSync(backup.backup);bytes[bytes.length-50]^=1;writeFileSync(backup.backup,bytes);
  await assert.rejects(verifyBackup(backup.backup),/指纹/);await assert.rejects(restoreBackup(backup.backup,join(dir,'restored')),/指纹/);assert.equal(existsSync(join(dir,'restored')),false);
});
test('manifest count mismatch and missing manifest are rejected',async t=>{
  const {dir,path}=fixture(t),backup=await createBackup(path,join(dir,'backups')),manifest=JSON.parse(readFileSync(backup.manifest,'utf8'));manifest.counts.customers++;
  writeFileSync(backup.manifest,JSON.stringify(manifest));await assert.rejects(verifyBackup(backup.backup),/核对不一致/);
  rmSync(backup.manifest);await assert.rejects(restoreBackup(backup.backup,join(dir,'restored')));assert.equal(existsSync(join(dir,'restored')),false);
});
test('restore refuses existing folders, live files, sidecars and symlink backup sources',async t=>{
  const {dir,path}=fixture(t),backup=await createBackup(path,join(dir,'backups')),target=join(dir,'existing');mkdirSync(target);
  for(const name of ['workbench.sqlite','workbench.sqlite-wal','workbench.sqlite-shm'])writeFileSync(join(target,name),'preserve original');
  await assert.rejects(restoreBackup(backup.backup,target),/EEXIST/);await assert.rejects(restoreBackup(backup.backup,path),/EEXIST/);
  for(const name of readdirSync(target))assert.equal(readFileSync(join(target,name),'utf8'),'preserve original');
  const link=join(dir,'link.sqlite');symlinkSync(backup.backup,link);await assert.rejects(verifyBackup(link),/符号链接/);
});
test('missing and old source databases never create or migrate live data',async t=>{
  const {dir}=fixture(t),missing=join(dir,'missing.sqlite');await assert.rejects(createBackup(missing,join(dir,'missing-backups')));assert.equal(existsSync(missing),false);
  const oldPath=join(dir,'old.sqlite'),old=new DatabaseSync(oldPath);old.exec('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');old.exec(readFileSync(new URL('../migrations/001_foundation.sql',import.meta.url),'utf8'));old.prepare('INSERT INTO schema_migrations VALUES (?,?)').run('001_foundation.sql',new Date().toISOString());old.close();
  const original=hash(readFileSync(oldPath));await assert.rejects(createBackup(oldPath,join(dir,'old-backups')),/结构/);assert.equal(hash(readFileSync(oldPath)),original);assert.deepEqual(readdirSync(join(dir,'old-backups')),[]);
});
test('foreign-key and attachment-content corruption fail snapshot verification and clean incomplete artifacts',async t=>{
  const {dir,path,db}=fixture(t);db.exec('PRAGMA foreign_keys=OFF');db.prepare("UPDATE customers SET store_id='missing' WHERE id='sample-plan'").run();
  await assert.rejects(createBackup(path,join(dir,'backups')),/关联/);assert.deepEqual(readdirSync(join(dir,'backups')),[]);
  db.prepare("UPDATE customers SET store_id='store-a' WHERE id='sample-plan'").run();db.exec('PRAGMA foreign_keys=ON');
  db.prepare('INSERT INTO attachment_blobs VALUES (?,?,?)').run('b'.repeat(64),Buffer.from('bad bytes'),9);
  await assert.rejects(createBackup(path,join(dir,'backups')),/附件内容/);assert.deepEqual(readdirSync(join(dir,'backups')),[]);
});
test('attachment metadata and missing immutable schema protections are rejected',async t=>{
  const {dir,path,db}=fixture(t);db.prepare("UPDATE attachments SET size=size+1 WHERE id='demo-attachment-plan'").run();
  await assert.rejects(createBackup(path,join(dir,'backups')),/附件元信息/);
  db.prepare("UPDATE attachments SET size=size-1 WHERE id='demo-attachment-plan'").run();db.exec('DROP TRIGGER audit_no_delete');
  await assert.rejects(createBackup(path,join(dir,'backups')),/结构/);assert.deepEqual(readdirSync(join(dir,'backups')),[]);
});
test('overlapping backups have unique names and counts describe their own snapshot',async t=>{
  const {dir,path,db}=fixture(t),first=createBackup(path,join(dir,'backups'));
  db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run('later','store-a','后来（虚构）',null,null,null,new Date().toISOString(),'demo-manager');
  const second=createBackup(path,join(dir,'backups')),[a,b]=await Promise.all([first,second]);assert.notEqual(a.backup,b.backup);
  assert.equal((await verifyBackup(a.backup)).checks.counts.customers,6);assert.equal((await verifyBackup(b.backup)).checks.counts.customers,7);
});
test('CLI backup, verify and independent restore succeed; invalid arguments and production are rejected',async t=>{
  const {dir,path}=fixture(t),env={...process.env,DATABASE_PATH:path,BACKUP_DIRECTORY:join(dir,'cli-backups'),NODE_ENV:'development'};
  const backup=spawnSync(process.execPath,['scripts/backup.mjs'],{env,encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);const result=JSON.parse(backup.stdout);
  assert.equal(spawnSync(process.execPath,['scripts/verify-backup.mjs',result.backup],{env,encoding:'utf8'}).status,0);
  const target=join(dir,'cli-restored');const restored=spawnSync(process.execPath,['scripts/restore.mjs',result.backup,target],{env,encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);assert.equal(JSON.parse(restored.stdout).sessions_revoked,1);
  assert.equal(spawnSync(process.execPath,['scripts/restore.mjs',result.backup,target],{env,encoding:'utf8'}).status,1);
  for(const script of ['backup','verify-backup','restore'])assert.equal(spawnSync(process.execPath,[`scripts/${script}.mjs`],{env:{...env,NODE_ENV:'production'},encoding:'utf8'}).status,1);
  assert.equal(spawnSync(process.execPath,['scripts/restore.mjs'],{env,encoding:'utf8'}).status,1);
});
