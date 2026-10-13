const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const labels={task:'通用岗位任务',processing:'加工原单行',aftercare:'售后案例',training_plan:'个人训练计划',training_session:'当次课程',longitudinal:'长期档案',review:'复查安排',contact:'联系跟进',appointment:'客户预约',referral_professional:'转介专业责任',referral_contact:'转介联系责任',external_record:'外院资料复核',specialty:'接触镜专项责任',screening_project:'团体活动准备责任'};

const statuses={open:'待跟进',waiting:'等待后续',handoff:'待接管',active:'进行中',blocked:'有待解决的阻塞',cancelled:'已取消',queued:'尚未认领',awaiting:'待接收',accepted:'已接收',pending:'待处理',running:'执行中',paused:'已暂停',planned:'已安排',scheduled:'已安排',partial:'已有接收记录',draft:'草稿',confirmed:'已确认',ready:'待开始',recorded:'已记录',reviewed:'已核对',completed:'已完成',closed:'已结案',ended:'已结束',stopped:'已停用'};
const stateLabel=r=>r.kind==='screening_project'?'原准备说明已保存 · '+({unknown:'原授权说明未知',refused:'原授权说明为拒绝',recorded:'有原授权说明，正式核验待完成'}[r.status.split(' / ')[1]]||'原说明状态待核对'):r.status.split(' / ').map(s=>r.kind==='task'&&s==='pending'?'待开始':statuses[s]||s).join(' · ');

