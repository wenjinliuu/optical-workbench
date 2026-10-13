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
async function setup(t,{persist=false,seed=true}={}){const x=await fixture(t,{persist});Object.assign(x,{m:await x.login('manager'),f:await x.login('front'),p:await x.login('professional'),g:await x.login('parent'),o:await x.login('other')});if(seed){for(const[id,role]of [['demo-manager','manager'],['demo-front','reception'],['demo-professional','professional'],['demo-parent','guardian']])x.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run(id,id,id,hashPassword('synthetic-only-password'),role,role==='guardian'?null:'store-a');seedDemoScenarios(x.db);seedDemoRetail(x.db);seedDemoInventory(x.db);seedDemoPayments(x.db);seedDemoProcessing(x.db);seedDemoFulfillment(x.db);seedDemoAftercare(x.db);seedDemoAftercareWork(x.db);seedDemoReplacements(x.db);seedDemoDispositions(x.db);seedDemoRefunds(x.db);seedDemoParameters(x.db);seedDemoTraining(x.db);seedDemoEntitlements(x.db);seedDemoScheduling(x.db);x.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run('demo-practice-parent','demo-practice-parent','家庭练习家长（虚构）',hashPassword('synthetic-only-password'),'guardian',null);seedDemoFamilyTraining(x.db);seedDemoLongitudinal(x.db);seedDemoContact(x.db);seedDemoReferrals(x.db);seedDemoSpecialty(x.db);seedDemoSpecialtyTrace(x.db);seedDemoSpecialtyCare(x.db);seedDemoSpecialtyReviews(x.db);seedDemoStaffHandover(x.db);}return x;}
const path='/api/staff-handover/employees',duties=id=>path+'/'+id+'/responsibilities',good=(z,status=200)=>assert.equal(z.status,status,JSON.stringify(z.body));
const snapshot=db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>[x.name,db.prepare('SELECT * FROM '+x.name+' ORDER BY rowid').all()]));
async function newTask(x,{owner='front',title='明确原客户资料核对',role=null}={}){const z=await x.request('/api/customers/one/tasks',{...x.m,method:'POST',data:{title,instructions:'仅原客户通用资料核对',assignee_id:owner,...(role?{candidate_role:role}:{}),cycle_id:null,cycle_version:null,visit_id:null,reason:'实际明确原任务'}});good(z,201);return z.body.task||z.body;}

import {myWork} from '../src/my-work.mjs';
const own='/api/my-work';

import * as C from '../src/contact.mjs';
import * as P from '../src/screening-projects.mjs';
const contactInput=(due,owner='front',title='原联系日期（独立虚构）')=>({title,purpose:'other_service',purpose_note:'仅原明确服务安排',due_at:due,next_action:'责任人核对原服务安排',owner_id:owner,source:{kind:'manual',id:null,version:null,revision:null},source_note:'明确原人工资料（虚构）',note:'实际原安排',reason:'独立虚构依据'});
async function contact(x,due,owner='front',title){const data={customer_id:'one',...contactInput(due,owner,title),expected_sequence:C.contactSequence(x.db,'store-a')},r=await x.request('/api/contacts/cases',{...x.m,method:'POST',data});good(r,201);return r.body.record;}
const query=async(x,options={},s=x.f)=>{const r=await x.request(own+'?'+new URLSearchParams(options),s);good(r);return r.body;};
const proofURL=z=>own+'/authorization?'+new URLSearchParams({...z.filter,expected_source:z.source_token});

