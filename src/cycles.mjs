export function createCyclesHandler(db,{need,customer,field,fail,body,mutation,audit}){
 const latest=id=>db.prepare('SELECT * FROM cycle_versions WHERE cycle_id=? ORDER BY version DESC LIMIT 1').get(id);
 function cycle(user,id){const row=db.prepare('SELECT * FROM service_cycles WHERE id=?').get(id);if(!row)fail(404,'NOT_FOUND','周期不存在');customer(user,row.customer_id);return row;}
 function visible(row){const v=latest(row.id);return {...row,version:v.version,source:v.source};}
 function refs(visitId){return db.prepare('SELECT s.cycle_id,s.version,s.basis,COALESCE(v.type,c.type) AS type,v.goal,v.source FROM visit_cycle_versions s JOIN service_cycles c ON c.id=s.cycle_id LEFT JOIN cycle_versions v ON v.cycle_id=s.cycle_id AND v.version=s.version WHERE s.visit_id=? ORDER BY s.cycle_id').all(visitId);}
 return {latest,visible,refs,handle:async(req,path,user,json)=>{
  const match=/^\/api\/cycles\/([\w-]+)(\/versions)?$/.exec(path);if(!match)return false;need(user,'cycles:read');const row=cycle(user,match[1]);
  if(req.method==='GET'&&!match[2]){json(200,{cycle:visible(row),versions:db.prepare('SELECT v.*,u.display_name AS actor_name FROM cycle_versions v LEFT JOIN users u ON u.id=v.created_by WHERE cycle_id=? ORDER BY version DESC LIMIT 100').all(row.id),limit:100});return true;}
  if(req.method!=='POST'||!match[2])fail(405,'METHOD','不支持此请求');need(user,'cycles:revise');
  const b=await body(req);if(['id','customer_id','store_id','type','status','created_at','created_by'].some(key=>b[key]!==undefined))fail(422,'VALIDATION','只能修订需求，周期身份、类型和状态保持原记录');
  const input={goal:field(b.goal,'周期需求',300,true),source:b.source,revision_reason:field(b.revision_reason,'修订依据',300,true),expected_version:b.expected_version};
  if(!['employee','external','guardian_report'].includes(input.source)||!Number.isSafeInteger(input.expected_version)||input.expected_version<1)fail(422,'VALIDATION','请提供明确来源与当前版本');
  json(201,mutation(req,user,`cycle.revise:${row.id}`,input,()=>{
   const before=cycle(user,row.id),v=latest(row.id);if(v.version!==input.expected_version)fail(409,'CYCLE_CONFLICT','周期需求已被修改，请重新读取后再保存');
   if(before.status!=='draft')fail(409,'NOT_DRAFT','当前只能修订周期草稿');if(before.goal===input.goal)fail(409,'NO_CHANGES','周期需求没有变化');
   db.prepare('UPDATE service_cycles SET goal=? WHERE id=?').run(input.goal,row.id);
   db.prepare('INSERT INTO cycle_versions VALUES (?,?,?,?,?,?,?,?,?)').run(row.id,row.customer_id,v.version+1,before.type,input.goal,input.source,input.revision_reason,new Date().toISOString(),user.id);
   const after=visible(cycle(user,row.id));audit(user,'cycle.revise',row.id,{...after,revision_reason:input.revision_reason},{...before,version:v.version});return {cycle:after};
  }));return true;
 }};
}
