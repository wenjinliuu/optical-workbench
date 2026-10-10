const $=s=>document.querySelector(s);
const roles={manager:'门店负责人',reception:'前台 / 销售',professional:'专业人员'};
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
export function createTaskLinksPanel({api,getMe,getCustomer,getEpoch,toast,onChanged}){
 let session=null,generation=0,pending=null;
 const context=s=>s&&getMe()&&getEpoch()===s.epoch&&getCustomer()===s.customer;
 const same=s=>session===s&&context(s);
 const node=(s,suffix)=>$(`#task-${s.kind}-${suffix}`);
 function reset(){generation++;session=null;pending=null;for(const kind of ['correction','followup']){const s={kind};node(s,'form').reset();for(const part of ['label','error'])node(s,part).textContent='';node(s,'current').replaceChildren();node(s,'submit').disabled=true;}$('#task-correction-history').replaceChildren();$('#task-followup-form select').replaceChildren();}
 for(const kind of ['correction','followup'])$(`#task-${kind}-dialog`).addEventListener('close',reset);
 function controls(s){if(!same(s))return;const c=s.data?.completion,allowed=c&&(s.kind==='correction'?(getMe().role==='manager'||c.completed_by===getMe().id):getMe().permissions.includes('tasks:assign'));node(s,'submit').disabled=Boolean(!allowed||s.loading||s.failed||s.saving);}
 function history(c){const box=$('#task-correction-history');box.replaceChildren();for(const r of c.corrections){const card=el('article',undefined,'version-card correction-history-card');card.append(el('h3',`说明更正 V${r.version}`),el('p',r.output_summary),el('p',r.reason),el('p',`${r.author_name} · ${new Date(r.created_at).toLocaleString('zh-CN',{hour12:false})}`,'small muted'));box.append(card);}const original=el('article',undefined,'version-card');original.append(el('h3','原完成产出'),el('p',c.output_summary),el('p',`${c.author_name} · ${new Date(c.completed_at).toLocaleString('zh-CN',{hour12:false})}`,'small muted'));box.append(original);if(c.corrections_truncated)box.append(el('p','展示最近100次更正；原记录继续保留。','small muted'));}
 async function read(s,keep=false){
  const form=node(s,'form'),values=keep?Object.fromEntries(new FormData(form)):null,current=++generation;s.loading=true;s.failed=false;controls(s);
  try{const [data,task,staff]=await Promise.all([api(`/tasks/${s.id}/completion`),api(`/tasks/${s.id}`),s.kind==='followup'?api('/tasks/assignees'):Promise.resolve(null)]);if(!same(s)||current!==generation)return;if(!data.completion)throw Error('任务尚未完成，请先核对原任务状态。');s.data=data;s.task=task.task;const c=data.completion;
   node(s,'label').textContent=`${s.title} · ${c.correction_version?'当前更正 V'+c.correction_version:'原完成产出'} · 条件 V${c.condition_version} / 依据 V${c.evidence_version}`;
   const box=node(s,'current');box.replaceChildren(el('h3',c.correction_version?'当前更正后的说明':'当前原产出说明'),el('p',c.effective_output_summary));
   if(s.kind==='correction'){form.elements.output_summary.value=values?.output_summary??c.effective_output_summary;form.elements.reason.value=values?.reason??'';history(c);if(getMe().role!=='manager'&&c.completed_by!==getMe().id)box.append(el('p','仅原提交人或门店负责人可以追加更正。','small muted'));}
   else{box.append(el('p',[s.task.visit_id?`到店：${s.task.visit_purpose}`:'',s.task.cycle_id?`固定需求 V${s.task.cycle_version}：${s.task.cycle_goal}`:''].filter(Boolean).join(' · ')||'客户档案任务','task-context'));const select=form.elements.assignee_id;select.replaceChildren(new Option('请选择接收人或候选岗位',''));for(const role of staff.roles)select.append(new Option(`候选岗位 · ${roles[role]}`,'role:'+role));for(const person of staff.items)select.append(new Option(`${person.display_name} · ${roles[person.role]}`,person.id));for(const name of ['title','instructions','reason'])form.elements[name].value=values?.[name]??'';if(values?.assignee_id&&!Array.from(select.options).some(o=>o.value===values.assignee_id))select.append(new Option('原选择暂不可用，请更换',values.assignee_id));select.value=values?.assignee_id??'';}
  }catch(err){if(same(s)){s.failed=true;node(s,'error').textContent=err.message;}}
  finally{if(same(s)&&current===generation){s.loading=false;controls(s);}}
 }
 async function open(kind,t){reset();const s={kind,id:t.id,title:t.title,epoch:getEpoch(),customer:getCustomer()};session=s;node(s,'label').textContent='正在读取完成产出…';node(s,'dialog').showModal();await read(s);}
 for(const kind of ['correction','followup']){
  $(`#task-${kind}-reload`).onclick=async()=>{const s=session;if(!s||s.kind!==kind)return;node(s,'error').textContent='';await read(s,true);if(same(s)&&!s.failed){pending=null;toast('已读取最新产出，保留填写内容；请核对版本后再提交');}};
  $(`#task-${kind}-form`).onsubmit=async e=>{
   e.preventDefault();const s=session;if(!s||s.kind!==kind||!s.data||s.loading||s.failed||s.saving)return;const form=e.currentTarget;if(!form.reportValidity())return;const c=s.data.completion,f=Object.fromEntries(new FormData(form)),input={expected_correction_version:c.correction_version,completion_sha256:c.snapshot_sha256,...(kind==='correction'?{output_summary:f.output_summary,reason:f.reason}:{title:f.title,instructions:f.instructions,reason:f.reason,...(f.assignee_id.startsWith('role:')?{assignee_id:null,candidate_role:f.assignee_id.slice(5)}:{assignee_id:f.assignee_id})})},path=kind==='correction'?`/tasks/${s.id}/completion/corrections`:`/tasks/${s.id}/followups`,fingerprint=JSON.stringify({path,input});if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};s.saving=true;controls(s);node(s,'error').textContent='';
   try{await api(path,{method:'POST',data:input,key:pending.key});if(!same(s))return;node(s,'dialog').close();await onChanged?.(s.id);if(context(s))toast(kind==='correction'?'已追加完成说明更正，原产出继续保留':'后续任务已分派，等待本人认领或接收');}
   catch(err){if(same(s))node(s,'error').textContent=err.message;}
   finally{if(same(s)){s.saving=false;controls(s);}}
  };
 }
 return {openCorrection:t=>open('correction',t),openFollowup:t=>open('followup',t),reset};
}
