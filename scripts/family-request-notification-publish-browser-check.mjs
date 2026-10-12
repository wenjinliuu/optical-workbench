import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/server.mjs';
import {hashPassword} from '../src/db.mjs';
import {seedDemoNotificationSources} from '../src/demo-family-notification-sources.mjs';
import {createRequest,requestEvent} from '../src/family-requests.mjs';

if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('Set PLAYWRIGHT_MODULE_PATH');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const {server,db}=createApp({databasePath:':memory:',mode:'test',logger:()=>{}});
db.exec("INSERT INTO stores VALUES('store-a','虚构门店 A')");
const parent='demo-family-notification-source-parent',customer='demo-notification-source-submitted',request=customer+'-request';
for(const[id,role,store]of[['demo-manager','manager','store-a'],['demo-front','reception','store-a'],[parent,'guardian',null]])db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run(id,id,id,hashPassword('local-browser-test-only'),role,store);
seedDemoNotificationSources(db);
// The original request is outside the first generic source page; the guided entry
// must still target this request, rather than quietly selecting a recent one.
for(let i=0;i<31;i++)createRequest(db,customer,parent,{title:'独立虚构分页申请 '+i,request_kind:'leave',time_status:'unknown',requested_start:null,requested_end:null,request_note:'虚构未知时间，不办理实际预约。'});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));mkdirSync('data/browser-check',{recursive:true});
const rd=page.locator('#family-request-detail-dialog'),ed=page.locator('#family-notifications-edit-dialog'),nd=page.locator('#family-notifications-detail-dialog');
const count=()=>db.prepare('SELECT count(*) n FROM family_notification_versions').get().n;
const originalFacts=()=>Object.fromEntries(['family_request_roots','family_request_events','schedule_booking_events','family_notification_receipts','payment_events','inventory_events','inventory_order_events','entitlement_events'].filter(t=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)).map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
let currentUser;async function login(user){currentUser=user;await page.locator('#login-form [name=username]').fill(user);await page.locator('#login-form [name=password]').fill('local-browser-test-only');await page.locator('#login-form button[type=submit]').click();await page.locator('#customers-view').waitFor({state:'visible'});}
async function logout(){await page.evaluate(()=>document.querySelector('#logout').click());await page.locator('#login-view').waitFor({state:'visible'});}
async function closeAll(){while(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');}
async function openOriginal(){await page.locator('#family-requests-nav').click();if(currentUser===parent)await page.locator('#family-requests-customers').getByRole('button',{name:'申请与记录 · 通知原来源 · submitted（独立虚构）',exact:true}).click();const card=page.locator('#family-requests-items [data-family-request-id="'+request+'"]');await page.locator('#family-requests-items [data-family-request-id]').first().waitFor();if(!await card.count())await page.locator('#family-requests-items').getByRole('button',{name:'加载更多申请',exact:true}).click();await card.getByRole('button',{name:'读取申请与回复',exact:true}).click();await rd.getByRole('heading',{name:'submitted 本人原请假意向（独立虚构）',exact:true}).waitFor();}
async function guided(){await rd.getByRole('button',{name:'从本原公开版本明确发布通知',exact:true}).click();await ed.locator('#family-notification-form').waitFor();}
async function fill(title){await ed.locator('[name=title]').fill(title);await ed.locator('[name=public_note]').fill('手工公开通知：请从原申请核对，本通知不办理预约。');await ed.locator('[name=internal_reason]').fill('秘密内部核对依据，不向本人公开。');}
try{
 await page.goto(origin);await login('demo-manager');await openOriginal();const before=count();await guided();
 assert.equal(await ed.locator('[name=source_kind]').inputValue(),'family_request');assert.equal(await ed.locator('[name=source_kind]').isDisabled(),true);
 assert.equal(await ed.locator('[name=source_request]').inputValue(),request+'|1');assert.equal(await ed.locator('[name=source_request] option').count(),2);
 for(const name of ['title','public_note','internal_reason'])assert.equal(await ed.locator('[name='+name+']').inputValue(),'');
 assert.equal(count(),before);await fill('员工从本原申请明确发布');
 requestEvent(db,request,{action:'respond',public_note:'后来的 R2 公开回复：原安排仍需另行办理。',internal_reason:'秘密后续内部原因'},'demo-manager');
 const facts=originalFacts();await ed.getByRole('button',{name:'明确保存工作台通知',exact:true}).click();await ed.getByText(/原申请\/回复不属于此本人，或已有新版本/).waitFor();
 assert.equal(count(),before);assert.equal(await ed.locator('[name=title]').inputValue(),'员工从本原申请明确发布');
 await ed.getByRole('button',{name:'读取当前原申请/回复版本并保留填写',exact:true}).click();await ed.locator('[name=source_request] option[value="'+request+'|2"]').waitFor({state:'attached'});
 assert.equal(await ed.locator('[name=source_request]').inputValue(),request+'|1');assert.equal(await ed.locator('[name=public_note]').inputValue(),'手工公开通知：请从原申请核对，本通知不办理预约。');
 await ed.locator('[name=source_request]').selectOption(request+'|2');await ed.getByText(/固定原 .* R2：后来的 R2 公开回复/).waitFor();await ed.getByRole('button',{name:'明确保存工作台通知',exact:true}).click();
 await ed.waitFor({state:'hidden'});await rd.getByText('员工从本原申请明确发布 · V1',{exact:true}).waitFor();assert.equal(count(),before+1);assert.deepEqual(originalFacts(),facts);
 const saved=db.prepare('SELECT * FROM family_notification_versions ORDER BY rowid DESC LIMIT 1').get(),source=db.prepare('SELECT * FROM family_notification_request_sources WHERE version_id=?').get(saved.id);
 assert.equal(source.request_id,request);assert.equal(source.request_revision,2);assert.ok(JSON.parse(source.snapshot_json).public_note.includes('R2 公开回复'));
 // Mobile: manual input remains required; an invalid recipient cannot publish.
 await page.setViewportSize({width:390,height:844});await guided();await ed.getByRole('button',{name:'明确保存工作台通知',exact:true}).click();assert.equal(count(),before+1);assert.equal(await ed.locator('[name=title]').evaluate(e=>e.validity.valueMissing),true);await fill('撤权不能发布');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.screenshot({path:'data/browser-check/v064-guided-publish-mobile.png',fullPage:true});
 db.prepare('UPDATE guardian_links SET active=0 WHERE user_id=? AND customer_id=?').run(parent,customer);
 await ed.getByRole('button',{name:'明确保存工作台通知',exact:true}).click();await ed.getByText(/此客户当前本人家庭授权无效/).waitFor();await rd.getByText('本人当前授权已撤销，仅可结束保留的内部意向。',{exact:true}).waitFor();assert.equal(await ed.locator('#family-notification-form').count(),0);assert.equal(await rd.getByRole('button',{name:'从本原公开版本明确发布通知',exact:true}).count(),0);assert.equal(count(),before+1);
 await closeAll();await logout();db.prepare('UPDATE guardian_links SET active=1 WHERE user_id=? AND customer_id=?').run(parent,customer);
 await login(parent);await openOriginal();assert.equal(await rd.getByRole('button',{name:'从本原公开版本明确发布通知',exact:true}).count(),0);assert.ok(!(await rd.textContent()).includes('秘密'));
 await rd.locator('[data-request-notification-version="'+saved.id+'"]').getByRole('button',{name:'打开这版通知与原回执',exact:true}).click();await nd.getByText(/固定读取 V1（当前原通知 V1）/).waitFor();assert.ok(!(await nd.textContent()).includes('秘密'));assert.equal(db.prepare('SELECT count(*) n FROM family_notification_receipts').get().n,0);
 await nd.getByRole('button',{name:'主动标记这版已读',exact:true}).click();await nd.getByText(/本人主动已读/).waitFor();await nd.getByRole('button',{name:'关闭',exact:true}).click();await rd.locator('[data-request-notification-version="'+saved.id+'"]').getByText(/本人主动已读/).waitFor();await closeAll();await logout();
 // A valid response held over logout cannot reconstruct a guided editor.
 await login('demo-manager');await openOriginal();let release,entered;const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);
 await page.route('**/api/family-notifications/staff/'+customer+'/'+parent,async route=>{const response=await route.fetch();entered();await gate;await route.fulfill({response});});
 await rd.getByRole('button',{name:'从本原公开版本明确发布通知',exact:true}).click();await seen;await logout();release();await page.unrouteAll({behavior:'wait'});assert.equal(await ed.textContent(),'');assert.equal(await rd.textContent(),'');assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(count(),before+1);
 assert.equal(db.prepare('SELECT count(*) n FROM schedule_booking_events').get().n,0);assert.deepEqual(errors,[]);
 console.log('V0.64 desktop/mobile: guided original request beyond generic source page, observed version adoption, blank manual fields, stale reply refusal and preserved input, explicit newer-version choice, one linked notice with original facts unchanged, return to original receipts, revoked recipient cleanup, family role/private isolation, explicit read and late logout cleanup passed.');
}catch(e){console.log('Guided publish failure:',await ed.textContent(),await rd.textContent());await page.screenshot({path:'data/browser-check/v064-failure.png',fullPage:true});throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
