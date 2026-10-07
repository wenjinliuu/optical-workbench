import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

function routeLabel(url){
  let path;try{path=new URL(url,'http://localhost').pathname;}catch{return '/api/unknown';}
  if(!path.startsWith('/api/'))return null;
  if(['/api/health','/api/me','/api/auth/login','/api/auth/logout','/api/auth/password','/api/organization','/api/organization/staff','/api/customers','/api/audit','/api/demo/scenarios','/api/operations','/api/tasks','/api/tasks/assignees'].includes(path))return path;
  const routes=[[/^\/api\/tasks\/[\w-]+\/completion(\/(?:conditions|evidence|check|references))?$/,'/api/tasks/:id/completion'],[/^\/api\/tasks\/[\w-]+(\/(?:claim|accept|start|pause|resume|return|transfer|block|unblock|cancel|restore))?$/,'/api/tasks/:id'],[/^\/api\/cycles\/[\w-]+(\/versions)?$/,'/api/cycles/:id'],[/^\/api\/customers\/[\w-]+(\/(?:cycles|guardians|visits|attachments|documents|profile|profile-history|contacts|overview|timeline|tasks))?$/,'/api/customers/:id'],[/^\/api\/contacts\/[\w-]+$/,'/api/contacts/:id'],[/^\/api\/attachments\/[\w-]+\/(download|revoke)$/,'/api/attachments/:id'],[/^\/api\/documents\/[\w-]+(\/versions)?$/,'/api/documents/:id'],[/^\/api\/visits\/[\w-]+\/close$/,'/api/visits/:id/close'],[/^\/api\/organization\/staff\/[\w-]+(\/(?:reset-password|revoke-sessions))?$/,'/api/organization/staff/:id']];
  for(const [pattern,label] of routes){const match=pattern.exec(path);if(match)return label+(match[1]?('/'+match[1].replace(/^\//,'')):'');}
  return '/api/unknown';
}
export function createRuntime({logger}={}){
  const started_at=new Date().toISOString(),started=performance.now(),stores=new Map();
  function begin(req,res){
    const request_id=randomUUID(),start=performance.now(),route=routeLabel(req.url),method=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method)?req.method:'OTHER';
    let store_id=null,errorCode=null,recorded=false;
    res.setHeader('X-Request-Id',request_id);
    function finish(aborted=false){
      if(recorded)return;recorded=true;if(!route)return;
      const event={request_id,created_at:new Date().toISOString(),method,route,status:aborted?499:res.statusCode,code:aborted?'REQUEST_ABORTED':errorCode,duration_ms:Math.round((performance.now()-start)*100)/100};
      if(store_id){
        if(!stores.has(store_id))stores.set(store_id,{requests:0,client_errors:0,server_errors:0,aborted:0,recent:[]});
        const stats=stores.get(store_id);stats.requests++;if(aborted)stats.aborted++;else if(event.status>=500)stats.server_errors++;else if(event.status>=400)stats.client_errors++;
        stats.recent.push(event);if(stats.recent.length>200)stats.recent.shift();
      }
      if(event.status>=400){try{logger?.({...event,store_id});}catch{/* Logging never alters a business response. */}}
    }
    res.once('finish',()=>finish());res.once('close',()=>{if(!res.writableFinished)finish(true);});
    return {request_id,setStore(id){store_id=id;},setError(code){errorCode=/^[A-Z][A-Z0-9_]{0,60}$/.test(code)?code:'INTERNAL';}};
  }
  function snapshot(storeId){
    const stats=stores.get(storeId)||{requests:0,client_errors:0,server_errors:0,aborted:0,recent:[]},sorted=stats.recent.map(e=>e.duration_ms).sort((a,b)=>a-b);
    return {started_at,uptime_seconds:Math.floor((performance.now()-started)/1000),requests:stats.requests,client_errors:stats.client_errors,server_errors:stats.server_errors,aborted:stats.aborted,window_size:sorted.length,window_limit:200,p95_ms:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null,errors:stats.recent.filter(e=>e.status>=400).slice(-20).reverse()};
  }
  return {begin,snapshot};
}
