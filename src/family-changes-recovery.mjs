import {familyChangeTables} from './family-changes.mjs';
import {bookingSource} from './family-bookings.mjs';
import {offerSource} from './family-offers.mjs';
import {canonicalTime} from './training.mjs';

export function verifyFamilyChanges(db) {
  const fail=s=>{throw Error('家庭原预约变更恢复核对失败：'+s);};
  const all=t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all();
  const changes=all(familyChangeTables[0]),executions=all(familyChangeTables[1]),map=new Map(changes.map(c=>[c.id,c]));
  const prefix=(c,table,n,zero=false)=>{
    if(!Number.isSafeInteger(n)||n<(zero?0:1)||n&&!db.prepare(`SELECT 1 FROM ${table} WHERE store_id=? AND sequence=? AND created_at<=?`).get(c.store_id,n,c.created_at)||db.prepare(`SELECT 1 FROM ${table} WHERE store_id=? AND (sequence<=? AND created_at>? OR sequence>? AND created_at<?)`).get(c.store_id,n,c.created_at,n,c.created_at))fail('原流水前缀');
  };
  const actor=(c,staff=false)=>{if(!canonicalTime(c.created_at)||!db.prepare('SELECT 1 FROM users WHERE id=?'+(staff?' AND store_id=?':'')).get(...(staff?[c.created_by,c.store_id]:[c.created_by])))fail('原身份/时间');};
  const published=(table,root,n,version)=>db.prepare(`SELECT status,version_id FROM ${table} WHERE root_id=? AND sequence<=? ORDER BY revision DESC LIMIT 1`).get(root,n)?.status==='published'&&db.prepare(`SELECT version_id FROM ${table} WHERE root_id=? AND sequence<=? ORDER BY revision DESC LIMIT 1`).get(root,n)?.version_id===version;
  for(const c of changes) {
    actor(c);prefix(c,'schedule_journal',c.schedule_prefix);prefix(c,'family_booking_events',c.booking_prefix);prefix(c,'family_offer_events',c.offer_prefix,true);prefix(c,'family_request_events',c.request_prefix);
    const q=db.prepare('SELECT * FROM family_request_roots WHERE id=?').get(c.request_id),p=db.prepare('SELECT * FROM family_booking_roots WHERE id=?').get(c.publication_id),v=db.prepare('SELECT * FROM family_booking_versions WHERE id=?').get(c.publication_version_id),original=p&&db.prepare('SELECT * FROM family_request_roots WHERE id=?').get(p.request_id),b=bookingSource(db,c.booking_id,c.schedule_prefix);
    if(!q||!p||!v||!original||!b||c.created_by!==c.recipient_id||q.customer_id!==c.customer_id||q.recipient_id!==c.recipient_id||q.store_id!==c.store_id||q.created_at!==c.created_at||q.created_by!==c.created_by||p.store_id!==c.store_id||p.booking_id!==c.booking_id||v.root_id!==p.id||original.customer_id!==c.customer_id||original.recipient_id!==c.recipient_id||JSON.stringify(b)!==c.booking_snapshot_json||v.booking_snapshot_json!==c.booking_snapshot_json||!published('family_booking_events',p.id,c.booking_prefix,v.id)||b.status==='cancelled')fail('原公开/本人/客户/预约版本');
    const originalEvent=db.prepare('SELECT id FROM family_request_events WHERE root_id=? AND sequence<=? ORDER BY revision DESC LIMIT 1').get(original.id,c.request_prefix);
    if(originalEvent?.id!==JSON.parse(v.request_snapshot_json).event_id||q.time_status!=='recorded')fail('原申请前缀');
    let target=null;
    if(c.kind==='leave') {
      if(b.status!=='booked'||q.request_kind!=='leave'||c.offer_id!==null||c.offer_version_id!==null||c.target_snapshot_json!==null||q.requested_start!==b.starts_at||q.requested_end!==b.ends_at)fail('明确当次请假');
    } else if(c.kind==='move') {
      const o=db.prepare('SELECT * FROM family_offer_roots WHERE id=?').get(c.offer_id),ov=db.prepare('SELECT * FROM family_offer_versions WHERE id=?').get(c.offer_version_id);
      try{target=JSON.parse(c.target_snapshot_json);}catch{fail('目标快照');}
      const source=o&&offerSource(db,o.plan_id,o.slot_id,{planRevision:target?.plan_revision,schedulePrefix:c.schedule_prefix});
      if(!o||!ov||ov.root_id!==o.id||ov.snapshot_json!==c.target_snapshot_json||JSON.stringify(source)!==c.target_snapshot_json||o.recipient_id!==c.recipient_id||o.customer_id!==c.customer_id||o.store_id!==c.store_id||o.plan_id!==b.plan_id||target.plan_version!==b.plan_version||target.plan_status!=='active'||!published('family_offer_events',o.id,c.offer_prefix,ov.id)||q.request_kind!=='appointment'||q.requested_start!==target.starts_at||q.requested_end!==target.ends_at||o.slot_id===b.slot_id&&b.status!=='waiting')fail('固定目标原时段/计划/本人');
    } else fail('意向种类');
    for(const old of changes) {
      if(old.id===c.id)break;
      if(old.booking_id!==c.booking_id||old.recipient_id!==c.recipient_id)continue;
      const oq=db.prepare('SELECT status FROM family_request_events WHERE root_id=? AND sequence<=? ORDER BY revision DESC LIMIT 1').get(old.request_id,c.request_prefix),executed=executions.find(e=>e.change_id===old.id),ee=executed&&db.prepare('SELECT sequence FROM schedule_booking_events WHERE id=?').get(executed.booking_event_id);
      if(oq&&!['withdrawn','closed'].includes(oq.status)&&(!ee||ee.sequence>c.schedule_prefix))fail('重复有效原预约意向');
    }
  }
  const seen=new Set();
  for(const e of executions) {
    actor(e,true);prefix(e,'family_request_events',e.request_prefix);prefix(e,'family_booking_events',e.booking_prefix);prefix(e,'family_offer_events',e.offer_prefix,true);
    const c=map.get(e.change_id),b=db.prepare('SELECT * FROM schedule_booking_events WHERE id=?').get(e.booking_event_id),q=c&&db.prepare('SELECT * FROM family_request_events WHERE root_id=? AND revision=?').get(c.request_id,e.request_revision),p=db.prepare('SELECT * FROM family_booking_roots WHERE id=?').get(e.result_publication_id),v=p&&db.prepare('SELECT * FROM family_booking_versions WHERE id=?').get(p.first_version_id);
    if(!c||seen.has(c.id)||e.store_id!==c.store_id||e.created_at<c.created_at||!b||b.booking_id!==c.booking_id||b.store_id!==e.store_id||b.created_at!==e.created_at||b.created_by!==e.created_by||b.action!==e.action||b.previous_event_id!==JSON.parse(c.booking_snapshot_json).event_id||!q||['withdrawn','closed'].includes(q.status)||q.created_at>e.created_at||db.prepare('SELECT 1 FROM family_request_events WHERE root_id=? AND revision>? AND created_at<?').get(c.request_id,e.request_revision,e.created_at)||!p||p.request_id!==c.request_id||p.booking_id!==c.booking_id||p.store_id!==c.store_id||p.created_at!==e.created_at||p.created_by!==e.created_by||!v||JSON.parse(v.booking_snapshot_json).event_id!==b.id||!published('family_booking_events',p.id,e.booking_prefix,v.id)||!published('family_booking_events',c.publication_id,e.booking_prefix,c.publication_version_id))fail('实际原事件/独立公开配对');
    const original=JSON.parse(c.booking_snapshot_json),target=c.target_snapshot_json?JSON.parse(c.target_snapshot_json):null;
    const oldPublication=db.prepare('SELECT * FROM family_booking_versions WHERE id=?').get(c.publication_version_id),oldRequest=JSON.parse(oldPublication.request_snapshot_json),oldEvent=db.prepare('SELECT id FROM family_request_events WHERE root_id=? AND sequence<=? ORDER BY revision DESC LIMIT 1').get(oldRequest.request_id,e.request_prefix),currentRequest=db.prepare('SELECT revision FROM family_request_events WHERE root_id=? AND sequence<=? ORDER BY revision DESC LIMIT 1').get(c.request_id,e.request_prefix);
    if(oldEvent?.id!==oldRequest.event_id||currentRequest?.revision!==e.request_revision)fail('实际办理原申请固定前缀');
    if(b.revision!==original.revision+1||c.kind==='leave'&&(e.action!=='leave'||original.status!=='booked'||b.status!=='cancelled'||b.slot_id!==original.slot_id||b.slot_revision!==original.slot_revision)||c.kind==='move'&&(!target||!['move','promote'].includes(e.action)||b.slot_id!==target.slot_id||b.slot_revision!==target.slot_revision||b.plan_revision!==target.plan_revision||!published('family_offer_events',c.offer_id,e.offer_prefix,c.offer_version_id)||e.action==='move'&&(b.slot_id===original.slot_id||b.status!==original.status)||e.action==='promote'&&(original.status!=='waiting'||b.status!=='booked'||b.slot_id!==original.slot_id)))fail('请假/调课/候补转正动作');
    seen.add(c.id);
  }
}
