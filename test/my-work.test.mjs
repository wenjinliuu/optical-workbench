import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../src/server.mjs';
import {hashPassword,openDatabase} from '../src/db.mjs';
import {createBackup,restoreBackup} from '../src/recovery.mjs';


async function fixture(t,{persist=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'optical-stock-')),path=persist?join(dir,'source.sqlite'):':memory:',{server,db}=createApp({databasePath:path,mode:'test',logger:()=>{}});db.exec("INSERT INTO stores VALUES ('store-a','A'),('store-b','B')");for(const [id,role,store] of [['manager','manager','store-a'],['front','reception','store-a'],['professional','professional','store-a'],['other','manager','store-b'],['parent','guardian',null]])db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run(id,id,id,hashPassword('synthetic-only-password'),role,store);for(const [id,store] of [['one','store-a'],['two','store-a'],['other-child','store-b']])db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run(id,store,id,null,null,null,new Date().toISOString(),store==='store-a'?'manager':'other');db.prepare('INSERT INTO guardian_links (user_id,customer_id,active) VALUES (?,?,1)').run('parent','one');server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
 const request=async(path,{cookie,csrf,method='GET',data,key=crypto.randomUUID(),headers={}}={})=>{const r=await fetch(origin+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(method!=='GET'?{'Idempotency-Key':key}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};const login=async id=>{const r=await request('/api/auth/login',{method:'POST',data:{username:id,password:'synthetic-only-password'}});assert.equal(r.status,200);const me=await request('/api/me',{cookie:r.cookie});return {cookie:r.cookie,csrf:me.body.csrf};};return {db,request,login,origin,path,dir};
}

import {seedDemoBatches} from '../src/demo-inventory-batches.mjs';
import {verifyBatches} from '../src/inventory-batch-recovery.mjs';
import * as R from '../src/purchase-receiving.mjs';
import {seedDemoCustody} from '../src/demo-inventory-custody.mjs';
import {verifyCustody} from '../src/inventory-custody-recovery.mjs';
import {seedDemoExtraReturns} from '../src/demo-purchase-extra-returns.mjs';
import {verifyExtraReturns} from '../src/purchase-extra-return-recovery.mjs';
import {seedDemoSupplierReturns} from '../src/demo-supplier-returns.mjs';
import {verifySupplierReturns} from '../src/supplier-return-recovery.mjs';
import {seedDemoPurchaseQuality} from '../src/demo-purchase-quality.mjs';
import {verifyPurchaseQuality} from '../src/purchase-quality-recovery.mjs';
import {seedDemoReceiving} from '../src/demo-purchase-receiving.mjs';
import {verifyReceiving} from '../src/purchase-receiving-recovery.mjs';
import {seedDemoProcurement} from '../src/demo-procurement.mjs';
import {seedDemoSpecialtyReviews} from '../src/demo-specialty-review.mjs';
import {seedDemoSpecialtyCare} from '../src/demo-specialty-care.mjs';
import {seedDemoSpecialtyTrace} from '../src/demo-specialty-trace.mjs';
import {seedDemoSpecialty} from '../src/demo-specialty.mjs';
import {seedDemoReferrals} from '../src/demo-referrals.mjs';
import {seedDemoContact} from '../src/demo-contact.mjs';
import {seedDemoLongitudinal} from '../src/demo-longitudinal.mjs';
import {seedDemoFamilyTraining} from '../src/demo-family-training.mjs';
import {seedDemoScheduling} from '../src/demo-scheduling.mjs';
import {seedDemoEntitlements} from '../src/demo-entitlements.mjs';
import {seedDemoScenarios,seedDemoRetail,seedDemoInventory,seedDemoPayments,seedDemoProcessing,seedDemoFulfillment,seedDemoAftercare,seedDemoAftercareWork,seedDemoReplacements,seedDemoDispositions,seedDemoRefunds,seedDemoParameters,seedDemoTraining} from '../src/demo-data.mjs';
import {employeeDirectory,employeeResponsibilities,responsibilityKinds,responsibilitySnapshot} from '../src/staff-handover.mjs';
import {seedDemoStaffHandover} from '../src/demo-staff-handover.mjs';
import {transaction} from '../src/db.mjs';
import {completionSnapshot,completionDigest} from '../src/task-completions.mjs';
async function setup(t,{persist=false,seed=true}={}){const x=await fixture(t,{persist});Object.assign(x,{m:await x.login('manager'),f:await x.login('front'),p:await x.login('professional'),g:await x.login('parent'),o:await x.login('other')});if(seed){for(const[id,role]of [['demo-manager','manager'],['demo-front','reception'],['demo-professional','professional'],['demo-parent','guardian']])x.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run(id,id,id,hashPassword('synthetic-only-password'),role,role==='guardian'?null:'store-a');seedDemoScenarios(x.db);seedDemoRetail(x.db);seedDemoInventory(x.db);seedDemoPayments(x.db);seedDemoProcessing(x.db);seedDemoFulfillment(x.db);seedDemoAftercare(x.db);seedDemoAftercareWork(x.db);seedDemoReplacements(x.db);seedDemoDispositions(x.db);seedDemoRefunds(x.db);seedDemoParameters(x.db);seedDemoTraining(x.db);seedDemoEntitlements(x.db);seedDemoScheduling(x.db);x.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run('demo-practice-parent','demo-practice-parent','家庭练习家长（虚构）',hashPassword('synthetic-only-password'),'guardian',null);seedDemoFamilyTraining(x.db);seedDemoLongitudinal(x.db);seedDemoContact(x.db);seedDemoReferrals(x.db);seedDemoSpecialty(x.db);seedDemoSpecialtyTrace(x.db);seedDemoSpecialtyCare(x.db);seedDemoSpecialtyReviews(x.db);seedDemoStaffHandover(x.db);}return x;}
const path='/api/staff-handover/employees',duties=id=>path+'/'+id+'/responsibilities',good=(z,status=200)=>assert.equal(z.status,status,JSON.stringify(z.body));
const snapshot=db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>[x.name,db.prepare('SELECT * FROM '+x.name+' ORDER BY rowid').all()]));
async function newTask(x,{owner='front',title='明确原客户资料核对',role=null}={}){const z=await x.request('/api/customers/one/tasks',{...x.m,method:'POST',data:{title,instructions:'仅原客户通用资料核对',assignee_id:owner,...(role?{candidate_role:role}:{}),cycle_id:null,cycle_version:null,visit_id:null,reason:'实际明确原任务'}});good(z,201);return z.body.task||z.body;}
async function completeTask(x,{owner='front',title='本人实际完成原任务',session=x.f}={}){
 const task=await newTask(x,{owner,title});
 for(const [action,revision] of [['accept',1],['start',2]])good(await x.request('/api/tasks/'+task.id+'/'+action,{...session,method:'POST',data:{expected_revision:revision,reason:'本人明确办理原任务（虚构）'}}));
 good(await x.request('/api/tasks/'+task.id+'/completion/conditions',{...x.m,method:'POST',data:{expected_task_revision:3,expected_condition_version:0,description:'通用资料来源核对（虚构）',require_document:false,require_attachment:false,reason:'明确通用核对范围'}}),201);
 good(await x.request('/api/tasks/'+task.id+'/completion/evidence',{...session,method:'POST',data:{expected_task_revision:3,expected_evidence_version:0,condition_version:1,notes:'本人已核对原来源（虚构）',source:'employee',document_version_ids:[],attachment_ids:[],reason:'保存本人实际依据'}}),201);
 good(await x.request('/api/tasks/'+task.id+'/completion/submit',{...session,method:'POST',data:{expected_task_revision:3,condition_version:1,evidence_version:1,output_summary:'本人通用核对完成（虚构）',reason:'本人明确提交原完成记录'}}),201);
 return x.db.prepare('SELECT * FROM work_tasks WHERE id=?').get(task.id);
}

