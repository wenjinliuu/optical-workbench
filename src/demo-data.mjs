import { productRecord, insertProductVersion, insertOrderVersion } from './retail.mjs';
import { completionSnapshot, completionDigest, completionRecord } from './task-completions.mjs';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { transaction, hashPassword } from './db.mjs';

// Static snapshots explain future workflows; they are never executable tasks.
export const demoScenarios = [
  {id:'intake',customer_id:'sample-intake',name:'小陈（虚构）',birth_date:'2018-04-16',contact:'陈家长（虚构）',type:'followup',stage:'接待建档',index:0,owner:'前台',steps:['接待建档','检查登记','专业复核','随访安排'],goal:'首次到店，核对身份与已有资料',next:'核对家庭信息，登记本次到店目的',events:['家长预约到店','前台建立独立档案'],visit_status:'registered'},
  {id:'examination',customer_id:'sample-examination',name:'小许（虚构）',birth_date:'2016-09-10',contact:'许家长（虚构）',type:'followup',stage:'等待检查',index:1,owner:'检查人员',steps:['接待建档','检查登记','专业复核','随访安排'],goal:'复查需求登记，等待检查资料',next:'检查人员接收，实测结果单独记录',events:['身份核对完成','已登记到店，等待检查人员接收'],visit_status:'registered'},
  {id:'plan',customer_id:'sample-plan',name:'小唐（虚构）',birth_date:'2017-12-05',contact:'唐家长（虚构）',type:'training',stage:'等待计划确认',index:1,owner:'专业人员',steps:['评估资料','计划确认','课程安排','执行与复评'],goal:'训练需求待评估，不自动生成专业方案',next:'由具备职责的专业人员确认个人计划',events:['家长提交训练需求','资料待专业评估'],visit_status:'registered'},
  {id:'training',customer_id:'sample-training',name:'小安（虚构）',birth_date:'2015-08-22',contact:'安家长（虚构）',type:'training',stage:'训练执行样板',index:3,owner:'训练人员',steps:['评估资料','计划确认','课程安排','执行与复评'],goal:'展示课程执行、记录与复评的后续衔接',next:'记录实际内容与反馈，按已确认规则处理后续',events:['演示：计划版本与课程关联','演示：当次内容与反馈等待记录'],visit_status:'registered'},
  {id:'retail',customer_id:'sample-retail',name:'小陆（虚构）',birth_date:'2014-02-18',contact:'陆家长（虚构）',type:'retail',stage:'配镜交付样板',index:3,owner:'交付人员',steps:['处方与开单','加工与供货','质量检查','交付与回访'],goal:'展示质检、客户交付与回访之间的交接',next:'核对合格产品与原单，交付结果单独记录',events:['演示：加工与质检记录关联','演示：等待交付与签收'],visit_status:'registered'},
  {id:'followup',customer_id:'sample-child-a',name:'小林（虚构）',birth_date:'2017-06-12',contact:'林家长（虚构）',type:'followup',stage:'长期随访样板',index:2,owner:'随访人员',steps:['约定复查','联系预约','实际复查','下一轮安排'],goal:'到店结束后仍保留独立的长期服务周期',next:'联系家长确认下次安排，发送提醒不等于到店',events:['本次到店已结束','独立服务周期继续保留'],visit_status:'closed'}
];

export function seedDemoScenarios(db) {
  const manager=db.prepare("SELECT id FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a'").get();
  if(!manager) throw Error('请先在独立开发数据库执行 npm run demo；此脚本仅扩展示例账号的数据。');
  return transaction(db,()=>{
    let customers=0,cycles=0,visits=0,documents=0,attachments=0;const now=new Date().toISOString();
    for(const s of demoScenarios){
      const existing=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);
      if(existing&&!matchesDemoCustomer(db,existing,s))throw Error('示例编号与现有资料冲突，已回滚；不会覆盖档案。');
      if(!existing){db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run(s.customer_id,'store-a',s.name,s.birth_date,s.contact,null,now,manager.id);customers++;}
      const cycle_id=`demo-cycle-${s.id}`,visit_id=`demo-visit-${s.id}`;
      if(!db.prepare('SELECT 1 FROM service_cycles WHERE id=?').get(cycle_id)){db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run(cycle_id,s.customer_id,s.type,s.goal,'draft',now,manager.id);cycles++;}
      if(!db.prepare('SELECT 1 FROM visits WHERE id=?').get(visit_id)){
        db.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)').run(visit_id,s.customer_id,'store-a',s.goal,s.visit_status,now,s.visit_status==='closed'?now:null,manager.id);
        db.prepare('INSERT INTO visit_cycles VALUES (?,?,?)').run(visit_id,cycle_id,s.customer_id);visits++;
      }
      const document_id=`demo-document-${s.id}`,attachment_id=`demo-attachment-${s.id}`;
      if(!db.prepare('SELECT 1 FROM document_records WHERE id=?').get(document_id)){
        const bytes=Buffer.from(`虚构资料，仅用于开发展示\n客户：${s.name}\n需求：${s.goal}\n本附件不包含专业检查或诊断结论。\n`),hash=createHash('sha256').update(bytes).digest('hex');
        if(!db.prepare('SELECT 1 FROM attachments WHERE id=?').get(attachment_id)){
          db.prepare('INSERT OR IGNORE INTO attachment_blobs VALUES (?,?,?)').run(hash,bytes,bytes.length);
          db.prepare('INSERT INTO attachments (id,customer_id,filename,content_type,blob_sha256,size,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)').run(attachment_id,s.customer_id,'到店资料清单（虚构）.txt','text/plain',hash,bytes.length,now,manager.id);attachments++;
        }
        const f=db.prepare('SELECT customer_id FROM attachments WHERE id=?').get(attachment_id);if(f.customer_id!==s.customer_id)throw Error('示例附件编号冲突，已回滚。');
        db.prepare('INSERT INTO document_records VALUES (?,?,?,?)').run(document_id,s.customer_id,now,manager.id);
        const initial_id=`demo-version-${s.id}-1`;
        db.prepare('INSERT INTO document_versions VALUES (?,?,?,?,?,?,?,?,?,?)').run(initial_id,document_id,s.customer_id,1,'服务资料备忘（虚构）',`家长需求登记：${s.goal}\n来源：虚构演示资料；尚未形成专业结论。`,'guardian_report','初始演示记录',now,manager.id);
        db.prepare('INSERT INTO version_attachments VALUES (?,?,?)').run(initial_id,attachment_id,s.customer_id);
        if(['plan','followup'].includes(s.id)){
          const version_id=`demo-version-${s.id}-2`;
          db.prepare('INSERT INTO document_versions VALUES (?,?,?,?,?,?,?,?,?,?)').run(version_id,document_id,s.customer_id,2,'服务资料备忘（虚构）',`补充资料记录：${s.goal}\n演示衔接：${s.next}\n旧版需求记录保留，不自动成为专业确认。`,'employee','补充接待资料与后续安排（虚构）',now,manager.id);
          db.prepare('INSERT INTO version_attachments VALUES (?,?,?)').run(version_id,attachment_id,s.customer_id);
        }
        documents++;
      }
    }
    if(customers||cycles||visits||documents||attachments)db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'demo.seed','demo-scenarios',null,JSON.stringify({source:'synthetic',customers,cycles,visits,documents,attachments}),now);
    return {customers,cycles,visits,documents,attachments};
  });
}

