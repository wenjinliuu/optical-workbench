import {randomUUID,createHash} from 'node:crypto';
import {previewScreeningRows} from './screening-import.mjs';
import {canonicalTime} from './staff-records.mjs';

export const screeningRowLinkTables=['screening_row_link_versions'];
// The same pure parser is used by API, native SQLite insertion guards and recovery.
export function screeningRowSnapshot(csv,row,at){
 const r=previewScreeningRows(csv,[],{today:at.slice(0,10)}).rows[row-1];
 return r?JSON.stringify({row:r.row,line:r.line,raw_cells:r.raw_cells,values:r.values,errors:r.errors}):null;
}
export function registerScreeningRowFunctions(db){db.function('screening_csv_row',{deterministic:true},(csv,row,at)=>screeningRowSnapshot(csv,row,at));}
export function screeningRowLinksSource(db,batchVersion,{excludeLink=null}={}){return createHash('sha256').update(JSON.stringify(db.prepare('SELECT id,sequence FROM screening_row_link_versions WHERE batch_version_id=? AND id IS NOT ? ORDER BY sequence').all(batchVersion,excludeLink))).digest('hex');}
export function screeningRowLinkCurrent(db,batchVersion,row){return db.prepare('SELECT * FROM screening_row_link_current WHERE batch_version_id=? AND row_number=?').get(batchVersion,row)||null;}
export function screeningRowLinkProjection(db,v){
 if(!v)return null;
 const profile=db.prepare('SELECT customer_id,name,birth_date,contact_name,phone,version FROM customer_profile_versions WHERE customer_id=? AND version=?').get(v.customer_id,v.customer_version);
 if(!profile)throw Error('原关联客户资料版本未找到');
 return {...v,customer_profile:profile,row:JSON.parse(v.row_snapshot_json),identity_verification:'not_established',clinical_consent:'not_established',report_permission:'not_established'};
}
export function appendScreeningRowLink(db,batch,row,input,actor,at=new Date().toISOString(),id=randomUUID()){
 const old=screeningRowLinkCurrent(db,batch.id,row),p=db.prepare('SELECT * FROM screening_project_current WHERE root_id=?').get(batch.project_id);
 const v={id,store_id:batch.store_id,project_id:batch.project_id,batch_id:batch.root_id,batch_version_id:batch.id,row_number:row,row_snapshot_json:screeningRowSnapshot(batch.csv_text,row,batch.created_at),revision:(old?.revision||0)+1,sequence:db.prepare('SELECT coalesce(max(sequence),0)+1 n FROM screening_row_link_versions WHERE store_id=?').get(batch.store_id).n,action:input.action,customer_id:input.action==='withdraw'?old?.customer_id:input.customer_id,customer_version:input.action==='withdraw'?old?.customer_version:input.customer_version,project_version_id:p.id,project_sequence:db.prepare('SELECT max(sequence) n FROM screening_project_versions WHERE store_id=?').get(batch.store_id).n,batch_sequence:db.prepare('SELECT max(sequence) n FROM screening_batch_versions WHERE store_id=?').get(batch.store_id).n,customer_profile_prefix:db.prepare('SELECT coalesce(max(rowid),0) n FROM customer_profile_versions').get().n,record_reason:input.record_reason,created_at:at,created_by:actor,actor_role:db.prepare('SELECT role FROM users WHERE id=?').get(actor)?.role};
 db.prepare('INSERT INTO screening_row_link_versions('+Object.keys(v).join(',')+') VALUES('+Object.keys(v).map(()=>'?').join(',')+')').run(...Object.values(v));return screeningRowLinkProjection(db,v);
}
export function verifyScreeningRowLinks(db){
 const fail=m=>{throw Error('筛查人工关联恢复核对失败：'+m);},current=new Map(),seqs=new Map(),times=new Map();
 for(const v of db.prepare('SELECT * FROM screening_row_link_versions ORDER BY rowid').all()){
  const key=JSON.stringify([v.batch_version_id,v.row_number]),old=current.get(key),b=db.prepare('SELECT * FROM screening_batch_versions WHERE id=?').get(v.batch_version_id),p=db.prepare('SELECT * FROM screening_project_versions WHERE id=?').get(v.project_version_id),profile=db.prepare('SELECT rowid,* FROM customer_profile_versions WHERE customer_id=? AND version=?').get(v.customer_id,v.customer_version),customer=db.prepare('SELECT store_id FROM customers WHERE id=?').get(v.customer_id);
  if(!b||b.root_id!==v.batch_id||b.store_id!==v.store_id||b.project_id!==v.project_id||!p||p.root_id!==v.project_id||p.store_id!==v.store_id||!profile||customer?.store_id!==v.store_id||!Number.isSafeInteger(v.row_number)||v.row_number<1||v.row_number>500||!['link','withdraw'].includes(v.action)||v.revision!==(old?.revision||0)+1||v.sequence!==(seqs.get(v.store_id)||0)+1||!canonicalTime(v.created_at)||v.created_at<(times.get(v.store_id)||'')||b.created_at>v.created_at||p.created_at>v.created_at||profile.created_at>v.created_at||!db.prepare('SELECT 1 FROM users WHERE id=?').get(v.created_by)||!['manager','reception','professional'].includes(v.actor_role)||v.actor_role!=='manager'&&p.owner_id!==v.created_by||typeof v.record_reason!=='string'||!v.record_reason.trim()||v.record_reason.length>300||v.record_reason.includes('\0'))fail('固定名单/客户/责任/连续历史');
  const snapshot=screeningRowSnapshot(b.csv_text,v.row_number,b.created_at);
  if(!snapshot||snapshot!==v.row_snapshot_json)fail('完整原名单行');
  for(const[k,table,id]of [['project_sequence','screening_project_versions',v.project_version_id],['batch_sequence','screening_batch_versions',v.batch_version_id]]){
   if(!Number.isSafeInteger(v[k])||v[k]<1||!db.prepare('SELECT 1 FROM '+table+' WHERE store_id=? AND sequence=? AND created_at<=?').get(v.store_id,v[k],v.created_at))fail('原历史前缀');
   if(k==='project_sequence'||v.action==='link')if(db.prepare('SELECT id FROM '+table+' WHERE root_id=? AND sequence<=? ORDER BY revision DESC LIMIT 1').get(k==='project_sequence'?v.project_id:v.batch_id,v[k])?.id!==id)fail('采用时所见原版本');
  }
  if(!Number.isSafeInteger(v.customer_profile_prefix)||v.customer_profile_prefix<profile.rowid||!db.prepare('SELECT 1 FROM customer_profile_versions WHERE rowid=? AND created_at<=?').get(v.customer_profile_prefix,v.created_at))fail('原资料历史前缀');
  if(v.action==='link'){
   if(old?.action==='link'||p.action!=='record'||p.authorization_status!=='recorded'||JSON.parse(snapshot).errors.length||profile.version!==db.prepare('SELECT max(version) n FROM customer_profile_versions WHERE customer_id=? AND rowid<=?').get(v.customer_id,v.customer_profile_prefix).n)fail('原行授权/明确客户采用');
  }else if(old?.action!=='link'||old.customer_id!==v.customer_id||old.customer_version!==v.customer_version)fail('撤回保留原关联');
  screeningRowLinkProjection(db,v);current.set(key,v);seqs.set(v.store_id,v.sequence);times.set(v.store_id,v.created_at);
 }
 return {screening_row_link_versions:db.prepare('SELECT count(*) n FROM screening_row_link_versions').get().n};
}