const verify=z=>{assert.deepEqual(Object.keys(z.matched_counts),responsibilityKinds);assert.equal(Object.values(z.matched_counts).reduce((a,b)=>a+b,0),z.total);};
const project=x=>P.appendScreeningProject(x.db,'store-a',null,{action:'record',title:'完整匹配原准备',institution:'虚构机构',owner_id:'front',activity_note:'只保存原准备说明',authorization_status:'unknown',authorization_reference:null,authorization_note:'说明未知',record_reason:'明确原准备依据'},'manager');
test('matched classification covers every original kind while full source counts and manager projection remain compatible',async t=>{
 const x=await setup(t),seen=new Set();project(x);for(const id of ['demo-manager','demo-front','demo-professional','front']){const u=x.db.prepare('SELECT * FROM users WHERE id=?').get(id),s=await x.login(id),all=await query(x,{limit:100},s);verify(all);assert.deepEqual(all.matched_counts,all.counts);assert.deepEqual(all.matched_counts,employeeResponsibilities(x.db,'store-a',id,{limit:100}).matched_counts);
 for(const kind of responsibilityKinds){const z=await query(x,{kind,limit:1},s);verify(z);assert.deepEqual(z.counts,all.counts);assert.equal(z.matched_counts[kind],all.counts[kind]);assert.ok(Object.entries(z.matched_counts).every(([k,n])=>k===kind||n===0));if(z.total)seen.add(kind);}}
 assert.deepEqual(seen,new Set(responsibilityKinds));
});
test('more than 105 same-customer mixed duties count original responsibilities rather than customers or loaded pages',async t=>{
 const x=await setup(t,{seed:false});for(let i=0;i<105;i++)C.createContactCase(x.db,'store-a','one',contactInput('2030-01-02T12:00:00.000Z','front','完整匹配 '+i),'manager');await newTask(x,{title:'完整匹配原任务'});project(x);const a=await query(x,{q:'完整匹配',limit:30});verify(a);assert.equal(a.total,107);assert.equal(a.items.length,30);assert.equal(a.matched_counts.contact,105);assert.equal(a.matched_counts.task,1);assert.equal(a.matched_counts.screening_project,1);
 let z=a,items=[...a.items];while(z.next_offset!==null){z=await query(x,{...a.filter,limit:30,offset:z.next_offset,expected_source:a.source_token});verify(z);assert.deepEqual(z.matched_counts,a.matched_counts);items.push(...z.items);}assert.equal(new Set(items.map(v=>v.key)).size,107);assert.equal(z.items.length,17);assert.equal(employeeDirectory(x.db,'store-a').items.find(v=>v.id==='front').customer_count,1);
});
test('date interval, literal text and original type select complete matching classifications without changing full counts',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-01T23:59:59.999Z','front','完整%原联系');await contact(x,'2030-01-02T00:00:00.000Z');await newTask(x);project(x);const all=await query(x);for(const f of [{date_mode:'recorded'},{date_from:'2030-01-01',date_to:'2030-01-01'},{kind:'contact',q:'%'},{date_mode:'not_recorded'},{kind:'task',date_mode:'recorded'},{q:'绝无原记录'}]){const z=await query(x,f);verify(z);assert.deepEqual(z.counts,all.counts);assert.deepEqual(z.date_counts,all.date_counts);assert.equal(z.total,z.items.length);for(const k of responsibilityKinds)assert.equal(z.matched_counts[k],z.items.filter(v=>v.kind===k).length);}
 const n=await query(x,{date_mode:'not_recorded'});assert.equal(n.matched_counts.task,1);assert.equal(n.matched_counts.screening_project,1);assert.equal(n.matched_counts.contact,0);
});
test('classification is independent of date sort and page limit with all filters still bound to proof',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-02T12:00:00.000Z');await newTask(x);const a=await query(x,{limit:1});for(const sort of ['updated','date_asc','date_desc']){const z=await query(x,{sort,limit:1});verify(z);assert.deepEqual(z.matched_counts,a.matched_counts);good(await x.request(proofURL(z),x.f));if(sort!=='updated')assert.equal((await x.request(own+'/authorization?'+new URLSearchParams({...a.filter,sort,expected_source:a.source_token}),x.f)).status,409);}
});
test('candidate matching counts contain only actual same-role unassigned tasks and never own duties',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-02T12:00:00.000Z');project(x);await newTask(x,{owner:null,role:'reception',title:'明确候选%任务'});await newTask(x,{owner:null,role:'professional',title:'他岗候选'});const all=await query(x,{scope:'candidates',limit:1});verify(all);assert.equal(all.total,1);assert.equal(all.matched_counts.task,1);assert.equal(all.matched_counts.contact,0);assert.equal(all.counts.contact,1);assert.equal(all.counts.screening_project,1);assert.equal(all.total_responsibilities,2);
 for(const f of [{kind:'contact'},{date_mode:'recorded'},{date_from:'2030-01-01'},{q:'不匹配'}]){const z=await query(x,{scope:'candidates',...f});verify(z);assert.ok(Object.values(z.matched_counts).every(n=>n===0));assert.equal(z.candidate_task_count,1);}assert.equal((await query(x,{scope:'candidates',q:'%',date_mode:'not_recorded'})).matched_counts.task,1);assert.equal(x.db.prepare("SELECT count(*) n FROM work_tasks WHERE assignee_id IS NOT NULL").get().n,0);
});
test('original date revision changes matched count and rejects stale proof while preserving prior event',async t=>{
 const x=await setup(t,{seed:false}),c=await contact(x,'2030-01-02T12:00:00.000Z'),z=await query(x,{date_from:'2030-01-02',date_to:'2030-01-02'});good(await x.request('/api/contacts/cases/'+c.id+'/events',{...x.m,method:'POST',data:{title:c.title,purpose_note:c.purpose_note,due_at:'2030-01-03T12:00:00.000Z',next_action:c.next_action,note:'明确原日期变更',reason:'虚构原依据',action:'revise',expected_revision:c.revision,expected_sequence:C.contactSequence(x.db,'store-a')}}),201);assert.equal((await x.request(proofURL(z),x.f)).status,409);const after=await query(x,z.filter);verify(after);assert.equal(after.matched_counts.contact,0);assert.equal(after.counts.contact,1);assert.equal(C.contactCase(x.db,c.id).history.at(-1).due_at,c.due_at);
});
test('matched reads, pages, candidate scopes and proofs write no business or audit records and reject arbitrary identity selectors',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-02T12:00:00.000Z');await newTask(x);project(x);const before=snapshot(x.db);for(const f of [{},{kind:'contact',limit:1},{date_mode:'not_recorded'},{scope:'candidates'},{q:'%'}]){const z=await query(x,f);verify(z);good(await x.request(proofURL(z),x.f));}for(const field of ['employee_id','store_id','assignee_id','matched_counts'])assert.equal((await x.request(own+'?'+field+'=other',x.f)).status,422);assert.deepEqual(snapshot(x.db),before);
});
test('cross-store, current role, guardian and inactive gates protect matching list and proof',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-02T12:00:00.000Z','professional');for(const s of [x.f,x.o]){const z=await query(x,{},s);verify(z);assert.equal(z.total,0);}assert.equal((await x.request(own,x.g)).status,403);const z=await query(x,{},x.p);x.db.prepare("UPDATE users SET role='reception' WHERE id='professional'").run();assert.equal((await x.request(proofURL(z),x.p)).status,409);x.db.prepare("UPDATE users SET active=0 WHERE id='professional'").run();assert.equal((await x.request(own,x.p)).status,401);assert.equal(employeeResponsibilities(x.db,'store-a','professional').matched_counts.contact,1);
});
test('independent restore preserves matching classifications, raw references and full counts while revoking sessions',async t=>{
 const x=await setup(t,{seed:false,persist:true});await contact(x,'2030-01-02T12:00:00.000Z');await newTask(x);project(x);const u=x.db.prepare("SELECT * FROM users WHERE id='front'").get(),options={date_mode:'not_recorded'},before=myWork(x.db,u,options),b=await createBackup(x.path,join(x.dir,'backup')),r=await restoreBackup(b.backup,join(x.dir,'restored')),db=openDatabase(r.database);t.after(()=>db.close());const after=myWork(db,u,options);verify(after);for(const k of ['filter','items','counts','matched_counts','date_counts','total','total_responsibilities','candidate_task_count'])assert.deepEqual(after[k],before[k],k);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
});

