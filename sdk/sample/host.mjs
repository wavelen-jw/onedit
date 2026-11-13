// The Host uses the public SDK only. This file never imports editor internals.
import {OneditHostClient,openApprovalDigest} from '/sdk/index.js';

const $=id=>document.getElementById(id);
const demo=await (await fetch('/configuration',{cache:'no-store'})).json();
const frame=$('editor');
frame.src=demo.editorOrigin;
export let client,capabilities;
$('connect').addEventListener('click',async()=>{
 if(client)return;
 $('connect').disabled=true;
 try{
  const connection=await OneditHostClient.connect(frame,demo.editorOrigin,{
   sessionProof:demo.sessionProof,sessionId:demo.sessionId,permissions:['read','edit','lifecycle','save'],checkedOpen:true,
  });
  capabilities=await connection.client.request('getCapabilities',{});
  client=connection.client;$('actions').disabled=false;status('연결됨');
 }catch(e){status((e.code?e.code+': ':'')+e.message);$('connect').disabled=false;}
});
export const state=()=>client.request('getState',{});
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),n=>n.toString(16).padStart(2,'0')).join('');
const dst=()=>({documentId:crypto.randomUUID(),workingCopyId:crypto.randomUUID(),hostVersion:'initial'});
const status=text=>{$('status').textContent=text};
async function requestApproval(payload){
 const r=await fetch('/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 if(!r.ok)throw Error('예제 승인 발급이 거부됐습니다.');
 return {...payload,proof:(await r.json()).proof};
}
async function review(title,display){
 const d=$('review');
 $('review-title').textContent=title;
 $('preview').textContent=display;
 d.returnValue='cancel';d.showModal();
 return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='approve'),{once:true}));
}
export const markdown='# 예제 보고서\n\n보고서 본문입니다.\n\n| 항목 | 값 |\n| --- | --- |\n| 검토 | 완료 |';
export const spec={templateId:'public-report',templateVersion:'1',blocks:[
 {kind:'heading',styleId:'title',text:'구조화 보고서'},
 {kind:'paragraph',styleId:'body',text:'보고서 본문입니다.'},
 {kind:'table',styleId:'table',grid:{rowCount:2,colCount:2,cells:[
  {row:0,col:0,rowSpan:1,colSpan:2,text:'검토 결과'},
  {row:1,col:0,rowSpan:1,colSpan:1,text:'항목'},
  {row:1,col:1,rowSpan:1,colSpan:1,text:'값'},
 ]}},
]};
async function create(input){
 const {binding,dirty}=await state(),destination=dst();
 return client.createFromChat({...input,destination,replaceDirty:dirty},binding,async draft=>{
  const accepted=await review('새 문서 검토',(dirty?'승인하면 저장하지 않은 현재 문서를 교체합니다.\n':'')+JSON.stringify({
   blocks:draft.blocks,layout:draft.layout,warnings:draft.warnings,replacesUnsavedDocument:dirty,
  },null,2));
  if(!accepted)return null;
  return requestApproval({subjectId:draft.candidateId,digest:draft.previewDigest,kind:'create',
   binding,sessionId:client.sessionId,expiresAt:draft.expiresAt});
 },crypto.randomUUID());
}
async function open(){
 if(!capabilities.methods.includes('openDocument'))throw Error('이 편집기에서는 외부 열기를 지원하지 않습니다.');
 const file=$('source').files?.[0];
 const format=file?.name.split('.').at(-1).toLowerCase();
 if(!file||!capabilities.formats.open.includes(format)||file.size>capabilities.limits.fileBytes)throw Error('지원하는 HWP/HWPX 파일을 선택하세요.');
 const bytes=await file.arrayBuffer(),{binding}=await state(),operationId=crypto.randomUUID();
 const metadata={format,scope:'edit',destination:dst(),fileName:file.name,byteLength:bytes.byteLength,sha256:await sha(bytes)};
 if(!await review('파일 열기 검토',file.name+'\n'+(format==='hwp'?'HWP 원본은 유지됩니다. 출력은 HWPX입니다.':'출력 형식: HWPX')))return {cancelled:true};
 const expiresAt=Date.now()+60000;
 const approval=await requestApproval({sessionId:client.sessionId,expiresAt,digest:await openApprovalDigest(client.sessionId,operationId,binding,metadata,expiresAt)});
 return client.request('openDocument',{...metadata,bytes,approval},{binding,operationId});
}
let pinned;
async function capture(){
 pinned=await client.request('captureSelection',{},{binding:(await state()).binding});
 return pinned;
}
async function revise(){
 if(!pinned)throw Error('먼저 선택을 고정하세요.');
 const snapshot=pinned;pinned=undefined;
 return client.revisePinnedSelection(snapshot,
  // Mock: the actual model would receive only this segment key/text, not any proof or location.
  async ({segmentKey,text})=>({segmentKey,replacement:text==='b'?'B':text==='d'?'X':'검토'}),
  async draft=>await review('선택 수정 검토',draft.before+' → '+draft.after+'\n'+JSON.stringify(draft.layout))?
   requestApproval({subjectId:draft.proposalId,digest:draft.previewDigest,kind:'edit',binding:snapshot.binding,
    sessionId:client.sessionId,expiresAt:draft.expiresAt}):null,
  crypto.randomUUID());
}
async function download(){
 const before=await state();
 const result=await client.request('exportDocument',{format:'hwpx'},{binding:before.binding});
 const {bytes,byteLength,sha256}=result;
 if(bytes.byteLength!==byteLength||await sha(bytes)!==sha256)throw Error('내보낸 바이트가 일치하지 않습니다.');
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
 const link=document.createElement('a');link.href=url;link.download='onedit-example.hwpx';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
 // Download is not a save acknowledgement. Do not clear the editor's dirty state.
 return result;
}
let pending=false;
function action(id,fn){
 $(id).addEventListener('click',async()=>{
  if(pending)return;pending=true;
  try{const result=await fn();status(result?.cancelled?'취소됨':id+' 완료');}
  catch(e){status((e.code?e.code+': ':'')+e.message);}
  finally{pending=false;}
 });
}
action('markdown',()=>create({markdown}));action('spec',()=>create({spec}));
$('capture').addEventListener('mousedown',event=>event.preventDefault());
action('open',open);action('capture',capture);action('suggest',revise);action('download',download);
action('undo',async()=>client.request('undo',{},{binding:(await state()).binding}));
action('redo',async()=>client.request('redo',{},{binding:(await state()).binding}));