import {myWork} from '../src/my-work.mjs';
const own='/api/my-work';
test('active internal roles read only their actual responsibilities and no personnel or another employee fields',async t=>{
 const x=await setup(t,{seed:false});await newTask(x);await newTask(x,{owner:'professional'});await newTask(x,{owner:null,role:'reception'});
 for(const [id,s]of [['manager',x.m],['front',x.f],['professional',x.p]]){
  const z=await x.request(own,s);good(z);assert.equal(z.body.employee.id,id);assert.ok(z.body.items.every(r=>r.owner_id===id));assert.equal(z.body.total_responsibilities,id==='manager'?0:1);
  assert.deepEqual(Object.keys(z.body.employee).sort(),['display_name','id','role']);assert.equal(z.body.personnel_records,undefined);
  assert.ok(!JSON.stringify(z.body).includes('password'));assert.ok(!JSON.stringify(z.body).includes('phone'));
 }
 const front=(await x.request(own,x.f)).body;assert.equal(front.candidate_task_count,1);assert.equal(front.counts.task,1);assert.equal((await x.request(path,x.f)).status,403);
});
test('guardian and unsigned requests cannot read own work or proofs and employee/store selectors never broaden scope',async t=>{
 const x=await setup(t,{seed:false});for(const p of [own,own+'/authorization']){assert.equal((await x.request(p,x.g)).status,403);assert.equal((await x.request(p)).status,401);for(const q of ['employee_id=front','store_id=store-a','assignee_id=front'])assert.equal((await x.request(p+'?'+q,x.m)).status,422);}
 assert.equal((await x.request(own+'/front',x.m)).status,404);
});
test('current cross-business projection retains original customer classes plus preparation kind, IDs, version and dates without HR',async t=>{
 const x=await setup(t),u=x.db.prepare("SELECT * FROM users WHERE id='demo-professional'").get(),s=await x.login(u.id),z=(await x.request(own+'?limit=100',s)).body,original=employeeResponsibilities(x.db,u.store_id,u.id,{limit:100});
 assert.equal(z.kinds.length,14);assert.ok(z.kinds.includes('screening_project'));assert.deepEqual(z.counts,original.counts);assert.deepEqual(z.items,original.items);assert.ok(z.items.length>4);assert.ok(z.items.some(r=>r.version!==null));assert.equal(z.personnel_records,undefined);
 for(const r of z.items)if(r.due===null)assert.equal(r.deadline_status,'not_recorded');
});
test('another store and another employees responsibility cannot be selected or mixed into either own scope',async t=>{
 const x=await setup(t,{seed:false});await newTask(x,{owner:'professional',title:'另一员工私有责任'});await newTask(x,{owner:null,role:'reception'});
 const r=await x.request('/api/customers/other-child/tasks',{...x.o,method:'POST',data:{title:'外店岗位候选',instructions:'仅外店',assignee_id:null,candidate_role:'reception',cycle_id:null,cycle_version:null,visit_id:null,reason:'明确原店候选'}});good(r,201);
 assert.equal((await x.request(own,x.f)).body.total,0);const c=(await x.request(own+'?scope=candidates',x.f)).body;assert.equal(c.total,1);assert.ok(c.items.every(r=>r.store_id==='store-a'&&r.owner_id===null));assert.ok(!c.items.some(r=>r.title.includes('外店')));
});
test('actual own and role candidates paginate all 105 items with stable keys and complete separate counts',async t=>{
 const x=await setup(t,{seed:false});for(let i=0;i<105;i++)await newTask(x,{owner:i%2?'front':null,role:i%2?null:'reception',title:'原批任务 '+i});
 for(const scope of ['mine','candidates']){const a=(await x.request(own+'?scope='+scope+'&limit=30',x.f)).body;assert.equal(a.total,scope==='mine'?52:53);assert.equal(a.total_responsibilities,52);assert.equal(a.candidate_task_count,53);assert.equal(a.items.length,30);
  assert.equal((await x.request(own+'?scope='+scope+'&offset=30',x.f)).status,409);const b=await x.request(own+'?scope='+scope+'&offset=30&expected_source='+a.source_token,x.f);good(b);assert.equal(new Set([...a.items,...b.body.items].map(v=>v.key)).size,a.total);assert.equal(b.body.next_offset,null);
 }
});
test('literal text and kind filters preserve complete own counters and do not become candidate assignment',async t=>{
 const x=await setup(t,{seed:false});await newTask(x,{title:'原资料%核对'});await newTask(x,{title:'其他任务'});await newTask(x,{owner:null,role:'reception',title:'候选%资料'});
 for(const [query,total]of [['q=%25',1],['kind=processing',0],['q=one',2],['scope=candidates&q=%25',1],['scope=candidates&kind=processing',0]]){const z=await x.request(own+'?'+query,x.f);good(z);assert.equal(z.body.total,total);assert.equal(z.body.counts.task,2);assert.equal(z.body.candidate_task_count,1);}
});
test('proof binds actor, own/candidate scope and exact filters rather than accepting another workers cursor',async t=>{
 const x=await setup(t,{seed:false});await newTask(x);const a=(await x.request(own,x.f)).body;
 for(const [query,s]of [['',x.m],['scope=candidates',x.f],['kind=task',x.f],['q=其他',x.f]]){const z=await x.request(own+'/authorization?'+(query?query+'&':'')+'expected_source='+a.source_token,s);assert.equal(z.status,409);}
 good(await x.request(own+'/authorization?expected_source='+a.source_token,x.f));
});
test('original transfer invalidates old own source and moves awaiting paused responsibility without starting work',async t=>{
 const x=await setup(t,{seed:false}),task=await newTask(x),before=(await x.request(own,x.f)).body;
 good(await x.request('/api/tasks/'+task.id+'/transfer',{...x.m,method:'POST',data:{expected_revision:task.revision,assignee_id:'professional',reason:'原责任明确移交'}}));
 assert.equal((await x.request(own+'/authorization?expected_source='+before.source_token,x.f)).status,409);assert.equal((await x.request(own,x.f)).body.total,0);const z=(await x.request(own,x.p)).body;assert.equal(z.total,1);assert.match(z.items[0].status,/awaiting/);assert.equal(x.db.prepare('SELECT execution_status FROM work_tasks WHERE id=?').get(task.id).execution_status,'pending');
});
test('explicit original candidate claim is separate from receive and changes own count only after that write',async t=>{
 const x=await setup(t,{seed:false}),task=await newTask(x,{owner:null,role:'reception'}),before=(await x.request(own+'?scope=candidates',x.f)).body;
 assert.equal(before.total_responsibilities,0);good(await x.request('/api/tasks/'+task.id+'/claim',{...x.f,method:'POST',data:{expected_revision:task.revision,reason:'本人明确认领原候选'}}));
 assert.equal((await x.request(own+'/authorization?scope=candidates&expected_source='+before.source_token,x.f)).status,409);
 const z=(await x.request(own,x.f)).body;assert.equal(z.total_responsibilities,1);assert.equal(z.candidate_task_count,0);assert.match(z.items[0].status,/awaiting.*pending/);assert.equal(z.items[0].customer_id,task.customer_id);
});
test('role changes, password gate and session revocation reject stale work proof immediately',async t=>{
 const x=await setup(t,{seed:false});await newTask(x);const z=(await x.request(own,x.f)).body;
 x.db.prepare("UPDATE users SET role='professional' WHERE id='front'").run();assert.equal((await x.request(own+'/authorization?expected_source='+z.source_token,x.f)).status,409);
 x.db.prepare("INSERT INTO user_security(user_id,revision,must_change_password) VALUES('front',1,1) ON CONFLICT(user_id) DO UPDATE SET must_change_password=1").run();assert.equal((await x.request(own,x.f)).status,403);
 x.db.prepare("UPDATE user_security SET must_change_password=0 WHERE user_id='front'").run();x.db.prepare("DELETE FROM sessions WHERE user_id='front'").run();assert.equal((await x.request(own+'/authorization',x.f)).status,401);
});
test('all read and proof paths are zero-write and cancelled original work remains historical without current duty',async t=>{
 const x=await setup(t,{seed:false}),task=await newTask(x),before=snapshot(x.db);for(const query of ['', '?scope=candidates','?q=%25']){good(await x.request(own+query,x.f));good(await x.request(own+'/authorization'+query,x.f));}assert.deepEqual(snapshot(x.db),before);
 good(await x.request('/api/tasks/'+task.id+'/cancel',{...x.m,method:'POST',data:{expected_revision:task.revision,reason:'原任务明确取消'}}));assert.equal((await x.request(own,x.f)).body.total,0);assert.ok(x.db.prepare("SELECT 1 FROM task_events WHERE task_id=? AND action='cancel'").get(task.id));
});
test('strict filters, duplicate options, bounded pagination and unsupported mutations cannot hide invalid selectors',async t=>{
 const x=await setup(t,{seed:false});for(const query of ['scope=store','scope=mine&scope=candidates','kind=finance','q=a&q=b','q=%00','limit=0','limit=101','offset=-1','automatic_claim=true'])assert.equal((await x.request(own+'?'+query,x.f)).status,422,query);
 assert.equal((await x.request(own+'/authorization?limit=1',x.f)).status,422);assert.equal((await x.request(own,{...x.f,method:'POST',data:{}})).status,405);
});
test('independent recovery preserves the self-only original cross-business projection and revokes old sessions',async t=>{
 const x=await setup(t,{persist:true}),u=x.db.prepare("SELECT * FROM users WHERE id='demo-professional'").get(),before=myWork(x.db,u,{limit:100}),b=await createBackup(x.path,join(x.dir,'backup')),r=await restoreBackup(b.backup,join(x.dir,'restored')),db=openDatabase(r.database);t.after(()=>db.close());
 const restored=myWork(db,u,{limit:100});for(const key of ['employee','filter','kinds','counts','total_responsibilities','candidate_task_count','items','total','next_offset'])assert.deepEqual(restored[key],before[key],key);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
});

