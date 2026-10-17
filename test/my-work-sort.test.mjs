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

test('explicit original date directions place all known dates first and leave unknown tasks and preparation independently last',async t=>{
 const x=await setup(t,{seed:false});C.createContactCase(x.db,'store-a','one',contactInput('2030-01-03T12:00:00.000Z'),'manager','2026-01-01T00:00:00.000Z','late');C.createContactCase(x.db,'store-a','one',contactInput('2030-01-01T12:00:00.000Z'),'manager','2026-01-02T00:00:00.000Z','early');await newTask(x);P.appendScreeningProject(x.db,'store-a',null,{action:'record',title:'原准备未知日期',institution:'虚构机构',owner_id:'front',activity_note:'只保存原准备说明',authorization_status:'unknown',authorization_reference:null,authorization_note:'说明未知',record_reason:'明确原准备依据'},'manager');
 const a=await query(x,{sort:'date_asc'}),d=await query(x,{sort:'date_desc'}),u=await query(x);assert.deepEqual(a.items.slice(0,2).map(v=>v.id),['early','late']);assert.deepEqual(d.items.slice(0,2).map(v=>v.id),['late','early']);for(const z of [a,d]){assert.ok(z.items.slice(2).every(v=>v.due===null));assert.deepEqual(z.counts,u.counts);assert.deepEqual(z.date_counts,{recorded:2,not_recorded:2});}assert.equal(u.filter.sort,'updated');assert.deepEqual(u.items,employeeResponsibilities(x.db,'store-a','front').items);
});
test('same original day uses actual update order without treating day-only precision as an invented time or prioritizing hours',async t=>{
 const x=await setup(t,{seed:false});C.createContactCase(x.db,'store-a','one',contactInput('2030-01-02T23:00:00.000Z'),'manager','2026-01-01T00:00:00.000Z','same-old');C.createContactCase(x.db,'store-a','one',contactInput('2030-01-02T01:00:00.000Z'),'manager','2026-01-02T00:00:00.000Z','same-new');for(const sort of ['date_asc','date_desc']){const z=await query(x,{sort});assert.deepEqual(z.items.map(v=>v.id),['same-new','same-old']);assert.equal(z.items[0].due,'2030-01-02T01:00:00.000Z');assert.equal(z.items[1].due,'2030-01-02T23:00:00.000Z');}
});
test('complete sorted paging retains all 105 unique dated IDs and fixed unknown tail with source and order binding',async t=>{
 const x=await setup(t,{seed:false});for(let i=0;i<105;i++){const due=new Date(Date.UTC(2030,0,1+i,12)).toISOString();C.createContactCase(x.db,'store-a','one',contactInput(due),'manager','2026-01-01T00:00:00.000Z','dated-'+i);}await newTask(x);for(const sort of ['date_asc','date_desc']){const a=await query(x,{sort,limit:100});assert.equal(a.total,106);assert.equal(a.items[0].id,sort==='date_asc'?'dated-0':'dated-104');assert.equal(a.items[99].id,sort==='date_asc'?'dated-99':'dated-5');const b=await query(x,{...a.filter,offset:100,expected_source:a.source_token});assert.equal(b.items.length,6);assert.equal(b.items.at(-1).due,null);assert.equal(new Set([...a.items,...b.items].map(v=>v.key)).size,106);assert.equal(b.next_offset,null);assert.equal((await x.request(own+'?'+new URLSearchParams({...a.filter,sort:sort==='date_asc'?'date_desc':'date_asc',offset:100,expected_source:a.source_token}),x.f)).status,409);}
});
test('sort query is single and explicit, proofs reject changing the order even if the exact row set is identical',async t=>{
 const x=await setup(t,{seed:false});await newTask(x);const z=await query(x);for(const q of ['sort=priority','sort=date_asc&sort=date_desc','sort=due','sort=%00'])for(const p of [own,own+'/authorization'])assert.equal((await x.request(p+'?'+q,x.f)).status,422,q);for(const sort of ['date_asc','date_desc'])assert.equal((await x.request(own+'/authorization?'+new URLSearchParams({...z.filter,sort,expected_source:z.source_token}),x.f)).status,409);good(await x.request(proofURL(z),x.f));
});
test('date filtering and independent all-unknown role candidates preserve their own complete counts with each ordering',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-01T12:00:00.000Z');await contact(x,'2030-01-03T12:00:00.000Z');for(let i=0;i<3;i++)await newTask(x,{owner:null,role:'reception',title:'候选 '+i});const u=await query(x,{scope:'candidates'});for(const sort of ['updated','date_asc','date_desc']){const z=await query(x,{sort,date_from:'2030-01-02',date_to:'2030-01-03'});assert.equal(z.total,1);assert.equal(z.total_responsibilities,2);const c=await query(x,{scope:'candidates',sort,date_mode:'not_recorded'});assert.deepEqual(c.items,u.items);assert.equal(c.total,3);assert.deepEqual(c.date_counts,{recorded:0,not_recorded:3});assert.ok(c.items.every(v=>v.owner_id===null));}
});
test('explicit original date change invalidates old ordered source and moves its position without rewriting prior history',async t=>{
 const x=await setup(t,{seed:false}),a=await contact(x,'2030-01-01T12:00:00.000Z'),b=await contact(x,'2030-01-02T12:00:00.000Z'),z=await query(x,{sort:'date_asc'});assert.deepEqual(z.items.map(v=>v.id),[a.id,b.id]);const r=await x.request('/api/contacts/cases/'+a.id+'/events',{...x.m,method:'POST',data:{title:a.title,purpose_note:a.purpose_note,due_at:'2030-01-03T12:00:00.000Z',next_action:a.next_action,note:'明确原日期变更',reason:'虚构依据',action:'revise',expected_revision:a.revision,expected_sequence:C.contactSequence(x.db,'store-a')}});good(r,201);assert.equal((await x.request(proofURL(z),x.f)).status,409);assert.deepEqual((await query(x,{sort:'date_asc'})).items.map(v=>v.id),[b.id,a.id]);assert.equal(C.contactCase(x.db,a.id).history.at(-1).due_at,a.due_at);
});
test('ordered reads and matching proofs add no task, contact, audit, screening or other business writes',async t=>{
 const x=await setup(t,{seed:false});await contact(x,'2030-01-01T12:00:00.000Z');await newTask(x);const before=snapshot(x.db);for(const sort of ['updated','date_asc','date_desc'])for(const scope of ['mine','candidates']){const z=await query(x,{sort,scope});good(await x.request(proofURL(z),x.f));}assert.deepEqual(snapshot(x.db),before);
});
test('independent recovery retains exact ordered original roots, unknown tail, counts and filter, and clears old sessions',async t=>{
 const x=await setup(t,{seed:false,persist:true});await contact(x,'2030-01-01T12:00:00.000Z');await contact(x,'2030-01-03T12:00:00.000Z');await newTask(x);const u=x.db.prepare("SELECT * FROM users WHERE id='front'").get(),options={sort:'date_desc'},before=myWork(x.db,u,options),b=await createBackup(x.path,join(x.dir,'backup')),r=await restoreBackup(b.backup,join(x.dir,'restored')),db=openDatabase(r.database);t.after(()=>db.close());const after=myWork(db,u,options);for(const k of ['filter','items','counts','date_counts','total','total_responsibilities','candidate_task_count'])assert.deepEqual(after[k],before[k],k);assert.equal(after.items.at(-1).due,null);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
});
