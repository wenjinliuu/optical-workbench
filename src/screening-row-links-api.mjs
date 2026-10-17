import * as L from './screening-row-links.mjs';
import {screeningProjectSource,screeningProjectOwners} from './screening-projects.mjs';
import {screeningSource} from './screening-import.mjs';
import {shareHash} from './family-progress.mjs';
import {screeningRowLinksScope} from './screening-row-links-scope.mjs';

export function createScreeningRowLinksHandler(db,{need,field,fail,body,mutation,audit}){return async(req,path,url,u,json)=>{
 const m=/^\/api\/screening-row-links\/([\w-]+)\/([\w-]+)\/(\d+)(?:\/(context|authorization|customers))?$/.exec(path);if(!m)return false;
 need(u,'screening:prepare');const [projectId,batchVersion,row,special]=[m[1],m[2],Number(m[3]),m[4]];
 const project=()=>{const p=db.prepare('SELECT * FROM screening_project_current WHERE root_id=? AND store_id=?').get(projectId,u.store_id);if(!p)fail(404,'NOT_FOUND','原活动不在本店');if(u.role!=='manager'&&p.owner_id!==u.id)fail(403,'SCREENING_OWNER','人工关联仅当前准备责任人或本店负责人办理');return p;};project();
 const batch=db.prepare('SELECT * FROM screening_batch_versions WHERE id=? AND project_id=? AND store_id=?').get(batchVersion,projectId,u.store_id);
 if(!batch)fail(404,'NOT_FOUND','原名单版本不在本活动');const raw=L.screeningRowSnapshot(batch.csv_text,row,batch.created_at);if(!raw)fail(404,'NOT_FOUND','原名单行不存在');const rowSnapshot=JSON.parse(raw);
 const source=()=>screeningRowLinksScope(db,u,projectId,batchVersion,row),customerSource=()=>screeningSource(db,u);
 const strictQuery=keys=>{for(const k of url.searchParams.keys())if(!keys.includes(k)||url.searchParams.getAll(k).length!==1)fail(422,'VALIDATION','仅同原名单行、客户检索或历史分页');},page=(k,d,min,max)=>{const s=url.searchParams.get(k)??String(d);if(!/^\d+$/.test(s)||+s<min||+s>max)fail(422,'VALIDATION','分页不正确');return +s;};
 if(req.method==='GET'){
  strictQuery(special==='context'?[]:special==='authorization'?['expected_source','expected_customer_source']:special==='customers'?['q','limit','offset','expected_source']:['limit','offset','expected_source','link_version']);
  const adoption_source=source(),limit=page('limit',30,1,50),offset=page('offset',0,0,1000000),q=url.searchParams.get('q')??'',version=url.searchParams.get('link_version');
  if(q.length>120||q.includes('\0')||version!==null&&!/^[\w-]{1,100}$/.test(version))fail(422,'VALIDATION','明确原客户检索或原关联版本');
  if(version&&offset)fail(422,'VALIDATION','固定原关联版本不分页');
  const lease=special==='customers'?shareHash({source:adoption_source,customers:customerSource(),q}):special?adoption_source:shareHash({source:adoption_source,version});
  if(offset&&!url.searchParams.has('expected_source')||url.searchParams.has('expected_source')&&url.searchParams.get('expected_source')!==lease||url.searchParams.has('expected_customer_source')&&url.searchParams.get('expected_customer_source')!==customerSource())fail(409,'SCREENING_LINK_CHANGED','原名单、责任、客户或关联已有变化，请明确重读');
  if(special==='authorization'){json(200,{source_token:adoption_source});return true;}
  if(special==='context'){const current=L.screeningRowLinkCurrent(db,batchVersion,row),p=project();json(200,{source_token:adoption_source,project_source:screeningProjectSource(db,u.store_id),customer_source:customerSource(),project:p,batch:{id:batch.id,root_id:batch.root_id,revision:batch.revision,batch_key:batch.batch_key,current:db.prepare('SELECT id FROM screening_batch_current WHERE root_id=?').get(batch.root_id)?.id===batch.id},row:rowSnapshot,current:L.screeningRowLinkProjection(db,current)});return true;}
  if(special==='customers'){
   const all=db.prepare('SELECT c.id,p.version,p.name,p.birth_date,p.contact_name,p.phone FROM customers c JOIN customer_profile_versions p ON p.customer_id=c.id AND p.version=(SELECT max(version) FROM customer_profile_versions WHERE customer_id=c.id) WHERE c.store_id=? AND (instr(c.id,?)>0 OR instr(p.name,?)>0) ORDER BY c.id').all(u.store_id,q,q);
   json(200,{total:all.length,items:all.slice(offset,offset+limit),next_offset:offset+limit<all.length?offset+limit:null,source_token:lease,adoption_source,customer_source:customerSource()});return true;
  }
  if(version&&offset)fail(422,'VALIDATION','固定原关联版本不分页');const current=L.screeningRowLinkCurrent(db,batchVersion,row),v=version?db.prepare('SELECT * FROM screening_row_link_versions WHERE id=? AND batch_version_id=? AND row_number=?').get(version,batchVersion,row):current;if(version&&!v)fail(404,'NOT_FOUND','原关联版本不在此名单行');
  const total=version?1:current?.revision||0,history=version?[v]:db.prepare('SELECT * FROM screening_row_link_versions WHERE batch_version_id=? AND row_number=? ORDER BY revision DESC LIMIT ? OFFSET ?').all(batchVersion,row,limit,offset);
  json(200,{record:L.screeningRowLinkProjection(db,v),current_revision:current?.revision||0,history:history.map(v=>L.screeningRowLinkProjection(db,v)),total,next_offset:!version&&offset+limit<total?offset+limit:null,source_token:lease,adoption_source});return true;
 }
 if(req.method!=='POST'||special)fail(405,'METHOD','明确关联或撤回原名单行');if(url.search)fail(422,'VALIDATION','保存原关联不接收查询字段');
 const security=db.prepare('SELECT coalesce(revision,1) revision FROM user_security WHERE user_id=?').get(u.id)?.revision||1,b=await body(req),actor=db.prepare('SELECT u.role,u.store_id,u.active,coalesce(s.revision,1) revision,coalesce(s.must_change_password,0) must_change_password FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=?').get(u.id);
 if(!actor||!actor.active||actor.role!==u.role||actor.store_id!==u.store_id||actor.revision!==security)fail(401,'UNAUTHENTICATED','当前人工关联身份已有变化');if(actor.must_change_password)fail(403,'PASSWORD_CHANGE_REQUIRED','请先修改重置密码');
 const keys=['action','expected_source','expected_project_source','expected_project_version','expected_customer_source','expected_revision','customer_id','customer_version','record_reason'];if(Object.keys(b).length!==keys.length||Object.keys(b).some(k=>!keys.includes(k)))fail(422,'VALIDATION','仅明确原名单行、原客户版本和关联依据');
 const text=(v,n,max)=>{const s=field(v,n,max,true);if(s.includes('\0'))fail(422,'VALIDATION',n+'不能含空字符');return s;},i={action:b.action,expected_source:text(b.expected_source,'原关联范围',64),expected_project_source:text(b.expected_project_source,'原活动范围',64),expected_project_version:text(b.expected_project_version,'原活动版本',100),expected_customer_source:b.expected_customer_source,expected_revision:b.expected_revision,customer_id:b.customer_id,customer_version:b.customer_version,record_reason:text(b.record_reason,'人工核对或撤回依据',300)};
 if(!['link','withdraw'].includes(i.action)||!Number.isSafeInteger(i.expected_revision)||i.expected_revision<0)fail(422,'VALIDATION','明确关联动作及所见修订');
 if(i.action==='link'){i.customer_id=text(i.customer_id,'手工所选客户编号',100);i.expected_customer_source=text(i.expected_customer_source,'所见客户范围',64);if(!Number.isSafeInteger(i.customer_version)||i.customer_version<1)fail(422,'VALIDATION','须明确选择原客户资料版本');}else if(i.customer_id!==null||i.customer_version!==null||i.expected_customer_source!==null)fail(422,'VALIDATION','撤回保留原客户关联，不接收替换客户');
 const guard=()=>{const p=project();if(i.action==='withdraw')return p;
  if(p.action!=='record'||p.authorization_status!=='recorded'||!screeningProjectOwners(db,u.store_id).some(o=>o.id===p.owner_id&&o.active&&!o.must_change_password))fail(409,'SCREENING_PROJECT_BASIS','当前原说明撤回、未知、拒绝或责任人不可用，不能新增关联');
  if(rowSnapshot.errors.length)fail(422,'SCREENING_ROW_NOT_READY','原名单行有错误或授权未明确，须先明确更正CSV并重新核对');
  if(db.prepare('SELECT id FROM screening_batch_current WHERE root_id=?').get(batch.root_id)?.id!==batch.id)fail(409,'SCREENING_BATCH_CHANGED','只能从当前明确原名单版本新增关联，旧版关联不自动继承');
  if(p.id!==i.expected_project_version||i.expected_project_source!==screeningProjectSource(db,u.store_id)||i.expected_customer_source!==customerSource())fail(409,'SCREENING_LINK_SOURCE_CHANGED','所见原活动、责任或客户资料已有变化，请重读并重新选择');
  const c=db.prepare('SELECT c.id,c.name,c.birth_date,c.contact_name,c.phone,p.version,p.name profile_name,p.birth_date profile_birth,p.contact_name profile_contact,p.phone profile_phone FROM customers c JOIN customer_profile_versions p ON p.customer_id=c.id AND p.version=(SELECT max(version) FROM customer_profile_versions WHERE customer_id=c.id) WHERE c.id=? AND c.store_id=?').get(i.customer_id,u.store_id);
  if(!c)fail(404,'NOT_FOUND','所选原客户不在本店');if(c.version!==i.customer_version||c.name!==c.profile_name||c.birth_date!==c.profile_birth||c.contact_name!==c.profile_contact||c.phone!==c.profile_phone)fail(409,'SCREENING_CUSTOMER_CHANGED','所见客户资料版本已变化，请明确重读再选择');return p;
 };guard();
 json(201,mutation(req,u,'screening-row-link.'+batchVersion+'.'+row,i,()=>{guard();const old=L.screeningRowLinkCurrent(db,batchVersion,row);if(i.expected_source!==source()||(old?.revision||0)!==i.expected_revision)fail(409,'SCREENING_LINK_CHANGED','原关联已有新修订，请明确重读并核对');if(i.action==='link'&&old?.action==='link'||i.action==='withdraw'&&old?.action!=='link')fail(409,'SCREENING_LINK_STATE','已有有效关联须先明确撤回；未关联或已撤回不能再次撤回');const v=L.appendScreeningRowLink(db,batch,row,i,u.id);audit(u,'screening-row-link.'+i.action,v.id,{customer_id:v.customer_id,customer_version:v.customer_version,batch_version_id:batchVersion,row_number:row,revision:v.revision,reason:v.record_reason},old?{id:old.id,action:old.action}:null);return {record:v};}));return true;
};}