export function seedDemoPeople(db) {
  const manager=db.prepare("SELECT id FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a'").get();
  if(!manager)throw Error('人员样例仅用于独立示例数据库。');
  return transaction(db,()=>{
    let added=0;
    for(const [id,name,active] of [['demo-onboarding','入职人员（虚构）',1],['demo-inactive','停用人员（虚构）',0]]){
      const existing=db.prepare('SELECT username,store_id FROM users WHERE id=?').get(id);
      if(existing){if(existing.username!==id||existing.store_id!=='store-a')throw Error('人员样例编号冲突，已回滚；不会覆盖账号。');continue;}
      if(db.prepare('SELECT 1 FROM users WHERE username=?').get(id))throw Error('人员样例账号冲突，已回滚。');
      // A new demo staff member is usable after its manager resets the unknown password.
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)').run(id,id,name,hashPassword(randomBytes(24).toString('base64url')),'reception','store-a',active);
      db.prepare('INSERT INTO user_security VALUES (?,1,1)').run(id);added++;
    }
    if(added)db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'demo.people','demo-people',null,JSON.stringify({source:'synthetic',added}),new Date().toISOString());
    return {added};
  });
}

// An edited demo remains identifiable by its immutable initial snapshot.
export function matchesDemoCustomer(db,row,scenario){
  if(!row||row.store_id!=='store-a')return false;
  if(row.name===scenario.name)return true;
  const initial=db.prepare('SELECT name FROM customer_profile_versions WHERE customer_id=? AND version=1').get(row.id);
  const latest=db.prepare('SELECT * FROM customer_profile_versions WHERE customer_id=? ORDER BY version DESC LIMIT 1').get(row.id);
  return row.created_by==='demo-manager'&&initial?.name===scenario.name&&['name','birth_date','contact_name','phone'].every(key=>row[key]===latest?.[key]);
}

export function seedDemoProfiles(db){
  const manager=db.prepare("SELECT id FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a'").get();
  if(!manager)throw Error('家庭资料样例仅用于独立示例数据库。');
  return transaction(db,()=>{
    let contacts=0,profiles=0;const now=new Date().toISOString();
    const scenarios=[...demoScenarios,{id:'sibling',customer_id:'sample-child-b',name:'小林弟弟（虚构）',contact:'林家长（虚构）'}];
    for(const s of scenarios){
      const row=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);if(!row)continue;
      if(!matchesDemoCustomer(db,row,s))throw Error('家庭样例编号冲突，已回滚；不会覆盖档案。');
      for(let i=0;i<2;i++){
        const id=`demo-contact-${s.id}-${i+1}`,existing=db.prepare('SELECT customer_id FROM family_contacts WHERE id=?').get(id);
        if(existing){if(existing.customer_id!==row.id)throw Error('联系人样例编号冲突，已回滚。');continue;}
        db.prepare('INSERT INTO family_contacts VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?)').run(id,row.id,i===0?s.contact:'备用家长（虚构）',i===0?'主要家长（演示）':'备用家长（演示）',i===0?'000-00000':'000-00001','guardian_report','虚构号码与资料，仅用于演示。',Number(!(s.id==='retail'&&i===1)),now,manager.id,now,manager.id);
        const created=db.prepare('SELECT * FROM family_contacts WHERE id=?').get(id);
        db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'contact.create',id,null,JSON.stringify({...created,reason:'虚构演示：登记家庭联系人'}),now);contacts++;
      }
      const version=db.prepare('SELECT MAX(version) v FROM customer_profile_versions WHERE customer_id=?').get(row.id).v;
      if(['plan','followup'].includes(s.id)&&version===1){
        db.prepare('UPDATE customers SET phone=? WHERE id=?').run('000-00000',row.id);
        db.prepare('INSERT INTO customer_profile_versions VALUES (?,?,?,?,?,?,?,?,?,?)').run(row.id,2,row.name,row.birth_date,row.contact_name,'000-00000','guardian_report','补充虚构联系电话，原建档资料保留',now,manager.id);profiles++;
      }
    }
    if(contacts||profiles)db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'demo.profiles','demo-profiles',null,JSON.stringify({source:'synthetic',contacts,profiles}),now);
    return {contacts,profiles};
  });
}

