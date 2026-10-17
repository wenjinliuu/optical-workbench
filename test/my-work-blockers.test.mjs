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

async function action(x,id,act,reason='明确原事实（虚构）',session=x.f){const t=x.db.prepare('SELECT revision FROM work_tasks WHERE id=?').get(id),r=await x.request('/api/tasks/'+id+'/'+act,{...session,method:'POST',data:{expected_revision:t.revision,reason}});good(r);return r.body.task;}
async function blocked(x,{owner='front',role=null,title='原阻塞原因任务',reason='待核对原资料（虚构）'}={}){const t=await newTask(x,{owner,role,title});return action(x,t.id,'block',reason,x.m);}
test('blocker metadata comes from the current exact original task revision and is absent on normal and other business duties',async t=>{
 const x=await setup(t,{seed:false}),reason='<img src=x onerror="window.blockerXSS=1">'+" 原依据 O'Reilly（虚构）",t1=await blocked(x,{reason});await newTask(x,{title:'普通原任务'});await contact(x,'2030-01-02T12:00:00.000Z');project(x);const z=await query(x);assert.equal(z.total,4);const r=z.items.find(v=>v.id===t1.id);assert.equal(r.task_blocker_reason,reason);assert.equal(r.task_blocker_revision,t1.revision);assert.equal(r.revision,t1.revision);for(const n of z.items.filter(v=>v.id!==t1.id)){assert.equal(n.task_blocker_reason,null);assert.equal(n.task_blocker_revision,null);}assert.deepEqual(z.items,employeeResponsibilities(x.db,'store-a','front').items);
});
test('role candidates expose only actual same-role blocked original facts without assignment or unrelated owner metadata',async t=>{
 const x=await setup(t,{seed:false}),t1=await blocked(x,{owner:null,role:'reception',title:'候选原阻塞'});await blocked(x,{owner:null,role:'professional',title:'他岗原阻塞'});await blocked(x,{owner:'professional',title:'他人原阻塞'});const before=snapshot(x.db),z=await query(x,{scope:'candidates',kind:'task',task_state:'blocked'});assert.equal(z.total,1);assert.equal(z.items[0].id,t1.id);assert.equal(z.items[0].task_blocker_reason,t1.exception_reason);assert.equal(z.items[0].task_blocker_revision,t1.revision);assert.equal(z.items[0].owner_id,null);assert.equal((await query(x,{kind:'task',task_state:'blocked'})).total,0);assert.equal((await query(x,{kind:'task',task_state:'blocked'},x.o)).total,0);assert.equal((await x.request(own,x.g)).status,403);good(await x.request(proofURL(z),x.f));assert.deepEqual(snapshot(x.db),before);
});
test('complete blocked paging keeps all 105 current reasons and revisions with full counts and source-bound zero-write reads',async t=>{
 const x=await setup(t,{seed:false});for(let i=0;i<105;i++)await blocked(x,{title:'原原因分页 '+i,reason:'原依据 '+i});const before=snapshot(x.db),a=await query(x,{kind:'task',task_state:'blocked',limit:100}),b=await query(x,{...a.filter,offset:100,expected_source:a.source_token});assert.equal(a.total,105);assert.equal(b.items.length,5);assert.deepEqual(b.matched_counts,a.matched_counts);assert.equal(new Set([...a.items,...b.items].map(v=>v.key)).size,105);for(const r of [...a.items,...b.items]){assert.equal(r.task_blocker_revision,r.revision);assert.equal(r.task_blocker_reason,x.db.prepare('SELECT exception_reason FROM work_tasks WHERE id=?').get(r.id).exception_reason);}good(await x.request(proofURL(a),x.f));assert.deepEqual(snapshot(x.db),before);
});
test('explicit unblock and later reblock remove or replace only current reason and reject old proof while retaining immutable earlier reasons',async t=>{
 const x=await setup(t,{seed:false}),t1=await blocked(x,{reason:'旧原依据'}),before=await query(x,{kind:'task'});await action(x,t1.id,'unblock','明确解除原阻塞');assert.equal((await x.request(proofURL(before),x.f)).status,409);const cleared=await query(x,{kind:'task'});assert.equal(cleared.items[0].task_blocker_reason,null);assert.equal(cleared.items[0].task_blocker_revision,null);await action(x,t1.id,'block','后来原依据');const after=await query(x,{kind:'task',task_state:'blocked'});assert.equal(after.items[0].task_blocker_reason,'后来原依据');assert.equal(after.items[0].task_blocker_revision,4);assert.equal(x.db.prepare('SELECT reason FROM task_events WHERE task_id=? AND revision=2').get(t1.id).reason,'旧原依据');await action(x,t1.id,'cancel');assert.equal((await query(x,{kind:'task'})).total,0);assert.equal(x.db.prepare('SELECT count(*) n FROM task_events WHERE task_id=?').get(t1.id).n,5);
});
test('independent restore preserves own and candidate current blocker metadata and original event history with old sessions revoked',async t=>{
 const x=await setup(t,{seed:false,persist:true});await blocked(x,{reason:'本人原依据'});await blocked(x,{owner:null,role:'reception',reason:'岗位候选原依据'});const u=x.db.prepare("SELECT * FROM users WHERE id='front'").get(),options=[{kind:'task',task_state:'blocked'},{scope:'candidates',kind:'task',task_state:'blocked'}],before=options.map(v=>myWork(x.db,u,v)),events=x.db.prepare('SELECT * FROM task_events ORDER BY rowid').all(),backup=await createBackup(x.path,join(x.dir,'backup-blockers')),restore=await restoreBackup(backup.backup,join(x.dir,'restored-blockers')),db=openDatabase(restore.database);t.after(()=>db.close());for(let i=0;i<options.length;i++){const z=myWork(db,u,options[i]);for(const k of ['items','filter','counts','matched_counts','total','total_responsibilities'])assert.deepEqual(z[k],before[i][k],k);}assert.deepEqual(db.prepare('SELECT * FROM task_events ORDER BY rowid').all(),events);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
});
