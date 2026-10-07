const $=selector=>document.querySelector(selector);
const sources={initial:'初始建档记录',legacy:'升级前档案 · 来源未登记',employee:'员工记录',external:'外部资料转录',guardian_report:'家长自报转录'};
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function createProfilesPanel({api,getMe,getCustomer,getEpoch,reload,toast}){
  let profileTarget,contactTarget;
  const clears=[];
  const same=(id,epoch)=>getMe()&&getEpoch()===epoch&&getCustomer()===id;
  function bind(formId,dialogId,errorId,request){
    let pending;const form=$(formId),dialog=$(dialogId);
    const clear=()=>{form.reset();pending=undefined;$(errorId).textContent='';};clears.push(clear);dialog.addEventListener('close',clear);
    form.onsubmit=async event=>{
      event.preventDefault();const epoch=getEpoch(),id=getCustomer(),button=form.querySelector('[type=submit]');button.disabled=true;$(errorId).textContent='';
      try{
        const {path,data}=request(Object.fromEntries(new FormData(form))),fingerprint=JSON.stringify({path,data});
        if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};
        const result=await api(path,{method:'POST',data,key:pending.key});if(!same(id,epoch))return;
        dialog.close();toast(result.duplicate_candidates.length?'已保存；存在同名或共用电话资料，请核对身份。':'资料已保存，原记录和查看授权保留');await reload(id);
      }catch(error){if(same(id,epoch))$(errorId).textContent=error.message;}
      finally{button.disabled=false;}
    };
  }
  bind('#profile-form','#profile-dialog','#profile-error',data=>({path:`/customers/${profileTarget.id}/profile`,data:{...data,expected_version:profileTarget.revision}}));
  bind('#contact-form','#contact-dialog','#contact-error',data=>{
    const fields={name:data.name,relationship:data.relationship,phone:data.phone,source:data.source,note:data.note,reason:data.reason};
    return contactTarget.record?{path:`/contacts/${contactTarget.record.id}`,data:{...fields,active:data.active==='true',expected_revision:contactTarget.record.revision}}:{path:`/customers/${contactTarget.customerId}/contacts`,data:fields};
  });
  function openProfile(c){profileTarget={...c};$('#profile-form').reset();$('#profile-error').textContent='';for(const key of ['name','birth_date','contact_name','phone'])$('#profile-form').elements[key].value=c[key]||'';$('#profile-version').textContent=`当前 V${c.revision} · 保存后保留旧版本`;$('#profile-dialog').showModal();}
  function openContact(id,record){
    contactTarget={customerId:id,record:record?{...record}:null};$('#contact-form').reset();$('#contact-error').textContent='';$('#contact-title').textContent=record?'编辑家庭联系人':'新增家庭联系人';$('#contact-active-field').hidden=!record;
    if(record){for(const key of ['name','relationship','phone','source','note'])$('#contact-form').elements[key].value=record[key]||'';$('#contact-form').elements.active.value=String(Boolean(record.active));}
    $('#contact-dialog').showModal();
  }
  async function history(id,button){
    const epoch=getEpoch();button.disabled=true;
    try{
      const {items}=await api(`/customers/${id}/profile-history`);if(!same(id,epoch))return;
      const box=$('#profile-history-items');box.replaceChildren();
      for(const v of items){
        const card=el('article',undefined,'version-card profile-version-card'),head=el('div',undefined,'version-head');
        head.append(el('h3',v.name),el('span',`V${v.version}`,'badge violet'));card.append(head,el('p',`${sources[v.source]} · ${v.actor_name||'升级基线'} · ${new Date(v.created_at).toLocaleString('zh-CN',{hour12:false})}`,'small muted'));
        const fields=el('dl',undefined,'profile-history-fields');for(const [name,value] of [['出生日期',v.birth_date],['主要联系人',v.contact_name],['主要联系电话',v.phone]]){const pair=el('div');pair.append(el('dt',name),el('dd',value||'未填写'));fields.append(pair);}card.append(fields,el('p',`修改依据：${v.revision_reason}`,'small muted'));box.append(card);
      }
      $('#profile-history-dialog').showModal();
    }catch(e){if(same(id,epoch))toast(e.message);}
    finally{button.disabled=false;}
  }
  function renderActions(top,c){
    const actions=el('div',undefined,'profile-actions');actions.append(el('span',`V${c.revision}`,'badge violet'));
    if(getMe().permissions.includes('customers:update')){const edit=el('button','编辑档案');edit.onclick=()=>openProfile(c);actions.append(edit);}
    if(getMe().permissions.includes('profiles:read')){const button=el('button','档案修改历史');button.onclick=()=>history(c.id,button);actions.append(button);}
    top.append(actions);
  }
  async function renderContacts(target,id){
    const epoch=getEpoch(),heading=el('div',undefined,'section-heading');heading.append(el('h2','家庭联系人'));
    if(getMe().permissions.includes('contacts:manage')){const button=el('button','＋ 新增联系人');button.onclick=()=>openContact(id);heading.append(button);}
    target.replaceChildren(heading,el('p','可登记多位联系人。主要联系人单独维护；联系人资料不产生家长查看授权。','small muted'));
    try{
      const {items}=await api(`/customers/${id}/contacts`);if(!same(id,epoch)||!target.isConnected)return;
      if(!items.length){target.append(el('p','尚未登记家庭联系人。','small muted'));return;}
      for(const record of items){
        const card=el('article',undefined,'family-contact-card');card.dataset.contactId=record.id;card.dataset.revision=record.revision;
        const head=el('div',undefined,'version-head'),name=el('div');name.append(el('h3',record.name),el('small',record.relationship,'muted'));head.append(name,el('span',record.active?'有效':'已停用',record.active?'badge mint':'badge neutral'));card.append(head);
        card.append(el('p',record.phone||'未留电话','contact-phone'),el('small',sources[record.source],'muted'));
        if(record.note)card.append(el('p',record.note,'small muted'));
        if(getMe().permissions.includes('contacts:manage')){const button=el('button','编辑联系人');button.onclick=()=>openContact(id,record);card.append(button);}target.append(card);
      }
    }catch(e){if(same(id,epoch)&&target.isConnected)target.append(el('p',e.message,'form-error'));}
  }
  $('#profile-form').elements.birth_date.max=new Date().toISOString().slice(0,10);
  return {renderActions,renderContacts,reset(){profileTarget=undefined;contactTarget=undefined;for(const clear of clears)clear();$('#profile-history-items').replaceChildren();}};
}