export function seedDemoCycleRevisions(db){
 const manager=db.prepare("SELECT id FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a'").get();if(!manager)throw Error('周期样例仅用于独立示例数据库。');
 return transaction(db,()=>{
  let versions=0,cycles=0,visits=0;const now=new Date().toISOString();
  for(const s of demoScenarios.filter(s=>['plan','followup'].includes(s.id))){
   const row=db.prepare('SELECT * FROM service_cycles WHERE id=?').get(`demo-cycle-${s.id}`);if(!row)continue;
   if(row.customer_id!==s.customer_id||row.type!==s.type)throw Error('周期样例编号冲突，已回滚；不会覆盖记录。');
   const v=db.prepare('SELECT * FROM cycle_versions WHERE cycle_id=? ORDER BY version DESC LIMIT 1').get(row.id);if(v.version!==1||row.goal!==s.goal)continue;
   const goal=row.goal+'；补充虚构需求，资料继续等待专业核对',reason='虚构演示：补充周期需求';
   db.prepare('UPDATE service_cycles SET goal=? WHERE id=?').run(goal,row.id);db.prepare('INSERT INTO cycle_versions VALUES (?,?,?,?,?,?,?,?,?)').run(row.id,row.customer_id,2,row.type,goal,'guardian_report',reason,now,manager.id);versions++;
   db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'cycle.revise',row.id,JSON.stringify({...row,version:1}),JSON.stringify({...row,goal,version:2,source:'guardian_report',revision_reason:reason}),now);
   if(s.id==='followup'){
    const cycleId='demo-cycle-followup-secondary',visitId='demo-visit-followup-later';
    const existingCycle=db.prepare('SELECT customer_id FROM service_cycles WHERE id=?').get(cycleId);if(existingCycle&&existingCycle.customer_id!==row.customer_id)throw Error('衔接样例编号冲突，已回滚。');
    if(!existingCycle){db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run(cycleId,row.customer_id,'training','虚构训练需求登记，等待专业评估','draft',now,manager.id);cycles++;}
    const existingVisit=db.prepare('SELECT customer_id FROM visits WHERE id=?').get(visitId);if(existingVisit&&existingVisit.customer_id!==row.customer_id)throw Error('衔接样例编号冲突，已回滚。');
    if(!existingVisit){db.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)').run(visitId,row.customer_id,'store-a','修订后复访，同时登记训练需求（虚构）','registered',now,null,manager.id);for(const id of [row.id,cycleId])db.prepare('INSERT INTO visit_cycles VALUES (?,?,?)').run(visitId,id,row.customer_id);visits++;}
   }
  }
  if(versions||cycles||visits)db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'demo.cycles','demo-cycles',null,JSON.stringify({source:'synthetic',versions,cycles,visits}),now);
  return {versions,cycles,visits};
 });
}

export function seedDemoTasks(db){
 const manager=db.prepare("SELECT * FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a' AND active=1").get();if(!manager)throw Error('任务样例仅用于独立示例数据库。');
 const colleague=db.prepare("SELECT u.* FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-front' AND u.username='demo-front' AND u.role='reception' AND u.store_id='store-a' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get();
 return transaction(db,()=>{let added=0;
  for(const [i,s] of demoScenarios.entries()){
   const c=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);if(!c||!matchesDemoCustomer(db,c,s))continue;
   const id=`demo-task-${s.id}`,existing=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);if(existing){if(existing.customer_id!==c.id||existing.title!==`资料与接待衔接（虚构） · ${s.name}`)throw Error('任务样例编号冲突，已回滚；不会覆盖交接。');continue;}
   const visit=db.prepare('SELECT * FROM visits WHERE id=? AND customer_id=?').get(`demo-visit-${s.id}`,c.id);if(!visit)continue;
   const ref=db.prepare("SELECT * FROM visit_cycle_versions WHERE visit_id=? AND basis='captured' ORDER BY cycle_id LIMIT 1").get(visit.id),target=colleague||manager,now=new Date().toISOString();
   db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by,candidate_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)').run(id,c.id,c.store_id,`资料与接待衔接（虚构） · ${s.name}`,'虚构协作案例：核对接待资料、说明资料来源，将专业确认交由后续独立流程。',ref?.cycle_id||null,ref?.version||null,visit.id,ref?'visit_cycle':'visit',target.id,'awaiting','pending',1,now,now,manager.id);
   function record(action,reason,actor,from=null){const t=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);db.prepare('INSERT INTO task_events (task_id,customer_id,revision,action,from_assignee_id,assignee_id,assignment_status,execution_status,reason,created_at,actor_id,candidate_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)').run(id,c.id,t.revision,action,from,t.assignee_id,t.assignment_status,t.execution_status,reason,t.updated_at,actor.id);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),c.store_id,actor.id,`task.${action}`,id,null,JSON.stringify({...t,reason,source:'synthetic'}),t.updated_at);}
   record('assign','虚构演示：分派接待资料核对',manager);
   if(i%3!==0){db.prepare("UPDATE work_tasks SET assignment_status='accepted',revision=2 WHERE id=?").run(id);record('accept','虚构演示：确认接收，尚未执行',target,target.id);}
   if(i%3===2&&colleague){db.prepare("UPDATE work_tasks SET assignee_id=?,assignment_status='awaiting',revision=3 WHERE id=?").run(manager.id,id);record('transfer','虚构演示：岗位交接，等待新接收人确认',colleague,colleague.id);}
   added++;
  }return {added};
 });
}

