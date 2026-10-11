import {randomUUID} from 'node:crypto';
import {requestSource,requestRecord,createRequest,requestSequence} from './family-requests.mjs';
import {bookingRecord,bookingSource,bookingSequence,createBookingPublication,familyBooking} from './family-bookings.mjs';
import {offerRecord,offerAtomic,offerSequence} from './family-offers.mjs';
import {shareHash} from './family-progress.mjs';
import {scheduleSequence,scheduleState,bookingProblem,bookingEvent} from './scheduling.mjs';
import {trainingPlan} from './training.mjs';

export const familyChangeTables=['family_booking_changes','family_booking_change_executions'];
const put=(db,table,row)=>db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
const problem=(code,message)=>({code,message});
export function changeContext(db,publication,recipient,kind,offerId=null) {
  const p=bookingRecord(db,publication,{limit:1});
  if(!p||p.request.recipient_id!==recipient||!requestSource(db,recipient,p.request.customer_id))return null;
  const b=p.booking,o=offerId?offerRecord(db,offerId,{limit:1}):null;
  let issue=p.status!=='published'||!p.source_current?problem('FAMILY_CHANGE_SOURCE','原公开或实际预约已有变化，请与门店核对'):b.status==='cancelled'?problem('FAMILY_CHANGE_STATE','原预约已经结束，不能提交新的变更意向'):kind==='leave'&&b.status!=='booked'?problem('FAMILY_CHANGE_STATE','当次请假须选择原正式预约'):null;
  if(kind==='move'&&(!o||o.recipient_id!==recipient||o.customer_id!==b.customer_id||o.plan_id!==b.plan_id||o.source.plan_version!==b.plan_version||o.status!=='published'||!o.source_current))issue=problem('FAMILY_CHANGE_TARGET','请明确选择同本人、同客户、同原计划版本的当前开放时段');
  if(kind==='move'&&o?.slot_id===b.slot_id&&b.status!=='waiting')issue=problem('FAMILY_CHANGE_TARGET','正式预约调课须选择其他开放时段');
  const pending=db.prepare("SELECT c.id FROM family_booking_changes c JOIN family_request_current q ON q.root_id=c.request_id WHERE c.booking_id=? AND c.recipient_id=? AND q.status NOT IN('withdrawn','closed') AND NOT EXISTS(SELECT 1 FROM family_booking_change_executions e WHERE e.change_id=c.id)").all(b.booking_id,recipient);
  if(pending.length)issue=problem('FAMILY_CHANGE_DUPLICATE','本人已有该原预约的待办理变更意向，请读取或撤回原申请');
  return {publication:p,offer:o,problem:issue,source_token:shareHash({publication:p.source_token,offer:o?.source_token||null,kind,pending,requestSequence:requestSequence(db,b.store_id)})};
}
export function submitChange(db,publication,recipient,i,at=new Date().toISOString()) {
  return offerAtomic(db,()=>{
    const c=changeContext(db,publication,recipient,i.kind,i.offer_id);
    if(!c||c.problem)throw Error('family booking change current original source');
    const b=c.publication.booking,t=c.offer?.source,q=createRequest(db,b.customer_id,recipient,{title:i.title,request_kind:i.kind==='leave'?'leave':'appointment',time_status:'recorded',requested_start:t?.starts_at||b.starts_at,requested_end:t?.ends_at||b.ends_at,request_note:i.request_note},at);
    const row={id:randomUUID(),request_id:q.id,store_id:b.store_id,customer_id:b.customer_id,recipient_id:recipient,booking_id:b.booking_id,publication_id:publication,publication_version_id:c.publication.version_id,kind:i.kind,booking_snapshot_json:JSON.stringify(b),offer_id:c.offer?.id||null,offer_version_id:c.offer?.version_id||null,target_snapshot_json:t?JSON.stringify(t):null,schedule_prefix:scheduleSequence(db,b.store_id),booking_prefix:bookingSequence(db,b.store_id),offer_prefix:offerSequence(db,b.store_id),request_prefix:requestSequence(db,b.store_id),created_at:at,created_by:recipient};
    put(db,'family_booking_changes',row);return row;
  });
}
export function changeRecord(db,request,{family=false}={}) {
  const c=db.prepare('SELECT * FROM family_booking_changes WHERE request_id=?').get(request);
  if(!c)return null;
  const e=db.prepare('SELECT * FROM family_booking_change_executions WHERE change_id=?').get(c.id);
  if(!family)return {...c,booking:JSON.parse(c.booking_snapshot_json),target:c.target_snapshot_json?JSON.parse(c.target_snapshot_json):null,execution:e||null};
  const b=JSON.parse(c.booking_snapshot_json),t=c.target_snapshot_json?JSON.parse(c.target_snapshot_json):null;
  return {id:c.id,request_id:c.request_id,kind:c.kind,original:{number:b.booking_number,revision:b.revision,status:b.status,starts_at:b.starts_at,ends_at:b.ends_at},target:t?{starts_at:t.starts_at,ends_at:t.ends_at}:null,created_at:c.created_at,execution:e?{action:e.action,created_at:e.created_at,publication:familyBooking(db,e.result_publication_id,c.recipient_id)}:null,notification_status:'not_sent',deduction_status:'not_connected'};
}
// Replay guards deliberately exclude the booking event written by this operation.
// A replay still requires current named authorization and unretracted publications.
export function changeAccess(db,c) {
  const a=requestSource(db,c.recipient_id,c.customer_id),p=bookingRecord(db,c.publication_id,{limit:1}),q=requestRecord(db,c.request_id,{limit:1}),o=c.offer_id?offerRecord(db,c.offer_id,{limit:1}):null;
  return !!a&&p?.status==='published'&&p.version_id===c.publication_version_id&&JSON.stringify(p.context?.request)===p.request_snapshot_json&&q&&!['withdrawn','closed'].includes(q.status)&&(!c.offer_id||o?.status==='published'&&o.version_id===c.offer_version_id&&o.source_current);
}
export function executionContext(db,request,action) {
  const c=changeRecord(db,request);if(!c)return null;
  const b=bookingSource(db,c.booking_id),q=requestRecord(db,request,{limit:1}),p=bookingRecord(db,c.publication_id,{limit:1}),o=c.offer_id?offerRecord(db,c.offer_id,{limit:1}):null;
  let issue=!changeAccess(db,c)?problem('FAMILY_CHANGE_SOURCE','本人授权、原公开或原意向已经变化'):c.execution?problem('FAMILY_CHANGE_EXECUTED','已有实际办理，请读取原结果'):!p.source_current||JSON.stringify(b)!==c.booking_snapshot_json?problem('FAMILY_CHANGE_SOURCE','原预约已经变化，旧意向保持；请明确重新核对'):null;
  const target=c.target;
  if(!issue&&c.kind==='leave'&&(action!=='leave'||b.status!=='booked')||!issue&&c.kind==='move'&&!['move','promote'].includes(action))issue=problem('FAMILY_CHANGE_ACTION','请选择与本人原意向一致的实际动作');
  if(!issue&&c.kind==='move') {
    const plan=trainingPlan(db,b.plan_id),state=scheduleState(db,c.store_id);
    if(!o.source_current||o.snapshot_json!==c.target_snapshot_json||!plan||plan.status!=='active'||plan.current_version!==b.plan_version||plan.revision!==target.plan_revision)issue=problem('FAMILY_CHANGE_TARGET','原计划或目标开放时段已经变化，请核对新意向');
    else if(action==='promote'&&(b.status!=='waiting'||target.slot_id!==b.slot_id)||action==='move'&&target.slot_id===b.slot_id)issue=problem('FAMILY_CHANGE_ACTION','候补转正须原时段，单次调课须其他时段');
    else issue=o.context.problem||bookingProblem(state,{booking_id:b.booking_id,slot_id:target.slot_id,slot_revision:target.slot_revision,status:action==='promote'?'booked':b.status},c.customer_id);
  }
  return {record:c,problem:issue,source_token:shareHash({change:c.id,booking:b,publication:p.source_token,offer:o?.source_token||null,request_revision:q.revision,action,sequence:scheduleSequence(db,c.store_id),problem:issue})};
}
export function executeChange(db,request,i,actor,at=new Date().toISOString()) {
  return offerAtomic(db,()=>{
    const context=executionContext(db,request,i.action);if(!context||context.problem)throw Error('family booking change current execution source');
    const c=context.record,b=bookingEvent(db,c.booking_id,{action:i.action,slot_id:c.target?.slot_id,note:i.note,reason:i.reason},actor,at);
    const published=createBookingPublication(db,request,c.booking_id,{public_note:i.public_note,reason:i.reason},actor,at);
    const row={id:randomUUID(),change_id:c.id,store_id:c.store_id,booking_event_id:b.event.id,action:i.action,request_revision:requestRecord(db,request).revision,request_prefix:requestSequence(db,c.store_id),booking_prefix:bookingSequence(db,c.store_id),offer_prefix:offerSequence(db,c.store_id),result_publication_id:published.id,created_at:at,created_by:actor};
    put(db,'family_booking_change_executions',row);return row;
  });
}
