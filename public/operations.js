const $=selector=>document.querySelector(selector);
const routeNames={'/api/customers':'客户档案','/api/auth/password':'本人改密','/api/organization/staff':'新增员工','/api/audit':'操作审计','/api/operations':'运行状态'};
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function routeName(route){if(routeNames[route])return routeNames[route];if(route.startsWith('/api/customers/:id/'))return '客户关联资料';if(route.startsWith('/api/organization/'))return '人员与账号';if(route.startsWith('/api/attachments/'))return '附件访问';if(route.startsWith('/api/documents/'))return '资料版本';return '工作台请求';}
export function createOperationsPanel({api,getMe,getEpoch}){
  let version=0;
  async function load(){
    const current=++version,epoch=getEpoch();$('#operations-error').textContent='';
    try{
      const data=await api('/operations');if(current!==version||epoch!==getEpoch()||!getMe())return;
      $('#operations-status').textContent=data.database==='ok'?'数据库可访问':'数据库待核对';
      $('#operations-started').textContent=new Date(data.started_at).toLocaleString('zh-CN',{hour12:false});
      $('#operations-uptime').textContent=data.uptime_seconds<60?`${data.uptime_seconds} 秒`:`${Math.floor(data.uptime_seconds/60)} 分钟`;
      $('#operations-latency').textContent=data.p95_ms===null?'暂无记录':`${data.p95_ms} ms`;
      $('#operations-window').textContent=`本店最近 ${data.window_size} 个请求，最多 ${data.window_limit} 个；数据随本次服务启动计数。`;
      const summary=$('#operations-summary');summary.replaceChildren();
      for(const [name,count,tone] of [['本店请求',data.requests,'mint'],['请求被拒绝',data.client_errors,'violet'],['服务错误',data.server_errors,'coral']]){const card=el('article',undefined,`demo-stat ${tone}`);card.append(el('span',name),el('strong',String(count)),el('small','本次启动累计'));summary.append(card);}
      const box=$('#operations-errors');box.replaceChildren();
      if(!data.errors.length){box.append(el('div','当前窗口内没有故障记录。','empty'));return;}
      for(const item of data.errors){
        const card=el('article',undefined,'operation-event'),head=el('div',undefined,'operation-event-head');
        head.append(el('strong',routeName(item.route)),el('span',item.status>=500?'服务错误':item.status===499?'请求中断':'请求被拒绝',item.status>=500?'badge coral':'badge violet'));card.append(head);
        card.append(el('p',`${new Date(item.created_at).toLocaleString('zh-CN',{hour12:false})} · ${item.duration_ms} ms`,'small muted'));
        const label=el('p','故障编号','small muted');label.append(el('code',item.request_id));card.append(label,el('small',`${item.code||'UNKNOWN'} · ${item.method} · ${item.status}`,'muted'));box.append(card);
      }
    }catch(e){if(current===version&&epoch===getEpoch()&&getMe())$('#operations-error').textContent=e.message;}
  }
  $('#refresh-operations').onclick=load;
  return {load,reset(){version++;for(const id of ['operations-summary','operations-errors'])$('#'+id).replaceChildren();for(const id of ['operations-status','operations-started','operations-uptime','operations-latency','operations-window','operations-error'])$('#'+id).textContent='';}};
}
