const $=s=>document.querySelector(s);
const lanes={queued:'待认领',awaiting:'待接收',pending:'待开始',running:'执行中',paused:'已暂停',blocked:'已阻塞',cancelled:'已取消',completed:'已完成'};
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}

export function createTaskChainPanel({api,getMe,getCustomer,getEpoch,card,openCustomer}){
 let session=null,generation=0,data=null,loaded=[],cursor=null,loading=false;
 const dialog=$('#task-chain-dialog');
 const same=s=>session===s&&getMe()&&getEpoch()===s.epoch&&getCustomer()===s.customer;
 function reset(){generation++;session=null;data=null;loaded=[];cursor=null;loading=false;$('#task-chain-form').reset();for(const id of ['label','error','count'])$('#task-chain-'+id).textContent='';for(const id of ['summary','focus','items'])$('#task-chain-'+id).replaceChildren();$('#task-chain-more').disabled=true;$('#task-chain-more').hidden=true;}
 dialog.addEventListener('close',reset);
 function controls(){for(const n of $('#task-chain-form').elements)n.disabled=loading;$('#task-chain-refresh').disabled=loading;$('#task-chain-more').disabled=loading;}
 function node(item,focus=false){
  const box=el('section',undefined,'task-chain-node'+(focus?' task-chain-selected':''));box.dataset.chainTask=item.task.id;box.style.setProperty('--chain-depth',Math.min(item.depth,3));
  const line=el('div',undefined,'task-chain-location');line.append(el('span',item.depth===0?'起始任务':`第 ${item.depth+1} 层 · ${lanes[item.lane]}`,'badge violet'));
  if(item.task.origin){const b=el('button','定位上游任务');b.onclick=()=>select(item.task.origin.parent_task_id);line.append(b);}
  if(!focus){const b=el('button',item.task.id===data.selected.task.id?'当前定位任务':'定位此任务');b.onclick=()=>select(item.task.id);line.append(b);}
  box.append(line,card(item.task,true));return box;
 }
 function render(){
  $('#task-chain-label').textContent=`${data.root_task.customer_name} · 起始：${data.root_task.title} · ${new Date(data.read_at).toLocaleString('zh-CN',{hour12:false})} 读取`;
  $('#task-chain-count').textContent=`整条链 ${data.summary.total} 个任务 / ${data.summary.links} 条来源关联 · 当前筛选 ${data.matching_total} 个 · 已读取 ${loaded.length} 个`;
  const stats=$('#task-chain-summary');stats.replaceChildren();for(const [label,n,tone] of [['已完成',data.summary.completed,'mint'],['未完成',data.summary.open,'sky'],['已阻塞',data.summary.lanes.blocked,'coral'],['已取消',data.summary.lanes.cancelled,'neutral']]){const s=el('article',undefined,'demo-stat '+tone);s.append(el('span',label),el('strong',String(n)),el('small','整条链 · 完整数量'));stats.append(s);}
  $('#task-chain-focus').replaceChildren(el('h3','当前定位任务'),node(data.selected,true));
  const box=$('#task-chain-items');box.replaceChildren();for(const item of loaded)box.append(node(item));if(!loaded.length)box.append(el('p','当前筛选暂无任务；上方保留定位任务，可调整筛选查看。','empty'));
  $('#task-chain-more').hidden=!cursor;controls();
 }
 async function read(append=false){
  const s=session;if(!s)return;const current=++generation;loading=true;controls();$('#task-chain-error').textContent='';
  if(!append){data=null;loaded=[];cursor=null;$('#task-chain-items').replaceChildren(el('p','正在读取关联任务…','muted'));$('#task-chain-summary').replaceChildren();$('#task-chain-focus').replaceChildren();$('#task-chain-count').textContent='';$('#task-chain-more').hidden=true;}
  const q=new URLSearchParams({role:$('#task-chain-role').value,lane:$('#task-chain-lane').value,limit:'30'});if(append&&cursor)q.set('cursor',cursor);
  try{const result=await api(`/tasks/${s.id}/chain?${q}`);if(!same(s)||generation!==current)return;data=result;const seen=new Set(loaded.map(x=>x.task.id));loaded.push(...result.items.filter(x=>!seen.has(x.task.id)));cursor=result.next_cursor;loading=false;render();}
  catch(err){if(same(s)&&generation===current){$('#task-chain-error').textContent=err.message;if(!append){$('#task-chain-items').replaceChildren();$('#task-chain-label').textContent='读取失败，请重新读取任务链。';}}}
  finally{if(same(s)&&generation===current){loading=false;controls();}}
 }
 async function select(id){if(!session)return;session={...session,id};await read();}
 async function open(t){reset();session={id:t.id,epoch:getEpoch(),customer:getCustomer()};if(!dialog.open)dialog.showModal();await read();}
 $('#task-chain-form').onsubmit=e=>{e.preventDefault();read();};$('#task-chain-refresh').onclick=()=>read();$('#task-chain-more').onclick=()=>{if(!loading&&cursor)read(true);};
 $('#task-chain-customer').onclick=()=>{if(!data||!session||!same(session))return;const id=data.root_task.customer_id;dialog.close();openCustomer(id);};
 return {open,reset,refresh:()=>session&&dialog.open?read():Promise.resolve()};
}
