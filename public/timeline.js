const kinds={reserved_custody:'原预留原件核对',specialty_continuity:"专项更换专业来源",specialty_archive:"专项来源归档",specialty_review:"专项复查与异常",specialty_care:"护理指导",specialty_order:"专项订片",specialty_lot:"专项批号",specialty_case:"接触镜专项",specialty_consent:"专项明确同意",external_record:"外院原资料",referral:"转介安排",referral_contact:"转介联系关联",contact_case:"客户联系",contact_attempt:"实际联系",contact_receipt:"实际回执",customer_appointment:"客户预约",longitudinal:"长期档案",observation:"实际检查记录",review_plan:"复查安排",practice:"家庭练习",reassessment:"阶段复评",scheduling:'训练预约',entitlement:'套餐与权益',training_plan:'训练计划',training_session:'当次课程',parameter:'配镜参数与变更核对',refund:'退款记录',aftercare_disposition:'旧件处置',aftercare_replacement:'售后新商品',dispatch:'批次出库',aftercare_work:'维修与归还',aftercare:'原单售后',fulfillment:'质检与交付',processing:'订货与加工',payment:'收款登记',inventory:'订单库存',retail:'配镜订单',profile:'档案',cycle:'周期',visit:'到店',contact:'联系人',document:'资料',attachment:'附件',authorization:'查看授权',task:'任务交接'};
const sources={initial:'初始建档',legacy:'升级基线 · 此前修改未追溯',employee:'员工记录',external:'外部资料转录',guardian_report:'家长自报转录'};
const types={followup:'长期随访',training:'训练服务',retail:'配镜服务'};
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function describe(event){
 const d=event.details;
 if(["specialty_continuity","specialty_archive","specialty_review","specialty_care","specialty_order","specialty_lot","specialty_case","specialty_consent"].includes(event.kind))return {title:kinds[event.kind]+" · "+d.title,text:d.action+(d.version?" · V"+d.version:"")+(d.revision?" · R"+d.revision:"")+(d.status?" · "+d.status:"")};
 if(["external_record","referral","referral_contact"].includes(event.kind))return {title:kinds[event.kind]+" · "+d.title,text:d.action+(d.version?" · V"+d.version:"")+(d.revision?" · R"+d.revision:"")+(d.status?" · "+d.status:"")+(d.destination?" · "+d.destination:"")};
 if(["contact_case","contact_attempt","contact_receipt","customer_appointment"].includes(event.kind))return {title:kinds[event.kind]+" · "+d.title,text:d.action+(d.revision?" · R"+d.revision:"")+(d.result?" · "+d.result:"")+(d.starts_at?" · "+d.starts_at:""),reason:d.reason};
 if(["longitudinal","observation","review_plan"].includes(event.kind))return {title:kinds[event.kind]+" · "+d.title,text:(d.action||"记录 / 更正")+" · "+(d.version?"V"+d.version:"R"+d.revision)+(d.measured_at?" · 实际检查 "+d.measured_at:d.due_date?" · 复查日期 "+d.due_date:""),reason:d.reason};
 if(["practice","reassessment"].includes(event.kind))return {title:kinds[event.kind]+" · "+d.title,text:"V"+d.version+" · "+({submit:"实际情况提交",feedback:"专业反馈",create:"建立草稿",revise:"修订草稿",publish:"发布",withdraw:"撤回",close:"结束",check:"核对"}[d.action]||d.action),reason:d.reason};
 if(['contact_case','contact_attempt','contact_receipt','customer_appointment'].includes(event.kind)){openContact(event.kind==='customer_appointment'?'appointments':'cases',event.entity_id);return;}
  if(['longitudinal','observation','review_plan'].includes(event.kind)){openLongitudinal({longitudinal:'cases',observation:'observations',review_plan:'plans'}[event.kind],event.entity_id);return;}
  if(event.kind==='scheduling')return {title:'训练'+({create:'登记',promote:'候补转预约',move:'单次调课',cancel:'取消',leave:'请假'}[d.action]||d.action),text:`${d.booking_number} · ${d.starts_at} → ${d.ends_at} · ${d.status==='waiting'?'候补':d.status==='booked'?'预约':'取消'} · 原计划 V${d.plan_version}`,reason:d.reason};
 if(event.kind==='entitlement')return {title:`权益${d.action==='grant'?'登记':'冲销'} · ${d.origin==='paid'?'购买':'赠送'}`,text:`${d.account_number} · ${d.quantity===null?'期间记录':d.quantity+' 次'} · 固定规则 V${d.package_version}`,reason:d.reason};
 if(event.kind==='training_plan')return {title:`训练计划 · ${d.title} · V${d.plan_version}`,text:d.plan_number+' · '+({create:'草稿',revise:'调整草稿',confirm:'启用',pause:'暂停',resume:'恢复',end:'结束'}[d.action]),reason:d.reason};
 if(event.kind==='training_session')return {title:`当次课程 · 固定计划 V${d.plan_version}`,text:d.plan_number+' · '+({create:'登记当次课程',assign:'调整执行人',start:'开始',pause:'暂停',resume:'恢复',record:'实际记录',correct:'更正记录',confirm:'记录核对',abort:'中止',note:'说明'}[d.action]),reason:d.reason};
 if(event.kind==='reserved_custody')return {title:`原预留原件 · ${d.action==='observe'?'实际核对':'解释撤回'} V${d.version}`,text:`${d.order_number} · 原单 V${d.order_version} / 行 ${d.position} · ${d.receipt_number} · 当时 ${d.quantity} / ${d.location_label}`,reason:d.reason};
 if(event.kind==='dispatch')return {title:`实际出库 · 记录 ${d.outbound_revision}`,text:`${d.order_number} · 原单 V${d.order_version} · 行 ${d.position} · 数量 ${d.quantity}${d.batch_source?.status==='recorded'?' · 原批已明确：'+d.batch_source.items.map(x=>x.receipt_number).join(' / '):' · 原批未记录'}`,reason:d.reason};
 if(event.kind==='aftercare_replacement')return {title:'售后新商品 · '+({create:'关联新订单',approve:'业务安排确认',cancel:'取消安排',complete:'登记交付完成'}[d.action]),text:d.order_number+' · 新单 V'+d.order_version+' · 原案例涉及 '+d.quantity,reason:d.reason};
 if(event.kind==='aftercare_disposition')return {title:'旧件处置 · '+({create:'申请',approve:'批准',reject:'驳回',cancel:'撤销',execute:'实际转出'}[d.action]),text:d.order_number+' · 原单 V'+d.order_version+' / 行 '+d.position+' · 数量 '+d.quantity+' · '+d.destination,reason:d.reason};
 if(event.kind==='aftercare_work')return {title:'售后维修 · '+({plan:'安排',start:'开工',complete:'完成',check_pass:'复检合格',check_fail:'复检不合格',rework_plan:'安排返工',rework_start:'返工开工',rework_complete:'返工完成',return:'原件归还签收',cancel_plan:'撤销安排'}[d.action])+' · 记录 '+d.revision,text:d.order_number+' · 原单 V'+d.order_version+' / 行 '+d.position+' · 数量 '+d.quantity,reason:d.reason};
 if(event.kind==='aftercare')return {title:`原单售后 · ${d.title} · 记录 ${d.revision}`,text:`${d.order_number} · ${d.action==='receive_return'?'退回隔离数量 '+d.return_quantity:'保存处理历史'}`,reason:d.reason};
 if(event.kind==='fulfillment')return {title:`${{check_pass:'质检合格',check_fail:'质检不合格',rework_assign:'安排返工',rework_start:'开始返工',rework_complete:'完成返工',deliver:'记录分项签收'}[d.action]} · 记录 ${d.revision}`,text:`${d.order_number}-J${String(d.job_serial).padStart(2,'0')} · 固定订单 V${d.order_version} · 加工记录 ${d.processing_revision} · 原单行 ${d.position} · 数量 ${d.quantity}${d.batch_source?.status==='recorded'?' · 原批已明确：'+d.batch_source.items.map(x=>x.receipt_number).join(' / '):' · 原批未记录'}`,reason:d.reason};
 if(event.kind==='processing')return {title:`${{create:'建立加工安排',plan:'调整分项安排',receive:'登记到货/备料',start:'登记加工开工',complete:'登记加工完成',delay:'记录交期延期',clear_delay:'解除延期说明',cancel:'取消未执行加工计划'}[d.action]} · 记录 ${d.revision}`,text:`${d.order_number}-J${String(d.job_serial).padStart(2,'0')} · 固定订单 V${d.order_version}${d.position?' · 原单行 '+d.position:''}${d.quantity?' · 本次数量 '+d.quantity:''}`,reason:d.reason};
 if(event.kind==='parameter')return {title:'配镜参数 · '+({create:'保存交接版本',submit:'提交核对',check:'交接已核对',return:'退回交接',review:d.outcome==='hold'?'暂缓工单':'明确继续原参数'})[d.action],text:d.order_number+' · 原单 V'+d.order_version+' · 记录 '+d.revision,reason:d.reason};
 if(event.kind==='refund')return {title:'退款 · '+({create:'申请',approve:'批准',reject:'驳回',cancel:'撤销',execute:'实际退款登记'}[d.action]),text:d.order_number+' · 原单 V'+d.order_version+' · ¥'+(d.amount_cents/100).toFixed(2),reason:d.reason};
 if(event.kind==='payment')return {title:`${d.action==='receive'?'登记收款':'追加误录作废'} · 记录 ${d.revision}`,text:`${d.order_number} · 固定订单 V${d.order_version} · ¥${(d.amount_cents/100).toFixed(2)}`,reason:d.reason};
 if(event.kind==='inventory')return {title:`${d.action==='reserve'?'预留订单商品':'释放订单预留'} · 记录 ${d.revision}`,text:`${d.order_number} · 固定订单 V${d.order_version}`,reason:d.reason};
 if(event.kind==='retail')return {title:`${d.status==='cancelled'?'取消':d.version===1?'建立':'修订'}配镜订单草稿 · V${d.version}`,text:`${d.order_number} · ${d.title} · 商品明细合计 ¥${(d.subtotal_cents/100).toFixed(2)}`,reason:d.reason};
 if(event.kind==='profile')return {title:`${d.source==='legacy'?'保存存量档案基线':d.version===1?'建立客户档案':'修订客户档案'} · V${d.version}`,text:d.name,reason:d.reason};
 if(event.kind==='cycle')return {title:`${d.source==='unrecorded'?'建立早期':d.source==='legacy'?'保存存量':d.version>1?'修订':'建立'}${types[d.type]}周期${d.version?' · V'+d.version:'草稿'}`,text:d.goal||'初始需求未留存',reason:d.reason};
 if(event.kind==='visit')return {title:d.action==='close'?'结束本次到店':'登记到店',text:d.purpose,reason:d.action==='close'?d.reason:`关联 ${d.cycle_count} 个独立周期${d.cycle_refs?.length?' · '+d.cycle_refs.map(r=>types[r.type]+(r.version?' V'+r.version:'（旧版未记录）')).join(' / '):''}`};
 if(event.kind==='task'&&d.action==='correct')return {title:`追加完成说明更正 · V${d.revision}`,text:d.title,reason:`${d.output_summary} · ${d.reason}`};
 if(event.kind==='task'&&d.action==='followup')return {title:'分派关联后续任务',text:d.title,reason:`来源：${d.parent_title} · ${d.source_correction_version?'更正 V'+d.source_correction_version:'原完成产出'} · ${d.source_output_summary} · ${d.reason}`};
 if(event.kind==='task'&&d.action==='complete')return {title:'完成通用核对',text:d.title,reason:`${d.output_summary} · 条件 V${d.condition_version} / 依据 V${d.evidence_version} · ${d.reason}`};
 if(event.kind==='task')return {title:`${{assign:'分派任务',claim:'认领任务',accept:'接收任务',start:'开始任务',pause:'暂停任务',resume:'恢复执行',return:'退回岗位',transfer:'转交任务',block:'登记阻塞',unblock:'解除阻塞',cancel:'取消任务',restore:'恢复任务',conditions:'设定核对条件',evidence:'保存依据草稿'}[d.action]} · ${['conditions','evidence'].includes(d.action)?'V':'修订 '}${d.revision}`,text:`${d.title} → ${d.assignee_name||{manager:'门店负责人',reception:'前台 / 销售',professional:'专业人员'}[d.candidate_role]+'候选队列'} · ${{pending:'待开始',running:'执行中',paused:'已暂停'}[d.execution_status]} · ${{active:'正常',blocked:'已阻塞',cancelled:'已取消'}[d.lifecycle_status]}${d.exception_reason?' · '+d.exception_reason:''}${d.cycle_version?' · 固定需求 V'+d.cycle_version:''}`,reason:[d.reason,d.description,d.notes,d.condition_version?'适用条件 V'+d.condition_version:'',d.references?'固定资料版本 '+d.references.document_version_ids.length+' 项，附件 '+d.references.attachment_ids.length+' 项':''].filter(Boolean).join(' · ')};
 if(event.kind==='document')return {title:`${d.version===1?'建立':'修订'}资料 · V${d.version}`,text:d.title,reason:d.reason};
 if(event.kind==='attachment')return {title:d.action==='revoke'?'撤销附件访问':'上传附件',text:d.filename,reason:d.reason};
 if(event.kind==='authorization')return {title:d.action==='guardian.authorize'?'授权家长查看':'撤销家长查看授权',text:d.relationship,reason:d.reason};
 return {title:d.action==='baseline'?'登记早期联系人':d.action==='contact.create'?'登记家庭联系人':d.active?(d.previous_active===0?'恢复家庭联系人':'修订家庭联系人'):(d.previous_active===1?'停用家庭联系人':'修订停用联系人'),text:d.name?`${d.name} · ${d.relationship} · V${d.revision}`:'初版明细未留存',reason:d.reason};
}
export function createTimelinePanel({openSpecialty,openReferral,openContact,openLongitudinal,openFamily,openScheduling,openEntitlements,openTraining,api,getMe,getCustomer,getEpoch,toast}){
 let resetCurrent=()=>{};
 function locate(event){
  if(['practice','reassessment'].includes(event.kind)){openFamily(event.kind==='practice'?'practices':'reassessments',event.entity_id);return;}
  if(['specialty_continuity','specialty_archive'].includes(event.kind)){openSpecialty(event.kind,event.entity_id);return;}
  if(event.kind==='specialty_review'){openSpecialty('specialty_review',event.entity_id);return;}
  if(event.kind==='specialty_care'){openSpecialty('specialty_care',event.entity_id);return;}
  if(['specialty_order','specialty_lot'].includes(event.kind)){openSpecialty(event.kind,event.entity_id);return;}
  if(['specialty_case','specialty_consent'].includes(event.kind)){openSpecialty(event.kind==='specialty_case'?'cases':'consents',event.entity_id);return;}
 if(['external_record','referral','referral_contact'].includes(event.kind)){openReferral(event.kind==='external_record'?'records':'cases',event.entity_id);return;}
 if(['contact_case','contact_attempt','contact_receipt','customer_appointment'].includes(event.kind)){openContact(event.kind==='customer_appointment'?'appointments':'cases',event.entity_id);return;}
  if(['longitudinal','observation','review_plan'].includes(event.kind)){openLongitudinal({longitudinal:'cases',observation:'observations',review_plan:'plans'}[event.kind],event.entity_id);return;}
  if(event.kind==='scheduling'){openScheduling(event.entity_id);return;}
  if(event.kind==='entitlement'){openEntitlements(event.entity_id);return;}
  if(event.kind==='training_plan'){openTraining('plans',event.entity_id,event.details.plan_version);return;}
  if(event.kind==='training_session'){openTraining('sessions',event.entity_id);return;}
  if(event.kind==='profile'){document.querySelector('.profile-actions button:last-child')?.click();return;}
  const key={reserved_custody:'orderId',parameter:'orderId',refund:'orderId',aftercare_disposition:'orderId',aftercare_replacement:'orderId',aftercare_work:'orderId',dispatch:'orderId',aftercare:'orderId',fulfillment:'orderId',processing:'orderId',payment:'orderId',inventory:'orderId',retail:'orderId',task:'taskId',cycle:'cycleId',visit:'visitId',contact:'contactId',document:'recordId',attachment:'attachmentId'}[event.kind];
  const target=key?[...document.querySelectorAll('#detail [data-'+key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())+']')].find(n=>n.dataset[key]===(['reserved_custody','processing','fulfillment','dispatch','aftercare','aftercare_work','aftercare_replacement','aftercare_disposition'].includes(event.kind)?event.details.order_id:event.entity_id)):document.querySelector('#detail .family-access-area');
  if(!target){toast('对应记录未显示在当前列表中，可刷新档案后再查看。');return;}target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.remove('timeline-focus');void target.offsetWidth;target.classList.add('timeline-focus');
 }
 async function render(target,id){
  resetCurrent();const epoch=getEpoch();let generation=0,cursor=null,loaded=false;const same=()=>getMe()&&getEpoch()===epoch&&getCustomer()===id&&target.isConnected;
  const summary=el('section',undefined,'customer-overview'),heading=el('div',undefined,'section-heading');heading.append(el('h2','客户总览'));
  const refresh=el('button','刷新总览');refresh.type='button';heading.append(refresh);summary.append(heading);
  const facts=el('div',undefined,'customer-facts'),recent=el('p','正在读取服务记录…','small muted');summary.append(facts,recent);
  const history=el('details',undefined,'customer-timeline'),toggle=el('summary');toggle.append(el('strong','客户历史时间轴'),el('span','查看已保存的服务与修改记录','small muted'));history.append(toggle);
  const form=el('form',undefined,'timeline-filters'),category=el('select');category.name='kind';category.setAttribute('aria-label','记录类别');category.append(new Option('全部记录','all'));for(const [key,name] of Object.entries(kinds))if(!['payment','refund','entitlement'].includes(key)||getMe().permissions.includes('payments:read'))category.append(new Option(name,key));
  const from=el('input'),to=el('input');from.type=to.type='date';from.name='from';to.name='to';
  function label(text,input){const l=el('label',text);l.append(input);return l;}
  form.append(label('记录类别',category),label('开始日期（UTC）',from),label('结束日期（UTC）',to));const apply=el('button','筛选记录');apply.type='submit';form.append(apply);
  const error=el('p',undefined,'form-error');error.setAttribute('role','alert');const list=el('ol',undefined,'timeline-list');list.setAttribute('aria-label','客户历史记录');list.tabIndex=0;const more=el('button','加载更早记录');more.type='button';more.hidden=true;
  const status=el('p',undefined,'small muted');status.setAttribute('role','status');history.append(form,error,list,status,more);target.replaceChildren(summary,history);
  resetCurrent=()=>{generation++;cursor=null;loaded=false;target.replaceChildren();};
  async function overview(){
   try{const data=await api(`/customers/${id}/overview`);if(!same())return;facts.replaceChildren();for(const [name,value,color] of [['配镜订单草稿',data.retail_orders_draft,'coral'],['周期草稿',data.cycle_drafts,'mint'],['待结束到店',data.visits_registered,'sky'],['已结束到店',data.visits_closed,'sky'],['有效联系人',data.contacts_active,'coral'],['资料记录',data.documents,'violet'],['可访问附件',data.attachments_active,'violet'],['通用核对已完成',data.tasks_completed,'sky']]){const fact=el('div',undefined,`customer-fact ${color}`);fact.append(el('strong',String(value)),el('small',name));facts.append(fact);}
    recent.textContent=data.last_visit?`最近登记到店：${new Date(data.last_visit.created_at).toLocaleString('zh-CN',{hour12:false})} · ${data.last_visit.status==='closed'?'本次已结束':'已登记，尚未结束'} · ${data.last_visit.purpose}`:'尚无到店记录。可从下方登记本次到店。';
   }catch(e){if(same())recent.textContent=e.message;}
  }
  async function load(reset){
   if(!same())return;const version=reset?++generation:generation;if(reset){cursor=null;list.replaceChildren();loaded=true;}const pageCursor=cursor;
   error.textContent='';apply.disabled=true;more.disabled=true;status.textContent='正在读取历史…';
   const params=new URLSearchParams({kind:category.value,limit:'20'});if(from.value)params.set('from',from.value);if(to.value)params.set('to',to.value);if(pageCursor)params.set('cursor',pageCursor);
   try{
    const data=await api(`/customers/${id}/timeline?${params}`);if(!same()||version!==generation)return;
    for(const event of data.items){const item=el('li',undefined,'timeline-event');item.dataset.eventId=event.event_id;item.dataset.kind=event.kind;const info=describe(event),head=el('div',undefined,'timeline-event-head');head.append(el('h3',info.title),el('span',kinds[event.kind],`badge ${{inventory:'mint',retail:'coral',profile:'violet',cycle:'mint',visit:'sky',contact:'coral',document:'violet',attachment:'violet',authorization:'coral',task:'sky'}[event.kind]}`));item.append(head);
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
