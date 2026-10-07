const kinds={profile:'档案',cycle:'周期',visit:'到店',contact:'联系人',document:'资料',attachment:'附件',authorization:'查看授权'};
const sources={initial:'初始建档',legacy:'升级基线 · 此前修改未追溯',employee:'员工记录',external:'外部资料转录',guardian_report:'家长自报转录'};
const types={followup:'长期随访',training:'训练服务',retail:'配镜服务'};
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function describe(event){
 const d=event.details;
 if(event.kind==='profile')return {title:`${d.source==='legacy'?'保存存量档案基线':d.version===1?'建立客户档案':'修订客户档案'} · V${d.version}`,text:d.name,reason:d.reason};
 if(event.kind==='cycle')return {title:`建立${types[d.type]}周期草稿`,text:d.goal};
 if(event.kind==='visit')return {title:d.action==='close'?'结束本次到店':'登记到店',text:d.purpose,reason:d.action==='close'?d.reason:`关联 ${d.cycle_count} 个独立周期`};
 if(event.kind==='document')return {title:`${d.version===1?'建立':'修订'}资料 · V${d.version}`,text:d.title,reason:d.reason};
 if(event.kind==='attachment')return {title:d.action==='revoke'?'撤销附件访问':'上传附件',text:d.filename,reason:d.reason};
 if(event.kind==='authorization')return {title:d.action==='guardian.authorize'?'授权家长查看':'撤销家长查看授权',text:d.relationship,reason:d.reason};
 return {title:d.action==='baseline'?'登记早期联系人':d.action==='contact.create'?'登记家庭联系人':d.active?(d.previous_active===0?'恢复家庭联系人':'修订家庭联系人'):(d.previous_active===1?'停用家庭联系人':'修订停用联系人'),text:d.name?`${d.name} · ${d.relationship} · V${d.revision}`:'初版明细未留存',reason:d.reason};
}
export function createTimelinePanel({api,getMe,getCustomer,getEpoch,toast}){
 let resetCurrent=()=>{};
 function locate(event){
  if(event.kind==='profile'){document.querySelector('.profile-actions button:last-child')?.click();return;}
  const key={cycle:'cycleId',visit:'visitId',contact:'contactId',document:'recordId',attachment:'attachmentId'}[event.kind];
  const target=key?[...document.querySelectorAll('#detail [data-'+key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())+']')].find(n=>n.dataset[key]===event.entity_id):document.querySelector('#detail .family-access-area');
  if(!target){toast('对应记录未显示在当前列表中，可刷新档案后再查看。');return;}target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.remove('timeline-focus');void target.offsetWidth;target.classList.add('timeline-focus');
 }
 async function render(target,id){
  resetCurrent();const epoch=getEpoch();let generation=0,cursor=null,loaded=false;const same=()=>getMe()&&getEpoch()===epoch&&getCustomer()===id&&target.isConnected;
  const summary=el('section',undefined,'customer-overview'),heading=el('div',undefined,'section-heading');heading.append(el('h2','客户总览'));
  const refresh=el('button','刷新总览');refresh.type='button';heading.append(refresh);summary.append(heading);
  const facts=el('div',undefined,'customer-facts'),recent=el('p','正在读取服务记录…','small muted');summary.append(facts,recent);
  const history=el('details',undefined,'customer-timeline'),toggle=el('summary');toggle.append(el('strong','客户历史时间轴'),el('span','查看已保存的服务与修改记录','small muted'));history.append(toggle);
  const form=el('form',undefined,'timeline-filters'),category=el('select');category.name='kind';category.setAttribute('aria-label','记录类别');category.append(new Option('全部记录','all'));for(const [key,name] of Object.entries(kinds))category.append(new Option(name,key));
  const from=el('input'),to=el('input');from.type=to.type='date';from.name='from';to.name='to';
  function label(text,input){const l=el('label',text);l.append(input);return l;}
  form.append(label('记录类别',category),label('开始日期（UTC）',from),label('结束日期（UTC）',to));const apply=el('button','筛选记录');apply.type='submit';form.append(apply);
  const error=el('p',undefined,'form-error');error.setAttribute('role','alert');const list=el('ol',undefined,'timeline-list');list.setAttribute('aria-label','客户历史记录');list.tabIndex=0;const more=el('button','加载更早记录');more.type='button';more.hidden=true;
  const status=el('p',undefined,'small muted');status.setAttribute('role','status');history.append(form,error,list,status,more);target.replaceChildren(summary,history);
  resetCurrent=()=>{generation++;cursor=null;loaded=false;target.replaceChildren();};
  async function overview(){
   try{const data=await api(`/customers/${id}/overview`);if(!same())return;facts.replaceChildren();for(const [name,value,color] of [['周期草稿',data.cycle_drafts,'mint'],['待结束到店',data.visits_registered,'sky'],['已结束到店',data.visits_closed,'sky'],['有效联系人',data.contacts_active,'coral'],['资料记录',data.documents,'violet'],['可访问附件',data.attachments_active,'violet']]){const fact=el('div',undefined,`customer-fact ${color}`);fact.append(el('strong',String(value)),el('small',name));facts.append(fact);}
    recent.textContent=data.last_visit?`最近登记到店：${new Date(data.last_visit.created_at).toLocaleString('zh-CN',{hour12:false})} · ${data.last_visit.status==='closed'?'本次已结束':'已登记，尚未结束'} · ${data.last_visit.purpose}`:'尚无到店记录。可从下方登记本次到店。';
   }catch(e){if(same())recent.textContent=e.message;}
  }
  async function load(reset){
   if(!same())return;const version=reset?++generation:generation;if(reset){cursor=null;list.replaceChildren();loaded=true;}const pageCursor=cursor;
   error.textContent='';apply.disabled=true;more.disabled=true;status.textContent='正在读取历史…';
   const params=new URLSearchParams({kind:category.value,limit:'20'});if(from.value)params.set('from',from.value);if(to.value)params.set('to',to.value);if(pageCursor)params.set('cursor',pageCursor);
   try{
    const data=await api(`/customers/${id}/timeline?${params}`);if(!same()||version!==generation)return;
    for(const event of data.items){const item=el('li',undefined,'timeline-event');item.dataset.eventId=event.event_id;item.dataset.kind=event.kind;const info=describe(event),head=el('div',undefined,'timeline-event-head');head.append(el('h3',info.title),el('span',kinds[event.kind],`badge ${{profile:'violet',cycle:'mint',visit:'sky',contact:'coral',document:'violet',attachment:'violet',authorization:'coral'}[event.kind]}`));item.append(head);
     const time=el('time',new Date(event.at).toLocaleString('zh-CN',{hour12:false}));time.dateTime=event.at;item.append(time,el('p',info.text||'未登记详细内容'));
     if(info.reason)item.append(el('p',info.reason,'small muted'));item.append(el('small',`${sources[event.details.source]||''}${event.details.source?' · ':''}${event.actor_name||'操作人未登记'}`,'muted'));
     const jump=el('button',event.kind==='profile'?'查看档案版本':'定位对应记录');jump.type='button';jump.onclick=()=>locate(event);item.append(jump);list.append(item);
    }
    cursor=data.next_cursor;more.hidden=!cursor;status.textContent=list.children.length?`已显示 ${list.children.length} 条记录${cursor?' · 可继续加载更早记录':' · 当前筛选已显示完毕'}`:'当前筛选下没有记录。';
   }catch(e){if(same()&&version===generation){error.textContent=e.message;status.textContent='读取失败，可以重新筛选或重试。';more.hidden=!pageCursor;}}
   finally{if(same()&&version===generation){apply.disabled=false;more.disabled=false;}}
  }
  form.onsubmit=e=>{e.preventDefault();load(true);};more.onclick=()=>load(false);history.ontoggle=()=>{if(history.open&&!loaded)load(true);};refresh.onclick=async()=>{refresh.disabled=true;await overview();if(history.open)await load(true);refresh.disabled=false;};await overview();
 }
 return {render,reset(){resetCurrent();resetCurrent=()=>{};}};
}
