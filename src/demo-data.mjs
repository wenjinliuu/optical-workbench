import { randomUUID } from 'node:crypto';
import { transaction } from './db.mjs';

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
    let customers=0,cycles=0,visits=0;const now=new Date().toISOString();
    for(const s of demoScenarios){
      const existing=db.prepare('SELECT name,store_id FROM customers WHERE id=?').get(s.customer_id);
      if(existing&&(existing.name!==s.name||existing.store_id!=='store-a'))throw Error('示例编号与现有资料冲突，已回滚；不会覆盖档案。');
      if(!existing){db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run(s.customer_id,'store-a',s.name,s.birth_date,s.contact,null,now,manager.id);customers++;}
      const cycle_id=`demo-cycle-${s.id}`,visit_id=`demo-visit-${s.id}`;
      if(!db.prepare('SELECT 1 FROM service_cycles WHERE id=?').get(cycle_id)){db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run(cycle_id,s.customer_id,s.type,s.goal,'draft',now,manager.id);cycles++;}
      if(!db.prepare('SELECT 1 FROM visits WHERE id=?').get(visit_id)){
        db.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)').run(visit_id,s.customer_id,'store-a',s.goal,s.visit_status,now,s.visit_status==='closed'?now:null,manager.id);
        db.prepare('INSERT INTO visit_cycles VALUES (?,?,?)').run(visit_id,cycle_id,s.customer_id);visits++;
      }
    }
    if(customers||cycles||visits)db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),'store-a',manager.id,'demo.seed','demo-scenarios',null,JSON.stringify({source:'synthetic',customers,cycles,visits}),now);
    return {customers,cycles,visits};
  });
}
