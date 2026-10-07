import { createDocumentPanels } from './documents.js';
import { createOrganizationPanel } from './organization.js';
const $=s=>document.querySelector(s);
let me, selected, csrf, customers=[], searchVersion=0, toastTimer, sessionEpoch=0;
const roleNames={manager:'门店负责人',reception:'前台 / 销售',professional:'专业人员',guardian:'家长 / 客户'};
const cycleNames={followup:'长期随访',training:'训练服务',retail:'配镜服务'};
const actions={'session.login':'登录工作台','session.logout':'退出工作台','customer.create':'新建客户档案','cycle.create':'创建服务周期草稿','guardian.authorize':'授权家长关联','guardian.revoke':'撤销家长授权','visit.register':'登记到店','visit.close':'结束本次到店','demo.seed':'扩展虚构案例','attachment.upload':'上传附件','attachment.download':'下载附件','attachment.revoke':'撤销附件访问','document.create':'建立资料版本','document.revise':'修订资料版本','staff.create':'建立员工账号','staff.update':'调整员工资料','staff.password_reset':'重置员工密码','staff.sessions_revoke':'撤销员工会话','account.password':'修改本人密码'};
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(path,{method='GET',data,key}={}){
  const epoch=sessionEpoch;const headers={};if(data)headers['Content-Type']='application/json';if(method!=='GET')headers['X-CSRF-Token']=csrf||'';if(key)headers['Idempotency-Key']=key;
  const r=await fetch(`/api${path}`,{method,headers,body:data?JSON.stringify(data):undefined});const b=await r.json();if(epoch!==sessionEpoch)throw Error('会话已切换，请重新操作');
  if(!r.ok){if(r.status===401&&path!=='/auth/login')showLogin();throw Error(b.error?.message||'操作失败，请重试');}return b;
}
const documentPanels=createDocumentPanels({api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,reload:openCustomer,toast,showLogin});
const organizationPanel=createOrganizationPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,boot,onLogout:logout});
function showLogin(){documentPanels.reset();organizationPanel.reset();sessionEpoch++;searchVersion++;$('#search').value='';me=undefined;csrf=undefined;selected=undefined;customers=[];$('#workspace').hidden=true;$('#login-view').hidden=false;$('#customer-items').replaceChildren();$('#detail').replaceChildren();$('#audit-items').replaceChildren();$('#organization-items').replaceChildren();$('#demo-scenarios').replaceChildren();$('#demo-summary').replaceChildren();for(const d of document.querySelectorAll('dialog[open]'))d.close();$('#login-form').elements.password.value='';}
async function boot(){
  try{me=await api('/me');csrf=me.csrf;$('#login-view').hidden=true;$('#workspace').hidden=false;$('#loading').hidden=true;$('#user-name').textContent=me.name;$('#user-role').textContent=roleNames[me.role];$('#user-avatar').textContent=me.name.slice(0,1);$('#store-name').textContent=me.store?.name||'授权家庭范围';$('#demo-nav').hidden=!me.permissions.includes('demo:read');$('#organization-nav').hidden=!me.permissions.includes('organization:read');$('#audit-nav').hidden=!me.permissions.includes('audit:read');$('#new-customer').hidden=!me.permissions.includes('customers:create');$('#search').placeholder=me.role==='guardian'?'按客户姓名搜索':'姓名、联系人、电话或编号';switchView('customers');if(me.must_change_password){organizationPanel.openPassword();return;}await loadCustomers();}
  catch(e){if(me)$('#global-error').textContent=e.message;else showLogin();}
}
function switchView(view){for(const name of ['customers','audit','phase','demo','organization'])$(`#${name}-view`).hidden=name!==view;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b.dataset.view===view);$('#global-error').textContent='';}
async function loadCustomers(){
  const version=++searchVersion;$('#list-error').textContent='';
  try{const b=await api(`/customers?q=${encodeURIComponent($('#search').value)}`);if(version!==searchVersion||!me)return;customers=b.items;$('#customer-count').textContent=customers.length;const box=$('#customer-items');box.replaceChildren();if(!customers.length){const empty=el('div',undefined,'empty');empty.append(el('h2','暂无匹配档案'),el('p','调整搜索条件，或新建客户开始服务。'));box.append(empty);}for(const c of customers){const button=el('button',undefined,'customer-row');button.type='button';button.classList.toggle('active',c.id===selected);button.setAttribute('aria-pressed',String(c.id===selected));const info=el('span');info.append(el('strong',c.name),el('small',c.contact_name?`${c.contact_name} · ${c.phone||'未留电话'}`:'客户编号 '+c.id.slice(0,8)));button.append(el('span',c.name.slice(0,1),'avatar'),info,el('span','›'));button.onclick=()=>openCustomer(c.id);box.append(button);}}
  catch(e){if(version===searchVersion)$('#list-error').textContent=e.message;}
}
async function openCustomer(id){
  selected=id;$('#global-error').textContent='';$('#detail').replaceChildren(el('p','正在读取档案…','muted'));
  try{
    const {customer:c,cycles,visits,guardians}=await api(`/customers/${id}`);
    if(selected!==id||!me)return;
    const detail=$('#detail');detail.replaceChildren();
    const top=el('div',undefined,'detail-top'),name=el('div');
    name.append(el('h2',c.name),el('p',`客户编号 ${c.id}`));
    top.append(el('span',c.name.slice(0,1),'avatar'),name);detail.append(top);
    const fields=el('dl',undefined,'detail-fields');
    for(const [k,v] of [['出生日期',c.birth_date||'未填写'],...(me.role==='guardian'?[]:[['联系人',c.contact_name||'未填写'],['联系电话',c.phone||'未填写'],['建档日期',c.created_at?.slice(0,10)||'—']])]){
      const div=el('div');div.append(el('dt',k),el('dd',v));fields.append(div);
    }
    detail.append(fields);
    if(me.role==='guardian'){
      detail.append(el('p','当前仅展示授权基本资料；专业报告发布功能尚未实现。','muted'));
    }else{
      const documentsTarget=el('div',undefined,'documents-area');detail.append(documentsTarget);documentPanels.render(documentsTarget,id);
      const head=el('div',undefined,'cycle-heading');head.append(el('h2',`独立服务周期 · ${cycles.length}`));
      if(me.permissions.includes('cycles:create')){
        const button=el('button','＋ 新建周期');button.onclick=()=>{$('#cycle-form').reset();$('#cycle-error').textContent='';$('#cycle-dialog').showModal();};head.append(button);
      }
      detail.append(head);
      if(!cycles.length)detail.append(el('p','尚无服务周期。可以从服务目标创建一个草稿。','small muted'));
      for(const cycle of cycles){
        const card=el('article',undefined,'cycle-card'),h=el('h3',cycleNames[cycle.type]);card.dataset.type=cycle.type;
        h.append(el('span','草稿','pill'));card.append(h,el('p',cycle.goal),el('small',`创建于 ${cycle.created_at.slice(0,10)} · 独立周期`));detail.append(card);
      }
      renderFamily(detail,guardians,id);
      renderVisits(detail,visits,cycles,id);
    }
    await loadCustomers();
  }catch(e){if(selected===id)$('#detail').replaceChildren(el('p',e.message,'form-error'));}
}
async function loadAudit(){try{const b=await api('/audit');if(!me)return;$('#audit-items').replaceChildren();if(!b.items.length){const row=el('tr'),cell=el('td','暂无操作记录');cell.colSpan=4;row.append(cell);$('#audit-items').append(row);}for(const item of b.items){const row=el('tr');row.append(el('td',new Date(item.created_at).toLocaleString('zh-CN',{hour12:false})),el('td',actions[item.action]||item.action),el('td',item.actor_id),el('td',item.entity_id));$('#audit-items').append(row);}}catch(e){$('#global-error').textContent=e.message;}}
$('#login-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;$('#login-error').textContent='';try{await api('/auth/login',{method:'POST',data:Object.fromEntries(new FormData(form))});form.elements.password.value='';await boot();}catch(e){$('#login-error').textContent=e.message;}finally{button.disabled=false;}};
async function logout(){try{await api('/auth/logout',{method:'POST'});showLogin();}catch(e){$('#global-error').textContent=e.message;}}
$('#logout-mobile').onclick=$('#logout').onclick=logout;
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{switchView(button.dataset.view);if(button.dataset.view==='audit')loadAudit();if(button.dataset.view==='demo')loadDemo();if(button.dataset.view==='organization')loadOrganization();};
$('#refresh-audit').onclick=loadAudit;
let searchTimer;$('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadCustomers,200);};
$('#new-customer').onclick=()=>{$('#customer-form').reset();$('#customer-error').textContent='';$('#customer-dialog').showModal();};
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>button.closest('dialog').close();
function mutationForm(formId,dialogId,errorId,path,onSuccess,transform=value=>value){let pending;
  $(formId).onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),data=transform(Object.fromEntries(new FormData(form)),form),target=path();
    const fingerprint=JSON.stringify({target,data});if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};button.disabled=true;$(errorId).textContent='';
    try{const b=await api(target,{method:'POST',data,key:pending.key});pending=null;$(dialogId).close();await onSuccess(b);}catch(e){$(errorId).textContent=e.message;}finally{button.disabled=false;}
  };
}
mutationForm('#customer-form','#customer-dialog','#customer-error',()=>'/customers',async b=>{toast(b.duplicate_candidates.length?'档案已保存；发现同名或共用电话的档案，请核对身份。':'客户档案已保存');$('#search').value='';await openCustomer(b.customer.id);});
mutationForm('#cycle-form','#cycle-dialog','#cycle-error',()=>`/customers/${selected}/cycles`,async()=>{toast('服务周期草稿已保存');await openCustomer(selected);});
$('#customer-form').elements.birth_date.max=new Date().toISOString().slice(0,10);
let visitToClose;
function sectionHeader(title,action){
  const head=el('div',undefined,'section-heading');head.append(el('h2',title));if(action)head.append(action);return head;
}
function renderFamily(detail,guardians,id){
  let action;
  if(me.permissions.includes('guardians:manage')){
    action=el('button','管理关联');action.onclick=async()=>{
      action.disabled=true;
      try{
        const b=await api('/organization');if(selected!==id||!me)return;
        const options=b.items.filter(u=>u.role==='guardian'&&u.active);
        if(!options.length){toast('本店暂无可关联的家长账号');return;}
        $('#guardian-form').reset();$('#guardian-error').textContent='';
        const select=$('#guardian-form select[name=user_id]');select.replaceChildren();
        for(const u of options){const o=el('option',u.display_name);o.value=u.id;select.append(o);}
        $('#guardian-dialog').showModal();
      }catch(e){$('#global-error').textContent=e.message;}finally{action.disabled=false;}
    };
  }
  detail.append(sectionHeader('家庭关联与授权',action));
  if(!guardians.length)detail.append(el('p','尚无家长账号关联。联系人电话不等于查看授权。','small muted'));
  for(const g of guardians){
    const item=el('div',undefined,'family-row'),text=el('div');
    text.append(el('strong',g.display_name),el('small',g.relationship||'关系尚未登记'));
    item.append(el('span',g.display_name.slice(0,1),'avatar'),text,el('span',g.active?'已授权':'已撤销',g.active?'badge mint':'badge neutral'));detail.append(item);
  }
}
function renderVisits(detail,visits,cycles,id){
  let action;
  if(me.permissions.includes('visits:create')){
    action=el('button','＋ 登记到店');action.onclick=()=>{
      $('#visit-form').reset();$('#visit-error').textContent='';const box=$('#visit-cycle-options');box.replaceChildren();
      if(!cycles.length)box.append(el('p','暂无周期，可先登记到店目的。','small muted'));
      for(const c of cycles){const label=el('label',undefined,'checkbox-option'),input=el('input');input.type='checkbox';input.name='cycle_ids';input.value=c.id;label.append(input,el('span',`${cycleNames[c.type]} · ${c.goal}`));box.append(label);}
      $('#visit-dialog').showModal();
    };
  }
  detail.append(sectionHeader(`到店记录 · ${visits.length}`,action));
  if(!visits.length)detail.append(el('p','尚无到店记录。到店与服务周期分别管理。','small muted'));
  for(const v of visits){
    const item=el('article',undefined,'visit-card'),head=el('div',undefined,'visit-head');
    head.append(el('strong',v.purpose),el('span',v.status==='closed'?'本次已结束':'已登记',v.status==='closed'?'badge neutral':'badge sky'));
    item.append(head,el('p',`关联 ${v.cycle_ids.length} 个周期 · ${v.cycle_ids.map(cid=>cycleNames[cycles.find(c=>c.id===cid)?.type]||'服务周期').join(' / ')||'仅登记到店目的'}`,'small muted'),el('small',new Date(v.created_at).toLocaleString('zh-CN',{hour12:false})));
    if(v.status==='registered'&&me.permissions.includes('visits:close')){
      const close=el('button','结束本次到店');close.onclick=()=>{visitToClose=v.id;$('#close-visit-form').reset();$('#close-visit-error').textContent='';$('#close-visit-dialog').showModal();};item.append(close);
    }
    detail.append(item);
  }
}
const loadOrganization=()=>organizationPanel.load();
async function loadDemo(){
  $('#demo-scenarios').replaceChildren(el('p','正在读取演示案例…','muted'));
  try{
    const b=await api('/demo/scenarios');if(!me)return;const box=$('#demo-scenarios');box.replaceChildren();const summary=$('#demo-summary');summary.replaceChildren();
    for(const [type,label,tone] of [['followup','接待与长期随访','mint'],['training','评估与训练','violet'],['retail','配镜与交付','coral']]){
      const stat=el('article',undefined,`demo-stat ${tone}`);stat.append(el('span',label),el('strong',String(b.items.filter(s=>s.type===type).length)),el('small','虚构演示场景'));summary.append(stat);
    }
    if(!b.items.length){box.append(el('div','当前还没有演示案例。请在本地使用 npm run demo 追加示例资料；原账号和密码会保留。','empty'));return;}
    for(const s of b.items){
      const card=el('article',undefined,'card scenario-card');card.dataset.type=s.type;
      const top=el('div',undefined,'scenario-top');top.append(el('span',cycleNames[s.type],'badge '+({followup:'mint',training:'violet',retail:'coral'}[s.type])),el('small','虚构场景'));
      const name=el('div',undefined,'scenario-name');name.append(el('span',s.name.slice(0,1),'avatar'),el('h2',s.name));
      card.append(top,name,el('h3',s.stage),el('p',s.goal,'muted'));
      const steps=el('ol',undefined,'journey-steps');
      s.steps.forEach((step,i)=>{const li=el('li',step,i<s.index?'past':i===s.index?'current':'future');if(i===s.index)li.setAttribute('aria-current','step');steps.append(li);});card.append(steps);
      const next=el('div',undefined,'scenario-next');next.append(el('strong',`下一步 · ${s.owner}`),el('p',s.next));card.append(next);
      const events=el('details',undefined,'scenario-events');events.append(el('summary','查看演示衔接记录'));const list=el('ul');for(const event of s.events)list.append(el('li',event));events.append(list);card.append(events);
      const button=el('button','查看关联档案 →');button.onclick=()=>{switchView('customers');$('#search').value='';openCustomer(s.customer_id);$('#detail').scrollIntoView({behavior:'smooth',block:'start'});};card.append(button);box.append(card);
    }
  }catch(e){$('#demo-scenarios').replaceChildren(el('p',e.message,'form-error'));}
}
mutationForm('#guardian-form','#guardian-dialog','#guardian-error',()=>`/customers/${selected}/guardians`,async b=>{toast(b.active?'家长查看授权已保存':'家长查看授权已撤销');await openCustomer(selected);},data=>({...data,active:data.active==='true'}));
mutationForm('#visit-form','#visit-dialog','#visit-error',()=>`/customers/${selected}/visits`,async()=>{toast('本次到店已登记');await openCustomer(selected);},(data,form)=>({purpose:data.purpose,cycle_ids:new FormData(form).getAll('cycle_ids')}));
mutationForm('#close-visit-form','#close-visit-dialog','#close-visit-error',()=>`/visits/${visitToClose}/close`,async()=>{toast('本次到店已结束，独立周期继续保留');await openCustomer(selected);});
boot();