async function taskAction(x,id,action,session=x.f){const row=x.db.prepare('SELECT revision FROM work_tasks WHERE id=?').get(id),z=await x.request('/api/tasks/'+id+'/'+action,{...session,method:'POST',data:{expected_revision:row.revision,reason:'明确原'+action+'事实（虚构）'}});good(z);return z.body.task;}
async function taskExecution(x,id,{blocked=false,paused=false}={}){await taskAction(x,id,'accept');await taskAction(x,id,'start');if(blocked)await taskAction(x,id,'block');else if(paused)await taskAction(x,id,'pause');}
test('task state filters use original task dimensions without merging other business statuses',async t=>{
 const x=await setup(t,{seed:false}),awaiting=await newTask(x,{title:'原待接收任务'}),paused=await newTask(x,{title:'原阻塞暂停任务'}),running=await newTask(x,{title:'原执行中任务'});
 await taskExecution(x,paused.id,{blocked:true});
 await taskExecution(x,running.id);
 const expected={awaiting:[awaiting.id],blocked:[paused.id],paused:[paused.id],running:[running.id]};
 for(const [task_state,ids]of Object.entries(expected)){const z=await query(x,{kind:'task',task_state});verify(z);assert.deepEqual(z.items.map(v=>v.id),ids);assert.equal(z.total,ids.length);assert.equal(z.matched_counts.task,ids.length);assert.ok(Object.entries(z.matched_counts).every(([k,n])=>k==='task'||n===0));}
 const both=await query(x,{kind:'task',task_state:'all'});assert.equal(both.total,3);assert.equal(both.counts.task,3);
 assert.equal((await x.request(own+'?kind=contact&task_state=blocked',x.f)).status,422);
 assert.equal((await x.request(own+'?kind=task&task_state=guessed',x.f)).status,422);
});

