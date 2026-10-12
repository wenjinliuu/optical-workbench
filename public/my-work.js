const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const labels={task:'通用岗位任务',processing:'加工原单行',aftercare:'售后案例',training_plan:'个人训练计划',training_session:'当次课程',longitudinal:'长期档案',review:'复查安排',contact:'联系跟进',appointment:'客户预约',referral_professional:'转介专业责任',referral_contact:'转介联系责任',external_record:'外院资料复核',specialty:'接触镜专项责任'};

const statuses={active:'进行中',blocked:'有待解决的阻塞',cancelled:'已取消',queued:'尚未认领',awaiting:'待接收',accepted:'已接收',pending:'待处理',running:'执行中',paused:'已暂停',planned:'已安排',scheduled:'已安排',partial:'已有接收记录',draft:'草稿',confirmed:'已确认',ready:'待开始',recorded:'已记录',reviewed:'已核对',completed:'已完成',closed:'已结案',ended:'已结束',stopped:'已停用'};
const stateLabel=r=>r.status.split(' / ').map(s=>r.kind==='task'&&s==='pending'?'待开始':statuses[s]||s).join(' · ');

export function createMyWorkPanel({api,getMe,getEpoch,openSource,onScopeChanged}) {
  let generation=0,data=null;
  const view=el('section');view.id='my-work-view';view.hidden=true;document.querySelector('#main').append(view);
  const button=(text,fn,submit=false)=>{const b=el('button',text);b.type=submit?'submit':'button';b.onclick=fn;return b;};
  const head=el('div',undefined,'page-head');head.append(el('h1','我的业务责任'),button('明确刷新当前筛选',()=>load()));
  const form=el('form',undefined,'retail-filters');form.id='my-work-filter';
  function select(name,label,options){const l=el('label',label),s=el('select');s.name=name;for(const[k,v]of options)s.append(new Option(v,k));l.append(s);form.append(l);return s;}
  const scope=select('scope','责任范围',[['mine','已指定本人'],['candidates','本岗位候选，尚未认领']]);
  const kind=select('kind','业务类型',[['all','全部业务'],...Object.entries(labels)]);
  const l=el('label','原记录或客户'),q=el('input');q.name='q';q.maxLength=120;l.append(q);form.append(l,button('查询',()=>{},true));
  const summary=el('div',undefined,'demo-summary'),count=el('p','','small muted'),error=el('p','','form-error'),rows=el('div',undefined,'record-grid'),more=button('读取后续同来源责任',()=>load(true));
  summary.id='my-work-summary';count.id='my-work-count';error.id='my-work-error';rows.id='my-work-items';more.hidden=true;
  view.append(head,el('p','读取已保存的本人业务责任，岗位候选单列；认领、接收、开始和专业确认仍在原业务分别办理。未记录日期保持未知，不补默认时限。','notice'),form,summary,count,error,rows,more);
  form.onsubmit=e=>{e.preventDefault();load();};
  const filter=()=>({scope:scope.value,kind:kind.value,q:q.value});
  const token=()=>({id:getMe()?.id,epoch:getEpoch()}),live=t=>t.id===getMe()?.id&&t.epoch===getEpoch();
  function clear(){data=null;rows.replaceChildren();summary.replaceChildren();count.textContent='';more.hidden=true;}
  async function denied(e){clear();error.textContent=e.message;await onScopeChanged?.(e);}
  async function proof(s){await api('/my-work/authorization?'+new URLSearchParams({...s.filter,expected_source:s.source_token}));}
  async function load(append=false){
    if(!getMe()?.permissions.includes('tasks:read'))return;
    const t=token(),g=++generation,f=append?data?.filter:filter();if(!f)return;
    const previous=data;error.textContent='';more.disabled=true;if(!append)clear();
    try{
      const params=new URLSearchParams({...f,limit:'30',offset:String(append?previous.next_offset:0)});
      if(append)params.set('expected_source',previous.source_token);
      const z=await api('/my-work?'+params);if(!live(t)||g!==generation)return;
      await proof(z);if(!live(t)||g!==generation)return;
      if(!append){data=z;renderSummary(z);}else{data.next_offset=z.next_offset;}
      for(const r of z.items)appendRow(r,data,t);
      count.textContent='当前筛选完整 '+data.total+' 项；已显示 '+rows.querySelectorAll('[data-my-work-key]').length+' 项。';
      if(!data.total)rows.append(el('p','当前筛选没有记录。','muted'));
      more.hidden=data.next_offset===null;
    }catch(e){if(live(t)&&g===generation){if([401,403,404].includes(e.status))await denied(e);else error.textContent=e.message;}}
    finally{if(live(t)&&g===generation)more.disabled=false;}
  }
  function renderSummary(z){
    summary.replaceChildren();
    for(const [label,n,tone]of [['本人当前责任',z.total_responsibilities,'sky'],['本岗位未认领候选',z.candidate_task_count,'mint']]){
      const a=el('article',undefined,'demo-stat '+tone);a.append(el('span',label),el('strong',String(n)));summary.append(a);
    }
    const p=el('p',Object.entries(z.counts).filter(([,n])=>n).map(([k,n])=>labels[k]+' '+n).join(' · ')||'暂无本人责任','small muted');summary.append(p);
  }
  function appendRow(r,s,t){
    const a=el('article',undefined,'record-card');a.dataset.myWorkKey=r.key;
    a.append(el('span',labels[r.kind],'badge sky'),el('h2',r.title),el('p',r.customer_name+' · 原记录 '+r.id+(r.position?' / 原行 '+r.position:''),'small muted'),
      el('p','原修订 '+r.revision+(r.version===null?'':' · 固定版本 '+r.version)+' · 当前状态 '+stateLabel(r),'task-context'),
      el('p',r.due===null?'原办理日期未记录':'原明确日期 '+r.due,'small'),
      el('p',s.filter.scope==='candidates'?'本岗位候选，尚未指定本人；打开不自动认领或接收。':'已指定本人；打开不自动开始或完成。','muted'),
      button('打开原业务办理',async()=>{
        error.textContent='';try{await proof(s);if(!live(t)||data!==s)return;await openSource(r,()=>proof(s));}
        catch(e){if(live(t)&&data===s){if([401,403,404].includes(e.status))await denied(e);else error.textContent=e.message;}}
      }));rows.append(a);
  }
  return {load,reset(){generation++;clear();form.reset();error.textContent='';more.disabled=false;}};
}
