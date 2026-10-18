import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {once} from 'node:events';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApp} from '../src/server.mjs';

if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('PLAYWRIGHT_MODULE_PATH must reference an installed Playwright module.');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const output=resolve('pages-dist'),scratch=mkdtempSync(join(tmpdir(),'optical-pages-')),database=join(scratch,'synthetic.sqlite');
const seeded=spawnSync(process.execPath,['scripts/demo.mjs'],{env:{...process.env,NODE_ENV:'test',DATABASE_PATH:database},encoding:'utf8'});
if(seeded.status!==0){rmSync(scratch,{recursive:true,force:true});throw Error('Isolated synthetic demo initialization failed.');}
const {server,db}=createApp({databasePath:database,mode:'test',logger:()=>{}});
const token=randomBytes(32).toString('hex');
db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),'demo-manager','static-build-only',Date.now()+3600000);
server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const {snapshotKey}=await import('../preview/snapshot-key.mjs');
const records={},captures=[],views=[],errors=[];const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:'ow_session',value:token,url:origin}]);
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
function remember(url,status,body){
 if(status!==200)return;
 const key=snapshotKey(url);if(key==='/api/me')body={...body,csrf:'static-preview-only'};
 const text=JSON.stringify(body);assert.ok(!/"(?:password_hash|token_hash)"\s*:/.test(text),'Private database fields must never enter Pages.');
 records[key]={status,body};
}
page.on('response',response=>{if(response.url().startsWith(origin+'/api/')&&response.request().method()==='GET')captures.push((async()=>{try{remember(response.url(),response.status(),await response.json());}catch(e){if(e.code==='ERR_ASSERTION')throw e;}})());});
await page.route('**/api/**',route=>route.request().method()==='GET'?route.continue():route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'PREVIEW_READ_ONLY',message:'静态体验只读'}})}));
async function capture(path){
 const response=await fetch(origin+path,{headers:{Cookie:`ow_session=${token}`}});if(response.status!==200)return null;
 try{const body=await response.json();remember(path,200,body);return body;}catch{return null;}
}
try{
 await page.goto(origin);await page.locator('#customers-view').waitFor({state:'visible'});
 for(const button of await page.locator('[data-view]').all()){
  if(!await button.isVisible())continue;
  const view=await button.getAttribute('data-view');await button.evaluate(b=>b.click());await page.waitForTimeout(150);await page.waitForLoadState('networkidle');views.push(view);
  // Capture each module's real first detail/context request and its visible
  // read-only subviews. All mutations are blocked during generation as well.
  const root=page.locator(`#${view}-view`);
  const reads=root.getByRole('button').filter({hasText:/^(查看|详情|读取|打开|历史)/});
  for(let i=0;i<Math.min(await reads.count(),3);i++){
   const b=reads.nth(i);if(!await b.isVisible()||!await b.isEnabled())continue;
   await b.evaluate(e=>e.click());await page.waitForTimeout(150);await page.waitForLoadState('networkidle');
   await page.evaluate(()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();});
  }
 }
 await page.locator('[data-view=demo]').evaluate(b=>b.click());await page.waitForTimeout(150);await page.waitForLoadState('networkidle');
 for(let i=0;i<await page.locator('.scenario-card').count();i++){
  await page.locator('[data-view=demo]').evaluate(b=>b.click());
  await page.locator('.scenario-card').nth(i).getByRole('button',{name:'查看关联档案 →'}).evaluate(b=>b.click());
  await page.waitForTimeout(150);await page.waitForLoadState('networkidle');
 }
 await page.locator('[data-view=customers]').evaluate(b=>b.click());
 for(const row of await page.locator('.customer-row').all()){
  await row.evaluate(b=>b.click());await page.waitForTimeout(80);await page.waitForLoadState('networkidle');
 }
 await Promise.all(captures);
 // Expand real list entries through the existing read API, rather than invent
 // replacement records. Additional context is captured for every visible client.
 const roots=Object.entries(records);
 for(const [key,value] of roots){
  const path=key.split('?')[0],items=value.body.items;
  if(!Array.isArray(items)||/\/(?:events|versions|timeline|authorization)$/.test(path))continue;
  for(const item of items.slice(0,100)){
   const id=item.id??item.root_id;if(typeof id!=='string'||!/^[-\w]+$/.test(id))continue;
   await capture(path+'/'+id);
   if(path==='/api/customers')for(const suffix of ['overview','timeline','profile-history','contacts','documents','attachments','tasks','cycles','visits'])await capture(path+'/'+id+'/'+suffix);
  }
 }
 await Promise.all(captures);assert.deepEqual(errors,[]);assert.ok(views.includes('customers')&&views.includes('demo')&&views.includes('phase'));assert.ok(records['/api/me']);
 rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});cpSync('public',output,{recursive:true});
 for(const file of ['entry.mjs','snapshot-key.mjs','preview.css'])cpSync('preview/'+file,join(output,file));
 let html=readFileSync(join(output,'index.html'),'utf8').replace(/(src|href)="\/(?!\/)/g,'$1="./').replace('src="./app.js"','src="./entry.mjs"').replace('</head>','<link rel="stylesheet" href="./preview.css">\n</head>');
 writeFileSync(join(output,'index.html'),html);writeFileSync(join(output,'.nojekyll'),'');
 const manifest={format:1,synthetic:true,read_only:true,version:JSON.parse(readFileSync('package.json')).version,built_at:new Date().toISOString(),views,records};
 writeFileSync(join(output,'preview-snapshot.json'),JSON.stringify(manifest));
 const summary={version:manifest.version,views:views.length,responses:Object.keys(records).length,bytes:JSON.stringify(manifest).length};writeFileSync(join(output,'preview-manifest.json'),JSON.stringify({...summary,synthetic:true,read_only:true},null,2)+'\n');console.log(JSON.stringify(summary));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));rmSync(scratch,{recursive:true,force:true});}
