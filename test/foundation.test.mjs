import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createApp } from '../src/server.mjs';
import { openDatabase, hashPassword, transaction } from '../src/db.mjs';
import { createBackup,restoreBackup } from '../src/recovery.mjs';
import { seedDemoScenarios, seedDemoPeople, seedDemoProfiles, seedDemoCycleRevisions, demoScenarios } from '../src/demo-data.mjs';

async function fixture(t,{persist=false,logger=()=>{}}={}) {
  const dir=mkdtempSync(join(tmpdir(),'optical-test-'));
  const path=persist?join(dir,'test.sqlite'):':memory:';
  const app=createApp({databasePath:path,mode:'test',logger}),{db,server}=app;
  transaction(db,()=>{
    db.exec("INSERT INTO stores VALUES ('a','A'),('b','B')");
    for(const [id,role,store] of [['manager','manager','a'],['front','reception','a'],['professional','professional','a'],['other','manager','b'],['parent','guardian',null]])db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run(id,id,id,hashPassword('test-password-only'),role,store);
    for(const [id,store] of [['child-a','a'],['sibling-a','a'],['child-b','b']])db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run(id,store,id,'2017-01-01','shared-parent','10000000000',new Date().toISOString(),store==='a'?'manager':'other');
    db.prepare('INSERT INTO guardian_links (user_id,customer_id,active) VALUES (?,?,1)').run('parent','child-a');
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{if(server.listening)await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});});
  const request=async(path,{cookie,csrf,method='GET',data,key,headers={}}={})=>{
    const r=await fetch(origin+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(key?{'Idempotency-Key':key}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});
    return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
  };
  const login=async(username,password='test-password-only')=>{const r=await request('/api/auth/login',{method:'POST',data:{username,password}});assert.equal(r.status,200);const m=await request('/api/me',{cookie:r.cookie});return {cookie:r.cookie,csrf:m.body.csrf};};
  return {...app,request,login,path,dir,origin};
}

async function upload(origin,session,customerId='child-a',{bytes=Buffer.from('虚构资料清单'),type='text/plain',filename='资料（虚构）.txt',key='file-upload-key'}={}){
  const r=await fetch(`${origin}/api/customers/${customerId}/attachments`,{method:'POST',headers:{Cookie:session.cookie,'X-CSRF-Token':session.csrf,'Content-Type':type,'X-File-Name':encodeURIComponent(filename),'Idempotency-Key':key},body:bytes});
  return {status:r.status,body:await r.json()};
}

test('unauthenticated requests, invalid credentials and CSRF are rejected; logout revokes session',async t=>{
  const {request,login}=await fixture(t);
  assert.equal((await request('/api/customers')).status,401);
  assert.equal((await request('/api/auth/login',{method:'POST',data:{username:'manager',password:'wrong'}})).status,401);
  const session=await login('manager');assert.equal((await request('/api/customers',{cookie:session.cookie,method:'POST',data:{name:'sample'},key:'valid-key-0001'})).status,403);
  assert.equal((await request('/api/auth/logout',{...session,method:'POST'})).status,200);
  assert.equal((await request('/api/me',session)).status,401);
});
test('store scope and action permissions are enforced on lists, direct access and writes',async t=>{
  const {request,login}=await fixture(t), manager=await login('manager'),professional=await login('professional'),front=await login('front');
  const list=await request('/api/customers',manager);assert.equal(list.body.items.length,2);assert.ok(list.body.items.every(c=>c.store_id==='a'));
  assert.equal((await request('/api/customers/child-b',manager)).status,404);
  assert.equal((await request('/api/customers/child-b/cycles',{...manager,method:'POST',data:{type:'followup',goal:'sample'},key:'cycle-key-0001'})).status,404);
  assert.equal((await request('/api/customers',{...professional,method:'POST',data:{name:'sample'},key:'valid-key-0001'})).status,403);
  assert.equal((await request('/api/audit',front)).status,403);
});
test('guardian scope, field filtering and immediate relationship revocation work',async t=>{
  const {request,login,db}=await fixture(t),parent=await login('parent');
  const list=await request('/api/customers',parent);assert.equal(list.body.items.length,1);assert.equal(list.body.items[0].id,'child-a');assert.equal(list.body.items[0].phone,undefined);
  const detail=await request('/api/customers/child-a',parent);assert.deepEqual(detail.body.cycles,[]);assert.equal(detail.body.customer.contact_name,undefined);
  assert.equal((await request('/api/customers/sibling-a',parent)).status,404);
  assert.equal((await request('/api/customers/child-a/cycles',{...parent,method:'POST',data:{type:'training',goal:'sample'},key:'valid-key-0001'})).status,403);
  db.prepare('UPDATE guardian_links SET active=0 WHERE user_id=?').run('parent');
  assert.equal((await request('/api/customers/child-a',parent)).status,404);assert.equal((await request('/api/customers',parent)).body.items.length,0);
});
test('customer creation is atomic, same telephone remains separate and duplicate submission returns one record',async t=>{
  const {request,login,db}=await fixture(t),session=await login('front'),data={name:'sibling-test',birth_date:'2019-06-12',contact_name:'shared-parent',phone:'10000000000'};
  const options={...session,method:'POST',data,key:'new-customer-0001'};
  const [a,b]=await Promise.all([request('/api/customers',options),request('/api/customers',options)]);
  assert.equal(a.status,201);assert.deepEqual(a.body,b.body);assert.equal(a.body.duplicate_candidates.length,2);
  assert.equal(db.prepare('SELECT count(*) n FROM customers').get().n,4);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='customer.create'").get().n,1);
  assert.equal((await request('/api/customers',{...options,data:{...data,name:'changed'}})).status,409);
  assert.equal((await request('/api/customers?q=10000000000',session)).body.items.length,3);
});
test('validation preserves unknown values, rejects bad dates and forces server store ownership',async t=>{
  const {request,login}=await fixture(t),session=await login('manager');
  for(const birth_date of ['2024-02-30','2099-01-01','bad'])assert.equal((await request('/api/customers',{...session,method:'POST',data:{name:'sample',birth_date},key:'invalid-date-0001'})).status,422);
  assert.equal((await request('/api/customers',{...session,method:'POST',data:{name:'sample'}})).status,400);
  const r=await request('/api/customers',{...session,method:'POST',data:{name:'sample',store_id:'b'},key:'new-customer-0002'});
  assert.equal(r.body.customer.store_id,'a');assert.equal(r.body.customer.birth_date,null);assert.equal(r.body.customer.phone,null);
});
test('parallel draft cycles stay independent and idempotency is scoped to customer and actor',async t=>{
  const {request,login,db}=await fixture(t),session=await login('professional');
  const options={...session,method:'POST',data:{type:'followup',goal:'first cycle'},key:'shared-cycle-key'};
  const a=await request('/api/customers/child-a/cycles',options);
  const replay=await request('/api/customers/child-a/cycles',options);assert.deepEqual(a.body,replay.body);
  const b=await request('/api/customers/sibling-a/cycles',options);assert.notEqual(a.body.cycle.id,b.body.cycle.id);
  const c=await request('/api/customers/child-a/cycles',{...options,key:'another-cycle-key',data:{type:'training',goal:'independent cycle'}});
  assert.equal(c.body.cycle.status,'draft');assert.equal(db.prepare('SELECT count(*) n FROM service_cycles').get().n,3);
  assert.equal((await request('/api/customers/child-a',session)).body.cycles.length,2);
});
test('audit insert failure rolls back business record and retry bookkeeping',async t=>{
  const {request,login,db}=await fixture(t),session=await login('manager');
  db.exec("CREATE TRIGGER simulate_failure BEFORE INSERT ON audit_events WHEN NEW.action='customer.create' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
  const options={...session,method:'POST',data:{name:'must roll back'},key:'failure-test-key'};
  assert.equal((await request('/api/customers',options)).status,500);
  assert.equal(db.prepare('SELECT count(*) n FROM customers').get().n,3);assert.equal(db.prepare('SELECT count(*) n FROM idempotency').get().n,0);
  db.exec('DROP TRIGGER simulate_failure');assert.equal((await request('/api/customers',options)).status,201);
});
test('audit is append-only, health checks database and disabling user revokes access',async t=>{
  const {request,login,db}=await fixture(t),session=await login('manager');
  assert.throws(()=>db.exec("DELETE FROM audit_events"),/append-only/);
  assert.throws(()=>db.exec("UPDATE audit_events SET action='tamper'"),/append-only/);
  assert.equal((await request('/api/health')).body.schema,6);
  const audit=await request('/api/audit',session);assert.equal(audit.body.items[0].action,'session.login');assert.equal(audit.body.items[0].after_json,undefined);
  db.prepare("UPDATE users SET active=0 WHERE id='manager'").run();assert.equal((await request('/api/me',session)).status,401);
});
test('disk persistence, repeatable migrations and consistent backup restore preserve counts',async t=>{
  const {request,login,db,server,path,dir}=await fixture(t,{persist:true}),session=await login('manager');
  await request('/api/customers',{...session,method:'POST',data:{name:'persistent'},key:'persistent-customer'});
  const backup=join(dir,'backup.sqlite');db.prepare('VACUUM INTO ?').run(backup);
  const counts=Object.fromEntries(['customers','audit_events','service_cycles'].map(table=>[table,db.prepare(`SELECT count(*) n FROM ${table}`).get().n]));
  await new Promise(resolve=>server.close(resolve));
  for(const target of [path,backup]){const restored=openDatabase(target);assert.equal(restored.prepare('SELECT count(*) n FROM schema_migrations').get().n,6);for(const [table,count] of Object.entries(counts))assert.equal(restored.prepare(`SELECT count(*) n FROM ${table}`).get().n,count);assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');restored.close();}
});
test('production mode refuses unreviewed deployment; HTML and assets use security headers',async t=>{
  assert.throws(()=>createApp({mode:'production'}),/Production is blocked/);
  const {origin}=await fixture(t);const r=await fetch(origin);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await r.text(),/lang="zh-CN"/);
  assert.equal((await fetch(origin+'/../package.json')).status,404);
});

test('organization directory is store scoped, manager only and omits credentials',async t=>{
  const {request,login}=await fixture(t),manager=await login('manager'),front=await login('front'),parent=await login('parent');
  const org=await request('/api/organization',manager);assert.equal(org.status,200);
  assert.ok(org.body.items.some(u=>u.id==='parent'));assert.ok(!org.body.items.some(u=>u.id==='other'));
  assert.ok(org.body.items.every(u=>u.password_hash===undefined&&u.token_hash===undefined&&u.csrf===undefined));
  assert.equal((await request('/api/organization',front)).status,403);
  assert.equal((await request('/api/demo/scenarios',parent)).status,403);
});
test('manager can authorize siblings and revoke with reason, replay once and keep audit before/after',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager'),parent=await login('parent'),front=await login('front');
  const data={user_id:'parent',relationship:'监护人（虚构）',active:true,reason:'演示资料授权核对'};
  const options={...manager,method:'POST',data,key:'family-authorize-key'};
  assert.equal((await request('/api/customers/sibling-a/guardians',{...options,...front})).status,403);
  assert.equal((await request('/api/customers/child-b/guardians',options)).status,404);
  assert.equal((await request('/api/customers/sibling-a/guardians',{...options,data:{...data,user_id:'other'}})).status,404);
  assert.equal((await request('/api/customers/sibling-a/guardians',{...options,data:{...data,reason:''}})).status,422);
  const granted=await request('/api/customers/sibling-a/guardians',options);assert.equal(granted.status,200);
  assert.deepEqual((await request('/api/customers/sibling-a/guardians',options)).body,granted.body);
  assert.equal((await request('/api/customers',parent)).body.items.length,2);
  assert.equal((await request('/api/customers/sibling-a',parent)).body.guardians.length,0);
  const revoke=await request('/api/customers/sibling-a/guardians',{...options,key:'family-revoke-key',data:{...data,active:false,reason:'演示：监护授权撤销'}});assert.equal(revoke.status,200);
  assert.equal((await request('/api/customers/sibling-a',parent)).status,404);
  const audit=db.prepare("SELECT before_json,after_json FROM audit_events WHERE action='guardian.revoke'").get();assert.equal(JSON.parse(audit.before_json).active,1);assert.equal(JSON.parse(audit.after_json).active,false);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='guardian.authorize'").get().n,1);
});
test('one visit links multiple customer cycles, rejects mismatches and closes independently',async t=>{
  const {request,login,db}=await fixture(t),front=await login('front'),professional=await login('professional');
  const ids=[];
  for(const [type,goal] of [['followup','review'],['training','training']]){
    const r=await request('/api/customers/child-a/cycles',{...front,method:'POST',data:{type,goal},key:`visit-cycle-${type}`});ids.push(r.body.cycle.id);
  }
  const options={...front,method:'POST',data:{purpose:'复查与服务需求登记',cycle_ids:ids},key:'register-multi-cycle'};
  assert.equal((await request('/api/customers/child-a/visits',{...options,...professional})).status,403);
  assert.equal((await request('/api/customers/sibling-a/visits',options)).status,422);
  const [a,b]=await Promise.all([request('/api/customers/child-a/visits',options),request('/api/customers/child-a/visits',options)]);assert.equal(a.status,201);assert.deepEqual(a.body,b.body);
  assert.equal(db.prepare('SELECT count(*) n FROM visits').get().n,1);
  const visit=a.body.visit.id,close={...front,method:'POST',data:{reason:'本次到店结束，后续周期继续'},key:'close-visit-key'};
  const closed=await request(`/api/visits/${visit}/close`,close);assert.equal(closed.status,200);assert.equal(closed.body.visit.status,'closed');
  assert.deepEqual((await request(`/api/visits/${visit}/close`,close)).body,closed.body);
  assert.equal((await request(`/api/visits/${visit}/close`,{...close,key:'second-close-key'})).status,409);
  const detail=await request('/api/customers/child-a',front);assert.equal(detail.body.visits[0].cycle_ids.length,2);assert.ok(detail.body.cycles.every(c=>c.status==='draft'));
});
test('visit close failure rolls back status and audit; other store cannot close it',async t=>{
  const {request,login,db}=await fixture(t),front=await login('front'),other=await login('other');
  const r=await request('/api/customers/child-a/visits',{...front,method:'POST',data:{purpose:'demo visit'},key:'rollback-visit-register'});const id=r.body.visit.id;
  const options={...front,method:'POST',data:{reason:'finished'},key:'rollback-visit-close'};
  assert.equal((await request(`/api/visits/${id}/close`,{...options,...other})).status,404);
  db.exec("CREATE TRIGGER reject_visit_audit BEFORE INSERT ON audit_events WHEN NEW.action='visit.close' BEGIN SELECT RAISE(ABORT,'simulate'); END;");
  assert.equal((await request(`/api/visits/${id}/close`,options)).status,500);
  assert.equal(db.prepare('SELECT status FROM visits WHERE id=?').get(id).status,'registered');
  db.exec('DROP TRIGGER reject_visit_audit');assert.equal((await request(`/api/visits/${id}/close`,options)).status,200);
});
test('scenario expansion is repeatable and never overwrites a conflicting customer',()=>{
  const db=openDatabase(':memory:');
  try{
    db.exec("INSERT INTO stores VALUES ('store-a','A')");
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-manager','demo-manager','演示店长',hashPassword('test-only'),'manager','store-a');
    const first=seedDemoScenarios(db);assert.equal(first.customers,6);assert.equal(first.cycles,6);assert.equal(first.visits,6);
    assert.deepEqual(seedDemoScenarios(db),{customers:0,cycles:0,visits:0,documents:0,attachments:0});
    assert.equal(db.prepare('SELECT count(*) n FROM audit_events').get().n,1);
    db.prepare('UPDATE customers SET name=? WHERE id=?').run('conflicting record',demoScenarios[0].customer_id);
    assert.throws(()=>seedDemoScenarios(db),/不会覆盖/);assert.equal(db.prepare('SELECT name FROM customers WHERE id=?').get(demoScenarios[0].customer_id).name,'conflicting record');
  }finally{db.close();}
});

