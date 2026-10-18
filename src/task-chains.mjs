import { createHash } from 'node:crypto';
const lanes=['queued','awaiting','pending','running','paused','blocked','cancelled','completed'];
const roles=['manager','reception','professional'];

// Only saved source links define the component. Every hop repeats store/customer scope.
export function taskChain(db,selected,url,visible,fail){
 const role=url.searchParams.get('role')||'all',lane=url.searchParams.get('lane')||'all',rawLimit=url.searchParams.get('limit')||'50';
 if(!['all',...roles].includes(role)||!['all',...lanes].includes(lane)||!/^\d{1,3}$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>100)fail(422,'VALIDATION','任务链筛选或分页数量不正确');
 const limit=Number(rawLimit),params={customer:selected.customer_id,store:selected.store_id,selected:selected.id};
 const ancestors=db.prepare(`WITH RECURSIVE ancestors(id,depth,path,cycle) AS (
  SELECT :selected,0,'|'||:selected||'|',0
  UNION ALL SELECT p.id,a.depth+1,a.path||p.id||'|',instr(a.path,'|'||p.id||'|')>0
  FROM ancestors a JOIN task_followups f ON f.task_id=a.id JOIN work_tasks p ON p.id=f.parent_task_id
  WHERE a.cycle=0 AND f.customer_id=:customer AND p.customer_id=:customer AND p.store_id=:store
 ) SELECT * FROM ancestors ORDER BY depth DESC`).all(params);
 if(ancestors.some(a=>a.cycle))fail(409,'TASK_CHAIN_INVALID','任务来源存在循环，请核对保存的关联记录');
 const root=ancestors[0].id;
 const cte=`WITH RECURSIVE chain(id,depth,path,cycle) AS (
  SELECT :root,0,'|'||:root||'|',0
  UNION ALL SELECT t.id,c.depth+1,c.path||t.id||'|',instr(c.path,'|'||t.id||'|')>0
  FROM chain c JOIN task_followups f ON f.parent_task_id=c.id JOIN work_tasks t ON t.id=f.task_id
  WHERE c.cycle=0 AND f.customer_id=:customer AND t.customer_id=:customer AND t.store_id=:store
 ), nodes AS (
  SELECT t.*,c.depth,c.cycle,CASE WHEN done.task_id IS NOT NULL THEN 'completed' WHEN t.lifecycle_status<>'active' THEN t.lifecycle_status WHEN t.assignment_status<>'accepted' THEN t.assignment_status ELSE t.execution_status END lane,
   CASE WHEN t.assignee_id IS NULL THEN t.candidate_role ELSE u.role END responsibility_role
  FROM chain c JOIN work_tasks t ON t.id=c.id LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN task_completions done ON done.task_id=t.id
 ) `;
 const scope={root,customer:selected.customer_id,store:selected.store_id};
 const summary=db.prepare(cte+'SELECT count(*) total,COALESCE(max(depth),0) max_depth,COALESCE(sum(cycle),0) cycles FROM nodes').get(scope);
 if(summary.cycles)fail(409,'TASK_CHAIN_INVALID','任务来源存在循环，请核对保存的关联记录');
 const stateCounts=Object.fromEntries(lanes.map(key=>[key,0]));
 for(const r of db.prepare(cte+'SELECT lane,count(*) n FROM nodes GROUP BY lane').all(scope))stateCounts[r.lane]=r.n;
 const roleCounts=db.prepare(cte+'SELECT responsibility_role role,count(*) total FROM nodes GROUP BY responsibility_role ORDER BY responsibility_role').all(scope).map(r=>({...r}));
 const state=db.prepare(cte+"SELECT n.id,n.revision,n.updated_at,n.lane,u.display_name,u.role,u.active,COALESCE(sec.must_change_password,0) must_change_password FROM nodes n LEFT JOIN users u ON u.id=n.assignee_id LEFT JOIN user_security sec ON sec.user_id=u.id ORDER BY n.id").all(scope);
 const fingerprint=createHash('sha256').update(JSON.stringify({state,customer:db.prepare('SELECT name FROM customers WHERE id=?').get(selected.customer_id).name})).digest('hex');
 const filter="(:role='all' OR responsibility_role=:role) AND (:lane='all' OR lane=:lane)",filtered={...scope,role,lane};
 const matching=db.prepare(cte+'SELECT count(*) n FROM nodes WHERE '+filter).get(filtered).n;
 let cursor=null;const encoded=url.searchParams.get('cursor');
 if(encoded){
  try{if(encoded.length>2000||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error();cursor=JSON.parse(Buffer.from(encoded,'base64url').toString());
   if(cursor.root!==root||cursor.customer!==selected.customer_id||cursor.role!==role||cursor.lane!==lane||cursor.limit!==limit||typeof cursor.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(cursor.fingerprint)||!Number.isSafeInteger(cursor.depth)||cursor.depth<0||typeof cursor.time!=='string'||cursor.time.length>100||typeof cursor.id!=='string'||!/^[\w-]{1,100}$/.test(cursor.id))throw Error();
  }catch{fail(422,'INVALID_CURSOR','任务链分页位置不符，请重新读取任务链');}
  if(cursor.fingerprint!==fingerprint)fail(409,'CHAIN_CHANGED','关联任务或责任状态已变化，请重新读取任务链');
 }
 const rows=db.prepare(cte+'SELECT * FROM nodes WHERE '+filter+' AND (depth>:depth OR (depth=:depth AND (created_at>:time OR (created_at=:time AND id>:id)))) ORDER BY depth,created_at,id LIMIT :limit').all({...filtered,depth:cursor?.depth??-1,time:cursor?.time??'',id:cursor?.id??'',limit:limit+1});
 const hasMore=rows.length>limit,items=rows.slice(0,limit).map(r=>({task:visible(db.prepare('SELECT * FROM work_tasks WHERE id=?').get(r.id)),depth:r.depth,lane:r.lane,responsibility_role:r.responsibility_role}));
 const last=rows[Math.min(rows.length,limit)-1],next=hasMore?Buffer.from(JSON.stringify({root,customer:selected.customer_id,role,lane,limit,fingerprint,depth:last.depth,time:last.created_at,id:last.id})).toString('base64url'):null;
 const focus=db.prepare(cte+'SELECT depth,lane,responsibility_role FROM nodes WHERE id=:selected').get({...scope,selected:selected.id});
 return {root_task:visible(db.prepare('SELECT * FROM work_tasks WHERE id=?').get(root)),selected:{task:visible(selected),...focus},items,limit,next_cursor:next,has_more:hasMore,matching_total:matching,filters:{role,lane},summary:{total:summary.total,links:summary.total-1,max_depth:summary.max_depth,completed:stateCounts.completed,open:summary.total-stateCounts.completed,lanes:stateCounts,roles:roleCounts},read_at:new Date().toISOString()};
}
