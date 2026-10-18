import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createApp} from '../src/server.mjs';
import {hashPassword} from '../src/db.mjs';

if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('Set PLAYWRIGHT_MODULE_PATH to an installed Playwright index.mjs');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
mkdirSync('data/browser-check',{recursive:true});
try{
  for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const logs=[],errors=[],{server,db}=createApp({databasePath:':memory:',mode:'test',logger:e=>logs.push(e)});
    db.exec("INSERT INTO stores VALUES('a','登录验证门店（虚构）')");
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run('manager','manager','登录负责人（虚构）',hashPassword('browser-login-only'),'manager','a');
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const context=await browser.newContext({viewport}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator('#login-view').waitFor({state:'visible'});
      const statuses=await page.evaluate(async()=>{
        const values=[];
        for(let i=0;i<8;i++)values.push((await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'192.0.2.'+i},body:JSON.stringify({username:'manager',password:'wrong-password'})})).status);
        return values;
      });assert.deepEqual(statuses,Array(8).fill(401));
      await page.locator('#login-form input[name=username]').fill('manager');
      await page.locator('#login-form input[name=password]').fill('wrong-password');
      await page.locator('#login-form button[type=submit]').click();
      await page.locator('#login-error').filter({hasText:'账号或密码不正确'}).waitFor();
      assert.ok(await page.locator('#login-form button[type=submit]').isEnabled());
      await page.locator('#login-form input[name=password]').fill('browser-login-only');
      await page.locator('#login-form button[type=submit]').click();
      await page.locator('#customers-view').waitFor({state:'visible'});
      assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,1);
      await page.locator(name==='mobile'?'#logout-mobile':'#logout').click();
      await page.locator('#login-view').waitFor({state:'visible'});
      await page.locator('#login-form input[name=username]').fill('manager');
      await page.locator('#login-form input[name=password]').fill('browser-login-only');
      const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/auth/login'));
      await page.locator('#login-form button[type=submit]').click();
      const response=await responsePromise;assert.equal(response.status(),429);
      await page.locator('#login-error').filter({hasText:'登录尝试过多'}).waitFor();
      assert.ok(await page.locator('#login-form button[type=submit]').isEnabled());
      assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
      assert.equal(db.prepare('SELECT count(*) n FROM audit_events').get().n,2);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.doesNotMatch(JSON.stringify(logs),/wrong-password|browser-login-only|192\.0\.2/);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:`data/browser-check/v095-login-${name}.png`,fullPage:true});
    }finally{await context.close();await new Promise(resolve=>server.close(resolve));}
  }
  console.log('Login desktop/mobile passed: wrong credentials recover, tenth attempt logs in, logout clears session, eleventh stays limited, forwarding headers do not split allowance, no secret logs or overflow.');
}finally{await browser.close();}
