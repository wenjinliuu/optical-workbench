const $=selector=>document.querySelector(selector);
const routeNames={'/api/customers':'客户档案','/api/auth/password':'本人改密','/api/organization/staff':'新增员工','/api/audit':'操作审计','/api/operations':'运行状态','/api/refunds':'退款记录'};
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function routeName(route){if(routeNames[route])return routeNames[route];if(route==='/api/my-work'||route.startsWith('/api/my-work/'))return '本人工作台';if(route.startsWith('/api/screening-'))return '团体筛查与名单';if(route.startsWith('/api/staff-'))return '员工责任与交接';if(route.startsWith('/api/family-progress/'))return '家庭发布与进度';if(route.startsWith('/api/family-requests/'))return '家庭申请与回复';if(route.startsWith('/api/family-offers/'))return '家庭时段选择';if(route.startsWith('/api/family-bookings/'))return '家庭预约办理';if(route.startsWith('/api/family-changes/'))return '家庭请假与调课';if(route.startsWith('/api/family-communication/'))return '家庭偏好与说明';if(route==='/api/family-notifications/:scope/sources')return '申请通知追溯';if(route.startsWith('/api/family-notifications/'))return '家庭通知与回执';if(route.startsWith('/api/family-training/'))return '家庭练习与复评';if(route==='/api/professional/:scope')return '专业随访与转介';if(route==='/api/procurement/:scope')return '采购收货与退供';if(route==='/api/inventory-trace/:scope')return '库存实物与出库';if(route==='/api/financial-review/:scope')return '费用与渠道核对';if(route.startsWith('/api/customers/:id/'))return '客户关联资料';if(route.startsWith('/api/organization/'))return '人员与账号';if(route.startsWith('/api/attachments/'))return '附件访问';if(route.startsWith('/api/documents/'))return '资料版本';return '工作台请求';}
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
