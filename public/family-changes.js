const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const actions={leave:'当次请假',move:'单次调课',promote:'原候补转正'};
export function createFamilyChangesPanel({api,getMe,getEpoch,openRequest,openBooking}) {
  const editor=el('dialog'),detail=el('dialog');editor.id='family-change-edit-dialog';detail.id='family-change-detail-dialog';document.body.append(editor,detail);
  let generation=0;const token=()=>({epoch:getEpoch(),id:getMe()?.id}),live=t=>t.epoch===getEpoch()&&t.id===getMe()?.id;
  const button=(s,f)=>{const b=el('button',s);b.type='button';b.onclick=f;return b;},close=d=>button('关闭',()=>d.close());
  for(const d of [editor,detail])d.addEventListener('close',()=>{generation++;d.replaceChildren();});
  function reset(){generation++;for(const d of [editor,detail]){d.close();d.replaceChildren();}}
  function field(f,name,title,max=2000){const label=el('label',title),i=el(max>300?'textarea':'input');i.name=name;i.required=true;i.maxLength=max;label.append(i);f.append(label);return i;}
  function renderPublication(card,p){if(!p.source_current||p.booking.status==='cancelled')return;
    if(p.booking.status==='booked')card.append(button('针对原预约提出当次请假',()=>edit(p,'leave')));
    card.append(button(p.booking.status==='waiting'?'选择开放时段提出候补调整或转正意向':'选择开放时段提出单次调课意向',()=>edit(p,'move')));
  }
  async function offers(id){let r=await api('/family-changes/publications/'+id+'/options?limit=100');const first=r,items=[...r.items];while(r.next_offset!==null){r=await api('/family-changes/publications/'+id+'/options?limit=100&offset='+r.next_offset+'&expected_source='+first.source_token);items.push(...r.items);}await api('/family-changes/publications/'+id+'/options?limit=1&expected_source='+first.source_token);return items;}
  async function edit(p,kind){const t=token(),g=++generation;editor.replaceChildren(close(editor),el('p','读取原预约与本人开放时段…'));editor.showModal();
    try {
      const choices=kind==='move'?await offers(p.id):[];if(!live(t)||g!==generation||!editor.open)return;
      editor.replaceChildren(close(editor),el('h2',kind==='leave'?'本人当次请假意向':'本人原预约调整意向'),el('p','原安排：'+p.booking.number+' · '+p.booking.starts_at+' 至 '+p.booking.ends_at),el('p','提交意向后原预约保持，门店核对后再办理实际变更。','notice'));
      const f=el('form');f.id='family-change-request-form';let target=null,ctx=null;
      if(kind==='move'){const label=el('label','明确选择已向本人开放的目标时段');target=el('select');target.name='offer_id';target.required=true;target.append(new Option('请明确选择目标时段',''));for(const o of choices)target.append(new Option(o.starts_at+' 至 '+o.ends_at+' · '+o.public_note,o.id));label.append(target);f.append(label);}
      field(f,'title','本人申请标题',160);field(f,'request_note','本人意向说明');const error=el('p','','form-error'),notice=el('p','','notice'),save=el('button','提交本人意向','primary');save.type='submit';save.disabled=true;
      const renew=async()=>{ctx=null;save.disabled=true;try{const path='/family-changes/publications/'+p.id+'/context?kind='+kind+(target?.value?'&offer_id='+encodeURIComponent(target.value):''),r=await api(path);await api(path+'&expected_source='+r.source_token);if(!live(t)||g!==generation||!editor.open)return;ctx=r;error.textContent=r.problem?.message||'';notice.textContent='原安排与选定目标已重新核对；填写保留。';save.disabled=!!r.problem;}catch(e){if(live(t)&&g===generation){error.textContent=e.message;if([401,403,404].includes(e.status))editor.replaceChildren(close(editor),el('p',e.message,'form-error'));}}};
      if(target)target.onchange=renew;f.append(error,notice,button('重新核对原安排与选定目标',renew),save);editor.append(f);if(kind==='leave')await renew();
      f.onsubmit=async e=>{e.preventDefault();if(!ctx||ctx.problem)return;save.disabled=true;try{const r=await api('/family-changes/publications/'+p.id+'/request',{method:'POST',key:crypto.randomUUID(),data:{expected_source:ctx.source_token,kind,offer_id:target?.value||null,title:f.elements.title.value,request_note:f.elements.request_note.value}});if(!live(t)||g!==generation||!editor.open)return;editor.close();openRequest(r.record.request_id);}catch(ex){if(live(t)&&g===generation){error.textContent=ex.message;ctx=null;}}finally{if(ctx&&!ctx.problem)save.disabled=false;}};
    }catch(e){if(live(t)&&g===generation)editor.replaceChildren(close(editor),el('p',e.message,'form-error'));}
  }
  async function renderRequest(target,id,guard,onDenied){const t=token();try{
    const r=await api('/family-changes/requests/'+id);if(!r.record)return;if(getMe()?.role==='guardian')await api('/family-changes/requests/'+id+'/authorization?expected_source='+r.adoption_source);
    if(!live(t)||!guard()||!target.isConnected)return;const c=r.record,section=el('section');section.dataset.familyChangeId=c.id;section.append(el('h3','针对原预约的本人变更意向'),el('p',c.kind==='leave'?'当次请假意向':'原预约调整意向'));
    const b=c.original||c.booking;section.append(el('p','固定旧安排：'+b.starts_at+' 至 '+b.ends_at+' · 原修订 '+b.revision));if(c.target)section.append(el('p','固定新期望：'+c.target.starts_at+' 至 '+c.target.ends_at));
    if(c.execution){section.append(el('p','门店已实际办理：'+actions[c.execution.action]+' · '+c.execution.created_at));if(getMe()?.role==='guardian')section.append(el('p',c.execution.publication?.public_note||'结果公开当前不可访问，请与门店核对。'));else section.append(button('打开实际原预约',()=>openBooking(c.booking_id)));}
    else if(getMe()?.role!=='guardian')section.append(button('核对并办理实际原预约变更',()=>execute(id)));
    else section.append(el('p','原预约未因意向变更，等待门店核对。','notice'));target.append(section);
  }catch(e){if(live(t)&&guard()&&target.isConnected){target.append(el('p',e.message,'form-error'));if(getMe()?.role==='guardian')onDenied?.(e.message);}}}
  async function execute(id){const t=token(),g=++generation;detail.replaceChildren(close(detail),el('p','核对原预约、本人授权及目标容量…'));detail.showModal();try{
    let r=await api('/family-changes/requests/'+id);if(!live(t)||g!==generation||!detail.open)return;
    detail.replaceChildren(close(detail),el('h2','实际原预约变更与明确公开'),el('p','办理只修改这个客户的原预约；请核对当次安排、实际容量及本人意向。','notice'));
    const f=el('form');f.id='family-change-execute-form';const label=el('label','明确实际办理动作'),select=el('select');select.name='action';select.required=true;select.append(new Option('请明确选择实际动作',''));for(const [a,s] of Object.entries(actions))select.append(new Option(s,a));label.append(select);f.append(label);
    field(f,'note','原排期安排说明',1000);field(f,'reason','内部办理依据（不公开）',300);field(f,'public_note','明确向本人公开的实际结果');const error=el('p','','form-error'),save=el('button','办理实际变更并公开本次结果','primary');save.type='submit';
    const update=()=>{const ctx=r.contexts[select.value];error.textContent=ctx?.problem?.message||'';save.disabled=!ctx||!!ctx.problem;};select.onchange=update;update();
    f.append(error,button('重新核对原来源、容量与冲突',async()=>{try{const fresh=await api('/family-changes/requests/'+id);if(!live(t)||g!==generation||!detail.open)return;r=fresh;update();}catch(e){if(live(t)&&g===generation)error.textContent=e.message;}}),save);detail.append(f);
    f.onsubmit=async e=>{e.preventDefault();const ctx=r.contexts[select.value];if(!ctx||ctx.problem)return;save.disabled=true;try{await api('/family-changes/requests/'+id+'/execute',{method:'POST',key:crypto.randomUUID(),data:{expected_source:ctx.source_token,action:select.value,note:f.elements.note.value,reason:f.elements.reason.value,public_note:f.elements.public_note.value}});if(!live(t)||g!==generation||!detail.open)return;detail.close();openRequest(id);}catch(ex){if(live(t)&&g===generation)error.textContent=ex.message;}finally{save.disabled=false;}};
  }catch(e){if(live(t)&&g===generation)detail.replaceChildren(close(detail),el('p',e.message,'form-error'));}}
  return {reset,renderPublication,renderRequest};
}