test('migration upgrades a V0.1 database without losing customers, cycles or existing authorization',()=>{
  const dir=mkdtempSync(join(tmpdir(),'optical-upgrade-')),path=join(dir,'old.sqlite');let old,upgraded;
  try{
    old=new DatabaseSync(path);old.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
    old.exec(readFileSync(new URL('../migrations/001_foundation.sql',import.meta.url),'utf8'));
    old.prepare('INSERT INTO schema_migrations VALUES (?,?)').run('001_foundation.sql',new Date().toISOString());
    old.exec("INSERT INTO stores VALUES ('a','A')");
    old.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('manager','manager','manager',hashPassword('test-only'),'manager','a');
    old.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('parent','parent','parent',hashPassword('test-only'),'guardian',null);
    old.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run('child','a','original',null,null,null,new Date().toISOString(),'manager');
    old.exec("INSERT INTO guardian_links VALUES ('parent','child',1)");
    old.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run('cycle','child','followup','original goal','draft',new Date().toISOString(),'manager');
    old.close();old=undefined;
    upgraded=openDatabase(path);assert.equal(upgraded.prepare('SELECT name FROM customers').get().name,'original');
    assert.equal(upgraded.prepare('SELECT goal FROM service_cycles').get().goal,'original goal');
    assert.equal(upgraded.prepare('SELECT active FROM guardian_links').get().active,1);
    assert.equal(upgraded.prepare('SELECT relationship FROM guardian_links').get().relationship,null);
    assert.equal(upgraded.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{old?.close();upgraded?.close();rmSync(dir,{recursive:true,force:true});}
});

test('attachments store exact bytes, scope downloads, deduplicate retries and log reads',async t=>{
  const {origin,login,db}=await fixture(t),manager=await login('manager'),other=await login('other'),parent=await login('parent');
  const bytes=Buffer.from('仅供演示\n客户独立档案\n');
  const [a,b]=await Promise.all([upload(origin,manager,'child-a',{bytes}),upload(origin,manager,'child-a',{bytes})]);
  assert.equal(a.status,201);assert.deepEqual(a.body,b.body);assert.equal(db.prepare('SELECT count(*) n FROM attachments').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM attachment_blobs').get().n,1);
  const id=a.body.attachment.id,r=await fetch(`${origin}/api/attachments/${id}/download`,{headers:{Cookie:manager.cookie}});
  assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^attachment;/);assert.match(r.headers.get('content-security-policy'),/sandbox/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
  assert.equal((await fetch(`${origin}/api/attachments/${id}/download`,{headers:{Cookie:other.cookie}})).status,404);
  assert.equal((await fetch(`${origin}/api/attachments/${id}/download`,{headers:{Cookie:parent.cookie}})).status,403);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='attachment.download'").get().n,1);
});
test('attachments reject paths, active content, empty/oversized files and invalid encoding',async t=>{
  const {origin,login}=await fixture(t),manager=await login('manager');
  for(const filename of ['../other.txt','bad\\name.txt','bad\nname.txt'])assert.equal((await upload(origin,manager,'child-a',{filename})).status,422);
  assert.equal((await upload(origin,manager,'child-a',{type:'text/html',bytes:Buffer.from('<script>alert(1)</script>')})).status,415);
  assert.equal((await upload(origin,manager,'child-a',{type:'image/png',bytes:Buffer.from('not PNG')})).status,415);
  assert.equal((await upload(origin,manager,'child-a',{bytes:Buffer.from([255,255])})).status,415);
  assert.equal((await upload(origin,manager,'child-a',{bytes:Buffer.alloc(0)})).status,422);
  assert.equal((await upload(origin,manager,'child-a',{bytes:Buffer.alloc(1048577,65)})).status,413);
});
test('attachment revoke stops downloads, restricts other uploaders and preserves historical references',async t=>{
  const {origin,request,login,db}=await fixture(t),manager=await login('manager'),front=await login('front');
  const uploaded=await upload(origin,manager),id=uploaded.body.attachment.id;
  const d=await request('/api/customers/child-a/documents',{...manager,method:'POST',data:{title:'资料备忘',content:'家长自报，不当作实测',source:'guardian_report',attachment_ids:[id]},key:'document-with-file'});
  assert.equal(d.status,201);
  const options={...front,method:'POST',data:{reason:'演示撤销访问'},key:'file-revoke-key'};
  assert.equal((await request(`/api/attachments/${id}/revoke`,options)).status,403);
  const revoked=await request(`/api/attachments/${id}/revoke`,{...options,...manager});assert.equal(revoked.status,200);
  assert.equal((await fetch(`${origin}/api/attachments/${id}/download`,{headers:{Cookie:front.cookie}})).status,410);
  const history=await request(`/api/documents/${d.body.document.record_id}`,manager);assert.equal(history.body.versions[0].attachments[0].id,id);assert.ok(history.body.versions[0].attachments[0].revoked_at);
  assert.equal(db.prepare('SELECT count(*) n FROM attachment_blobs').get().n,1);
  assert.equal((await request(`/api/attachments/${id}/revoke`,{...options,...manager,key:'another-revoke-key'})).status,409);
});
test('document revisions preserve old values, replay once and reject simultaneous stale versions',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager'),professional=await login('professional'),other=await login('other'),parent=await login('parent');
  const initial={title:'初始资料',content:'原始需求记录',source:'guardian_report'};
  const first=await request('/api/customers/child-a/documents',{...manager,method:'POST',data:initial,key:'version-one-key'});assert.equal(first.status,201);
  const id=first.body.document.record_id,options={...professional,method:'POST',data:{title:'补充资料',content:'补充内容',source:'employee',expected_version:1,revision_reason:'补充接待依据'},key:'version-two-key'};
  const alternative={...options,key:'another-writer-key',data:{...options.data,content:'另一个修改'}};
  const [a,b]=await Promise.all([request(`/api/documents/${id}/versions`,options),request(`/api/documents/${id}/versions`,alternative)]);
  assert.deepEqual([a.status,b.status].sort(),[201,409]);const winning=a.status===201?options:alternative;assert.equal((await request(`/api/documents/${id}/versions`,winning)).status,201);
  const history=await request(`/api/documents/${id}`,manager);assert.equal(history.body.versions.length,2);assert.equal(history.body.versions[1].content,initial.content);assert.equal(history.body.versions[1].source,'guardian_report');
  assert.equal((await request(`/api/documents/${id}`,other)).status,404);assert.equal((await request(`/api/documents/${id}`,parent)).status,403);
  assert.throws(()=>db.exec("UPDATE document_versions SET content='tampered'"),/immutable/);assert.throws(()=>db.exec('DELETE FROM document_versions'),/immutable/);
});
test('documents reject cross-customer attachments and roll back both file/version writes on audit failure',async t=>{
  const {origin,request,login,db}=await fixture(t),manager=await login('manager');
  const other=await upload(origin,manager,'sibling-a',{key:'sibling-file-key'});
  const data={title:'demo',content:'demo',source:'external',attachment_ids:[other.body.attachment.id]};
  assert.equal((await request('/api/customers/child-a/documents',{...manager,method:'POST',data,key:'bad-file-document'})).status,422);
  assert.equal(db.prepare('SELECT count(*) n FROM document_records').get().n,0);
  db.exec("CREATE TRIGGER reject_document_audit BEFORE INSERT ON audit_events WHEN NEW.action IN('attachment.upload','document.create') BEGIN SELECT RAISE(ABORT,'simulate'); END;");
  assert.equal((await upload(origin,manager,'child-a',{bytes:Buffer.from('new rollback bytes'),key:'rollback-file-key'})).status,500);
  assert.equal(db.prepare('SELECT count(*) n FROM attachments').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM attachment_blobs').get().n,1);
  assert.equal((await request('/api/customers/child-a/documents',{...manager,method:'POST',data:{...data,attachment_ids:[]},key:'rollback-document-key'})).status,500);
  assert.equal(db.prepare('SELECT count(*) n FROM document_records').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM document_versions').get().n,0);
});
test('consistent backup restores attachment bytes and immutable document references',async t=>{
  const {origin,request,login,db,dir}=await fixture(t,{persist:true}),manager=await login('manager');
  const bytes=Buffer.from('备份中的虚构附件'),f=await upload(origin,manager,'child-a',{bytes});
  const d=await request('/api/customers/child-a/documents',{...manager,method:'POST',data:{title:'备份资料',content:'保留引用',source:'employee',attachment_ids:[f.body.attachment.id]},key:'backup-document-key'});
  assert.equal(d.status,201);const target=join(dir,'files-backup.sqlite');db.prepare('VACUUM INTO ?').run(target);const backup=openDatabase(target);
  try{assert.deepEqual(Buffer.from(backup.prepare('SELECT bytes FROM attachment_blobs').get().bytes),bytes);assert.equal(backup.prepare('SELECT attachment_id FROM version_attachments').get().attachment_id,f.body.attachment.id);assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{backup.close();}
});

test('staff onboarding is scoped, idempotent and gated until initial password is changed',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager'),front=await login('front');
  const data={username:'sample-new',display_name:'新员工（虚构）',role:'reception',initial_password:'initial-password-only',reason:'虚构入职演示'},options={...manager,method:'POST',data,key:'staff-create-one'};
  assert.equal((await request('/api/organization/staff',{...options,...front})).status,403);
  assert.equal((await request('/api/organization/staff',{...options,data:{...data,store_id:'b'}})).status,422);
  const created=await request('/api/organization/staff',options);assert.equal(created.status,201);assert.equal(created.body.staff.store_id,'a');assert.equal(created.body.staff.must_change_password,1);
  assert.deepEqual((await request('/api/organization/staff',options)).body,created.body);
  assert.equal((await request('/api/organization/staff',{...options,key:'staff-create-two'})).status,409);
  const newcomer=await login(data.username,data.initial_password);
  assert.equal((await request('/api/me',newcomer)).body.must_change_password,true);
  for(const path of ['/api/customers','/api/customers/child-a/attachments','/api/demo/scenarios'])assert.equal((await request(path,newcomer)).body.error.code,'PASSWORD_CHANGE_REQUIRED');
  const changed=await request('/api/auth/password',{...newcomer,method:'POST',data:{current_password:data.initial_password,new_password:'new-personal-password'},key:'initial-password-change'});assert.equal(changed.status,200);
  assert.equal((await request('/api/me',newcomer)).body.must_change_password,false);assert.equal((await request('/api/customers',newcomer)).status,200);
  const logs=JSON.stringify(db.prepare('SELECT * FROM audit_events').all())+JSON.stringify(db.prepare('SELECT * FROM idempotency').all());assert.ok(!logs.includes(data.initial_password)&&!logs.includes('new-personal-password')&&!logs.includes('password_hash'));
});
test('personnel editing rejects cross-store, self and guardian targets and revokes changed permissions',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager'),front=await login('front'),parent=await login('parent');
  const data={display_name:'前台（虚构）',role:'professional',active:true,expected_revision:1,reason:'演示岗位调整'},options={...manager,method:'POST',data,key:'staff-role-change'};
  assert.equal((await request('/api/organization/staff/front',{...options,...parent})).status,403);
  for(const id of ['other','parent'])assert.equal((await request(`/api/organization/staff/${id}`,options)).status,404);
  assert.equal((await request('/api/organization/staff/manager',options)).body.error.code,'SELF_MANAGEMENT');
  assert.equal((await request('/api/organization/staff/front',{...options,data:{...data,store_id:'b'}})).status,422);
  const updated=await request('/api/organization/staff/front',options);assert.equal(updated.status,200);assert.equal(updated.body.staff.revision,2);assert.equal(updated.body.revoked_sessions,1);
  assert.equal((await request('/api/customers',front)).status,401);
  const next=await login('front');assert.equal((await request('/api/me',next)).body.role,'professional');
  assert.equal((await request('/api/customers',{...next,method:'POST',data:{name:'不应创建'},key:'professional-create'})).status,403);
  assert.deepEqual((await request('/api/organization/staff/front',options)).body,updated.body);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='staff.update'").get().n,1);
});
test('disable, reactivate and reset require fresh revisions; old sessions and passwords stay revoked',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager'),front=await login('front');
  const edit=(active,expected_revision,key)=>request('/api/organization/staff/front',{...manager,method:'POST',data:{display_name:'前台（虚构）',role:'reception',active,expected_revision,reason:'虚构停用或恢复'},key});
  assert.equal((await edit(false,1,'staff-disable-key')).status,200);assert.equal((await request('/api/me',front)).status,401);
  assert.equal((await request('/api/auth/login',{method:'POST',data:{username:'front',password:'test-password-only'}})).status,401);
  assert.equal((await edit(true,1,'staff-stale-enable')).body.error.code,'STALE_ACCOUNT');
  assert.equal((await edit(true,2,'staff-enable-key')).status,200);const resumed=await login('front');assert.equal((await request('/api/me',front)).status,401);
  const reset={...manager,method:'POST',data:{initial_password:'reset-password-only',expected_revision:3,reason:'虚构密码重置'},key:'staff-reset-password'};
  const changed=await request('/api/organization/staff/front/reset-password',reset);assert.equal(changed.status,200);assert.equal(changed.body.staff.must_change_password,1);
  assert.equal((await request('/api/me',resumed)).status,401);
  assert.equal((await request('/api/auth/login',{method:'POST',data:{username:'front',password:'test-password-only'}})).status,401);
  const temporary=await login('front','reset-password-only');assert.equal((await request('/api/customers',temporary)).status,403);
  const revoke=await request('/api/organization/staff/front/revoke-sessions',{...manager,method:'POST',data:{expected_revision:4,reason:'虚构会话撤销'},key:'staff-revoke-sessions'});assert.equal(revoke.body.revoked_sessions,1);assert.equal((await request('/api/me',temporary)).status,401);
  assert.equal(db.prepare("SELECT count(*) n FROM customers WHERE created_by='front'").get().n,0);
});
test('own password change verifies current secret, keeps this session and revokes others; retries do not repeat',async t=>{
  const {request,login}=await fixture(t),one=await login('manager'),two=await login('manager');
  const options={...one,method:'POST',data:{current_password:'test-password-only',new_password:'my-new-password-only'},key:'own-password-change'};
  assert.equal((await request('/api/auth/password',{...options,csrf:undefined})).status,403);
  assert.equal((await request('/api/auth/password',{...options,data:{...options.data,new_password:'short'}})).status,422);
  assert.equal((await request('/api/auth/password',{...options,data:{...options.data,current_password:'wrong'}})).body.error.code,'CURRENT_PASSWORD');
  const changed=await request('/api/auth/password',options);assert.equal(changed.status,200);assert.equal(changed.body.revoked_sessions,1);
  assert.equal((await request('/api/me',one)).status,200);assert.equal((await request('/api/me',two)).status,401);
  assert.deepEqual((await request('/api/auth/password',options)).body,changed.body);
  assert.equal((await request('/api/auth/login',{method:'POST',data:{username:'manager',password:'test-password-only'}})).status,401);
  await login('manager','my-new-password-only');
});
test('concurrent personnel mutations accept one fresh revision and preserve the successful retry',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager');
  const opts=name=>({...manager,method:'POST',data:{display_name:name,role:'reception',active:true,expected_revision:1,reason:'虚构并发修改'},key:'concurrent-'+name});
  const a=opts('first'),b=opts('second'),results=await Promise.all([request('/api/organization/staff/front',a),request('/api/organization/staff/front',b)]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);const index=results.findIndex(x=>x.status===200);
  assert.deepEqual((await request('/api/organization/staff/front',index===0?a:b)).body,results[index].body);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='staff.update'").get().n,1);
});
test('audit failures roll back account creation, password resets, revisions and session revocation together',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager'),front=await login('front'),before=db.prepare("SELECT password_hash FROM users WHERE id='front'").get().password_hash;
  db.exec("CREATE TRIGGER fail_staff_audit BEFORE INSERT ON audit_events WHEN NEW.action LIKE 'staff.%' OR NEW.action='account.password' BEGIN SELECT RAISE(ABORT,'forced test failure'); END;");
  assert.equal((await request('/api/organization/staff',{...manager,method:'POST',data:{username:'failed-person',display_name:'失败（虚构）',role:'reception',initial_password:'initial-password-only',reason:'虚构回滚'},key:'staff-failure-create'})).status,500);
  assert.equal(db.prepare("SELECT 1 FROM users WHERE username='failed-person'").get(),undefined);
  assert.equal((await request('/api/organization/staff/front/reset-password',{...manager,method:'POST',data:{initial_password:'reset-password-only',expected_revision:1,reason:'虚构回滚'},key:'staff-failure-reset'})).status,500);
  assert.equal(db.prepare("SELECT password_hash FROM users WHERE id='front'").get().password_hash,before);assert.equal(db.prepare("SELECT 1 FROM user_security WHERE user_id='front'").get(),undefined);
  assert.equal((await request('/api/organization/staff/front',{...manager,method:'POST',data:{display_name:'不得保存',role:'professional',active:false,expected_revision:1,reason:'虚构失败'},key:'staff-failure-edit'})).status,500);
  assert.equal((await request('/api/auth/password',{...manager,method:'POST',data:{current_password:'test-password-only',new_password:'new-password-only'},key:'own-failure-password'})).status,500);
  assert.equal(db.prepare("SELECT role,active FROM users WHERE id='front'").get().role,'reception');
  assert.equal((await request('/api/me',front)).status,200);assert.equal(db.prepare("SELECT count(*) n FROM idempotency WHERE operation LIKE 'staff.%'").get().n,0);
  await login('manager');
});
test('revocation blocks a request already waiting for its body before any business mutation',async t=>{
  const {request,login,server,origin,db}=await fixture(t),manager=await login('manager'),front=await login('front');
  const accepted=once(server,'request');
  const pending=httpRequest(origin+'/api/customers',{method:'POST',headers:{Cookie:front.cookie,'X-CSRF-Token':front.csrf,'Idempotency-Key':'slow-revoked-request','Content-Type':'application/json'}});
  const response=new Promise((resolve,reject)=>{pending.on('error',reject);pending.on('response',r=>{let text='';r.on('data',chunk=>text+=chunk);r.on('end',()=>resolve({status:r.statusCode,body:JSON.parse(text)}));});});
  pending.flushHeaders();await accepted;
  const revoke=await request('/api/organization/staff/front/revoke-sessions',{...manager,method:'POST',data:{expected_revision:1,reason:'虚构处理中撤销'},key:'revoke-pending-session'});assert.equal(revoke.status,200);
  pending.end(JSON.stringify({name:'不得保存（虚构）'}));assert.equal((await response).status,401);
  assert.equal(db.prepare("SELECT 1 FROM customers WHERE name='不得保存（虚构）'").get(),undefined);
});

