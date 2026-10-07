import { Buffer } from 'node:buffer';

export const timelineKinds=['profile','cycle','visit','contact','document','attachment','authorization','task'];
// Read existing records. Only customer-related, explicitly allowed audit actions
// enter this projection; account/security logs and arbitrary audit JSON never do.
const eventsSQL=`WITH events AS (
 SELECT 'profile:'||printf('%012d',version) AS event_id,created_at AS at,'profile' AS kind,customer_id AS entity_id,created_by AS actor_id,
 json_object('version',version,'name',name,'source',source,'reason',revision_reason) AS details FROM customer_profile_versions WHERE customer_id=:customer
 UNION ALL SELECT 'cycle:'||cycle_id||':'||printf('%012d',version),created_at,'cycle',cycle_id,created_by,json_object('type',type,'goal',goal,'version',version,'source',source,'reason',revision_reason) FROM cycle_versions WHERE customer_id=:customer
 UNION ALL SELECT 'cycle-baseline:'||c.id,c.created_at,'cycle',c.id,c.created_by,json_object('type',c.type,'source','unrecorded','reason','早期周期创建；初始需求未留存') FROM service_cycles c WHERE c.customer_id=:customer AND EXISTS(SELECT 1 FROM cycle_versions v WHERE v.cycle_id=c.id AND v.version=1 AND v.source='legacy')
 UNION ALL SELECT 'visit:1-register:'||id,created_at,'visit',id,created_by,json_object('action','register','purpose',purpose,'cycle_count',(SELECT count(*) FROM visit_cycles WHERE visit_id=v.id),'cycle_refs',json((SELECT json_group_array(json_object('cycle_id',s.cycle_id,'version',s.version,'basis',s.basis,'type',COALESCE(cv.type,c.type),'goal',cv.goal)) FROM visit_cycle_versions s JOIN service_cycles c ON c.id=s.cycle_id LEFT JOIN cycle_versions cv ON cv.cycle_id=s.cycle_id AND cv.version=s.version WHERE s.visit_id=v.id))) FROM visits v WHERE customer_id=:customer
 UNION ALL SELECT 'visit:2-close:'||v.id,v.closed_at,'visit',v.id,(SELECT actor_id FROM audit_events WHERE action='visit.close' AND entity_id=v.id AND store_id=:store ORDER BY rowid DESC LIMIT 1),
 json_object('action','close','purpose',v.purpose,'reason',COALESCE((SELECT json_extract(after_json,'$.reason') FROM audit_events WHERE action='visit.close' AND entity_id=v.id AND store_id=:store AND json_valid(after_json) ORDER BY rowid DESC LIMIT 1),'历史记录未登记结束依据')) FROM visits v WHERE customer_id=:customer AND closed_at IS NOT NULL
 UNION ALL SELECT 'document:'||record_id||':'||printf('%012d',version),created_at,'document',record_id,created_by,json_object('version',version,'title',title,'source',source,'reason',revision_reason) FROM document_versions WHERE customer_id=:customer
 UNION ALL SELECT 'attachment:1-upload:'||id,created_at,'attachment',id,created_by,json_object('action','upload','filename',filename) FROM attachments WHERE customer_id=:customer
 UNION ALL SELECT 'attachment:2-revoke:'||id,revoked_at,'attachment',id,revoked_by,json_object('action','revoke','filename',filename,'reason',revocation_reason) FROM attachments WHERE customer_id=:customer AND revoked_at IS NOT NULL
 UNION ALL SELECT 'contact-audit:'||a.id,a.created_at,'contact',a.entity_id,a.actor_id,
 json_object('action',a.action,'name',json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.name'),'relationship',json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.relationship'),'active',json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.active'),'previous_active',json_extract(CASE WHEN json_valid(a.before_json) THEN a.before_json ELSE '{}' END,'$.active'),'revision',json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.revision'),'source',json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.source'),'reason',json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.reason'))
 FROM audit_events a WHERE a.store_id=:store AND a.action IN ('contact.create','contact.update') AND json_valid(a.after_json) AND json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.customer_id')=:customer
 UNION ALL SELECT 'contact-baseline:'||f.id,f.created_at,'contact',f.id,f.created_by,json_object('action','baseline','reason','早期联系人记录，详细初版未留存') FROM family_contacts f WHERE f.customer_id=:customer AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.store_id=:store AND a.action='contact.create' AND a.entity_id=f.id AND json_valid(a.after_json) AND json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.customer_id')=:customer)
 UNION ALL SELECT 'task:'||e.task_id||':'||printf('%012d',e.revision),e.created_at,'task',e.task_id,e.actor_id,json_object('action',e.action,'title',t.title,'reason',e.reason,'revision',e.revision,'assignee_id',e.assignee_id,'assignee_name',u.display_name,'candidate_role',e.candidate_role,'assignment_status',e.assignment_status,'execution_status',e.execution_status,'cycle_id',t.cycle_id,'cycle_version',t.cycle_version,'visit_id',t.visit_id) FROM task_events e JOIN work_tasks t ON t.id=e.task_id LEFT JOIN users u ON u.id=e.assignee_id WHERE e.customer_id=:customer AND t.store_id=:store
 UNION ALL SELECT 'authorization:'||a.id,a.created_at,'authorization',a.entity_id,a.actor_id,
 json_object('action',a.action,'relationship',json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.relationship'),'reason',json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.reason')) FROM audit_events a WHERE a.store_id=:store AND a.entity_id=:customer AND a.action IN ('guardian.authorize','guardian.revoke') AND json_valid(a.after_json) AND json_extract(CASE WHEN json_valid(a.after_json) THEN a.after_json ELSE '{}' END,'$.customer_id')=:customer
)`;