export function seedDemoTaskExecution(db){
 const manager=db.prepare("SELECT * FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a' AND active=1").get();if(!manager)throw Error('任务执行样例仅用于独立示例数据库。');
 const employee=db.prepare("SELECT u.* FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-professional' AND u.username='demo-professional' AND u.role='professional' AND u.store_id='store-a' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get()||manager;
 return transaction(db,()=>{let added=0;
  for(const [key,scenario,title,stage] of [['queued','examination','岗位待认领（虚构）','queued'],['claimed','intake','认领后待接收（虚构）','claimed'],['running','plan','资料核对执行（虚构）','running'],['paused','training','等待资料暂停（虚构）','paused'],['returned','followup','补充信息退回（虚构）','returned']]){
   const s=demoScenarios.find(s=>s.id===scenario),c=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);if(!c||!matchesDemoCustomer(db,c,s))continue;
   const id=`demo-task-execution-${key}`,existing=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);if(existing){if(existing.customer_id!==c.id||existing.title!==title)throw Error('执行任务样例编号冲突，已回滚；不会覆盖执行历史。');continue;}
   const ref=db.prepare("SELECT * FROM visit_cycle_versions WHERE visit_id=? AND basis='captured' ORDER BY cycle_id LIMIT 1").get(`demo-visit-${s.id}`),visitId=ref?.visit_id||null,role=['queued','claimed'].includes(stage)?employee.role:null,now=new Date().toISOString();
   db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by,candidate_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,c.store_id,title,'虚构通用协作：展示资料核对、暂停等待和退回补充，专业确认另行处理。',ref?.cycle_id||null,ref?.version||null,visitId,ref?'visit_cycle':'customer',role?null:employee.id,role?'queued':'awaiting','pending',1,now,now,manager.id,role);
   function event(action,actor,reason,from=null){const row=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);db.prepare('INSERT INTO task_events (task_id,customer_id,revision,action,from_assignee_id,assignee_id,assignment_status,execution_status,reason,created_at,actor_id,candidate_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,row.revision,action,from,row.assignee_id,row.assignment_status,row.execution_status,reason,row.updated_at,actor.id,row.candidate_role);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),c.store_id,actor.id,`task.${action}`,id,null,JSON.stringify({...row,reason,source:'synthetic'}),row.updated_at);}
   event('assign',manager,'虚构演示：安排协作任务');
   if(stage==='claimed'){db.prepare("UPDATE work_tasks SET assignee_id=?,assignment_status='awaiting',revision=2 WHERE id=?").run(employee.id,id);event('claim',employee,'虚构演示：岗位认领，接收尚待确认');}
   if(['running','paused','returned'].includes(stage)){
    db.prepare("UPDATE work_tasks SET assignment_status='accepted',revision=2 WHERE id=?").run(id);event('accept',employee,'虚构演示：本人核对并接收',employee.id);
    db.prepare("UPDATE work_tasks SET execution_status='running',revision=3 WHERE id=?").run(id);event('start',employee,'虚构演示：开始通用资料核对',employee.id);
    if(stage==='paused'){db.prepare("UPDATE work_tasks SET execution_status='paused',revision=4 WHERE id=?").run(id);event('pause',employee,'虚构演示：等待补充资料后再恢复',employee.id);}
    if(stage==='returned'){db.prepare("UPDATE work_tasks SET assignee_id=NULL,candidate_role='reception',assignment_status='queued',execution_status='paused',revision=4 WHERE id=?").run(id);event('return',employee,'虚构演示：退回前台补充信息，原执行已暂停',employee.id);}
   }
   added++;
  }return {added};
 });
}

export function seedDemoTaskExceptions(db){
 const manager=db.prepare("SELECT * FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a' AND active=1").get();if(!manager)throw Error('异常任务样例仅用于独立示例数据库。');
 const employee=db.prepare("SELECT u.* FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-professional' AND u.username='demo-professional' AND u.role='professional' AND u.store_id='store-a' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get()||manager;
 return transaction(db,()=>{let added=0;
  for(const [key,scenario,title,steps] of [['blocked','examination','资料待补充阻塞（虚构）',['block']],['cancelled','retail','接待安排取消（虚构）',['cancel']],['unblocked','training','补齐资料解除阻塞（虚构）',['block','unblock']],['restored','followup','重新安排恢复任务（虚构）',['cancel','restore']],['cancelled-blocked','plan','取消前仍有资料阻塞（虚构）',['block','cancel']]]){
   const s=demoScenarios.find(s=>s.id===scenario),c=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);if(!c||!matchesDemoCustomer(db,c,s))continue;
   const id=`demo-task-exception-${key}`,existing=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);if(existing){if(existing.customer_id!==c.id||existing.title!==title)throw Error('异常任务样例编号冲突，已回滚；不会覆盖处理历史。');continue;}
   const ref=db.prepare("SELECT * FROM visit_cycle_versions WHERE visit_id=? AND basis='captured' ORDER BY cycle_id LIMIT 1").get(`demo-visit-${s.id}`),now=new Date().toISOString();
   db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by,candidate_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)').run(id,c.id,c.store_id,title,'虚构协作案例：异常须保留原因和责任；解除或恢复后，员工核对后明确恢复执行。',ref?.cycle_id||null,ref?.version||null,ref?.visit_id||null,ref?'visit_cycle':'customer',employee.id,'awaiting','pending',1,now,now,manager.id);
   function record(action,reason,actor){const r=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);db.prepare('INSERT INTO task_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,r.revision,action,action==='assign'?null:r.assignee_id,r.assignee_id,r.assignment_status,r.execution_status,reason,r.updated_at,actor.id,r.candidate_role,r.lifecycle_status,r.exception_reason,r.restore_status,r.restore_reason);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),c.store_id,actor.id,`task.${action}`,id,null,JSON.stringify({...r,reason,source:'synthetic'}),r.updated_at);}
   record('assign','虚构演示：分派资料协作',manager);db.prepare("UPDATE work_tasks SET assignment_status='accepted',revision=2 WHERE id=?").run(id);record('accept','虚构演示：本人接收',employee);db.prepare("UPDATE work_tasks SET execution_status='running',revision=3 WHERE id=?").run(id);record('start','虚构演示：开始资料核对',employee);
   for(const action of steps){const row=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id),reason={block:'虚构演示：等待补充资料来源',unblock:'虚构演示：已补充并核对资料来源',cancel:'虚构演示：本次接待安排取消',restore:'虚构演示：重新安排本次协作，核对后再执行'}[action];let life=row.lifecycle_status,exception=row.exception_reason,restore=row.restore_status,restoreReason=row.restore_reason;if(action==='block'){life='blocked';exception=reason;}if(action==='unblock'){life='active';exception=null;}if(action==='cancel'){restore=life;restoreReason=exception;life='cancelled';exception=reason;}if(action==='restore'){life=restore;exception=restoreReason;restore=null;restoreReason=null;}db.prepare("UPDATE work_tasks SET lifecycle_status=?,exception_reason=?,restore_status=?,restore_reason=?,execution_status='paused',revision=revision+1 WHERE id=?").run(life,exception,restore,restoreReason,id);record(action,reason,employee);}
   added++;
  }return {added};
 });
}

