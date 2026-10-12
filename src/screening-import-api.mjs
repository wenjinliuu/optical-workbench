import {previewScreeningRows,screeningErrorsCsv,screeningCustomers,screeningSource} from './screening-import.mjs';
export function createScreeningImportHandler(db,{need,field,fail,body}){
 return async(req,path,url,u,json)=>{
  if(!path.startsWith('/api/screening-import'))return false;
  if(!['/api/screening-import/preview','/api/screening-import/authorization'].includes(path))fail(404,'NOT_FOUND','名单预检入口不存在');
  need(u,'screening:prepare');if(!u.store_id)fail(403,'FORBIDDEN','名单预检限本店开发岗位');
  const security=db.prepare('SELECT coalesce(revision,1) revision FROM user_security WHERE user_id=?').get(u.id)?.revision||1;
  const current=()=>{const s=db.prepare('SELECT u.role,u.store_id,u.active,coalesce(sec.revision,1) revision,coalesce(sec.must_change_password,0) must_change_password FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN user_security sec ON sec.user_id=u.id WHERE s.token_hash=? AND u.id=? AND s.expires_at>?').get(u.token_hash,u.id,Date.now());if(!s||!s.active||s.role!==u.role||s.store_id!==u.store_id||s.revision!==security)fail(401,'UNAUTHENTICATED','当前名单预检身份或会话已有变化');if(s.must_change_password)fail(403,'PASSWORD_CHANGE_REQUIRED','请先修改重置密码');};
  if(path.endsWith('/authorization')){
   if(req.method!=='GET')fail(405,'METHOD','只读取当前名单预检范围');
   for(const k of url.searchParams.keys())if(k!=='expected_source'||url.searchParams.getAll(k).length!==1)fail(422,'VALIDATION','仅核对本店匹配来源');current();const source_token=screeningSource(db,u);
   if(url.searchParams.has('expected_source')&&url.searchParams.get('expected_source')!==source_token)fail(409,'SCREENING_SOURCE_CHANGED','本店客户匹配资料或当前身份已有变化，请重新核对并预检');json(200,{source_token,store_id:u.store_id});return true;
  }
  if(req.method!=='POST')fail(405,'METHOD','明确提交名单仅作预检');if(url.search)fail(422,'VALIDATION','预检不接收查询字段');
  const b=await body(req,524288);current();const keys=['institution','batch','source_note','csv','expected_source'];if(Object.keys(b).length!==keys.length||Object.keys(b).some(k=>!keys.includes(k)))fail(422,'VALIDATION','仅名单原机构、批次、来源、CSV和当前匹配来源');
  const text=(v,n,max)=>{const s=field(v,n,max,true);if(/[\u0000-\u001f\u007f]/.test(s))fail(422,'VALIDATION',n+'不能包含控制字符');return s;},institution=text(b.institution,'原机构',160),batch=text(b.batch,'原批次',160),source_note=text(b.source_note,'名单原来源说明',1000),expected=text(b.expected_source,'当前匹配来源',64),source_token=screeningSource(db,u);
  if(expected!==source_token)fail(409,'SCREENING_SOURCE_CHANGED','本店客户匹配资料或当前身份已有变化，请重新核对并预检');
  let result;try{result=previewScreeningRows(b.csv,screeningCustomers(db,u.store_id));}catch(e){fail(422,'SCREENING_CSV',e.message);}
  json(200,{...result,institution,batch,source_note,source_token,error_csv:screeningErrorsCsv(result,{institution,batch,source_note})});return true;
 };
}
