import {insertWorkEvent,workRecord} from './aftercare-work.mjs';
import {insertDispatch,dispatchRecord} from './dispatch.mjs';
import {insertAftercareCase,insertAftercareEvent,aftercareRecord} from './aftercare.mjs';
import {insertFulfillmentEvent,fulfillmentRecord} from './fulfillment.mjs';
import {processingRecord,insertProcessingJob,insertProcessingEvent} from './processing.mjs';
import {insertPayment} from './payments.mjs';
import { insertStockEvent,insertReservation,orderInventory } from './inventory.mjs';
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
  for(const [key,customerId,visitId,title,goods,stage] of cases){const id='demo-order-'+key,existing=db.prepare('SELECT * FROM retail_orders WHERE id=?').get(id);if(existing){if(existing.store_id!=='store-a'||existing.customer_id!==customerId)throw Error('配镜订单样例编号冲突，已回滚；不会覆盖原单。');continue;}const c=db.prepare('SELECT * FROM customers WHERE id=? AND store_id=?').get(customerId,'store-a');if(!c||!demoScenarios.some(s=>s.customer_id===customerId&&matchesDemoCustomer(db,c,s)))continue;const ref=visitId?db.prepare("SELECT * FROM visit_cycle_versions WHERE visit_id=? AND cycle_id='demo-cycle-retail' AND customer_id=? AND basis='captured'").get(visitId,customerId):null;if(visitId&&!ref)continue;const items=goods.map(key=>{const p=productRecord(db,'demo-product-'+key);return {product_id:p.id,product_version:p.version,quantity:key==='lens'?2:1,unit_price_cents:p.list_price_cents,note:'虚构选品，专业确认后续处理'};});if(items.some(x=>productRecord(db,x.product_id).status!=='active'))continue;const doc=db.prepare('SELECT id FROM document_versions WHERE id=? AND customer_id=?').get('demo-version-'+(customerId==='sample-retail'?'retail':customerId==='sample-intake'?'intake':'followup')+'-1',customerId),attachment=db.prepare('SELECT id FROM attachments WHERE id=? AND customer_id=? AND revoked_at IS NULL').get('demo-attachment-'+(customerId==='sample-retail'?'retail':customerId==='sample-intake'?'intake':'followup'),customerId),input={title,notes:'虚构演示订单；选品明细保留当时版本，收款和专业确认分别记录。',items,document_version_ids:doc?[doc.id]:[],attachment_ids:attachment?[attachment.id]:[],reason:'虚构演示：建立订单草稿'},serial=db.prepare('SELECT COALESCE(max(serial),0)+1 n FROM retail_orders WHERE store_id=?').get('store-a').n;db.prepare('INSERT INTO retail_orders VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'store-a',customerId,serial,'OW-'+now.slice(0,10).replaceAll('-','')+'-'+String(serial).padStart(5,'0'),ref?.cycle_id??null,ref?.version??null,visitId,ref?'visit_cycle':'customer',now,actor.id);audit('retail.order.create',id,insertOrderVersion(db,id,input,actor.id,'draft',now));orders++;versions++;
   if(stage==='revised'){const next={...input,items:items.map(x=>x.product_id==='demo-product-lens'?{...x,quantity:4}:x),reason:'虚构演示：明确补充备用镜片数量'};audit('retail.order.revise',id,insertOrderVersion(db,id,next,actor.id,'draft',now));versions++;}
   if(stage==='cancelled'){audit('retail.order.cancel',id,insertOrderVersion(db,id,{...input,reason:'虚构演示：客户取消试选，原单保留'},actor.id,'cancelled',now));versions++;}
  }
  const frame=productRecord(db,'demo-product-frame');if(frame.version===1&&products&&orders){const value=insertProductVersion(db,frame.id,{...frame,list_price_cents:72800,reason:'虚构演示：目录调价，已保存订单仍用原价'},actor.id,now);audit('retail.product.revise',frame.id,value);versions++;}
  return {products,orders,versions};
 });
}

