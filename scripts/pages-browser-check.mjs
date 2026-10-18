import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.env.PLAYWRIGHT_MODULE_PATH)throw Error('PLAYWRIGHT_MODULE_PATH is required');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const root=resolve('pages-dist'),snapshot=JSON.parse(readFileSync(root+'/preview-snapshot.json','utf8'));
assert.equal(snapshot.synthetic,true);assert.equal(snapshot.read_only,true);
for(const f of readdirSync(root,{recursive:true}))assert.ok(!/\.(sqlite|db|env)(?:-|$)/.test(f),'No databases or credentials in Pages artifact');
let apiRequests=0;
const server=createServer((req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path.startsWith('/api/')){apiRequests++;res.writeHead(404);return res.end();}const relative=path.replace(/^\/optical-workbench\//,'');const file=resolve(root,relative||'index.html');if(!file.startsWith(root+'/'))throw Error();const data=readFileSync(file),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(0,'127.0.0.1');await once(server,'listening');const url=process.env.PAGES_URL||`http://127.0.0.1:${server.address().port}/optical-workbench/`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
mkdirSync('data/browser-check',{recursive:true});
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  await page.goto(url);await page.getByRole('button',{name:'进入体验',exact:true}).click();await page.locator('#customers-view').waitFor({state:'visible'});
  await page.locator('.customer-row').first().waitFor();assert.ok((await page.locator('#static-preview-banner').textContent()).includes('仅浏览'));
  if(name==='desktop'){
   for(const view of snapshot.views){await page.locator(`[data-view="${view}"]`).click();await page.waitForFunction(view=>!document.querySelector('#'+view+'-view').textContent.includes('正在读取'),view);assert.ok(!(await page.locator('#'+view+'-view').textContent()).includes('尚未收录'),`default module ${view} must be captured`);}
  }
  await page.locator('[data-view=customers]').click();await page.locator('.customer-row').first().click();await page.locator('.detail-top h2').waitFor();assert.ok((await page.locator('#detail').textContent()).length>100);
  await page.locator('#new-customer').click();await page.locator('#customer-form input[name=name]').fill('预览测试客户（虚构）');await page.locator('#customer-form button[type=submit]').click();await page.locator('#customer-error').filter({hasText:'未保存修改'}).waitFor();
  await page.locator('#customer-dialog [data-close]').first().click();await page.locator('[data-view=demo]').click();await page.locator('.scenario-card').first().waitFor();assert.equal(await page.locator('.scenario-card').count(),6);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');await page.screenshot({path:`data/browser-check/pages-${name}.png`,fullPage:true});
  await page.locator(name==='mobile'?'#logout-mobile':'#logout').click();await page.locator('#login-view').waitFor({state:'visible'});await page.getByRole('button',{name:'进入体验',exact:true}).click();await page.locator('#customers-view').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await context.close();
 }
 assert.equal(apiRequests,0,'Static preview must never require an API server');
 console.log(JSON.stringify({result:'passed',views:snapshot.views.length,responses:Object.keys(snapshot.records).length,viewports:['1440x1000','390x844'],api_network_requests:apiRequests,read_only:true,project_subpath:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
