const $=s=>document.querySelector(s);
const sourceNames={employee:'员工记录',external:'外部资料转录',guardian_report:'家长自报转录'};
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
const size=bytes=>bytes<1024?`${bytes} B`:`${(bytes/1024).toFixed(1)} KB`;

export function createDocumentPanels({api,getMe,getCustomer,getEpoch,reload,toast,showLogin}){
  let current,files=[],editing,revoking,uploadPending,savePending,revokePending;
  const same=(id,epoch)=>getCustomer()===id&&getEpoch()===epoch&&getMe();
  const reset=()=>{current=undefined;files=[];editing=undefined;revoking=undefined;uploadPending=undefined;savePending=undefined;revokePending=undefined;for(const id of ['#document-form','#attachment-form','#revoke-file-form'])$(id).reset();$('#document-history').replaceChildren();};
  function link(f){
    const button=node('button',f.filename,'file-download');button.type='button';
    if(f.revoked_at){button.disabled=true;button.textContent+= ' · 已撤销';}
    button.onclick=async()=>{
      const epoch=getEpoch();button.disabled=true;
      try{
        const response=await fetch(`/api/attachments/${f.id}/download`);
        if(!response.ok){const b=await response.json();if(response.status===401)showLogin();throw Error((b.error?.message||'附件下载失败')+(b.request_id?`（故障编号：${b.request_id}）`:''));}
        const blob=await response.blob();if(epoch!==getEpoch())return;
        const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=f.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
      }catch(e){toast(e.message);}finally{button.disabled=Boolean(f.revoked_at);}
    };return button;
  }
  function openDocument(record){
    editing=record||null;$('#document-form').reset();savePending=undefined;$('#document-error').textContent='';
    $('#document-title').textContent=record?'修订资料 · 新增版本':'新建资料记录';
    $('#revision-fields').hidden=!record;$('#document-form').elements.revision_reason.required=Boolean(record);
    if(record){const form=$('#document-form');form.elements.title.value=record.title;form.elements.content.value=record.content;form.elements.source.value=record.source;}
    const box=$('#document-file-options');box.replaceChildren();
    if(!files.filter(f=>!f.revoked_at).length)box.append(node('p','暂无可关联附件，可先保存资料记录。','small muted'));
    for(const f of files.filter(f=>!f.revoked_at)){
      const label=node('label',undefined,'checkbox-option'),input=node('input');input.type='checkbox';input.name='attachment_ids';input.value=f.id;input.checked=Boolean(record?.attachments.some(a=>a.id===f.id));label.append(input,node('span',f.filename));box.append(label);
    }
    $('#document-dialog').showModal();
  }
  async function history(id){
    $('#document-history').replaceChildren(node('p','正在读取版本历史…','muted'));$('#history-dialog').showModal();
    try{
      const b=await api(`/documents/${id}`);const box=$('#document-history');box.replaceChildren();
      for(const v of b.versions){
        const card=node('article',undefined,'version-card'),header=node('div',undefined,'version-head');
        header.append(node('h3',v.title),node('span',`V${v.version}`,'badge violet'));card.append(header,node('p',`${sourceNames[v.source]} · ${new Date(v.created_at).toLocaleString('zh-CN',{hour12:false})}`,'small muted'),node('pre',v.content,'document-content'),node('p',`修订依据：${v.revision_reason}`,'small muted'));
        for(const f of v.attachments)card.append(link(f));box.append(card);
      }
    }catch(e){$('#document-history').replaceChildren(node('p',e.message,'form-error'));}
  }
  async function render(target,id){
    const epoch=getEpoch();target.replaceChildren(node('p','正在读取资料与附件…','small muted'));
    try{
      const [documents,attachments]=await Promise.all([api(`/customers/${id}/documents`),api(`/customers/${id}/attachments`)]);
      if(!same(id,epoch)||!target.isConnected)return;
      current=id;files=attachments.items;target.replaceChildren();
      const documentsBox=node('section',undefined,'record-panel'),head=node('div',undefined,'section-heading');head.append(node('h2',`资料记录与版本 · ${documents.items.length}`));
      if(getMe().permissions.includes('documents:write')){const button=node('button','＋ 新建资料');button.onclick=()=>openDocument();head.append(button);}documentsBox.append(head,node('p','资料来源与修订历史分别保留，当前为内部资料记录。','small muted'));
      if(!documents.items.length)documentsBox.append(node('p','尚无资料记录，可以从本次需求或外部资料开始。','small muted'));
      for(const record of documents.items){
        const card=node('article',undefined,'document-card');card.dataset.recordId=record.record_id;const title=node('div',undefined,'version-head');title.append(node('h3',record.title),node('span',`V${record.version}`,'badge violet'));
        card.append(title,node('p',sourceNames[record.source],'small muted'),node('pre',record.content,'document-content'));
        for(const f of record.attachments)card.append(link(f));
        const actions=node('div',undefined,'record-actions'),view=node('button','查看历史版本');view.onclick=()=>history(record.record_id);actions.append(view);
        if(getMe().permissions.includes('documents:write')){const edit=node('button','新增修订版本');edit.onclick=()=>openDocument(record);actions.append(edit);}card.append(actions);documentsBox.append(card);
      }
      const fileBox=node('section',undefined,'record-panel'),fileHead=node('div',undefined,'section-heading');fileHead.append(node('h2',`客户附件 · ${files.length}`));
      if(getMe().permissions.includes('attachments:upload')){const upload=node('button','＋ 上传附件');upload.onclick=()=>{$('#attachment-form').reset();$('#attachment-error').textContent='';uploadPending=undefined;$('#attachment-dialog').showModal();};fileHead.append(upload);}fileBox.append(fileHead);
      if(!files.length)fileBox.append(node('p','支持 PDF、PNG、JPEG 与 UTF-8 文本，单文件不超过 1 MB。','small muted'));
      for(const f of files){
        const row=node('div',undefined,'attachment-row');row.dataset.attachmentId=f.id;const info=node('div');info.append(link(f),node('small',`${size(f.size)} · ${f.created_at.slice(0,10)}${f.revoked_at?' · 访问已撤销':''}`));row.append(node('span','▤','file-symbol'),info);
        if(!f.revoked_at&&getMe().permissions.includes('attachments:revoke')&&(getMe().role==='manager'||f.created_by===getMe().id)){
          const revoke=node('button','撤销访问');revoke.onclick=()=>{revoking=f;revokePending=undefined;$('#revoke-file-form').reset();$('#revoke-file-error').textContent='';$('#revoke-file-name').textContent=f.filename;$('#revoke-file-dialog').showModal();};row.append(revoke);
        }
        fileBox.append(row);
      }
      target.append(documentsBox,fileBox);
    }catch(e){if(same(id,epoch)&&target.isConnected)target.replaceChildren(node('p',e.message,'form-error'));}
  }
  $('#attachment-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),file=form.elements.file.files[0],id=current,epoch=getEpoch();$('#attachment-error').textContent='';
    if(!file){$('#attachment-error').textContent='请选择附件';return;}
    if(file.size>1048576||file.size===0){$('#attachment-error').textContent='附件不能为空且不能超过 1 MB';return;}
    if(!uploadPending||uploadPending.file!==file||uploadPending.id!==id)uploadPending={file,id,key:crypto.randomUUID()};
    const type=file.type||({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',txt:'text/plain'}[file.name.split('.').pop().toLowerCase()]||'application/octet-stream');
    button.disabled=true;
    try{
      const r=await fetch(`/api/customers/${id}/attachments`,{method:'POST',headers:{'Content-Type':type,'X-File-Name':encodeURIComponent(file.name),'X-CSRF-Token':getMe().csrf,'Idempotency-Key':uploadPending.key},body:file});
      const b=await r.json();if(!same(id,epoch))return;if(!r.ok){if(r.status===401)showLogin();throw Error((b.error?.message||'上传失败')+(b.request_id?`（故障编号：${b.request_id}）`:''));}
      uploadPending=undefined;$('#attachment-dialog').close();form.reset();toast('附件已保存');await reload(id);
    }catch(e){if(same(id,epoch))$('#attachment-error').textContent=e.message;}finally{button.disabled=false;}
  };
  $('#document-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),id=current,epoch=getEpoch(),data=Object.fromEntries(new FormData(form));
    data.attachment_ids=new FormData(form).getAll('attachment_ids');const path=editing?`/documents/${editing.record_id}/versions`:`/customers/${id}/documents`;
    if(editing)data.expected_version=editing.version;else delete data.revision_reason;
    const fingerprint=JSON.stringify({path,data});if(!savePending||savePending.fingerprint!==fingerprint)savePending={fingerprint,key:crypto.randomUUID()};
    button.disabled=true;$('#document-error').textContent='';
    try{await api(path,{method:'POST',data,key:savePending.key});if(!same(id,epoch))return;savePending=undefined;$('#document-dialog').close();form.reset();toast(editing?'新增修订版本已保存，旧版保留':'资料记录已保存');editing=undefined;await reload(id);}
    catch(e){if(same(id,epoch))$('#document-error').textContent=e.message;}finally{button.disabled=false;}
  };
  $('#revoke-file-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),id=current,epoch=getEpoch(),data={reason:form.elements.reason.value},path=`/attachments/${revoking.id}/revoke`;
    const fingerprint=JSON.stringify({path,data});if(!revokePending||revokePending.fingerprint!==fingerprint)revokePending={fingerprint,key:crypto.randomUUID()};button.disabled=true;$('#revoke-file-error').textContent='';
    try{await api(path,{method:'POST',data,key:revokePending.key});if(!same(id,epoch))return;revokePending=undefined;$('#revoke-file-dialog').close();form.reset();toast('附件访问已撤销，历史引用继续保留');await reload(id);}
    catch(e){if(same(id,epoch))$('#revoke-file-error').textContent=e.message;}finally{button.disabled=false;}
  };
  return {render,reset};
}