export function seedDemoInventory(db){
 const actor=db.prepare("SELECT u.id FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-manager' AND u.username='demo-manager' AND u.store_id='store-a' AND u.role='manager' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get();if(!actor)throw Error('库存样例仅用于有效示例负责人的独立开发库。');
 if(db.prepare('SELECT 1 FROM inventory_events LIMIT 1').get())return {movements:0,reservations:0};
 return transaction(db,()=>{const now=new Date().toISOString();let movements=0,reservations=0;const audit=(action,id,after)=>db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,action,id,null,JSON.stringify({source:'synthetic',...after}),now);
  const goods=[['frame',8,'副','frame'],['lens',16,'片','lens'],['case',10,'个','accessory']];if(goods.some(([key,,unit,category])=>{const p=productRecord(db,'demo-product-'+key);return !p||p.store_id!=='store-a'||p.unit!==unit||p.category!==category||p.status!=='active';}))return {movements:0,reservations:0};
  function move(key,action,quantity,reason){const p=productRecord(db,'demo-product-'+key),event=insertStockEvent(db,{product_id:p.id,product_version:p.version,store_id:'store-a',action,quantity,reason:'虚构演示：'+reason,created_at:now,created_by:actor.id});audit('inventory.'+action,p.id,{event});movements++;}
  for(const [key,quantity] of goods)move(key,'receive',quantity,'登记商品数量，不代表采购验收');move('frame','isolate',1,'一副镜架暂时隔离，不能预留');move('case','isolate',2,'镜盒隔离检查登记');move('case','unquarantine',1,'明确解除一只镜盒的隔离');
  for(const [id,release] of [['demo-order-revised',false],['demo-order-draft',true]]){const s=orderInventory(db,id);if(!s||!s.can_reserve)continue;let value=insertReservation(db,id,'reserve','虚构演示：按已保存明细预留商品',actor.id,now);audit('inventory.order.reserve',id,value);reservations++;movements+=value.active.lines.length;if(release){const n=value.active.lines.length;value=insertReservation(db,id,'release','虚构演示：修改选品前先释放预留',actor.id,now);audit('inventory.order.release',id,value);reservations++;movements+=n;}}
  return {movements,reservations};
 });
}

export function seedDemoPayments(db){
 const actor=db.prepare("SELECT u.id FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-manager' AND u.store_id='store-a' AND u.role='manager' AND u.active=1 AND COALESCE(s.must_change_password,0)=0").get();if(!actor||db.prepare('SELECT 1 FROM payment_events LIMIT 1').get())return {records:0};
 const expected=[['demo-order-revised',2,260000],['demo-order-draft',1,167200]];if(expected.some(([id,version,total])=>!db.prepare("SELECT 1 FROM retail_order_versions WHERE order_id=? AND version=? AND status='draft' AND subtotal_cents=? AND version=(SELECT max(version) FROM retail_order_versions WHERE order_id=?)").get(id,version,total,id)))return {records:0};
 return transaction(db,()=>{const now=new Date().toISOString();let records=0;function save(id,action,input){const event=insertPayment(db,id,action,{received_at:now,...input},actor.id,now);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor.id,'payments.'+action,id,null,JSON.stringify({event}),now);records++;return event;}
 save('demo-order-revised','receive',{amount_cents:100000,method:'transfer',reference:'DEMO-RECEIPT-PART-1',reason:'虚构演示：第一笔分次收款，固定原单V2'});save('demo-order-revised','receive',{amount_cents:160000,method:'card',reference:'DEMO-RECEIPT-PART-2',reason:'虚构演示：第二笔收款，登记合计与原单明细相同'});
 const wrong=save('demo-order-draft','receive',{amount_cents:50000,method:'cash',reference:null,reason:'虚构演示：尚未发生的金额被误登记'});save('demo-order-draft','void',{source_id:wrong.id,reason:'虚构演示：负责人纠正误登记，未向客户退钱'});save('demo-order-draft','receive',{amount_cents:30000,method:'cash',reference:null,reason:'虚构演示：补记实际发生的第一笔收款'});return {records};});
}

