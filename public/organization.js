const $=selector=>document.querySelector(selector);
const roleNames={manager:'门店负责人',reception:'前台 / 销售',professional:'专业人员',guardian:'家长 / 客户'};
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function createOrganizationPanel({api,getMe,getEpoch,toast,boot,onLogout}) {
  let target,loadVersion=0;
  const resets=[];
  function form(id,dialogId,errorId,request,onSuccess){
    let pending;
    const node=$(id),dialog=$(dialogId);
    const clear=()=>{node.reset();pending=undefined;$(errorId).textContent='';};resets.push(clear);dialog.addEventListener('close',clear);
    node.onsubmit=async event=>{
      event.preventDefault();const epoch=getEpoch(),button=node.querySelector('[type=submit]');button.disabled=true;$(errorId).textContent='';
      try{
        const {path,data}=request(Object.fromEntries(new FormData(node))),fingerprint=JSON.stringify({path,data});
        if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};
        const result=await api(path,{method:'POST',data,key:pending.key});if(epoch!==getEpoch()||!getMe())return;
        dialog.close();await onSuccess(result);
      }catch(e){if(epoch===getEpoch()&&getMe())$(errorId).textContent=e.message;}
      finally{button.disabled=false;}
    };
  }
  function open(id,error){$(id).reset();$(error).textContent='';$(id).closest('dialog').showModal();}
  async function saved(message){toast(message);await load();}
  form('#staff-create-form','#staff-create-dialog','#staff-create-error',data=>({path:'/organization/staff',data}),()=>saved('员工已建立；首次登录需修改初始密码'));
  form('#staff-edit-form','#staff-edit-dialog','#staff-edit-error',data=>({path:`/organization/staff/${target.id}`,data:{...data,active:data.active==='true',expected_revision:target.revision}}),()=>saved('人员资料已保存，原登录会话已撤销'));
  form('#staff-security-form','#staff-security-dialog','#staff-security-error',data=>({path:`/organization/staff/${target.id}/${target.securityAction}`,data:{...data,expected_revision:target.revision}}),result=>saved(`账号安全设置已保存，撤销 ${result.revoked_sessions} 个登录会话`));
  form('#password-form','#password-dialog','#password-error',data=>{
    if(data.new_password!==data.confirm_password)throw Error('两次新密码不一致');
    return {path:'/auth/password',data:{current_password:data.current_password,new_password:data.new_password}};
  },async()=>{toast('密码已修改，其他登录会话已撤销');await boot();});
  function openPassword(){
    const forced=Boolean(getMe()?.must_change_password);$('#password-close').hidden=forced;$('#password-logout').hidden=!forced;
    $('#password-description').textContent=forced?'请先修改初始或重置密码，再进入工作台。':'修改后会撤销其他登录会话，当前会话继续使用。';
    open('#password-form','#password-error');
  }
  $('#password-dialog').addEventListener('cancel',event=>{if(getMe()?.must_change_password)event.preventDefault();});
  $('#account-security').onclick=openPassword;$('#password-logout').onclick=onLogout;
  $('#new-staff').onclick=()=>open('#staff-create-form','#staff-create-error');
  function edit(u){target={...u};open('#staff-edit-form','#staff-edit-error');const form=$('#staff-edit-form');for(const key of ['display_name','role'])form.elements[key].value=u[key];form.elements.active.value=String(Boolean(u.active));$('#staff-edit-name').textContent=u.display_name;}
  function secure(u,action){
    target={...u,securityAction:action};const reset=action==='reset-password';
    $('#staff-security-title').textContent=reset?'重置员工密码':'撤销登录会话';$('#staff-security-name').textContent=u.display_name;
    $('#staff-reset-password-field').hidden=!reset;$('#staff-security-form').elements.initial_password.required=reset;
    $('#staff-security-description').textContent=reset?'所有登录会话将立即撤销，下次登录需修改重置密码。':'所有登录会话将立即撤销，账号岗位和密码保持原设置。';
    open('#staff-security-form','#staff-security-error');
  }
  async function load(){
    const version=++loadVersion,epoch=getEpoch();$('#organization-error').textContent='';
    try{
      const {items}=await api('/organization');if(version!==loadVersion||epoch!==getEpoch()||!getMe())return;
      const staff=items.filter(u=>u.role!=='guardian'),parents=items.filter(u=>u.role==='guardian'),summary=$('#organization-summary');summary.replaceChildren();
      for(const [name,count,tone] of [['本店员工',staff.length,'violet'],['有效账号',staff.filter(u=>u.active).length,'mint'],['登录会话',staff.reduce((n,u)=>n+u.session_count,0),'coral']]){
        const stat=el('article',undefined,`demo-stat ${tone}`);stat.append(el('span',name),el('strong',String(count)),el('small','当前门店范围'));summary.append(stat);
      }
      const box=$('#organization-items');box.replaceChildren();
      for(const u of staff){
        const card=el('article',undefined,'card staff-card');card.dataset.staffId=u.id;card.dataset.revision=u.revision;
        const head=el('div',undefined,'staff-head'),name=el('div');name.append(el('h2',u.display_name),el('small',u.username,'muted'));
        head.append(el('span',u.display_name.slice(0,1),'avatar'),name,el('span',u.active?'有效':'已停用',u.active?'badge mint':'badge neutral'));card.append(head);
        const details=el('div',undefined,'staff-meta');details.append(el('span',roleNames[u.role],'badge violet'),el('span',`${u.session_count} 个登录会话`,'small muted'));
        if(u.must_change_password)details.append(el('span','待修改密码','badge coral'));if(u.id===getMe().id)details.append(el('span','本人','badge sky'));card.append(details);
        if(u.manageable&&getMe().permissions.includes('organization:manage')){
          const actions=el('div',undefined,'record-actions');for(const [text,action] of [['编辑人员',()=>edit(u)],['重置密码',()=>secure(u,'reset-password')],['撤销会话',()=>secure(u,'revoke-sessions')]]){const button=el('button',text);button.type='button';button.onclick=action;actions.append(button);}card.append(actions);
        }
        box.append(card);
      }
      $('#organization-guardians').replaceChildren();$('#organization-guardian-section').hidden=!parents.length;
      for(const u of parents){const row=el('div',undefined,'family-row');row.append(el('strong',u.display_name),el('span',u.active?'有效':'已停用',u.active?'badge mint':'badge neutral'));$('#organization-guardians').append(row);}
      $('#new-staff').hidden=!getMe().permissions.includes('organization:manage');
    }catch(e){if(epoch===getEpoch()&&getMe())$('#organization-error').textContent=e.message;}
  }
  $('#refresh-organization').onclick=load;
  return {load,openPassword,reset(){target=undefined;loadVersion++;for(const clear of resets)clear();$('#organization-summary').replaceChildren();$('#organization-guardians').replaceChildren();$('#organization-error').textContent='';}};
}
