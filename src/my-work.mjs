import {createHash} from 'node:crypto';
import {employeeResponsibilities, responsibilityKinds} from './staff-handover.mjs';

// Reuse the original responsibility projection, but select only the public-to-self
// business fields. Personnel records and the manager's employee directory never
// enter this response. The caller cannot choose an employee or store.
export function myWork(db, user, {scope='mine', kind='all', q='', limit=30, offset=0}={}) {
  const original=employeeResponsibilities(db,user.store_id,user.id,{kind,q,limit,offset});
  if(!original) return null;
  const filter={scope,kind,q};
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
  if(scope==='mine') return {...result,total:original.total,next_offset:original.next_offset,items:original.items};
  const where=`t.store_id=? AND t.assignee_id IS NULL AND t.assignment_status='queued'
    AND t.candidate_role=? AND t.lifecycle_status<>'cancelled'
    AND NOT EXISTS(SELECT 1 FROM task_completions WHERE task_id=t.id)
    AND (?='all' OR ?='task')
    AND (instr(lower(t.title),lower(?)) OR instr(lower(c.name),lower(?)) OR instr(lower(t.id),lower(?)))`;
  const from=' FROM work_tasks t JOIN customers c ON c.id=t.customer_id AND c.store_id=t.store_id WHERE '+where;
  const args=[user.store_id,user.role,kind,kind,q,q,q];
  const total=db.prepare('SELECT count(*) n'+from).get(...args).n;
  const items=db.prepare(`SELECT 'task' kind,t.id,0 position,t.store_id,t.customer_id,
    NULL owner_id,t.title,t.revision,NULL version,NULL event_id,
    t.lifecycle_status||' / '||t.assignment_status||' / '||t.execution_status status,
    NULL due,t.updated_at event_at,c.name customer_name`+from+
    ' ORDER BY t.updated_at DESC,t.id LIMIT ? OFFSET ?').all(...args,limit,offset).map(r=>({
      ...r,key:'task:'+r.id+':0',deadline_status:'not_recorded',professional_qualification_status:'not_verified'
    }));
  return {...result,total,next_offset:offset+limit<total?offset+limit:null,items};
}

export function createMyWorkHandler(db,{need,fail}) {
  return async(req,path,url,user,json)=>{
    const proof=path==='/api/my-work/authorization';
    if(path!=='/api/my-work'&&!proof) return false;
    need(user,'tasks:read');
    if(req.method!=='GET') fail(405,'METHOD','本人工作台只读取原责任，办理沿原业务入口');
    const known=['scope','kind','q','expected_source',...(proof?[]:['limit','offset'])];
    for(const k of url.searchParams.keys()) if(!known.includes(k)||url.searchParams.getAll(k).length!==1)
      fail(422,'VALIDATION','仅接受本人业务筛选和同源分页');
    const page=(k,d,min,max)=>{
      const v=url.searchParams.get(k)??String(d);
      if(!/^\d+$/.test(v)||+v<min||+v>max) fail(422,'VALIDATION','分页无效');
      return +v;
    };
    const options={scope:url.searchParams.get('scope')||'mine',kind:url.searchParams.get('kind')||'all',
      q:url.searchParams.get('q')||'',limit:page('limit',30,1,100),offset:page('offset',0,0,1e6)};
    if(!['mine','candidates'].includes(options.scope)||!['all',...responsibilityKinds].includes(options.kind)
      ||options.q.length>120||options.q.includes('\0')) fail(422,'VALIDATION','本人业务筛选无效');
    const result=myWork(db,user,options);
    if(!result) fail(404,'NOT_FOUND','当前本店员工不存在');
    if(options.offset&&!url.searchParams.has('expected_source')
      ||url.searchParams.has('expected_source')&&url.searchParams.get('expected_source')!==result.source_token)
      fail(409,'MY_WORK_CHANGED','本人责任、岗位候选或筛选已有变化，请明确刷新当前筛选');
    json(200,proof?{source_token:result.source_token}:result);
    return true;
  };
}