test('task state is bound to paging and proof and reads do not write business or audit rows',async t=>{
 const x=await setup(t,{seed:false});for(let i=0;i<4;i++){const z=await newTask(x,{title:'状态分页 '+i});await taskExecution(x,z.id,{blocked:i===0,paused:i!==0});}
 const before=snapshot(x.db),z=await query(x,{kind:'task',task_state:'paused',limit:2});assert.equal(z.total,4);assert.equal(z.items.length,2);assert.ok(z.next_offset!==null);good(await x.request(proofURL(z),x.f));
 const page=await query(x,{...z.filter,limit:2,offset:z.next_offset,expected_source:z.source_token});assert.equal(page.items.length,2);
 assert.equal((await x.request(own+'/authorization?'+new URLSearchParams({...z.filter,task_state:'running',expected_source:z.source_token}),x.f)).status,409);
 assert.deepEqual(snapshot(x.db),before);
});

test('candidate task states remain unassigned facts and independent restore preserves them',async t=>{
 const x=await setup(t,{seed:false,persist:true}),z=await newTask(x,{owner:null,role:'reception',title:'原候选阻塞任务'});good(await x.request('/api/tasks/'+z.id+'/block',{...x.m,method:'POST',data:{expected_revision:1,reason:'明确候选原阻塞事实（虚构）'}}));
 const before=await query(x,{scope:'candidates',kind:'task',task_state:'blocked'});assert.equal(before.total,1);assert.equal(before.items[0].id,z.id);assert.equal(before.items[0].owner_id,null);
 const u=x.db.prepare("SELECT * FROM users WHERE id='front'").get(),b=await createBackup(x.path,join(x.dir,'backup-task-state')),r=await restoreBackup(b.backup,join(x.dir,'restored-task-state')),db=openDatabase(r.database);t.after(()=>db.close());
 const after=myWork(db,u,before.filter);for(const k of ['filter','items','counts','matched_counts','date_counts','total','candidate_task_count'])assert.deepEqual(after[k],before[k],k);assert.equal(db.prepare('SELECT assignee_id FROM work_tasks WHERE id=?').get(z.id).assignee_id,null);
});