test('synthetic personnel append once and preserve account state and passwords on repeated initialization',async t=>{
  const {db}=await fixture(t);
  db.prepare('INSERT INTO stores VALUES (?,?)').run('store-a','示例门店');
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-manager','demo-manager','负责人（虚构）',hashPassword('test-password-only'),'manager','store-a');
  assert.deepEqual(seedDemoPeople(db),{added:2});
  const hash=db.prepare("SELECT password_hash FROM users WHERE id='demo-onboarding'").get().password_hash;
  db.prepare("UPDATE users SET active=0,display_name='已调整（虚构）' WHERE id='demo-onboarding'").run();
  db.prepare("UPDATE user_security SET revision=7,must_change_password=0 WHERE user_id='demo-onboarding'").run();
  assert.deepEqual(seedDemoPeople(db),{added:0});
  const row=db.prepare("SELECT u.*,s.revision,s.must_change_password FROM users u JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-onboarding'").get();
  assert.equal(row.password_hash,hash);assert.equal(row.active,0);assert.equal(row.revision,7);assert.equal(row.must_change_password,0);
});
test('backup preserves personnel roles, disabled state and required-password-change revisions',async t=>{
  const {request,login,db,dir}=await fixture(t,{persist:true}),manager=await login('manager');
  const created=await request('/api/organization/staff',{...manager,method:'POST',data:{username:'restore-staff',display_name:'恢复样例（虚构）',role:'professional',initial_password:'initial-password-only',reason:'虚构恢复核对'},key:'restore-staff-create'});
  const id=created.body.staff.id;
  await request(`/api/organization/staff/${id}`,{...manager,method:'POST',data:{display_name:'恢复样例（虚构）',role:'reception',active:false,expected_revision:1,reason:'虚构停用'},key:'restore-staff-disable'});
  const backup=join(dir,'personnel-backup.sqlite');db.prepare('VACUUM INTO ?').run(backup);const restored=openDatabase(backup);
  try{const row=restored.prepare('SELECT u.role,u.active,s.revision,s.must_change_password FROM users u JOIN user_security s ON s.user_id=u.id WHERE u.id=?').get(id);assert.deepEqual({...row},{role:'reception',active:0,revision:2,must_change_password:1});assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}
  finally{restored.close();}
});

