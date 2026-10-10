import {createCustodyPanel} from './inventory-custody.js';
import {createExtraReturnPanel} from './purchase-extra-returns.js';
import {createInventorySourcesPanel} from './inventory-sources.js';
import {createSupplierReturnPanel} from './supplier-returns.js';
import {createPurchaseQualityPanel} from './purchase-quality.js';
import {createReceivingPanel} from './purchase-receiving.js';
import {createProcurementPanel} from './procurement.js';
import {createSpecialtyContinuityPanel} from './specialty-continuity.js';
import {createSpecialtyReviewPanel} from './specialty-review.js';
import {createSpecialtyCarePanel} from './specialty-care.js';
import {createSpecialtyTracePanel} from './specialty-trace.js';
import {createSpecialtyPanel} from './specialty.js';
import {createReferralPanel} from './referrals.js';
import {createContactPanel} from './contact.js';
import {createLongitudinalPanel} from './longitudinal.js';
import {createFamilyPanel} from './family-training.js';
import {createSchedulingPanel} from './scheduling.js';
import {createEntitlementsPanel} from './entitlements.js';
import {createTrainingPanel} from './training.js';
import {createParametersPanel} from './parameters.js';
import {createRefundsPanel} from './refunds.js';
import {createDispositionsPanel} from './aftercare-dispositions.js';
import {createReplacementsPanel} from './aftercare-replacements.js';
import {createAftercareWorkPanel} from './aftercare-work.js';
import {createProgressPanel} from './progress.js';
import {createDispatchPanel} from './dispatch.js';
import {createAftercarePanel} from './aftercare.js';
import {createFulfillmentPanel} from './fulfillment.js';
import {createProcessingPanel} from './processing.js';
import { createPaymentsPanel } from './payments.js';
import { createInventoryPanel } from './inventory.js';
import { createRetailPanel } from './retail.js';
import { createDocumentPanels } from './documents.js';
import { createOrganizationPanel } from './organization.js';
import { createOperationsPanel } from './operations.js';
import { createProfilesPanel } from './profiles.js';
import { createTimelinePanel } from './timeline.js';
import { createCyclesPanel } from './cycles.js';
import { createTasksPanel } from './tasks.js';
const $=s=>document.querySelector(s);
let me, selected, csrf, customers=[], searchVersion=0, toastTimer, sessionEpoch=0;
const roleNames={manager:'门店负责人',reception:'前台 / 销售',professional:'专业人员',guardian:'家长 / 客户'};
const cycleNames={followup:'长期随访',training:'训练服务',retail:'配镜服务'};
const actions={'refunds.create':'提交退款申请','refunds.approve':'批准退款申请','refunds.reject':'驳回退款申请','refunds.cancel':'撤销退款申请','refunds.execute':'登记实际退款','aftercare.disposition.create':'提交旧件处置申请','aftercare.disposition.approve':'批准旧件处置','aftercare.disposition.reject':'驳回旧件处置','aftercare.disposition.cancel':'撤销旧件处置','aftercare.disposition.execute':'登记旧件实际转出','aftercare.replacement.create':'关联售后新订单','aftercare.replacement.approve':'确认售后业务安排','aftercare.replacement.cancel':'取消售后新单安排','aftercare.replacement.complete':'登记售后新商品交付','aftercare.work.plan':'安排原件维修','aftercare.work.start':'开始维修','aftercare.work.complete':'维修完成','aftercare.work.check_pass':'维修复检合格','aftercare.work.check_fail':'维修复检不合格','aftercare.work.rework_plan':'安排维修返工','aftercare.work.rework_start':'开始维修返工','aftercare.work.rework_complete':'完成维修返工','aftercare.work.return':'原件归还签收','aftercare.work.cancel_plan':'撤销未开始维修','dispatch.create':'记录批次实际出库','aftercare.create':'登记原单售后','aftercare.assign':'分派售后责任人','aftercare.start':'开始售后处理','aftercare.note':'追加售后记录','aftercare.pause':'暂停售后处理','aftercare.resume':'恢复售后处理','aftercare.resolve':'结束售后处理记录','aftercare.cancel':'取消售后案例','aftercare.reopen':'重开售后案例','aftercare.receive_return':'收存退回隔离件','fulfillment.check_pass':'登记质检合格','fulfillment.check_fail':'登记质检不合格','fulfillment.rework_assign':'安排返工','fulfillment.rework_start':'开始返工','fulfillment.rework_complete':'完成返工','fulfillment.deliver':'记录分项签收','processing.create':'建立加工工单','processing.plan':'调整加工安排','processing.receive':'登记到货/备料','processing.start':'登记加工开工','processing.complete':'登记加工完成','processing.delay':'记录交期延期','processing.clear_delay':'解除延期说明','processing.cancel':'取消未执行加工计划','payments.receive':'登记收款','payments.void':'纠正收款误录','inventory.receive':'登记库存入库','inventory.isolate':'转入库存隔离','inventory.unquarantine':'解除库存隔离','inventory.order.reserve':'预留订单商品','inventory.order.release':'释放订单预留','retail.product.create':'建立商品目录','retail.product.revise':'修订商品目录','retail.order.create':'建立配镜订单草稿','retail.order.revise':'修订配镜订单草稿','retail.order.cancel':'取消配镜订单草稿','task.correct':'追加完成说明更正','task.followup':'分派关联后续任务','task.complete':'完成通用核对','task.conditions':'设定通用核对条件','task.evidence':'保存依据草稿','task.block':'登记任务阻塞','task.unblock':'解除任务阻塞','task.cancel':'取消任务','task.restore':'恢复任务','task.claim':'认领岗位任务','task.start':'开始任务执行','task.pause':'暂停任务执行','task.resume':'恢复任务执行','task.return':'退回岗位候选','task.assign':'分派协作任务','task.accept':'接收协作任务','task.transfer':'转交协作任务','session.login':'登录工作台','session.logout':'退出工作台','customer.create':'新建客户档案','cycle.create':'创建服务周期草稿','cycle.revise':'修订周期需求','demo.cycles':'补充虚构周期修订','guardian.authorize':'授权家长关联','guardian.revoke':'撤销家长授权','visit.register':'登记到店','visit.close':'结束本次到店','demo.seed':'扩展虚构案例','attachment.upload':'上传附件','attachment.download':'下载附件','attachment.revoke':'撤销附件访问','document.create':'建立资料版本','document.revise':'修订资料版本','staff.create':'建立员工账号','staff.update':'调整员工资料','staff.password_reset':'重置员工密码','staff.sessions_revoke':'撤销员工会话','account.password':'修改本人密码','customer.revise':'修订客户档案','contact.create':'建立家庭联系人','contact.update':'修改家庭联系人','demo.profiles':'补充虚构家庭资料'};
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(path,{method='GET',data,key}={}){
  const epoch=sessionEpoch;const headers={};if(data)headers['Content-Type']='application/json';if(method!=='GET')headers['X-CSRF-Token']=csrf||'';if(key)headers['Idempotency-Key']=key;
  const r=await fetch(`/api${path}`,{method,headers,body:data?JSON.stringify(data):undefined});const b=await r.json();if(epoch!==sessionEpoch)throw Error('会话已切换，请重新操作');
  if(!r.ok){if(r.status===401&&path!=='/auth/login')showLogin();throw Error((b.error?.message||'操作失败，请重试')+(b.request_id?`（故障编号：${b.request_id}）`:''));}return b;
}
const documentPanels=createDocumentPanels({api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,reload:openCustomer,toast,showLogin});
const organizationPanel=createOrganizationPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,boot,onLogout:logout});
const operationsPanel=createOperationsPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch});
const profilesPanel=createProfilesPanel({api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,reload:openCustomer,toast});
const timelinePanel=createTimelinePanel({openSpecialty:(kind,id)=>kind==='specialty_archive'?specialtyContinuityPanel.showArchive(id):kind==='specialty_continuity'?specialtyContinuityPanel.showPlan(id):kind==='specialty_review'?specialtyReviewPanel.showDetail(id):kind==='specialty_care'?specialtyCarePanel.showDetail(id):kind==='specialty_order'?specialtyTracePanel.showOrder(id):kind==='specialty_lot'?specialtyTracePanel.showLot(id):specialtyPanel.showDetail(kind,id),openReferral:(kind,id)=>referralPanel.showDetail(kind,id),openContact:(kind,id)=>contactPanel.showDetail(kind,id),openLongitudinal:(kind,id)=>longitudinalPanel.showDetail(kind,id),openFamily:(kind,id)=>familyPanel.showDetail(kind,id),openScheduling:id=>schedulingPanel.showDetail('bookings',id),openEntitlements:id=>entitlementsPanel.showDetail('accounts',id),openTraining:(kind,id,version)=>trainingPanel.showDetail(kind,id,version),api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,toast});
const cyclesPanel=createCyclesPanel({api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,reload:openCustomer,toast});
const progressPanel=createProgressPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch});
const tasksPanel=createTasksPanel({api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,reload:openCustomer,toast,openCustomer:id=>{switchView('customers');openCustomer(id);}});
const inventorySourcesPanel=createInventorySourcesPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,openReceipt:id=>receivingPanel.showReceipt(id),openQuality:id=>purchaseQualityPanel.showCase(id),openReturn:id=>supplierReturnPanel.show(id),openOrder:id=>retailPanel.showDetail(id)});
const inventoryPanel=createInventoryPanel({onSources:id=>inventorySourcesPanel.open(id),api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,toast,reload:openCustomer,openOrder:id=>retailPanel.showDetail(id),goToInventory:()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();switchView('inventory');inventoryPanel.load();}});
const custodyPanel=createCustodyPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast});
const extraReturnPanel=createExtraReturnPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast});
const supplierReturnPanel=createSupplierReturnPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast});
const purchaseQualityPanel=createPurchaseQualityPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,onReturns:id=>supplierReturnPanel.openCase(id)});
const receivingPanel=createReceivingPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,onQuality:id=>purchaseQualityPanel.openReceipt(id),onExtraReturns:id=>extraReturnPanel.openReceipt(id),onCustody:id=>custodyPanel.openReceipt(id)});
const procurementPanel=createProcurementPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,onReceiving:id=>receivingPanel.openPurchase(id)});
const specialtyContinuityPanel=createSpecialtyContinuityPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,openCase:id=>specialtyPanel.showDetail('cases',id),openReview:(id,pg)=>specialtyReviewPanel.showDetail(id,pg),openTrace:(id,isCase)=>isCase?specialtyTracePanel.showCase(id):specialtyTracePanel.showOrder(id),openAftercare:id=>aftercarePanel.showDetail(id),openReplacements:id=>replacementsPanel.showDetail(id)});
const specialtyReviewPanel=createSpecialtyReviewPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,openCase:(k,id)=>specialtyPanel.showDetail(k,id),openOrder:id=>retailPanel.showDetail(id),openCare:(id,pg)=>specialtyCarePanel.showDetail(id,pg),openLongitudinal:(k,id,version)=>longitudinalPanel.showDetail(k,id,0,version),openReferral:(k,id,pg)=>referralPanel.showDetail(k,id,pg),openContact:(k,id)=>contactPanel.showDetail(k,id)});
const specialtyCarePanel=createSpecialtyCarePanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,openOrder:id=>retailPanel.showDetail(id),openCase:(k,id)=>specialtyPanel.showDetail(k,id),openTrace:id=>specialtyTracePanel.showOrder(id)});
const specialtyTracePanel=createSpecialtyTracePanel({openReviews:id=>specialtyReviewPanel.showOrder(id),openCare:id=>specialtyCarePanel.showOrder(id),api,getMe:()=>me,getEpoch:()=>sessionEpoch,toast,openCase:(k,id)=>specialtyPanel.showDetail(k,id),openOrder:(id,v)=>retailPanel.showDetail(id,v),openParameters:id=>parametersPanel.showDetail(id),openProcessing:id=>processingPanel.showDetail(id)});
const specialtyPanel=createSpecialtyPanel({openContinuity:id=>specialtyContinuityPanel.showCase(id),openReviews:id=>specialtyReviewPanel.showList(id),openTrace:id=>specialtyTracePanel.showCase(id),api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected?{id:selected,name:customers.find(c=>c.id===selected)?.name||selected}:null,toast});
const referralPanel=createReferralPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected?{id:selected,name:customers.find(c=>c.id===selected)?.name||selected}:null,toast,openContact:(kind,id)=>contactPanel.showDetail(kind,id)});
const contactPanel=createContactPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected?{id:selected,name:customers.find(c=>c.id===selected)?.name||selected}:null,toast});
const longitudinalPanel=createLongitudinalPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected?{id:selected,name:customers.find(c=>c.id===selected)?.name||selected}:null,toast});
const familyPanel=createFamilyPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected?{id:selected,name:customers.find(c=>c.id===selected)?.name||selected}:null,toast,openTraining:(kind,id,version)=>trainingPanel.showDetail(kind,id,version)});
const schedulingPanel=createSchedulingPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected?{id:selected,name:customers.find(c=>c.id===selected)?.name||selected}:null,toast,openCustomer:id=>{switchView('customers');openCustomer(id);},openTraining:(kind,id,version)=>trainingPanel.showDetail(kind,id,version)});
const entitlementsPanel=createEntitlementsPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected?{id:selected,name:customers.find(c=>c.id===selected)?.name||selected}:null,toast,openCustomer:id=>{switchView('customers');openCustomer(id);},openTraining:(kind,id,version)=>trainingPanel.showDetail(kind,id,version)});
const trainingPanel=createTrainingPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected,toast,openCustomer:id=>{switchView('customers');openCustomer(id);}});
const parametersPanel=createParametersPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected,toast,openOrder:(id,v)=>retailPanel.showDetail(id,v),openProcessing:id=>processingPanel.showDetail(id)});
const refundsPanel=createRefundsPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected,toast,openOrder:(id,v)=>retailPanel.showDetail(id,v),openCase:id=>aftercarePanel.showDetail(id),reload:()=>paymentsPanel.load()});
const paymentsPanel=createPaymentsPanel({refunds:refundsPanel,api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,toast,reload:openCustomer,openOrder:(id,version)=>retailPanel.showDetail(id,version)});
const dispatchPanel=createDispatchPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected,toast,reload:openCustomer,openOrder:(id,v)=>retailPanel.showDetail(id,v),openAftercare:id=>aftercarePanel.showSource(id)});
const dispositionsPanel=createDispositionsPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected,toast,reload:()=>aftercarePanel.load(),openOrder:(id,v)=>retailPanel.showDetail(id,v),openCase:id=>aftercarePanel.showDetail(id)});
const replacementsPanel=createReplacementsPanel({openSpecialtySource:id=>specialtyContinuityPanel.showPlan(id),api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected,toast,reload:()=>aftercarePanel.load(),openOrder:(id,v)=>retailPanel.showDetail(id,v),openProcessing:id=>processingPanel.showDetail(id),openCase:id=>aftercarePanel.showDetail(id),createOrder:(id,onSaved)=>retailPanel.createOrder(id,onSaved)});
const workPanel=createAftercareWorkPanel({api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected,toast,reload:()=>aftercarePanel.load(),openOrder:(id,v)=>retailPanel.showDetail(id,v),openCase:id=>aftercarePanel.showDetail(id)});
const aftercarePanel=createAftercarePanel({refunds:refundsPanel,dispositions:dispositionsPanel,replacements:replacementsPanel,work:workPanel,api,getMe:()=>me,getEpoch:()=>sessionEpoch,getCustomer:()=>selected,toast,reload:openCustomer,openOrder:(id,v)=>retailPanel.showDetail(id,v),openDispatch:id=>dispatchPanel.showDetail(id)});
const fulfillmentPanel=createFulfillmentPanel({parameters:parametersPanel,dispatch:dispatchPanel,aftercare:aftercarePanel,api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,toast,reload:openCustomer,openOrder:(id,version)=>retailPanel.showDetail(id,version),openProcessing:id=>processingPanel.showDetail(id),goToFulfillment:()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();switchView('fulfillment');fulfillmentPanel.load();}});
const processingPanel=createProcessingPanel({parameters:parametersPanel,fulfillment:fulfillmentPanel,api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,toast,reload:openCustomer,openOrder:(id,version)=>retailPanel.showDetail(id,version),goToProcessing:()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();switchView('processing');processingPanel.load();}});
const retailPanel=createRetailPanel({specialtyTrace:specialtyTracePanel,parameters:parametersPanel,openAftercare:id=>aftercarePanel.showDetail(id),processing:processingPanel,payments:paymentsPanel,inventory:inventoryPanel,api,getMe:()=>me,getCustomer:()=>selected,getEpoch:()=>sessionEpoch,reload:openCustomer,toast,openCustomer:id=>{switchView('customers');openCustomer(id);}});
function showLogin(){custodyPanel.reset();extraReturnPanel.reset();inventorySourcesPanel.reset();supplierReturnPanel.reset();purchaseQualityPanel.reset();receivingPanel.reset();procurementPanel.reset();specialtyContinuityPanel.reset();specialtyReviewPanel.reset();specialtyPanel.reset();specialtyTracePanel.reset();specialtyCarePanel.reset();referralPanel.reset();contactPanel.reset();longitudinalPanel.reset();familyPanel.reset();schedulingPanel.reset();entitlementsPanel.reset();trainingPanel.reset();parametersPanel.reset();refundsPanel.reset();dispositionsPanel.reset();replacementsPanel.reset();workPanel.reset();dispatchPanel.reset();aftercarePanel.reset();progressPanel.reset();fulfillmentPanel.reset();processingPanel.reset();paymentsPanel.reset();inventoryPanel.reset();retailPanel.reset();tasksPanel.reset();cyclesPanel.reset();timelinePanel.reset();profilesPanel.reset();documentPanels.reset();organizationPanel.reset();operationsPanel.reset();sessionEpoch++;searchVersion++;$('#search').value='';me=undefined;csrf=undefined;selected=undefined;customers=[];$('#workspace').hidden=true;$('#login-view').hidden=false;$('#customer-items').replaceChildren();$('#detail').replaceChildren();$('#audit-items').replaceChildren();$('#organization-items').replaceChildren();$('#demo-scenarios').replaceChildren();$('#demo-summary').replaceChildren();for(const d of document.querySelectorAll('dialog[open]'))d.close();$('#login-form').elements.password.value='';}
async function boot(){
  try{me=await api('/me');csrf=me.csrf;$('#login-view').hidden=true;$('#workspace').hidden=false;$('#loading').hidden=true;$('#user-name').textContent=me.name;$('#user-role').textContent=roleNames[me.role];$('#user-avatar').textContent=me.name.slice(0,1);$('#store-name').textContent=me.store?.name||'授权家庭范围';$('#phase-nav').hidden=!me.permissions.includes('progress:read');$('#dispatch-nav').hidden=!me.permissions.includes('dispatch:read');$('#aftercare-nav').hidden=!me.permissions.includes('aftercare:read');$('#fulfillment-nav').hidden=!me.permissions.includes('fulfillment:read');$('#processing-nav').hidden=!me.permissions.includes('processing:read');$('#entitlements-nav').hidden=!me.permissions.includes('entitlements:read');$('#procurement-nav').hidden=!me.permissions.includes('procurement:read');$('#specialty-nav').hidden=!me.permissions.includes('specialty:read');$('#referral-nav').hidden=!me.permissions.includes('referrals:read');$('#contact-nav').hidden=!me.permissions.includes('contacts:read');$('#longitudinal-nav').hidden=!me.permissions.includes('longitudinal:read');$('#family-nav').hidden=!me.permissions.includes('family:read');$('#scheduling-nav').hidden=!me.permissions.includes('scheduling:read');$('#training-nav').hidden=!me.permissions.includes('training:read');$('#parameters-nav').hidden=!me.permissions.includes('parameters:read');$('#refunds-nav').hidden=!me.permissions.includes('payments:read');$('#payments-nav').hidden=!me.permissions.includes('payments:read');$('#inventory-nav').hidden=!me.permissions.includes('inventory:read');$('#retail-nav').hidden=!me.permissions.includes('retail:read');$('#tasks-nav').hidden=!me.permissions.includes('tasks:read');$('#demo-nav').hidden=!me.permissions.includes('demo:read');$('#organization-nav').hidden=!me.permissions.includes('organization:read');$('#audit-nav').hidden=!me.permissions.includes('audit:read');$('#operations-nav').hidden=!me.permissions.includes('operations:read');$('#new-customer').hidden=!me.permissions.includes('customers:create');$('#search').placeholder=me.role==='guardian'?'按客户姓名搜索':'姓名、联系人、电话或编号';switchView('customers');if(me.must_change_password){organizationPanel.openPassword();return;}await loadCustomers();}
  catch(e){if(me)$('#global-error').textContent=e.message;else showLogin();}
}
function switchView(view){for(const name of ['procurement','specialty','referral','contact','longitudinal','family','scheduling','customers','audit','phase','demo','organization','operations','tasks','retail','inventory','payments','refunds','parameters','training','entitlements','processing','fulfillment','dispatch','aftercare'])$(`#${name}-view`).hidden=name!==view;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b.dataset.view===view);$('#global-error').textContent='';}
async function loadCustomers(){
  const version=++searchVersion;$('#list-error').textContent='';
  try{const b=await api(`/customers?q=${encodeURIComponent($('#search').value)}`);if(version!==searchVersion||!me)return;customers=b.items;$('#customer-count').textContent=customers.length;const box=$('#customer-items');box.replaceChildren();if(!customers.length){const empty=el('div',undefined,'empty');empty.append(el('h2','暂无匹配档案'),el('p','调整搜索条件，或新建客户开始服务。'));box.append(empty);}for(const c of customers){const button=el('button',undefined,'customer-row');button.type='button';button.classList.toggle('active',c.id===selected);button.setAttribute('aria-pressed',String(c.id===selected));const info=el('span');info.append(el('strong',c.name),el('small',c.contact_name?`${c.contact_name} · ${c.phone||'未留电话'}`:'客户编号 '+c.id.slice(0,8)));button.append(el('span',c.name.slice(0,1),'avatar'),info,el('span','›'));button.onclick=()=>openCustomer(c.id);box.append(button);}}
  catch(e){if(version===searchVersion)$('#list-error').textContent=e.message;}
}
async function openCustomer(id){
  selected=id;$('#global-error').textContent='';$('#detail').replaceChildren(el('p','正在读取档案…','muted'));
  try{
    const {customer:c,cycles,visits,guardians}=await api(`/customers/${id}`);
    if(selected!==id||!me)return;
    const detail=$('#detail');detail.replaceChildren();
    const top=el('div',undefined,'detail-top'),name=el('div');
    name.append(el('h2',c.name),el('p',`客户编号 ${c.id}`));
    top.append(el('span',c.name.slice(0,1),'avatar'),name);if(me.role!=='guardian')profilesPanel.renderActions(top,c);detail.append(top);
    const fields=el('dl',undefined,'detail-fields');
    for(const [k,v] of [['出生日期',c.birth_date||'未填写'],...(me.role==='guardian'?[]:[['主要联系人',c.contact_name||'未填写'],['主要联系电话',c.phone||'未填写'],['建档日期',c.created_at?.slice(0,10)||'—']])]){
      const div=el('div');div.append(el('dt',k),el('dd',v));fields.append(div);
    }
    detail.append(fields);
    if(me.role==='guardian'){
      detail.append(el('p','家庭练习仅展示明确发布给本人且当前仍有授权的内容。','muted'));familyPanel.renderCustomer(detail,id);
    }else{
      const overviewTarget=el('div',undefined,'customer-overview-area');detail.append(overviewTarget);timelinePanel.render(overviewTarget,id);
      const contactsTarget=el('div',undefined,'family-contacts-area');detail.append(contactsTarget);profilesPanel.renderContacts(contactsTarget,id);
      const documentsTarget=el('div',undefined,'documents-area');detail.append(documentsTarget);documentPanels.render(documentsTarget,id);
      const head=el('div',undefined,'cycle-heading');head.append(el('h2',`独立服务周期 · ${cycles.length}`));
      if(me.permissions.includes('cycles:create')){
        const button=el('button','＋ 新建周期');button.onclick=()=>{$('#cycle-form').reset();$('#cycle-error').textContent='';$('#cycle-dialog').showModal();};head.append(button);
      }
      detail.append(head);
      if(!cycles.length)detail.append(el('p','尚无服务周期。可以从服务目标创建一个草稿。','small muted'));
      for(const cycle of cycles){
        const card=el('article',undefined,'cycle-card'),h=el('h3',cycleNames[cycle.type]);card.dataset.type=cycle.type;card.dataset.cycleId=cycle.id;
        h.append(el('span',`草稿 · V${cycle.version}`,'pill'));card.append(h,el('p',cycle.goal),el('small',`创建于 ${cycle.created_at.slice(0,10)} · 独立周期`));cyclesPanel.renderActions(card,cycle);detail.append(card);
      }
      renderFamily(detail,guardians,id);
      renderVisits(detail,visits,cycles,id);
      retailPanel.renderCustomer(detail,id);
      specialtyPanel.renderCustomer(detail,id);referralPanel.renderCustomer(detail,id);contactPanel.renderCustomer(detail,id);longitudinalPanel.renderCustomer(detail,id);familyPanel.renderCustomer(detail,id);trainingPanel.renderCustomer(detail,id);entitlementsPanel.renderCustomer(detail,id);if(me.permissions.includes('scheduling:read'))detail.append(schedulingPanel.customerWidget({id,name:customers.find(c=>c.id===id)?.name||id}));
      tasksPanel.render(detail,id,cycles,visits);
    }
    await loadCustomers();
  }catch(e){if(selected===id)$('#detail').replaceChildren(el('p',e.message,'form-error'));}
}
async function loadAudit(){try{const b=await api('/audit');if(!me)return;$('#audit-items').replaceChildren();if(!b.items.length){const row=el('tr'),cell=el('td','暂无操作记录');cell.colSpan=4;row.append(cell);$('#audit-items').append(row);}for(const item of b.items){const row=el('tr');row.append(el('td',new Date(item.created_at).toLocaleString('zh-CN',{hour12:false})),el('td',actions[item.action]||item.action),el('td',item.actor_id),el('td',item.entity_id));$('#audit-items').append(row);}}catch(e){$('#global-error').textContent=e.message;}}
$('#login-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;$('#login-error').textContent='';try{await api('/auth/login',{method:'POST',data:Object.fromEntries(new FormData(form))});form.elements.password.value='';await boot();}catch(e){$('#login-error').textContent=e.message;}finally{button.disabled=false;}};
async function logout(){try{await api('/auth/logout',{method:'POST'});showLogin();}catch(e){$('#global-error').textContent=e.message;}}
$('#logout-mobile').onclick=$('#logout').onclick=logout;
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{switchView(button.dataset.view);if(button.dataset.view==='procurement')procurementPanel.load();if(button.dataset.view==='specialty')specialtyPanel.load();if(button.dataset.view==='referral')referralPanel.load();if(button.dataset.view==='contact')contactPanel.load();if(button.dataset.view==='longitudinal')longitudinalPanel.load();if(button.dataset.view==='family')familyPanel.load();if(button.dataset.view==='scheduling')schedulingPanel.load();if(button.dataset.view==='entitlements')entitlementsPanel.load();if(button.dataset.view==='training')trainingPanel.load();if(button.dataset.view==='parameters')parametersPanel.load();if(button.dataset.view==='refunds')refundsPanel.load();if(button.dataset.view==='phase')progressPanel.load();if(button.dataset.view==='audit')loadAudit();if(button.dataset.view==='demo')loadDemo();if(button.dataset.view==='organization')loadOrganization();if(button.dataset.view==='operations')operationsPanel.load();if(button.dataset.view==='tasks')tasksPanel.load();if(button.dataset.view==='retail')retailPanel.load();if(button.dataset.view==='dispatch')dispatchPanel.load();if(button.dataset.view==='aftercare')aftercarePanel.load();if(button.dataset.view==='fulfillment')fulfillmentPanel.load();if(button.dataset.view==='processing')processingPanel.load();if(button.dataset.view==='payments')paymentsPanel.load();if(button.dataset.view==='inventory')inventoryPanel.load();};
$('#refresh-audit').onclick=loadAudit;
let searchTimer;$('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadCustomers,200);};
$('#new-customer').onclick=()=>{$('#customer-form').reset();$('#customer-error').textContent='';$('#customer-dialog').showModal();};
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>button.closest('dialog').close();
function mutationForm(formId,dialogId,errorId,path,onSuccess,transform=value=>value){let pending;
  $(formId).onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),data=transform(Object.fromEntries(new FormData(form)),form),target=path();
    const fingerprint=JSON.stringify({target,data});if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};button.disabled=true;$(errorId).textContent='';
    try{const b=await api(target,{method:'POST',data,key:pending.key});pending=null;$(dialogId).close();await onSuccess(b);}catch(e){$(errorId).textContent=e.message;}finally{button.disabled=false;}
  };
}
mutationForm('#customer-form','#customer-dialog','#customer-error',()=>'/customers',async b=>{toast(b.duplicate_candidates.length?'档案已保存；发现同名或共用电话的档案，请核对身份。':'客户档案已保存');$('#search').value='';await openCustomer(b.customer.id);});
mutationForm('#cycle-form','#cycle-dialog','#cycle-error',()=>`/customers/${selected}/cycles`,async()=>{toast('服务周期草稿已保存');await openCustomer(selected);});
$('#customer-form').elements.birth_date.max=new Date().toISOString().slice(0,10);
let visitToClose;
function sectionHeader(title,action){
  const head=el('div',undefined,'section-heading');head.append(el('h2',title));if(action)head.append(action);return head;
}
function renderFamily(detail,guardians,id){
  let action;
  if(me.permissions.includes('guardians:manage')){
    action=el('button','管理关联');action.onclick=async()=>{
      action.disabled=true;
      try{
        const b=await api('/organization');if(selected!==id||!me)return;
        const options=b.items.filter(u=>u.role==='guardian'&&(u.active||guardians.some(g=>g.user_id===u.id)));
        if(!options.length){toast('本店暂无可关联的家长账号');return;}
        $('#guardian-form').reset();$('#guardian-error').textContent='';
        const select=$('#guardian-form select[name=user_id]');select.replaceChildren();
        for(const u of options){const o=el('option',u.display_name+(u.active?'':'（账号停用，可撤销关联）'));o.value=u.id;select.append(o);}
        $('#guardian-dialog').showModal();
      }catch(e){$('#global-error').textContent=e.message;}finally{action.disabled=false;}
    };
  }
  const familyHead=sectionHeader('家长查看授权',action);familyHead.classList.add('family-access-area');detail.append(familyHead);
  if(!guardians.length)detail.append(el('p','尚无家长账号关联。联系人电话不等于查看授权。','small muted'));
  for(const g of guardians){
    const item=el('div',undefined,'family-row'),text=el('div');
    text.append(el('strong',g.display_name),el('small',g.relationship||'关系尚未登记'));
    item.append(el('span',g.display_name.slice(0,1),'avatar'),text,el('span',g.active?'已授权':'已撤销',g.active?'badge mint':'badge neutral'));detail.append(item);
  }
}
function renderVisits(detail,visits,cycles,id){
  let action;
  if(me.permissions.includes('visits:create')){
    action=el('button','＋ 登记到店');action.onclick=()=>{
      $('#visit-form').reset();$('#visit-error').textContent='';const box=$('#visit-cycle-options');box.replaceChildren();
      if(!cycles.length)box.append(el('p','暂无周期，可先登记到店目的。','small muted'));
      for(const c of cycles){const label=el('label',undefined,'checkbox-option'),input=el('input');input.type='checkbox';input.name='cycle_ids';input.value=c.id;input.dataset.version=c.version;label.append(input,el('span',`${cycleNames[c.type]} · V${c.version} · ${c.goal}`));box.append(label);}
      $('#visit-dialog').showModal();
    };
  }
  detail.append(sectionHeader(`到店记录 · ${visits.length}`,action));
  if(!visits.length)detail.append(el('p','尚无到店记录。到店与服务周期分别管理。','small muted'));
  for(const v of visits){
    const item=el('article',undefined,'visit-card');item.dataset.visitId=v.id;const head=el('div',undefined,'visit-head');
    head.append(el('strong',v.purpose),el('span',v.status==='closed'?'本次已结束':'已登记',v.status==='closed'?'badge neutral':'badge sky'));
    item.append(head,el('p',`关联 ${v.cycle_ids.length} 个周期 · ${(v.cycle_refs||[]).map(r=>`${cycleNames[r.type]} · ${r.version?'V'+r.version:'旧版未记录'}`).join(' / ')||'仅登记到店目的'}`,'small muted'),el('small',new Date(v.created_at).toLocaleString('zh-CN',{hour12:false})));
    for(const ref of v.cycle_refs||[]){const snapshot=el('p',`${cycleNames[ref.type]} ${ref.version?'V'+ref.version+'：'+ref.goal:'：登记时需求版本未保存'}`,'visit-cycle-snapshot');item.append(snapshot);}
    if(v.status==='registered'&&me.permissions.includes('visits:close')){
      const close=el('button','结束本次到店');close.onclick=()=>{visitToClose=v.id;$('#close-visit-form').reset();$('#close-visit-error').textContent='';$('#close-visit-dialog').showModal();};item.append(close);
    }
    detail.append(item);
  }
}
const loadOrganization=()=>organizationPanel.load();
async function loadDemo(){
  $('#demo-scenarios').replaceChildren(el('p','正在读取演示案例…','muted'));
  try{
    const b=await api('/demo/scenarios');if(!me)return;const box=$('#demo-scenarios');box.replaceChildren();const summary=$('#demo-summary');summary.replaceChildren();
    for(const [type,label,tone] of [['followup','接待与长期随访','mint'],['training','评估与训练','violet'],['retail','配镜与交付','coral']]){
      const stat=el('article',undefined,`demo-stat ${tone}`);stat.append(el('span',label),el('strong',String(b.items.filter(s=>s.type===type).length)),el('small','虚构演示场景'));summary.append(stat);
    }
    if(!b.items.length){box.append(el('div','当前还没有演示案例。请在本地使用 npm run demo 追加示例资料；原账号和密码会保留。','empty'));return;}
    for(const s of b.items){
      const card=el('article',undefined,'card scenario-card');card.dataset.type=s.type;
      const top=el('div',undefined,'scenario-top');top.append(el('span',cycleNames[s.type],'badge '+({followup:'mint',training:'violet',retail:'coral'}[s.type])),el('small','虚构场景'));
      const name=el('div',undefined,'scenario-name');name.append(el('span',s.name.slice(0,1),'avatar'),el('h2',s.name));
      card.append(top,name,el('h3',s.stage),el('p',s.goal,'muted'));
      const steps=el('ol',undefined,'journey-steps');
      s.steps.forEach((step,i)=>{const li=el('li',step,i<s.index?'past':i===s.index?'current':'future');if(i===s.index)li.setAttribute('aria-current','step');steps.append(li);});card.append(steps);
      const next=el('div',undefined,'scenario-next');next.append(el('strong',`下一步 · ${s.owner}`),el('p',s.next));card.append(next);
      const events=el('details',undefined,'scenario-events');events.append(el('summary','查看演示衔接记录'));const list=el('ul');for(const event of s.events)list.append(el('li',event));events.append(list);card.append(events);
      const button=el('button','查看关联档案 →');button.onclick=()=>{switchView('customers');$('#search').value='';openCustomer(s.customer_id);$('#detail').scrollIntoView({behavior:'smooth',block:'start'});};card.append(button);box.append(card);
    }
  }catch(e){$('#demo-scenarios').replaceChildren(el('p',e.message,'form-error'));}
}
mutationForm('#guardian-form','#guardian-dialog','#guardian-error',()=>`/customers/${selected}/guardians`,async b=>{toast(b.active?'家长查看授权已保存':'家长查看授权已撤销');await openCustomer(selected);},data=>({...data,active:data.active==='true'}));
mutationForm('#visit-form','#visit-dialog','#visit-error',()=>`/customers/${selected}/visits`,async()=>{toast('本次到店已登记');await openCustomer(selected);},(data,form)=>({purpose:data.purpose,cycle_ids:new FormData(form).getAll('cycle_ids'),cycle_versions:[...form.querySelectorAll('input[name=cycle_ids]:checked')].map(x=>({cycle_id:x.value,version:Number(x.dataset.version)}))}));
mutationForm('#close-visit-form','#close-visit-dialog','#close-visit-error',()=>`/visits/${visitToClose}/close`,async()=>{toast('本次到店已结束，独立周期继续保留');await openCustomer(selected);});
$('#progress-refresh').onclick=()=>progressPanel.load();
boot();
