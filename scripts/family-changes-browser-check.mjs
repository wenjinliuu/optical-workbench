import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/server.mjs';
import {hashPassword} from '../src/db.mjs';
import {seedDemoFamilyChanges} from '../src/demo-family-changes.mjs';
import {requestEvent} from '../src/family-requests.mjs';
import {scheduleBooking} from '../src/scheduling.mjs';
if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('Set PLAYWRIGHT_MODULE_PATH');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const {server,db}=createApp({databasePath:':memory:',mode:'test',logger:()=>{}});
db.exec("INSERT INTO stores VALUES('store-a','独立虚构门店')");
for(const [id,role,store] of [['demo-manager','manager','store-a'],['demo-front','reception','store-a'],['demo-family-change-parent','guardian',null]])db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run(id,id,id,hashPassword('local-browser-test-only'),role,store);
seedDemoFamilyChanges(db);server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));mkdirSync('data/browser-check',{recursive:true});
const view=page.locator('#family-requests-view'),requestDialog=page.locator('#family-request-detail-dialog'),edit=page.locator('#family-change-edit-dialog'),execute=page.locator('#family-change-detail-dialog');
async function login(id){await page.locator('#login-form [name=username]').fill(id);await page.locator('#login-form [name=password]').fill('local-browser-test-only');await page.locator('#login-form button[type=submit]').click();await page.locator('#customers-view').waitFor({state:'visible'});}
async function logout(){await page.evaluate(()=>document.querySelector('#logout').click());await page.locator('#login-view').waitFor({state:'visible'});}
async function requests(parent){await page.locator('#family-requests-nav').click();if(parent)await view.getByRole('button',{name:'申请与记录 · 原预约变更独立虚构客户',exact:true}).click();}
async function closeAll(){while(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');}
function seed(stage){return db.prepare('SELECT c.*,q.title FROM family_booking_changes c JOIN family_request_roots q ON q.id=c.request_id WHERE q.title LIKE ?').get(stage+' %');}
async function openRequest(id){await view.locator('[data-family-request-id="'+id+'"]').getByRole('button',{name:'读取申请与回复',exact:true}).click();await requestDialog.waitFor({state:'visible'});}
try{
  await page.goto(origin);
  for(const [width,kind,stage] of [[1440,'leave','leave-pending'],[390,'move','move-pending']]){
    await page.setViewportSize({width,height:900});const original=seed(stage),root=db.prepare('SELECT request_id FROM family_booking_roots WHERE id=?').get(original.publication_id);
    requestEvent(db,original.request_id,{action:'withdraw',public_note:'独立虚构：准备新本人意向'},'demo-family-change-parent');
    await login('demo-family-change-parent');await requests(true);await openRequest(root.request_id);
    await requestDialog.getByRole('button',{name:kind==='leave'?'针对原预约提出当次请假':'选择开放时段提出单次调课意向',exact:true}).click();
    const f=edit.locator('#family-change-request-form');await f.waitFor();if(kind==='move'){assert.equal(await f.locator('[name=offer_id]').inputValue(),'');await f.locator('[name=offer_id]').selectOption(original.offer_id);}
    await f.locator('[name=title]').fill('浏览器'+width+'本人'+kind);await f.locator('[name=request_note]').fill('本人明确说明（虚构）');
    await f.getByRole('button',{name:'重新核对原安排与选定目标',exact:true}).click();assert.equal(await f.locator('[name=request_note]').inputValue(),'本人明确说明（虚构）');
    await page.waitForFunction(()=>!document.querySelector('#family-change-request-form button[type=submit]')?.disabled);
    await f.locator('button[type=submit]').click();await edit.waitFor({state:'hidden'});await requestDialog.getByRole('heading',{name:'针对原预约的本人变更意向',exact:true}).waitFor();
    const c=db.prepare('SELECT c.* FROM family_booking_changes c JOIN family_request_roots q ON q.id=c.request_id WHERE q.title=?').get('浏览器'+width+'本人'+kind);assert.ok(c);assert.equal(scheduleBooking(db,c.booking_id).revision,1);
    assert.ok(!await requestDialog.textContent().then(s=>s.includes('独立虚构明确原来源')));await closeAll();await logout();
    await login('demo-front');await requests(false);await openRequest(c.request_id);await requestDialog.getByRole('button',{name:'核对并办理实际原预约变更',exact:true}).click();
    const e=execute.locator('#family-change-execute-form');await e.waitFor();assert.equal(await e.locator('[name=action]').inputValue(),'');await e.locator('[name=action]').selectOption(kind);
    await e.locator('[name=note]').fill('明确当次安排（虚构）');await e.locator('[name=reason]').fill('内部手工依据（虚构）');await e.locator('[name=public_note]').fill('已实际办理本人原预约变更（虚构）');
    await e.getByRole('button',{name:'重新核对原来源、容量与冲突',exact:true}).click();assert.equal(await e.locator('[name=public_note]').inputValue(),'已实际办理本人原预约变更（虚构）');
    await page.waitForFunction(()=>!document.querySelector('#family-change-execute-form button[type=submit]')?.disabled);await e.locator('button[type=submit]').click();await execute.waitFor({state:'hidden'});
    await requestDialog.getByText(/门店已实际办理/).waitFor();assert.equal(scheduleBooking(db,c.booking_id).revision,2);assert.equal(scheduleBooking(db,c.booking_id).history[0].action,kind);
    await page.screenshot({path:'data/browser-check/family-change-'+kind+'-'+width+'.png',fullPage:true});await closeAll();await logout();
  }
  // A late protected result must not render after authorization is revoked.
  await login('demo-family-change-parent');await requests(true);const c=seed('move-done');let release,entered;
  const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);
  await page.route('**/api/family-changes/requests/'+c.request_id,async route=>{const response=await route.fetch();entered();await gate;await route.fulfill({response});});
  await openRequest(c.request_id);await seen;db.prepare("UPDATE guardian_links SET active=0 WHERE user_id='demo-family-change-parent'").run();release();
  await requestDialog.locator('.form-error').waitFor();assert.equal(await requestDialog.locator('[data-family-change-id]').count(),0);assert.ok(!await requestDialog.textContent().then(s=>s.includes('固定旧安排')));
  await page.unrouteAll({behavior:'wait'});await logout();assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
  console.log('Family booking changes: desktop leave, mobile move, input preservation, actual results and late-revocation checks passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