export function seedDemoTaskEvidence(db){
 const manager=db.prepare("SELECT * FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a' AND active=1").get();if(!manager)throw Error('核对依据样例仅用于独立示例数据库。');
 return transaction(db,()=>{let conditions=0,evidence=0;
  for(const [id,scenario,revision,drafts] of [['demo-task-execution-running','plan',3,2],['demo-task-execution-paused','training',4,1],['demo-task-exception-blocked','examination',4,1],['demo-task-execution-queued','examination',1,0]]){
   const t=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id),s=demoScenarios.find(s=>s.id===scenario),c=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);if(!t||!c||!matchesDemoCustomer(db,c,s)||t.customer_id!==c.id||t.store_id!=='store-a'||t.revision!==revision||db.prepare('SELECT 1 FROM task_conditions WHERE task_id=?').get(id))continue;
   const actor=t.assignee_id?db.prepare("SELECT u.* FROM users u LEFT JOIN user_security sec ON sec.user_id=u.id WHERE u.id=? AND u.username IN('demo-manager','demo-professional') AND u.store_id='store-a' AND u.active=1 AND COALESCE(sec.must_change_password,0)=0").get(t.assignee_id):null;if(drafts&&(!actor||t.assignment_status!=='accepted'||t.lifecycle_status==='cancelled'))continue;
   const doc=db.prepare('SELECT * FROM document_versions WHERE id=? AND customer_id=?').get(`demo-version-${s.id}-1`,c.id),attachment=db.prepare('SELECT * FROM attachments WHERE id=? AND customer_id=? AND revoked_at IS NULL').get(`demo-attachment-${s.id}`,c.id);if(!doc||!attachment)continue;const now=new Date().toISOString();
   db.prepare("INSERT INTO task_conditions VALUES (?,?,1,?,'generic_record_review',?,1,1,?,?,?)").run(id,c.id,t.revision,'虚构通用资料核对：说明来源，并引用资料版本和附件；专业确认另行处理。','虚构演示：明确资料核对范围',now,manager.id);const condition=db.prepare('SELECT * FROM task_conditions WHERE task_id=?').get(id);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'task.conditions',id,null,JSON.stringify({...condition,source:'synthetic'}),now);conditions++;
   for(let v=1;v<=drafts;v++){const incomplete=id==='demo-task-exception-blocked'||drafts===2&&v===1,documents=incomplete?[]:[doc.id],attachments=incomplete?[]:[attachment.id],refs=JSON.stringify({document_version_ids:documents,attachment_ids:attachments});db.prepare('INSERT INTO task_evidence VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,v,t.revision,1,incomplete?null:'虚构核对说明：已记录来源并选定原资料 V1；草稿不代表专业确认。','employee',incomplete?'虚构演示：先存待补草稿':'虚构演示：补齐通用资料引用',refs,now,actor.id);for(const documentId of documents)db.prepare('INSERT INTO task_evidence_documents VALUES (?,?,?,?)').run(id,v,c.id,documentId);for(const attachmentId of attachments)db.prepare('INSERT INTO task_evidence_attachments VALUES (?,?,?,?)').run(id,v,c.id,attachmentId);const row=db.prepare('SELECT * FROM task_evidence WHERE task_id=? AND version=?').get(id,v);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,'task.evidence',id,null,JSON.stringify({...row,source:'synthetic'}),now);evidence++;}
  }return {conditions,evidence};
 });
}

export function seedDemoTaskCompletions(db){
 const manager=db.prepare("SELECT * FROM users WHERE id='demo-manager' AND username='demo-manager' AND role='manager' AND store_id='store-a' AND active=1").get(),employee=db.prepare("SELECT u.* FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-professional' AND u.username='demo-professional' AND u.role='professional' AND u.store_id='store-a' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get();if(!manager)throw Error('完成样例仅用于独立示例数据库。');if(!employee)return {added:0,completed:0};
 return transaction(db,()=>{let added=0,completed=0;for(const [key,scenario,title] of [['ready','intake','资料核对待提交（虚构）'],['completed','plan','通用资料核对已完成（虚构）']]){
  const s=demoScenarios.find(s=>s.id===scenario),c=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id),id=`demo-task-completion-${key}`;if(!c||!matchesDemoCustomer(db,c,s))continue;const existing=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);if(existing){if(existing.customer_id!==c.id||existing.title!==title)throw Error('完成样例编号冲突；不会覆盖现有产出。');continue;}
  const doc=db.prepare('SELECT * FROM document_versions WHERE id=? AND customer_id=?').get(`demo-version-${scenario}-1`,c.id),a=db.prepare('SELECT * FROM attachments WHERE id=? AND customer_id=? AND revoked_at IS NULL').get(`demo-attachment-${scenario}`,c.id);if(!doc||!a)continue;const now=new Date().toISOString();
  db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,'store-a',title,'虚构通用资料核对：本人接收、开始、保存依据、明确提交；专业确认另行处理。','customer',employee.id,'awaiting','pending',1,now,now,manager.id);
  function record(action,actor){const t=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);db.prepare('INSERT INTO task_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,t.revision,action,action==='assign'?null:employee.id,employee.id,t.assignment_status,t.execution_status,'虚构演示：'+action,now,actor.id,null,'active',null,null,null);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,`task.${action}`,id,null,JSON.stringify({...t,source:'synthetic'}),now);}
  record('assign',manager);db.prepare("UPDATE work_tasks SET assignment_status='accepted',revision=2 WHERE id=?").run(id);record('accept',employee);db.prepare("UPDATE work_tasks SET execution_status='running',revision=3 WHERE id=?").run(id);record('start',employee);
  db.prepare("INSERT INTO task_conditions VALUES (?,?,1,3,'generic_record_review',?,1,1,?,?,?)").run(id,c.id,'虚构范围：核对资料来源，固定原资料 V1 及附件。','虚构演示：明确本次范围',now,manager.id);db.prepare('INSERT INTO task_evidence VALUES (?,?,1,3,1,?,?,?,?,?,?)').run(id,c.id,'虚构说明：已核对来源，采用原资料 V1，等待明确提交。','employee','虚构演示：保存齐备依据',JSON.stringify({document_version_ids:[doc.id],attachment_ids:[a.id]}),now,employee.id);db.prepare('INSERT INTO task_evidence_documents VALUES (?,1,?,?)').run(id,c.id,doc.id);db.prepare('INSERT INTO task_evidence_attachments VALUES (?,1,?,?)').run(id,c.id,a.id);
  for(const [table,action,actor] of [['task_conditions','conditions',manager],['task_evidence','evidence',employee]])db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,'task.'+action,id,null,JSON.stringify({...db.prepare('SELECT * FROM '+table+' WHERE task_id=?').get(id),source:'synthetic'}),now);
  if(key==='completed'){const frozen=JSON.stringify(completionSnapshot(db,id,1,1));db.prepare("INSERT INTO task_completions VALUES (?,?,'generic_record_review',1,1,3,?,?,?,?,?,?)").run(id,c.id,'虚构产出：本次资料来源与引用核对已完成，原资料 V1 和附件固定。','虚构演示：本人明确提交',frozen,completionDigest(frozen),now,employee.id);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',employee.id,'task.complete',id,null,JSON.stringify(completionRecord(db,id)),now);completed++;}added++;
 }return {added,completed};});
}