export function createMyWorkPanel({api,getMe,getEpoch,openSource,onScopeChanged}) {
  let generation=0,presentationGeneration=0,data=null,appliedFilter=null,adoptedDisplay='cards';
  const view=el('section');view.id='my-work-view';view.hidden=true;document.querySelector('#main').append(view);
  const button=(text,fn,submit=false)=>{const b=el('button',text);b.type=submit?'submit':'button';b.onclick=fn;return b;};
  const head=el('div',undefined,'page-head'),controls=el('div',undefined,'my-work-controls'),displayLabel=el('label','显示方式'),display=el('select');
  display.id='my-work-display';display.disabled=true;display.append(new Option('卡片','cards'),new Option('紧凑列表','compact'));displayLabel.append(display);controls.append(displayLabel,button('明确刷新当前筛选',()=>load()));head.append(el('h1','我的业务责任'),controls);
  const form=el('form',undefined,'retail-filters');form.id='my-work-filter';
  function select(name,label,options){const l=el('label',label),s=el('select');s.name=name;for(const[k,v]of options)s.append(new Option(v,k));l.append(s);form.append(l);return s;}
  const scope=select('scope','责任范围',[['mine','已指定本人'],['candidates','本岗位候选，尚未认领'],['completed','本人已办理完成的原任务']]);
  const kind=select('kind','业务类型',[['all','全部业务'],...Object.entries(labels)]);
  const taskState=select('task_state','原通用任务状态',[['all','全部原任务状态'],['blocked','生命周期阻塞'],['awaiting','等待本人接收'],['paused','执行已暂停'],['running','执行中']]);
  const l=el('label','原记录、客户或机构'),q=el('input');q.name='q';q.maxLength=120;l.append(q);form.append(l,button('查询',()=>{},true));
  const sort=select('sort','原责任顺序',[['updated','原记录最近更新'],['date_asc','原日期从早到晚（未知在后）'],['date_desc','原日期从晚到早（未知在后）']]);
  const dateMode=select('date_mode','原业务日期',[['all','全部日期状态'],['recorded','已记录日期'],['not_recorded','日期未知']]);
  function dateInput(name,label){const l=el('label',label),i=el('input');i.type='date';i.name=name;l.append(i);form.append(l);return i;}
  const dateFrom=dateInput('date_from','原日期从（含当日）'),dateTo=dateInput('date_to','原日期至（含当日）');
  form.append(form.querySelector('button[type=submit]'),button('重置筛选并查询',()=>{form.reset();return load(false,true);}));
  const summary=el('div',undefined,'demo-summary'),count=el('p','','small muted'),error=el('p','','form-error'),rows=el('div',undefined,'record-grid'),more=button('读取后续同来源责任',()=>load(true));
  summary.id='my-work-summary';count.id='my-work-count';error.id='my-work-error';rows.id='my-work-items';more.hidden=true;
  const applied=el('p','','notice'),pending=el('p','','small muted');applied.id='my-work-applied-filter';pending.id='my-work-pending-filter';
  view.append(head,el('p','读取已保存的本人业务责任，岗位候选与本人实际办理完成的原任务分别单列；曾指派、打开或接收不算完成。认领、接收、开始和专业确认仍在原业务分别办理。当前责任按原业务日期，已办理记录按原完成时间；含时间的原记录按 UTC 日期筛选。','notice'),form,applied,pending,summary,count,error,rows,more);
  form.onsubmit=e=>{e.preventDefault();load(false,true);};
  const filter=()=>({scope:scope.value,kind:kind.value,q:q.value,date_mode:dateMode.value,date_from:dateFrom.value,date_to:dateTo.value,sort:sort.value,task_state:taskState.value});
  const token=()=>({id:getMe()?.id,epoch:getEpoch()}),live=t=>t.id===getMe()?.id&&t.epoch===getEpoch();
  function filterSummary(f){
    const scopeLabel=f.scope==='candidates'?'本岗位候选，尚未认领':f.scope==='completed'?'本人已办理完成的原任务':'已指定本人';
    const dates={all:'全部日期状态',recorded:'已记录日期',not_recorded:'日期未知'}[f.date_mode];
    const interval=f.date_from&&f.date_to?f.date_from+' 至 '+f.date_to+'（含首尾）':f.date_from?f.date_from+' 起（含当日）':f.date_to?'截至 '+f.date_to+'（含当日）':'日期区间不限';
    const order={updated:'原记录最近更新',date_asc:'原日期从早到晚（未知在后）',date_desc:'原日期从晚到早（未知在后）'}[f.sort];
    const taskStateLabel={all:'全部原任务状态',blocked:'生命周期阻塞',awaiting:'等待本人接收',paused:'执行已暂停',running:'执行中'}[f.task_state||'all'];
    return [scopeLabel,f.kind==='all'?'全部业务':labels[f.kind],...(f.kind==='task'?[taskStateLabel]:[]),f.q?'文字“'+f.q+'”':'不限定文字',dates,interval,order].join(' · ');
  }
  function updateApplied(){taskState.disabled=scope.value==='completed'||kind.value!=='task'&&taskState.value==='all';if(!data){applied.textContent='';pending.textContent='';return;}applied.textContent='当前已应用：'+filterSummary(data.filter);const changed=Object.entries(filter()).some(([k,v])=>v!==data.filter[k])||Array.from(form.elements).some(i=>i.validity?.badInput);pending.textContent=changed?'筛选填写已变更；当前列表仍按上方条件显示，点击查询应用。':'';}
  form.addEventListener('input',updateApplied);form.addEventListener('change',updateApplied);
  function clear(){presentationGeneration++;display.disabled=true;display.value=adoptedDisplay;data=null;rows.replaceChildren();summary.replaceChildren();count.textContent='';more.hidden=true;updateApplied();}
  async function denied(e){clear();error.textContent=e.message;await onScopeChanged?.(e);}
  async function proof(s){await api('/my-work/authorization?'+new URLSearchParams({...s.filter,expected_source:s.source_token}));}
  display.onchange=async()=>{
    const t=token(),s=data,g=++presentationGeneration,requested=display.value;if(!s){display.value=adoptedDisplay;return;}
    display.disabled=true;try{await proof(s);if(!live(t)||data!==s||g!==presentationGeneration)return;adoptedDisplay=requested;rows.classList.toggle('compact',requested==='compact');error.textContent='';}
    catch(e){if(live(t)&&data===s&&g===presentationGeneration){display.value=adoptedDisplay;if([401,403,404].includes(e.status))await denied(e);else error.textContent=e.message;}}
    finally{if(live(t)&&data===s&&g===presentationGeneration)display.disabled=false;}
  };
  async function load(append=false,applyDraft=false,adoptFilter=null){
    if(!getMe()?.permissions.includes('tasks:read'))return;
    const t=token(),g=++generation,f=append?data?.filter:(adoptFilter||(applyDraft||!appliedFilter?filter():appliedFilter));if(!f)return;
    const previous=data;error.textContent='';more.disabled=true;
    if(f.scope==='completed'&&(!['all','task'].includes(f.kind)||f.task_state!=='all')){error.textContent='已办理记录仅支持全部或通用岗位任务，且不使用当前任务状态；请明确退出不适用筛选后查询。';more.disabled=false;return;}
    if(f.task_state!=='all'&&f.kind!=='task'){error.textContent='任务状态只适用于通用岗位任务；请改回通用岗位任务，或明确选择“全部原任务状态”后查询。';more.disabled=false;return;}
    if(!append)clear();
    try{
      const params=new URLSearchParams({...f,limit:'30',offset:String(append?previous.next_offset:0)});
      if(append)params.set('expected_source',previous.source_token);
      const z=await api('/my-work?'+params);if(!live(t)||g!==generation)return;
      await proof(z);if(!live(t)||g!==generation)return;
      if(!append){data=z;appliedFilter=z.filter;renderSummary(z);}else{data.next_offset=z.next_offset;}
      for(const r of z.items)appendRow(r,data,t);
      count.textContent='当前筛选完整 '+data.total+' 项；已显示 '+rows.querySelectorAll('[data-my-work-key]').length+' 项。';
      if(!data.total)rows.append(el('p','当前筛选没有记录。','muted'));
      more.hidden=data.next_offset===null;display.disabled=false;updateApplied();
    }catch(e){if(live(t)&&g===generation){if([401,403,404].includes(e.status))await denied(e);else error.textContent=e.message;}}
    finally{if(live(t)&&g===generation)more.disabled=false;}
  }
  async function applyKind(s,selected){
    const t=token(),g=++generation;error.textContent='';
    try{await proof(s);if(!live(t)||data!==s||g!==generation)return;
      const nextTaskState=selected==='task'?(s.filter.task_state||'all'):'all';
      if(kind.value===s.filter.kind)kind.value=selected;
      if(taskState.value===(s.filter.task_state||'all'))taskState.value=nextTaskState;
      await load(false,false,{...s.filter,kind:selected,task_state:nextTaskState});
    }catch(e){if(live(t)&&data===s&&g===generation){if([401,403,404].includes(e.status))await denied(e);else error.textContent=e.message;}}
  }
  function renderSummary(z){
    summary.replaceChildren();
    for(const [label,n,tone]of [['本人全量责任（筛选前）',z.total_responsibilities,'sky'],['本岗位未认领候选',z.candidate_task_count,'mint'],['本人实际办理完成原任务',z.completed_task_count,'violet']]){
      const a=el('article',undefined,'demo-stat '+tone);a.append(el('span',label),el('strong',String(n)));summary.append(a);
    }
    const p=el('p','本人全量分类（筛选前）：'+(Object.entries(z.counts).filter(([,n])=>n).map(([k,n])=>labels[k]+' '+n).join(' · ')||'暂无本人责任'),'small muted');
    const range=z.filter.scope==='candidates'?'本岗位候选':z.filter.scope==='completed'?'本人已办理完成':'已指定本人';
    const matched=el('p','当前已应用筛选完整分类（'+range+'）：'+(Object.entries(z.matched_counts).filter(([,n])=>n).map(([k,n])=>labels[k]+' '+n).join(' · ')||'无匹配责任'),'small');matched.id='my-work-matched-counts';summary.append(p,matched,el('p',(z.filter.scope==='completed'?'本人已办理范围：原完成时间已记录 ':'本责任范围：原日期已记录 ')+z.date_counts.recorded+' 项 · 日期未知 '+z.date_counts.not_recorded+' 项（筛选前完整数量）','small muted'));
    const entries=el('div',undefined,'my-work-kind-entries');entries.id='my-work-kind-entries';entries.setAttribute('role','group');entries.setAttribute('aria-label','按当前完整匹配分类选择业务类型');
    for(const [k,n]of [['all',null],...Object.entries(z.matched_counts).filter(([,n])=>n)]){
      const exits=(z.filter.task_state||'all')!=='all'&&k!=='task';
      const b=button(k==='all'?(exits?'查看全部业务并退出任务状态':'查看全部业务'):labels[k]+' '+n+(exits?'（并退出任务状态）':''),()=>applyKind(z,k));b.setAttribute('aria-pressed',String(z.filter.kind===k));entries.append(b);
    }
    summary.append(entries);
  }
  const dateLabels={processing:'加工约定日期',aftercare:'售后安排日期',review:'复查安排日期',contact:'联系约定时间',appointment:'预约开始时间',referral_contact:'转介联系约定时间'};
  function dateLabel(r){if(r.completed_task)return '原完成时间 '+r.due+'（UTC）';const label=dateLabels[r.kind]||'办理日期';return r.due===null?'原'+label+'未记录':'原'+label+' '+r.due+(r.due_source==='due_at'||r.due_source==='starts_at'?'（UTC）':'');}
  function appendRow(r,s,t){
    const a=el('article',undefined,'record-card');a.dataset.myWorkKey=r.key;
    a.append(el('span',labels[r.kind],'badge sky'),el('h2',r.title),el('p',(r.customer_id===null?'机构 '+r.institution:r.customer_name)+' · 原记录 '+r.id+(r.position?' / 原行 '+r.position:''),'small muted'),
      el('p','原修订 '+r.revision+(r.version===null?'':' · 固定版本 '+r.version)+' · 当前状态 '+stateLabel(r)+(r.completed_task?' · 固定条件 V'+r.completion_condition_version+' / 依据 V'+r.completion_evidence_version+' · 说明更正 V'+r.completion_correction_version+' · 后续任务 '+r.completion_followup_count:'')+(r.kind==='task'&&Number.isSafeInteger(r.task_blocker_revision)?' · 原阻塞原因（原修订 '+r.task_blocker_revision+'）：'+(r.task_blocker_reason??'未记录'):''),'task-context'),
      el('p',dateLabel(r),'small'),
      el('p',s.filter.scope==='candidates'?'本岗位候选，尚未指定本人；打开不自动认领或接收。':s.filter.scope==='completed'?'本人是原完成实际操作人；这里只读列出，整项业务完成与专业正文仍按原记录判断。':'已指定本人；打开不自动开始或完成。','muted'),
      button(s.filter.scope==='completed'?'查看原任务与完成记录':'打开原业务办理',async()=>{
        error.textContent='';try{await proof(s);if(!live(t)||data!==s)return;await openSource(r,()=>proof(s));}
        catch(e){if(live(t)&&data===s){if([401,403,404].includes(e.status))await denied(e);else error.textContent=e.message;}}
      }));rows.append(a);
  }
  updateApplied();
  return {load,reset(){generation++;appliedFilter=null;adoptedDisplay='cards';clear();rows.classList.remove('compact');form.reset();updateApplied();error.textContent='';more.disabled=false;}};
}

