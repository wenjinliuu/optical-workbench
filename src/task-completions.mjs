import { latestCorrection, taskFollowups } from './task-amendments.mjs';
import { createHash } from 'node:crypto';

export const completionCheckCodes=['OWNER','ACCEPTED','RUNNING','ACTIVE','OPEN','CONDITIONS','CONDITION_VERSION','TASK_REVISION','NOTES','DOCUMENTS','ATTACHMENTS','ATTACHMENT_ACCESS'];
export const completionDigest=value=>createHash('sha256').update(value).digest('hex');
// Only immutable source data and stable attachment metadata enter the receipt.
// Later access revocation and employee name/role changes cannot rewrite it.
export function completionSnapshot(db,taskId,conditionVersion,evidenceVersion){
 const task=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(taskId);
 const condition=db.prepare('SELECT * FROM task_conditions WHERE task_id=? AND version=?').get(taskId,conditionVersion);
 const evidence=db.prepare('SELECT * FROM task_evidence WHERE task_id=? AND version=?').get(taskId,evidenceVersion);
 const documents=db.prepare('SELECT v.id,v.record_id,v.version,v.title,v.source FROM task_evidence_documents r JOIN document_versions v ON v.id=r.document_version_id WHERE r.task_id=? AND r.evidence_version=? ORDER BY v.id').all(taskId,evidenceVersion);
 const attachments=db.prepare('SELECT a.id,a.filename,a.content_type,a.size,a.blob_sha256,a.created_at,a.created_by FROM task_evidence_attachments r JOIN attachments a ON a.id=r.attachment_id WHERE r.task_id=? AND r.evidence_version=? ORDER BY a.id').all(taskId,evidenceVersion);
 return {task,condition,evidence,documents,attachments,checks:completionCheckCodes.map(code=>({code,passed:true}))};
}
export function completionRecord(db,taskId){
 const row=db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(taskId);if(!row)return null;
 const correction=latestCorrection(db,taskId),history=db.prepare('SELECT c.*,u.display_name author_name FROM task_completion_corrections c JOIN users u ON u.id=c.created_by WHERE c.task_id=? ORDER BY c.version DESC LIMIT 101').all(taskId);return {...row,snapshot:JSON.parse(row.snapshot_json),author_name:db.prepare('SELECT display_name FROM users WHERE id=?').get(row.completed_by).display_name,correction_version:correction?.version||0,effective_output_summary:correction?.output_summary||row.output_summary,corrections:history.slice(0,100),corrections_truncated:history.length>100,history_limit:100,followups:taskFollowups(db,taskId)};
}
export function verifyCompletions(db){
 for(const row of db.prepare('SELECT * FROM task_completions').iterate()){
  const s=completionSnapshot(db,row.task_id,row.condition_version,row.evidence_version),t=s.task,d=s.evidence,c=s.condition;
  if(row.snapshot_json!==JSON.stringify(s)||row.snapshot_sha256!==completionDigest(row.snapshot_json)||t.revision!==row.task_revision||t.assignee_id!==row.completed_by||t.assignment_status!=='accepted'||t.execution_status!=='running'||t.lifecycle_status!=='active'||c.scope!==row.scope||d.condition_version!==c.version||d.task_revision!==t.revision||!d.notes?.trim()||c.version!==db.prepare('SELECT max(version) v FROM task_conditions WHERE task_id=?').get(t.id).v||d.version!==db.prepare('SELECT max(version) v FROM task_evidence WHERE task_id=?').get(t.id).v||c.require_document&&!s.documents.length||c.require_attachment&&!s.attachments.length||row.completed_at<d.created_at||row.completed_at<c.created_at)throw Error('任务完成产出与固定依据核对失败');
 }
}
