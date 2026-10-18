import * as C from './family-changes.mjs';
import {bookingRecord,familyBooking} from './family-bookings.mjs';
import {offerRecord,familyOffer} from './family-offers.mjs';
import {requestSource,requestRecord} from './family-requests.mjs';
import {shareHash} from './family-progress.mjs';

export function createFamilyChangesHandler(db,{need,field,fail,body,mutation,audit}) {
  const text=(v,n,max=2000)=>{const s=field(v,n,max,true);if(s.includes('\0'))fail(422,'VALIDATION','文本不能包含空字符');return s;};
  return async(req,path,url,u,json)=>{
    const pub=/^\/api\/family-changes\/publications\/([\w-]+)\/(options|context|request)$/.exec(path);
    const request=/^\/api\/family-changes\/requests\/([\w-]+)(?:\/(authorization|execute))?$/.exec(path);
    if(!pub&&!request)return false;
    need(u,'family:read');const guardian=u.role==='guardian';if(!guardian)need(u,'scheduling:manage');
    const strict=keys=>{for(const k of url.searchParams.keys())if(!keys.includes(k)||url.searchParams.getAll(k).length!==1)fail(422,'VALIDATION','仅本次明确来源和同来源分页');};
    const keys=(b,allowed)=>{if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k)))fail(422,'VALIDATION','仅本次意向或实际办理字段');};
    const local=()=>{
      const c=C.changeRecord(db,request[1]);
      if(!c||(guardian?c.recipient_id!==u.id||!requestSource(db,u.id,c.customer_id):c.store_id!==u.store_id))fail(404,'NOT_FOUND','原预约变更意向不在当前范围');return c;
    };
    const publication=()=>{
      const p=bookingRecord(db,pub[1],{limit:1});
      if(!guardian)fail(403,'FAMILY_RECIPIENT','本人针对已公开原预约提交意向');
      if(!p||!familyBooking(db,p.id,u.id))fail(404,'NOT_FOUND','原预约公开不在本人范围');return p;
    };
    const kind=(v)=>{if(!['leave','move'].includes(v))fail(422,'VALIDATION','请明确请假或调课意向');return v;};
    const issue=c=>{if(c.problem)fail(409,c.problem.code,c.problem.message);};
    const adoption=c=>shareHash({auth:requestSource(db,c.recipient_id,c.customer_id)?.source_token,record:C.changeRecord(db,c.request_id,{family:true}),access:C.changeAccess(db,c)});
    if(req.method==='GET') {
      if(pub) {
        const p=publication();
        if(pub[2]==='request')fail(405,'METHOD','明确提交原预约变更意向');
        if(pub[2]==='context') {
          strict(['kind','offer_id','expected_source']);const k=kind(url.searchParams.get('kind')),offer=url.searchParams.get('offer_id');
          if(k==='leave'&&offer)fail(422,'VALIDATION','请假不选择新时段');
          const c=C.changeContext(db,p.id,u.id,k,offer);
          if(url.searchParams.has('expected_source')&&url.searchParams.get('expected_source')!==c.source_token)fail(409,'FAMILY_CHANGE_SOURCE','原预约、本人授权或目标已有变化');
          // Never include plan, resource or other customer's identities in family responses.
          json(200,{source_token:c.source_token,problem:c.problem,original:familyBooking(db,p.id,u.id),target:offer&&c.offer?.recipient_id===u.id&&c.offer?.customer_id===p.booking.customer_id&&c.offer?.plan_id===p.booking.plan_id?familyOffer(db,offer,u.id):null});return true;
        }
        strict(['limit','offset','expected_source']);
        const page=(k,d,min,max)=>{const s=url.searchParams.get(k)??String(d);if(!/^\d+$/.test(s)||+s<min||+s>max)fail(422,'VALIDATION','分页不正确');return +s;};
        const limit=page('limit',30,1,100),offset=page('offset',0,0,1e6);
        const all=db.prepare('SELECT id FROM family_offer_roots WHERE recipient_id=? AND customer_id=? AND plan_id=? ORDER BY serial DESC').all(u.id,p.booking.customer_id,p.booking.plan_id).map(x=>offerRecord(db,x.id,{limit:1})).filter(o=>o.status==='published'&&o.source_current&&o.source.plan_version===p.booking.plan_version&&(o.slot_id!==p.booking.slot_id||p.booking.status==='waiting'));
        const source_token=shareHash({publication:p.source_token,offers:all.map(o=>o.source_token)});
        if(offset&&!url.searchParams.has('expected_source')||url.searchParams.has('expected_source')&&source_token!==url.searchParams.get('expected_source'))fail(409,'FAMILY_CHANGE_SOURCE','原预约或开放时段已变化，请重新读取');
        json(200,{items:all.slice(offset,offset+limit).map(o=>familyOffer(db,o.id,u.id)),total:all.length,next_offset:offset+limit<all.length?offset+limit:null,source_token});return true;
      }
      strict(request[2]==='authorization'?['expected_source']:[]);
      if(request[2]==='execute')fail(405,'METHOD','明确办理实际原预约');
      if(!request[2]&&!C.changeRecord(db,request[1])){
        const q=requestRecord(db,request[1],{limit:1});
        if(!q||(guardian?q.recipient_id!==u.id||!requestSource(db,u.id,q.customer_id):q.store_id!==u.store_id))fail(404,'NOT_FOUND','当前授权无效或原家庭意向不在当前范围');
        json(200,{record:null});return true;
      }
      const c=local();if(request[2]==='authorization') {
        if(!guardian)fail(403,'FAMILY_RECIPIENT','本人采用返回内容前核对');const token=adoption(c);
        if(url.searchParams.get('expected_source')!==token)fail(409,'FAMILY_CHANGE_SOURCE','本人授权或原结果已变化');json(200,{source_token:token});return true;
      }
      json(200,{record:C.changeRecord(db,c.request_id,{family:guardian}),...(guardian?{adoption_source:adoption(c)}:{contexts:Object.fromEntries(['leave','move','promote'].map(a=>[a,C.executionContext(db,c.request_id,a)]))})});return true;
    }
    if(req.method!=='POST'||pub&&pub[2]!=='request'||request&&request[2]!=='execute')fail(405,'METHOD','明确提交意向或实际办理');
    strict([]);const security=db.prepare('SELECT coalesce(revision,1) n FROM user_security WHERE user_id=?').get(u.id)?.n||1;
    const b=await body(req,32768),live=db.prepare('SELECT u.role,u.store_id,u.active,coalesce(z.revision,1) revision,coalesce(z.must_change_password,0) must_change_password FROM users u LEFT JOIN user_security z ON z.user_id=u.id WHERE u.id=?').get(u.id);
    if(!live||!live.active||live.role!==u.role||live.store_id!==u.store_id||live.revision!==security)fail(401,'UNAUTHENTICATED','当前身份已有变化');if(live.must_change_password)fail(403,'PASSWORD_CHANGE_REQUIRED','请先修改密码');
    if(pub) {
      publication();keys(b,['expected_source','kind','offer_id','title','request_note']);
      const i={expected_source:text(b.expected_source,'原预约来源',64),kind:kind(b.kind),offer_id:b.offer_id==null?null:text(b.offer_id,'明确目标开放时段',100),title:text(b.title,'本人申请标题',160),request_note:text(b.request_note,'本人意向说明')};
      if(i.kind==='leave'&&i.offer_id||i.kind==='move'&&!i.offer_id)fail(422,'VALIDATION','请假保留原时段，调课须明确目标开放时段');
      // Access checks run before cached replay; source/duplicate checks run only for a new write.
      const guard=()=>{
        const p=publication(),o=i.offer_id?offerRecord(db,i.offer_id,{limit:1}):null;
        if(p.status!=='published'||!p.source_current||i.offer_id&&(!o||o.recipient_id!==u.id||o.customer_id!==p.booking.customer_id||o.status!=='published'||!o.source_current))fail(409,'FAMILY_CHANGE_SOURCE','本人授权或原公开已有变化');
        const prior=db.prepare('SELECT response_json FROM idempotency WHERE actor_id=? AND operation=? AND request_key=?').get(u.id,'family-change.submit.'+pub[1],req.headers['idempotency-key']||'');
        if(prior){const saved=C.changeRecord(db,JSON.parse(prior.response_json).record.request_id);if(!saved||!C.changeAccess(db,saved))fail(409,'FAMILY_CHANGE_SOURCE','原提交意向、公开版本或本人授权已经变化');}
      };guard();
      json(201,mutation(req,u,'family-change.submit.'+pub[1],i,()=>{guard();const c=C.changeContext(db,pub[1],u.id,i.kind,i.offer_id);if(c.source_token!==i.expected_source)fail(409,'FAMILY_CHANGE_SOURCE','原预约、开放时段或原意向已变化，输入保留，请重新核对');issue(c);const r=C.submitChange(db,pub[1],u.id,i);audit(u,'family-change.submit',r.id,{request_id:r.request_id,booking_id:r.booking_id,kind:r.kind});return {record:C.changeRecord(db,r.request_id,{family:true})};}));return true;
    }
    if(guardian)fail(403,'FORBIDDEN','实际原预约办理仅员工');keys(b,['expected_source','action','note','reason','public_note']);
    if(!['leave','move','promote'].includes(b.action))fail(422,'VALIDATION','明确当次请假、单次调课或原候补转正');
    const i={expected_source:text(b.expected_source,'实际办理来源',64),action:b.action,note:text(b.note,'原排期安排说明',1000),reason:text(b.reason,'内部办理依据',300),public_note:text(b.public_note,'明确向本人公开的实际结果')};
    const guard=()=>{const c=local();if(!C.changeAccess(db,c))fail(409,'FAMILY_CHANGE_SOURCE','当前本人授权、原公开或本人意向已有变化');return c;};guard();
    json(201,mutation(req,u,'family-change.execute.'+request[1],i,()=>{guard();const c=C.executionContext(db,request[1],i.action);if(c.source_token!==i.expected_source)fail(409,'FAMILY_CHANGE_SOURCE','原预约、计划、容量或冲突已有变化，输入保留，请重新核对');issue(c);const r=C.executeChange(db,request[1],i,u.id);audit(u,'family-change.execute',r.id,{request_id:request[1],action:r.action,booking_event_id:r.booking_event_id});return {execution:r};}));return true;
  };
}