test('request IDs correlate sanitized structured failures and cannot be supplied by the caller',async t=>{
  const events=[],{request,login,db}=await fixture(t,{logger:event=>{events.push(event);throw Error('logger unavailable');}}),session=await login('manager');
  const r=await request('/api/customers/PRIVATE_CUSTOMER_ID?q=PRIVATE_QUERY',{...session,headers:{'X-Request-Id':'caller-private-id'}});assert.equal(r.status,404);
  assert.match(r.body.request_id,/^[a-f0-9-]{36}$/);assert.equal(r.headers.get('x-request-id'),r.body.request_id);assert.notEqual(r.body.request_id,'caller-private-id');
  const logged=events.find(e=>e.request_id===r.body.request_id);assert.equal(logged.route,'/api/customers/:id');assert.equal(logged.status,404);assert.equal(logged.code,'NOT_FOUND');
  await request('/api/auth/login',{method:'POST',data:{username:'PRIVATE_LOGIN',password:'PRIVATE_PASSWORD'}});
  db.exec("CREATE TRIGGER sensitive_failure BEFORE INSERT ON audit_events WHEN NEW.action='customer.create' BEGIN SELECT RAISE(ABORT,'PRIVATE_INTERNAL_DETAIL'); END;");
  const failed=await request('/api/customers',{...session,method:'POST',data:{name:'PRIVATE_BODY_NAME'},key:'private-body-fail'});assert.equal(failed.status,500);assert.equal(failed.body.error.code,'INTERNAL');
  assert.ok(events.some(e=>e.request_id===failed.body.request_id&&e.code==='INTERNAL'));
  const text=JSON.stringify(events)+JSON.stringify(failed.body);
  for(const secret of ['PRIVATE_CUSTOMER_ID','PRIVATE_QUERY','PRIVATE_LOGIN','PRIVATE_PASSWORD','PRIVATE_BODY_NAME','PRIVATE_INTERNAL_DETAIL',session.cookie,session.csrf])assert.ok(!text.includes(secret));
});
test('operations is manager-only and its metrics and fault records stay within the current store',async t=>{
  const {request,login}=await fixture(t),manager=await login('manager'),other=await login('other'),front=await login('front'),parent=await login('parent');
  const a=await request('/api/customers/missing-a',manager),b=await request('/api/customers/missing-b',other);
  assert.equal((await request('/api/operations',front)).status,403);assert.equal((await request('/api/operations',parent)).status,403);
  const status=await request('/api/operations',manager);assert.equal(status.status,200);assert.equal(status.body.database,'ok');assert.equal(status.body.schema,6);assert.ok(status.body.errors.some(e=>e.request_id===a.body.request_id));assert.ok(!status.body.errors.some(e=>e.request_id===b.body.request_id));
  const otherStatus=await request('/api/operations',other);assert.ok(otherStatus.body.errors.some(e=>e.request_id===b.body.request_id));assert.ok(!otherStatus.body.errors.some(e=>e.request_id===a.body.request_id));
  assert.equal(status.body.errors[0].store_id,undefined);assert.equal(status.body.errors[0].actor_id,undefined);
});
test('runtime request window and fault list stay bounded while cumulative counters keep accurate totals',async t=>{
  const {request,login}=await fixture(t),session=await login('manager');
  for(let i=0;i<205;i++)assert.equal((await request(`/api/customers/missing-${i}`,session)).status,404);
  const status=(await request('/api/operations',session)).body;assert.equal(status.client_errors,205);assert.equal(status.server_errors,0);assert.equal(status.errors.length,20);assert.equal(status.window_size,200);assert.equal(status.window_limit,200);assert.ok(status.requests>=206);assert.equal(typeof status.p95_ms,'number');assert.ok(status.p95_ms>=0);
});
test('interrupted upload is recorded once with its request ID and no business record', {timeout:5000},async t=>{
  let report;const reported=new Promise(resolve=>{report=resolve;});
  const {request,login,server,origin,db}=await fixture(t,{logger:event=>{if(event.status===499)report(event);}}),session=await login('front');
  const accepted=once(server,'request'),pending=httpRequest(origin+'/api/customers',{method:'POST',headers:{Cookie:session.cookie,'X-CSRF-Token':session.csrf,'Idempotency-Key':'aborted-customer','Content-Type':'application/json'}});
  pending.on('error',()=>{});pending.flushHeaders();await accepted;pending.write('{"name":"not-finished');pending.destroy();
  const event=await reported;assert.equal(event.code,'REQUEST_ABORTED');assert.equal(event.route,'/api/customers');
  const manager=await login('manager'),status=(await request('/api/operations',manager)).body;assert.equal(status.aborted,1);assert.equal(status.errors.filter(e=>e.request_id===event.request_id).length,1);assert.equal(db.prepare("SELECT count(*) n FROM customers WHERE created_by='front'").get().n,0);
});

