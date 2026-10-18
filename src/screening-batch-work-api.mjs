import {screeningBatchWork} from './screening-batch-work.mjs';
import {screeningBatchSource} from './screening-batches.mjs';
import {screeningProjectSource} from './screening-projects.mjs';
import {shareHash} from './family-progress.mjs';
export function createScreeningBatchWorkHandler(db,{need,fail}){return async(req,path,url,u,json)=>{
 const m=/^\/api\/screening-batch-work\/([\w-]+)\/([\w-]+)(?:\/(authorization))?$/.exec(path);if(!m)return false;need(u,'screening:prepare');const project=m[1],version=m[2];
 const p=db.prepare('SELECT * FROM screening_project_current WHERE root_id=? AND store_id=?').get(project,u.store_id);if(!p)fail(404,'NOT_FOUND','原活动不在本店');if(u.role!=='manager'&&u.id!==p.owner_id)fail(403,'SCREENING_OWNER','原名单处理队列仅当前准备责任人或本店负责人读取');
 const b=db.prepare('SELECT * FROM screening_batch_versions WHERE id=? AND project_id=? AND store_id=?').get(version,project,u.store_id);if(!b)fail(404,'NOT_FOUND','原CSV版本不在本活动');if(req.method!=='GET')fail(405,'METHOD','原名单处理汇总只读');
 const keys=['state','errors','registered','q','expected_source',...(m[3]?[]:['limit','offset'])];for(const k of url.searchParams.keys())if(!keys.includes(k)||url.searchParams.getAll(k).length!==1)fail(422,'VALIDATION','仅同原名单版本与明确筛选/分页');
 const filter={state:url.searchParams.get('state')||'all',errors:url.searchParams.get('errors')||'all',registered:url.searchParams.get('registered')||'all',q:url.searchParams.get('q')||''};if(!['all','unlinked','linked','withdrawn'].includes(filter.state)||!['all','has_errors','no_errors'].includes(filter.errors)||!['all','created','not_created'].includes(filter.registered)||filter.q.length>120||filter.q.includes('\0'))fail(422,'VALIDATION','原名单筛选不正确');
 const page=(key,d,min,max)=>{const s=url.searchParams.get(key)??String(d);if(!/^\d+$/.test(s)||+s<min||+s>max)fail(422,'VALIDATION','分页不正确');return +s;},limit=page('limit',20,1,50),offset=page('offset',0,0,1000000);
 const source=shareHash({actor:u.id,project:screeningProjectSource(db,u.store_id),batch:screeningBatchSource(db,u.store_id,project),version,filter});if(offset&&!url.searchParams.has('expected_source')||url.searchParams.has('expected_source')&&url.searchParams.get('expected_source')!==source)fail(409,'SCREENING_WORK_CHANGED','原名单关联、责任或筛选已有变化，请明确刷新本版队列');
 if(m[3]){json(200,{source_token:source});return true;}
 const v=screeningBatchWork(db,b,filter);json(200,{...v,rows:undefined,items:v.rows.slice(offset,offset+limit),total:v.rows.length,next_offset:offset+limit<v.rows.length?offset+limit:null,source_token:source,current_csv_version:db.prepare('SELECT id FROM screening_batch_current WHERE root_id=?').get(b.root_id)?.id,current_project_revision:p.revision});return true;
};}
