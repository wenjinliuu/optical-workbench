const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const roleNames={manager:'门店负责人',reception:'接待岗位',professional:'专业岗位'};
const states={active:'进行中',blocked:'有待解决的阻塞',cancelled:'已取消',queued:'尚未认领',awaiting:'待接收',accepted:'已接收',pending:'待开始',running:'执行中',paused:'已暂停',completed:'已完成'};
export function createMyWorkFollowupsPanel({api,getMe,getEpoch,getAdopted,openSource,onDenied,onRefresh}){
 let session=null,generation=0,data=null;
 const dialog=el('dialog');dialog.id='my-work-followups-dialog';dialog.setAttribute('aria-labelledby','my-work-followups-title');
 const head=el('div',undefined,'dialog-head'),title=el('h2','原完成任务的后续引用');title.id='my-work-followups-title';
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};head.append(title,button('关闭',()=>dialog.close()));
 const label=el('p','','small muted'),count=el('p','','small muted'),error=el('p','','form-error'),items=el('div',undefined,'record-grid');items.id='my-work-followups-items';
 const more=button('读取后续同来源引用',()=>read(true));more.hidden=true;
 dialog.append(head,el('p','只读查看当时保存的后续引用及当前责任状态；每项接收、执行或解除阻塞仍在原任务分别办理。','notice'),label,
  button('重新读取后续任务',()=>read()),button('刷新本人完成记录',async()=>{dialog.close();await onRefresh();}),count,error,items,more);document.body.append(dialog);
 const live=s=>session===s&&dialog.open&&getAdopted()===s.adopted&&getMe()?.id===s.actor&&getEpoch()===s.epoch;
 function reset(){generation++;session=null;data=null;label.textContent='';count.textContent='';error.textContent='';items.replaceChildren();more.hidden=true;more.disabled=false;if(dialog.open)dialog.close();}
 dialog.addEventListener('close',()=>{if(!dialog.open)reset();});
 function params(s){return {expected_parent_source:s.row.task_source_proof.source_fingerprint};}
 async function authorized(s,z){await s.authorize();if(!live(s))throw Error('原后续入口已关闭，请重新展开');await api('/my-work/completed/'+s.row.id+'/followups/authorization?'+new URLSearchParams({...params(s),expected_source:z.source_token}));if(!live(s))throw Error('原后续入口已关闭，请重新展开');}
 async function failed(e,s,g){if(!live(s)||g!==generation)return;if([401,403,404].includes(e.status)){reset();await onDenied(e);}else error.textContent=e.message;}
 async function read(append=false){
  const s=session;if(!s||!live(s))return;const g=++generation,previous=data;more.disabled=true;error.textContent='';
  if(!append){data=null;items.replaceChildren();count.textContent='';more.hidden=true;}
  try{await s.authorize();if(!live(s)||g!==generation)return;const q={...params(s),limit:'30',offset:String(append?previous.next_offset:0)};if(append)q.expected_source=previous.source_token;
   const z=await api('/my-work/completed/'+s.row.id+'/followups?'+new URLSearchParams(q));if(!live(s)||g!==generation)return;
   await authorized(s,z);if(!live(s)||g!==generation)return;
   if(!append){data=z;label.textContent=z.parent.title+' · 原完成来源 '+z.parent_source_proof.source_fingerprint.slice(0,12)+' · 当前说明更正 V'+z.parent_source_proof.correction_version;}else data.next_offset=z.next_offset;
   for(const r of z.items){const a=el('article',undefined,'record-card');a.dataset.followupId=r.id;
    a.append(el('h3',r.title),el('p','原任务 '+r.id+' · 当前原修订 '+r.revision,'small muted'),
     el('p',r.status.split(' / ').map(k=>states[k]||k).join(' · '),'task-context'),
     el('p',r.assignee_id?'当前接收人 '+r.assignee_name+' · '+(roleNames[r.assignee_role]||r.assignee_role):'尚未指派 · 候选 '+(roleNames[r.candidate_role]||r.candidate_role),'small'),
     el('p','当时采用原完成 '+r.completion_sha256.slice(0,12)+' · 说明更正 V'+(r.source_correction_version??0)+' · 原保存时间 '+r.source_created_at+'（UTC）','small muted'),
     button('查看原后续任务',async()=>{const now=data;error.textContent='';try{await authorized(s,now);if(!live(s)||data!==now)return;await openSource(r,()=>authorized(s,now));}catch(e){await failed(e,s,generation);}}));items.append(a);}
   count.textContent='固定后续引用完整 '+data.total+' 项 · 已显示 '+items.querySelectorAll('[data-followup-id]').length+' 项';
   if(!data.total)items.append(el('p','原完成记录尚无保存的后续任务。','muted'));more.hidden=data.next_offset===null;
  }catch(e){await failed(e,s,g);}finally{if(live(s)&&g===generation)more.disabled=false;}
 }
 async function open(row,adopted,authorize){reset();session={row,adopted,authorize,actor:getMe()?.id,epoch:getEpoch()};dialog.showModal();await read();}
 return {open,reset};
}
