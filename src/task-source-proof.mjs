import {createHash} from 'node:crypto';

// Small read-only identity shared by every task projection. Completion text,
// professional content and financial fields deliberately stay outside it.
export function taskSourceProof(db,taskId){
 const completion=db.prepare(`SELECT c.task_id,c.customer_id,c.task_revision,c.condition_version,c.evidence_version,
  c.snapshot_sha256,c.completed_at,c.completed_by,t.store_id
  FROM task_completions c JOIN work_tasks t ON t.id=c.task_id WHERE c.task_id=?`).get(taskId);
 if(!completion)return null;
 const correction_version=db.prepare('SELECT coalesce(max(version),0) version FROM task_completion_corrections WHERE task_id=?').get(taskId).version;
 const followups=db.prepare(`SELECT task_id,parent_task_id,source_correction_version,source_completion_sha256,created_at
  FROM task_followups WHERE parent_task_id=? ORDER BY created_at,task_id`).all(taskId).map(r=>({
   task_id:r.task_id,parent_task_id:r.parent_task_id,source_correction_version:r.source_correction_version,
   completion_sha256:r.source_completion_sha256,created_at:r.created_at
  }));
 const source={task_id:completion.task_id,customer_id:completion.customer_id,store_id:completion.store_id,
  task_revision:completion.task_revision,condition_version:completion.condition_version,evidence_version:completion.evidence_version,
  completion_sha256:completion.snapshot_sha256,completed_at:completion.completed_at,completed_by:completion.completed_by,
  correction_version,followup_count:followups.length,followups};
 return {...source,source_fingerprint:createHash('sha256').update(JSON.stringify(source)).digest('hex')};
}
