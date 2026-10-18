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
if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('Set PLAYWRIGHT_MODULE_PATH to an installed Playwright index.mjs');const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href),{server,db}=createApp({databasePath:':memory:',mode:'test',logger:()=>{}});db.exec("INSERT INTO stores VALUES ('store-a','示例门店 A')");for(const [id,role] of [['demo-manager','manager'],['demo-front','reception'],['demo-professional','professional'],['demo-parent','guardian']])db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run(id,id,id,hashPassword('local-browser-test-only'),role,role==='guardian'?null:'store-a');seedDemoScenarios(db);seedDemoRetail(db);seedDemoInventory(db);seedDemoPayments(db);seedDemoProcessing(db);seedDemoFulfillment(db);seedDemoAftercare(db);seedDemoAftercareWork(db);seedDemoReplacements(db);seedDemoDispositions(db);seedDemoRefunds(db);seedDemoParameters(db);seedDemoTraining(db);seedDemoEntitlements(db);seedDemoScheduling(db);db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-practice-parent','demo-practice-parent','家庭练习家长（虚构）',hashPassword('local-browser-test-only'),'guardian',null);seedDemoFamilyTraining(db);db.prepare('INSERT INTO guardian_links (user_id,customer_id,active) VALUES (?,?,1)').run('demo-parent','sample-retail');seedDemoLongitudinal(db);seedDemoContact(db);seedDemoReferrals(db);seedDemoSpecialty(db);seedDemoSpecialtyTrace(db);seedDemoSpecialtyCare(db);seedDemoSpecialtyReviews(db);seedDemoProcurement(db);seedDemoReceiving(db);seedDemoPurchaseQuality(db);seedDemoSupplierReturns(db);seedDemoExtraReturns(db);seedDemoCustody(db);seedDemoBatches(db);seedDemoStaffHandover(db);server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));mkdirSync('data/browser-check',{recursive:true});
async function api(path,data){return page.evaluate(async({path,data})=>{const me=await(await fetch('/api/me')).json(),r=await fetch('/api'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-CSRF-Token':me.csrf,'Idempotency-Key':crypto.randomUUID()}:{},body:data?JSON.stringify(data):undefined});const b=await r.json();if(!r.ok)throw Error(JSON.stringify(b));return b;},{path,data});}
async function login(id){await page.locator('#login-form [name=username]').fill(id);await page.locator('#login-form [name=password]').fill('local-browser-test-only');await page.locator('#login-form button[type=submit]').click();await page.locator('#customers-view').waitFor({state:'visible'});}
async function logout(){const b=page.locator('#logout-mobile');await (await b.isVisible()?b:page.locator('#logout')).click();await page.locator('#login-view').waitFor({state:'visible'});}
async function closeAll(){while(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');}



import * as C from '../src/contact.mjs';
import * as P from '../src/screening-projects.mjs';
for(let i=0;i<105;i++)C.createContactCase(db,'store-a','sample-intake',{title:'独立顺序联系 '+i,purpose:'other_service',purpose_note:'原服务安排',due_at:new Date(Date.UTC(2030,0,1+i,12)).toISOString(),next_action:'明确核对原服务',owner_id:'demo-front',source:{kind:'manual',id:null,version:null,revision:null},source_note:'原人工资料（虚构）',note:'实际保存的虚构日期',reason:'明确原依据'},'demo-manager',new Date().toISOString(),'sort-date-'+i);
P.appendScreeningProject(db,'store-a',null,{action:'record',title:'独立顺序准备（日期未知）',institution:'独立虚构机构',owner_id:'demo-front',activity_note:'只保存原准备说明',authorization_status:'unknown',authorization_reference:null,authorization_note:'说明未知',record_reason:'明确原准备依据'},'demo-manager',new Date().toISOString(),'sort-prep-unknown');


const view=page.locator('#my-work-view'),form=view.locator('#my-work-filter'),items=view.locator('#my-work-items'),display=view.locator('#my-work-display'),applied=view.locator('#my-work-applied-filter'),pending=view.locator('#my-work-pending-filter');
async function query(values={}){for(const[n,v]of Object.entries(values)){const l=form.locator('[name='+n+']');if(['scope','kind','date_mode','sort'].includes(n))await l.selectOption(v);else await l.fill(v);}const response=page.waitForResponse(r=>r.url().includes('/api/my-work?')&&r.request().method()==='GET');await form.getByRole('button',{name:'查询',exact:true}).click();await response;await view.locator('#my-work-count').filter({hasText:/当前筛选完整/}).waitFor();}
async function mode(value){await display.selectOption(value);await page.waitForFunction(v=>document.querySelector('#my-work-items').classList.contains('compact')===(v==='compact')&&!document.querySelector('#my-work-display').disabled,value);}
const snapshot=()=>items.locator('[data-my-work-key]').evaluateAll(ns=>ns.map(n=>({key:n.dataset.myWorkKey,text:n.textContent})));

const matched=view.locator('#my-work-matched-counts');
try{
 await page.goto(origin);await login('demo-front');await page.locator('#my-work-nav').click();await query({q:'独立顺序'});await matched.filter({hasText:'联系跟进 105'}).waitFor();assert.ok((await matched.textContent()).includes('团体活动准备责任 1'));const full=await api('/my-work?q='+encodeURIComponent('独立顺序')),complete=await matched.textContent();assert.equal(await items.locator('[data-my-work-key]').count(),30);assert.ok((await view.locator('#my-work-summary').textContent()).includes('本人全量分类（筛选前）'));
 for(const n of [60,90,106]){await view.getByRole('button',{name:'读取后续同来源责任',exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('#my-work-items [data-my-work-key]').length===n,n);assert.equal(await matched.textContent(),complete);}await mode('compact');assert.equal(await matched.textContent(),complete);
 await form.locator('[name=q]').fill('未查询填写');await pending.filter({hasText:'点击查询应用'}).waitFor();assert.equal(await matched.textContent(),complete);await view.getByRole('button',{name:'明确刷新当前筛选',exact:true}).click();await matched.filter({hasText:'联系跟进 105'}).waitFor();assert.equal(await matched.textContent(),complete);assert.equal(await form.locator('[name=q]').inputValue(),'未查询填写');
 await query({q:'独立顺序',date_mode:'recorded',date_from:'2030-01-02',date_to:'2030-01-04',sort:'date_asc'});await matched.filter({hasText:'联系跟进 3'}).waitFor();assert.ok(!(await matched.textContent()).includes('团体活动准备责任'));assert.ok((await view.locator('#my-work-summary').textContent()).includes('联系跟进 '+full.counts.contact));
 await query({date_mode:'not_recorded',date_from:'',date_to:''});await matched.filter({hasText:'团体活动准备责任 1'}).waitFor();assert.ok(!(await matched.textContent()).includes('联系跟进'));await query({q:'绝无匹配'});await matched.filter({hasText:'无匹配责任'}).waitFor();assert.equal(await items.locator('[data-my-work-key]').count(),0);
 await query({q:'独立顺序',date_mode:'all'});await matched.filter({hasText:'联系跟进 105'}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.screenshot({path:'data/browser-check/v077-matched-desktop.png',fullPage:true});
 await logout();await page.setViewportSize({width:390,height:844});await login('demo-professional');await page.locator('#my-work-nav').click();await query({scope:'candidates',kind:'task',q:'',date_mode:'not_recorded'});const candidate=await api('/my-work?'+new URLSearchParams({scope:'candidates',kind:'task',q:'',date_mode:'not_recorded'}));assert.equal(candidate.matched_counts.task,candidate.total);assert.ok(Object.entries(candidate.matched_counts).every(([k,n])=>k==='task'||n===0));assert.ok(candidate.total>0);await matched.filter({hasText:'本岗位候选'}).waitFor();assert.ok((await matched.textContent()).includes('通用岗位任务 '+candidate.total));
 await query({scope:'mine',kind:'task',q:'原员工待接收'});await matched.filter({hasText:'通用岗位任务 1'}).waitFor();await mode('compact');await form.locator('[name=q]').fill('未查询的手机文字');await items.getByRole('button',{name:'打开原业务办理',exact:true}).click();const task=page.locator('#task-work-dialog');await task.getByRole('button',{name:'接收任务',exact:true}).click();const ed=page.locator('#task-dialog');await ed.locator('[name=reason]').fill('手机原接收，完整分类保留已应用来源');await ed.locator('#task-submit').click();await ed.waitFor({state:'hidden'});await task.waitFor({state:'hidden'});await matched.filter({hasText:'通用岗位任务 1'}).waitFor();await pending.filter({hasText:'点击查询应用'}).waitFor();assert.equal(await display.inputValue(),'compact');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.screenshot({path:'data/browser-check/v077-matched-mobile.png',fullPage:true});
 const old=await api('/my-work');let release,entered;const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);await page.route('**/api/my-work?*',async route=>{entered();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(old)});});await form.getByRole('button',{name:'查询',exact:true}).click();await seen;await page.evaluate(()=>document.querySelector('#logout').click());await page.locator('#login-view').waitFor({state:'visible'});release();await page.unrouteAll({behavior:'wait'});assert.equal(await view.locator('#my-work-summary').textContent(),'');assert.equal(await items.locator('[data-my-work-key]').count(),0);assert.deepEqual(errors,[]);
 console.log('Matched counts desktop/mobile passed: full 106 classification independent of four loaded pages, full own labels separate, candidate classifications only actual task matches, dates/type/unknown/empty query, unsubmitted draft and original receive retain adopted counts/density, delayed logout clears private summary, no errors/overflow.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
