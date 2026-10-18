import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createApp} from '../src/server.mjs';
import {hashPassword} from '../src/db.mjs';

if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('Set PLAYWRIGHT_MODULE_PATH to an installed Playwright index.mjs');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const {server,db}=createApp({databasePath:':memory:',mode:'test',logger:()=>{}});
db.exec("INSERT INTO stores VALUES('a','运行验证门店（虚构）')");
db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run('manager','manager','运行负责人（虚构）',hashPassword('browser-test-only'),'manager','a');
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#login-form input[name=username]').fill('manager');
  await page.locator('#login-form input[name=password]').fill('browser-test-only');
  await page.locator('#login-form button[type=submit]').click();
  await page.locator('#customers-view').waitFor({state:'visible'});
  const faults=await page.evaluate(async()=>{
    const results=[];
    for(const path of ['/api/my-work?PRIVATE_QUERY=x','/api/screening-projects/PRIVATE_PROJECT','/api/staff-records/employees/PRIVATE_EMPLOYEE',
      '/api/family-progress/customers/PRIVATE_CUSTOMER','/api/family-requests/PRIVATE_REQUEST','/api/family-offers/PRIVATE_OFFER',
      '/api/family-bookings/PRIVATE_BOOKING','/api/family-changes/requests/PRIVATE_CHANGE','/api/family-communication/context/PRIVATE_CUSTOMER',
      '/api/family-notifications/staff/PRIVATE_CUSTOMER/PRIVATE_GUARDIAN',
      '/api/family-notifications/staff/PRIVATE_CUSTOMER/PRIVATE_GUARDIAN/sources',
      '/api/family-request-notifications/staff/PRIVATE_REQUEST/authorization','/api/family-training/practices/PRIVATE_PRACTICE',
      '/api/refunds?status=PRIVATE_STATUS']){
      const r=await fetch(path);results.push({status:r.status,...await r.json()});
    }
    return results;
  });
  for(const path of ['/api/specialty/cases/PRIVATE_CASE','/api/purchases/PRIVATE_PURCHASE','/api/inventory-custody/PRIVATE_CUSTODY','/api/expenses/PRIVATE_EXPENSE']){
    const r=await page.evaluate(async path=>{const response=await fetch(path);return {status:response.status,...await response.json()};},path);faults.push(r);
  }
  assert.deepEqual(faults.map(x=>x.status),[422,404,404,404,404,404,404,404,404,404,404,404,404,422,404,404,404,404]);
  await page.locator('[data-view=operations]').click();
  for(const name of ['本人工作台','团体筛查与名单','员工责任与交接','家庭发布与进度','家庭申请与回复','家庭时段选择','家庭预约办理','家庭请假与调课','家庭偏好与说明','家庭通知与回执','申请通知追溯','家庭练习与复评','退款记录','专业随访与转介','采购收货与退供','库存实物与出库','费用与渠道核对'])await page.locator('#operations-errors strong').getByText(name,{exact:true}).first().waitFor();
  mkdirSync('data/browser-check',{recursive:true});
  for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    await page.setViewportSize(viewport);await page.locator('#refresh-operations').click();
    for(const fault of faults)await page.locator('#operations-errors code').getByText(fault.request_id,{exact:true}).waitFor();
    assert.doesNotMatch(await page.locator('#operations-errors').textContent(),/PRIVATE_/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`data/browser-check/v094-operations-${name}.png`,fullPage:true});
  }
  let release,arrived;const pending=new Promise(resolve=>arrived=resolve),held=new Promise(resolve=>release=resolve);
  await page.route('**/api/operations',async route=>{const response=await route.fetch();arrived();await held;await route.fulfill({response});});
  await page.locator('#refresh-operations').click();await pending;
  await page.locator('#logout-mobile').click();await page.locator('#login-view').waitFor({state:'visible'});
  release();await page.unrouteAll({behavior:'wait'});
  assert.equal(await page.locator('#operations-errors').textContent(),'');
  assert.equal(await page.locator('#operations-summary').textContent(),'');assert.deepEqual(errors,[]);
  console.log('Operations desktop/mobile passed: three collaboration, nine family, four late-stage and two audited handler-gap diagnostics, correlated request IDs, no sensitive route data or overflow, and late response after logout cleared.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
