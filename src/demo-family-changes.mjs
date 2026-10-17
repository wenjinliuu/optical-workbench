import {randomBytes} from 'node:crypto';
import {hashPassword} from './db.mjs';
import {createTrainingProject,createTrainingPlan,insertTrainingPlanEvent,trainingPlan} from './training.mjs';
import {createResource,createSlot,createBooking,bookingEvent} from './scheduling.mjs';
import {createRequest,requestEvent} from './family-requests.mjs';
import {createBookingPublication} from './family-bookings.mjs';
import {createOffer,offerAtomic} from './family-offers.mjs';
import {submitChange,executeChange} from './family-changes.mjs';

export function seedDemoFamilyChanges(db) {
  const zero={users:0,customers:0,resources:0,slots:0,bookings:0,publications:0,offers:0,changes:0,executions:0};
  if(!db.prepare("SELECT 1 FROM users WHERE id='demo-manager' AND store_id='store-a' AND role='manager' AND active=1").get()||!db.prepare("SELECT 1 FROM users WHERE id='demo-front' AND store_id='store-a' AND role='reception' AND active=1").get())return zero;
  if(db.prepare("SELECT 1 FROM customers WHERE id='demo-family-change-child'").get())return zero;
  return offerAtomic(db,()=>{
    const result={...zero},store='store-a',parent='demo-family-change-parent',professional='demo-family-change-professional',child='demo-family-change-child',other='demo-family-change-other',note={note:'独立虚构原预约变更安排',reason:'独立虚构明确原来源'};
    for(const [id,role,name,s] of [[parent,'guardian','原预约变更家长（独立虚构）',null],[professional,'professional','原预约变更专业登记员工（独立虚构）',store]])if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)){db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run(id,id,name,hashPassword(randomBytes(24).toString('base64url')),role,s);result.users++;}
    const project=createTrainingProject(db,store,{code:'FICTIONAL-FAMILY-CHANGE-059',name:'独立虚构预约变更项目',description:'仅流程展示',instructions:'非真实专业处方',status:'active',reason:note.reason},professional),plans={};
    for(const id of [child,other]){const at=new Date().toISOString(),cycle=id+'-cycle';db.prepare('INSERT INTO customers VALUES(?,?,?,?,?,?,?,?)').run(id,store,id===child?'原预约变更独立虚构客户':'原变更容量占用独立虚构客户',null,null,null,at,'demo-manager');db.prepare('INSERT INTO service_cycles VALUES(?,?,?,?,?,?,?)').run(cycle,id,'training','独立虚构预约变更需求','draft',at,'demo-manager');const p=createTrainingPlan(db,store,id,{cycle_id:cycle,cycle_version:1,visit_id:null,title:'独立虚构原变更计划',assessment:'虚构人工来源，非正式诊断',goals:'核对旧安排与新期望',owner_id:professional,source:'staff_record',source_note:'独立虚构',items:[{project_id:project.id,project_version:1,instructions:'独立虚构'}],document_version_ids:[],attachment_ids:[],...note},professional);insertTrainingPlanEvent(db,p.plan.id,{action:'confirm',...note},professional);plans[id]=trainingPlan(db,p.plan.id);result.customers++;}
    db.prepare('INSERT INTO guardian_links(user_id,customer_id,active) VALUES(?,?,1)').run(parent,child);
    const base={name:'独立虚构原变更资源',capacity:1,buffer_before:0,buffer_after:0,status:'active',source_note:'独立虚构实际容量',reason:note.reason};
    const staff=createResource(db,store,{...base,code:'FICTIONAL-FAMILY-059-STAFF',kind:'staff',user_id:professional},'demo-manager'),room=createResource(db,store,{...base,code:'FICTIONAL-FAMILY-059-ROOM',kind:'room',user_id:null},'demo-manager');result.resources=2;
    const day=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00.000Z')+30*86400000;
    for(const [n,stage] of ['leave-pending','move-pending','leave-done','move-done','promote-done','withdrawn','source-changed','full-target'].entries()){
      const makeSlot=d=>{const starts_at=new Date(day+d*86400000+12*3600000).toISOString();result.slots++;return createSlot(db,store,{kind:'one',capacity:1,starts_at,ends_at:new Date(Date.parse(starts_at)+3600000).toISOString(),resources_json:JSON.stringify([{id:staff.id,version:1},{id:room.id,version:1}].sort((a,b)=>a.id.localeCompare(b.id))),...note},'demo-front').slot;};
      const old=makeSlot(n*2),next=makeSlot(n*2+1),b=createBooking(db,store,child,plans[child],{slot_id:old.id,slot_revision:1,status:stage==='promote-done'?'waiting':'booked',...note},'demo-front').booking;result.bookings++;
      const q=createRequest(db,child,parent,{title:stage+' 原预约本人意向（独立虚构）',request_kind:'appointment',time_status:'recorded',requested_start:old.starts_at,requested_end:old.ends_at,request_note:'仅独立虚构原意向'}),p=createBookingPublication(db,q.id,b.id,{public_note:stage+' 原实际预约（独立虚构）',reason:note.reason},'demo-front');result.publications++;
      const move=['move-pending','move-done','promote-done','full-target'].includes(stage),target=stage==='promote-done'?old:next,o=move?createOffer(db,child,parent,plans[child].id,target.id,{public_note:stage+' 明确开放原目标（独立虚构）',reason:note.reason},'demo-manager'):null;if(o)result.offers++;
      const c=submitChange(db,p.id,parent,{kind:move?'move':'leave',offer_id:o?.id||null,title:stage+' 本人变更意向（独立虚构）',request_note:'独立虚构明确意向，提交不会自动批准'});result.changes++;
      if(['leave-done','move-done','promote-done'].includes(stage)){executeChange(db,c.request_id,{action:stage==='leave-done'?'leave':stage==='move-done'?'move':'promote',...note,public_note:stage+' 实际办理结果（独立虚构）'},'demo-front');result.executions++;result.publications++;}
      if(stage==='withdrawn')requestEvent(db,c.request_id,{action:'withdraw',public_note:'本人明确撤回（独立虚构）'},parent);
      if(stage==='source-changed')bookingEvent(db,b.id,{action:'cancel',...note},'demo-front');
      if(stage==='full-target'){createBooking(db,store,other,plans[other],{slot_id:target.id,slot_revision:1,status:'booked',...note},'demo-front');result.bookings++;}
    }
    return result;
  });
}
