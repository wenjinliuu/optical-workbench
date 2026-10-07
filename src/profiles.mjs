import { randomUUID } from 'node:crypto';

export function createProfilesHandler(db,{need,customer,visible,field,date,fail,body,mutation,audit}){
  const latest=id=>db.prepare('SELECT * FROM customer_profile_versions WHERE customer_id=? ORDER BY version DESC LIMIT 1').get(id);
  function expected(value,version){if(!Number.isSafeInteger(value)||value<1)fail(422,'VALIDATION','请提供当前资料版本');if(value!==version)fail(409,'PROFILE_CONFLICT','资料已被修改，请重新读取后再保存');}
  function phone(value){const result=field(value,'联系电话',32);if(result&&!/^[+\d ()-]{5,32}$/.test(result))fail(422,'VALIDATION','电话格式不正确');return result;}
  function source(value){if(!['employee','external','guardian_report'].includes(value))fail(422,'VALIDATION','请选择明确的资料来源');return value;}
  function immutable(b,keys){if(keys.some(key=>b[key]!==undefined))fail(422,'VALIDATION','客户编号、门店与原记录关联不能通过资料编辑变更');}
  function contactInput(b){return {name:field(b.name,'联系人姓名',80,true),relationship:field(b.relationship,'与客户关系',40,true),phone:phone(b.phone),source:source(b.source),note:field(b.note,'联系人备注',300)};}
  const contact=id=>db.prepare('SELECT * FROM family_contacts WHERE id=?').get(id);
  function duplicates(customerId,input,except){return db.prepare('SELECT id,name,relationship FROM family_contacts WHERE customer_id=? AND id<>? AND active=1 AND (name=? OR (? IS NOT NULL AND phone=?)) ORDER BY created_at DESC LIMIT 20').all(customerId,except,input.name,input.phone,input.phone);}
  const jsonResult=(send,status,result)=>{send(status,result);return true;};
  return {
    revision:id=>latest(id)?.version||1,
    handle:async(req,res,path,user,json)=>{
      const match=/^\/api\/customers\/([\w-]+)\/(profile|profile-history|contacts)$/.exec(path);
      if(match){
        const row=customer(user,match[1]);
        if(match[2]==='profile-history'&&req.method==='GET'){
          need(user,'profiles:read');return jsonResult(json,200,{items:db.prepare('SELECT v.*,u.display_name AS actor_name FROM customer_profile_versions v LEFT JOIN users u ON u.id=v.created_by WHERE customer_id=? ORDER BY version DESC LIMIT 100').all(row.id),limit:100});
        }
        if(match[2]==='profile'&&req.method==='POST'){
          need(user,'customers:update');const b=await body(req);immutable(b,['id','customer_id','store_id','created_at','created_by']);
          if(['name','birth_date','contact_name','phone'].some(key=>!Object.hasOwn(b,key)))fail(422,'VALIDATION','请提交完整的基本资料');
          const input={name:field(b.name,'姓名',80,true),birth_date:date(b.birth_date),contact_name:field(b.contact_name,'主要联系人',80),phone:phone(b.phone),source:source(b.source),revision_reason:field(b.revision_reason,'修改依据',300,true),expected_version:b.expected_version};
          return jsonResult(json,200,mutation(req,user,`customer.revise:${row.id}`,input,()=>{
            const before=customer(user,row.id),previous=latest(row.id);expected(input.expected_version,previous.version);
            const fields=['name','birth_date','contact_name','phone'];if(fields.every(key=>before[key]===input[key]))fail(409,'NO_CHANGES','基本资料没有变化');
            db.prepare('UPDATE customers SET name=?,birth_date=?,contact_name=?,phone=? WHERE id=?').run(...fields.map(key=>input[key]),row.id);
            const version=previous.version+1,now=new Date().toISOString();
            db.prepare('INSERT INTO customer_profile_versions VALUES (?,?,?,?,?,?,?,?,?,?)').run(row.id,version,...fields.map(key=>input[key]),input.source,input.revision_reason,now,user.id);
            const after=customer(user,row.id);audit(user,'customer.revise',row.id,{...after,version,source:input.source,revision_reason:input.revision_reason},{...before,version:previous.version});
            const candidates=db.prepare('SELECT id,name FROM customers WHERE store_id=? AND id<>? AND (name=? OR (? IS NOT NULL AND phone=?)) LIMIT 20').all(user.store_id,row.id,input.name,input.phone,input.phone);
            return {customer:visible(user,after),duplicate_candidates:candidates};
          }));
        }
        if(match[2]==='contacts'&&req.method==='GET'){
          need(user,'profiles:read');return jsonResult(json,200,{items:db.prepare('SELECT * FROM family_contacts WHERE customer_id=? ORDER BY active DESC,created_at DESC,id LIMIT 100').all(row.id),limit:100});
        }
        if(match[2]==='contacts'&&req.method==='POST'){
          need(user,'contacts:manage');const b=await body(req);immutable(b,['id','customer_id','store_id','active','revision']);const input={...contactInput(b),reason:field(b.reason,'建立依据',300,true)};
          return jsonResult(json,201,mutation(req,user,`contact.create:${row.id}`,input,()=>{
            const id=randomUUID(),now=new Date().toISOString();
            db.prepare('INSERT INTO family_contacts VALUES (?,?,?,?,?,?,?,1,1,?,?,?,?)').run(id,row.id,input.name,input.relationship,input.phone,input.source,input.note,now,user.id,now,user.id);
            const created=contact(id);audit(user,'contact.create',id,{...created,reason:input.reason});return {contact:created,duplicate_candidates:duplicates(row.id,input,id)};
          }));
        }
        fail(405,'METHOD','不支持此请求');
      }
      const edit=/^\/api\/contacts\/([\w-]+)$/.exec(path);
      if(edit){
        need(user,'contacts:manage');const record=contact(edit[1]);if(!record)fail(404,'NOT_FOUND','联系人不存在');customer(user,record.customer_id);
        if(req.method!=='POST')fail(405,'METHOD','不支持此请求');
        const b=await body(req);immutable(b,['id','customer_id','store_id','created_at','created_by']);
        const input={...contactInput(b),active:b.active,expected_revision:b.expected_revision,reason:field(b.reason,'修改依据',300,true)};
        if(typeof input.active!=='boolean')fail(422,'VALIDATION','请明确联系人是否有效');
        if(['phone','note'].some(key=>!Object.hasOwn(b,key)))fail(422,'VALIDATION','请提交完整联系人资料');
        return jsonResult(json,200,mutation(req,user,`contact.update:${record.id}`,input,()=>{
          const before=contact(record.id);expected(input.expected_revision,before.revision);
          const keys=['name','relationship','phone','source','note'];if(keys.every(key=>before[key]===input[key])&&Boolean(before.active)===input.active)fail(409,'NO_CHANGES','联系人资料没有变化');
          db.prepare('UPDATE family_contacts SET name=?,relationship=?,phone=?,source=?,note=?,active=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=?').run(...keys.map(key=>input[key]),Number(input.active),new Date().toISOString(),user.id,before.id);
          const after=contact(before.id);audit(user,'contact.update',before.id,{...after,reason:input.reason},before);return {contact:after,duplicate_candidates:duplicates(before.customer_id,input,before.id)};
        }));
      }
      return false;
    }
  };
}
