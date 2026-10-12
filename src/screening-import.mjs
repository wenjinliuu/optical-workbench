import {createHash} from 'node:crypto';
import {validDate} from './staff-records.mjs';
export const screeningHeaders=['名单编号','姓名','出生日期','联系人','电话','名单授权状态','授权来源说明'];
export const screeningImportLimits={bytes:262144,rows:500,candidates:20};
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
export function parseScreeningCsv(csv){
 if(typeof csv!=='string'||Buffer.byteLength(csv)>screeningImportLimits.bytes)throw Error('CSV须为UTF-8文本且不超过256 KiB');
 csv=csv.replace(/^\uFEFF/,'');if(csv.includes('\0'))throw Error('CSV不能包含空字符');
 const rows=[];let cells=[],cell='',state='plain',line=1,start=1;
 const pushCell=()=>{cells.push(cell);cell='';state='plain';},pushRow=()=>{const syntax=cells.length>0||state==='closed';pushCell();if(syntax||cells.some(s=>s!==''))rows.push({line:start,cells});cells=[];start=line+1;if(rows.length>screeningImportLimits.rows+1)throw Error('单次预检最多500条名单');};
 for(let i=0;i<csv.length;i++){
  const c=csv[i];if(state==='quoted'){if(c==='"'){if(csv[i+1]==='"'){cell+='"';i++;}else state='closed';}else{if(c==='\r'&&csv[i+1]==='\n'){cell+='\n';i++;line++;}else{cell+=c;if(c==='\n'||c==='\r')line++;}}continue;}
  if(c===','){pushCell();continue;}if(c==='\r'||c==='\n'){if(c==='\r'&&csv[i+1]==='\n')i++;pushRow();line++;continue;}
  if(state==='closed')throw Error('CSV引号结束后只能接逗号或换行（第'+line+'行）');
  if(c==='"'){if(cell!=='')throw Error('CSV引号必须位于字段开头（第'+line+'行）');state='quoted';}else cell+=c;
 }
 if(state==='quoted')throw Error('CSV引号未闭合（第'+start+'行）');if(cell!==''||cells.length||state==='closed')pushRow();
 if(!rows.length||JSON.stringify(rows[0].cells)!==JSON.stringify(screeningHeaders))throw Error('请使用完整模板表头及其原顺序');
 if(rows.length===1)throw Error('CSV至少需要一条名单');return rows.slice(1);
}
const issue=(column,code,message)=>({column,code,message});
export function previewScreeningRows(csv,customers,{today=new Date().toISOString().slice(0,10)}={}){
 const raw=parseScreeningCsv(csv),byId=new Map(),byIdentity=new Map();
 for(const r of raw){const [id,name,birth,,phone]=r.cells.map(s=>s.trim());if(id)byId.set(id,(byId.get(id)||0)+1);if(name&&(birth||phone)){const k=JSON.stringify([name,birth,phone]);byIdentity.set(k,(byIdentity.get(k)||0)+1);}}
 const rows=raw.map((r,index)=>{
  const values=Object.fromEntries(screeningHeaders.map((k,i)=>[k,(r.cells[i]??'').trim()])),id=values['名单编号'],name=values['姓名'],birth=values['出生日期'],phone=values['电话'],status=values['名单授权状态'],note=values['授权来源说明'],errors=[],warnings=[];
  if(r.cells.length!==7)errors.push(issue('整行','COLUMN_COUNT','每条名单必须保留7列，空值也须保留逗号'));
  for(const[k,max,required]of [['名单编号',100,true],['姓名',120,true],['联系人',120,false],['电话',40,false],['授权来源说明',1000,false]])if((required||values[k])&&!text(values[k],max))errors.push(issue(k,'INVALID_TEXT',k+'为空、过长或含控制字符'));
  if(birth&&(!validDate(birth)||birth>today))errors.push(issue('出生日期','INVALID_BIRTH_DATE','出生日期须为真实的过去日期 YYYY-MM-DD；未知保留空值'));
  if(!['未知','有记录','拒绝','已撤回'].includes(status))errors.push(issue('名单授权状态','INVALID_AUTHORIZATION_STATUS','明确填写未知、有记录、拒绝或已撤回'));
  else if(status!=='有记录')errors.push(issue('名单授权状态','AUTHORIZATION_NOT_READY',status==='未知'?'名单授权未知，留待核对':'名单授权为'+status+'，不能作为已授权名单'));
  if(status!=='未知'&&['有记录','拒绝','已撤回'].includes(status)&&!text(note,1000))errors.push(issue('授权来源说明','AUTHORIZATION_SOURCE_REQUIRED','授权事实须有明确原来源说明；预检记录不授予报告或临床同意权限'));
  if(byId.get(id)>1)errors.push(issue('名单编号','DUPLICATE_SOURCE_ID','同批名单编号重复，全部重复行留待核对'));
  if(byIdentity.get(JSON.stringify([name,birth,phone]))>1)warnings.push(issue('姓名','REPEATED_IDENTITY','名单中姓名/日期/电话重复，不能据此合并为同一客户'));
  const identityValid=text(name,120)&&(!birth||validDate(birth)&&birth<=today)&&r.cells.length===7;
  const candidates=identityValid?customers.filter(c=>c.name===name&&(!birth||!c.birth_date||c.birth_date===birth)):[];
  if(candidates.length>1)warnings.push(issue('姓名','AMBIGUOUS_CUSTOMER','存在多个本店候选，身份未确认，须逐一人工核对'));if(candidates.length===1)warnings.push(issue('姓名','IDENTITY_NOT_CONFIRMED','单一候选也不是身份确认，不自动关联'));if(!candidates.length&&identityValid)warnings.push(issue('姓名','NO_CUSTOMER_SUGGESTION','没有本店候选，身份保留待核对，不自动建档'));
  if(!birth)warnings.push(issue('出生日期','BIRTH_DATE_UNKNOWN','出生日期未知；同名不能视为身份相同'));
  return {row:index+1,line:r.line,values,raw_cells:r.cells,errors,warnings,candidate_total:candidates.length,candidates:candidates.slice(0,screeningImportLimits.candidates).map(c=>({id:c.id,name:c.name,birth_date:c.birth_date,revision:c.revision})),match_status:!identityValid?'invalid_identity':candidates.length>1?'ambiguous':candidates.length===1?'one_suggestion':'none',identity_confirmed:false};
 });
 return {total:rows.length,error_rows:rows.filter(r=>r.errors.length).length,warning_rows:rows.filter(r=>r.warnings.length).length,ambiguous_rows:rows.filter(r=>r.match_status==='ambiguous').length,rows,persisted:false,report_permission:'not_established',clinical_consent:'not_established',limits:screeningImportLimits};
}
// Excel-compatible CSV: quote fields and neutralize leading formula characters,
// including hidden whitespace. The raw input stays available in preview rows.
export function csvCell(value){const s=String(value??''),safe=/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s)?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';}
export function screeningErrorsCsv(preview,{institution='',batch='',source_note=''}={}){const rows=[['原机构','原批次','名单原来源说明','名单序号','原文件行号',...screeningHeaders,'额外原字段','错误代码','错误说明','核对代码','核对提醒']];for(const r of preview.rows)if(r.errors.length||r.warnings.length)rows.push([institution,batch,source_note,r.row,r.line,...screeningHeaders.map((_,i)=>r.raw_cells[i]??''),r.raw_cells.slice(7).join(' | '),r.errors.map(e=>e.code).join(' | '),r.errors.map(e=>e.message).join('；'),r.warnings.map(e=>e.code).join(' | '),r.warnings.map(e=>e.message).join('；')]);return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';}
export function screeningCustomers(db,store){return db.prepare('SELECT c.id,c.name,c.birth_date,coalesce((SELECT max(version) FROM customer_profile_versions WHERE customer_id=c.id),0) revision FROM customers c WHERE c.store_id=? ORDER BY c.id').all(store);}
export function screeningSource(db,u){const actor=db.prepare('SELECT u.id,u.role,u.store_id,u.active,coalesce(s.revision,1) revision,coalesce(s.must_change_password,0) must_change_password FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=?').get(u.id),rows=screeningCustomers(db,u.store_id);return createHash('sha256').update(JSON.stringify({actor,rows})).digest('hex');}
