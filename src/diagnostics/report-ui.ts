import { closeEditorDialog, showEditorDialog } from "../editor-popup-focus.js";
import {diagnostics,freezeDiagnostic,currentDiagnostic,diagnosticCapturedAt} from './runtime.js';
import {coarseEnvironment,makeReport,diagnosticView,validBuild,isSHA,REPORT_LIMITS,type BuildIdentity,type Category,type AttachmentKind,type ReportFile,type ReportPayload,type ReportReceipt} from './report-contract.js';
import {firstPartyTransport,ReportFailure,type ReportTransport} from './report-client.js';
import type {DiagnosticSnapshot} from './recorder.js';
export type ReportState={revision:number;undoCount:number;redoCount:number;dirty:boolean;selection:'caret'|'range'|'cell'|'object'|'none';selectionCount:number;composing:boolean};
let stateProvider:(()=>ReportState)|undefined,declared:string|undefined,observed:(()=>string|null)|undefined;
export function declareReportingRuntime(sha:string){if(isSHA(sha))declared=sha;}
/** Internal integration consumes existing primitive JS state only. No Core reads. */
export function configureReporting(context:{state:()=>ReportState;wasmDeclared:string;wasmObserved:()=>string|null}){stateProvider=context.state;declared=context.wasmDeclared;observed=context.wasmObserved;}
let installed=false;
export function installReportUI(doc:Document,transport:ReportTransport=firstPartyTransport()){
 if(installed)return;installed=true;const win=doc.defaultView!;
 const id=()=>win.crypto.randomUUID(),environment=coarseEnvironment(win.navigator.userAgent);
 let sessionId='';try{sessionId=id();}catch{/* no invented identifier; submit fails closed, local draft UI still works */}
 let metadata:{product:string;app:string}|undefined;
 // Bind declared bundle metadata to the actually loaded source generation.
 // Never attribute a still-open old tab to a newly deployed manifest.
 const loadedProduct=/\/assets\/([a-f0-9]{64})-[^/]+\.js$/.exec(new URL(import.meta.url).pathname)?.[1];
 const metadataAbort=new AbortController(),metadataTimer=setTimeout(()=>metadataAbort.abort(),3000);
 void fetch(new URL('../asset-manifest.json',import.meta.url),{cache:'no-store',credentials:'same-origin',redirect:'error',signal:metadataAbort.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(m=>{const ui=Object.entries(m.files??{}).find(([n])=>/-ui-[^/]+\.js$/.test(n));if(m.version===1&&isSHA(m.app)&&m.app===loadedProduct&&ui&&isSHA(ui[1]))metadata={product:m.app,app:ui[1]};}).catch(()=>{}).finally(()=>clearTimeout(metadataTimer));
 const build=():BuildIdentity|null=>{try{const b=metadata&&declared?{...metadata,wasmDeclared:declared,wasmObserved:observed?.()??null}:null;return validBuild(b)?b:null;}catch{return null;}};
 const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const button=(text:string)=>{const b=element('button',text);b.type='button';return b;};
 const openButton=button('문제 제보');openButton.id='reporting-open';openButton.setAttribute('aria-haspopup','dialog');
 const footerTools=element('span');footerTools.id='reporting-footer-tools';
 const version=element('span',loadedProduct ? '버전 '+loadedProduct.slice(0,12) : '버전 미확인');version.id='status-build-version';
 if(loadedProduct)version.title='현재 탭 빌드 '+loadedProduct;
 footerTools.append(version,openButton);doc.querySelector('body>footer')!.append(footerTools);
 const error=doc.getElementById('error')!,notice=element('div');notice.id='reporting-error-notice';error.before(notice);const errorButton=button('제보');errorButton.id='reporting-error-open';errorButton.title='문서 내용 없이 오류 진단 정보를 보냅니다.';const errorStatus=element('span');errorStatus.id='reporting-error-status';errorStatus.setAttribute('role','status');errorStatus.setAttribute('aria-live','polite');const errorDownload=button('제보 정보 저장');errorDownload.id='reporting-error-download';errorDownload.hidden=true;notice.append(error,errorButton,errorStatus,errorDownload);
 const d=element('dialog');d.id='report-dialog';d.setAttribute('aria-labelledby','report-title');d.setAttribute('aria-describedby','report-intro');
 const h=element('h2','문제 제보');h.id='report-title';const intro=element('p','설명 없이도 제보할 수 있습니다. 문서 내용은 자동으로 보내지 않습니다.');intro.id='report-intro';
 const form=element('form');form.noValidate=true;const field=(text:string,input:HTMLElement)=>{const l=element('label');l.append(element('span',text),input);return l;};
 const category=element('select');category.id='report-category';for(const [v,t]of[['input','글자 입력'],['layout','화면·조판'],['table','표 편집'],['load','문서 열기'],['save','저장'],['clipboard','가져오기·붙여넣기'],['performance','느린 동작'],['other','기타']]){const o=element('option',t);o.value=v;category.append(o);}category.value='other';
 const description=element('textarea');description.id='report-description';description.rows=3;description.maxLength=REPORT_LIMITS.description;description.placeholder='어떤 문제가 있었나요? (선택)';
 const expected=element('textarea');expected.id='report-expected';expected.rows=2;expected.maxLength=REPORT_LIMITS.expected;expected.placeholder='원하셨던 결과를 알려주세요. (선택)';
 const diag=element('input');diag.type='checkbox';diag.id='report-diagnostics';diag.checked=true;const diagLabel=field('오류 정보 포함',diag);diagLabel.className='report-check';
 const preview=element('details'),summary=element('summary','보내는 진단 정보 확인'),pre=element('pre');pre.id='report-diagnostic-preview';preview.append(summary,pre);
 const auto=element('input');auto.type='checkbox';auto.id='report-automatic';try{auto.checked=win.localStorage.getItem('ongle.reporting.auto.v1')==='true';}catch{auto.checked=false;}
 const autoLabel=field('처리되지 않은 오류를 자동으로 제보',auto);autoLabel.className='report-check';const autoNote=element('small','자동 제보에는 문서·화면·첨부파일이 포함되지 않습니다. 언제든 끌 수 있습니다.');
 const attachmentTitle=element('h3','첨부파일 (선택)'),attachmentNote=element('p','화면이나 파일에는 문서 내용이 포함될 수 있습니다. 직접 선택하고 체크한 항목만 전송합니다.');attachmentNote.className='report-muted';
 const attachmentRows=element('div');attachmentRows.className='report-attachments';
 const slots=new Map<AttachmentKind,{check:HTMLInputElement;input:HTMLInputElement;preview:HTMLElement;remove:HTMLButtonElement;file?:ReportFile;url?:string}>();
 for(const [kind,label,accept]of[['screenshot','화면 캡처','image/png,image/jpeg'],['document','문서 파일','.hwpx'],['file','다른 파일','']]as const){
  const row=element('section');row.className='report-attachment';const check=element('input');check.type='checkbox';check.id='report-consent-'+kind;const choice=field(label+' 첨부',check);choice.className='report-check';
  const pick=button('파일 선택');pick.dataset.reportPick=kind;const input=element('input');input.type='file';input.accept=accept;input.hidden=true;input.setAttribute('aria-label',label+' 파일 선택');
  const localPreview=element('div');localPreview.className='report-file-preview';const remove=button('제거');remove.hidden=true;remove.setAttribute('aria-label',label+' 제거');row.append(choice,pick,input,localPreview,remove);attachmentRows.append(row);const slot={check,input,preview:localPreview,remove}as{check:HTMLInputElement;input:HTMLInputElement;preview:HTMLElement;remove:HTMLButtonElement;file?:ReportFile;url?:string};slots.set(kind,slot);
  pick.onclick=()=>{if(!active)input.click();};remove.onclick=()=>{clearSlot(slot);};check.onchange=()=>updatePreview();
  input.onchange=()=>{const file=input.files?.[0],generation=epoch;input.value='';if(!file)return;void choose(kind,slot,file,generation);};
 }
 const status=element('p');status.id='report-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const actions=element('div');actions.className='report-actions';const download=button('작성 내용 저장');download.id='report-download';download.hidden=true;download.title='작성 내용과 선택한 진단 정보만 JSON으로 저장합니다. 첨부파일은 포함하지 않습니다.';
 const cancel=button('취소');cancel.id='report-cancel';const submit=element('button','제보 보내기');submit.type='submit';submit.id='report-submit';submit.className='primary';actions.append(download,cancel,submit);
 const options=element('details');options.className='report-options';options.id='report-options';options.append(element('summary','첨부·제보 설정'),field('문제 유형',category),field('기대했던 동작 (선택)',expected),diagLabel,preview,attachmentTitle,attachmentNote,attachmentRows,autoLabel,autoNote);
 form.append(field('설명 (선택)',description),options,status,actions);d.append(h,intro,form);doc.body.append(d);
 let prepared:WeakRef<DiagnosticSnapshot>|undefined,epoch=0,active:AbortController|undefined,lastSerialized='',lastPayload:ReportPayload|undefined,completed:ReportReceipt|undefined,partial:ReportReceipt|undefined,partialExpired=false,opening=false,autoBusy=false,autoWindow=0,autoCount=0,autoController:AbortController|undefined;
 let quickSnapshot:WeakRef<DiagnosticSnapshot>|undefined,quickPayload:ReportPayload|undefined,quickController:AbortController|undefined,quickEpoch=0;
 // Observe occurrence boundaries only. Never read error text/message/stack.
 const errorObserver=new MutationObserver(()=>{quickEpoch++;quickPayload=undefined;quickSnapshot=undefined;errorStatus.textContent='';errorDownload.hidden=true;if(!quickController){errorButton.disabled=false;errorButton.textContent='제보';}});
 errorObserver.observe(error,{childList:true,characterData:true,subtree:true});
 function captureQuick(){const s=currentDiagnostic()??freezeDiagnostic();quickSnapshot=s?new WeakRef(s):undefined;}
 async function sendQuick(){if(quickController)return;const generation=quickEpoch;try{
  if(!quickPayload){if(!quickSnapshot)captureQuick();const b=build();if(!b)throw new ReportFailure('UNAVAILABLE');const captured=quickSnapshot?.deref(),s=captured&&diagnostics.listSnapshots().includes(captured)?captured:null;quickPayload=makeReport({id:id(),sessionId,build:b,environment,category:'other',automatic:false,description:'오류 알림에서 제보 버튼을 눌렀습니다.',expected:'',diagnostics:true,snapshot:s,snapshotAtMs:diagnosticCapturedAt(s),files:[]});}
  const owner=new AbortController();quickController=owner;errorButton.disabled=true;errorButton.textContent='보내는 중…';errorStatus.textContent='';errorDownload.hidden=true;
  try{const receipt=await transport.send(quickPayload,[],owner.signal);if(owner.signal.aborted||generation!==quickEpoch)return;errorButton.textContent='접수 완료';errorStatus.textContent='접수번호 '+receipt.reportId;}
  catch{if(!owner.signal.aborted&&generation===quickEpoch){errorButton.disabled=false;errorButton.textContent='다시 제보';errorStatus.textContent='전송하지 못했습니다.';errorDownload.hidden=false;}}
  finally{if(quickController===owner)quickController=undefined;if(generation!==quickEpoch){errorButton.disabled=false;errorButton.textContent='제보';}}
 }catch{errorButton.disabled=false;errorButton.textContent='제보';errorStatus.textContent='제보 준비가 되지 않았습니다. 잠시 후 다시 눌러 주세요.';}}
 errorButton.onclick=()=>{void sendQuick();};
 errorDownload.onclick=()=>{if(!quickPayload)return;try{const blob=new Blob([JSON.stringify({report:quickPayload,attachmentsIncluded:false},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=element('a');link.href=url;link.download='문제제보.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{errorStatus.textContent='제보 정보를 저장하지 못했습니다.';}};
 const snapshot=()=>{const s=prepared?.deref();return s&&diagnostics.listSnapshots().includes(s)?s:null;};
 function clearSlot(slot:typeof slots extends Map<AttachmentKind,infer S>?S:never){if(slot.url)URL.revokeObjectURL(slot.url);slot.url=undefined;slot.file=undefined;slot.check.checked=false;slot.preview.replaceChildren();slot.remove.hidden=true;updatePreview();}
 const included=()=>[...slots.values()].filter(s=>s.check.checked&&s.file).map(s=>s.file!);
 function updatePreview(){const s=diag.checked?snapshot():null;pre.textContent=JSON.stringify({build:build(),environment,...diagnosticView(s,diagnosticCapturedAt(s)),attachments:included().map(f=>f.info)},null,2);}
 async function choose(kind:AttachmentKind,slot:typeof slots extends Map<AttachmentKind,infer S>?S:never,file:File,generation:number){try{
  if(!d.open||generation!==epoch)return;
  const total=[...slots.values()].reduce((n,s)=>n+(s===slot?0:s.file?.info.size??0),0)+file.size;
  if(file.size<=0||file.size>REPORT_LIMITS.fileBytes||total>REPORT_LIMITS.totalFileBytes){status.textContent='파일은 각각 10MB, 전체 20MB까지 첨부할 수 있습니다.';return;}
  let mediaType='application/octet-stream';
  if(kind==='screenshot'){const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))mediaType='image/png';else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mediaType='image/jpeg';else{status.textContent='화면 캡처는 PNG 또는 JPEG 파일을 선택하세요.';return;}}
  if(!d.open||generation!==epoch)return;clearSlot(slot);slot.file={file,info:{attachmentId:id(),kind,size:file.size,mediaType}};slot.preview.append(element('span',file.name+' · '+Math.ceil(file.size/1024)+'KB'));slot.remove.hidden=false;
  if(kind==='screenshot'){slot.url=URL.createObjectURL(new Blob([file],{type:mediaType}));const img=element('img');img.src=slot.url;img.alt='선택한 화면 캡처 미리보기';slot.preview.append(img);}
  status.textContent='파일을 확인한 뒤 첨부 체크를 선택하세요.';updatePreview();
 }catch{status.textContent='파일을 준비하지 못했습니다. 다시 선택하거나 첨부 없이 제보하세요.';}}
 function freeze(fromError:boolean){const s=fromError?currentDiagnostic()??freezeDiagnostic():freezeDiagnostic();prepared=s?new WeakRef(s):undefined;}
 function composing(){try{return stateProvider?.().composing===true;}catch{return true;}}
 function open(fromError:boolean){if(opening||d.open)return;if(composing()){openButton.title='조합 중인 글자를 확정한 뒤 다시 눌러 주세요.';return;}opening=true;try{
  if(!prepared)freeze(fromError);epoch++;completed=undefined;partial=undefined;partialExpired=false;lock(false);options.open=false;download.hidden=true;submit.textContent='제보 보내기';submit.disabled=false;submit.hidden=false;cancel.textContent='취소';status.textContent='';updatePreview();showEditorDialog(d);description.focus({preventScroll:true});
 }finally{opening=false;}}
 // Registered before editor pointer/focus handlers: freeze first, without moving focus.
 doc.addEventListener('pointerdown',e=>{const b=(e.target as Element|null)?.closest('button');if(!b||![openButton,errorButton,errorDownload].includes(b as HTMLButtonElement))return;if(b===errorButton||b===errorDownload){e.preventDefault();if(b===errorButton&&!quickPayload)captureQuick();return;}freeze(false);if(composing()){e.preventDefault();b.title='조합 중인 글자를 확정한 뒤 다시 눌러 주세요.';}},true);
 openButton.onclick=()=>open(false);
 d.addEventListener('close',()=>{if(d.open)return;epoch++;active?.abort();active=undefined;for(const s of slots.values())clearSlot(s);prepared=undefined;if(completed){description.value='';expected.value='';}if(completed||partial){lastPayload=undefined;lastSerialized='';}completed=undefined;partial=undefined;});cancel.onclick=()=>closeEditorDialog(d);
 d.addEventListener('cancel',e=>{e.preventDefault();closeEditorDialog(d);});
 d.addEventListener('keydown',e=>{e.stopPropagation();});
 auto.onchange=()=>{if(!auto.checked)autoController?.abort();try{win.localStorage.setItem('ongle.reporting.auto.v1',String(auto.checked));}catch{/* current page opt-in only when storage is unavailable */}status.textContent=auto.checked?'자동 오류 제보를 켰습니다. 문서·화면·첨부파일은 보내지 않습니다.':'자동 오류 제보를 껐습니다.';};
 diag.onchange=updatePreview;
 const payload=(automatic=false):ReportPayload=>{const b=build();if(!b)throw new ReportFailure('UNAVAILABLE');return makeReport({id:id(),sessionId,build:b,environment,category:category.value as Category,automatic,description:automatic?'':description.value.trim()?description.value:'문제 제보 버튼으로 접수했습니다.',expected:automatic?'':expected.value,diagnostics:automatic||diag.checked,snapshot:automatic?currentDiagnostic():snapshot(),snapshotAtMs:diagnosticCapturedAt(automatic?currentDiagnostic():snapshot()),files:automatic?[]:included()});};
 function lock(on:boolean){for(const e of form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement|HTMLSelectElement>('input,textarea,select,button'))e.disabled=on;cancel.disabled=false;}
 form.onsubmit=e=>{e.preventDefault();if(active||completed)return;void send();};
 async function send(){let current:ReportPayload;try{current=partial&&lastPayload?lastPayload:payload();const fingerprint=JSON.stringify({report:{...current,clientReportId:'same',occurredAt:lastPayload?.occurredAt??current.occurredAt},files:included().map(f=>f.info)});if(lastPayload&&fingerprint===lastSerialized)current=lastPayload;else{lastSerialized=fingerprint;lastPayload=current;}}catch{status.textContent='설명과 빌드 정보를 확인하세요. 전송할 수 없으면 작성 내용을 저장할 수 있습니다.';return;}
  active=new AbortController();const owner=active,generation=epoch;lock(true);status.textContent='제보를 보내고 있습니다…';
  try{const receipt=await transport.send(current,included(),owner.signal);if(owner.signal.aborted||generation!==epoch||!d.open)return;completed=receipt;partial=undefined;status.textContent='접수되었습니다. 접수번호 '+receipt.reportId+(included().length?' · 첨부 '+included().length+'개 전송 완료':'');submit.hidden=true;cancel.textContent='닫기';}
  catch(e){if(generation!==epoch||!d.open)return;download.hidden=false;const code=e instanceof ReportFailure?e.code:'NETWORK';if(e instanceof ReportFailure&&e.receipt){partial=e.receipt;partialExpired=code==='UPLOAD_EXPIRED';submit.textContent='첨부 다시 보내기';status.textContent='제보는 접수되었습니다. 접수번호 '+partial.reportId+(partialExpired?' · 첨부 전송 시간이 만료되었습니다. 작성 내용은 저장할 수 있습니다.':' · 일부 첨부파일을 보내지 못했습니다. 다시 보내거나 작성 내용을 저장하세요.');}else status.textContent=code==='CONFLICT'?'전송 내용이 기존 접수와 다릅니다. 내용을 저장한 뒤 다시 확인해 주세요.':code==='RATE_LIMIT'?'제보가 많아 잠시 후 다시 시도해 주세요. 작성 내용은 유지됩니다.':'제보를 보내지 못했습니다. 작성 내용은 유지되며 다시 보내거나 저장할 수 있습니다.';}
  finally{if(active===owner){active=undefined;lock(false);if(partial||completed){for(const e of form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select'))e.disabled=true;for(const e of form.querySelectorAll<HTMLButtonElement>('[data-report-pick],.report-attachment button'))e.disabled=true;submit.disabled=partialExpired;}}}
 }
 download.onclick=()=>{try{let value:unknown;try{value=(completed||partial)&&lastPayload?lastPayload:payload();}catch{const s=diag.checked?snapshot():null;value={schemaVersion:1,unsubmitted:true,build:build(),environment,description:description.value,expected:expected.value,...diagnosticView(s,diagnosticCapturedAt(s))};}const blob=new Blob([JSON.stringify({report:value,attachmentsIncluded:false,...(completed||partial)?{receipt:{reportId:(completed??partial)!.reportId,receivedAt:(completed??partial)!.receivedAt}}:{}},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=element('a');link.href=url;link.download='문제제보.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='작성 내용과 선택한 진단 정보의 저장을 요청했습니다. 첨부파일은 포함하지 않습니다.';}catch{status.textContent='저장하지 못했습니다. 입력한 설명을 복사해 보관해 주세요.';}};
 function unhandled(){const s=freezeDiagnostic('UNKNOWN_ERROR','unknown');if(!s||!auto.checked||autoBusy||!build())return;const now=performance.now();if(now-autoWindow>60000){autoWindow=now;autoCount=0;}if(autoCount>=3)return;autoCount++;autoBusy=true;const controller=new AbortController();autoController=controller;void(async()=>{try{const b=build()!;const data=makeReport({id:id(),sessionId,build:b,environment,category:'other',automatic:true,description:'',expected:'',diagnostics:true,snapshot:s,snapshotAtMs:diagnosticCapturedAt(s),files:[]});await transport.send(data,[],controller.signal);}catch{/* report failure is deliberately not reported */}finally{autoBusy=false;autoController=undefined;}})();}
 win.addEventListener('error',unhandled);win.addEventListener('unhandledrejection',unhandled);
 win.addEventListener('pagehide',()=>{active?.abort();autoController?.abort();quickController?.abort();quickPayload=undefined;quickSnapshot=undefined;errorObserver.disconnect();diagnostics.clear();for(const s of slots.values())if(s.url)URL.revokeObjectURL(s.url);});
 return {dialog:d};
}
