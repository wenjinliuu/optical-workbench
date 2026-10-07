import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { openDatabase, hashPassword, transaction } from '../src/db.mjs';
import { seedDemoScenarios, demoScenarios } from '../src/demo-data.mjs';

async function fixture(t,{persist=false}={}) {
  const dir=mkdtempSync(join(tmpdir(),'optical-test-'));
  const path=persist?join(dir,'test.sqlite'):':memory:';
  const app=createApp({databasePath:path,mode:'test'}),{db,server}=app;
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
  const login=async(username)=>{const r=await request('/api/auth/login',{method:'POST',data:{username,password:'test-password-only'}});assert.equal(r.status,200);const m=await request('/api/me',{cookie:r.cookie});return {cookie:r.cookie,csrf:m.body.csrf};};
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
  assert.equal((await request('/api/health')).body.schema,3);
  const audit=await request('/api/audit',session);assert.equal(audit.body.items[0].action,'session.login');assert.equal(audit.body.items[0].after_json,undefined);
  db.prepare("UPDATE users SET active=0 WHERE id='manager'").run();assert.equal((await request('/api/me',session)).status,401);
});
test('disk persistence, repeatable migrations and consistent backup restore preserve counts',async t=>{
  const {request,login,db,server,path,dir}=await fixture(t,{persist:true}),session=await login('manager');
  await request('/api/customers',{...session,method:'POST',data:{name:'persistent'},key:'persistent-customer'});
  const backup=join(dir,'backup.sqlite');db.prepare('VACUUM INTO ?').run(backup);
  const counts=Object.fromEntries(['customers','audit_events','service_cycles'].map(table=>[table,db.prepare(`SELECT count(*) n FROM ${table}`).get().n]));
  await new Promise(resolve=>server.close(resolve));
  for(const target of [path,backup]){const restored=openDatabase(target);assert.equal(restored.prepare('SELECT count(*) n FROM schema_migrations').get().n,3);for(const [table,count] of Object.entries(counts))assert.equal(restored.prepare(`SELECT count(*) n FROM ${table}`).get().n,count);assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');restored.close();}
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
  assert.ok(org.body.items.every(u=>u.password_hash===undefined&&u.username===undefined));
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
