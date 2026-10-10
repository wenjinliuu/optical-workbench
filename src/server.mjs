import {createMoneyReviewHandler} from './money-review.mjs';
import {createStaffCoverHandler} from './staff-cover-api.mjs';
import {createStaffRecordsHandler} from './staff-records-api.mjs';
import {createStaffHandoverHandler} from './staff-handover.mjs';
import {reservedBatchReadHandler} from './inventory-reserved-batches.mjs';
import {createReservedHandler} from './inventory-reserved-api.mjs';
import {batchReadHandler} from './inventory-batches.mjs';
import {createCustodyHandler} from './inventory-custody-api.mjs';
import {createExtraReturnHandler} from './purchase-extra-returns-api.mjs';
import {createInventorySourcesHandler} from './inventory-sources.mjs';
import {createSupplierReturnHandler} from './supplier-returns-api.mjs';
import {createPurchaseQualityHandler} from './purchase-quality-api.mjs';
import {createReceivingHandler} from './purchase-receiving-api.mjs';
import {createProcurementHandler} from './procurement-api.mjs';
import {createSpecialtyContinuityHandler} from './specialty-continuity-api.mjs';
import {guardSpecialtyReplacementMutation} from './specialty-continuity-ledger.mjs';
import {createSpecialtyReviewHandler} from './specialty-review-api.mjs';
import {createSpecialtyCareHandler} from './specialty-care-api.mjs';
import {createSpecialtyTraceHandler} from './specialty-trace-api.mjs';
import {createSpecialtyHandler} from './specialty-api.mjs';
import {createReferralHandler} from './referral-api.mjs';
import {createContactHandler} from './contact-api.mjs';
import {createLongitudinalHandler} from './longitudinal-api.mjs';
import {createFamilyHandler} from './family-training-api.mjs';
import {createSchedulingHandler} from './scheduling-api.mjs';
import {createEntitlementsHandler} from './entitlements-api.mjs';
import {createTrainingHandler} from './training-api.mjs';
import {createParametersHandler} from './parameters.mjs';
import {createRefundsHandler} from './refunds.mjs';
import {createDispositionsHandler} from './aftercare-dispositions.mjs';
import {guardReplacementMutation} from './replacement-gates.mjs';
import {createReplacementsHandler} from './aftercare-replacements.mjs';
import {createAftercareWorkHandler} from './aftercare-work.mjs';
import {createDispatchHandler} from './dispatch.mjs';
import {createAftercareHandler} from './aftercare.mjs';
import {createFulfillmentHandler} from './fulfillment.mjs';
import {createProcessingHandler} from './processing.mjs';
import { createPaymentsHandler } from './payments.mjs';
import { createInventoryHandler } from './inventory.mjs';
import { createRetailHandler } from './retail.mjs';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase, transaction, hashPassword, verifyPassword } from './db.mjs';
import { demoScenarios, matchesDemoCustomer } from './demo-data.mjs';
import { createDocumentsHandler } from './documents.mjs';
import { createOrganizationHandler } from './organization.mjs';
import { createRuntime } from './runtime.mjs';
import { createProfilesHandler } from './profiles.mjs';
import { createTimelineHandler } from './timeline.mjs';
import { createCyclesHandler } from './cycles.mjs';
import { createTasksHandler } from './tasks.mjs';
import { createTaskEvidenceHandler } from './task-evidence.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const roles = {manager:['customers:read','customers:create','cycles:create','audit:read','organization:read','guardians:manage','visits:create','visits:close','demo:read'],reception:['customers:read','customers:create','cycles:create','visits:create','visits:close','demo:read'],professional:['customers:read','cycles:create','demo:read'],guardian:['customers:read']};
for(const role of ['manager','reception','professional'])roles[role].push('attachments:read','attachments:upload','attachments:revoke','documents:read','documents:write');
roles.manager.push('organization:manage');
roles.manager.push('operations:read');
for(const role of ['manager','reception','professional'])roles[role].push('progress:read','profiles:read','timeline:read','cycles:read','cycles:revise');
for(const role of ['manager','reception'])roles[role].push('customers:update','contacts:manage');
for(const role of ['manager','reception','professional'])roles[role].push('tasks:read','tasks:receive');
for(const role of ['manager','reception'])roles[role].push('tasks:assign');
for(const role of ['manager','reception','professional'])roles[role].push('retail:read');
for(const role of ['manager','reception'])roles[role].push('retail:write');
roles.manager.push('aftercare:approve','retail:catalog','inventory:manage');
for(const role of ['manager','reception','professional'])roles[role].push('inventory:read');
for(const role of ['manager','reception'])roles[role].push('inventory:reserve');
for(const role of ['manager','reception'])roles[role].push('payments:read','payments:write');
roles.manager.push('payments:void','refunds:approve');
for(const role of ['manager','reception','professional'])roles[role].push('processing:read','processing:execute');
for(const role of ['manager','reception'])roles[role].push('processing:manage');
roles.manager.push('processing:cancel');
for(const role of ['manager','reception','professional'])roles[role].push('parameters:read','parameters:write');
roles.professional.push('parameters:check','training:plan');
for(const role of ['manager','reception','professional'])roles[role].push('training:read','training:session');
for(const role of ['manager','professional'])roles[role].push('training:catalog');
for(const role of ['manager','reception','professional'])roles[role].push('dispatch:read','aftercare:read','aftercare:execute');
for(const role of ['manager','reception'])roles[role].push('dispatch:write','aftercare:manage');
for(const role of ['manager','reception','professional'])roles[role].push('fulfillment:read','fulfillment:execute');
for(const role of ['manager','professional'])roles[role].push('fulfillment:check');
for(const role of ['manager','reception'])roles[role].push('fulfillment:assign','fulfillment:deliver');
for(const role of ['manager','reception','professional'])roles[role].push('entitlements:summary');
for(const role of ['manager','reception'])roles[role].push('entitlements:read','entitlements:record');
roles.manager.push('entitlements:catalog','entitlements:reverse');
for(const role of ['manager','reception','professional'])roles[role].push('scheduling:read');
for(const role of ['manager','reception'])roles[role].push('scheduling:manage');
roles.manager.push('scheduling:catalog');
for(const role of ['manager','reception','professional','guardian'])roles[role].push('family:read');
roles.guardian.push('family:report');
for(const role of ['manager','reception','professional'])roles[role].push('family:transcribe');
for(const role of ['manager','professional'])roles[role].push('family:manage');
roles.professional.push('family:review');
for(const role of ['manager','reception','professional'])roles[role].push('longitudinal:read');
for(const role of ['manager','reception','professional'])roles[role].push('specialty:read','specialty:write','referrals:read','referrals:write','contacts:read','contacts:write');
roles.professional.push('longitudinal:professional','longitudinal:manage');
roles.manager.push('longitudinal:manage');
for(const role of ['manager','reception','professional'])roles[role].push('procurement:read','receiving:read');
for(const role of ['manager','reception'])roles[role].push('receiving:write');
for(const role of ['manager','professional'])roles[role].push('receiving:quality');
roles.manager.push('receiving:manage');
for(const role of ['manager','reception'])roles[role].push('procurement:write');
roles.manager.push('procurement:catalog','procurement:approve');
const dummyHash = hashPassword(randomBytes(24).toString('hex'));
class HttpError extends Error { constructor(status, code, message) { super(message); this.status=status; this.code=code; } }
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const need = (user, action) => { if (!roles[user.role]?.includes(action)) fail(403,'FORBIDDEN','当前岗位没有此操作权限'); };
function field(value, name, max=120, required=false) {
  if (value === undefined || value === null || value === '') { if(required) fail(422,'VALIDATION',`${name}不能为空`); return null; }
  if(typeof value !== 'string' || !value.trim() || value.length > max) fail(422,'VALIDATION',`${name}格式不正确`);
  return value.trim();
}
function date(value) {
  const v=field(value,'出生日期',10); if(!v) return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0,10)!==v || v>new Date().toISOString().slice(0,10)) fail(422,'VALIDATION','出生日期必须为有效的过去日期');
  return v;
}
async function body(req,limit=16384) {
  if(!req.headers['content-type']?.startsWith('application/json')) fail(415,'CONTENT_TYPE','请使用 JSON 请求');
  let data=''; for await(const chunk of req) { data+=chunk; if(Buffer.byteLength(data)>limit) fail(413,'TOO_LARGE','请求内容过大'); }
  try { const value=JSON.parse(data); if(!value || Array.isArray(value) || typeof value!=='object') throw Error(); return value; } catch { fail(400,'BAD_JSON','请求格式不正确'); }
}
export function createApp({databasePath='data/workbench.sqlite', mode='development',logger=event=>console.error(JSON.stringify(event))}={}) {
  if(mode !== 'development' && mode !== 'test') throw new Error('Production is blocked pending architecture and identity review.');
  const db=openDatabase(databasePath), attempts=new Map();
  const runtime=createRuntime({logger});
  function customer(user,id) {
    need(user,'customers:read');
    const row=db.prepare('SELECT * FROM customers WHERE id=?').get(id);
    const allowed=row && (user.role==='guardian' ? db.prepare('SELECT 1 FROM guardian_links WHERE user_id=? AND customer_id=? AND active=1').get(user.id,id) : row.store_id===user.store_id);
    if(!allowed) fail(404,'NOT_FOUND','档案不存在或不在授权范围内'); return row;
  }
  function visible(user,row) {
    const {created_by, ...safe}=row;
    if(user.role==='guardian') return {id:row.id,name:row.name,birth_date:row.birth_date};
    return {...safe,revision:profiles.revision(row.id)};
  }
  function audit(user,action,id,after,before=null) {
    db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),user.store_id,user.id,action,id,before===null?null:JSON.stringify(before),JSON.stringify(after),new Date().toISOString());
  }
  function visitsFor(id) {
    return db.prepare('SELECT id,purpose,status,created_at,closed_at FROM visits WHERE customer_id=? ORDER BY created_at DESC,id LIMIT 100').all(id).map(v=>({...v,cycle_ids:db.prepare('SELECT cycle_id FROM visit_cycles WHERE visit_id=? ORDER BY cycle_id').all(v.id).map(x=>x.cycle_id),cycle_refs:cycleRecords.refs(v.id)}));
  }
  function localGuardian(user,id) {
    return db.prepare("SELECT id,display_name,active FROM users u WHERE u.id=? AND u.role='guardian' AND (u.store_id=? OR EXISTS(SELECT 1 FROM guardian_links g JOIN customers c ON c.id=g.customer_id WHERE g.user_id=u.id AND c.store_id=?))").get(id,user.store_id,user.store_id);
  }
  function mutation(req,user,operation,input,fn) {
    const key=req.headers['idempotency-key'];
    if(typeof key!=='string'||!/^[\w-]{8,100}$/.test(key)) fail(400,'IDEMPOTENCY_REQUIRED','提交需要有效的防重复标识');
    return transaction(db,()=>{
      const live=db.prepare('SELECT u.role,u.store_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND u.active=1').get(user.token_hash,user.id,Date.now());
      if(!live||live.role!==user.role||live.store_id!==user.store_id)fail(401,'UNAUTHENTICATED','账号权限或登录会话已变更，请重新登录');
      guardSpecialtyReplacementMutation(db,operation,input,fail);
      const fingerprint=sha(JSON.stringify(input));
      const prior=db.prepare('SELECT * FROM idempotency WHERE actor_id=? AND operation=? AND request_key=?').get(user.id,operation,key);
      if(prior) { if(prior.request_hash!==fingerprint) fail(409,'IDEMPOTENCY_CONFLICT','同一提交标识不能用于不同内容'); return JSON.parse(prior.response_json); }
      guardReplacementMutation(db,operation,input,fail);const result=fn(); db.prepare('INSERT INTO idempotency VALUES (?,?,?,?,?)').run(user.id,operation,key,fingerprint,JSON.stringify(result)); return result;
    });
  }
  const documents=createDocumentsHandler(db,{need,customer,field,fail,body,mutation,audit});
  const organization=createOrganizationHandler(db,{need,field,fail,body,mutation,audit});
  const profiles=createProfilesHandler(db,{need,customer,visible,field,date,fail,body,mutation,audit});
  const cycleRecords=createCyclesHandler(db,{need,customer,field,fail,body,mutation,audit});
  const tasks=createTasksHandler(db,{need,customer,field,fail,body,mutation,audit});
  const taskEvidence=createTaskEvidenceHandler(db,{need,customer,field,fail,body,mutation,audit});
  const dispatch=createDispatchHandler(db,{need,customer,field,fail,body,mutation,audit});
  const batches=batchReadHandler(db,{need,fail});
  const moneyReview=createMoneyReviewHandler(db,{need,fail});
  const staffCover=createStaffCoverHandler(db,{need,field,fail,body,mutation,audit});
  const staffRecords=createStaffRecordsHandler(db,{need,field,fail,body,mutation,audit});
  const staffHandover=createStaffHandoverHandler(db,{need,fail});
  const reservedBatches=reservedBatchReadHandler(db,{need,fail});
  const reserved=createReservedHandler(db,{need,field,fail,body,mutation,audit});
  const custody=createCustodyHandler(db,{need,field,fail,body,mutation,audit});
  const extraReturns=createExtraReturnHandler(db,{need,field,fail,body,mutation,audit});
  const inventorySources=createInventorySourcesHandler(db,{need,fail});
  const supplierReturns=createSupplierReturnHandler(db,{need,field,fail,body,mutation,audit});
  const purchaseQuality=createPurchaseQualityHandler(db,{need,field,fail,body,mutation,audit});
  const receiving=createReceivingHandler(db,{need,field,fail,body,mutation,audit});
  const procurement=createProcurementHandler(db,{need,field,fail,body,mutation,audit});
  const specialtyContinuity=createSpecialtyContinuityHandler(db,{need,customer,field,fail,body,mutation,audit});
  const specialtyReview=createSpecialtyReviewHandler(db,{need,customer,field,fail,body,mutation,audit});
  const specialtyCare=createSpecialtyCareHandler(db,{need,customer,field,fail,body,mutation,audit});
  const specialtyTrace=createSpecialtyTraceHandler(db,{need,customer,field,fail,body,mutation,audit});
  const specialty=createSpecialtyHandler(db,{need,customer,field,fail,body,mutation,audit});
  const referrals=createReferralHandler(db,{need,customer,field,fail,body,mutation,audit});
  const contacts=createContactHandler(db,{need,customer,field,fail,body,mutation,audit});
  const longitudinal=createLongitudinalHandler(db,{need,customer,field,fail,body,mutation,audit});
  const familyTraining=createFamilyHandler(db,{need,customer,field,fail,body,mutation,audit});
  const scheduling=createSchedulingHandler(db,{need,customer,field,fail,body,mutation,audit});
  const entitlements=createEntitlementsHandler(db,{need,customer,field,fail,body,mutation,audit});
  const training=createTrainingHandler(db,{need,customer,field,fail,body,mutation,audit});
  const parameters=createParametersHandler(db,{need,customer,field,fail,body,mutation,audit});
  const refunds=createRefundsHandler(db,{need,customer,field,fail,body,mutation,audit});
  const dispositions=createDispositionsHandler(db,{need,customer,field,fail,body,mutation,audit});
  const replacements=createReplacementsHandler(db,{need,customer,field,fail,body,mutation,audit});
  const aftercareWork=createAftercareWorkHandler(db,{need,customer,field,fail,body,mutation,audit});
  const aftercare=createAftercareHandler(db,{need,customer,field,fail,body,mutation,audit});
  const fulfillment=createFulfillmentHandler(db,{need,customer,field,fail,body,mutation,audit});
  const processing=createProcessingHandler(db,{need,customer,field,fail,body,mutation,audit});
  const payments=createPaymentsHandler(db,{need,customer,field,fail,body,mutation,audit});
  const inventory=createInventoryHandler(db,{need,customer,field,fail,body,mutation,audit});
  const retail=createRetailHandler(db,{need,customer,field,fail,body,mutation,audit});
  const timeline=createTimelineHandler(db,{need,customer,fail});
  const server=createServer(async(req,res)=>{
    const request=runtime.begin(req,res);
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,'http://localhost'), path=url.pathname;
      if(!path.startsWith('/api/')) {
        if(req.method!=='GET') fail(405,'METHOD','不支持此请求');
        const assets={'/money-review.js':['money-review.js','text/javascript'],'/staff-cover.js':['staff-cover.js','text/javascript'],'/staff-records.js':['staff-records.js','text/javascript'],'/staff-handover.js':['staff-handover.js','text/javascript'],'/inventory-reserved.js':['inventory-reserved.js','text/javascript'],'/inventory-batches.js':['inventory-batches.js','text/javascript'],'/inventory-custody.js':['inventory-custody.js','text/javascript'],'/purchase-extra-returns.js':['purchase-extra-returns.js','text/javascript'],'/inventory-sources.js':['inventory-sources.js','text/javascript'],'/supplier-returns.js':['supplier-returns.js','text/javascript'],'/purchase-quality.js':['purchase-quality.js','text/javascript'],'/purchase-receiving.js':['purchase-receiving.js','text/javascript'],'/procurement.js':['procurement.js','text/javascript'],'/specialty-continuity.js':['specialty-continuity.js','text/javascript'],'/specialty-review.js':['specialty-review.js','text/javascript'],'/specialty-care.js':['specialty-care.js','text/javascript'],'/specialty-trace.js':['specialty-trace.js','text/javascript'],'/specialty.js':['specialty.js','text/javascript'],'/referrals.js':['referrals.js','text/javascript'],'/contact.js':['contact.js','text/javascript'],'/longitudinal.js':['longitudinal.js','text/javascript'],'/family-training.js':['family-training.js','text/javascript'],'/scheduling.js':['scheduling.js','text/javascript'],'/entitlements.js':['entitlements.js','text/javascript'],'/training.js':['training.js','text/javascript'],'/parameters.js':['parameters.js','text/javascript'],'/refunds.js':['refunds.js','text/javascript'],'/aftercare-dispositions.js':['aftercare-dispositions.js','text/javascript'],'/aftercare-replacements.js':['aftercare-replacements.js','text/javascript'],'/aftercare-work.js':['aftercare-work.js','text/javascript'],'/progress.js':['progress.js','text/javascript'],'/aftercare.js':['aftercare.js','text/javascript'],'/dispatch.js':['dispatch.js','text/javascript'],'/fulfillment.js':['fulfillment.js','text/javascript'],'/processing.js':['processing.js','text/javascript'],'/payments.js':['payments.js','text/javascript'],'/inventory.js':['inventory.js','text/javascript'],'/retail.js':['retail.js','text/javascript'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/documents.js':['documents.js','text/javascript'],'/organization.js':['organization.js','text/javascript'],'/operations.js':['operations.js','text/javascript'],'/profiles.js':['profiles.js','text/javascript'],'/timeline.js':['timeline.js','text/javascript'],'/cycles.js':['cycles.js','text/javascript'],'/tasks.js':['tasks.js','text/javascript'],'/task-evidence.js':['task-evidence.js','text/javascript'],'/task-links.js':['task-links.js','text/javascript'],'/task-chains.js':['task-chains.js','text/javascript'],'/styles.css':['styles.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml']};
        if(!assets[path]) fail(404,'NOT_FOUND','页面不存在');
        const [file,type]=assets[path];res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});res.end(readFileSync(new URL(`../public/${file}`,import.meta.url)));return;
      }
      if(path==='/api/health' && req.method==='GET') { db.prepare('SELECT 1').get();return json(200,{status:'ok',mode,schema:db.prepare('SELECT count(*) AS count FROM schema_migrations').get().count}); }
      if(path==='/api/auth/login' && req.method==='POST') {
        const input=await body(req), username=field(input.username,'账号',80,true), password=field(input.password,'密码',200,true);
        const now=Date.now(), key=req.socket.remoteAddress;
        const recent=(attempts.get(key)||[]).filter(t=>t>now-60000);attempts.set(key,recent);
        if(recent.length>=10) fail(429,'RATE_LIMIT','登录尝试过多，请一分钟后重试');recent.push(now);
        const user=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);
        if(!verifyPassword(password,user?.password_hash||dummyHash)||!user) fail(401,'INVALID_CREDENTIALS','账号或密码不正确');
        const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
        transaction(db,()=>{
          db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
          db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(sha(token),user.id,csrf,now+8*3600000);
          audit(user,'session.login',user.id,{role:user.role});
        });
        res.setHeader('Set-Cookie',`ow_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        return json(200,{ok:true});
      }
      const token=/\bow_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
      const session=token && db.prepare('SELECT s.token_hash,s.csrf,s.expires_at,u.*,COALESCE(sec.must_change_password,0) AS must_change_password FROM sessions s JOIN users u ON s.user_id=u.id LEFT JOIN user_security sec ON sec.user_id=u.id WHERE token_hash=? AND expires_at>? AND u.active=1').get(sha(token),Date.now());
      if(!session) fail(401,'UNAUTHENTICATED','请登录后继续');
      const user=session;
      request.setStore(user.store_id);
      if(req.method!=='GET' && req.headers['x-csrf-token']!==session.csrf) fail(403,'CSRF','会话校验失败，请重新加载');
      if(path==='/api/me' && req.method==='GET') return json(200,{id:user.id,name:user.display_name,role:user.role,store:user.store_id?db.prepare('SELECT * FROM stores WHERE id=?').get(user.store_id):null,permissions:roles[user.role],csrf:session.csrf,must_change_password:Boolean(user.must_change_password)});
      if(path==='/api/auth/logout' && req.method==='POST') { transaction(db,()=>{db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));audit(user,'session.logout',user.id,{});});res.setHeader('Set-Cookie','ow_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(200,{ok:true}); }
      if(user.must_change_password&&path!=='/api/auth/password')fail(403,'PASSWORD_CHANGE_REQUIRED','请先修改初始或重置密码');
      if(path==='/api/progress'){need(user,'progress:read');if(req.method!=='GET')fail(405,'METHOD','项目进度只读');return json(200,JSON.parse(readFileSync(new URL('../docs/progress.json',import.meta.url),'utf8')));}
      if(path==='/api/operations'&&req.method==='GET'){
        need(user,'operations:read');if(!user.store_id)fail(403,'FORBIDDEN','账号未分配门店');db.prepare('SELECT 1').get();
        return json(200,{database:'ok',mode,schema:db.prepare('SELECT count(*) n FROM schema_migrations').get().n,...runtime.snapshot(user.store_id)});
      }
      if(await organization(req,res,path,user,json))return;
      if(await dispatch(req,path,url,user,json))return;
      if(await inventorySources(req,path,url,user,json))return;
      if(await supplierReturns(req,path,url,user,json))return;
      if(await batches(req,path,url,user,json))return;
      if(await moneyReview(req,path,url,user,json))return;
      if(await staffCover(req,path,url,user,json))return;
      if(await staffRecords(req,path,url,user,json))return;
      if(await staffHandover(req,path,url,user,json))return;
      if(await reservedBatches(req,path,url,user,json))return;
      if(await reserved(req,path,url,user,json))return;
      if(await custody(req,path,url,user,json))return;
      if(await extraReturns(req,path,url,user,json))return;
      if(await purchaseQuality(req,path,url,user,json))return;
      if(await receiving(req,path,url,user,json))return;
      if(await procurement(req,path,url,user,json))return;
      if(await specialtyContinuity(req,path,url,user,json)||await specialtyReview(req,path,url,user,json))return;
      if(await specialtyCare(req,path,url,user,json))return;
      if(await specialtyTrace(req,path,url,user,json))return;
      if(await specialty(req,path,url,user,json))return;
      if(await referrals(req,path,url,user,json))return;
      if(await contacts(req,path,url,user,json))return;
      if(await longitudinal(req,path,url,user,json))return;
      if(await familyTraining(req,path,url,user,json))return;
      if(await scheduling(req,path,url,user,json))return;
      if(await entitlements(req,path,url,user,json))return;
      if(await training(req,path,url,user,json))return;
      if(await parameters(req,path,url,user,json))return;
      if(await refunds(req,path,url,user,json))return;
      if(await dispositions(req,path,url,user,json))return;
      if(await replacements(req,path,url,user,json))return;
      if(await aftercareWork(req,path,url,user,json))return;
      if(await aftercare(req,path,url,user,json))return;
      if(await fulfillment(req,path,url,user,json))return;
      if(await processing(req,path,url,user,json))return;
      if(await payments(req,path,url,user,json))return;
      if(await inventory(req,path,url,user,json))return;
      if(await retail(req,path,url,user,json))return;
      if(await documents(req,res,path,user,json))return;
      if(await cycleRecords.handle(req,path,user,json))return;
      if(await taskEvidence(req,path,url,user,json))return;
      if(await tasks(req,path,url,user,json))return;
      if(timeline(req,path,url,user,json))return;
      if(await profiles.handle(req,res,path,user,json))return;
      if(path==='/api/demo/scenarios' && req.method==='GET') {
        need(user,'demo:read');
        const items=demoScenarios.flatMap(s=>{const c=db.prepare('SELECT * FROM customers WHERE id=?').get(s.customer_id);return c?.store_id===user.store_id&&matchesDemoCustomer(db,c,s)?[{...s,name:c.name}]:[];});
        return json(200,{items,source:'synthetic',snapshot_only:true});
      }
      if(path==='/api/customers' && req.method==='GET') {
        need(user,'customers:read');const q=(url.searchParams.get('q')||'').slice(0,100);
        const scope=user.role==='guardian' ? 'EXISTS(SELECT 1 FROM guardian_links g WHERE g.customer_id=c.id AND g.user_id=? AND g.active=1)' : 'c.store_id=?';
        const identifier=user.role==='guardian'?user.id:user.store_id;
        const search=user.role==='guardian' ? 'c.name' : "c.name || ' ' || COALESCE(c.contact_name,'') || ' ' || COALESCE(c.phone,'') || ' ' || c.id";
        const contactSearch=user.role==='guardian'?'':" OR EXISTS(SELECT 1 FROM family_contacts f WHERE f.customer_id=c.id AND f.active=1 AND instr(f.name || ' ' || COALESCE(f.phone,''),?)>0)";
        const rows=db.prepare(`SELECT c.* FROM customers c WHERE ${scope} AND (instr(${search},?)>0${contactSearch}) ORDER BY c.created_at DESC,c.id LIMIT 100`).all(...(user.role==='guardian'?[identifier,q]:[identifier,q,q]));
        return json(200,{items:rows.map(r=>visible(user,r)),limit:100});
      }
      if(path==='/api/customers' && req.method==='POST') {
        need(user,'customers:create');const b=await body(req);if(!user.store_id) fail(403,'FORBIDDEN','账号未分配门店');
        const input={name:field(b.name,'姓名',80,true),birth_date:date(b.birth_date),contact_name:field(b.contact_name,'联系人',80),phone:field(b.phone,'电话',32)};
        if(input.phone&&!/^[+\d ()-]{5,32}$/.test(input.phone)) fail(422,'VALIDATION','电话格式不正确');
        const result=mutation(req,user,'customers.create',input,()=>{
          const row={id:randomUUID(),store_id:user.store_id,...input,created_at:new Date().toISOString(),created_by:user.id};
          db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(row));audit(user,'customer.create',row.id,row);
          return {customer:visible(user,row),duplicate_candidates:db.prepare('SELECT id,name FROM customers WHERE store_id=? AND id<>? AND (name=? OR (? IS NOT NULL AND phone=?)) LIMIT 20').all(user.store_id,row.id,row.name,row.phone,row.phone)};
        });return json(201,result);
      }
      const match=/^\/api\/customers\/([\w-]+)(\/(?:cycles|guardians|visits))?$/.exec(path);
      if(match) {
        const row=customer(user,match[1]);
        if(req.method==='GET' && !match[2]) return json(200,{customer:visible(user,row),cycles:user.role==='guardian'?[]:db.prepare('SELECT id,type,goal,status,created_at FROM service_cycles WHERE customer_id=? ORDER BY created_at DESC').all(row.id).map(cycleRecords.visible),visits:user.role==='guardian'?[]:visitsFor(row.id),guardians:user.role==='guardian'?[]:db.prepare('SELECT g.user_id,u.display_name,g.relationship,g.active FROM guardian_links g JOIN users u ON u.id=g.user_id WHERE customer_id=? ORDER BY g.active DESC,u.display_name').all(row.id)});
        if(req.method==='POST' && match[2]==='/cycles') {
          need(user,'cycles:create');const b=await body(req), input={type:field(b.type,'周期类型',20,true),goal:field(b.goal,'服务目标',300,true)};
          if(!['followup','training','retail'].includes(input.type)) fail(422,'VALIDATION','周期类型不正确');
          return json(201,mutation(req,user,`cycles.create:${row.id}`,input,()=>{
            const cycle={id:randomUUID(),customer_id:row.id,...input,status:'draft',created_at:new Date().toISOString(),created_by:user.id};
            db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run(...Object.values(cycle));audit(user,'cycle.create',cycle.id,cycle);return {cycle:cycleRecords.visible(cycle)};
          }));
        }
        if(req.method==='POST' && match[2]==='/guardians') {
          need(user,'guardians:manage');const b=await body(req);
          const input={user_id:field(b.user_id,'家长账号',100,true),relationship:field(b.relationship,'关系',40,true),active:b.active,reason:field(b.reason,'授权或撤销依据',300,true)};
          if(typeof input.active!=='boolean')fail(422,'VALIDATION','授权状态必须为明确的是或否');
          return json(200,mutation(req,user,`guardians.update:${row.id}`,input,()=>{
            const guardian=localGuardian(user,input.user_id);if(!guardian||(!guardian.active&&input.active))fail(404,'NOT_FOUND','家长账号不存在、已停用或不在本店范围内');
            const before=db.prepare('SELECT * FROM guardian_links WHERE user_id=? AND customer_id=?').get(input.user_id,row.id)||null;
            if(!input.active&&!before)fail(409,'NO_RELATIONSHIP','没有可撤销的关联');
            const now=new Date().toISOString();
            db.prepare('INSERT INTO guardian_links (user_id,customer_id,active,relationship,updated_at,updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,customer_id) DO UPDATE SET active=excluded.active,relationship=excluded.relationship,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(input.user_id,row.id,Number(input.active),input.relationship,now,user.id);
            audit(user,input.active?'guardian.authorize':'guardian.revoke',row.id,{...input,customer_id:row.id},before);
            return {user_id:input.user_id,customer_id:row.id,active:input.active,relationship:input.relationship};
          }));
        }
        if(req.method==='POST' && match[2]==='/visits') {
          need(user,'visits:create');const b=await body(req),input={purpose:field(b.purpose,'到店目的',300,true),cycle_ids:b.cycle_ids??[],cycle_versions:b.cycle_versions??null};
          if(!Array.isArray(input.cycle_ids)||input.cycle_ids.length>20||input.cycle_ids.some(id=>typeof id!=='string')||new Set(input.cycle_ids).size!==input.cycle_ids.length)fail(422,'VALIDATION','服务周期列表不正确');
          if(input.cycle_versions!==null&&(!Array.isArray(input.cycle_versions)||input.cycle_versions.length!==input.cycle_ids.length||new Set(input.cycle_versions.map(v=>v?.cycle_id)).size!==input.cycle_ids.length||input.cycle_versions.some(v=>!v||!input.cycle_ids.includes(v.cycle_id)||!Number.isSafeInteger(v.version)||v.version<1)))fail(422,'VALIDATION','周期版本必须与所选周期对应');
          if(input.cycle_versions)input.cycle_versions=input.cycle_versions.map(({cycle_id,version})=>({cycle_id,version}));
          if(input.cycle_versions)input.cycle_versions.sort((a,b)=>a.cycle_id.localeCompare(b.cycle_id));
          input.cycle_ids.sort();
          return json(201,mutation(req,user,`visits.create:${row.id}`,input,()=>{
            for(const id of input.cycle_ids)if(!db.prepare('SELECT 1 FROM service_cycles WHERE id=? AND customer_id=?').get(id,row.id))fail(422,'INVALID_CYCLE','只能关联当前客户的服务周期');
            for(const expected of input.cycle_versions||[])if(cycleRecords.latest(expected.cycle_id).version!==expected.version)fail(409,'CYCLE_CONFLICT','所选周期需求已修订，请刷新档案后重新登记');
            const visit={id:randomUUID(),customer_id:row.id,store_id:row.store_id,purpose:input.purpose,status:'registered',created_at:new Date().toISOString(),closed_at:null,created_by:user.id};
            db.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(visit));
            for(const id of input.cycle_ids)db.prepare('INSERT INTO visit_cycles VALUES (?,?,?)').run(visit.id,id,row.id);
            audit(user,'visit.register',visit.id,{...visit,cycle_ids:input.cycle_ids});return {visit:{...visit,cycle_ids:input.cycle_ids,cycle_refs:cycleRecords.refs(visit.id)}};
          }));
        }
      }
      const close=/^\/api\/visits\/([\w-]+)\/close$/.exec(path);
      if(close&&req.method==='POST'){
        need(user,'visits:close');const v=db.prepare('SELECT * FROM visits WHERE id=?').get(close[1]);if(!v)fail(404,'NOT_FOUND','到店记录不存在');customer(user,v.customer_id);
        const b=await body(req),input={reason:field(b.reason,'结束说明',300,true)};
        return json(200,mutation(req,user,`visits.close:${v.id}`,input,()=>{
          const before=db.prepare('SELECT * FROM visits WHERE id=?').get(v.id);if(before.status==='closed')fail(409,'ALREADY_CLOSED','本次到店已经结束');
          const closed_at=new Date().toISOString();db.prepare("UPDATE visits SET status='closed',closed_at=? WHERE id=?").run(closed_at,v.id);
          audit(user,'visit.close',v.id,{...before,status:'closed',closed_at,reason:input.reason},before);return {visit:{...before,status:'closed',closed_at}};
        }));
      }
      if(path==='/api/audit' && req.method==='GET') {need(user,'audit:read');return json(200,{items:db.prepare('SELECT id,actor_id,action,entity_id,created_at FROM audit_events WHERE store_id=? ORDER BY rowid DESC LIMIT 100').all(user.store_id)});}
      fail(404,'NOT_FOUND','接口不存在');
    } catch(error) { const code=error.status?error.code:'INTERNAL';request.setError(code);json(error.status||500,{error:{code,message:error.status?error.message:'保存失败，请稍后重试'},request_id:request.request_id}); }
  });
  server.on('close',()=>db.close());
  return {server,db};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const {server}=createApp({databasePath:process.env.DATABASE_PATH||'data/workbench.sqlite',mode:process.env.NODE_ENV||'development'});
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000);
  server.listen(port,host,()=>console.log(`Optical Workbench development: http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close());
}
