import {seedDemoLongitudinal} from '../src/demo-longitudinal.mjs';
import {seedDemoFamilyTraining} from '../src/demo-family-training.mjs';
import {seedDemoScheduling} from '../src/demo-scheduling.mjs';
import {seedDemoEntitlements} from '../src/demo-entitlements.mjs';
import { randomBytes } from 'node:crypto';
import { openDatabase, transaction, hashPassword } from '../src/db.mjs';
import { seedDemoScenarios, seedDemoPeople, seedDemoProfiles, seedDemoCycleRevisions, seedDemoTasks, seedDemoTaskExecution, seedDemoTaskExceptions, seedDemoTaskEvidence, seedDemoTaskCompletions, seedDemoTaskAmendments, seedDemoTaskChains, seedDemoRetail, seedDemoInventory, seedDemoPayments, seedDemoProcessing, seedDemoFulfillment, seedDemoAftercare,seedDemoAftercareWork,seedDemoReplacements,seedDemoDispositions,seedDemoRefunds,seedDemoParameters,seedDemoTraining } from '../src/demo-data.mjs';
if(process.env.NODE_ENV==='production')throw Error('Demo data is forbidden in production.');
const db=openDatabase(process.env.DATABASE_PATH||'data/workbench.sqlite');
if(db.prepare('SELECT 1 FROM users LIMIT 1').get()){
  try { const added=seedDemoScenarios(db);let practicePassword=null;if(db.prepare("SELECT 1 FROM users WHERE id='demo-manager' AND role='manager' AND active=1").get()&&!db.prepare("SELECT 1 FROM users WHERE id='demo-practice-parent'").get()){practicePassword=randomBytes(15).toString('base64url');db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-practice-parent','demo-practice-parent','家庭练习家长（虚构）',hashPassword(practicePassword),'guardian',null);}const people=seedDemoPeople(db),profiles=seedDemoProfiles(db),cycleRevisions=seedDemoCycleRevisions(db),tasks=seedDemoTasks(db),execution=seedDemoTaskExecution(db),exceptions=seedDemoTaskExceptions(db),evidence=seedDemoTaskEvidence(db),completion=seedDemoTaskCompletions(db),amendments=seedDemoTaskAmendments(db),chains=seedDemoTaskChains(db),retail=seedDemoRetail(db),inventory=seedDemoInventory(db),payments=seedDemoPayments(db),processing=seedDemoProcessing(db),fulfillment=seedDemoFulfillment(db),aftercare=seedDemoAftercare(db),work=seedDemoAftercareWork(db),replacements=seedDemoReplacements(db),dispositions=seedDemoDispositions(db),refunds=seedDemoRefunds(db),parameters=seedDemoParameters(db),training=seedDemoTraining(db),entitlements=seedDemoEntitlements(db),scheduling=seedDemoScheduling(db),family=seedDemoFamilyTraining(db),longitudinal=seedDemoLongitudinal(db);if(practicePassword)console.log(`demo-practice-parent（新增虚构家长）: ${practicePassword}`);console.log('保留原账号与密码；仅追加缺少的虚构案例、人员和家庭资料。',added,people,profiles,cycleRevisions,tasks,execution,exceptions,evidence,completion,amendments,chains,retail,inventory,payments,processing,fulfillment,aftercare,work,replacements,dispositions,refunds,parameters,training,entitlements,scheduling,family,longitudinal); }
  finally { db.close(); }
  process.exit(0);
}
const accounts=[['demo-manager','负责人样例','manager','store-a'],['demo-front','前台样例','reception','store-a'],['demo-professional','专业人员样例','professional','store-a'],['demo-other','另一门店样例','manager','store-b'],['demo-parent','家长样例','guardian',null],['demo-practice-parent','家庭练习家长（虚构）','guardian',null]].map(([id,name,role,store])=>({id,name,role,store,password:randomBytes(15).toString('base64url')}));
transaction(db,()=>{
  db.prepare('INSERT INTO stores VALUES (?,?)').run('store-a','示例视光门店 · A');db.prepare('INSERT INTO stores VALUES (?,?)').run('store-b','示例视光门店 · B');
  for(const a of accounts)db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run(a.id,a.id,a.name,hashPassword(a.password),a.role,a.store);
  const create=db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)');
  create.run('sample-child-a','store-a','小林（虚构）','2017-06-12','林家长（虚构）',null,new Date().toISOString(),'demo-manager');
  create.run('sample-child-b','store-a','小林弟弟（虚构）','2020-03-08','林家长（虚构）',null,new Date().toISOString(),'demo-manager');
  create.run('sample-child-c','store-b','小周（虚构）','2018-11-20','周家长（虚构）',null,new Date().toISOString(),'demo-other');
  db.prepare('INSERT INTO guardian_links (user_id,customer_id,active,relationship) VALUES (?,?,1,?)').run('demo-parent','sample-child-a','监护人（演示）');
  db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run('sample-cycle-a','sample-child-a','followup','建立长期复查资料的演示周期','draft',new Date().toISOString(),'demo-manager');
});seedDemoScenarios(db);seedDemoPeople(db);seedDemoProfiles(db);seedDemoCycleRevisions(db);seedDemoTasks(db);seedDemoTaskExecution(db);seedDemoTaskExceptions(db);seedDemoTaskEvidence(db);seedDemoTaskCompletions(db);seedDemoTaskAmendments(db);seedDemoTaskChains(db);seedDemoRetail(db);seedDemoInventory(db);seedDemoPayments(db);seedDemoProcessing(db);seedDemoFulfillment(db);seedDemoAftercare(db);seedDemoAftercareWork(db);seedDemoReplacements(db);seedDemoDispositions(db);seedDemoRefunds(db);seedDemoParameters(db);seedDemoTraining(db);seedDemoEntitlements(db);seedDemoScheduling(db);seedDemoFamilyTraining(db);seedDemoLongitudinal(db);db.close();
console.log('仅限本地开发的虚构资料。请保存本次随机生成的账号；密码不会写入源码或明文文件。');
for(const a of accounts)console.log(`${a.id} (${a.name}): ${a.password}`);
