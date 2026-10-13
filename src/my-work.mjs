import {createHash} from 'node:crypto';
import {employeeResponsibilities, responsibilityKinds} from './staff-handover.mjs';

// Reuse the original responsibility projection, but select only the public-to-self
// business fields. Personnel records and the manager's employee directory never
// enter this response. The caller cannot choose an employee or store.
export function myWork(db, user, {scope='mine', kind='all', q='', limit=30, offset=0, date_mode='all', date_from='', date_to='', sort='updated', task_state='all'}={}) {
  const original=employeeResponsibilities(db,user.store_id,user.id,{kind,q,limit,offset,date_mode,date_from,date_to,sort,task_state});
  if(!original) return null;
  const filter={scope,kind,q,date_mode,date_from,date_to,sort,task_state};
  const source_token=createHash('sha256').update(JSON.stringify({
    employee:user.id,role:user.role,store:user.store_id,source:original.source_token,filter
  })).digest('hex');
  const result={
    employee:{id:user.id,display_name:original.employee.display_name,role:user.role},
    as_of:original.as_of,source_token,filter,kinds:responsibilityKinds,
    counts:original.counts,total_responsibilities:Object.values(original.counts).reduce((a,b)=>a+b,0),
    candidate_task_count:original.candidate_task_count,
    professional_qualification_status:'not_verified'
  };
  if(scope==='mine') return {...result,matched_counts:original.matched_counts,date_counts:original.date_counts,total:original.total,next_offset:original.next_offset,items:original.items};
  const where=`t.store_id=? AND t.assignee_id IS NULL AND t.assignment_status='queued'
    AND t.candidate_role=? AND t.lifecycle_status<>'cancelled'
    AND NOT EXISTS(SELECT 1 FROM task_completions WHERE task_id=t.id)
    AND (?='all' OR ?='task') AND (?<>'recorded') AND (?='' AND ?='')
    AND (instr(lower(t.title),lower(?)) OR instr(lower(c.name),lower(?)) OR instr(lower(t.id),lower(?)))
    AND (?='all' OR (?='blocked' AND t.lifecycle_status='blocked') OR (?='awaiting' AND t.assignment_status='awaiting') OR (?='paused' AND t.execution_status='paused') OR (?='running' AND t.execution_status='running'))`;
  const from=' FROM work_tasks t JOIN customers c ON c.id=t.customer_id AND c.store_id=t.store_id WHERE '+where;
  const args=[user.store_id,user.role,kind,kind,date_mode,date_from,date_to,q,q,q,task_state,task_state,task_state,task_state,task_state];
  const total=db.prepare('SELECT count(*) n'+from).get(...args).n;
  const items=db.prepare(`SELECT 'task' kind,t.id,0 position,t.store_id,t.customer_id,
    NULL owner_id,t.title,t.revision,NULL version,NULL event_id,
    t.lifecycle_status||' / '||t.assignment_status||' / '||t.execution_status status,
    NULL due,t.updated_at event_at,c.name customer_name`+from+
    ' ORDER BY t.updated_at DESC,t.id LIMIT ? OFFSET ?').all(...args,limit,offset).map(r=>({
      ...r,key:'task:'+r.id+':0',due_source:null,deadline_status:'not_recorded',professional_qualification_status:'not_verified'
    }));
  return {...result,matched_counts:Object.fromEntries(responsibilityKinds.map(k=>[k,k==='task'?total:0])),date_counts:{recorded:0,not_recorded:original.candidate_task_count},total,next_offset:offset+limit<total?offset+limit:null,items};
}

export function createMyWorkHandler(db,{need,fail}) {
  return async(req,path,url,user,json)=>{
    const proof=path==='/api/my-work/authorization';
    if(path!=='/api/my-work'&&!proof) return false;
    need(user,'tasks:read');
    if(req.method!=='GET') fail(405,'METHOD','本人工作台只读取原责任，办理沿原业务入口');
    const known=['scope','kind','q','date_mode','date_from','date_to','sort','task_state','expected_source',...(proof?[]:['limit','offset'])];
    for(const k of url.searchParams.keys()) if(!known.includes(k)||url.searchParams.getAll(k).length!==1)
      fail(422,'VALIDATION','仅接受本人业务筛选和同源分页');
    const page=(k,d,min,max)=>{
      const v=url.searchParams.get(k)??String(d);
      if(!/^\d+$/.test(v)||+v<min||+v>max) fail(422,'VALIDATION','分页无效');
      return +v;
    };
    const options={scope:url.searchParams.get('scope')||'mine',kind:url.searchParams.get('kind')||'all',
      q:url.searchParams.get('q')||'',date_mode:url.searchParams.get('date_mode')||'all',date_from:url.searchParams.get('date_from')||'',date_to:url.searchParams.get('date_to')||'',sort:url.searchParams.get('sort')||'updated',task_state:url.searchParams.get('task_state')||'all',limit:page('limit',30,1,100),offset:page('offset',0,0,1e6)};
    if(!['updated','date_asc','date_desc'].includes(options.sort)||!['mine','candidates'].includes(options.scope)||!['all',...responsibilityKinds].includes(options.kind)
      ||!['all','blocked','awaiting','paused','running'].includes(options.task_state)
      ||options.task_state!=='all'&&options.kind!=='task'
      ||options.q.length>120||options.q.includes('\0')) fail(422,'VALIDATION','任务状态只可用于原通用任务；请选择通用岗位任务或明确退出任务状态筛选');
    const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00.000Z'))&&new Date(v+'T00:00:00.000Z').toISOString().slice(0,10)===v;
    if(!['all','recorded','not_recorded'].includes(options.date_mode)
      ||[options.date_from,options.date_to].some(v=>v&&!validDate(v))
      ||options.date_from&&options.date_to&&options.date_from>options.date_to
      ||options.date_mode==='not_recorded'&&(options.date_from||options.date_to))
      fail(422,'VALIDATION','请选择实际原日期状态及有效日期区间；日期未知不能同时指定区间');
    const result=myWork(db,user,options);
    if(!result) fail(404,'NOT_FOUND','当前本店员工不存在');
    if(options.offset&&!url.searchParams.has('expected_source')
      ||url.searchParams.has('expected_source')&&url.searchParams.get('expected_source')!==result.source_token)
      fail(409,'MY_WORK_CHANGED','本人责任、岗位候选或筛选已有变化，请明确刷新当前筛选');
    json(200,proof?{source_token:result.source_token}:result);
    return true;
  };
}

