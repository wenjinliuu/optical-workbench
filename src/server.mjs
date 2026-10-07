import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase, transaction, hashPassword, verifyPassword } from './db.mjs';
import { demoScenarios } from './demo-data.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const roles = {manager:['customers:read','customers:create','cycles:create','audit:read','organization:read','guardians:manage','visits:create','visits:close','demo:read'],reception:['customers:read','customers:create','cycles:create','visits:create','visits:close','demo:read'],professional:['customers:read','cycles:create','demo:read'],guardian:['customers:read']};
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
async function body(req) {
  if(!req.headers['content-type']?.startsWith('application/json')) fail(415,'CONTENT_TYPE','请使用 JSON 请求');
  let data=''; for await(const chunk of req) { data+=chunk; if(Buffer.byteLength(data)>16384) fail(413,'TOO_LARGE','请求内容过大'); }
  try { const value=JSON.parse(data); if(!value || Array.isArray(value) || typeof value!=='object') throw Error(); return value; } catch { fail(400,'BAD_JSON','请求格式不正确'); }
}
export function createApp({databasePath='data/workbench.sqlite', mode='development'}={}) {
  if(mode !== 'development' && mode !== 'test') throw new Error('Production is blocked pending architecture and identity review.');
  const db=openDatabase(databasePath), attempts=new Map();
  function customer(user,id) {
    need(user,'customers:read');
    const row=db.prepare('SELECT * FROM customers WHERE id=?').get(id);
    const allowed=row && (user.role==='guardian' ? db.prepare('SELECT 1 FROM guardian_links WHERE user_id=? AND customer_id=? AND active=1').get(user.id,id) : row.store_id===user.store_id);
    if(!allowed) fail(404,'NOT_FOUND','档案不存在或不在授权范围内'); return row;
  }
  function visible(user,row) {
    const {created_by, ...safe}=row;
    if(user.role==='guardian') return {id:row.id,name:row.name,birth_date:row.birth_date};
    return safe;
  }
  function audit(user,action,id,after,before=null) {
    db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),user.store_id,user.id,action,id,before===null?null:JSON.stringify(before),JSON.stringify(after),new Date().toISOString());
  }
  function visitsFor(id) {
    return db.prepare('SELECT id,purpose,status,created_at,closed_at FROM visits WHERE customer_id=? ORDER BY created_at DESC,id LIMIT 100').all(id).map(v=>({...v,cycle_ids:db.prepare('SELECT cycle_id FROM visit_cycles WHERE visit_id=? ORDER BY cycle_id').all(v.id).map(x=>x.cycle_id)}));
  }
  function localGuardian(user,id) {
    return db.prepare("SELECT id,display_name,active FROM users u WHERE u.id=? AND u.role='guardian' AND (u.store_id=? OR EXISTS(SELECT 1 FROM guardian_links g JOIN customers c ON c.id=g.customer_id WHERE g.user_id=u.id AND c.store_id=?))").get(id,user.store_id,user.store_id);
  }
  function mutation(req,user,operation,input,fn) {
    const key=req.headers['idempotency-key'];
    if(typeof key!=='string'||!/^[\w-]{8,100}$/.test(key)) fail(400,'IDEMPOTENCY_REQUIRED','提交需要有效的防重复标识');
    return transaction(db,()=>{
      const fingerprint=sha(JSON.stringify(input));
      const prior=db.prepare('SELECT * FROM idempotency WHERE actor_id=? AND operation=? AND request_key=?').get(user.id,operation,key);
      if(prior) { if(prior.request_hash!==fingerprint) fail(409,'IDEMPOTENCY_CONFLICT','同一提交标识不能用于不同内容'); return JSON.parse(prior.response_json); }
      const result=fn(); db.prepare('INSERT INTO idempotency VALUES (?,?,?,?,?)').run(user.id,operation,key,fingerprint,JSON.stringify(result)); return result;
    });
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,'http://localhost'), path=url.pathname;
      if(!path.startsWith('/api/')) {
        if(req.method!=='GET') fail(405,'METHOD','不支持此请求');
        const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml']};
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
      const session=token && db.prepare('SELECT s.csrf,s.expires_at,u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE token_hash=? AND expires_at>? AND u.active=1').get(sha(token),Date.now());
      if(!session) fail(401,'UNAUTHENTICATED','请登录后继续');
      const user=session;
      if(req.method!=='GET' && req.headers['x-csrf-token']!==session.csrf) fail(403,'CSRF','会话校验失败，请重新加载');
      if(path==='/api/me' && req.method==='GET') return json(200,{id:user.id,name:user.display_name,role:user.role,store:user.store_id?db.prepare('SELECT * FROM stores WHERE id=?').get(user.store_id):null,permissions:roles[user.role],csrf:session.csrf});
      if(path==='/api/auth/logout' && req.method==='POST') { transaction(db,()=>{db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));audit(user,'session.logout',user.id,{});});res.setHeader('Set-Cookie','ow_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(200,{ok:true}); }
      if(path==='/api/organization' && req.method==='GET') {
        need(user,'organization:read');
        return json(200,{items:db.prepare('SELECT id,display_name,role,active FROM users u WHERE store_id=? OR (role=\'guardian\' AND EXISTS(SELECT 1 FROM guardian_links g JOIN customers c ON c.id=g.customer_id WHERE g.user_id=u.id AND c.store_id=?)) ORDER BY role,display_name LIMIT 100').all(user.store_id,user.store_id)});
      }
      if(path==='/api/demo/scenarios' && req.method==='GET') {
        need(user,'demo:read');
        const items=demoScenarios.filter(s=>{const c=db.prepare('SELECT store_id,name FROM customers WHERE id=?').get(s.customer_id);return c?.store_id===user.store_id && c.name===s.name;});
        return json(200,{items,source:'synthetic',snapshot_only:true});
      }
      if(path==='/api/customers' && req.method==='GET') {
        need(user,'customers:read');const q=(url.searchParams.get('q')||'').slice(0,100);
        const scope=user.role==='guardian' ? 'EXISTS(SELECT 1 FROM guardian_links g WHERE g.customer_id=c.id AND g.user_id=? AND g.active=1)' : 'c.store_id=?';
        const identifier=user.role==='guardian'?user.id:user.store_id;
        const search=user.role==='guardian' ? 'c.name' : "c.name || ' ' || COALESCE(c.contact_name,'') || ' ' || COALESCE(c.phone,'') || ' ' || c.id";
        const rows=db.prepare(`SELECT c.* FROM customers c WHERE ${scope} AND instr(${search},?)>0 ORDER BY c.created_at DESC,c.id LIMIT 100`).all(identifier,q);
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
        if(req.method==='GET' && !match[2]) return json(200,{customer:visible(user,row),cycles:user.role==='guardian'?[]:db.prepare('SELECT id,type,goal,status,created_at FROM service_cycles WHERE customer_id=? ORDER BY created_at DESC').all(row.id),visits:user.role==='guardian'?[]:visitsFor(row.id),guardians:user.role==='guardian'?[]:db.prepare('SELECT g.user_id,u.display_name,g.relationship,g.active FROM guardian_links g JOIN users u ON u.id=g.user_id WHERE customer_id=? ORDER BY g.active DESC,u.display_name').all(row.id)});
        if(req.method==='POST' && match[2]==='/cycles') {
          need(user,'cycles:create');const b=await body(req), input={type:field(b.type,'周期类型',20,true),goal:field(b.goal,'服务目标',300,true)};
          if(!['followup','training','retail'].includes(input.type)) fail(422,'VALIDATION','周期类型不正确');
          return json(201,mutation(req,user,`cycles.create:${row.id}`,input,()=>{
            const cycle={id:randomUUID(),customer_id:row.id,...input,status:'draft',created_at:new Date().toISOString(),created_by:user.id};
            db.prepare('INSERT INTO service_cycles VALUES (?,?,?,?,?,?,?)').run(...Object.values(cycle));audit(user,'cycle.create',cycle.id,cycle);return {cycle};
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
          need(user,'visits:create');const b=await body(req),input={purpose:field(b.purpose,'到店目的',300,true),cycle_ids:b.cycle_ids??[]};
          if(!Array.isArray(input.cycle_ids)||input.cycle_ids.length>20||input.cycle_ids.some(id=>typeof id!=='string')||new Set(input.cycle_ids).size!==input.cycle_ids.length)fail(422,'VALIDATION','服务周期列表不正确');
          input.cycle_ids.sort();
          return json(201,mutation(req,user,`visits.create:${row.id}`,input,()=>{
            for(const id of input.cycle_ids)if(!db.prepare('SELECT 1 FROM service_cycles WHERE id=? AND customer_id=?').get(id,row.id))fail(422,'INVALID_CYCLE','只能关联当前客户的服务周期');
            const visit={id:randomUUID(),customer_id:row.id,store_id:row.store_id,purpose:input.purpose,status:'registered',created_at:new Date().toISOString(),closed_at:null,created_by:user.id};
            db.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(visit));
            for(const id of input.cycle_ids)db.prepare('INSERT INTO visit_cycles VALUES (?,?,?)').run(visit.id,id,row.id);
            audit(user,'visit.register',visit.id,{...visit,cycle_ids:input.cycle_ids});return {visit:{...visit,cycle_ids:input.cycle_ids}};
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
    } catch(error) { if(!error.status) console.error('Request failed:',error.name);json(error.status||500,{error:{code:error.code||'INTERNAL',message:error.status?error.message:'保存失败，请稍后重试'}}); }
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
