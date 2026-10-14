import {createHash} from 'node:crypto';
import {taskSourceProof} from './task-source-proof.mjs';

// Only direct, originally saved links of a task actually completed by this actor.
// Current responsibility is metadata; original instructions and completion bodies
// remain behind the original task detail entry.
export function myWorkFollowups(db,user,parentId,{limit=30,offset=0}={}){
 const parent=db.prepare(`SELECT t.id,t.title,t.customer_id,t.store_id,c.completed_by FROM work_tasks t
  JOIN task_completions c ON c.task_id=t.id AND c.customer_id=t.customer_id
  WHERE t.id=? AND t.store_id=? AND c.completed_by=?`).get(parentId,user.store_id,user.id);
 if(!parent)return null;
 const parent_source_proof=taskSourceProof(db,parentId);
 const all=db.prepare(`SELECT f.task_id id,f.parent_task_id,f.source_correction_version,f.source_completion_sha256 completion_sha256,
  f.created_at source_created_at,t.customer_id,t.store_id,t.title,t.revision,t.assignee_id,t.candidate_role,
  t.lifecycle_status,t.assignment_status,t.execution_status,u.display_name assignee_name,u.role assignee_role,c.completed_at
  FROM task_followups f JOIN work_tasks t ON t.id=f.task_id AND t.customer_id=f.customer_id
  LEFT JOIN users u ON u.id=t.assignee_id AND u.store_id=t.store_id
  LEFT JOIN task_completions c ON c.task_id=t.id AND c.customer_id=t.customer_id
  WHERE f.parent_task_id=? AND f.customer_id=? AND t.store_id=? ORDER BY f.created_at,t.id`).all(parentId,parent.customer_id,user.store_id).map(r=>({
   ...r,kind:'task',key:'followup:'+r.id,status:r.completed_at?'completed':r.lifecycle_status+' / '+r.assignment_status+' / '+r.execution_status,
   task_source_proof:r.completed_at?taskSourceProof(db,r.id):null,professional_qualification_status:'not_verified'
  }));
 const source_token=createHash('sha256').update(JSON.stringify({actor:user.id,role:user.role,store:user.store_id,parent_source_proof,items:all})).digest('hex');
 return {parent:{...parent},parent_source_proof,source_token,total:all.length,next_offset:offset+limit<all.length?offset+limit:null,items:all.slice(offset,offset+limit)};
}

export function createMyWorkFollowupsHandler(db,{need,fail}){
 return async(req,path,url,user,json)=>{
  const m=/^\/api\/my-work\/completed\/([\w-]+)\/followups(\/authorization)?$/.exec(path);if(!m)return false;
  need(user,'tasks:read');if(req.method!=='GET')fail(405,'METHOD','后续引用只读展开，原办理沿原任务入口');
  const proof=Boolean(m[2]),known=['expected_parent_source','expected_source',...(proof?[]:['limit','offset'])];
  for(const k of url.searchParams.keys())if(!known.includes(k)||url.searchParams.getAll(k).length!==1)fail(422,'VALIDATION','仅接受本人原完成来源及同源分页');
  const page=(k,d,min,max)=>{const v=url.searchParams.get(k)??String(d);if(!/^\d+$/.test(v)||+v<min||+v>max)fail(422,'VALIDATION','后续分页无效');return +v;};
  const options={limit:page('limit',30,1,100),offset:page('offset',0,0,1e6)},parent=url.searchParams.get('expected_parent_source'),source=url.searchParams.get('expected_source');
  if(!parent||!(/^[a-f0-9]{64}$/.test(parent))||source!==null&&!(/^[a-f0-9]{64}$/.test(source)))fail(422,'VALIDATION','请采用本人原完成记录的完整来源证明');
  const z=myWorkFollowups(db,user,m[1],options);if(!z)fail(404,'NOT_FOUND','本店本人实际完成记录不存在');
  if(parent!==z.parent_source_proof.source_fingerprint||(proof||options.offset>0)&&!source||source&&source!==z.source_token)
   fail(409,'MY_WORK_FOLLOWUPS_CHANGED','原完成来源或后续责任状态已有变化，请明确刷新后重新展开');
  json(200,proof?{source_token:z.source_token}:z);return true;
 };
}
