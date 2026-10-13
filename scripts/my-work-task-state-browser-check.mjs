import {seedDemoStaffHandover} from '../src/demo-staff-handover.mjs';
import {seedDemoBatches} from '../src/demo-inventory-batches.mjs';
import {verifyBatches} from '../src/inventory-batch-recovery.mjs';
import * as R from '../src/purchase-receiving.mjs';
import {seedDemoCustody} from '../src/demo-inventory-custody.mjs';
import {verifyCustody} from '../src/inventory-custody-recovery.mjs';
import {seedDemoExtraReturns} from '../src/demo-purchase-extra-returns.mjs';
import {verifyExtraReturns} from '../src/purchase-extra-return-recovery.mjs';
import {seedDemoSupplierReturns} from '../src/demo-supplier-returns.mjs';
import {verifySupplierReturns} from '../src/supplier-return-recovery.mjs';
import {seedDemoPurchaseQuality} from '../src/demo-purchase-quality.mjs';
import {verifyPurchaseQuality} from '../src/purchase-quality-recovery.mjs';
import {seedDemoReceiving} from '../src/demo-purchase-receiving.mjs';
import {verifyReceiving} from '../src/purchase-receiving-recovery.mjs';
import {seedDemoProcurement} from '../src/demo-procurement.mjs';
import {seedDemoSpecialtyReviews} from '../src/demo-specialty-review.mjs';
import {seedDemoSpecialtyCare} from '../src/demo-specialty-care.mjs';
import {seedDemoSpecialtyTrace} from '../src/demo-specialty-trace.mjs';
import {seedDemoSpecialty} from '../src/demo-specialty.mjs';
import {seedDemoReferrals} from '../src/demo-referrals.mjs';
import {seedDemoContact} from '../src/demo-contact.mjs';
import {seedDemoLongitudinal} from '../src/demo-longitudinal.mjs';
import {seedDemoFamilyTraining} from '../src/demo-family-training.mjs';
import {seedDemoScheduling} from '../src/demo-scheduling.mjs';
import {seedDemoEntitlements} from '../src/demo-entitlements.mjs';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/server.mjs';
import {hashPassword} from '../src/db.mjs';
import {seedDemoScenarios,seedDemoRetail,seedDemoInventory,seedDemoPayments,seedDemoProcessing,seedDemoFulfillment,seedDemoAftercare,seedDemoAftercareWork,seedDemoReplacements,seedDemoDispositions,seedDemoRefunds,seedDemoParameters,seedDemoTraining} from '../src/demo-data.mjs';
import {fulfillmentRecord} from '../src/fulfillment.mjs';
if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('Set PLAYWRIGHT_MODULE_PATH to an installed Playwright index.mjs');const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href),{server,db}=createApp({databasePath:':memory:',mode:'test',logger:()=>{}});db.exec("INSERT INTO stores VALUES ('store-a','示例门店 A')");for(const [id,role] of [['demo-manager','manager'],['demo-front','reception'],['demo-professional','professional'],['demo-parent','guardian']])db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run(id,id,id,hashPassword('local-browser-test-only'),role,role==='guardian'?null:'store-a');seedDemoScenarios(db);seedDemoRetail(db);seedDemoInventory(db);seedDemoPayments(db);seedDemoProcessing(db);seedDemoFulfillment(db);seedDemoAftercare(db);seedDemoAftercareWork(db);seedDemoReplacements(db);seedDemoDispositions(db);seedDemoRefunds(db);seedDemoParameters(db);seedDemoTraining(db);seedDemoEntitlements(db);seedDemoScheduling(db);db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-practice-parent','demo-practice-parent','家庭练习家长（虚构）',hashPassword('local-browser-test-only'),'guardian',null);seedDemoFamilyTraining(db);db.prepare('INSERT INTO guardian_links (user_id,customer_id,active) VALUES (?,?,1)').run('demo-parent','sample-retail');seedDemoLongitudinal(db);seedDemoContact(db);seedDemoReferrals(db);seedDemoSpecialty(db);seedDemoSpecialtyTrace(db);seedDemoSpecialtyCare(db);seedDemoSpecialtyReviews(db);seedDemoProcurement(db);seedDemoReceiving(db);seedDemoPurchaseQuality(db);seedDemoSupplierReturns(db);seedDemoExtraReturns(db);seedDemoCustody(db);seedDemoBatches(db);seedDemoStaffHandover(db);server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`,launchOptions={headless:true,args:['--no-sandbox']};if(process.env.CHROMIUM_PATH)launchOptions.executablePath=process.env.CHROMIUM_PATH;const browser=await chromium.launch(launchOptions),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));mkdirSync('data/browser-check',{recursive:true});
async function api(path,data){return page.evaluate(async({path,data})=>{const me=await(await fetch('/api/me')).json(),r=await fetch('/api'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-CSRF-Token':me.csrf,'Idempotency-Key':crypto.randomUUID()}:{},body:data?JSON.stringify(data):undefined});const b=await r.json();if(!r.ok)throw Error(JSON.stringify(b));return b;},{path,data});}
async function login(id){await page.locator('#login-form [name=username]').fill(id);await page.locator('#login-form [name=password]').fill('local-browser-test-only');await page.locator('#login-form button[type=submit]').click();await page.locator('#customers-view').waitFor({state:'visible'});}
async function logout(){const b=page.locator('#logout-mobile');await (await b.isVisible()?b:page.locator('#logout')).click();await page.locator('#login-view').waitFor({state:'visible'});}
async function closeAll(){while(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');}


import {randomUUID} from 'node:crypto';
const now=new Date().toISOString();
function add(title,{assignee='demo-front',assignment='accepted',execution='pending',lifecycle='active',role=null}={}){
 const id=randomUUID(),blocked=lifecycle==='blocked',reason='明确原阻塞事实（虚构）';
 db.prepare('INSERT INTO work_tasks (id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,assignee_id,assignment_status,execution_status,revision,created_at,updated_at,created_by,candidate_role,lifecycle_status,exception_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'sample-intake','store-a',title,'仅核对原任务状态',null,null,null,'customer',assignee,assignment,execution,blocked?2:1,now,now,'demo-manager',role,lifecycle,blocked?reason:null);
 db.prepare("INSERT INTO task_events(task_id,customer_id,revision,action,assignee_id,assignment_status,execution_status,reason,created_at,actor_id,candidate_role,lifecycle_status,exception_reason) VALUES (?,?,1,'assign',?,?,?,?,?,?,?,'active',NULL)").run(id,'sample-intake',assignee,assignment,execution,'明确建立原任务（虚构）',now,'demo-manager',role);
 if(blocked)db.prepare("INSERT INTO task_events(task_id,customer_id,revision,action,assignee_id,assignment_status,execution_status,reason,created_at,actor_id,candidate_role,lifecycle_status,exception_reason) VALUES (?,?,2,'block',?,?,?,?,?,?,?,'blocked',?)").run(id,'sample-intake',assignee,assignment,execution,reason,now,'demo-manager',role,reason);
 return id;
}
const awaiting=add('状态入口待接收',{assignment:'awaiting'}),paused=add('状态入口阻塞暂停',{execution:'paused',lifecycle:'blocked'}),running=add('状态入口执行中',{execution:'running'}),candidate=add('状态入口候选阻塞',{assignee:null,assignment:'queued',execution:'pending',lifecycle:'blocked',role:'reception'});
const view=page.locator('#my-work-view'),form=view.locator('#my-work-filter'),items=view.locator('#my-work-items'),applied=view.locator('#my-work-applied-filter'),pending=view.locator('#my-work-pending-filter'),error=view.locator('#my-work-error');
async function query(values={}){for(const[n,v]of Object.entries(values)){const l=form.locator('[name='+n+']');if(['scope','kind','date_mode','sort','task_state'].includes(n))await l.selectOption(v);else await l.fill(v);}const response=page.waitForResponse(r=>r.url().includes('/api/my-work?')&&r.request().method()==='GET');await form.getByRole('button',{name:'查询',exact:true}).click();await response;await view.locator('#my-work-count').filter({hasText:/当前筛选完整/}).waitFor();}
const keys=()=>items.locator('[data-my-work-key]').evaluateAll(ns=>ns.map(n=>n.dataset.myWorkKey));
try{
 await page.goto(origin);await login('demo-front');await page.locator('#my-work-nav').click();
 await query({kind:'task',task_state:'awaiting',q:'状态入口'});assert.deepEqual(await keys(),['task:'+awaiting+':0']);assert.ok((await applied.textContent()).includes('等待本人接收'));
 await query({task_state:'paused'});assert.deepEqual(await keys(),['task:'+paused+':0']);assert.ok((await applied.textContent()).includes('执行已暂停'));
 await query({task_state:'blocked'});assert.deepEqual(await keys(),['task:'+paused+':0']);assert.ok((await applied.textContent()).includes('生命周期阻塞'));
 await query({task_state:'running'});assert.deepEqual(await keys(),['task:'+running+':0']);assert.ok((await applied.textContent()).includes('执行中'));
 // The original dimensions may overlap; the UI never sums them into an invented state.
 await query({task_state:'blocked'});assert.deepEqual(await keys(),['task:'+paused+':0']);await query({task_state:'paused'});assert.deepEqual(await keys(),['task:'+paused+':0']);await query({task_state:'running'});assert.deepEqual(await keys(),['task:'+running+':0']);
 // A non-task draft is rejected until the user explicitly exits the task-state condition.
 await form.locator('[name=kind]').selectOption('contact');await form.getByRole('button',{name:'查询',exact:true}).click();await error.filter({hasText:'只适用于通用岗位任务'}).waitFor();assert.ok((await applied.textContent()).includes('执行中'));assert.equal(await form.locator('[name=task_state]').isDisabled(),false);
 await form.locator('[name=kind]').selectOption('task');const exit=view.getByRole('button',{name:'查看全部业务并退出任务状态',exact:true});await exit.click();await page.waitForFunction(()=>!document.querySelector('#my-work-display').disabled);assert.ok((await applied.textContent()).includes('全部业务'));assert.equal(await form.locator('[name=task_state]').inputValue(),'all');assert.equal(await form.locator('[name=task_state]').isDisabled(),true);
 // Candidate filtering remains a read of original unassigned facts.
 await query({scope:'candidates',kind:'task',task_state:'blocked',q:'状态入口候选'});assert.deepEqual(await keys(),['task:'+candidate+':0']);assert.equal(db.prepare('SELECT assignee_id FROM work_tasks WHERE id=?').get(candidate).assignee_id,null);
 await page.screenshot({path:'data/browser-check/v079-task-state-desktop.png',fullPage:true});
 await logout();await page.setViewportSize({width:390,height:844});await login('demo-front');await page.locator('#my-work-nav').click();await query({scope:'mine',kind:'task',task_state:'awaiting',q:'状态入口待接收'});await items.getByRole('button',{name:'打开原业务办理',exact:true}).click();const work=page.locator('#task-work-dialog');await work.getByRole('button',{name:'接收任务',exact:true}).click();const edit=page.locator('#task-dialog');await edit.locator('[name=reason]').fill('原状态入口后明确本人接收');await edit.locator('#task-submit').click();await edit.waitFor({state:'hidden'});await work.waitFor({state:'hidden'});await view.locator('#my-work-count').filter({hasText:'完整 0 项'}).waitFor();assert.ok((await applied.textContent()).includes('等待本人接收'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);for(const b of await form.locator('button,select').all()){const box=await b.boundingBox();if(box)assert.ok(box.height>=44);}
 await page.screenshot({path:'data/browser-check/v079-task-state-mobile.png',fullPage:true});
 // A held authorized list cannot restore private state after logout.
 const late=await api('/my-work?scope=mine&kind=task&task_state=blocked&q=%E7%8A%B6%E6%80%81%E5%85%A5%E5%8F%A3&date_mode=all&date_from=&date_to=&sort=updated');let release,entered;const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);await page.route('**/api/my-work?*',async route=>{entered();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(late)});});await view.getByRole('button',{name:'明确刷新当前筛选',exact:true}).click();await seen;await page.evaluate(()=>document.querySelector('#logout').click());await page.locator('#login-view').waitFor({state:'visible'});release();await page.unrouteAll({behavior:'wait'});assert.equal(await items.locator('[data-my-work-key]').count(),0);assert.equal(await view.locator('#my-work-summary').textContent(),'');assert.deepEqual(errors,[]);
 console.log('Task-state desktop/mobile passed: original blocked/awaiting/paused/running dimensions, overlap, explicit non-task exit, candidates remain unassigned, original receive refresh, logout cleanup, 44px mobile controls and no overflow/errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}