export function createTimelineHandler(db,{need,customer,fail}){
  const count=(table,id,extra='')=>db.prepare(`SELECT count(*) n FROM ${table} WHERE customer_id=? ${extra}`).get(id).n;
  function date(value){if(value===null)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail(422,'VALIDATION','筛选日期不正确');return value;}
  return (req,path,url,user,json)=>{
    const match=/^\/api\/customers\/([\w-]+)\/(overview|timeline)$/.exec(path);if(!match)return false;
    need(user,'timeline:read');const c=customer(user,match[1]);if(req.method!=='GET')fail(405,'METHOD','不支持此请求');
    if(match[2]==='overview'){
      const last=db.prepare('SELECT id,purpose,created_at,status FROM visits WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(c.id)||null;
      json(200,{customer_id:c.id,profile_version:db.prepare('SELECT max(version) v FROM customer_profile_versions WHERE customer_id=?').get(c.id).v,cycle_drafts:count('service_cycles',c.id),visits_registered:count('visits',c.id,"AND status='registered'"),visits_closed:count('visits',c.id,"AND status='closed'"),contacts_active:count('family_contacts',c.id,'AND active=1'),documents:count('document_records',c.id),attachments_active:count('attachments',c.id,'AND revoked_at IS NULL'),last_visit:last,tasks_queued:count('work_tasks',c.id,"AND assignment_status='queued'"),tasks_running:count('work_tasks',c.id,"AND execution_status='running'"),tasks_paused:count('work_tasks',c.id,"AND execution_status='paused'"),tasks_awaiting:count('work_tasks',c.id,"AND assignment_status='awaiting'"),tasks_accepted:count('work_tasks',c.id,"AND assignment_status='accepted'")});return true;
    }
    const kind=url.searchParams.get('kind')||'all',from=date(url.searchParams.get('from')),to=date(url.searchParams.get('to'));
    if(kind!=='all'&&!timelineKinds.includes(kind))fail(422,'VALIDATION','记录类别不正确');if(from&&to&&from>to)fail(422,'VALIDATION','开始日期不能晚于结束日期');
    const rawLimit=url.searchParams.get('limit')??'20';if(!/^\d{1,3}$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>50)fail(422,'VALIDATION','每页记录数为1至50');const limit=Number(rawLimit);
    let cursor=null;const rawCursor=url.searchParams.get('cursor');
    if(rawCursor!==null){
      try{
        if(!rawCursor||rawCursor.length>2048||!/^[\w-]+$/.test(rawCursor))throw Error();cursor=JSON.parse(Buffer.from(rawCursor,'base64url').toString('utf8'));
        if(!cursor||cursor.customer!==c.id||cursor.kind!==kind||cursor.from!==from||cursor.to!==to||typeof cursor.at!=='string'||cursor.at.length>40||Number.isNaN(Date.parse(cursor.at))||typeof cursor.id!=='string'||!/^[-\w:]{1,200}$/.test(cursor.id))throw Error();
      }catch{fail(422,'INVALID_CURSOR','分页标识无效或与当前筛选不一致');}
    }
    const params={customer:c.id,store:c.store_id,kind,from,to,at:cursor?.at||'',id:cursor?.id||'',limit:limit+1};
    const rows=db.prepare(eventsSQL+` SELECT e.*,u.display_name AS actor_name FROM events e LEFT JOIN users u ON u.id=e.actor_id WHERE (:kind='all' OR e.kind=:kind) AND (:from='' OR substr(e.at,1,10)>=:from) AND (:to='' OR substr(e.at,1,10)<=:to) AND (:at='' OR e.at<:at OR (e.at=:at AND e.event_id<:id)) ORDER BY e.at DESC,e.event_id DESC LIMIT :limit`).all(params);
    const more=rows.length>limit,items=rows.slice(0,limit).map(({details,...row})=>({...row,details:JSON.parse(details)})),last=items.at(-1);
    const next_cursor=more?Buffer.from(JSON.stringify({customer:c.id,kind,from,to,at:last.at,id:last.event_id})).toString('base64url'):null;
    json(200,{items,next_cursor,limit,timezone:'UTC',order:'newest_first'});return true;
  };
}
