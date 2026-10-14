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

import {myWorkFollowups} from '../src/my-work-followups.mjs';
import {taskSourceProof} from '../src/task-source-proof.mjs';
const route=id=>own+'/completed/'+id+'/followups';
const qs=(x,id,extra={})=>new URLSearchParams({expected_parent_source:taskSourceProof(x.db,id).source_fingerprint,...extra});
const read=async(x,id,extra={},session=x.f)=>{const z=await x.request(route(id)+'?'+qs(x,id,extra),session);good(z);return z.body;};
async function add(x,id,{owner='front',role=null,title='原后续任务'}={}){const c=x.db.prepare('SELECT snapshot_sha256 FROM task_completions WHERE task_id=?').get(id),version=x.db.prepare('SELECT coalesce(max(version),0) n FROM task_completion_corrections WHERE task_id=?').get(id).n;const z=await x.request('/api/tasks/'+id+'/followups',{...x.m,method:'POST',data:{expected_correction_version:version,completion_sha256:c.snapshot_sha256,title,instructions:'禁止进入薄元信息的交接正文',assignee_id:owner,...(role?{candidate_role:role}:{}),reason:'明确固定原后续引用'}});good(z,201);return z.body.task;}
async function act(x,id,action,extra={},session=x.f){const rev=x.db.prepare('SELECT revision FROM work_tasks WHERE id=?').get(id).revision,z=await x.request('/api/tasks/'+id+'/'+action,{...session,method:'POST',data:{expected_revision:rev,reason:'实际原办理（虚构）',...extra}});good(z);return z.body.task;}
async function completeExisting(x,task){
 await act(x,task.id,'accept');await act(x,task.id,'start');const revision=x.db.prepare('SELECT revision FROM work_tasks WHERE id=?').get(task.id).revision;
 good(await x.request('/api/tasks/'+task.id+'/completion/conditions',{...x.m,method:'POST',data:{expected_task_revision:revision,expected_condition_version:0,description:'后续通用核对（虚构）',require_document:false,require_attachment:false,reason:'明确原条件'}}),201);
 good(await x.request('/api/tasks/'+task.id+'/completion/evidence',{...x.f,method:'POST',data:{expected_task_revision:revision,expected_evidence_version:0,condition_version:1,notes:'后续原依据（虚构）',source:'employee',document_version_ids:[],attachment_ids:[],reason:'保存原依据'}}),201);
 good(await x.request('/api/tasks/'+task.id+'/completion/submit',{...x.f,method:'POST',data:{expected_task_revision:revision,condition_version:1,evidence_version:1,output_summary:'后续任务完成（虚构）',reason:'明确完成'}}),201);
}
test('fixed direct references expose original source and current responsibility only, and read no task or completion bodies',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x),a=await add(x,p.id),b=await add(x,p.id,{owner:null,role:'professional'}),before=snapshot(x.db),z=await read(x,p.id);assert.equal(z.total,2);assert.equal(z.parent_source_proof.source_fingerprint,taskSourceProof(x.db,p.id).source_fingerprint);assert.deepEqual(new Set(z.items.map(r=>r.id)),new Set([a.id,b.id]));for(const r of z.items){assert.equal(r.parent_task_id,p.id);assert.equal(r.completion_sha256,z.parent_source_proof.completion_sha256);assert.equal(r.source_correction_version,null);assert.equal(r.revision,1);}assert.equal(z.items.find(r=>r.id===a.id).assignee_name,'front');assert.equal(z.items.find(r=>r.id===b.id).candidate_role,'professional');assert.ok(!JSON.stringify(z).includes('禁止进入薄元信息'));assert.ok(!JSON.stringify(z).includes('本人通用核对完成'));assert.ok(!JSON.stringify(z).includes('password'));good(await x.request(route(p.id)+'/authorization?'+qs(x,p.id,{expected_source:z.source_token}),x.f));assert.deepEqual(snapshot(x.db),before);
});
test('only actual self completion in this store can anchor the expansion, not assignment, another employee or guardian',async t=>{
 const x=await setup(t,{seed:false}),a=await completeTask(x),b=await completeTask(x,{owner:'professional',session:x.p}),c=await newTask(x);await add(x,a.id,{owner:'professional'});assert.equal((await read(x,a.id)).total,1);for(const [id,s]of [[a.id,x.p],[a.id,x.o],[b.id,x.f]])assert.equal((await x.request(route(id)+'?'+qs(x,id),s)).status,404);assert.equal((await x.request(route(a.id)+'?'+qs(x,a.id),x.g)).status,403);assert.equal((await x.request(route(a.id)+'?'+qs(x,a.id))).status,401);assert.equal((await x.request(route(c.id)+'?'+qs(x,a.id),x.f)).status,404);
});
test('complete 105 fixed references paginate in stable original order with full totals and no automatic assignment',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x);for(let i=0;i<105;i++)await add(x,p.id,{owner:null,role:'reception',title:'原后续 '+i});const before=snapshot(x.db),a=await read(x,p.id,{limit:100,task_state:'queued',responsibility_role:'reception'}),b=await read(x,p.id,{task_state:'queued',responsibility_role:'reception',offset:100,expected_source:a.source_token});assert.equal(a.total,105);assert.equal(a.matched_total,105);assert.equal(a.state_counts.queued,105);assert.equal(a.role_counts.reception,105);assert.equal(a.state_role_counts.queued.reception,105);assert.equal(Object.values(a.state_counts).reduce((n,v)=>n+v,0),105);assert.equal(Object.values(a.role_counts).reduce((n,v)=>n+v,0),105);assert.equal(a.items.length,100);assert.equal(b.items.length,5);assert.equal(b.next_offset,null);assert.equal(new Set([...a.items,...b.items].map(r=>r.id)).size,105);assert.deepEqual([...a.items,...b.items].map(r=>r.id),a.parent_source_proof.followups.map(r=>r.task_id));assert.ok(b.items.every(r=>r.assignee_id===null&&r.responsibility_role==='reception'));assert.equal((await x.request(route(p.id)+'?'+qs(x,p.id,{task_state:'queued',responsibility_role:'reception',offset:100}),x.f)).status,409);assert.deepEqual(snapshot(x.db),before);
});
test('all eight current original states have complete counts, explicit matching and zero-count results',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x),rows=[];for(const state of ['queued','awaiting','pending','running','paused','blocked','cancelled','completed'])rows.push([state,await add(x,p.id,{owner:state==='queued'?null:'front',role:state==='queued'?'reception':null,title:'原状态 '+state})]);
 for(const [state,row]of rows){if(['pending','running','paused','blocked'].includes(state))await act(x,row.id,'accept');if(['running','paused','blocked'].includes(state))await act(x,row.id,'start');if(state==='paused')await act(x,row.id,'pause');if(state==='blocked')await act(x,row.id,'block',{reason:'明确原阻塞'});if(state==='cancelled')await act(x,row.id,'cancel',{},x.m);}
 await completeExisting(x,rows.find(([state])=>state==='completed')[1]);const all=await read(x,p.id);assert.equal(all.total,8);assert.equal(all.matched_total,8);assert.deepEqual(all.state_counts,Object.fromEntries(rows.map(([state])=>[state,1])));for(const [state,row]of rows){const z=await read(x,p.id,{task_state:state});assert.equal(z.total,8);assert.equal(z.matched_total,1);assert.equal(z.items[0].id,row.id);assert.equal(z.items[0].task_state,state);assert.equal(z.filter.task_state,state);}await act(x,rows[0][1].id,'cancel',{},x.m);const empty=await read(x,p.id,{task_state:'queued'});assert.equal(empty.total,8);assert.equal(empty.matched_total,0);assert.equal(empty.items.length,0);assert.equal(empty.state_counts.queued,0);assert.equal(empty.state_counts.cancelled,2);
});
test('actual assignee roles and original candidate roles cross-filter all states with complete zero-inclusive counts',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x),front=await add(x,p.id,{owner:'front',title:'接待已指派'}),professional=await add(x,p.id,{owner:'professional',title:'专业已指派'}),manager=await add(x,p.id,{owner:'manager',title:'负责人已指派'}),candidate=await add(x,p.id,{owner:null,role:'reception',title:'接待原候选'});await act(x,front.id,'accept');
 const all=await read(x,p.id);assert.equal(all.total,4);assert.deepEqual(all.role_counts,{manager:1,reception:2,professional:1,unknown:0});assert.equal(all.state_role_counts.pending.reception,1);assert.equal(all.state_role_counts.queued.reception,1);assert.equal(all.state_role_counts.awaiting.manager,1);assert.equal(all.state_role_counts.awaiting.professional,1);for(const counts of Object.values(all.state_role_counts))assert.deepEqual(Object.keys(counts),['manager','reception','professional','unknown']);
 const reception=await read(x,p.id,{responsibility_role:'reception'});assert.equal(reception.matched_total,2);assert.deepEqual(new Set(reception.items.map(r=>r.id)),new Set([front.id,candidate.id]));assert.ok(reception.items.every(r=>r.responsibility_role==='reception'));
 const cross=await read(x,p.id,{task_state:'queued',responsibility_role:'reception'});assert.equal(cross.matched_total,1);assert.equal(cross.items[0].id,candidate.id);assert.equal(cross.filter.task_state,'queued');assert.equal(cross.filter.responsibility_role,'reception');
 const zero=await read(x,p.id,{task_state:'completed',responsibility_role:'unknown'});assert.equal(zero.total,4);assert.equal(zero.matched_total,0);assert.deepEqual(zero.items,[]);assert.equal(zero.role_counts.unknown,0);assert.equal(zero.state_role_counts.completed.unknown,0);assert.equal(professional.assignee_id,'professional');assert.equal(manager.assignee_id,'manager');
});
test('old child-state proofs and continuations reject explicit acceptance, transfer and cancellation while fixed links stay unchanged',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x),c=await add(x,p.id),z=await read(x,p.id),fixed=z.parent_source_proof;await act(x,c.id,'accept');assert.equal((await x.request(route(p.id)+'/authorization?'+qs(x,p.id,{expected_source:z.source_token}),x.f)).status,409);const accepted=await read(x,p.id);assert.match(accepted.items[0].status,/accepted/);assert.deepEqual(accepted.parent_source_proof,fixed);await act(x,c.id,'transfer',{assignee_id:'professional'},x.m);const transferred=await read(x,p.id);assert.equal(transferred.items[0].assignee_id,'professional');assert.equal(transferred.items[0].assignee_role,'professional');await act(x,c.id,'cancel',{},x.m);const cancelled=await read(x,p.id);assert.equal(cancelled.total,1);assert.match(cancelled.items[0].status,/cancelled/);assert.deepEqual(cancelled.parent_source_proof,fixed);
});
test('parent corrections and new links reject the adopted parent proof and do not rewrite earlier adopted correction versions',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x),c=await add(x,p.id),z=await read(x,p.id),cpl=x.db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(p.id);x.db.prepare('INSERT INTO task_completion_corrections VALUES (?,?,?,?,?,?,?,?)').run(p.id,'one',1,cpl.snapshot_sha256,'新的原完成说明（虚构）','明确更正',new Date().toISOString(),'front');assert.equal((await x.request(route(p.id)+'?'+new URLSearchParams({expected_parent_source:z.parent_source_proof.source_fingerprint}),x.f)).status,409);const next=await read(x,p.id);assert.equal(next.parent_source_proof.correction_version,1);assert.equal(next.items[0].source_correction_version,null);const d=await add(x,p.id);assert.equal((await x.request(route(p.id)+'?'+new URLSearchParams({expected_parent_source:next.parent_source_proof.source_fingerprint}),x.f)).status,409);const now=await read(x,p.id);assert.equal(now.items.find(r=>r.id===d.id).source_correction_version,1);assert.equal(now.items.find(r=>r.id===c.id).completion_sha256,cpl.snapshot_sha256);
});
test('strict read-only query fields, parent proof and page bounds reject identity selection and unsupported writes',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x),valid=qs(x,p.id).toString();for(const q of ['',valid+'&employee_id=professional',valid+'&store_id=store-b',valid+'&limit=101',valid+'&limit=0',valid+'&offset=-1',valid+'&expected_source=wrong',valid+'&expected_parent_source=wrong',valid+'&kind=task',valid+'&task_state=unknown',valid+'&task_state=',valid+'&task_state=queued&task_state=all',valid+'&responsibility_role=guardian',valid+'&responsibility_role=',valid+'&responsibility_role=reception&responsibility_role=all'])assert.equal((await x.request(route(p.id)+'?'+q,x.f)).status,422,q);assert.equal((await x.request(route(p.id)+'/authorization?'+valid+'&limit=1',x.f)).status,422);assert.equal((await x.request(route(p.id)+'?'+valid,{...x.f,method:'POST',data:{}})).status,405);assert.equal((await x.request(route(p.id)+'/authorization?'+valid,x.f)).status,409);
});
test('current actor role and session revocation protect expansion proofs, target role and availability changes invalidate current responsibility proof',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x);await add(x,p.id,{owner:'professional'});const z=await read(x,p.id,{responsibility_role:'professional'});x.db.prepare("UPDATE users SET role='reception' WHERE id='professional'").run();assert.equal((await x.request(route(p.id)+'/authorization?'+qs(x,p.id,{responsibility_role:'professional',expected_source:z.source_token}),x.f)).status,409);const next=await read(x,p.id,{responsibility_role:'reception'});x.db.prepare("UPDATE users SET active=0 WHERE id='professional'").run();assert.equal((await x.request(route(p.id)+'/authorization?'+qs(x,p.id,{responsibility_role:'reception',expected_source:next.source_token}),x.f)).status,409);x.db.prepare("UPDATE users SET active=1 WHERE id='professional'").run();const actor=await read(x,p.id);x.db.prepare("UPDATE users SET role='professional' WHERE id='front'").run();assert.equal((await x.request(route(p.id)+'/authorization?'+qs(x,p.id,{expected_source:actor.source_token}),x.f)).status,409);x.db.prepare("UPDATE users SET active=0 WHERE id='front'").run();assert.equal((await x.request(route(p.id)+'?'+qs(x,p.id),x.f)).status,401);
});
test('independent restore keeps original fixed references/current metadata and hashes and revokes old sessions',async t=>{
 const x=await setup(t,{seed:false,persist:true}),p=await completeTask(x);await add(x,p.id);await add(x,p.id,{owner:null,role:'reception'});const u=x.db.prepare("SELECT * FROM users WHERE id='front'").get(),before=myWorkFollowups(x.db,u,p.id),links=x.db.prepare('SELECT * FROM task_followups ORDER BY rowid').all(),b=await createBackup(x.path,join(x.dir,'backup-followup-view')),r=await restoreBackup(b.backup,join(x.dir,'restored-followup-view')),db=openDatabase(r.database);t.after(()=>db.close());assert.deepEqual(myWorkFollowups(db,u,p.id),before);for(const state of ['all','queued','awaiting','completed'])for(const role of ['all','reception','professional','unknown'])assert.deepEqual(myWorkFollowups(db,u,p.id,{task_state:state,responsibility_role:role}),myWorkFollowups(x.db,u,p.id,{task_state:state,responsibility_role:role}));assert.deepEqual(db.prepare('SELECT * FROM task_followups ORDER BY rowid').all(),links);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
});
test('state-bound proofs and continuations cannot mix selected states, including zero-count states',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x);await add(x,p.id,{owner:null,role:'reception'});await add(x,p.id);
 const a=await read(x,p.id,{task_state:'queued',limit:1}),b=await read(x,p.id,{task_state:'awaiting'}),empty=await read(x,p.id,{task_state:'completed'}),original=taskSourceProof(x.db,p.id),before=snapshot(x.db);
 assert.notEqual(a.source_token,b.source_token);assert.notEqual(a.source_token,empty.source_token);assert.deepEqual(a.parent_source_proof,b.parent_source_proof);
 for(const state of ['all','awaiting','completed'])for(const suffix of ['', '/authorization'])assert.equal((await x.request(route(p.id)+suffix+'?'+qs(x,p.id,{task_state:state,expected_source:a.source_token,...(!suffix?{offset:1}:{})}),x.f)).status,409);
 good(await x.request(route(p.id)+'/authorization?'+qs(x,p.id,{task_state:'queued',expected_source:a.source_token}),x.f));
 good(await x.request(route(p.id)+'/authorization?'+qs(x,p.id,{task_state:'completed',expected_source:empty.source_token}),x.f));
 const end=await read(x,p.id,{task_state:'queued',offset:1,expected_source:a.source_token});assert.equal(end.total,2);assert.equal(end.matched_total,1);assert.equal(end.items.length,0);assert.equal(end.next_offset,null);assert.deepEqual(end.state_counts,a.state_counts);
 assert.deepEqual(taskSourceProof(x.db,p.id),original);assert.deepEqual(snapshot(x.db),before);
});
test('native changes outside the selected state invalidate all-state counts and old pages without changing fixed parent references',async t=>{
 const x=await setup(t,{seed:false}),p=await completeTask(x),a=await add(x,p.id),b=await add(x,p.id,{owner:null,role:'reception'}),z=await read(x,p.id,{task_state:'awaiting',limit:1}),fixed=taskSourceProof(x.db,p.id),links=x.db.prepare('SELECT * FROM task_followups ORDER BY rowid').all();
 await act(x,b.id,'cancel',{},x.m);for(const suffix of ['', '/authorization'])assert.equal((await x.request(route(p.id)+suffix+'?'+qs(x,p.id,{task_state:'awaiting',expected_source:z.source_token,...(!suffix?{offset:1}:{})}),x.f)).status,409);
 const refreshed=await read(x,p.id,{task_state:'awaiting'});assert.equal(refreshed.matched_total,1);assert.equal(refreshed.state_counts.queued,0);assert.equal(refreshed.state_counts.cancelled,1);assert.equal(refreshed.items[0].id,a.id);
 await act(x,a.id,'accept');const after=await read(x,p.id,{task_state:'awaiting'});assert.equal(after.total,2);assert.equal(after.matched_total,0);assert.equal(after.state_counts.awaiting,0);assert.equal(after.state_counts.pending,1);assert.equal(after.state_counts.cancelled,1);assert.equal((await x.request(route(p.id)+'/authorization?'+qs(x,p.id,{task_state:'awaiting',expected_source:refreshed.source_token}),x.f)).status,409);
 assert.deepEqual(after.parent_source_proof,fixed);assert.deepEqual(x.db.prepare('SELECT * FROM task_followups ORDER BY rowid').all(),links);
});
