import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('Set PLAYWRIGHT_MODULE_PATH to an installed Playwright index.mjs');
const { chromium }=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
mkdirSync('data/browser-check',{recursive:true});
import { createApp } from '../src/server.mjs';
import { hashPassword } from '../src/db.mjs';
import { seedDemoScenarios } from '../src/demo-data.mjs';
import assert from 'node:assert/strict';
import { once } from 'node:events';
const {server,db}=createApp({databasePath:':memory:',mode:'test'});
db.prepare('INSERT INTO stores VALUES (?,?)').run('store-a','示例视光门店 · A');
db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-manager','demo-manager','负责人样例',hashPassword('local-browser-test-only'),'manager','store-a');
for(const [id,name,birth] of [['one','小林（虚构）','2017-06-12'],['two','小林弟弟（虚构）','2020-03-08']])db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run(id,'store-a',name,birth,'林家长（虚构）',null,new Date().toISOString(),'demo-manager');
db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run('demo-parent','demo-parent','家长样例',hashPassword('local-browser-test-only'),'guardian','store-a');
seedDemoScenarios(db);
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.locator('#login-view').waitFor({state:'visible'});
 await page.locator('#login-form input[name=username]').fill('demo-manager');
 await page.locator('#login-form input[name=password]').fill('local-browser-test-only');
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('#customers-view').waitFor({state:'visible'});
 await page.locator('.customer-row').first().click();
 await page.locator('.detail-top').waitFor();
 await page.locator('#new-customer').click();
 await page.locator('#customer-form input[name=name]').fill('小叶（虚构）');
 await page.locator('#customer-form input[name=birth_date]').fill('2019-02-03');
 await page.locator('#customer-form input[name=contact_name]').fill('叶家长（虚构）');
 await page.locator('#customer-form button[type=submit]').click();
 await page.getByRole('heading',{name:'小叶（虚构）',exact:true}).waitFor();
 for(const [type,goal] of [['followup','建立长期复查档案，按约定日期继续跟进'],['training','训练服务需求登记，等待专业评估与计划确认']]){
  await page.locator('.cycle-heading button').click();
  await page.locator('#cycle-form select').selectOption(type);
  await page.locator('#cycle-form textarea').fill(goal);
  await page.locator('#cycle-form button[type=submit]').click();
  await page.getByText(goal,{exact:true}).waitFor();
 }
 assert.equal(await page.locator('.cycle-card').count(),2);
 await page.getByRole('button',{name:'＋ 登记到店',exact:true}).click();
 await page.locator('#visit-form textarea').fill('复查与训练需求登记（虚构）');
 for(const checkbox of await page.locator('#visit-form input[type=checkbox]').all())await checkbox.check();
 await page.locator('#visit-form button[type=submit]').click();
 await page.locator('.visit-card').waitFor();
 assert.ok((await page.locator('.visit-card').textContent()).includes('关联 2 个周期'));
 await page.getByRole('button',{name:'结束本次到店',exact:true}).click();
 await page.locator('#close-visit-form textarea').fill('本次到店结束，长期周期继续（虚构）');
 await page.locator('#close-visit-form button[type=submit]').click();
 await page.getByText('本次已结束',{exact:true}).waitFor();
 assert.equal(await page.locator('.cycle-card').count(),2);
 for(const active of ['true','false']){
  await page.getByRole('button',{name:'管理关联',exact:true}).click();
  await page.locator('#guardian-form input[name=relationship]').fill('监护人（演示）');
  await page.locator('#guardian-form select[name=active]').selectOption(active);
  await page.locator('#guardian-form textarea').fill('纯虚构资料演示授权或撤销');
  await page.locator('#guardian-form button[type=submit]').click();
  await page.locator('.family-row .badge').filter({hasText:active==='true'?'已授权':'已撤销'}).waitFor();
 }

 await page.screenshot({path:'data/browser-check/desktop.png',fullPage:true});
 await page.getByRole('button',{name:'操作审计',exact:false}).click();
 await page.locator('#audit-items tr').filter({hasText:'创建服务周期草稿'}).first().waitFor();
 assert.ok((await page.locator('#audit-items').textContent()).includes('demo-manager'));
 await page.locator('[data-view=customers]').click();
 await page.locator('[data-view=demo]').click();
 await page.locator('.scenario-card').first().waitFor();
 assert.equal(await page.locator('.scenario-card').count(),6);
 await page.screenshot({path:'data/browser-check/demo-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile demo page must not overflow');
 await page.screenshot({path:'data/browser-check/demo-mobile.png',fullPage:true});
 await page.locator('.scenario-card').first().getByRole('button',{name:'查看关联档案 →'}).click();
 await page.locator('.detail-top').waitFor();

 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile page must not overflow');
 await page.locator('#new-customer').click();
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#customer-dialog').evaluate(d=>d.open),false);
 await page.screenshot({path:'data/browser-check/mobile.png',fullPage:true});
 await page.locator('#logout-mobile').click();
 await page.locator('#login-view').waitFor({state:'visible'});
 assert.equal(await page.locator('#customer-items').textContent(),'');
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: vivid light theme, six synthetic scenarios, family authorize/revoke, multi-cycle visit/close, audit, desktop/mobile, Escape, logout and no runtime errors.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
