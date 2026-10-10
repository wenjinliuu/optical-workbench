const $=s=>document.querySelector(s);
const sources={initial:'初始需求登记',legacy:'存量需求 · 此前修订未追溯',employee:'员工记录',external:'外部资料转录',guardian_report:'家长自报转录'};
const types={followup:'长期随访',training:'训练服务',retail:'配镜服务'};
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
export function createCyclesPanel({api,getMe,getCustomer,getEpoch,reload,toast}){
 let editing,pending;const same=(id,epoch)=>getMe()&&getEpoch()===epoch&&getCustomer()===id;
 const clear=()=>{$('#cycle-revision-form').reset();$('#cycle-revision-error').textContent='';editing=undefined;pending=undefined;$('#cycle-current-goal').textContent='';};$('#cycle-revision-dialog').addEventListener('close',clear);
 function open(cycle){clear();editing={...cycle};$('#cycle-revision-form').elements.goal.value=cycle.goal;$('#cycle-revision-label').textContent=`${types[cycle.type]} · 当前 V${cycle.version}`;$('#cycle-current-goal').textContent='当前已保存需求：'+cycle.goal;$('#cycle-revision-dialog').showModal();}
 async function history(cycle,button){
  const customerId=getCustomer(),epoch=getEpoch();button.disabled=true;
  try{const data=await api(`/cycles/${cycle.id}`);if(!same(customerId,epoch))return;$('#cycle-history-label').textContent=`${types[data.cycle.type]} · 周期草稿`;const box=$('#cycle-history-items');box.replaceChildren();
   for(const v of data.versions){const card=el('article',undefined,'cycle-version-card version-card'),head=el('div',undefined,'version-head');head.append(el('h3',types[v.type]),el('span',`V${v.version}`,'badge mint'));card.append(head,el('p',`${sources[v.source]} · ${v.actor_name||'升级基线'} · ${new Date(v.created_at).toLocaleString('zh-CN',{hour12:false})}`,'small muted'),el('p',v.goal,'cycle-version-goal'),el('p',`修订依据：${v.revision_reason}`,'small muted'));box.append(card);}
   $('#cycle-history-dialog').showModal();
  }catch(e){if(same(customerId,epoch))toast(e.message);}finally{button.disabled=false;}
 }
 $('#reload-cycle-revision').onclick=async()=>{
  const id=editing?.id,customerId=getCustomer(),epoch=getEpoch(),button=$('#reload-cycle-revision');if(!id)return;button.disabled=true;
  try{const data=await api(`/cycles/${id}`);if(!same(customerId,epoch)||editing?.id!==id)return;editing={...data.cycle};$('#cycle-revision-label').textContent=`${types[editing.type]} · 当前 V${editing.version}`;$('#cycle-current-goal').textContent='当前已保存需求：'+editing.goal;$('#cycle-revision-error').textContent='';toast('已读取最新需求，编辑内容保留；核对后再保存');}
  catch(e){if(same(customerId,epoch))$('#cycle-revision-error').textContent=e.message;}finally{button.disabled=false;}
 };
 function renderActions(card,cycle){const actions=el('div',undefined,'record-actions');if(getMe().permissions.includes('cycles:revise')){const edit=el('button','修订周期需求');edit.onclick=()=>open(cycle);actions.append(edit);}const view=el('button','周期需求历史');view.onclick=()=>history(cycle,view);actions.append(view);card.append(actions);}
 $('#cycle-revision-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),epoch=getEpoch(),customerId=getCustomer();button.disabled=true;$('#cycle-revision-error').textContent='';
  try{const data={...Object.fromEntries(new FormData(form)),expected_version:editing.version},path=`/cycles/${editing.id}/versions`,fingerprint=JSON.stringify({path,data});if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};await api(path,{method:'POST',data,key:pending.key});if(!same(customerId,epoch))return;$('#cycle-revision-dialog').close();toast('周期需求已修订；原到店引用版本保留');await reload(customerId);
  }catch(e){if(same(customerId,epoch))$('#cycle-revision-error').textContent=e.message;}finally{button.disabled=false;}
 };
 return {renderActions,reset(){clear();$('#cycle-history-items').replaceChildren();$('#cycle-history-label').textContent='';}};
}