test('original task state has complete 105 item pages and unchanged full mixed-business counts',async t=>{
 const x=await setup(t,{seed:false});for(let i=0;i<105;i++)await newTask(x,{title:'原待接收% '+i});await contact(x,'2030-01-02T12:00:00.000Z');project(x);const all=await query(x),a=await query(x,{kind:'task',task_state:'awaiting',q:'%',date_mode:'not_recorded',sort:'date_desc',limit:100});verify(a);assert.equal(a.total,105);assert.equal(a.items.length,100);assert.deepEqual(a.counts,all.counts);assert.equal(a.total_responsibilities,107);assert.equal(a.matched_counts.contact,0);assert.equal(a.matched_counts.screening_project,0);
 const b=await query(x,{...a.filter,offset:100,expected_source:a.source_token});verify(b);assert.equal(b.items.length,5);assert.deepEqual(b.matched_counts,a.matched_counts);assert.equal(new Set([...a.items,...b.items].map(v=>v.key)).size,105);assert.equal(b.next_offset,null);
});
test('original accept, pause, unblock and cancellation move filtered matches and retain all original events',async t=>{
 const x=await setup(t,{seed:false}),t1=await newTask(x),awaiting=await query(x,{kind:'task',task_state:'awaiting'});await taskAction(x,t1.id,'accept');assert.equal((await x.request(proofURL(awaiting),x.f)).status,409);assert.equal((await query(x,awaiting.filter)).total,0);await taskAction(x,t1.id,'start');const running=await query(x,{kind:'task',task_state:'running'});assert.equal(running.total,1);await taskAction(x,t1.id,'block');assert.equal((await x.request(proofURL(running),x.f)).status,409);assert.equal((await query(x,{kind:'task',task_state:'blocked'})).total,1);assert.equal((await query(x,{kind:'task',task_state:'paused'})).total,1);await taskAction(x,t1.id,'unblock');assert.equal((await query(x,{kind:'task',task_state:'blocked'})).total,0);assert.equal((await query(x,{kind:'task',task_state:'paused'})).total,1);await taskAction(x,t1.id,'cancel');assert.equal((await query(x,{kind:'task',task_state:'paused'})).total,0);assert.deepEqual(x.db.prepare('SELECT action FROM task_events WHERE task_id=? ORDER BY revision').all(t1.id).map(v=>v.action),['assign','accept','start','block','unblock','cancel']);
});
test('state list and proof reject duplicate, foreign and inapplicable filters and bind each state without writes',async t=>{
 const x=await setup(t,{seed:false});await newTask(x);const before=snapshot(x.db);for(const params of ['kind=all&task_state=blocked','kind=contact&task_state=paused','kind=task&task_state=blocked&task_state=paused','kind=task&task_state=completed','kind=task&employee_id=professional&task_state=blocked','kind=task&store_id=store-b&task_state=running'])for(const route of [own,own+'/authorization'])assert.equal((await x.request(route+'?'+params,x.f)).status,422,params);
 const z=await query(x,{kind:'task',task_state:'awaiting',limit:1});for(const state of ['all','blocked','paused','running']){assert.equal((await x.request(own+'/authorization?'+new URLSearchParams({...z.filter,task_state:state,expected_source:z.source_token}),x.f)).status,409);assert.equal((await x.request(own+'?'+new URLSearchParams({...z.filter,task_state:state,offset:1,expected_source:z.source_token}),x.f)).status,409);}assert.deepEqual(snapshot(x.db),before);
});
test('same-store other owner, other store, guardians and current role revocation constrain exact task states',async t=>{
 const x=await setup(t,{seed:false});await newTask(x,{owner:'professional'});const filter={kind:'task',task_state:'awaiting'};for(const s of [x.f,x.o])assert.equal((await query(x,filter,s)).total,0);assert.equal((await x.request(own+'?'+new URLSearchParams(filter),x.g)).status,403);assert.equal((await x.request(own+'/authorization?'+new URLSearchParams(filter),x.g)).status,403);const z=await query(x,filter,x.p);assert.equal(z.total,1);x.db.prepare("UPDATE users SET role='reception' WHERE id='professional'").run();assert.equal((await x.request(proofURL(z),x.p)).status,409);x.db.prepare("UPDATE users SET active=0 WHERE id='professional'").run();assert.equal((await x.request(own+'?'+new URLSearchParams(filter),x.p)).status,401);assert.equal(employeeResponsibilities(x.db,'store-a','professional',filter).total,1);
});
test('independent restore preserves each assigned task-state projection and immutable event prefixes with no old sessions',async t=>{
 const x=await setup(t,{seed:false,persist:true}),a=await newTask(x),b=await newTask(x),c=await newTask(x);await taskExecution(x,b.id,{blocked:true});await taskExecution(x,c.id);const user=x.db.prepare("SELECT * FROM users WHERE id='front'").get(),states=['all','awaiting','blocked','paused','running'],before=states.map(task_state=>myWork(x.db,user,{kind:'task',task_state})),events=x.db.prepare('SELECT * FROM task_events ORDER BY rowid').all(),backup=await createBackup(x.path,join(x.dir,'backup-assigned-states')),restored=await restoreBackup(backup.backup,join(x.dir,'restored-assigned-states')),db=openDatabase(restored.database);t.after(()=>db.close());for(const z of before){const v=myWork(db,user,z.filter);for(const k of ['filter','items','counts','matched_counts','date_counts','total','total_responsibilities'])assert.deepEqual(v[k],z[k],k);}assert.deepEqual(db.prepare('SELECT * FROM task_events ORDER BY rowid').all(),events);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
});