export function seedDemoTaskAmendments(db){
 const ready=(id,role)=>db.prepare("SELECT u.* FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=? AND u.username=? AND u.role=? AND u.store_id='store-a' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get(id,id,role),manager=ready('demo-manager','manager'),professional=ready('demo-professional','professional'),front=ready('demo-front','reception');if(!manager)throw Error('更正与衔接样例仅用于独立示例数据库。');if(!professional||!front)return {added:0,corrections:0,followups:0};
 return transaction(db,()=>{
  const template='demo-task-completion-completed',base=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(template),original=db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(template),s=demoScenarios.find(s=>s.id==='plan'),c=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);if(!base||!original||!c||!matchesDemoCustomer(db,c,s)||base.customer_id!==c.id)return {added:0,corrections:0,followups:0};
  const id='demo-task-amendment-parent',title='完成说明更正衔接（虚构）',existing=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);if(existing){if(existing.customer_id!==c.id||existing.title!==title)throw Error('更正样例编号冲突；不会覆盖产出或后续任务。');return {added:0,corrections:0,followups:0};}
  const ref=db.prepare("SELECT * FROM visit_cycle_versions WHERE visit_id='demo-visit-plan' AND customer_id=? AND basis='captured' ORDER BY cycle_id LIMIT 1").get(c.id);if(!ref)return {added:0,corrections:0,followups:0};const now=new Date().toISOString();
  db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,'store-a',title,'虚构案例：原完成保留、更正仅说明、后续任务固定分派时所采用版本。',ref.cycle_id,ref.version,ref.visit_id,'visit_cycle',professional.id,'awaiting','pending',1,now,now,manager.id);
  function event(taskId,action,actor,reason){const t=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(taskId);db.prepare('INSERT INTO task_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(taskId,c.id,t.revision,action,action==='assign'?null:t.assignee_id,t.assignee_id,t.assignment_status,t.execution_status,reason,t.updated_at,actor.id,t.candidate_role,'active',null,null,null);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,'task.'+action,taskId,null,JSON.stringify({...t,reason,source:'synthetic'}),t.updated_at);}
  event(id,'assign',manager,'虚构演示：安排通用核对');db.prepare("UPDATE work_tasks SET assignment_status='accepted',revision=2 WHERE id=?").run(id);event(id,'accept',professional,'虚构演示：本人接收');db.prepare("UPDATE work_tasks SET execution_status='running',revision=3 WHERE id=?").run(id);event(id,'start',professional,'虚构演示：开始核对');
  db.prepare('INSERT INTO task_conditions SELECT ?,customer_id,1,3,scope,description,require_document,require_attachment,reason,?,created_by FROM task_conditions WHERE task_id=? AND version=1').run(id,now,template);db.prepare('INSERT INTO task_evidence SELECT ?,customer_id,1,3,1,notes,source,reason,references_json,?,created_by FROM task_evidence WHERE task_id=? AND version=1').run(id,now,template);for(const table of ['task_evidence_documents','task_evidence_attachments'])db.prepare('INSERT INTO '+table+' SELECT ?,1,customer_id,'+(table.endsWith('documents')?'document_version_id':'attachment_id')+' FROM '+table+' WHERE task_id=? AND evidence_version=1').run(id,template);
  for(const [table,action,actor] of [['task_conditions','conditions',manager],['task_evidence','evidence',professional]])db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,'task.'+action,id,null,JSON.stringify(db.prepare('SELECT * FROM '+table+' WHERE task_id=?').get(id)),now);
  const frozen=JSON.stringify(completionSnapshot(db,id,1,1)),sha=completionDigest(frozen),initial='虚构原产出：资料来源与原 V1 附件已核对，后续补充联系另行分派。';db.prepare("INSERT INTO task_completions VALUES (?,?,'generic_record_review',1,1,3,?,?,?,?,?,?)").run(id,c.id,initial,'虚构演示：明确提交通用核对',frozen,sha,now,professional.id);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',professional.id,'task.complete',id,null,JSON.stringify(db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(id)),now);
  function followup(key,name,version,summary,employee,role){const child='demo-task-followup-'+key;db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by,candidate_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(child,c.id,'store-a',name,'虚构后续协作：核对联系说明，保留原客户/到店/需求版本；专业确认另行处理。',ref.cycle_id,ref.version,ref.visit_id,'visit_cycle',employee,employee?'awaiting':'queued','pending',1,now,now,manager.id,role);event(child,'assign',manager,'虚构演示：显式分派关联任务');db.prepare('INSERT INTO task_followups VALUES (?,?,?,?,?,?,?,?,?)').run(child,c.id,id,version,sha,summary,'虚构演示：固定分派时的产出来源',now,manager.id);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'task.followup',id,null,JSON.stringify(db.prepare('SELECT * FROM task_followups WHERE task_id=?').get(child)),now);}
  followup('original','沿用原产出待接收（虚构）',null,initial,front.id,null);
  for(const [v,actor,text] of [[1,professional,'虚构更正 V1：补充说明资料来源为家长转录，原资料引用保持。'],[2,manager,'虚构更正 V2：本次仅通用来源核对，联系事项另由候选岗位接收。']]){db.prepare('INSERT INTO task_completion_corrections VALUES (?,?,?,?,?,?,?,?)').run(id,c.id,v,sha,text,'虚构演示：追加说明并保留旧版',now,actor.id);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,'task.correct',id,null,JSON.stringify(db.prepare('SELECT * FROM task_completion_corrections WHERE task_id=? AND version=?').get(id,v)),now);}
  followup('corrected','采用更正 V2 待认领（虚构）',2,'虚构更正 V2：本次仅通用来源核对，联系事项另由候选岗位接收。',null,'professional');return {added:3,corrections:2,followups:2};
 });
}

