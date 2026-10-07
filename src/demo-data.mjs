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
   db.prepare('INSERT INTO work_tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,c.store_id,`资料与接待衔接（虚构） · ${s.name}`,'虚构协作案例：核对接待资料、说明资料来源，将专业确认交由后续独立流程。',ref?.cycle_id||null,ref?.version||null,visit.id,ref?'visit_cycle':'visit',target.id,'awaiting','pending',1,now,now,manager.id);
   function record(action,reason,actor,from=null){const t=db.prepare('SELECT * FROM work_tasks WHERE id=?').get(id);db.prepare('INSERT INTO task_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,t.revision,action,from,t.assignee_id,t.assignment_status,t.execution_status,reason,t.updated_at,actor.id);db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),c.store_id,actor.id,`task.${action}`,id,null,JSON.stringify({...t,reason,source:'synthetic'}),t.updated_at);}
   record('assign','虚构演示：分派接待资料核对',manager);
   if(i%3!==0){db.prepare("UPDATE work_tasks SET assignment_status='accepted',revision=2 WHERE id=?").run(id);record('accept','虚构演示：确认接收，尚未执行',target,target.id);}
   if(i%3===2&&colleague){db.prepare("UPDATE work_tasks SET assignee_id=?,assignment_status='awaiting',revision=3 WHERE id=?").run(manager.id,id);record('transfer','虚构演示：岗位交接，等待新接收人确认',colleague,colleague.id);}
   added++;
  }return {added};
 });
}
