const $=s=>document.querySelector(s);
let me, selected, csrf, customers=[], searchVersion=0, toastTimer, sessionEpoch=0;
const roleNames={manager:'门店负责人',reception:'前台 / 销售',professional:'专业人员',guardian:'家长 / 客户'};
const cycleNames={followup:'长期随访',training:'训练服务',retail:'配镜服务'};
const actions={'session.login':'登录工作台','session.logout':'退出工作台','customer.create':'新建客户档案','cycle.create':'创建服务周期草稿'};
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(path,{method='GET',data,key}={}){
  const epoch=sessionEpoch;const headers={};if(data)headers['Content-Type']='application/json';if(method!=='GET')headers['X-CSRF-Token']=csrf||'';if(key)headers['Idempotency-Key']=key;
  const r=await fetch(`/api${path}`,{method,headers,body:data?JSON.stringify(data):undefined});const b=await r.json();if(epoch!==sessionEpoch)throw Error('会话已切换，请重新操作');
  if(!r.ok){if(r.status===401&&path!=='/auth/login')showLogin();throw Error(b.error?.message||'操作失败，请重试');}return b;
}
function showLogin(){sessionEpoch++;searchVersion++;$('#search').value='';me=undefined;csrf=undefined;selected=undefined;customers=[];$('#workspace').hidden=true;$('#login-view').hidden=false;$('#customer-items').replaceChildren();$('#detail').replaceChildren();$('#audit-items').replaceChildren();for(const d of document.querySelectorAll('dialog[open]'))d.close();$('#login-form').elements.password.value='';}
async function boot(){
  try{me=await api('/me');csrf=me.csrf;$('#login-view').hidden=true;$('#workspace').hidden=false;$('#loading').hidden=true;$('#user-name').textContent=me.name;$('#user-role').textContent=roleNames[me.role];$('#user-avatar').textContent=me.name.slice(0,1);$('#store-name').textContent=me.store?.name||'授权家庭范围';$('#audit-nav').hidden=!me.permissions.includes('audit:read');$('#new-customer').hidden=!me.permissions.includes('customers:create');$('#search').placeholder=me.role==='guardian'?'按客户姓名搜索':'姓名、联系人、电话或编号';switchView('customers');await loadCustomers();}
  catch(e){if(me)$('#global-error').textContent=e.message;else showLogin();}
}
function switchView(view){for(const name of ['customers','audit','phase'])$(`#${name}-view`).hidden=name!==view;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b.dataset.view===view);$('#global-error').textContent='';}
async function loadCustomers(){
  const version=++searchVersion;$('#list-error').textContent='';
  try{const b=await api(`/customers?q=${encodeURIComponent($('#search').value)}`);if(version!==searchVersion||!me)return;customers=b.items;$('#customer-count').textContent=customers.length;const box=$('#customer-items');box.replaceChildren();if(!customers.length){const empty=el('div',undefined,'empty');empty.append(el('h2','暂无匹配档案'),el('p','调整搜索条件，或新建客户开始服务。'));box.append(empty);}for(const c of customers){const button=el('button',undefined,'customer-row');button.type='button';button.classList.toggle('active',c.id===selected);button.setAttribute('aria-pressed',String(c.id===selected));const info=el('span');info.append(el('strong',c.name),el('small',c.contact_name?`${c.contact_name} · ${c.phone||'未留电话'}`:'客户编号 '+c.id.slice(0,8)));button.append(el('span',c.name.slice(0,1),'avatar'),info,el('span','›'));button.onclick=()=>openCustomer(c.id);box.append(button);}}
  catch(e){if(version===searchVersion)$('#list-error').textContent=e.message;}
}
async function openCustomer(id){
  selected=id;$('#global-error').textContent='';$('#detail').replaceChildren(el('p','正在读取档案…','muted'));
  try{const {customer:c,cycles}=await api(`/customers/${id}`);if(selected!==id||!me)return;const detail=$('#detail');detail.replaceChildren();const top=el('div',undefined,'detail-top'),name=el('div');name.append(el('h2',c.name),el('p',`客户编号 ${c.id}`));top.append(el('span',c.name.slice(0,1),'avatar'),name);detail.append(top);const fields=el('dl',undefined,'detail-fields');for(const [k,v] of [['出生日期',c.birth_date||'未填写'],...(me.role==='guardian'?[]:[['联系人',c.contact_name||'未填写'],['联系电话',c.phone||'未填写'],['建档日期',c.created_at?.slice(0,10)||'—']])]){const div=el('div');div.append(el('dt',k),el('dd',v));fields.append(div);}detail.append(fields);if(me.role==='guardian'){detail.append(el('p','当前仅展示授权基本资料；专业报告发布功能尚未实现。','muted'));}else{const head=el('div',undefined,'cycle-heading');head.append(el('h2',`独立服务周期 · ${cycles.length}`));if(me.permissions.includes('cycles:create')){const button=el('button','＋ 新建周期');button.onclick=()=>{$('#cycle-form').reset();$('#cycle-error').textContent='';$('#cycle-dialog').showModal();};head.append(button);}detail.append(head);if(!cycles.length)detail.append(el('p','尚无服务周期。可以从服务目标创建一个草稿。','small muted'));for(const cycle of cycles){const card=el('article',undefined,'cycle-card'),h=el('h3',cycleNames[cycle.type]);h.append(el('span','草稿','pill'));card.append(h,el('p',cycle.goal),el('small',`创建于 ${cycle.created_at.slice(0,10)} · 独立周期`));detail.append(card);}}await loadCustomers();}
  catch(e){if(selected===id){$('#detail').replaceChildren(el('p',e.message,'form-error'));}}
}
async function loadAudit(){try{const b=await api('/audit');if(!me)return;$('#audit-items').replaceChildren();if(!b.items.length){const row=el('tr'),cell=el('td','暂无操作记录');cell.colSpan=4;row.append(cell);$('#audit-items').append(row);}for(const item of b.items){const row=el('tr');row.append(el('td',new Date(item.created_at).toLocaleString('zh-CN',{hour12:false})),el('td',actions[item.action]||item.action),el('td',item.actor_id),el('td',item.entity_id));$('#audit-items').append(row);}}catch(e){$('#global-error').textContent=e.message;}}
$('#login-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;$('#login-error').textContent='';try{await api('/auth/login',{method:'POST',data:Object.fromEntries(new FormData(form))});form.elements.password.value='';await boot();}catch(e){$('#login-error').textContent=e.message;}finally{button.disabled=false;}};
$('#logout-mobile').onclick=$('#logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST'});showLogin();}catch(e){$('#global-error').textContent=e.message;}};
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{switchView(button.dataset.view);if(button.dataset.view==='audit')loadAudit();};
$('#refresh-audit').onclick=loadAudit;
let searchTimer;$('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadCustomers,200);};
$('#new-customer').onclick=()=>{$('#customer-form').reset();$('#customer-error').textContent='';$('#customer-dialog').showModal();};
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>button.closest('dialog').close();
function mutationForm(formId,dialogId,errorId,path,onSuccess){let pending;
  $(formId).onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),data=Object.fromEntries(new FormData(form)),target=path();
    const fingerprint=JSON.stringify({target,data});if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};button.disabled=true;$(errorId).textContent='';
    try{const b=await api(target,{method:'POST',data,key:pending.key});pending=null;$(dialogId).close();await onSuccess(b);}catch(e){$(errorId).textContent=e.message;}finally{button.disabled=false;}
  };
}
mutationForm('#customer-form','#customer-dialog','#customer-error',()=>'/customers',async b=>{toast(b.duplicate_candidates.length?'档案已保存；发现同名或共用电话的档案，请核对身份。':'客户档案已保存');$('#search').value='';await openCustomer(b.customer.id);});
mutationForm('#cycle-form','#cycle-dialog','#cycle-error',()=>`/customers/${selected}/cycles`,async()=>{toast('服务周期草稿已保存');await openCustomer(selected);});
$('#customer-form').elements.birth_date.max=new Date().toISOString().slice(0,10);
boot();