export function seedDemoProcessing(db){
 const staff=['demo-manager','demo-front','demo-professional'];if(staff.some(id=>!db.prepare("SELECT 1 FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=? AND u.store_id='store-a' AND u.active=1 AND u.role IN('manager','reception','professional') AND COALESCE(s.must_change_password,0)=0").get(id))||db.prepare('SELECT 1 FROM processing_jobs LIMIT 1').get())return {jobs:0,events:0,orders:0,stock_movements:0};
 if([['demo-order-draft',1],['demo-order-revised',2]].some(([id,version])=>!db.prepare("SELECT 1 FROM retail_order_versions WHERE order_id=? AND version=? AND version=(SELECT max(version) FROM retail_order_versions WHERE order_id=?) AND status='draft'").get(id,version,id))||['demo-product-frame','demo-product-lens'].some(id=>productRecord(db,id)?.status!=='active'))return {jobs:0,events:0,orders:0,stock_movements:0};
 return transaction(db,()=>{const now=new Date().toISOString(),day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10),actor='demo-manager';let jobs=0,events=0,orders=0,stock_movements=0;const audit=(action,id,value)=>db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor,action,id,null,JSON.stringify({source:'synthetic',...value}),now);
 function makeOrder(key,title,customerId,keys){const id='demo-order-processing-'+key;if(db.prepare('SELECT 1 FROM retail_orders WHERE id=?').get(id))throw Error('加工样例订单编号冲突，已回滚，不覆盖原单');const serial=db.prepare("SELECT COALESCE(max(serial),0)+1 n FROM retail_orders WHERE store_id='store-a'").get().n,input={title,notes:'虚构加工阶段订单，专业参数与质检交付后续确认。',items:keys.map(key=>{const p=productRecord(db,'demo-product-'+key);return {product_id:p.id,product_version:p.version,quantity:key==='lens'?2:1,unit_price_cents:p.list_price_cents,note:'虚构供货加工展示'};}),document_version_ids:[],attachment_ids:[],reason:'虚构演示：建立加工阶段原单'};db.prepare('INSERT INTO retail_orders VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'store-a',customerId,serial,'OW-'+now.slice(0,10).replaceAll('-','')+'-'+String(serial).padStart(5,'0'),null,null,null,'customer',now,actor);const value=insertOrderVersion(db,id,input,actor,'draft',now);audit('retail.order.create',id,value);orders++;return id;}
 const planned=makeOrder('planned','待订货安排（虚构）','sample-retail',['frame']),ready=makeOrder('ready','加工完成待质检（虚构）','sample-intake',['frame','lens']),cancelled=makeOrder('cancelled','取消未执行加工计划（虚构）','sample-retail',['frame']);
 function make(id,key,stock=false){const version=db.prepare('SELECT max(version) v FROM retail_order_versions WHERE order_id=?').get(id).v,lines=db.prepare("SELECT i.position,i.product_id FROM retail_order_items i JOIN retail_product_versions p ON p.product_id=i.product_id AND p.version=i.product_version WHERE i.order_id=? AND i.version=? AND p.category<>'service' ORDER BY i.position").all(id,version).map(l=>({position:l.position,supply_mode:stock&&l.product_id!=='demo-product-frame'?'stock':'purchase',processing_mode:key==='ready'?'external':'internal',supplier_name:stock&&l.product_id!=='demo-product-frame'?null:'虚构供应/加工方',assignee_id:'demo-professional',due_date:key==='planned'?null:day(2),instructions:'虚构演示：按原单分项记录供货和加工，不生成专业参数'})),value=insertProcessingJob(db,id,{lines,reason:'虚构演示：建立原单加工安排'},actor,now,'demo-processing-'+key);audit('processing.create',value.id,value);jobs++;events++;return value;}
 function step(j,action,position,quantity,extra={}){const value=insertProcessingEvent(db,j.id,{action,position,quantity,reason:'虚构演示：'+({receive:'分批到货/原单备料',start:'本次开工',complete:'本次加工备货完成，质检后续接续',delay:'供应延期，原进度和旧交期保留',cancel:'未执行计划取消'}[action]),...(action==='delay'?{due_date:day(5)}:{}),...extra},actor,now);audit('processing.'+action,j.id,value);events++;return value;}
 const stock=orderInventory(db,'demo-order-draft');if(!stock.active){if(!stock.can_reserve)throw Error('原单加工虚构备料所需库存不足，已回滚');const value=insertReservation(db,stock.order_id,'reserve','虚构演示：加工前明确预留原订单商品',actor,now);audit('inventory.order.reserve',stock.order_id,value);stock_movements+=value.active.lines.length;}
 let j=make('demo-order-draft','split',true);step(j,'receive',2,1);step(j,'start',2,1);step(j,'delay',1,undefined);j=make('demo-order-revised','parallel',true);step(j,'receive',1,1);step(j,'start',1,1);step(j,'complete',1,1);step(j,'receive',2,2);step(j,'start',2,1);step(j,'complete',2,1);make(planned,'planned');j=make(ready,'ready');for(const line of j.lines){step(j,'receive',line.position,line.quantity);step(j,'start',line.position,line.quantity);step(j,'complete',line.position,line.quantity);}j=make(cancelled,'cancelled');step(j,'cancel',undefined,undefined);return {jobs,events,orders,stock_movements};});
}