const profileInput=(overrides={})=>({name:'更新姓名（虚构）',birth_date:null,contact_name:'补充家长（虚构）',phone:'10000000000',source:'guardian_report',revision_reason:'家长补充基本资料（虚构）',expected_version:1,...overrides});
const contactInput=(overrides={})=>({name:'备用联系人（虚构）',relationship:'家长（演示）',phone:'000-00001',source:'guardian_report',note:'虚构资料',reason:'登记备用联系信息（虚构）',...overrides});

test('profile history and contacts enforce staff role and store boundaries, including guardian field filtering',async t=>{
  const {request,login}=await fixture(t),manager=await login('manager'),front=await login('front'),professional=await login('professional'),parent=await login('parent');
  for(const endpoint of ['profile-history','contacts']){
    for(const session of [manager,front,professional])assert.equal((await request(`/api/customers/child-a/${endpoint}`,session)).status,200);
    assert.equal((await request(`/api/customers/child-a/${endpoint}`,parent)).status,403);
    assert.equal((await request(`/api/customers/child-b/${endpoint}`,manager)).status,404);
  }
  for(const session of [professional,parent])for(const [endpoint,data] of [['profile',profileInput()],['contacts',contactInput()]])assert.equal((await request(`/api/customers/child-a/${endpoint}`,{...session,method:'POST',data,key:'profile-role-check'})).status,403);
  assert.equal((await request('/api/customers/child-a',parent)).body.customer.revision,undefined);
});
test('profile revision keeps immutable snapshots, original identity and linked services while warning about shared phones',async t=>{
  const {request,login,db,origin}=await fixture(t),front=await login('front');
  await upload(origin,front);
  await request('/api/customers/child-a/cycles',{...front,method:'POST',data:{type:'followup',goal:'existing cycle'},key:'profile-cycle-key'});
  const options={...front,method:'POST',data:profileInput(),key:'profile-update-key'};
  const a=await request('/api/customers/child-a/profile',options);assert.equal(a.status,200);assert.equal(a.body.customer.id,'child-a');assert.equal(a.body.customer.store_id,'a');assert.equal(a.body.customer.revision,2);assert.equal(a.body.customer.birth_date,null);assert.equal(a.body.duplicate_candidates[0].id,'sibling-a');
  assert.deepEqual((await request('/api/customers/child-a/profile',options)).body,a.body);
  const history=(await request('/api/customers/child-a/profile-history',front)).body.items;assert.equal(history.length,2);assert.equal(history[0].source,'guardian_report');assert.equal(history[1].name,'child-a');assert.equal(history[1].source,'initial');assert.equal(history[1].created_by,'manager');
  assert.equal(db.prepare("SELECT count(*) n FROM service_cycles WHERE customer_id='child-a'").get().n,1);assert.equal(db.prepare("SELECT customer_id FROM attachments LIMIT 1").get().customer_id,'child-a');assert.equal(db.prepare("SELECT active FROM guardian_links WHERE user_id='parent'").get().active,1);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='customer.revise'").get().n,1);
  assert.throws(()=>db.exec("UPDATE customer_profile_versions SET name='tamper'"),/immutable/);assert.throws(()=>db.exec('DELETE FROM customer_profile_versions'),/immutable/);
});
test('profile validation, optimistic concurrency and audit failure preserve consistent current and historic data',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager');
  const post=(data,key)=>request('/api/customers/child-a/profile',{...manager,method:'POST',data,key});
  for(const data of [profileInput({source:''}),profileInput({revision_reason:''}),profileInput({phone:'invalid'}),profileInput({birth_date:'2099-01-01'}),profileInput({store_id:'b'}),profileInput({expected_version:null})])assert.equal((await post(data,'profile-invalid-key')).status,422);
  const incomplete=profileInput();delete incomplete.contact_name;assert.equal((await post(incomplete,'profile-incomplete')).status,422);
  const noChange=profileInput({name:'child-a',birth_date:'2017-01-01',contact_name:'shared-parent'});assert.equal((await post(noChange,'profile-no-change')).status,409);
  db.exec("CREATE TRIGGER profile_fail BEFORE INSERT ON audit_events WHEN NEW.action='customer.revise' BEGIN SELECT RAISE(ABORT,'fail'); END;");
  const failed=await post(profileInput(),'profile-retry-key');assert.equal(failed.status,500);assert.equal(db.prepare("SELECT name FROM customers WHERE id='child-a'").get().name,'child-a');assert.equal(db.prepare("SELECT count(*) n FROM customer_profile_versions WHERE customer_id='child-a'").get().n,1);assert.equal(db.prepare("SELECT count(*) n FROM idempotency WHERE request_key='profile-retry-key'").get().n,0);
  db.exec('DROP TRIGGER profile_fail');assert.equal((await post(profileInput(),'profile-retry-key')).status,200);
  const results=await Promise.all([post(profileInput({name:'并发甲（虚构）',expected_version:2}),'profile-concurrent-a'),post(profileInput({name:'并发乙（虚构）',expected_version:2}),'profile-concurrent-b')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(results.find(r=>r.status===409).body.error.code,'PROFILE_CONFLICT');assert.equal(db.prepare("SELECT count(*) n FROM customer_profile_versions WHERE customer_id='child-a'").get().n,3);
});
test('multiple family contacts stay separate from guardian access, and search includes only active contacts',async t=>{
  const {request,login,db}=await fixture(t),front=await login('front'),parent=await login('parent');
  const create=(customerId,key)=>request(`/api/customers/${customerId}/contacts`,{...front,method:'POST',data:contactInput(),key});
  const a=await create('child-a','family-create-one'),b=await create('sibling-a','family-create-two');assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.body.contact.id,b.body.contact.id);assert.equal(a.body.duplicate_candidates.length,0);
  assert.equal((await request('/api/customers?q=000-00001',front)).body.items.length,2);assert.equal((await request('/api/customers?q=000-00001',parent)).body.items.length,0);
  const duplicate=await create('child-a','family-create-third');assert.equal(duplicate.body.duplicate_candidates[0].id,a.body.contact.id);
  const update=await request(`/api/contacts/${a.body.contact.id}`,{...front,method:'POST',data:contactInput({name:'已停用联系人（虚构）',active:false,expected_revision:1}),key:'family-deactivate'});assert.equal(update.status,200);assert.equal(update.body.contact.revision,2);
  assert.equal((await request('/api/customers?q=已停用联系人',front)).body.items.length,0);
  assert.equal((await request('/api/customers/child-a/contacts',front)).body.items.length,2);assert.equal(db.prepare("SELECT active FROM guardian_links WHERE user_id='parent'").get().active,1);assert.equal((await request('/api/customers',parent)).body.items.length,1);
  const reactivated=await request(`/api/contacts/${a.body.contact.id}`,{...front,method:'POST',data:contactInput({active:true,expected_revision:2}),key:'family-reactivate'});assert.equal(reactivated.body.contact.revision,3);assert.equal(reactivated.body.contact.active,1);
});
test('contact edits reject reparenting, cross-store access and stale revisions; failed audit rolls back the edit',async t=>{
  const {request,login,db}=await fixture(t),manager=await login('manager'),other=await login('other'),professional=await login('professional');
  const created=await request('/api/customers/child-a/contacts',{...manager,method:'POST',data:contactInput(),key:'contact-edit-fixture'}),id=created.body.contact.id;
  const post=(data,key,session=manager)=>request(`/api/contacts/${id}`,{...session,method:'POST',data,key});
  const input=contactInput({note:'补充虚构资料',active:true,expected_revision:1});
  assert.equal((await post(input,'contact-other',other)).status,404);assert.equal((await post(input,'contact-professional',professional)).status,403);
  assert.equal((await post({...input,customer_id:'sibling-a'},'contact-reparent')).status,422);
  assert.equal((await post({...input,active:1},'contact-invalid-active')).status,422);
  db.exec("CREATE TRIGGER contact_fail BEFORE INSERT ON audit_events WHEN NEW.action='contact.update' BEGIN SELECT RAISE(ABORT,'fail'); END;");
  assert.equal((await post(input,'contact-retry-key')).status,500);assert.equal(db.prepare('SELECT revision,note FROM family_contacts WHERE id=?').get(id).revision,1);
  db.exec('DROP TRIGGER contact_fail');const success=await post(input,'contact-retry-key');assert.equal(success.status,200);assert.deepEqual((await post(input,'contact-retry-key')).body,success.body);
  assert.equal((await post({...input,note:'过期修改'},'contact-stale-key')).body.error.code,'PROFILE_CONFLICT');assert.equal(db.prepare('SELECT customer_id,revision FROM family_contacts WHERE id=?').get(id).customer_id,'child-a');
});
test('synthetic profile seed is repeatable and retains legitimate edited snapshots and contact changes',()=>{
  const db=openDatabase(':memory:');try{
    db.exec("INSERT INTO stores VALUES ('store-a','虚构门店')");db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-manager','demo-manager','虚构负责人',hashPassword('fixture-only'),'manager','store-a');seedDemoScenarios(db);
    assert.deepEqual(seedDemoProfiles(db),{contacts:12,profiles:2});assert.deepEqual(seedDemoProfiles(db),{contacts:0,profiles:0});
    const id='sample-plan',row=db.prepare('SELECT * FROM customers WHERE id=?').get(id),now=new Date().toISOString();
    db.prepare('UPDATE customers SET name=? WHERE id=?').run('修订的小唐（虚构）',id);db.prepare('INSERT INTO customer_profile_versions VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,3,'修订的小唐（虚构）',row.birth_date,row.contact_name,row.phone,'employee','演示修订',now,'demo-manager');
    db.prepare("UPDATE family_contacts SET note='edited',revision=2,active=0 WHERE id='demo-contact-plan-1'").run();
    assert.deepEqual(seedDemoScenarios(db),{customers:0,cycles:0,visits:0,documents:0,attachments:0});assert.deepEqual(seedDemoProfiles(db),{contacts:0,profiles:0});assert.equal(db.prepare('SELECT name FROM customers WHERE id=?').get(id).name,'修订的小唐（虚构）');assert.equal(db.prepare("SELECT note FROM family_contacts WHERE id='demo-contact-plan-1'").get().note,'edited');
  }finally{db.close();}
});

test('V0.5 migration captures a truthful legacy baseline without attributing past edits to the original creator',()=>{
  const dir=mkdtempSync(join(tmpdir(),'optical-profile-upgrade-')),path=join(dir,'old.sqlite');let db;
  try{
    db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
    for(const migration of ['001_foundation.sql','002_family_visits.sql','003_documents_attachments.sql','004_account_security.sql']){
      db.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(migration,new Date().toISOString());
    }
    db.exec("INSERT INTO stores VALUES ('a','虚构门店')");db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('manager','manager','虚构负责人',hashPassword('fixture-only'),'manager','a');
    db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run('old','a','存量档案（虚构）',null,null,null,'2025-01-01T00:00:00.000Z','manager');db.close();db=openDatabase(path);
    const v=db.prepare('SELECT * FROM customer_profile_versions').get();assert.equal(v.source,'legacy');assert.equal(v.created_by,null);assert.notEqual(v.created_at,'2025-01-01T00:00:00.000Z');assert.equal(v.name,'存量档案（虚构）');assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,6);
    db.close();db=openDatabase(path);assert.equal(db.prepare('SELECT count(*) n FROM customer_profile_versions').get().n,1);
  }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('customer overview and timeline are employee-only, store-scoped, read-only and exclude unrelated audit content',async t=>{
 const {request,login,db}=await fixture(t),manager=await login('manager'),front=await login('front'),professional=await login('professional'),parent=await login('parent');
 for(const endpoint of ['overview','timeline']){
  for(const session of [manager,front,professional])assert.equal((await request(`/api/customers/child-a/${endpoint}`,session)).status,200);
  assert.equal((await request(`/api/customers/child-a/${endpoint}`,parent)).status,403);assert.equal((await request(`/api/customers/child-b/${endpoint}`,manager)).status,404);
  assert.equal((await request(`/api/customers/child-a/${endpoint}`,{...manager,method:'POST',data:{},key:'timeline-readonly'})).status,405);
 }
 db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run('irrelevant','a','manager','staff.password_reset','child-a',null,JSON.stringify({customer_id:'child-a',private:'SHOULD_NOT_APPEAR'}),new Date().toISOString());
 const result=(await request('/api/customers/child-a/timeline',front)).body;assert.equal(result.items.length,1);assert.equal(result.items[0].kind,'profile');assert.ok(!JSON.stringify(result).includes('SHOULD_NOT_APPEAR'));assert.equal(result.items[0].details.name,'child-a');
});
test('overview and mixed timeline follow persisted customer actions without ending independent cycles',async t=>{
 const {request,login,origin}=await fixture(t),session=await login('manager');
 const post=(path,data,key)=>request(path,{...session,method:'POST',data,key});
 await post('/api/customers/child-a/profile',profileInput(),'timeline-profile');
 const cycle=(await post('/api/customers/child-a/cycles',{type:'followup',goal:'长期服务（虚构）'},'timeline-cycle')).body.cycle;
 const visit=(await post('/api/customers/child-a/visits',{purpose:'实际登记目的（虚构）',cycle_ids:[cycle.id]},'timeline-visit')).body.visit;
 await post(`/api/visits/${visit.id}/close`,{reason:'本次结束，长期周期继续'},'timeline-close');
 const contact=(await post('/api/customers/child-a/contacts',contactInput(),'timeline-contact')).body.contact;
 await post(`/api/contacts/${contact.id}`,contactInput({name:'修订备用家长（虚构）',active:false,expected_revision:1}),'timeline-contact-edit');
 const f=(await upload(origin,session,'child-a',{key:'timeline-upload'})).body.attachment;
 const document=(await post('/api/customers/child-a/documents',{title:'旧资料标题（虚构）',content:'初版',source:'guardian_report',attachment_ids:[f.id]},'timeline-document')).body.document;
 await post(`/api/documents/${document.record_id}/versions`,{title:'新资料标题（虚构）',content:'补充',source:'employee',expected_version:1,revision_reason:'新增说明',attachment_ids:[f.id]},'timeline-document-revise');
 await post(`/api/attachments/${f.id}/revoke`,{reason:'撤销访问，保留历史'},'timeline-revoke-file');
 await post('/api/customers/child-a/guardians',{user_id:'parent',relationship:'监护人（演示）',active:false,reason:'演示撤销'},'timeline-guardian');
 const overview=(await request('/api/customers/child-a/overview',session)).body;assert.equal(overview.cycle_drafts,1);assert.equal(overview.visits_registered,0);assert.equal(overview.visits_closed,1);assert.equal(overview.contacts_active,0);assert.equal(overview.documents,1);assert.equal(overview.attachments_active,0);assert.equal(overview.last_visit.id,visit.id);
 const all=(await request('/api/customers/child-a/timeline?limit=50',session)).body.items;assert.equal(all.length,12);assert.deepEqual(new Set(all.map(e=>e.kind)),new Set(['profile','cycle','visit','contact','document','attachment','authorization']));
 assert.equal(all.find(e=>e.kind==='visit'&&e.details.action==='close').details.reason,'本次结束，长期周期继续');assert.ok(all.find(e=>e.kind==='contact'&&e.details.action==='contact.create').details.name==='备用联系人（虚构）');assert.equal(all.find(e=>e.kind==='contact'&&e.details.action==='contact.update').details.active,0);
 assert.ok(all.find(e=>e.kind==='document'&&e.details.version===1).details.title==='旧资料标题（虚构）');assert.equal(all.find(e=>e.kind==='profile'&&e.details.version===1).details.name,'child-a');assert.equal(new Set(all.map(e=>e.event_id)).size,all.length);
});
test('timeline keyset pagination preserves equal-time events, filters UTC dates, and excludes newly appended records from later pages',async t=>{
 const {request,login,db}=await fixture(t),session=await login('manager');
 for(let i=0;i<57;i++)db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run(`timeline-cycle-${String(i).padStart(3,'0')}`,'child-a','followup','虚构周期','draft','2026-01-02T12:00:00.000Z','manager');
 db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run('outside-date','child-a','retail','较早虚构周期','draft','2026-01-01T23:59:59.999Z','manager');
 const query='/api/customers/child-a/timeline?kind=cycle&from=2026-01-02&to=2026-01-02&limit=7';let response=await request(query,session),items=[...response.body.items];assert.equal(response.body.limit,7);assert.ok(response.body.next_cursor);
 db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run('later-cycle','child-a','training','后来虚构周期','draft','2026-01-02T13:00:00.000Z','manager');
 while(response.body.next_cursor){response=await request(query+'&cursor='+response.body.next_cursor,session);assert.equal(response.status,200);items.push(...response.body.items);}
 assert.equal(items.length,57);assert.equal(new Set(items.map(e=>e.event_id)).size,57);assert.ok(items.every(e=>e.at==='2026-01-02T12:00:00.000Z'));assert.deepEqual(items.map(e=>e.event_id),[...items.map(e=>e.event_id)].sort().reverse());
 assert.equal((await request('/api/customers/child-a/timeline?kind=cycle&from=2026-01-01&to=2026-01-01',session)).body.items.length,1);
});
test('timeline rejects invalid filters and cursors reused across customer or query; empty ranges return an explicit end',async t=>{
 const {request,login}=await fixture(t),session=await login('front');
 for(const suffix of ['kind=security','from=2026-02-30','from=2026-10-07&to=2026-10-06','limit=0','limit=51','limit=1e1','cursor=','cursor=not-json'])assert.equal((await request('/api/customers/child-a/timeline?'+suffix,session)).status,422);
 await request('/api/customers/child-a/cycles',{...session,method:'POST',data:{type:'followup',goal:'pagination'},key:'timeline-cursor-cycle'});
 const cursor=(await request('/api/customers/child-a/timeline?limit=1',session)).body.next_cursor;assert.ok(cursor);
 assert.equal((await request('/api/customers/sibling-a/timeline?limit=1&cursor='+cursor,session)).body.error.code,'INVALID_CURSOR');assert.equal((await request('/api/customers/child-a/timeline?kind=cycle&cursor='+cursor,session)).body.error.code,'INVALID_CURSOR');
 const empty=(await request('/api/customers/child-a/timeline?from=1900-01-01&to=1900-01-01',session)).body;assert.deepEqual(empty.items,[]);assert.equal(empty.next_cursor,null);
});
test('overview counts are complete beyond UI list limits and early history does not invent actors or snapshots',async t=>{
 const {request,login,db}=await fixture(t),session=await login('manager');
 for(let i=0;i<105;i++)db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run(`overview-${i}`,'child-a','followup','虚构周期','draft',new Date().toISOString(),'manager');
 const now=new Date().toISOString();db.prepare('INSERT INTO family_contacts VALUES (?,?,?,?,?,?,?,1,1,?,?,?,?)').run('legacy-contact','child-a','当前名字，不能推断初版','录入关系',null,'employee',null,now,'manager',now,'manager');
 db.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)').run('legacy-closed','child-a','a','早期到店（虚构）','closed',now,now,'manager');
 db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run('malformed-contact','a','manager','contact.update','legacy-contact',null,'not json',now);
 const overview=(await request('/api/customers/child-a/overview',session)).body;assert.equal(overview.cycle_drafts,105);assert.equal(overview.contacts_active,1);
 const baseline=(await request('/api/customers/child-a/timeline?kind=contact',session)).body.items;assert.equal(baseline.length,1);assert.equal(baseline[0].details.action,'baseline');assert.equal(baseline[0].details.name,undefined);
 const close=(await request('/api/customers/child-a/timeline?kind=visit',session)).body.items.find(e=>e.details.action==='close');assert.equal(close.actor_name,null);assert.equal(close.actor_id,null);assert.match(close.details.reason,/未登记/);
});

test('customer overview and immutable timeline snapshots remain identical after verified independent recovery',async t=>{
 const {request,login,path,dir}=await fixture(t,{persist:true}),session=await login('manager');
 const created=(await request('/api/customers/child-a/contacts',{...session,method:'POST',data:contactInput(),key:'timeline-recovery-contact'})).body.contact;
 await request(`/api/contacts/${created.id}`,{...session,method:'POST',data:contactInput({name:'修改后的家长（虚构）',active:false,expected_revision:1}),key:'timeline-recovery-edit'});
 const beforeTimeline=(await request('/api/customers/child-a/timeline',session)).body,beforeOverview=(await request('/api/customers/child-a/overview',session)).body;
 const backup=await createBackup(path,join(dir,'timeline-backup')),restored=await restoreBackup(backup.backup,join(dir,'timeline-restored'));
 const app=createApp({databasePath:restored.database,mode:'test',logger:()=>{}});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 try{
  const origin=`http://127.0.0.1:${app.server.address().port}`,response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'manager',password:'test-password-only'})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await (await fetch(origin+'/api/customers/child-a/timeline',{headers:{Cookie:cookie}})).json(),beforeTimeline);assert.deepEqual(await (await fetch(origin+'/api/customers/child-a/overview',{headers:{Cookie:cookie}})).json(),beforeOverview);
 }finally{await new Promise(resolve=>app.server.close(resolve));}
});

