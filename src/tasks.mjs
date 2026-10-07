import { completionRecord } from './task-completions.mjs';
import { randomUUID } from 'node:crypto';

const staffRoles=['manager','reception','professional'];
const actions=['claim','accept','start','pause','resume','return','transfer','block','unblock','cancel','restore'];
export function createTasksHandler(db,{need,customer,field,fail,body,mutation,audit}){
 const eligibleSQL="SELECT u.id,u.display_name,u.role FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.store_id=? AND u.active=1 AND u.role IN('manager','reception','professional') AND COALESCE(s.must_change_password,0)=0";
 function assignee(user,id,role=null){const row=db.prepare(eligibleSQL+' AND u.id=?').get(user.store_id,id);if(!row)fail(422,'ASSIGNEE_UNAVAILABLE','接收人须为本店有效且已完成初始改密的员工');if(role&&row.role!==role)fail(409,'ROLE_CHANGED','当前岗位与候选岗位不符，请负责人重新安排交接');return row;}
 function target(b){const id=field(b.assignee_id,'接收人',100),role=field(b.candidate_role,'候选岗位',40);if(Boolean(id)===Boolean(role)||role&&!staffRoles.includes(role))fail(422,'VALIDATION','请选择一位员工或一个候选岗位');return {assignee_id:id,...(role?{candidate_role:role}:{})};}
 function task(user,id){const row=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);if(!row)fail(404,'NOT_FOUND','任务不存在');customer(user,row.customer_id);return row;}
 function visible(row){const employee=row.assignee_id?db.prepare('SELECT display_name FROM users WHERE id=?').get(row.assignee_id):null,eligible=row.assignee_id?db.prepare(eligibleSQL+' AND u.id=?').get(row.store_id,row.assignee_id):null;const completion=db.prepare('SELECT completed_at FROM task_completions WHERE task_id=?').get(row.id);return {...row,completion_status:completion?'completed':'open',effective_execution_status:completion?'completed':row.execution_status,completed_at:completion?.completed_at||null,assignee_name:employee?.display_name||null,assignee_available:Boolean(eligible&&(!row.candidate_role||eligible.role===row.candidate_role)),candidate_count:row.assignment_status==='queued'?db.prepare('SELECT count(*) n FROM ('+eligibleSQL+') WHERE role=?').get(row.store_id,row.candidate_role).n:null,customer_name:db.prepare('SELECT name FROM customers WHERE id=?').get(row.customer_id).name,cycle_goal:row.cycle_id?db.prepare('SELECT goal FROM cycle_versions WHERE cycle_id=? AND version=?').get(row.cycle_id,row.cycle_version).goal:null,visit_purpose:row.visit_id?db.prepare('SELECT purpose FROM visits WHERE id=?').get(row.visit_id).purpose:null};}
 function event(user,row,action,reason,from=null){db.prepare('INSERT INTO task_events (task_id,customer_id,revision,action,from_assignee_id,assignee_id,assignment_status,execution_status,reason,created_at,actor_id,candidate_role,lifecycle_status,exception_reason,restore_status,restore_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.customer_id,row.revision,action,from,row.assignee_id,row.assignment_status,row.execution_status,reason,row.updated_at,user.id,row.candidate_role,row.lifecycle_status,row.exception_reason,row.restore_status,row.restore_reason);}
 function context(user,c,input){
  let basis='customer';
  if(input.visit_id){const v=db.prepare('SELECT * FROM visits WHERE id=? AND customer_id=?').get(input.visit_id,c.id);if(!v)fail(422,'INVALID_CONTEXT','到店必须属于当前客户');basis='visit';}
  if(input.cycle_id){const cycle=db.prepare('SELECT * FROM service_cycles WHERE id=? AND customer_id=?').get(input.cycle_id,c.id);if(!cycle)fail(422,'INVALID_CONTEXT','周期必须属于当前客户');
   if(input.visit_id){const ref=db.prepare('SELECT version,basis FROM visit_cycle_versions WHERE visit_id=? AND cycle_id=? AND customer_id=?').get(input.visit_id,input.cycle_id,c.id);if(!ref||ref.basis!=='captured')fail(422,'UNKNOWN_CONTEXT','到店未关联该周期或历史需求版本未知，请单独登记当前周期任务');if(ref.version!==input.cycle_version)fail(409,'CONTEXT_CONFLICT','任务需求版本必须与所选到店的固定引用一致');basis='visit_cycle';}
   else{const v=db.prepare('SELECT max(version) v FROM cycle_versions WHERE cycle_id=?').get(input.cycle_id).v;if(v!==input.cycle_version)fail(409,'CONTEXT_CONFLICT','周期需求已修订，请重新读取后再分派');basis='cycle';}
  }return basis;
 }
 return async(req,path,url,user,json)=>{
  const staffPath=path==='/api/tasks/assignees',queuePath=path==='/api/tasks',customerMatch=/^\/api\/customers\/([\w-]+)\/tasks$/.exec(path),match=/^\/api\/tasks\/([\w-]+)(\/(claim|accept|start|pause|resume|return|transfer|block|unblock|cancel|restore))?$/.exec(path);
  if(!staffPath&&!queuePath&&!customerMatch&&!match)return false;need(user,'tasks:read');
  if(staffPath){if(req.method!=='GET')fail(405,'METHOD','不支持此请求');json(200,{items:db.prepare(eligibleSQL+' ORDER BY u.display_name,u.id').all(user.store_id),roles:staffRoles});return true;}
  if(queuePath){
   if(req.method!=='GET')fail(405,'METHOD','不支持此请求');const scope=url.searchParams.get('scope')||'mine',state=url.searchParams.get('assignment')||'all',execution=url.searchParams.get('execution')||'all',role=url.searchParams.get('role')||'all',lifecycle=url.searchParams.get('lifecycle')||'all',completion=url.searchParams.get('completion')||'all';
   if(!['mine','role','store'].includes(scope)||!['all','queued','awaiting','accepted'].includes(state)||!['all','pending','running','paused'].includes(execution)||!['all',...staffRoles].includes(role)||!['all','active','blocked','cancelled'].includes(lifecycle)||!['all','open','completed'].includes(completion))fail(422,'VALIDATION','任务队列筛选不正确');
   const where="store_id=:store AND (:scope='store' OR (:scope='mine' AND assignee_id=:user) OR (:scope='role' AND assignment_status='queued' AND candidate_role=:own_role)) AND (:state='all' OR assignment_status=:state) AND (:execution='all' OR (execution_status=:execution AND NOT EXISTS(SELECT 1 FROM task_completions WHERE task_id=work_tasks.id))) AND (:role='all' OR candidate_role=:role) AND (:lifecycle='all' OR lifecycle_status=:lifecycle) AND (:completion='all' OR (:completion='completed')=EXISTS(SELECT 1 FROM task_completions WHERE task_id=work_tasks.id))",params={store:user.store_id,user:user.id,own_role:user.role,scope,state,execution,role,lifecycle,completion};
   const rows=db.prepare('SELECT * FROM work_tasks WHERE '+where+' ORDER BY COALESCE((SELECT completed_at FROM task_completions WHERE task_id=work_tasks.id),updated_at) DESC,id DESC LIMIT 101').all(params),counts=db.prepare("SELECT count(*) total,COALESCE(sum(assignment_status='queued'),0) queued,COALESCE(sum(execution_status='running' AND NOT EXISTS(SELECT 1 FROM task_completions WHERE task_id=work_tasks.id)),0) running,COALESCE(sum(execution_status='paused' AND NOT EXISTS(SELECT 1 FROM task_completions WHERE task_id=work_tasks.id)),0) paused,COALESCE(sum(lifecycle_status='blocked'),0) blocked,COALESCE(sum(lifecycle_status='cancelled'),0) cancelled,COALESCE(sum(EXISTS(SELECT 1 FROM task_completions WHERE task_id=work_tasks.id)),0) completed FROM work_tasks WHERE "+where).get(params);
   const lanes=Object.fromEntries(db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM task_completions WHERE task_id=work_tasks.id) THEN 'completed' WHEN lifecycle_status<>'active' THEN lifecycle_status WHEN assignment_status<>'accepted' THEN assignment_status ELSE execution_status END lane,count(*) n FROM work_tasks WHERE "+where+' GROUP BY lane').all(params).map(r=>[r.lane,r.n]));
   json(200,{items:rows.slice(0,100).map(visible),limit:100,truncated:rows.length>100,scope,counts,lanes});return true;
  }
  if(customerMatch){const c=customer(user,customerMatch[1]);
   if(req.method==='GET'){const rows=db.prepare('SELECT * FROM work_tasks WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 101').all(c.id);json(200,{items:rows.slice(0,100).map(visible),limit:100,truncated:rows.length>100});return true;}
   if(req.method!=='POST')fail(405,'METHOD','不支持此请求');need(user,'tasks:assign');const b=await body(req);
   if(Object.keys(b).some(k=>!['title','instructions','cycle_id','cycle_version','visit_id','assignee_id','candidate_role','reason'].includes(k)))fail(422,'VALIDATION','任务身份与状态由系统保存');
   const selected=target(b),input={title:field(b.title,'任务名称',120,true),instructions:field(b.instructions,'交接说明',1000,true),cycle_id:field(b.cycle_id,'周期编号',100),cycle_version:b.cycle_version??null,visit_id:field(b.visit_id,'到店编号',100),assignee_id:selected.assignee_id,reason:field(b.reason,'分派依据',300,true),...(selected.candidate_role?{candidate_role:selected.candidate_role}:{})};
   if(input.cycle_id?(!Number.isSafeInteger(input.cycle_version)||input.cycle_version<1):input.cycle_version!==null)fail(422,'VALIDATION','关联周期需要明确需求版本');
   json(201,mutation(req,user,`task.assign:${c.id}`,input,()=>{customer(user,c.id);if(input.assignee_id)assignee(user,input.assignee_id);const basis=context(user,c,input),id=randomUUID(),now=new Date().toISOString();
    db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by,candidate_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,c.store_id,input.title,input.instructions,input.cycle_id,input.cycle_version,input.visit_id,basis,input.assignee_id,input.assignee_id?'awaiting':'queued','pending',1,now,now,user.id,input.candidate_role||null);
    const row=task(user,id);event(user,row,'assign',input.reason);audit(user,'task.assign',id,{...row,reason:input.reason});return {task:visible(row)};
   }));return true;
  }
  const row=task(user,match[1]);
  if(req.method==='GET'&&!match[2]){json(200,{task:visible(row),completion:completionRecord(db,row.id),events:db.prepare('SELECT e.*,u.display_name AS actor_name,a.display_name AS assignee_name,f.display_name AS from_assignee_name FROM task_events e JOIN users u ON u.id=e.actor_id LEFT JOIN users a ON a.id=e.assignee_id LEFT JOIN users f ON f.id=e.from_assignee_id WHERE task_id=? ORDER BY revision DESC LIMIT 100').all(row.id),limit:100});return true;}
  if(req.method!=='POST'||!match[2])fail(405,'METHOD','不支持此请求');const action=match[3];if(!actions.includes(action))fail(405,'METHOD','不支持此请求');need(user,'tasks:receive');const b=await body(req),allowed=['expected_revision','reason',...(action==='transfer'?['assignee_id','candidate_role']:action==='return'?['candidate_role']:[])];
  if(Object.keys(b).some(k=>!allowed.includes(k)))fail(422,'VALIDATION','请仅提供本次任务操作资料');
  const input={expected_revision:b.expected_revision,reason:field(b.reason,'操作依据',300,true),...(action==='transfer'?target(b):action==='return'?{candidate_role:field(b.candidate_role,'退回岗位',40,true)}:{})};
  if(!Number.isSafeInteger(input.expected_revision)||input.expected_revision<1||action==='return'&&!staffRoles.includes(input.candidate_role))fail(422,'VALIDATION','请提供当前修订号及有效退回岗位');
  json(200,mutation(req,user,`task.${action}:${row.id}`,input,()=>{
   const before=task(user,row.id);if(db.prepare('SELECT 1 FROM task_completions WHERE task_id=?').get(row.id))fail(409,'TASK_COMPLETED','任务已完成，不能再交接、执行或处理异常');if(before.revision!==input.expected_revision)fail(409,'TASK_CONFLICT','任务状态已变化，请读取最新状态后再操作');
   let receiver=before.assignee_id,status=before.assignment_status,execution=before.execution_status,role=before.candidate_role,lifecycle=before.lifecycle_status,exceptionReason=before.exception_reason,restoreStatus=before.restore_status,restoreReason=before.restore_reason;
   if(['block','unblock','cancel','restore'].includes(action)){
    if(receiver!==user.id&&user.role!=='manager')fail(403,'NOT_OWNER','只有当前负责人或门店负责人可以处理任务异常');
    if(user.role!=='manager')assignee(user,user.id,role);
    if(action==='block'){if(lifecycle!=='active')fail(409,'INVALID_TASK_STATE','只有正常任务可以登记阻塞');lifecycle='blocked';exceptionReason=input.reason;}
    if(action==='unblock'){if(lifecycle!=='blocked')fail(409,'INVALID_TASK_STATE','任务当前没有待解除的阻塞');lifecycle='active';exceptionReason=null;}
    if(action==='cancel'){if(lifecycle==='cancelled')fail(409,'INVALID_TASK_STATE','任务已取消');restoreStatus=lifecycle;restoreReason=exceptionReason;lifecycle='cancelled';exceptionReason=input.reason;}
    if(action==='restore'){if(lifecycle!=='cancelled')fail(409,'INVALID_TASK_STATE','只有已取消任务可以恢复');lifecycle=restoreStatus;exceptionReason=restoreReason;restoreStatus=null;restoreReason=null;}
    if(execution==='running')execution='paused';
   }else if(lifecycle==='cancelled')fail(409,'TASK_CANCELLED','任务已取消，请先由当前负责人或门店负责人恢复');
   else if(action==='claim'){
    if(status!=='queued')fail(409,'ALREADY_CLAIMED','任务已被认领或分派');if(role!==user.role)fail(403,'NOT_CANDIDATE','只有该候选岗位的员工可以认领');assignee(user,user.id,role);receiver=user.id;status='awaiting';
   }else if(action==='transfer'){
    if(receiver!==user.id&&user.role!=='manager')fail(403,'NOT_OWNER','只有当前负责人或门店负责人可以转交任务');
    if(input.assignee_id){assignee(user,input.assignee_id);if(input.assignee_id===receiver)fail(409,'NO_CHANGES','请选择其他接收人');}
    else if(status==='queued'&&role===input.candidate_role)fail(409,'NO_CHANGES','任务已经在该岗位候选队列');
    receiver=input.assignee_id;role=input.candidate_role||null;status=receiver?'awaiting':'queued';if(execution==='running')execution='paused';
   }else{
    if(receiver!==user.id)fail(403,'NOT_ASSIGNEE','只有当前接收人可以接收或执行此任务');assignee(user,user.id,role);
    if(action==='accept'){if(status!=='awaiting')fail(409,'ALREADY_ACCEPTED','任务已接收');status='accepted';}
    else if(action==='return'){receiver=null;role=input.candidate_role;status='queued';if(execution==='running')execution='paused';}
    else{if(lifecycle!=='active')fail(409,'TASK_BLOCKED','任务存在阻塞，请记录解决依据并解除后再执行');if(status!=='accepted')fail(409,'NOT_ACCEPTED','请先接收任务再执行');
     if(action==='start'&&execution!=='pending'||action==='resume'&&execution!=='paused'||action==='pause'&&execution!=='running')fail(409,'INVALID_TASK_STATE','当前执行状态不支持此操作，请读取最新状态');execution=action==='pause'?'paused':'running';
    }
   }
   db.prepare('UPDATE work_tasks SET assignee_id=?,assignment_status=?,execution_status=?,candidate_role=?,lifecycle_status=?,exception_reason=?,restore_status=?,restore_reason=?,revision=revision+1,updated_at=? WHERE id=?').run(receiver,status,execution,role,lifecycle,exceptionReason,restoreStatus,restoreReason,new Date().toISOString(),row.id);
   const after=task(user,row.id);event(user,after,action,input.reason,before.assignee_id);audit(user,`task.${action}`,row.id,{...after,reason:input.reason},before);return {task:visible(after)};
  }));return true;
 };
}