export function seedDemoFulfillment(db){
 if(db.prepare('SELECT 1 FROM fulfillment_events LIMIT 1').get()||!db.prepare("SELECT 1 FROM processing_jobs WHERE id='demo-processing-ready'").get())return {jobs:0,events:0};
 const template=processingRecord(db,'demo-processing-ready');if(template.state!=='awaiting_qc'||!['demo-manager','demo-professional'].every(id=>db.prepare("SELECT 1 FROM users WHERE id=? AND active=1 AND store_id='store-a'").get(id)))return {jobs:0,events:0};
 return transaction(db,()=>{const now=new Date().toISOString(),actor='demo-manager';let count=0;const audit=(action,id,value)=>db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor,action,id,null,JSON.stringify({source:'synthetic',...value}),now);
 function make(key,title){const id='demo-order-fulfillment-'+key,jid='demo-processing-fulfillment-'+key;if(db.prepare('SELECT 1 FROM retail_orders WHERE id=?').get(id)||db.prepare('SELECT 1 FROM processing_jobs WHERE id=?').get(jid))throw Error('质检样例编号冲突，不覆盖原记录');const serial=db.prepare("SELECT max(serial)+1 n FROM retail_orders WHERE store_id='store-a'").get().n;db.prepare('INSERT INTO retail_orders VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'store-a',template.customer_id,serial,'OW-'+now.slice(0,10).replaceAll('-','')+'-'+String(serial).padStart(5,'0'),null,null,null,'customer',now,actor);const original=db.prepare('SELECT * FROM retail_order_items WHERE order_id=? AND version=? ORDER BY position').all(template.order_id,template.order_version),o=insertOrderVersion(db,id,{title,notes:'虚构质检与签收阶段，项目仅为演示记录',items:original.map(({product_id,product_version,quantity,unit_price_cents,note})=>({product_id,product_version,quantity,unit_price_cents,note})),document_version_ids:[],attachment_ids:[],reason:'虚构展示：建立质检阶段原单'},actor,'draft',now);audit('retail.order.create',id,o);const lines=template.lines.map(({position,supply_mode,processing_mode,supplier_name,assignee_id,due_date,instructions})=>({position,supply_mode,processing_mode,supplier_name,assignee_id,due_date,instructions})),j=insertProcessingJob(db,id,{lines,reason:'虚构展示：明确原单加工安排'},actor,now,jid);audit('processing.create',jid,j);for(const l of j.lines)for(const action of ['receive','start','complete']){const value=insertProcessingEvent(db,jid,{action,position:l.position,quantity:l.quantity,reason:'虚构展示：原单分项加工进度'},actor,now);audit('processing.'+action,jid,value);}return jid;}
 function step(id,action,position,quantity,source_id=null,extra={}){const result=insertFulfillmentEvent(db,id,{action,position,quantity,source_id,reason:'虚构展示：'+({check_pass:'明确项目与合格结论',check_fail:'不合格保持，进入返工',rework_assign:'本店责任人与返工说明',rework_start:'责任人开始返工',rework_complete:'返工完成后重新质检',deliver:'原合格批次分项签收'}[action]),...(action.startsWith('check_')?{checks:[{label:'虚构外观核对项目（非专业标准）',result:action==='check_pass'?'pass':'fail',notes:'纯虚构演示，仅展示项目/结论保存'}]}:{}),...(action==='rework_assign'?{assignee_id:'demo-professional',instructions:'虚构返工安排：复核本项外观并重新提交质检，不改变专业参数'}:{}),...(action==='deliver'?{receiver_name:'演示领取人（虚构）',receipt_note:'虚构签收说明；实际签收证据与库存出库另行办理',handed_at:now}:{}),...extra},actor,now);audit('fulfillment.'+action,result.event.id,result);count++;return result.event;}
 const ready=make('ready','质检合格待交付（虚构）'),rework=make('rework','返工复检仍不合格（虚构）'),delivered=make('delivered','全部分项已签收（虚构）');for(const l of template.lines){step(ready,'check_pass',l.position,l.quantity);const p=step(delivered,'check_pass',l.position,l.quantity);step(delivered,'deliver',l.position,l.quantity,p.id);}
 const bad=step(rework,'check_fail',1,1),assigned=step(rework,'rework_assign',1,1,bad.id),started=step(rework,'rework_start',1,1,assigned.id),finished=step(rework,'rework_complete',1,1,started.id);step(rework,'check_fail',1,1,finished.id);
 const parallel=fulfillmentRecord(db,'demo-processing-parallel');if(parallel?.lines[0].completed){const pass=step(parallel.id,'check_pass',1,1);step(parallel.id,'deliver',1,1,pass.id);}return {jobs:3,events:count};});
}

export function seedDemoAftercare(db){
 if(fulfillmentRecord(db,'demo-processing-ready')?.revision!==0||db.prepare('SELECT 1 FROM inventory_outbounds LIMIT 1').get()||db.prepare('SELECT 1 FROM aftercare_cases LIMIT 1').get()||!db.prepare("SELECT 1 FROM processing_jobs WHERE id='demo-processing-fulfillment-delivered'").get())return {outbounds:0,cases:0,events:0};
 return transaction(db,()=>{const now=new Date().toISOString(),actor='demo-manager';let outbounds=0,events=0;const audit=(action,id,value)=>db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor,action,id,null,JSON.stringify({source:'synthetic',...value}),now),receipt=(job,position)=>db.prepare("SELECT id FROM fulfillment_events WHERE job_id=? AND position=? AND action='deliver' ORDER BY revision LIMIT 1").get(job,position)?.id;
 function ship(id,quantity){const r=dispatchRecord(db,id);if(!r||!r.eligible||quantity>r.remaining||quantity>(r.source_mode==='reserved'?Math.min(r.stock.reserved,r.reservation_remaining):r.stock.available))throw Error('出库演示所需签收或实物数量变化，已回滚，不覆盖原记录');const value=insertDispatch(db,id,{quantity,reason:'虚构演示：明确原签收批次实际出库'},actor,now);audit('dispatch.create',value.event.id,value);outbounds++;return value.event;}
 const parallel=receipt('demo-processing-parallel',1),frame=receipt('demo-processing-fulfillment-delivered',1),lens=receipt('demo-processing-fulfillment-delivered',2);ship(parallel,1);ship(frame,1);const lensOut=ship(lens,1);
 const source=fulfillmentRecord(db,'demo-processing-ready');if(source.revision!==0)throw Error('待质检原单已人工处理，出库演示追加已回滚');const checked=insertFulfillmentEvent(db,source.id,{action:'check_pass',position:1,quantity:1,checks:[{label:'虚构外观核对（非专业标准）',result:'pass',notes:'为出库/售后阶段展示明确保存'}],reason:'虚构展示：原待质检分项确认'},actor,now);audit('fulfillment.check_pass',checked.event.id,checked);const signed=insertFulfillmentEvent(db,source.id,{action:'deliver',position:1,quantity:1,source_id:checked.event.id,receiver_name:'示例领取人（虚构）',receipt_note:'实际签收样例，尚未登记出库',handed_at:now,reason:'虚构展示：已签收待核对出库'},actor,now);audit('fulfillment.deliver',signed.event.id,signed);
 function make(id,key,kind,title){const c=insertAftercareCase(db,id,{kind,quantity:1,title,note:'虚构售后问题与需求，真实退款/专业重做规则另行确认',reason:'虚构展示：从原签收建立售后'},actor,now,'demo-aftercare-'+key);audit('aftercare.create',c.id,c);events++;return c;}
 function step(c,action,extra={}){const value=insertAftercareEvent(db,c.id,{action,note:'虚构展示：'+({assign:'明确责任人与预计日期',start:'本次责任人开始处理',pause:'等待进一步核对，保留原单',resolve:'结束本次处理记录，不自动退款或改变商品',receive_return:'原出库商品退回隔离，不能直接可售'}[action]),reason:'虚构演示处理依据',...(action==='assign'?{assignee_id:'demo-professional',due_date:new Date(Date.now()+3*86400000).toISOString().slice(0,10)}:{}),...extra},actor,now);audit('aftercare.'+action,value.event.id,value);events++;return value.aftercare;}
 let c=make(parallel,'repair','repair','镜架维修处理中（虚构）');step(c,'assign');step(c,'start');c=make(lens,'return','return','退回镜片已隔离待检（虚构）');step(c,'receive_return',{dispatch_id:lensOut.id,return_quantity:1,returner_name:'演示返还人（虚构）'});step(c,'assign',{assignee_id:'demo-front'});c=make(frame,'complaint','complaint','原单投诉处理记录已结束（虚构）');step(c,'assign',{assignee_id:'demo-front'});step(c,'start');step(c,'resolve');c=make(signed.event.id,'remake','remake','重做需求等待确认（虚构）');step(c,'assign');step(c,'start');step(c,'pause');return {outbounds,cases:4,events};});
}

