import {snapshotKey} from './snapshot-key.mjs';
const originalFetch=window.fetch.bind(window);
const snapshot=await originalFetch(new URL('./preview-snapshot.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('预览数据加载失败');return r.json();});
let entered=sessionStorage.getItem('optical-static-entered')==='1';
function response(status,body){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
const denied=message=>response(409,{error:{code:'PREVIEW_READ_ONLY',message}});
window.fetch=async(input,options={})=>{
 const url=new URL(input instanceof Request?input.url:input,location.href),method=(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,options);
 if(url.pathname==='/api/auth/login'&&method==='POST'){entered=true;sessionStorage.setItem('optical-static-entered','1');return response(200,{ok:true});}
 if(url.pathname==='/api/auth/logout'&&method==='POST'){entered=false;sessionStorage.removeItem('optical-static-entered');return response(200,{ok:true});}
 if(!entered)return response(401,{error:{code:'UNAUTHENTICATED',message:'请进入静态体验'}});
 if(method!=='GET')return denied('这是只读体验，未保存修改。完整操作请按页面上的“本地试用”说明运行。');
 const key=snapshotKey(url),record=snapshot.records[key];
 if(record)return response(record.status,record.body);
 if(url.pathname==='/api/customers'){
  const base=snapshot.records['/api/customers'];const q=url.searchParams.get('q')||'';
  if(base)return response(200,{...base.body,items:base.body.items.filter(x=>[x.id,x.name,x.contact_name,x.phone].some(v=>String(v??'').includes(q)))});
 }
 return denied('这项筛选或详情尚未收录到静态样例中。可先浏览其他样例，完整操作请运行本地版。');
};
const banner=document.createElement('aside');banner.id='static-preview-banner';banner.setAttribute('aria-label','静态体验说明');
const label=document.createElement('strong');label.textContent=`静态体验 · V${snapshot.version}`;
const text=document.createElement('span');text.textContent='虚构样例 · 仅浏览，不保存修改';
const help=document.createElement('a');help.href='https://github.com/wenjinliuu/optical-workbench#本地完整试用';help.target='_blank';help.rel='noopener';help.textContent='本地试用说明';
const source=document.createElement('a');source.href='https://github.com/wenjinliuu/optical-workbench';source.target='_blank';source.rel='noopener';source.textContent='项目源码';
banner.append(label,text,help,source);document.body.prepend(banner);
const form=document.querySelector('#login-form');
form.querySelector('h2').textContent='视光工作台 · 进入体验';form.querySelector('p.muted').textContent='浏览当前界面与虚构流程样例。这里没有真实账号登录，业务修改不会保存。';
for(const [field,value] of [['username','demo-manager'],['password','static-preview-only']]){const input=form.elements[field];input.value=value;input.required=false;input.type='hidden';input.closest('label').hidden=true;}
form.querySelector('[type=submit]').textContent='进入体验';
await import('./app.js');
