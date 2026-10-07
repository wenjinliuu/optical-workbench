import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';

const LIMIT=1048576;
const metadata='id,customer_id,filename,content_type,size,created_at,created_by,revoked_at';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

function validateFile(bytes,type,fail){
  let valid=false;
  if(type==='image/png')valid=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='image/jpeg')valid=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==='application/pdf')valid=bytes.subarray(0,5).toString()==='%PDF-';
  if(type==='text/plain'){
    try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);valid=!bytes.includes(0);}catch{valid=false;}
  }
  if(!valid)fail(415,'INVALID_FILE','文件类型或内容不支持；请使用 PDF、PNG、JPEG 或 UTF-8 文本');
}
async function binary(req,fail){
  if(Number(req.headers['content-length'])>LIMIT)fail(413,'TOO_LARGE','附件不能超过 1 MB');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>LIMIT)fail(413,'TOO_LARGE','附件不能超过 1 MB');chunks.push(chunk);}
  if(!size)fail(422,'EMPTY_FILE','附件不能为空');return Buffer.concat(chunks);
}

export function createDocumentsHandler(db,{need,customer,field,fail,body,mutation,audit}){
  function record(user,id){
    const row=db.prepare('SELECT * FROM document_records WHERE id=?').get(id);
    if(!row)fail(404,'NOT_FOUND','资料记录不存在');customer(user,row.customer_id);return row;
  }
  function file(user,id){
    const row=db.prepare('SELECT * FROM attachments WHERE id=?').get(id);
    if(!row)fail(404,'NOT_FOUND','附件不存在');customer(user,row.customer_id);return row;
  }
  function links(version_id){
    return db.prepare(`SELECT ${metadata.split(',').map(x=>'a.'+x).join(',')} FROM version_attachments v JOIN attachments a ON a.id=v.attachment_id WHERE v.version_id=? ORDER BY a.filename`).all(version_id);
  }
  function latest(id){
    const v=db.prepare('SELECT * FROM document_versions WHERE record_id=? ORDER BY version DESC LIMIT 1').get(id);return {...v,attachments:links(v.id)};
  }
  function input(b){
    const value={title:field(b.title,'资料标题',120,true),content:field(b.content,'资料内容',6000,true),source:field(b.source,'资料来源',30,true),attachment_ids:b.attachment_ids??[]};
    if(!['employee','external','guardian_report'].includes(value.source))fail(422,'VALIDATION','资料来源不正确');
    if(!Array.isArray(value.attachment_ids)||value.attachment_ids.length>20||value.attachment_ids.some(id=>typeof id!=='string')||new Set(value.attachment_ids).size!==value.attachment_ids.length)fail(422,'VALIDATION','附件列表不正确');
    value.attachment_ids.sort();return value;
  }
  function save(user,row,v,version,reason){
    for(const id of v.attachment_ids){
      if(!db.prepare('SELECT 1 FROM attachments WHERE id=? AND customer_id=? AND revoked_at IS NULL').get(id,row.customer_id))fail(422,'INVALID_ATTACHMENT','只能引用当前客户可访问的附件');
    }
    const id=randomUUID(),now=new Date().toISOString();
    db.prepare('INSERT INTO document_versions VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,row.id,row.customer_id,version,v.title,v.content,v.source,reason,now,user.id);
    for(const attachment_id of v.attachment_ids)db.prepare('INSERT INTO version_attachments VALUES (?,?,?)').run(id,attachment_id,row.customer_id);
    return latest(row.id);
  }
  return async(req,res,path,user,json)=>{
    const owner=/^\/api\/customers\/([\w-]+)\/(attachments|documents)$/.exec(path);
    if(owner){
      const isFile=owner[2]==='attachments';need(user,isFile?'attachments:read':'documents:read');const c=customer(user,owner[1]);
      if(req.method==='GET'){
        const items=isFile?db.prepare(`SELECT ${metadata} FROM attachments WHERE customer_id=? ORDER BY created_at DESC,id LIMIT 100`).all(c.id):db.prepare('SELECT id FROM document_records WHERE customer_id=? ORDER BY created_at DESC,id LIMIT 100').all(c.id).map(r=>latest(r.id));
        json(200,{items,limit:100});return true;
      }
      if(req.method!=='POST')fail(405,'METHOD','不支持此请求');
      if(isFile){
        need(user,'attachments:upload');let filename;
        try{filename=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail(422,'VALIDATION','附件名称编码不正确');}
        filename=field(filename,'附件名称',160,true);
        if(/[\x00-\x1f\x7f/\\]/.test(filename)||filename==='.'||filename==='..')fail(422,'VALIDATION','附件名称不可包含路径或控制字符');
        const type=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
        if(!['image/png','image/jpeg','application/pdf','text/plain'].includes(type))fail(415,'UNSUPPORTED_FILE','支持 PDF、PNG、JPEG 和 UTF-8 文本附件');
        const bytes=await binary(req,fail);validateFile(bytes,type,fail);
        const value={filename,content_type:type,size:bytes.length,sha256:digest(bytes)};
        json(201,mutation(req,user,`attachments.upload:${c.id}`,value,()=>{
          const id=randomUUID();db.prepare('INSERT OR IGNORE INTO attachment_blobs VALUES (?,?,?)').run(value.sha256,bytes,value.size);
          db.prepare('INSERT INTO attachments (id,customer_id,filename,content_type,blob_sha256,size,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)').run(id,c.id,filename,type,value.sha256,value.size,new Date().toISOString(),user.id);
          const attachment=db.prepare(`SELECT ${metadata} FROM attachments WHERE id=?`).get(id);audit(user,'attachment.upload',id,attachment);return {attachment};
        }));return true;
      }
      need(user,'documents:write');const v=input(await body(req,65536));
      json(201,mutation(req,user,`documents.create:${c.id}`,v,()=>{
        const row={id:randomUUID(),customer_id:c.id};db.prepare('INSERT INTO document_records VALUES (?,?,?,?)').run(row.id,c.id,new Date().toISOString(),user.id);
        const document=save(user,row,v,1,'初始资料记录');audit(user,'document.create',row.id,document);return {document};
      }));return true;
    }
    const download=/^\/api\/attachments\/([\w-]+)\/download$/.exec(path);
    if(download&&req.method==='GET'){
      need(user,'attachments:read');const f=file(user,download[1]);
      if(f.revoked_at)fail(410,'ATTACHMENT_REVOKED','此附件的访问已撤销');
      const blob=db.prepare('SELECT bytes FROM attachment_blobs WHERE sha256=?').get(f.blob_sha256);
      audit(user,'attachment.download',f.id,{customer_id:f.customer_id,filename:f.filename});
      res.writeHead(200,{'Content-Type':f.content_type,'Content-Length':f.size,'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(f.filename).replace(/'/g,'%27')}`,'Content-Security-Policy':"sandbox; default-src 'none'"});res.end(blob.bytes);return true;
    }
    const revoke=/^\/api\/attachments\/([\w-]+)\/revoke$/.exec(path);
    if(revoke&&req.method==='POST'){
      need(user,'attachments:revoke');const f=file(user,revoke[1]);
      if(user.role!=='manager'&&f.created_by!==user.id)fail(403,'FORBIDDEN','只能撤销自己上传的附件');
      const b=await body(req),v={reason:field(b.reason,'撤销依据',300,true)};
      json(200,mutation(req,user,`attachments.revoke:${f.id}`,v,()=>{
        const before=db.prepare(`SELECT ${metadata} FROM attachments WHERE id=?`).get(f.id);
        if(before.revoked_at)fail(409,'ALREADY_REVOKED','附件访问已经撤销');
        db.prepare('UPDATE attachments SET revoked_at=?,revoked_by=?,revocation_reason=? WHERE id=?').run(new Date().toISOString(),user.id,v.reason,f.id);
        const attachment=db.prepare(`SELECT ${metadata} FROM attachments WHERE id=?`).get(f.id);audit(user,'attachment.revoke',f.id,{...attachment,reason:v.reason},before);return {attachment};
      }));return true;
    }
    const doc=/^\/api\/documents\/([\w-]+)(\/versions)?$/.exec(path);
    if(doc){
      need(user,'documents:read');const row=record(user,doc[1]);
      if(req.method==='GET'&&!doc[2]){
        const versions=db.prepare('SELECT * FROM document_versions WHERE record_id=? ORDER BY version DESC LIMIT 100').all(row.id).map(v=>({...v,attachments:links(v.id)}));
        json(200,{record:row,versions,limit:100});return true;
      }
      if(req.method==='POST'&&doc[2]){
        need(user,'documents:write');const b=await body(req,65536),v={...input(b),expected_version:b.expected_version,revision_reason:field(b.revision_reason,'修订依据',300,true)};
        if(!Number.isSafeInteger(v.expected_version)||v.expected_version<1)fail(422,'VALIDATION','请提供当前版本编号');
        json(201,mutation(req,user,`documents.revise:${row.id}`,v,()=>{
          const before=latest(row.id);if(before.version!==v.expected_version)fail(409,'VERSION_CONFLICT','资料已被其他人修订，请重新读取后再保存');
          const document=save(user,row,v,before.version+1,v.revision_reason);audit(user,'document.revise',row.id,document,before);return {document};
        }));return true;
      }
      fail(405,'METHOD','不支持此请求');
    }
    return false;
  };
}