test('completed scope lists only tasks actually completed by the signed-in employee and keeps current duties and candidates separate',async t=>{
 const x=await setup(t,{seed:false}),done=await completeTask(x),other=await completeTask(x,{owner:'professional',title:'他人实际完成',session:x.p});await newTask(x,{title:'本人当前责任'});await newTask(x,{owner:null,role:'reception',title:'本岗位当前候选'});
 const before=snapshot(x.db),z=(await x.request(own+'?scope=completed',x.f)).body;assert.equal(z.total,1);assert.equal(z.completed_task_count,1);assert.equal(z.total_responsibilities,1);assert.equal(z.candidate_task_count,1);assert.equal(z.items[0].id,done.id);assert.equal(z.items[0].completed_task,true);assert.equal(z.items[0].owner_id,'front');assert.equal(z.items[0].completion_condition_version,1);assert.equal(z.items[0].completion_evidence_version,1);assert.equal(z.items[0].completion_correction_version,0);assert.equal(z.items[0].completion_followup_count,0);assert.equal(z.items[0].due_source,'completed_at');assert.equal(z.items.some(r=>r.id===other.id),false);assert.equal((await x.request(own,x.f)).body.total,1);assert.equal((await x.request(own+'?scope=candidates',x.f)).body.total,1);good(await x.request(own+'/authorization?'+new URLSearchParams({...z.filter,expected_source:z.source_token}),x.f));assert.deepEqual(snapshot(x.db),before);
 for(const q of ['scope=completed&kind=processing','scope=completed&kind=task&task_state=running','scope=completed&date_mode=not_recorded'])assert.equal((await x.request(own+'?'+q,x.f)).status,q.includes('date_mode')?200:422,q);
});

