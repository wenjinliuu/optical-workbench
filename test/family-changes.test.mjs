import * as demo from '../src/demo-data.mjs';
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
import {inventoryTables,stockBalance,orderInventory,verifyInventory,insertStockEvent} from '../src/inventory.mjs';
import {paymentTables,orderPayments,verifyPayments,insertPayment} from '../src/payments.mjs';
async function fixture(t,{persist=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'optical-stock-')),path=persist?join(dir,'source.sqlite'):':memory:',{server,db}=createApp({databasePath:path,mode:'test',logger:()=>{}});db.exec("INSERT INTO stores VALUES ('a','A'),('b','B')");for(const [id,role,store] of [['manager','manager','a'],['front','reception','a'],['professional','professional','a'],['other','manager','b'],['parent','guardian',null]])db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run(id,id,id,hashPassword('synthetic-only-password'),role,store);for(const [id,store] of [['one','a'],['two','a'],['other-child','b']])db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run(id,store,id,null,null,null,new Date().toISOString(),store==='a'?'manager':'other');db.prepare('INSERT INTO guardian_links (user_id,customer_id,active) VALUES (?,?,1)').run('parent','one');server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
 const request=async(path,{cookie,csrf,method='GET',data,key=crypto.randomUUID(),headers={}}={})=>{const r=await fetch(origin+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(method!=='GET'?{'Idempotency-Key':key}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};const login=async id=>{const r=await request('/api/auth/login',{method:'POST',data:{username:id,password:'synthetic-only-password'}});assert.equal(r.status,200);const me=await request('/api/me',{cookie:r.cookie});return {cookie:r.cookie,csrf:me.body.csrf};};return {db,request,login,origin,path,dir};
}
import {scheduleSequence,scheduleResource,scheduleSlot,scheduleBooking,schedulingTables,createResource,resourceVersion,createSlot,slotEvent,createBooking,bookingEvent} from '../src/scheduling.mjs';
import {verifyScheduling} from '../src/scheduling-recovery.mjs';
import {createTrainingProject,createTrainingPlan,insertTrainingPlanEvent,trainingPlan,insertTrainingPlanVersion} from '../src/training.mjs';
const resource=(extra={})=>({code:'SYNTHETIC-'+crypto.randomUUID(),kind:'room',user_id:null,name:'明确资源（虚构）',capacity:2,buffer_before:0,buffer_after:0,status:'active',source_note:'明确人工容量与准备收尾来源（虚构）',reason:'明确依据',...extra});
const note={note:'明确本次安排（虚构）',reason:'明确操作依据'};
async function setup(t,{persist=false}={}){const x=await fixture(t,{persist});x.m=await x.login('manager');x.f=await x.login('front');x.pro=await x.login('professional');x.plans={};for(const id of ['one','two']){const c=(await x.request('/api/customers/'+id+'/cycles',{...x.m,method:'POST',data:{type:'training',goal:'虚构计划需求'}})).body.cycle;let pr=x.db.prepare('SELECT id FROM training_projects LIMIT 1').get();if(!pr)pr=createTrainingProject(x.db,'a',{code:'SYNTHETIC-PROJECT',name:'虚构项目',description:'虚构',instructions:'人工明确',status:'active',reason:'虚构依据'},'professional');const p=createTrainingPlan(x.db,'a',id,{cycle_id:c.id,cycle_version:1,visit_id:null,title:'明确个人计划（虚构）',assessment:'人工明确来源',goals:'虚构目标',owner_id:'professional',source:'staff_record',source_note:'虚构依据',items:[{project_id:pr.id,project_version:1,instructions:'明确安排'}],document_version_ids:[],attachment_ids:[],...note},'professional');insertTrainingPlanEvent(x.db,p.plan.id,{action:'confirm',...note},'professional');x.plans[id]=trainingPlan(x.db,p.plan.id);}x.staff=(await write(x,'/api/scheduling/resources',resource({kind:'staff',user_id:'professional',name:'员工资源'}))).body.resource;x.room=(await write(x,'/api/scheduling/resources',resource({name:'房间'}))).body.resource;x.eq=(await write(x,'/api/scheduling/resources',resource({kind:'equipment',name:'设备'}))).body.resource;return x;}
async function write(x,path,data,who=x.m,key){return x.request(path,{...who,method:'POST',key,data:{expected_sequence:scheduleSequence(x.db,'a'),...data}});}
function slotInput(x,extra={}){return {kind:'one',capacity:1,starts_at:'2030-01-01T10:00:00.000Z',ends_at:'2030-01-01T11:00:00.000Z',resources:[x.staff,x.room,x.eq].map(r=>({id:r.id,version:r.version})),...note,...extra};}
async function slot(x,extra={}){const r=await write(x,'/api/scheduling/slots',slotInput(x,extra),x.f);assert.equal(r.status,201,JSON.stringify(r.body));return r.body.slot;}
async function book(x,s,child='one',status='booked',extra={},who=x.f,key){const p=trainingPlan(x.db,x.plans[child].id);return write(x,'/api/customers/'+child+'/scheduling',{plan_id:p.id,plan_version:p.current_version,expected_plan_revision:p.revision,slot_id:s.id,slot_revision:s.revision,status,...note,...extra},who,key);}
async function event(x,b,action,extra={},who=x.f,key){const now=scheduleBooking(x.db,b.id),p=trainingPlan(x.db,now.plan_id);return write(x,'/api/scheduling/bookings/'+b.id+'/events',{action,expected_revision:now.revision,...(!['cancel','leave'].includes(action)?{expected_plan_revision:p.revision}:{}),...note,...extra},who,key);}
const all=db=>Object.fromEntries(schedulingTables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
function tamper(db,t,sql){const trig=db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(t+'_no_update').sql;db.exec('DROP TRIGGER '+t+'_no_update');db.exec(sql);db.exec(trig);}

import * as C from '../src/family-changes.mjs';
import * as B from '../src/family-bookings.mjs';
import * as F from '../src/family-offers.mjs';
import {createRequest,requestRecord,requestEvent} from '../src/family-requests.mjs';
import {verifyFamilyChanges} from '../src/family-changes-recovery.mjs';
import {seedDemoFamilyChanges} from '../src/demo-family-changes.mjs';
const privateNote='内部采用依据绝不能进入家庭响应';
async function prepared(t,{waiting=false,persist=false}={}) {
 const x=await setup(t,{persist});x.parent=await x.login('parent');
 x.old=await slot(x);x.target=await slot(x,{starts_at:'2030-01-02T10:00:00.000Z',ends_at:'2030-01-02T11:00:00.000Z'});
 x.booking=(await book(x,x.old,'one',waiting?'waiting':'booked')).body.booking;
 x.original=createRequest(x.db,'one','parent',{title:'原本人意向',request_kind:'appointment',time_status:'recorded',requested_start:x.old.starts_at,requested_end:x.old.ends_at,request_note:'原本人说明'});
 x.publication=B.createBookingPublication(x.db,x.original.id,x.booking.id,{public_note:'已公开原预约',reason:privateNote},'front');
 x.offer=F.createOffer(x.db,'one','parent',x.plans.one.id,x.target.id,{public_note:'目标原时段',reason:privateNote},'front');return x;
}
const context=(x,kind='leave',offer=null)=>C.changeContext(x.db,x.publication.id,'parent',kind,offer?.id||null);
async function submit(x,kind='leave',offer=null,key=crypto.randomUUID()) {
 const data={expected_source:context(x,kind,offer).source_token,kind,offer_id:offer?.id||null,title:'本人原预约变更',request_note:'本人明确说明'};
 const response=await x.request('/api/family-changes/publications/'+x.publication.id+'/request',{...x.parent,method:'POST',data,key});return {...response,data,key};
}
async function execute(x,q,action='leave',extra={},key=crypto.randomUUID()) {
 const c=C.executionContext(x.db,q,action),data={expected_source:c.source_token,action,note:'明确实际排期说明',reason:privateNote,public_note:'明确公开本次实际结果',...extra};
 const r=await x.request('/api/family-changes/requests/'+q+'/execute',{...x.f,method:'POST',data,key});return {...r,data,key};
}
test('family leave intent fixes the published booking and does not cancel or reserve anything',async t=>{
 const x=await prepared(t),before=all(x.db),r=await submit(x);assert.equal(r.status,201,JSON.stringify(r.body));assert.deepEqual(all(x.db),before);
 assert.equal(r.body.record.original.revision,1);assert.equal(r.body.record.execution,null);assert.equal(requestRecord(x.db,r.body.record.request_id).request_kind,'leave');
 assert.ok(!JSON.stringify(r.body).includes(privateNote));assert.ok(!JSON.stringify(r.body).includes('resources_json'));verifyFamilyChanges(x.db);
});
test('explicit staff leave writes exactly one original event and a separate published result; replay preserves it',async t=>{
 const x=await prepared(t),r=await submit(x),q=r.body.record.request_id,a=await execute(x,q);assert.equal(a.status,201,JSON.stringify(a.body));
 assert.equal(scheduleBooking(x.db,x.booking.id).history[0].action,'leave');assert.equal(scheduleBooking(x.db,x.booking.id).revision,2);assert.equal(B.bookingRecord(x.db,x.publication.id).booking.status,'booked');
 const again=await x.request('/api/family-changes/requests/'+q+'/execute',{...x.f,method:'POST',data:a.data,key:a.key});assert.equal(again.status,201);assert.deepEqual(again.body,a.body);assert.equal(scheduleBooking(x.db,x.booking.id).revision,2);
 const family=await x.request('/api/family-changes/requests/'+q,x.parent);assert.equal(family.status,200);assert.equal(family.body.record.execution.action,'leave');assert.equal(family.body.record.execution.publication.booking.action,'leave');assert.ok(!JSON.stringify(family.body).includes(privateNote));verifyScheduling(x.db);verifyFamilyChanges(x.db);
});
test('single-customer move preserves identity and captures old and new intervals',async t=>{
 const x=await prepared(t),r=await submit(x,'move',x.offer);assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(scheduleBooking(x.db,x.booking.id).slot_id,x.old.id);
 const a=await execute(x,r.body.record.request_id,'move');assert.equal(a.status,201,JSON.stringify(a.body));const b=scheduleBooking(x.db,x.booking.id);assert.equal(b.id,x.booking.id);assert.equal(b.slot_id,x.target.id);assert.equal(b.status,'booked');assert.equal(b.plan_version,x.booking.plan_version);assert.equal(B.bookingRecord(x.db,x.publication.id).booking.slot_id,x.old.id);verifyScheduling(x.db);verifyFamilyChanges(x.db);
});
test('same-slot waiting adjustment requires explicit promote with current capacity',async t=>{
 const x=await prepared(t,{waiting:true}),o=F.createOffer(x.db,'one','parent',x.plans.one.id,x.old.id,{public_note:'明确原候补时段',reason:privateNote},'front');
 const r=await submit(x,'move',o);assert.equal(r.status,201,JSON.stringify(r.body));assert.equal((await execute(x,r.body.record.request_id,'move')).status,409);
 const occupied=(await book(x,x.old,'two')).body.booking;assert.equal((await execute(x,r.body.record.request_id,'promote')).status,409);assert.equal(scheduleBooking(x.db,x.booking.id).status,'waiting');await event(x,occupied,'cancel');
 const a=await execute(x,r.body.record.request_id,'promote');assert.equal(a.status,201,JSON.stringify(a.body));assert.equal(scheduleBooking(x.db,x.booking.id).status,'booked');verifyScheduling(x.db);verifyFamilyChanges(x.db);
});
test('full target preserves intention and refuses actual move until staff rechecks capacity',async t=>{
 const x=await prepared(t),r=await submit(x,'move',x.offer);await book(x,x.target,'two');
 const q=r.body.record.request_id,a=await execute(x,q,'move');assert.equal(a.status,409);assert.equal(C.executionContext(x.db,q,'move').problem.code,'SCHEDULE_CAPACITY');assert.equal(scheduleBooking(x.db,x.booking.id).slot_id,x.old.id);assert.equal(C.changeRecord(x.db,q).execution,null);
});
test('old target source cannot be executed after resource or original plan revision changes',async t=>{
 const x=await prepared(t),r=await submit(x,'move',x.offer);resourceVersion(x.db,x.room.id,{...resource(),name:'修改明确容量'},'manager');assert.equal((await execute(x,r.body.record.request_id,'move')).status,409);
});
test('leave remains available for a booked original even when the plan is suspended',async t=>{
 const x=await prepared(t),r=await submit(x);insertTrainingPlanEvent(x.db,x.plans.one.id,{action:'pause',...note},'professional');assert.equal((await execute(x,r.body.record.request_id)).status,201);verifyFamilyChanges(x.db);
});
test('independent original booking changes reject stale family intent without overwriting it',async t=>{
 const x=await prepared(t),r=await submit(x);await event(x,x.booking,'cancel');const a=await execute(x,r.body.record.request_id);assert.equal(a.status,409);assert.equal(C.changeRecord(x.db,r.body.record.request_id).execution,null);verifyFamilyChanges(x.db);
});
test('concurrent duplicate previews create only one active intention across publication roots',async t=>{
 const x=await prepared(t),c=context(x),data={expected_source:c.source_token,kind:'leave',title:'明确本人请假',request_note:'本人说明'},path='/api/family-changes/publications/'+x.publication.id+'/request';
 const rs=await Promise.all([x.request(path,{...x.parent,method:'POST',data}),x.request(path,{...x.parent,method:'POST',data})]);assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);assert.equal(x.db.prepare('SELECT count(*) n FROM family_booking_changes').get().n,1);
 const other=B.createBookingPublication(x.db,x.original.id,x.booking.id,{public_note:'另一原公开根',reason:privateNote},'manager');assert.equal(C.changeContext(x.db,other.id,'parent','leave').problem.code,'FAMILY_CHANGE_DUPLICATE');verifyFamilyChanges(x.db);
});
test('same-key submit replays once and withdrawal permits a new explicit intention',async t=>{
 const x=await prepared(t),r=await submit(x),path='/api/family-changes/publications/'+x.publication.id+'/request';
 const replay=await x.request(path,{...x.parent,method:'POST',data:r.data,key:r.key});assert.equal(replay.status,201);assert.deepEqual(replay.body,r.body);
 requestEvent(x.db,r.body.record.request_id,{action:'withdraw',public_note:'本人撤回旧意向'},'parent');assert.equal((await execute(x,r.body.record.request_id)).status,409);assert.equal((await x.request(path,{...x.parent,method:'POST',data:r.data,key:r.key})).status,409);assert.equal((await submit(x)).status,201);verifyFamilyChanges(x.db);
});
test('revocation denies family reads and actual execution including cached results',async t=>{
 const x=await prepared(t),r=await submit(x),q=r.body.record.request_id,a=await execute(x,q);assert.equal(a.status,201);x.db.prepare("UPDATE guardian_links SET active=0 WHERE user_id='parent'").run();
 assert.equal((await x.request('/api/family-changes/requests/'+q,x.parent)).status,404);assert.equal((await x.request('/api/family-changes/requests/'+q+'/execute',{...x.f,method:'POST',data:a.data,key:a.key})).status,409);verifyFamilyChanges(x.db);
});
test('other guardian, other store and professional cannot read or execute the original intention',async t=>{
 const x=await prepared(t),r=await submit(x),q=r.body.record.request_id;x.db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('parent2','parent2','另一本人',hashPassword('synthetic-only-password'),'guardian',null);x.db.prepare("INSERT INTO guardian_links(user_id,customer_id,active) VALUES('parent2','one',1)").run();
 const parent2=await x.login('parent2'),other=await x.login('other');for(const who of [parent2,other])assert.equal((await x.request('/api/family-changes/requests/'+q,who)).status,404);assert.equal((await x.request('/api/family-changes/requests/'+q,x.pro)).status,403);assert.equal((await x.request('/api/family-changes/requests/'+q+'/execute',{...x.parent,method:'POST',data:{}})).status,403);
});
test('a different customer or plan offer never leaks its internal source to the family',async t=>{
 const x=await prepared(t);x.db.prepare("INSERT INTO guardian_links(user_id,customer_id,active) VALUES('parent','two',1)").run();const o=F.createOffer(x.db,'two','parent',x.plans.two.id,x.target.id,{public_note:'另一客户开放',reason:privateNote},'front');
 const r=await x.request('/api/family-changes/publications/'+x.publication.id+'/context?kind=move&offer_id='+o.id,x.parent);assert.equal(r.status,200);assert.equal(r.body.target,null);assert.equal(r.body.problem.code,'FAMILY_CHANGE_TARGET');assert.ok(!JSON.stringify(r.body).includes('plan_id'));assert.equal((await submit(x,'move',o)).status,409);
});
test('query/body strictness and stale adoption proofs reject invalid or late content',async t=>{
 const x=await prepared(t),r=await submit(x),q=r.body.record.request_id,read=await x.request('/api/family-changes/requests/'+q,x.parent);
 assert.equal((await x.request('/api/family-changes/publications/'+x.publication.id+'/context?kind=leave&kind=move',x.parent)).status,422);
 const c=context(x);assert.equal((await x.request('/api/family-changes/publications/'+x.publication.id+'/request',{...x.parent,method:'POST',data:{expected_source:c.source_token,kind:'leave',title:'标题',request_note:'说明',approved:true}})).status,422);
 requestEvent(x.db,q,{action:'respond',public_note:'明确公开回复',internal_reason:privateNote},'front');assert.equal((await x.request('/api/family-changes/requests/'+q+'/authorization?expected_source='+read.body.adoption_source,x.parent)).status,200);
 await execute(x,q);assert.equal((await x.request('/api/family-changes/requests/'+q+'/authorization?expected_source='+read.body.adoption_source,x.parent)).status,409);
 const plain=await x.request('/api/family-changes/requests/'+x.original.id,x.parent);assert.equal(plain.status,200);assert.equal(plain.body.record,null);
});
test('audit failure rolls back the actual booking, result publication and execution atomically',async t=>{
 const x=await prepared(t),r=await submit(x),before=all(x.db),publications=x.db.prepare('SELECT count(*) n FROM family_booking_roots').get().n;
 x.db.exec("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic audit failure');END");assert.equal((await execute(x,r.body.record.request_id)).status,500);assert.deepEqual(all(x.db),before);assert.equal(x.db.prepare('SELECT count(*) n FROM family_booking_roots').get().n,publications);assert.equal(C.changeRecord(x.db,r.body.record.request_id).execution,null);
});
test('immutable native references reject tampering and recovery detects bypassed snapshot corruption',async t=>{
 const x=await prepared(t),r=await submit(x),q=r.body.record.request_id,c=C.changeRecord(x.db,q);assert.throws(()=>x.db.prepare('UPDATE family_booking_changes SET kind=? WHERE id=?').run('move',c.id),/immutable/);
 x.db.exec('DROP TRIGGER family_changes_no_update');x.db.prepare('UPDATE family_booking_changes SET booking_snapshot_json=? WHERE id=?').run(JSON.stringify({...c.booking,revision:999}),c.id);assert.throws(()=>verifyFamilyChanges(x.db),/恢复核对失败/);
});
test('native source trigger rejects a duplicate or unrelated guardian link without API guards',async t=>{
 const x=await prepared(t),r=await submit(x);assert.throws(()=>C.submitChange(x.db,x.publication.id,'parent',{kind:'leave',title:'重复',request_note:'重复'}),/current original source/);
 const c=C.changeRecord(x.db,r.body.record.request_id),cols=Object.keys(x.db.prepare('SELECT * FROM family_booking_changes WHERE id=?').get(c.id));const original=x.db.prepare('SELECT * FROM family_booking_changes WHERE id=?').get(c.id),row={...original,id:crypto.randomUUID(),recipient_id:'professional'};assert.throws(()=>x.db.prepare('INSERT INTO family_booking_changes('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...cols.map(k=>row[k])),/fixed named original/);
});
test('new fixed changes enter the scoped customer timeline and survive complete independent recovery',async t=>{
 const x=await prepared(t,{persist:true}),r=await submit(x,'move',x.offer);assert.equal((await execute(x,r.body.record.request_id,'move')).status,201);
 const timeline=await x.request('/api/customers/one/timeline?kind=family_change',x.m);assert.equal(timeline.status,200,JSON.stringify(timeline.body));assert.equal(timeline.body.items.length,1);assert.equal((await x.request('/api/customers/one/timeline?kind=family_change',x.pro)).status,403);
 const backup=await createBackup(x.path,join(x.dir,'backups')),restored=await restoreBackup(backup.backup,join(x.dir,'restored'));const db=openDatabase(restored.database);try{verifyFamilyChanges(db);assert.equal(db.prepare('SELECT count(*) n FROM family_booking_changes').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM family_booking_change_executions').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);}finally{db.close();}
});
test('eight independent synthetic stages seed once, preserve prior facts and recover all original sources',async t=>{
 const x=await fixture(t);x.db.exec("INSERT INTO stores VALUES('store-a','虚构门店')");for(const [id,role] of [['demo-manager','manager'],['demo-front','reception']])x.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run(id,id,id,hashPassword('synthetic-only-password'),role,'store-a');
 const r=seedDemoFamilyChanges(x.db);assert.equal(r.changes,8);assert.equal(r.executions,3);assert.equal(r.publications,11);verifyScheduling(x.db);verifyFamilyChanges(x.db);
 const before=all(x.db);assert.ok(Object.values(seedDemoFamilyChanges(x.db)).every(n=>n===0));assert.deepEqual(all(x.db),before);
});
test('request bodies that finish after family revocation or staff security revision never write',async t=>{
 const x=await prepared(t),i={expected_source:context(x).source_token,kind:'leave',title:'本人迟到提交',request_note:'说明'};
 const late=async(path,data,who,change)=>{const raw=JSON.stringify(data);return new Promise((resolve,reject)=>{const req=httpRequest(x.origin+path,{method:'POST',headers:{Cookie:who.cookie,'X-CSRF-Token':who.csrf,'Idempotency-Key':crypto.randomUUID(),'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)}},res=>{let out='';res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(out)}));});req.on('error',reject);req.write(raw.slice(0,10));setTimeout(()=>{change();req.end(raw.slice(10));},50);});};
 const denied=await late('/api/family-changes/publications/'+x.publication.id+'/request',i,x.parent,()=>x.db.prepare("UPDATE guardian_links SET active=0 WHERE user_id='parent'").run());assert.equal(denied.status,404);assert.equal(x.db.prepare('SELECT count(*) n FROM family_booking_changes').get().n,0);
 x.db.prepare("UPDATE guardian_links SET active=1 WHERE user_id='parent'").run();const r=await submit(x),q=r.body.record.request_id,c=C.executionContext(x.db,q,'leave'),before=all(x.db);
 const staff=await late('/api/family-changes/requests/'+q+'/execute',{expected_source:c.source_token,action:'leave',note:'说明',reason:'内部依据',public_note:'公开结果'},x.f,()=>x.db.prepare("INSERT INTO user_security(user_id,revision) VALUES('front',2) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1").run());assert.equal(staff.status,401);assert.deepEqual(all(x.db),before);assert.equal(C.changeRecord(x.db,q).execution,null);
});