export function seedDemoTaskChains(db){
 const ready=(id,role)=>db.prepare("SELECT u.* FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=? AND u.username=? AND u.role=? AND u.store_id='store-a' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get(id,id,role),manager=ready('demo-manager','manager'),professional=ready('demo-professional','professional'),front=ready('demo-front','reception');
 if(!manager)throw Error('任务链样例仅用于独立示例数据库。');if(!professional||!front)return {added:0,completed:0,corrections:0,followups:0};
 return transaction(db,()=>{
  const template='demo-task-amendment-parent',base=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(template),receipt=db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(template),s=demoScenarios.find(s=>s.id==='plan'),c=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);
  if(!base||!receipt||!c||base.customer_id!==c.id||!matchesDemoCustomer(db,c,s))return {added:0,completed:0,corrections:0,followups:0};
  const root='demo-task-chain-root',title='多层协作起始核对（虚构）',existing=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(root);if(existing){if(existing.customer_id!==c.id||existing.title!==title)throw Error('任务链样例编号冲突；不会覆盖关联历史。');return {added:0,completed:0,corrections:0,followups:0};}
  if(db.prepare('SELECT 1 FROM task_evidence_attachments r JOIN attachments a ON a.id=r.attachment_id WHERE r.task_id=? AND r.evidence_version=1 AND a.revoked_at IS NOT NULL').get(template))return {added:0,completed:0,corrections:0,followups:0};
  const now=new Date().toISOString();
  function audit(actor,action,id,value){db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,'task.'+action,id,null,JSON.stringify({...value,source:'synthetic'}),now);}
  function event(id,action,actor,reason){const r=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);db.prepare('INSERT INTO task_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,r.revision,action,action==='assign'?null:r.assignee_id,r.assignee_id,r.assignment_status,r.execution_status,reason,r.updated_at,actor.id,r.candidate_role,r.lifecycle_status,r.exception_reason,r.restore_status,r.restore_reason);audit(actor,action,id,{...r,reason});}
  function add(id,name,employee,role=null,parent=null,source=null){
   db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by,candidate_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,'store-a',name,'虚构多层协作：分支各自接收和执行，保留实际来源与固定原需求 V1。',base.cycle_id,base.cycle_version,base.visit_id,base.context_basis,employee?.id||null,employee?'awaiting':'queued','pending',1,now,now,manager.id,role);event(id,'assign',manager,'虚构演示：明确分派');
   if(parent){const done=db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(parent),correction=source?db.prepare('SELECT * FROM task_completion_corrections WHERE task_id=? AND version=?').get(parent,source):null;db.prepare('INSERT INTO task_followups VALUES (?,?,?,?,?,?,?,?,?)').run(id,c.id,parent,source,done.snapshot_sha256,correction?.output_summary||done.output_summary,'虚构演示：固定分派时的来源',now,manager.id);audit(manager,'followup',parent,db.prepare('SELECT * FROM task_followups WHERE task_id=?').get(id));}
  }
  function run(id,employee){db.prepare("UPDATE work_tasks SET assignment_status='accepted',revision=2 WHERE id=?").run(id);event(id,'accept',employee,'虚构演示：本人独立接收');db.prepare("UPDATE work_tasks SET execution_status='running',revision=3 WHERE id=?").run(id);event(id,'start',employee,'虚构演示：明确开始');}
  function complete(id,summary){
   db.prepare('INSERT INTO task_conditions SELECT ?,customer_id,1,3,scope,description,require_document,require_attachment,reason,?,created_by FROM task_conditions WHERE task_id=? AND version=1').run(id,now,template);db.prepare('INSERT INTO task_evidence SELECT ?,customer_id,1,3,1,notes,source,reason,references_json,?,created_by FROM task_evidence WHERE task_id=? AND version=1').run(id,now,template);for(const table of ['task_evidence_documents','task_evidence_attachments'])db.prepare('INSERT INTO '+table+' SELECT ?,1,customer_id,'+(table.endsWith('documents')?'document_version_id':'attachment_id')+' FROM '+table+' WHERE task_id=? AND evidence_version=1').run(id,template);
   audit(manager,'conditions',id,db.prepare('SELECT * FROM task_conditions WHERE task_id=?').get(id));audit(professional,'evidence',id,db.prepare('SELECT * FROM task_evidence WHERE task_id=?').get(id));const frozen=JSON.stringify(completionSnapshot(db,id,1,1));db.prepare("INSERT INTO task_completions VALUES (?,?,'generic_record_review',1,1,3,?,?,?,?,?,?)").run(id,c.id,summary,'虚构演示：明确完成通用核对',frozen,completionDigest(frozen),now,professional.id);audit(professional,'complete',id,db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(id));
  }
  function correct(id,summary){const receipt=db.prepare('SELECT * FROM task_completions WHERE task_id=?').get(id);db.prepare('INSERT INTO task_completion_corrections VALUES (?,?,1,?,?,?,?,?)').run(id,c.id,receipt.snapshot_sha256,summary,'虚构演示：追加来源说明',now,manager.id);audit(manager,'correct',id,db.prepare('SELECT * FROM task_completion_corrections WHERE task_id=?').get(id));}
  add(root,title,professional);run(root,professional);complete(root,'虚构原说明：原资料 V1 已核对，后续事项逐项分派。');add('demo-task-chain-sibling','原说明分支待认领（虚构）',null,'reception',root);correct(root,'虚构更正 V1：说明资料来源，补充联系另行处理。');
  const middle='demo-task-chain-middle';add(middle,'第二层联系核对已完成（虚构）',professional,null,root,1);run(middle,professional);complete(middle,'虚构第二层产出：已核对联系说明，待补资料与安排分别分派。');correct(middle,'虚构第二层更正 V1：补充事项各自接收，不视为专业确认。');
  const blocked='demo-task-chain-blocked',running='demo-task-chain-running';add(blocked,'第三层补充资料阻塞（虚构）',professional,null,middle,1);run(blocked,professional);db.prepare("UPDATE work_tasks SET lifecycle_status='blocked',exception_reason='虚构演示：等待补充联系来源',execution_status='paused',revision=4 WHERE id=?").run(blocked);event(blocked,'block',professional,'虚构演示：等待补充联系来源');add(running,'第三层安排核对执行中（虚构）',front,null,middle,1);run(running,front);
  return {added:5,completed:2,corrections:2,followups:4};
 });
}

