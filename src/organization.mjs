import { createHash, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from './db.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
export function createOrganizationHandler(db,{need,field,fail,body,mutation,audit}) {
  const select="SELECT u.id,u.username,u.display_name,u.role,u.store_id,u.active,COALESCE(s.revision,1) AS revision,COALESCE(s.must_change_password,0) AS must_change_password FROM users u LEFT JOIN user_security s ON s.user_id=u.id";
  const account=id=>db.prepare(`${select} WHERE u.id=?`).get(id);
  function updateSecurity(id,mustChange) {
    db.prepare('INSERT INTO user_security VALUES (?,2,?) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1,must_change_password=excluded.must_change_password').run(id,Number(mustChange));
  }
  function password(value) {
    if(typeof value!=='string'||value.length<12||value.length>128||value.trim()!==value)fail(422,'VALIDATION','密码需为 12–128 个字符，首尾不能有空格');
    return value;
  }
  function staff(user,id) {
    const row=account(id);
    if(!row||row.store_id!==user.store_id||row.role==='guardian')fail(404,'NOT_FOUND','人员不存在或不在本店范围内');
    if(id===user.id)fail(409,'SELF_MANAGEMENT','本人密码请从账号安全修改；请由另一位负责人管理本人岗位和状态');
    return row;
  }
  function expected(row,input) {
    if(!Number.isSafeInteger(input.expected_revision)||input.expected_revision<1)fail(422,'VALIDATION','请提供人员资料版本');
    if(row.revision!==input.expected_revision)fail(409,'STALE_ACCOUNT','人员资料已变更，请刷新后重新操作');
  }
  function role(value) {
    if(!['manager','reception','professional'].includes(value))fail(422,'VALIDATION','请选择有效的员工岗位');
    return value;
  }
  return async(req,res,path,user,send)=>{
    const json=(status,value)=>{send(status,value);return true;};
    if(path==='/api/auth/password'&&req.method==='POST') {
      const b=await body(req),current=field(b.current_password,'当前密码',200,true),next=password(b.new_password);
      // Only fingerprints enter the idempotency log; credential values never enter responses/audit.
      const input={current_digest:digest(current),new_digest:digest(next)};
      const result=mutation(req,user,'account.password',input,()=>{
        const row=db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
        if(!verifyPassword(current,row.password_hash))fail(422,'CURRENT_PASSWORD','当前密码不正确');
        if(verifyPassword(next,row.password_hash))fail(422,'UNCHANGED_PASSWORD','请使用与当前不同的新密码');
        db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next),user.id);
        updateSecurity(user.id,false);
        const revoked=db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id,user.token_hash).changes;
        audit(user,'account.password',user.id,{password_changed:true,revoked_sessions:revoked});
        return {ok:true,revoked_sessions:revoked};
      });return json(200,result);
    }
    if(!path.startsWith('/api/organization'))return false;
    need(user,'organization:read');
    if(!user.store_id)fail(403,'FORBIDDEN','账号未分配门店');
    if(path==='/api/organization'&&req.method==='GET') {
      const items=db.prepare(`${select} WHERE u.store_id=? OR (u.role='guardian' AND EXISTS(SELECT 1 FROM guardian_links g JOIN customers c ON c.id=g.customer_id WHERE g.user_id=u.id AND c.store_id=?)) ORDER BY u.role,u.display_name,u.id LIMIT 100`).all(user.store_id,user.store_id);
      return json(200,{items:items.map(u=>({...u,manageable:u.role!=='guardian'&&u.store_id===user.store_id&&u.id!==user.id,session_count:u.role==='guardian'?null:db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=? AND expires_at>?').get(u.id,Date.now()).n})),limit:100});
    }
    need(user,'organization:manage');
    if(path==='/api/organization/staff'&&req.method==='POST') {
      const b=await body(req),initial=password(b.initial_password);
      if(b.store_id!==undefined)fail(422,'VALIDATION','员工门店由当前负责人范围确定');
      const input={username:field(b.username,'登录账号',80,true),display_name:field(b.display_name,'姓名',80,true),role:role(b.role),reason:field(b.reason,'建立依据',300,true),password_digest:digest(initial)};
      if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/.test(input.username))fail(422,'VALIDATION','账号需为 3–80 位字母、数字、点、下划线或短横线');
      return json(201,mutation(req,user,'staff.create',input,()=>{
        if(db.prepare('SELECT 1 FROM users WHERE username=?').get(input.username))fail(409,'ACCOUNT_UNAVAILABLE','此账号不可用，请换一个账号');
        const id=randomUUID();db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,1)').run(id,input.username,input.display_name,hashPassword(initial),input.role,user.store_id);
        db.prepare('INSERT INTO user_security VALUES (?,1,1)').run(id);
        const row=account(id);audit(user,'staff.create',id,{...row,reason:input.reason});return {staff:row};
      }));
    }
    const match=/^\/api\/organization\/staff\/([\w-]+)(\/(?:reset-password|revoke-sessions))?$/.exec(path);
    if(!match||req.method!=='POST')return false;
    staff(user,match[1]);
    const b=await body(req),input={expected_revision:b.expected_revision,reason:field(b.reason,'变更依据',300,true)};
    let newPassword;
    if(!match[2]) {
      if(b.store_id!==undefined||b.username!==undefined)fail(422,'VALIDATION','门店和登录账号不能通过人员编辑变更');
      Object.assign(input,{display_name:field(b.display_name,'姓名',80,true),role:role(b.role),active:b.active});
      if(typeof input.active!=='boolean')fail(422,'VALIDATION','请明确账号启用状态');
    }else if(match[2]==='/reset-password') {newPassword=password(b.initial_password);input.password_digest=digest(newPassword);}
    const action=match[2]==='/reset-password'?'staff.password_reset':match[2]==='/revoke-sessions'?'staff.sessions_revoke':'staff.update';
    return json(200,mutation(req,user,`${action}:${match[1]}`,input,()=>{
      const before=staff(user,match[1]);expected(before,input);
      if(!match[2]) {
        if(before.active&&before.role==='manager'&&(!input.active||input.role!=='manager')&&db.prepare("SELECT count(*) n FROM users WHERE store_id=? AND role='manager' AND active=1").get(user.store_id).n<=1)fail(409,'LAST_MANAGER','门店至少需要保留一位有效负责人');
        db.prepare('UPDATE users SET display_name=?,role=?,active=? WHERE id=?').run(input.display_name,input.role,Number(input.active),before.id);
      }else if(newPassword)db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(newPassword),before.id);
      updateSecurity(before.id,newPassword?true:before.must_change_password);
      const revoked=db.prepare('DELETE FROM sessions WHERE user_id=?').run(before.id).changes;
      const after=account(before.id);audit(user,action,before.id,{...after,reason:input.reason,revoked_sessions:revoked},before);
      return {staff:after,revoked_sessions:revoked};
    }));
  };
}