export function seedDemoAftercareWork(db){
 const empty={cases:0,case_events:0,work_events:0};if(db.prepare('SELECT 1 FROM aftercare_work_events LIMIT 1').get())return empty;
 const repair=aftercareRecord(db,'demo-aftercare-repair'),returned=aftercareRecord(db,'demo-aftercare-return'),complaint=aftercareRecord(db,'demo-aftercare-complaint');
 if(!repair||repair.status!=='running'||repair.revision!==3||repair.return_received_quantity!==0||!returned||returned.revision!==3||returned.status!=='assigned'||returned.return_received_quantity!==1||complaint?.status!=='resolved'||complaint.revision!==4)return empty;
 if(['demo-manager','demo-front','demo-professional'].some(id=>!db.prepare("SELECT 1 FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=? AND u.active=1 AND u.store_id='store-a' AND COALESCE(s.must_change_password,0)=0").get(id)))return empty;
 return transaction(db,()=>{const actor='demo-manager',now=new Date().toISOString();let case_events=0,work_events=0;const audit=(action,id,value)=>db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',actor,action,id,null,JSON.stringify({source:'synthetic',...value}),now);
 function step(id,action,extra={}){const v=insertAftercareEvent(db,id,{action,note:'虚构演示：实际退回维修与归还接续',reason:'虚构原件维修流程展示',...(action==='assign'?{assignee_id:'demo-professional',due_date:null}:{}),...extra},actor,now);audit('aftercare.'+action,v.event.id,v);case_events++;return v;}
 function work(id,action,source_id=null,extra={}){const v=insertWorkEvent(db,id,{action,source_id,quantity:1,note:'虚构演示：原件维修批次与复检记录',reason:'虚构原件维修流程依据',...(['plan','rework_plan'].includes(action)?{assignee_id:'demo-professional',instructions:'虚构原件维修说明，具体专业标准由机构确认'}:{}),...(action.startsWith('check_')?{checks:[{label:'虚构外观复检项目（非专业标准）',result:action==='check_pass'?'pass':'fail',notes:'本次项目与明确结论仅为虚构展示'}]}:{}),...(action==='return'?{receiver_name:'示例原件领取人（虚构）',returned_at:now,receipt_note:'虚构原件实际归还签收说明'}:{}),...extra},actor,now);audit('aftercare.work.'+action,v.event.id,v);work_events++;return v.event;}
 const out=dispatchRecord(db,repair.delivery_id).history[0];if(!out)throw Error('原维修案例缺少实际出库，不覆盖原记录');const intake=step(repair.id,'receive_return',{dispatch_id:out.id,return_quantity:1,returner_name:'示例维修返还人（虚构）'}).event;
 let e=work(repair.id,'plan',null,{return_id:intake.id});e=work(repair.id,'start',e.id);e=work(repair.id,'complete',e.id);e=work(repair.id,'check_fail',e.id);e=work(repair.id,'rework_plan',e.id);e=work(repair.id,'rework_start',e.id);e=work(repair.id,'rework_complete',e.id);work(repair.id,'check_pass',e.id);
 work(returned.id,'plan',null,{return_id:workRecord(db,returned.id).returns[0].id});
 const id='demo-aftercare-repair-returned';if(aftercareRecord(db,id))throw Error('维修展示编号冲突，不覆盖原记录');const c=insertAftercareCase(db,complaint.delivery_id,{kind:'repair',quantity:1,title:'维修复检后原件已归还（虚构）',note:'虚构原件维修并归还，非退款或换货',reason:'虚构流程展示'},actor,now,id);audit('aftercare.create',id,c);case_events++;
 const r=step(id,'receive_return',{dispatch_id:dispatchRecord(db,c.delivery_id).history[0].id,return_quantity:1,returner_name:'示例返还人（虚构）'}).event;step(id,'assign');step(id,'start');e=work(id,'plan',null,{return_id:r.id});e=work(id,'start',e.id);e=work(id,'complete',e.id);e=work(id,'check_pass',e.id);work(id,'return',e.id);step(id,'resolve');return {cases:1,case_events,work_events};
 });
}