// Executable synthetic retail records. No inventory, payments or clinical conclusion is inferred.
export function seedDemoRetail(db){
 const actor=db.prepare("SELECT u.id FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-manager' AND u.username='demo-manager' AND u.store_id='store-a' AND u.role='manager' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get();if(!actor)throw Error('配镜样例仅用于有效负责人账号的独立示例数据库。');
 return transaction(db,()=>{
  let products=0,orders=0,versions=0;const now=new Date().toISOString(),audit=(action,id,value)=>db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,action,id,null,JSON.stringify({source:'synthetic',...value}),now);
  const catalog=[['frame','DEMO-FRAME-BLUE','轻量镜架 · 晴蓝（虚构）','frame','演示型号 A / 晴蓝 / 中号','副',68000,'active'],['lens','DEMO-LENS-CLEAR','日常镜片样品（虚构）','lens','演示系列 / 按片计价；专业参数另行确认','片',48000,'active'],['case','DEMO-CASE-CORAL','镜盒 · 珊瑚（虚构）','accessory','珊瑚色保护镜盒','个',3200,'active'],['service','DEMO-SERVICE-CARE','护理服务项目（虚构）','service','仅展示服务商品录入；实际服务另行记录','次',2000,'active'],['archive','DEMO-FRAME-ARCHIVE','历史镜架型号（虚构）','frame','停用目录示例；保留原型号','副',59000,'inactive']];
  for(const [key,sku,name,category,specification,unit,list_price_cents,status] of catalog){const id='demo-product-'+key,existing=db.prepare('SELECT * FROM retail_products WHERE id=?').get(id);if(existing){if(existing.store_id!=='store-a'||existing.sku!==sku)throw Error('配镜商品样例编号冲突，已回滚；不会覆盖目录。');continue;}db.prepare('INSERT INTO retail_products VALUES (?,?,?,?,?)').run(id,'store-a',sku,now,actor.id);const value=insertProductVersion(db,id,{name,category,brand:'虚构样品品牌',specification,unit,list_price_cents,status,reason:'虚构演示：建立商品目录'},actor.id,now);audit('retail.product.create',id,value);products++;versions++;}
  const cases=[['draft','sample-retail','demo-visit-retail','配镜选品草稿（虚构）',['frame','lens','case'],'draft'],['revised','sample-retail','demo-visit-retail','补充备用镜片（虚构）',['frame','lens'],'revised'],['cancelled','sample-intake',null,'取消的试选订单（虚构）',['frame','case'],'cancelled'],['customer','sample-child-a',null,'档案关联护理项目（虚构）',['service'],'draft']];
  for(const [key,customerId,visitId,title,goods,stage] of cases){const id='demo-order-'+key,existing=db.prepare('SELECT * FROM retail_orders WHERE id=?').get(id);if(existing){if(existing.store_id!=='store-a'||existing.customer_id!==customerId)throw Error('配镜订单样例编号冲突，已回滚；不会覆盖原单。');continue;}const c=db.prepare('SELECT * FROM customers WHERE id=? AND store_id=?').get(customerId,'store-a');if(!c||!demoScenarios.some(s=>s.customer_id===customerId&&matchesDemoCustomer(db,c,s)))continue;const ref=visitId?db.prepare("SELECT * FROM visit_cycle_versions WHERE visit_id=? AND cycle_id='demo-cycle-retail' AND customer_id=? AND basis='captured'").get(visitId,customerId):null;if(visitId&&!ref)continue;const items=goods.map(key=>{const p=productRecord(db,'demo-product-'+key);return {product_id:p.id,product_version:p.version,quantity:key==='lens'?2:1,unit_price_cents:p.list_price_cents,note:'虚构选品，专业确认后续处理'};});if(items.some(x=>productRecord(db,x.product_id).status!=='active'))continue;const doc=db.prepare('SELECT id FROM document_versions WHERE id=? AND customer_id=?').get('demo-version-'+(customerId==='sample-retail'?'retail':customerId==='sample-intake'?'intake':'followup')+'-1',customerId),attachment=db.prepare('SELECT id FROM attachments WHERE id=? AND customer_id=? AND revoked_at IS NULL').get('demo-attachment-'+(customerId==='sample-retail'?'retail':customerId==='sample-intake'?'intake':'followup'),customerId),input={title,notes:'虚构演示订单；当前仅保存选品明细，没有收款或专业确认。',items,document_version_ids:doc?[doc.id]:[],attachment_ids:attachment?[attachment.id]:[],reason:'虚构演示：建立订单草稿'},serial=db.prepare('SELECT COALESCE(max(serial),0)+1 n FROM retail_orders WHERE store_id=?').get('store-a').n;db.prepare('INSERT INTO retail_orders VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'store-a',customerId,serial,'OW-'+now.slice(0,10).replaceAll('-','')+'-'+String(serial).padStart(5,'0'),ref?.cycle_id??null,ref?.version??null,visitId,ref?'visit_cycle':'customer',now,actor.id);audit('retail.order.create',id,insertOrderVersion(db,id,input,actor.id,'draft',now));orders++;versions++;
   if(stage==='revised'){const next={...input,items:items.map(x=>x.product_id==='demo-product-lens'?{...x,quantity:4}:x),reason:'虚构演示：明确补充备用镜片数量'};audit('retail.order.revise',id,insertOrderVersion(db,id,next,actor.id,'draft',now));versions++;}
   if(stage==='cancelled'){audit('retail.order.cancel',id,insertOrderVersion(db,id,{...input,reason:'虚构演示：客户取消试选，原单保留'},actor.id,'cancelled',now));versions++;}
  }
  const frame=productRecord(db,'demo-product-frame');if(frame.version===1&&products&&orders){const value=insertProductVersion(db,frame.id,{...frame,list_price_cents:72800,reason:'虚构演示：目录调价，已保存订单仍用原价'},actor.id,now);audit('retail.product.revise',frame.id,value);versions++;}
  return {products,orders,versions};
 });
}
