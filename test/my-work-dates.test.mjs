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
test('date filters preserve actual six original dated business kinds and unchanged manager source projection',async t=>{
 const x=await setup(t),seen=new Set();for(const id of ['demo-manager','demo-front','demo-professional']){const u=x.db.prepare('SELECT * FROM users WHERE id=?').get(id),s=await x.login(id),all=await query(x,{limit:100},s),r=await query(x,{date_mode:'recorded',limit:100},s),n=await query(x,{date_mode:'not_recorded',limit:100},s);
  assert.deepEqual(all.items,employeeResponsibilities(x.db,'store-a',id,{limit:100}).items);assert.deepEqual(r.items,all.items.filter(v=>v.due!==null));assert.deepEqual(n.items,all.items.filter(v=>v.due===null));assert.equal(r.total+n.total,all.total);assert.deepEqual(r.counts,all.counts);assert.deepEqual(n.date_counts,all.date_counts);
  for(const v of r.items){seen.add(v.kind);assert.equal(v.due_source,v.kind==='appointment'?'starts_at':['contact','referral_contact'].includes(v.kind)?'due_at':'due_date');}
 }assert.deepEqual(seen,new Set(['processing','aftercare','review','contact','appointment','referral_contact']));
});
test('known contact time and appointment start use inclusive original UTC dates rather than event creation or local day',async t=>{
 const x=await setup(t,{seed:false}),c=await contact(x,'2026-10-13T23:59:59.999Z'),a=await x.request('/api/contacts/cases/'+c.id+'/appointments',{...x.m,method:'POST',data:{expected_case_revision:c.revision,expected_sequence:C.contactSequence(x.db,'store-a'),owner_id:'front',starts_at:'2026-10-14T00:00:00.000Z',ends_at:'2026-10-14T01:00:00.000Z',purpose_note:'原预约安排',place_note:'虚构店内',source_note:'实际原预约意向',note:'实际原安排',reason:'虚构依据'}});good(a,201);
 const d13=await query(x,{date_from:'2026-10-13',date_to:'2026-10-13'}),d14=await query(x,{date_from:'2026-10-14',date_to:'2026-10-14'});assert.deepEqual(d13.items.map(v=>v.kind),['contact']);assert.deepEqual(d14.items.map(v=>v.kind),['appointment']);assert.equal(d13.items[0].due,'2026-10-13T23:59:59.999Z');assert.equal(d14.items[0].due_source,'starts_at');
});
test('unknown original task and non-customer preparation dates never inherit recorded creation time',async t=>{
 const x=await setup(t,{seed:false});await newTask(x);P.appendScreeningProject(x.db,'store-a',null,{action:'record',title:'原准备未知日期',institution:'虚构机构',owner_id:'front',activity_note:'只保存原准备说明',authorization_status:'unknown',authorization_reference:null,authorization_note:'说明未知',record_reason:'明确原准备依据'},'manager');
 const z=await query(x,{date_mode:'not_recorded'});assert.equal(z.total,2);assert.deepEqual(z.date_counts,{recorded:0,not_recorded:2});assert.ok(z.items.every(v=>v.due===null&&v.due_source===null));assert.equal((await query(x,{date_from:new Date().toISOString().slice(0,10)})).total,0);assert.equal((await query(x,{date_mode:'recorded'})).total,0);
});
test('calendar validation rejects impossible dates, repeated or foreign fields and unknown date combined with interval',async t=>{
 const x=await setup(t,{seed:false});for(const q of ['date_mode=today','date_mode=all&date_mode=recorded','date_from=2026-02-29','date_to=2024-02-30','date_from=2026-4-1','date_from=2026-10-14&date_to=2026-10-13','date_mode=not_recorded&date_from=2026-10-13','date_mode=not_recorded&date_to=2026-10-13','date_from=2026-10-13&date_from=2026-10-13','date_to=2026-10-13T00:00:00.000Z','date_from=%00','timezone=Asia%2FShanghai']){assert.equal((await x.request(own+'?'+q,x.f)).status,422,q);assert.equal((await x.request(own+'/authorization?'+q,x.f)).status,422,q);}
 good(await x.request(own+'?date_from=2024-02-29&date_to=2024-02-29',x.f));good(await x.request(own+'?date_from=2400-02-29',x.f));good(await x.request(own+'?date_to=9999-12-31',x.f));
});
test('proof binds date mode and both interval endpoints, including explicit refresh for changed date filters',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-02T12:00:00.000Z');const z=await query(x,{date_mode:'recorded',date_from:'2030-01-01',date_to:'2030-01-03'});good(await x.request(proofURL(z),x.f));
 for(const extra of [{date_mode:'all'},{date_from:'2030-01-02'},{date_to:'2030-01-02'}]){const filter={...z.filter,...extra,expected_source:z.source_token};assert.equal((await x.request(own+'/authorization?'+new URLSearchParams(filter),x.f)).status,409);assert.equal((await x.request(own+'?'+new URLSearchParams({...filter,offset:1}),x.f)).status,409);}
});
test('one-sided interval and text/type filters retain full counts while unknown tasks stay outside dated matches',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-01T23:59:59.999Z','front','原%联系');await contact(x,'2030-01-02T00:00:00.000Z');await newTask(x);const all=await query(x),low=await query(x,{date_from:'2030-01-02'}),high=await query(x,{date_to:'2030-01-01'}),text=await query(x,{date_mode:'recorded',kind:'contact',q:'%'});
 assert.equal(all.total,3);for(const z of [low,high,text]){assert.equal(z.total,1);assert.deepEqual(z.counts,all.counts);assert.deepEqual(z.date_counts,{recorded:2,not_recorded:1});}assert.equal((await query(x,{kind:'task',date_mode:'recorded'})).total,0);
});
test('role candidates have independently unknown dates and date filtering never assigns them',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-02T12:00:00.000Z');await newTask(x,{owner:null,role:'reception'});const c=await query(x,{scope:'candidates',date_mode:'not_recorded'});assert.equal(c.total,1);assert.deepEqual(c.date_counts,{recorded:0,not_recorded:1});assert.equal(c.total_responsibilities,1);assert.equal(c.counts.contact,1);assert.equal(c.items[0].owner_id,null);
 assert.equal((await query(x,{scope:'candidates',date_mode:'recorded'})).total,0);assert.equal((await query(x,{scope:'candidates',date_to:'9999-12-31'})).total,0);assert.equal(x.db.prepare("SELECT assignee_id FROM work_tasks WHERE assignment_status='queued'").get().assignee_id,null);
});
test('complete dated paging returns all 105 original contacts with filter-bound sources and full unknown count',async t=>{
 const x=await setup(t,{seed:false});for(let i=0;i<105;i++)C.createContactCase(x.db,'store-a','one',contactInput('2030-01-02T12:00:00.000Z','front','原联系 '+i),'manager');await newTask(x);const a=await query(x,{date_mode:'recorded',date_from:'2030-01-02',date_to:'2030-01-02',limit:100});assert.equal(a.total,105);assert.deepEqual(a.date_counts,{recorded:105,not_recorded:1});assert.equal(a.total_responsibilities,106);
 const b=await query(x,{...a.filter,offset:100,expected_source:a.source_token});assert.equal(b.items.length,5);assert.equal(new Set([...a.items,...b.items].map(v=>v.key)).size,105);assert.equal(b.next_offset,null);assert.equal((await x.request(own+'?'+new URLSearchParams({...a.filter,date_from:'2030-01-01',offset:100,expected_source:a.source_token}),x.f)).status,409);
});
test('explicit original contact date revision invalidates old proof and moves only the filtered match',async t=>{
 const x=await setup(t,{seed:false}),c=await contact(x,'2030-01-02T12:00:00.000Z'),z=await query(x,{date_from:'2030-01-02',date_to:'2030-01-02'});const r=await x.request('/api/contacts/cases/'+c.id+'/events',{...x.m,method:'POST',data:{title:c.title,purpose_note:c.purpose_note,due_at:'2030-01-03T12:00:00.000Z',next_action:c.next_action,note:'明确原日期变更',reason:'虚构原依据',action:'revise',expected_revision:c.revision,expected_sequence:C.contactSequence(x.db,'store-a')}});good(r,201);assert.equal((await x.request(proofURL(z),x.f)).status,409);assert.equal((await query(x,z.filter)).total,0);const next=await query(x,{date_from:'2030-01-03',date_to:'2030-01-03'});assert.equal(next.total,1);assert.equal(next.items[0].revision,c.revision+1);assert.equal(C.contactCase(x.db,c.id).history.at(-1).due_at,c.due_at);
});
test('all original date filter reads and authorization proofs leave every business table unchanged',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-02T12:00:00.000Z');await newTask(x);const before=snapshot(x.db);for(const filter of [{},{date_mode:'recorded'},{date_mode:'not_recorded'},{date_from:'2030-01-01',date_to:'2030-01-03'},{scope:'candidates',date_mode:'not_recorded'}]){const z=await query(x,filter);good(await x.request(proofURL(z),x.f));}assert.deepEqual(snapshot(x.db),before);
});
test('current role, store and session gates apply equally to dated list and proof',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-02T12:00:00.000Z','professional');assert.equal((await query(x,{date_mode:'recorded'})).total,0);assert.equal((await query(x,{date_mode:'recorded'},x.o)).total,0);assert.equal((await x.request(own+'?date_mode=recorded',x.g)).status,403);const z=await query(x,{date_mode:'recorded'},x.p);x.db.prepare("UPDATE users SET role='reception' WHERE id='professional'").run();assert.equal((await x.request(proofURL(z),x.p)).status,409);x.db.prepare("DELETE FROM sessions WHERE user_id='professional'").run();assert.equal((await x.request(proofURL(z),x.p)).status,401);
});
test('independent restore retains exact original date fields, full counts, interval projection and revokes sessions',async t=>{
 const x=await setup(t,{seed:false,persist:true});await contact(x,'2030-01-02T12:00:00.000Z');await newTask(x);const u=x.db.prepare("SELECT * FROM users WHERE id='front'").get(),options={date_mode:'recorded',date_from:'2030-01-01',date_to:'2030-01-03'},before=myWork(x.db,u,options),b=await createBackup(x.path,join(x.dir,'backup')),r=await restoreBackup(b.backup,join(x.dir,'restored')),db=openDatabase(r.database);t.after(()=>db.close());const after=myWork(db,u,options);for(const k of ['filter','items','counts','date_counts','total','total_responsibilities','candidate_task_count'])assert.deepEqual(after[k],before[k],k);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
});