const cycleRevision=(overrides={})=>({goal:'补充后的周期需求（虚构）',source:'guardian_report',revision_reason:'家长补充需求（虚构）',expected_version:1,...overrides});
async function createTestCycle(request,session,customerId='child-a',key='cycle-revision-fixture'){
 const r=await request(`/api/customers/${customerId}/cycles`,{...session,method:'POST',data:{type:'followup',goal:'原始周期需求（虚构）'},key});assert.equal(r.status,201);return r.body.cycle;
}
test('cycle versions respect employee and store scope and reject changes to identity, type or status',async t=>{
 const {request,login}=await fixture(t),manager=await login('manager'),front=await login('front'),professional=await login('professional'),parent=await login('parent'),other=await login('other'),cycle=await createTestCycle(request,manager);
 for(const session of [manager,front,professional])assert.equal((await request(`/api/cycles/${cycle.id}`,session)).status,200);
 assert.equal((await request(`/api/cycles/${cycle.id}`,parent)).status,403);assert.equal((await request(`/api/cycles/${cycle.id}`,other)).status,404);
 const post=(data,session=front)=>request(`/api/cycles/${cycle.id}/versions`,{...session,method:'POST',data,key:'cycle-validation-key'});
 for(const data of [cycleRevision({type:'training'}),cycleRevision({customer_id:'sibling-a'}),cycleRevision({status:'active'}),cycleRevision({goal:''}),cycleRevision({source:''}),cycleRevision({revision_reason:''}),cycleRevision({expected_version:0})])assert.equal((await post(data)).status,422);
 assert.equal((await post(cycleRevision(),parent)).status,403);assert.equal((await post(cycleRevision(),other)).status,404);assert.equal((await post(cycleRevision(),professional)).status,201);
});
test('cycle revisions are immutable, idempotent and optimistic, and timeline retains original goals',async t=>{
 const {request,login,db}=await fixture(t),session=await login('professional'),cycle=await createTestCycle(request,session);
 const post=(data,key)=>request(`/api/cycles/${cycle.id}/versions`,{...session,method:'POST',data,key});const first=await post(cycleRevision(),'cycle-revise-once');assert.equal(first.status,201);assert.equal(first.body.cycle.id,cycle.id);assert.equal(first.body.cycle.version,2);assert.equal(first.body.cycle.status,'draft');assert.deepEqual((await post(cycleRevision(),'cycle-revise-once')).body,first.body);
 const [a,b]=await Promise.all([post(cycleRevision({goal:'并发甲（虚构）',expected_version:2}),'cycle-race-a'),post(cycleRevision({goal:'并发乙（虚构）',expected_version:2}),'cycle-race-b')]);assert.deepEqual([a.status,b.status].sort(),[201,409]);assert.equal([a,b].find(r=>r.status===409).body.error.code,'CYCLE_CONFLICT');
 const history=(await request(`/api/cycles/${cycle.id}`,session)).body.versions;assert.equal(history.length,3);assert.equal(history[2].goal,'原始周期需求（虚构）');assert.equal(history[2].source,'initial');assert.equal(history[0].created_by,'professional');
 const timeline=(await request('/api/customers/child-a/timeline?kind=cycle',session)).body.items;assert.equal(timeline.length,3);assert.equal(timeline.find(e=>e.details.version===1).details.goal,'原始周期需求（虚构）');assert.ok(timeline.every(e=>e.entity_id===cycle.id));
 assert.throws(()=>db.exec('UPDATE cycle_versions SET goal=goal'),/immutable/);assert.throws(()=>db.exec('DELETE FROM cycle_versions'),/immutable/);
});
test('visits retain the selected cycle version across later revisions and closing a visit leaves other business records independent',async t=>{
 const {request,login,db}=await fixture(t),session=await login('manager'),cycle=await createTestCycle(request,session);
 const postVisit=(version,key)=>request('/api/customers/child-a/visits',{...session,method:'POST',data:{purpose:'版本衔接（虚构）',cycle_ids:[cycle.id],cycle_versions:[{cycle_id:cycle.id,version}]},key});
 const first=await postVisit(1,'cycle-visit-v1');assert.equal(first.status,201);assert.equal(first.body.visit.cycle_refs[0].goal,'原始周期需求（虚构）');
 await request(`/api/cycles/${cycle.id}/versions`,{...session,method:'POST',data:cycleRevision(),key:'cycle-after-visit'});
 const second=await postVisit(2,'cycle-visit-v2');assert.equal(second.body.visit.cycle_refs[0].version,2);assert.deepEqual((await postVisit(1,'cycle-visit-v1')).body,first.body);
 await request(`/api/visits/${first.body.visit.id}/close`,{...session,method:'POST',data:{reason:'本次结束，后续独立'},key:'cycle-visit-close'});
 const detail=(await request('/api/customers/child-a',session)).body;assert.equal(detail.cycles[0].version,2);assert.equal(detail.cycles[0].status,'draft');assert.equal(detail.visits.find(v=>v.id===first.body.visit.id).cycle_refs[0].version,1);assert.equal(detail.visits.find(v=>v.id===second.body.visit.id).status,'registered');
 const timeline=(await request('/api/customers/child-a/timeline?kind=visit',session)).body.items;assert.equal(timeline.find(e=>e.entity_id===first.body.visit.id&&e.details.action==='register').details.cycle_refs[0].goal,'原始周期需求（虚构）');
 assert.throws(()=>db.exec('UPDATE visit_cycle_versions SET version=2'),/immutable/);assert.throws(()=>db.exec('DELETE FROM visit_cycle_versions'),/immutable/);
});
test('visit expected versions reject stale selections and mismatched or cross-customer references before saving',async t=>{
 const {request,login,db}=await fixture(t),session=await login('front'),cycle=await createTestCycle(request,session),sibling=await createTestCycle(request,session,'sibling-a','sibling-cycle-version');
 await request(`/api/cycles/${cycle.id}/versions`,{...session,method:'POST',data:cycleRevision(),key:'stale-visit-cycle'});
 const input={purpose:'核对当前需求（虚构）',cycle_ids:[cycle.id],cycle_versions:[{cycle_id:cycle.id,version:1}]};
 const post=data=>request('/api/customers/child-a/visits',{...session,method:'POST',data,key:'visit-version-retry'});
 assert.equal((await post(input)).body.error.code,'CYCLE_CONFLICT');assert.equal(db.prepare('SELECT count(*) n FROM visits').get().n,0);
 for(const cycle_versions of [[],[{cycle_id:sibling.id,version:1}],[{cycle_id:cycle.id,version:null}],[{cycle_id:cycle.id,version:2},{cycle_id:cycle.id,version:2}]])assert.equal((await post({...input,cycle_versions})).status,422);
 assert.equal((await post({...input,cycle_ids:[sibling.id],cycle_versions:[{cycle_id:sibling.id,version:1}]})).status,422);
 assert.equal((await post({...input,cycle_versions:[{cycle_id:cycle.id,version:2}]})).status,201);
 assert.equal(db.prepare('SELECT count(*) n FROM visit_cycle_versions').get().n,1);
});
test('audit failures roll back cycle revisions and visit version snapshots, allowing the same retry to save once',async t=>{
 const {request,login,db}=await fixture(t),session=await login('manager'),cycle=await createTestCycle(request,session);
 db.exec("CREATE TRIGGER cycle_fail BEFORE INSERT ON audit_events WHEN NEW.action='cycle.revise' BEGIN SELECT RAISE(ABORT,'fail'); END;");
 const revision={...session,method:'POST',data:cycleRevision(),key:'cycle-audit-retry'};assert.equal((await request(`/api/cycles/${cycle.id}/versions`,revision)).status,500);assert.equal(db.prepare('SELECT goal FROM service_cycles WHERE id=?').get(cycle.id).goal,'原始周期需求（虚构）');assert.equal(db.prepare('SELECT count(*) n FROM cycle_versions').get().n,1);db.exec('DROP TRIGGER cycle_fail');assert.equal((await request(`/api/cycles/${cycle.id}/versions`,revision)).status,201);
 db.exec("CREATE TRIGGER snapshot_fail BEFORE INSERT ON audit_events WHEN NEW.action='visit.register' BEGIN SELECT RAISE(ABORT,'fail'); END;");
 const visit={...session,method:'POST',data:{purpose:'失败回滚（虚构）',cycle_ids:[cycle.id]},key:'visit-snapshot-retry'};assert.equal((await request('/api/customers/child-a/visits',visit)).status,500);for(const table of ['visits','visit_cycles','visit_cycle_versions'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
 db.exec('DROP TRIGGER snapshot_fail');assert.equal((await request('/api/customers/child-a/visits',visit)).status,201);assert.equal(db.prepare('SELECT version FROM visit_cycle_versions').get().version,2);
});
test('V0.7 migration preserves original cycle identity and explicitly leaves historic visit versions unknown',()=>{
 const dir=mkdtempSync(join(tmpdir(),'optical-cycle-upgrade-')),path=join(dir,'old.sqlite');let db;
 try{
  db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  for(const m of ['001_foundation.sql','002_family_visits.sql','003_documents_attachments.sql','004_account_security.sql','005_customer_profiles.sql']){db.exec(readFileSync(new URL(`../migrations/${m}`,import.meta.url),'utf8'));db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(m,new Date().toISOString());}
  db.exec("INSERT INTO stores VALUES ('a','虚构门店')");db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('manager','manager','虚构负责人',hashPassword('fixture-only'),'manager','a');const old='2025-01-01T00:00:00.000Z';db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run('child','a','虚构客户',null,null,null,old,'manager');db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run('cycle','child','followup','升级前当前需求','draft',old,'manager');db.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)').run('visit','child','a','升级前到店','registered',old,null,'manager');db.exec("INSERT INTO visit_cycles VALUES ('visit','cycle','child')");db.close();db=openDatabase(path);
  const version=db.prepare('SELECT * FROM cycle_versions').get();assert.equal(version.source,'legacy');assert.equal(version.created_by,null);assert.notEqual(version.created_at,old);assert.equal(db.prepare('SELECT * FROM visit_cycle_versions').get().version,null);assert.equal(db.prepare('SELECT * FROM visit_cycle_versions').get().basis,'legacy_unknown');
  db.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)').run('new-visit','child','a','升级后到店','registered',new Date().toISOString(),null,'manager');db.exec("INSERT INTO visit_cycles VALUES ('new-visit','cycle','child')");assert.equal(db.prepare("SELECT version FROM visit_cycle_versions WHERE visit_id='new-visit'").get().version,1);
 }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
test('cycle revision and both historic visit snapshots survive verified recovery; mismatched current goals fail backup',async t=>{
 const {request,login,db,path,dir}=await fixture(t,{persist:true}),session=await login('manager'),cycle=await createTestCycle(request,session);
 await request('/api/customers/child-a/visits',{...session,method:'POST',data:{purpose:'旧版到店（虚构）',cycle_ids:[cycle.id]},key:'recover-visit-v1'});await request(`/api/cycles/${cycle.id}/versions`,{...session,method:'POST',data:cycleRevision(),key:'recover-cycle-v2'});await request('/api/customers/child-a/visits',{...session,method:'POST',data:{purpose:'新版到店（虚构）',cycle_ids:[cycle.id]},key:'recover-visit-v2'});
 const backup=await createBackup(path,join(dir,'cycle-backup')),restored=await restoreBackup(backup.backup,join(dir,'cycle-restored')),copy=openDatabase(restored.database);
 try{assert.deepEqual(copy.prepare('SELECT cycle_id,version,goal,source FROM cycle_versions ORDER BY version').all(),db.prepare('SELECT cycle_id,version,goal,source FROM cycle_versions ORDER BY version').all());assert.deepEqual(copy.prepare('SELECT * FROM visit_cycle_versions ORDER BY version').all(),db.prepare('SELECT * FROM visit_cycle_versions ORDER BY version').all());assert.equal(copy.prepare('SELECT count(*) n FROM sessions').get().n,0);}finally{copy.close();}
 db.prepare('UPDATE service_cycles SET goal=? WHERE id=?').run('未留版本的变化',cycle.id);await assert.rejects(createBackup(path,join(dir,'cycle-invalid')),/周期需求/);
});
test('synthetic cycle revisions demonstrate old/new visit references and preserve later edits on repeat initialization',()=>{
 const db=openDatabase(':memory:');try{
  db.exec("INSERT INTO stores VALUES ('store-a','虚构门店')");db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-manager','demo-manager','虚构负责人',hashPassword('fixture-only'),'manager','store-a');seedDemoScenarios(db);assert.deepEqual(seedDemoCycleRevisions(db),{versions:2,cycles:1,visits:1});assert.deepEqual(seedDemoCycleRevisions(db),{versions:0,cycles:0,visits:0});assert.equal(db.prepare("SELECT version FROM visit_cycle_versions WHERE visit_id='demo-visit-followup' AND cycle_id='demo-cycle-followup'").get().version,1);assert.equal(db.prepare("SELECT version FROM visit_cycle_versions WHERE visit_id='demo-visit-followup-later' AND cycle_id='demo-cycle-followup'").get().version,2);
  const row=db.prepare("SELECT * FROM service_cycles WHERE id='demo-cycle-followup'").get();db.prepare('UPDATE service_cycles SET goal=? WHERE id=?').run('后续编辑（虚构）',row.id);db.prepare('INSERT INTO cycle_versions VALUES (?,?,?,?,?,?,?,?,?)').run(row.id,row.customer_id,3,row.type,'后续编辑（虚构）','employee','后续演示编辑',new Date().toISOString(),'demo-manager');assert.deepEqual(seedDemoCycleRevisions(db),{versions:0,cycles:0,visits:0});assert.equal(db.prepare('SELECT goal FROM service_cycles WHERE id=?').get(row.id).goal,'后续编辑（虚构）');
 }finally{db.close();}
});