test('completed paging, immutable references, correction source changes and recovery remain complete and zero-write',async t=>{
 const x=await setup(t,{seed:false,persist:true}),task=await completeTask(x,{title:'已办理分页 0'}),base=x.db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(task.id);
 transaction(x.db,()=>{for(let i=1;i<105;i++){const id='my-completed-'+i;x.db.prepare('INSERT INTO work_tasks SELECT ?,customer_id,store_id,?,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by,candidate_role,lifecycle_status,exception_reason,restore_status,restore_reason FROM work_tasks WHERE id=?').run(id,'已办理分页 '+i,task.id);x.db.prepare('INSERT INTO task_events SELECT ?,customer_id,revision,action,from_assignee_id,assignee_id,assignment_status,execution_status,reason,created_at,actor_id,candidate_role,lifecycle_status,exception_reason,restore_status,restore_reason FROM task_events WHERE task_id=?').run(id,task.id);x.db.prepare('INSERT INTO task_conditions SELECT ?,customer_id,version,task_revision,scope,description,require_document,require_attachment,reason,created_at,created_by FROM task_conditions WHERE task_id=?').run(id,task.id);x.db.prepare('INSERT INTO task_evidence SELECT ?,customer_id,version,task_revision,condition_version,notes,source,reason,references_json,created_at,created_by FROM task_evidence WHERE task_id=?').run(id,task.id);const frozen=JSON.stringify(completionSnapshot(x.db,id,1,1));x.db.prepare('INSERT INTO task_completions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,base.customer_id,base.scope,1,1,3,base.output_summary,base.reason,frozen,completionDigest(frozen),base.completed_at,'front');}});
 const a=(await x.request(own+'?scope=completed&limit=100',x.f)).body,b=(await x.request(own+'?'+new URLSearchParams({...a.filter,limit:'100',offset:'100',expected_source:a.source_token}),x.f)).body;assert.equal(a.total,105);assert.equal(a.completed_task_count,105);assert.equal(a.items.length,100);assert.equal(b.items.length,5);assert.equal(new Set([...a.items,...b.items].map(r=>r.key)).size,105);const before=snapshot(x.db);good(await x.request(own+'/authorization?'+new URLSearchParams({...a.filter,expected_source:a.source_token}),x.f));assert.deepEqual(snapshot(x.db),before);
 x.db.prepare('INSERT INTO task_completion_corrections VALUES (?,?,?,?,?,?,?,?)').run(task.id,base.customer_id,1,base.snapshot_sha256,'本人完成说明更正 V1（虚构）','保留原完成与引用',new Date().toISOString(),'front');assert.equal((await x.request(own+'/authorization?'+new URLSearchParams({...a.filter,expected_source:a.source_token}),x.f)).status,409);const changed=(await x.request(own+'?scope=completed&q='+encodeURIComponent(task.id),x.f)).body;assert.equal(changed.items[0].completion_correction_version,1);
 const u=x.db.prepare("SELECT * FROM users WHERE id='front'").get(),expected=myWork(x.db,u,{scope:'completed',limit:100}),backup=await createBackup(x.path,join(x.dir,'backup-completed')),restored=await restoreBackup(backup.backup,join(x.dir,'restored-completed')),db=openDatabase(restored.database);t.after(()=>db.close());const actual=myWork(db,u,{scope:'completed',limit:100});for(const key of ['filter','counts','matched_counts','completed_task_count','total','items'])assert.deepEqual(actual[key],expected[key],key);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
});
