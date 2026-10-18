export function latestCorrection(db,id){return db.prepare('SELECT * FROM task_completion_corrections WHERE task_id=? ORDER BY version DESC LIMIT 1').get(id)||null;}
export function taskOrigin(db,id){return db.prepare('SELECT f.*,t.title parent_title FROM task_followups f JOIN work_tasks t ON t.id=f.parent_task_id WHERE f.task_id=?').get(id)||null;}
export function taskFollowups(db,id){
 const items=db.prepare('SELECT f.*,t.title,t.assignment_status,t.execution_status,t.lifecycle_status,CASE WHEN c.task_id IS NULL THEN \'open\' ELSE \'completed\' END completion_status FROM task_followups f JOIN work_tasks t ON t.id=f.task_id LEFT JOIN task_completions c ON c.task_id=t.id WHERE f.parent_task_id=? ORDER BY f.created_at DESC,f.task_id DESC LIMIT 101').all(id);
 return {items:items.slice(0,100),limit:100,truncated:items.length>100,total:db.prepare('SELECT count(*) n FROM task_followups WHERE parent_task_id=?').get(id).n};
}
export function verifyAmendments(db){
 if(db.prepare('SELECT 1 FROM task_completion_corrections GROUP BY task_id HAVING min(version)<>1 OR count(*)<>max(version) LIMIT 1').get())throw Error('完成更正版本不连续');
 for(const row of db.prepare('SELECT * FROM task_completion_corrections ORDER BY task_id,version').iterate()){
  const c=db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(row.task_id),prior=row.version>1?db.prepare('SELECT * FROM task_completion_corrections WHERE task_id=? AND version=?').get(row.task_id,row.version-1):null;
  if(row.completion_sha256!==c.snapshot_sha256||row.output_summary===(prior?.output_summary||c.output_summary)||row.created_at<(prior?.created_at||c.completed_at))throw Error('完成更正与原产出核对失败');
 }
 for(const f of db.prepare('SELECT * FROM task_followups').iterate()){
  const c=db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(f.parent_task_id),parent=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(f.parent_task_id),child=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(f.task_id),source=f.source_correction_version?db.prepare('SELECT * FROM task_completion_corrections WHERE task_id=? AND version=?').get(f.parent_task_id,f.source_correction_version):null;
  if(f.source_completion_sha256!==c.snapshot_sha256||f.source_output_summary!==(source?.output_summary||c.output_summary)||f.created_at<(source?.created_at||c.completed_at)||child.created_at!==f.created_at||child.created_by!==f.created_by||child.store_id!==parent.store_id||child.cycle_id!==parent.cycle_id||child.cycle_version!==parent.cycle_version||child.visit_id!==parent.visit_id||child.context_basis!==parent.context_basis)throw Error('后续任务与固定来源核对失败');
 }
 if(db.prepare("WITH RECURSIVE chain(root,id,path,cycle) AS (SELECT task_id,parent_task_id,'|'||task_id||'|'||parent_task_id||'|',task_id=parent_task_id FROM task_followups UNION ALL SELECT c.root,f.parent_task_id,c.path||f.parent_task_id||'|',instr(c.path,'|'||f.parent_task_id||'|')>0 FROM chain c JOIN task_followups f ON f.task_id=c.id WHERE c.cycle=0) SELECT 1 FROM chain WHERE cycle=1 LIMIT 1").get())throw Error('后续任务来源存在循环');
}
export function sourceInput(b,fail){
 if(!Number.isSafeInteger(b.expected_correction_version)||b.expected_correction_version<0||typeof b.completion_sha256!=='string'||!/^[a-f0-9]{64}$/.test(b.completion_sha256))fail(422,'VALIDATION','请提供所见完成产出与更正版本（原产出为0）');
 return {expected_correction_version:b.expected_correction_version,completion_sha256:b.completion_sha256};
}
export function completionSource(db,id,input,fail){
 const completion=db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(id);if(!completion)fail(409,'COMPLETION_REQUIRED','任务尚未完成，不能更正产出或分派完成后的关联任务');
 if(completion.snapshot_sha256!==input.completion_sha256)fail(409,'COMPLETION_CONFLICT','原完成产出不符，请读取最新记录');
 const correction=latestCorrection(db,id);if((correction?.version||0)!==input.expected_correction_version)fail(409,'CORRECTION_CONFLICT','完成说明已有更正，请读取最新版本并保留填写内容重新核对');
 return {completion,correction,output_summary:correction?.output_summary||completion.output_summary};
}
