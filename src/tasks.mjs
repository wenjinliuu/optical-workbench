import { randomUUID } from 'node:crypto';

export function createTasksHandler(db,{need,customer,field,fail,body,mutation,audit}){
 const eligibleSQL="SELECT u.id,u.display_name,u.role FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.store_id=? AND u.active=1 AND u.role IN('manager','reception','professional') AND COALESCE(s.must_change_password,0)=0";
 function assignee(user,id){const row=db.prepare(eligibleSQL+' AND u.id=?').get(user.store_id,id);if(!row)fail(422,'ASSIGNEE_UNAVAILABLE','接收人须为本店有效且已完成初始改密的员工');return row;}
 function task(user,id){const row=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);if(!row)fail(404,'NOT_FOUND','任务不存在');customer(user,row.customer_id);return row;}
 function visible(row){return {...row,assignee_name:db.prepare('SELECT display_name FROM users WHERE id=?').get(row.assignee_id).display_name,assignee_available:Boolean(db.prepare(eligibleSQL+' AND u.id=?').get(row.store_id,row.assignee_id)),customer_name:db.prepare('SELECT name FROM customers WHERE id=?').get(row.customer_id).name,cycle_goal:row.cycle_id?db.prepare('SELECT goal FROM cycle_versions WHERE cycle_id=? AND version=?').get(row.cycle_id,row.cycle_version).goal:null,visit_purpose:row.visit_id?db.prepare('SELECT purpose FROM visits WHERE id=?').get(row.visit_id).purpose:null};}
 function event(user,row,action,reason,from=null){db.prepare('INSERT INTO task_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.customer_id,row.revision,action,from,row.assignee_id,row.assignment_status,row.execution_status,reason,row.updated_at,user.id);}
 function context(user,c,input){
  let basis='customer';
  if(input.visit_id){const v=db.prepare('SELECT * FROM visits WHERE id=? AND customer_id=?').get(input.visit_id,c.id);if(!v)fail(422,'INVALID_CONTEXT','到店必须属于当前客户');basis='visit';}
  if(input.cycle_id){const cycle=db.prepare('SELECT * FROM service_cycles WHERE id=? AND customer_id=?').get(input.cycle_id,c.id);if(!cycle)fail(422,'INVALID_CONTEXT','周期必须属于当前客户');
   if(input.visit_id){const ref=db.prepare('SELECT version,basis FROM visit_cycle_versions WHERE visit_id=? AND cycle_id=? AND customer_id=?').get(input.visit_id,input.cycle_id,c.id);if(!ref||ref.basis!=='captured')fail(422,'UNKNOWN_CONTEXT','到店未关联该周期或历史需求版本未知，请单独登记当前周期任务');if(ref.version!==input.cycle_version)fail(409,'CONTEXT_CONFLICT','任务需求版本必须与所选到店的固定引用一致');basis='visit_cycle';}
   else{const v=db.prepare('SELECT max(version) v FROM cycle_versions WHERE cycle_id=?').get(input.cycle_id).v;if(v!==input.cycle_version)fail(409,'CONTEXT_CONFLICT','周期需求已修订，请重新读取后再分派');basis='cycle';}
  }return basis;
 }
 return async(req,path,url,user,json)=>{
  const staffPath=path==='/api/tasks/assignees',queuePath=path==='/api/tasks',customerMatch=/^\/api\/customers\/([\w-]+)\/tasks$/.exec(path),match=/^\/api\/tasks\/([\w-]+)(\/(accept|transfer))?$/.exec(path);
  if(!staffPath&&!queuePath&&!customerMatch&&!match)return false;need(user,'tasks:read');
  if(staffPath){if(req.method!=='GET')fail(405,'METHOD','不支持此请求');json(200,{items:db.prepare(eligibleSQL+' ORDER BY u.display_name,u.id').all(user.store_id)});return true;}
  if(queuePath){if(req.method!=='GET')fail(405,'METHOD','不支持此请求');const scope=url.searchParams.get('scope')||'mine',state=url.searchParams.get('assignment')||'all';if(!['mine','store'].includes(scope)||!['all','awaiting','accepted'].includes(state))fail(422,'VALIDATION','任务队列筛选不正确');const rows=db.prepare("SELECT * FROM work_tasks WHERE store_id=? AND (?='store' OR assignee_id=?) AND (?='all' OR assignment_status=?) ORDER BY updated_at DESC,id DESC LIMIT 101").all(user.store_id,scope,user.id,state,state);json(200,{items:rows.slice(0,100).map(visible),limit:100,truncated:rows.length>100,scope});return true;}
  if(customerMatch){const c=customer(user,customerMatch[1]);
   if(req.method==='GET'){const rows=db.prepare('SELECT * FROM work_tasks WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 101').all(c.id);json(200,{items:rows.slice(0,100).map(visible),limit:100,truncated:rows.length>100});return true;}
   if(req.method!=='POST')fail(405,'METHOD','不支持此请求');need(user,'tasks:assign');const b=await body(req);
   if(Object.keys(b).some(k=>!['title','instructions','cycle_id','cycle_version','visit_id','assignee_id','reason'].includes(k)))fail(422,'VALIDATION','任务身份与状态由系统保存');
   const input={title:field(b.title,'任务名称',120,true),instructions:field(b.instructions,'交接说明',1000,true),cycle_id:field(b.cycle_id,'周期编号',100),cycle_version:b.cycle_version??null,visit_id:field(b.visit_id,'到店编号',100),assignee_id:field(b.assignee_id,'接收人',100,true),reason:field(b.reason,'分派依据',300,true)};
   if(input.cycle_id?(!Number.isSafeInteger(input.cycle_version)||input.cycle_version<1):input.cycle_version!==null)fail(422,'VALIDATION','关联周期需要明确需求版本');
   json(201,mutation(req,user,`task.assign:${c.id}`,input,()=>{customer(user,c.id);assignee(user,input.assignee_id);const basis=context(user,c,input),id=randomUUID(),now=new Date().toISOString();
    db.prepare('INSERT INTO work_tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,c.store_id,input.title,input.instructions,input.cycle_id,input.cycle_version,input.visit_id,basis,input.assignee_id,'awaiting','pending',1,now,now,user.id);
    const row=task(user,id);event(user,row,'assign',input.reason);audit(user,'task.assign',id,{...row,reason:input.reason});return {task:visible(row)};
   }));return true;
  }
  const row=task(user,match[1]);
  if(req.method==='GET'&&!match[2]){json(200,{task:visible(row),events:db.prepare('SELECT e.*,u.display_name AS actor_name,a.display_name AS assignee_name,f.display_name AS from_assignee_name FROM task_events e JOIN users u ON u.id=e.actor_id JOIN users a ON a.id=e.assignee_id LEFT JOIN users f ON f.id=e.from_assignee_id WHERE task_id=? ORDER BY revision DESC LIMIT 100').all(row.id),limit:100});return true;}
  if(req.method!=='POST'||!match[2])fail(405,'METHOD','不支持此请求');const action=match[3],b=await body(req);need(user,'tasks:receive');
  if(Object.keys(b).some(k=>!['expected_revision','reason',...(action==='transfer'?['assignee_id']:[])].includes(k)))fail(422,'VALIDATION','只能提交接收或转交资料');
  const input={expected_revision:b.expected_revision,reason:field(b.reason,'操作依据',300,true),...(action==='transfer'?{assignee_id:field(b.assignee_id,'接收人',100,true)}:{})};if(!Number.isSafeInteger(input.expected_revision)||input.expected_revision<1)fail(422,'VALIDATION','请提供当前任务修订号');
  json(200,mutation(req,user,`task.${action}:${row.id}`,input,()=>{const before=task(user,row.id);if(before.revision!==input.expected_revision)fail(409,'TASK_CONFLICT','任务已被接收或转交，请刷新任务后再操作');
   if(action==='accept'){if(before.assignee_id!==user.id)fail(403,'NOT_ASSIGNEE','只有当前接收人可以接收任务');assignee(user,user.id);if(before.assignment_status!=='awaiting')fail(409,'ALREADY_ACCEPTED','任务已接收');}
   else{if(before.assignee_id!==user.id&&user.role!=='manager')fail(403,'NOT_OWNER','只有当前负责人或门店负责人可以转交任务');assignee(user,input.assignee_id);if(input.assignee_id===before.assignee_id)fail(409,'NO_CHANGES','请选择其他接收人');}
   db.prepare('UPDATE work_tasks SET assignee_id=?,assignment_status=?,revision=revision+1,updated_at=? WHERE id=?').run(action==='transfer'?input.assignee_id:user.id,action==='accept'?'accepted':'awaiting',new Date().toISOString(),row.id);
   const after=task(user,row.id);event(user,after,action,input.reason,before.assignee_id);audit(user,`task.${action}`,row.id,{...after,reason:input.reason},before);return {task:visible(after)};
  }));return true;
 };
}
