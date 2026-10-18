import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chmodSync,mkdirSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../src/db.mjs';

const mode=path=>statSync(path).mode&0o777;

test('new active database, directory and WAL sidecars are private under umask 022',t=>{
  const root=mkdtempSync(join(tmpdir(),'optical-database-permissions-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const original=process.umask(0o022),directory=join(root,'data'),path=join(directory,'workbench.sqlite');
  let db;
  try{
    db=openDatabase(path);
    db.exec("CREATE TABLE synthetic_permission_probe(value TEXT);INSERT INTO synthetic_permission_probe VALUES('虚构')");
    assert.equal(mode(directory),0o700);
    assert.equal(mode(path),0o600);
    assert.equal(mode(path+'-wal'),0o600);
    assert.equal(mode(path+'-shm'),0o600);
  }finally{
    db?.close();
    process.umask(original);
  }
});

test('existing database and directory permissions and content are preserved',t=>{
  const root=mkdtempSync(join(tmpdir(),'optical-existing-database-')),directory=join(root,'data'),path=join(directory,'workbench.sqlite');
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(directory,{mode:0o750});
  const original=new DatabaseSync(path);
  original.exec("CREATE TABLE original_fact(value TEXT);INSERT INTO original_fact VALUES('原虚构记录')");
  original.close();
  chmodSync(path,0o640);
  const db=openDatabase(path);
  try{
    assert.equal(db.prepare('SELECT value FROM original_fact').get().value,'原虚构记录');
    assert.equal(mode(directory),0o750);
    assert.equal(mode(path),0o640);
  }finally{db.close();}
});

test('memory database remains filesystem independent',()=>{
  const db=openDatabase(':memory:');
  try{assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n>0,true);}
  finally{db.close();}
});

test('concurrent path preparation atomically identifies one new file creator',async t=>{
  const root=mkdtempSync(join(tmpdir(),'optical-database-race-')),path=join(root,'nested','workbench.sqlite');
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const moduleUrl=new URL('../src/database-files.mjs',import.meta.url).href;
  const source=`import{prepareDatabaseFile}from ${JSON.stringify(moduleUrl)};console.log(JSON.stringify(prepareDatabaseFile(process.argv[1])))`;
  const run=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',source,path],{stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
    child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(stderr||`child exit ${code}`)));
  });
  const results=await Promise.all(Array.from({length:8},run));
  assert.equal(results.filter(x=>x.created).length,1);
  assert.equal(mode(join(root,'nested')),0o700);
  assert.equal(mode(path),0o600);
});
