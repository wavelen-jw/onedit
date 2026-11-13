import {AIError,need,exact,isBinding,isApproval,isNewBinding,isId,sameBinding,limits,methods,digest,validateValue,contractVersion,
 type Approval,type Binding,type NewBinding,type Envelope,type Method,type Permission,type ErrorBody} from './contract.js';
import {compileDocumentSpec,catalog} from './document-spec.js';
import {captureRange,readRange,replacementText,current,type Capture} from './selection.js';
import {ExternalHost,HostError,sha256} from '../host-v2.js';
import {composeDocumentPlan} from '../markdown-compose.js';
import {AiNativeRange,AiNativeError} from '../ai-native-range.js';
import {assertSafeHwpxEntryNames} from '../hwpx-open-boundary.js';
import {analyzeMarkdown} from '../markdown-import.js';
import {coreRuntimeIdentity,isCheckedExternalSibling} from '../core-runtime.js';
import type {HwpDocument} from '../../development/core/rhwp.js';
import {openApprovalDigest,OpenRefusal,sniffFile,validOpenName,type HostOpenGate,type OpenApproval,type OpenMetadata,type OpenedSource} from '../ai-host-v1/open.js';

type OperationKind='commitPreparedDocument'|'applyProposal'|'openDocument';
type OpenDenial={allowed:false;code:'STALE_DOCUMENT'|'INVALID_APPROVAL'|'PERMISSION_DENIED'};
type OpenSession={usedDocuments:Set<string>;usedCopies:Set<string>;source?:OpenedSource;instance?:string};
const hostOpenSessions=new WeakMap<ExternalHost['host'],OpenSession>();
export type AuthorityRequest={method:Method;sessionId:string;origin:string;permissions?:readonly Permission[];binding?:Binding;approval?:Approval;
 operation?:{id:string;kind:OperationKind;phase:'authorize-write'|'read-receipt'|'cancel-pending'};
 open?:{file:OpenMetadata;approval:OpenApproval};
 receipt?:{exportId:string;binding:Binding;sha256:string;newVersion:string;proof:string};destination?:NewBinding};
export type Authority=(request:AuthorityRequest)=>Promise<boolean|OpenDenial>;
export type Adopter=(bytes:Uint8Array,binding:NewBinding,generated:boolean,source?:OpenedSource,prepared?:HwpDocument)=>void;
type Reply={ok:true;result:unknown}|{ok:false;error:ErrorBody};
type Target={id:string;binding:Binding;digest:string;expiresAt:number};
type Draft=Target&{bytes:Uint8Array;destination:NewBinding;replaceDirty:boolean};
type Proposal=Target&{intent:ReturnType<AiNativeRange['previewDetached']>;captureId:string};
type Operation={fingerprint:string;binding:Binding;kind:OperationKind;stage:'pending'|'committed'|'failed'|'cancelled';reply?:Reply};
type Ticket={binding:Binding;sha256:string;saveId:string};
const local=['getCapabilities','getState','getCatalog','getOperation','cancelOperation'];
const transaction=['commitPreparedDocument','applyProposal'];
const map:Record<string,ErrorBody['code']>={
 BUSY_COMPOSITION:'COMPOSITION_IN_PROGRESS',REVISION_CONFLICT:'STALE_DOCUMENT',STALE_SELECTION:'STALE_DOCUMENT',
 STALE_PROPOSAL:'PREVIEW_EXPIRED',TARGET_CONFLICT:'SOURCE_MISMATCH',PRESERVATION_FAILED:'TRANSACTION_ROLLED_BACK',
 UNSUPPORTED_STRUCTURE:'UNSUPPORTED_SELECTION',READ_ONLY:'PERMISSION_DENIED',STALE_SAVE:'SAVE_CONFLICT',
 UNSUPPORTED_RANGE:'UNSUPPORTED_SELECTION',INVALID_GRAPHEME_BOUNDARY:'UNSUPPORTED_SELECTION',
 UNSUPPORTED_GRAPHEME_RUNTIME:'UNSUPPORTED_SELECTION',INVALID_REPLACEMENT:'INVALID_SPEC',RANGE_TOO_LARGE:'CONTENT_LIMIT_EXCEEDED',
 RANGE_LIMIT:'BUSY',BUSY_TRANSACTION:'BUSY',MIXED_FORMAT_UNSUPPORTED:'MIXED_FORMAT_UNSUPPORTED',
 CONTENT_LIMIT_EXCEEDED:'CONTENT_LIMIT_EXCEEDED',STALE_DOCUMENT:'STALE_DOCUMENT',RECOVERY_REQUIRED:'RECOVERY_REQUIRED',
 COMPOSITION_IN_PROGRESS:'COMPOSITION_IN_PROGRESS',NO_SELECTION:'NO_SELECTION',
 INVALID_RECEIPT:'SAVE_CONFLICT',RECEIPT_CONFLICT:'SAVE_CONFLICT',SAVE_LIMIT:'BUSY',HANDLE_LIMIT:'BUSY',PROPOSAL_LIMIT:'BUSY',
};
const fail=(e:unknown):Reply=>({ok:false,error:(e instanceof AIError?e:
 new AIError((e instanceof HostError||e instanceof AiNativeError)?map[e.code]??'INVALID_REQUEST':'INVALID_REQUEST','요청을 적용하지 못했습니다. 현재 작업본을 확인하세요.')).toWire()});
export class AIService {
 private closed=false;
 private queue=Promise.resolve<unknown>(undefined);
 private pending=0;
 private drafts=new Map<string,Draft>();
 private captures=new Map<string,Capture&{binding:Binding}>();
 private proposals=new Map<string,Proposal>();
 private operations=new Map<string,Operation>();
 private exports=new Map<string,Ticket>();
 private native:AiNativeRange;
 private lastEdit?:{id:string;binding:Binding};
 private recovery?:string;
 private selectionRevision=0;
 private selectionStamp?:string;
 private replacingOpen=false;
 constructor(readonly engine:ExternalHost,readonly sessionId:string,readonly origin:string,private permissions:readonly Permission[],
  private authorize:Authority,private adopt:Adopter,private busy:()=>boolean,private redraw:()=>void,
  private clock=Date.now,private hostV1=false,private openFeature=false,private openGate?:HostOpenGate){this.native=new AiNativeRange(engine.editor)}
 isReplacingOpen(){return this.replacingOpen;}
 private openFormats(){
  return this.hostV1&&this.openFeature&&this.permissions.includes('lifecycle')?this.openGate?.formats??[]:[];
 }
 private openedSource():OpenedSource|undefined{
  const record=hostOpenSessions.get(this.engine.host);
  return record&&record.instance===this.engine.a.documentId?record.source:undefined;
 }
 private openSession(){
  const key=this.engine.host;let record=hostOpenSessions.get(key);
  if(!record){record={usedDocuments:new Set(),usedCopies:new Set()};hostOpenSessions.set(key,record);}
  return record;
 }
 binding():Binding{
  const a=this.engine.a,b=this.engine.host.binding;
  return {documentId:b?.documentId??a.documentId,documentInstanceId:a.documentId,
   workingCopyId:b?.workingCopyId??a.documentId,mutationRevision:a.revision,hostVersion:b?.baseVersion??'local'};
 }
 private observeSelection(){
  const stamp=JSON.stringify([this.engine.a.documentId,this.engine.editor.selection]);
  if(stamp!==this.selectionStamp){this.selectionStamp=stamp;this.selectionRevision++}
  return this.selectionRevision;
 }
 state(){const a=this.engine.a,e=this.engine.editor;return {binding:this.binding(),dirty:a.revision!==a.savedRevision,pageCount:a.pageCount,
  ...(this.hostV1?{selectionRevision:this.observeSelection()}:{}),
  ...(this.openFeature&&this.openedSource()?{source:this.openedSource()}:{}),
  hasSelection:e.selection.kind==='text'&&JSON.stringify(e.selection.focus)!==JSON.stringify(e.selection.anchor),composition:!!a.transientEdit,
  readonly:a.scope!=='edit'||a.documentLocked,canUndo:e.history.undoStack.length>0,canRedo:e.history.redoStack.length>0};}
 close(){this.closed=true;this.clearHandles();this.exports.clear();this.operations.clear();}
 private alive(){need(!this.closed,'SESSION_CLOSED','연결이 종료되었습니다.');}
 private allowed(method:Method){
  this.alive();need(this.permissions.includes(methods[method]),'PERMISSION_DENIED','이 세션에 해당 권한이 없습니다.');
 }
 private ready(b:Binding,write=false){
  this.alive();const a=this.engine.a;
  need(!a.transientEdit,'COMPOSITION_IN_PROGRESS','조합 중에는 선택을 읽거나 문서를 바꾸지 않습니다.');
  need(!this.busy(),'BUSY','현재 편집기 작업이 끝난 뒤 다시 시도하세요.');
  need(sameBinding(b,this.binding()),'STALE_DOCUMENT','문서 또는 버전이 바뀌었습니다.','recapture');
  need(this.recovery!==a.documentId,'RECOVERY_REQUIRED','복구 확인이 필요한 읽기 전용 작업본입니다.','reopen-copy');
  if(write)need(a.scope==='edit'&&!a.documentLocked,'PERMISSION_DENIED','읽기 전용 작업본입니다.');
 }
 private async auth(method:Method,binding?:Binding,extra:Partial<AuthorityRequest>={}){
  let decision:boolean|OpenDenial=false;
  try{decision=await this.authorize({method,sessionId:this.sessionId,origin:this.origin,...(binding?{binding}:{}),...extra})}catch{/* deny */}
  this.alive();
  if(method==='openDocument'&&typeof decision==='object'&&decision.allowed===false&&
   ['STALE_DOCUMENT','INVALID_APPROVAL','PERMISSION_DENIED'].includes(decision.code))
   throw new AIError(decision.code,'연결된 서비스에서 문서 열기를 승인하지 않았습니다.');
  need(decision===true,extra.approval?'INVALID_APPROVAL':extra.receipt?'SAVE_CONFLICT':'PERMISSION_DENIED','현재 권한 또는 승인 증거를 확인할 수 없습니다.');
 }
 private clearHandles(){
  this.native.clear();
  this.captures.clear();this.proposals.clear();this.drafts.clear();
 }
 private prune(){
  const now=this.clock(),binding=this.binding();
  for(const [id,c]of this.captures)if(c.expiresAt<=now||!sameBinding(c.binding,binding)){
   this.captures.delete(id);this.native.release(c.rangeId);
  }
  for(const [id,p]of this.proposals)if(p.expiresAt<=now||!sameBinding(p.binding,binding)){
   this.proposals.delete(id);
  }
  for(const [id,d]of this.drafts)if(d.expiresAt<=now||!sameBinding(d.binding,binding))this.drafts.delete(id);
 }
 private approval(p:unknown,subject:Target,kind:Approval['kind']):Approval{
  need(p!==undefined,'APPROVAL_REQUIRED','미리보기에 대한 사용자 승인이 필요합니다.');
  need(isApproval(p),'INVALID_APPROVAL','승인 증거 형식이 올바르지 않습니다.');
  const a=p as Approval;
  need(a.kind===kind&&a.subjectId===subject.id&&a.sessionId===this.sessionId&&a.digest===subject.digest&&sameBinding(a.binding,subject.binding)&&
   a.expiresAt>this.clock()&&a.expiresAt<=subject.expiresAt,'INVALID_APPROVAL','이 미리보기·문서·세션의 승인이 아닙니다.');
  return a;
 }
 private refresh(){try{this.redraw();return {displayRefreshed:true}}catch{return{displayRefreshed:false}}}
 private ensureLive(op?:Operation){this.alive();if(op?.stage==='cancelled')throw new AIError('OPERATION_CANCELLED','작업을 적용하기 전에 취소했습니다.');}
 async request(value:unknown):Promise<Reply>{
  try{
   this.alive();
   need(exact(value,['type','contractVersion','requestId','sessionId','method'],['binding','params','idempotencyKey']),'INVALID_REQUEST','요청 헤더가 올바르지 않습니다.');
   const e=value as Envelope;
   need(e.type==='request'&&e.contractVersion===contractVersion,'UNSUPPORTED_CONTRACT','지원되지 않는 온편집 AI 계약입니다.');
   need(e.sessionId===this.sessionId&&isId(e.requestId),'INVALID_REQUEST','다른 세션 또는 요청 ID입니다.');
   need(typeof e.method==='string'&&(e.method as string)!=='connect'&&Object.hasOwn(methods,e.method),'UNSUPPORTED_CAPABILITY','지원되지 않는 명령입니다.');
   this.allowed(e.method);
   const p=e.params??{};
   const binary=e.method==='openDocument'&&p&&typeof p==='object'&&'bytes'in p&&p.bytes instanceof Uint8Array?p.bytes:undefined;
   validateValue(e,binary);
   if(e.method==='getOperation'||e.method==='cancelOperation'){
    need(exact(p,['operationId'])&&isId(p.operationId),'INVALID_REQUEST','작업 ID가 필요합니다.');
    const id=(p as {operationId:string}).operationId;
    const op=this.operations.get(id);need(op,'OPERATION_NOT_FOUND','이 세션의 작업이 아닙니다.');
    await this.auth(e.method,op!.binding,{operation:{id,kind:op!.kind,phase:e.method==='getOperation'?'read-receipt':'cancel-pending'}});
    if(e.method==='cancelOperation'){
     if(op!.stage==='committed')return {ok:true,result:{code:'ALREADY_COMMITTED',receipt:op!.reply}};
     if(op!.stage==='pending')op!.stage='cancelled';
    }
    return {ok:true,result:{operationId:id,status:op!.stage,...(op!.reply?{receipt:op!.reply}:{})}};
   }
   need(this.pending<1+limits.queue,'BUSY','문서 작업 대기열이 가득 찼습니다.');
   this.pending++;
   const selection=e.method==='captureSelection'?this.selectionKey():undefined;
   const run=async()=>{try{return await this.execute(e,p,selection)}catch(x){return fail(x)}finally{this.pending--}};
   const result=this.queue.then(run,run);this.queue=result;return await result;
  }catch(e){return fail(e)}
 }
 private selectionKey(){
  return this.hostV1?String(this.observeSelection()):JSON.stringify(this.engine.editor.selection);
 }
 private async execute(e:Envelope,input:unknown,selection?:string):Promise<Reply>{
  this.allowed(e.method);
  let op:Operation|undefined,id=e.idempotencyKey;
  const open=e.method==='openDocument';
  if(open&&!this.openFormats().length)throw new AIError('UNSUPPORTED_CAPABILITY','이 편집기에는 파일 검사기가 연결되지 않았습니다.');
  let fingerprintInput=input;
  if(open){
   const p=this.checkedOpenInput(input);
   need(await sha256(p.bytes)===p.file.sha256,'INVALID_REQUEST','파일 SHA-256이 일치하지 않습니다.');
   fingerprintInput=[p.file,p.approval]; // fingerprint exact verified bytes without expanding them into JSON
  }
  if(open||transaction.includes(e.method)){
   need(isId(id)&&isBinding(e.binding),'INVALID_REQUEST','멱등성 키와 문서 바인딩이 필요합니다.');
   const kind=e.method as Operation['kind'];
   const fingerprint=await digest([e.method,e.binding??null,fingerprintInput]);this.alive();
   const existing=this.operations.get(id!);
   if(existing){
    need(existing.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','같은 키에 다른 작업을 사용할 수 없습니다.');
    await this.auth('getOperation',existing.binding,{operation:{id:id!,kind:existing.kind,phase:'read-receipt'}});
    return structuredClone(existing.reply??{ok:true,result:{status:existing.stage}});
   }
   need(this.operations.size<limits.receipts,'BUSY','이 세션의 작업 영수증 한도입니다.');
   op={fingerprint,binding:e.binding!,kind,stage:'pending'};this.operations.set(id!,op);
  }else need(id===undefined,'INVALID_REQUEST','이 명령에는 멱등성 키를 사용하지 않습니다.');
  try{
   return {ok:true,result:await this.route(e,input,op,selection)};
  }catch(x){
   const reply=fail(x);
   if(op){if(op.stage!=='cancelled')op.stage='failed';op.reply=reply}
   return reply;
  }
 }
 // Publish the receipt in the same synchronous turn as the write. A cancel
 // authorization can resume before the async route's result reaches execute.
 private commitOperation<T>(op:Operation|undefined,result:T):T{
  if(op){op.reply=structuredClone({ok:true,result});op.stage='committed';}
  return result;
 }
 private checkedOpenInput(input:unknown){
  need(exact(input,['format','scope','bytes','byteLength','sha256','destination','approval'],['fileName']),'INVALID_REQUEST','문서 열기 인자를 확인하세요.');
  const p=input as Record<string,unknown>,bytes=p.bytes;
  need(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=limits.fileBytes&&bytes.byteLength===p.byteLength,
   'INVALID_REQUEST','파일 길이가 일치하지 않습니다.');
  need((p.format==='hwp'||p.format==='hwpx')&&(p.scope==='edit'||p.scope==='readonly')&&isNewBinding(p.destination)&&
   typeof p.sha256==='string'&&/^[a-f0-9]{64}$/.test(p.sha256),'INVALID_REQUEST','파일 메타데이터를 확인하세요.');
  const f=sniffFile(bytes as Uint8Array);
  if(f===undefined||f!==p.format)throw new AIError('FORMAT_MISMATCH','파일 내용과 요청 형식이 다릅니다.');
  need(!Object.hasOwn(p,'fileName')||validOpenName(p.fileName,f),'INVALID_REQUEST','파일 이름과 형식을 확인하세요.');
  const proof=p.approval;
  need(exact(proof,['sessionId','expiresAt','digest','proof']),'INVALID_APPROVAL','연결된 서비스의 열기 승인이 필요합니다.');
  const approval=proof as OpenApproval;
  need(approval.sessionId===this.sessionId&&Number.isSafeInteger(approval.expiresAt)&&typeof approval.digest==='string'&&/^[a-f0-9]{64}$/.test(approval.digest)&&
   typeof approval.proof==='string'&&approval.proof.length>0&&approval.proof.length<=2048,'INVALID_APPROVAL','열기 승인 정보가 올바르지 않습니다.');
  const {format,scope,byteLength,sha256:hash,destination}=p;
  return {bytes:bytes as Uint8Array,approval,file:{format,scope,byteLength,sha256:hash,destination,
   ...(typeof p.fileName==='string'?{fileName:p.fileName}:{})} as OpenMetadata};
 }
 private async openDocument(input:unknown,b:Binding,e:Envelope,op?:Operation){
  const {file,bytes,approval}=this.checkedOpenInput(input);
  need(this.openFormats().includes(file.format),'UNSUPPORTED_CAPABILITY','이 파일 형식의 검사가 지원되지 않습니다.');
  need(file.scope==='readonly'||this.permissions.includes('edit'),'PERMISSION_DENIED','이 세션에 편집 권한이 없습니다.');
  const state=this.openSession();
  const guard=()=>{
   this.ensureLive(op);this.ready(b);
   const now=this.clock();
   need(approval.expiresAt>now&&approval.expiresAt<=now+600000,'INVALID_APPROVAL','열기 승인이 만료되었습니다.');
   need(!this.state().dirty,'UNSAVED_CHANGES','저장되지 않은 변경을 보존하려면 먼저 저장하세요.');
   need(state.usedDocuments.size<128&&state.usedCopies.size<128,'BUSY','이 편집기에서 열 수 있는 작업본 한도입니다.');
   need(b.documentId!==file.destination.documentId&&b.workingCopyId!==file.destination.workingCopyId&&
    !state.usedDocuments.has(file.destination.documentId)&&!state.usedCopies.has(file.destination.workingCopyId),
    'DUPLICATE_DOCUMENT','같은 문서 또는 작업본은 다시 열 수 없습니다.');
  };
  guard();
  const operation={id:e.idempotencyKey!,kind:'openDocument' as const,phase:'authorize-write' as const};
  need(approval.digest===await openApprovalDigest(this.sessionId,operation.id,b,file,approval.expiresAt),'INVALID_APPROVAL','다른 파일 또는 작업본의 승인입니다.');
  guard();
  const authorization={operation,destination:file.destination,open:{file,approval}};
  await this.auth('openDocument',b,authorization);
  guard();
  const original=this.engine.a.doc,identity=coreRuntimeIdentity(original);
  let inspection;
  try{inspection=await this.openGate!.inspect(original,bytes,file.format);}
  catch(error){throw new OpenRefusal(error);}
  let detached:HwpDocument|undefined=inspection?.document;
  // Never free the live document, even if a faulty trusted gate returns it.
  if(detached===original||detached===this.engine.a.doc)detached=undefined;
  try{
   need(identity&&detached&&inspection.format===file.format&&coreRuntimeIdentity(detached)===identity&&isCheckedExternalSibling(original,detached),
    'UNSUPPORTED_UNSAFE_FILE','파일 검사 결과가 현재 편집기의 런타임과 다릅니다.');
   need(await sha256(bytes)===file.sha256,'UNSUPPORTED_UNSAFE_FILE','검사 중 파일이 바뀌었습니다.');
   guard();
   await this.auth('openDocument',b,authorization);
   guard();
   // The second policy await can retire the source even if its logical binding is unchanged.
   need(this.engine.a.doc===original&&isCheckedExternalSibling(original,detached!),
    'UNSUPPORTED_UNSAFE_FILE','파일 검사 후 현재 문서 런타임이 바뀌었습니다.');
   const source:OpenedSource={format:file.format,scope:file.scope,exportFormats:file.scope==='edit'?['hwpx']:[],conversionRequired:file.format==='hwp',
    ...(file.fileName?{fileName:file.fileName}:{})};
   this.replacingOpen=true;
   try{
    const owned=detached!;detached=undefined; // adopter consumes the handle, including on refusal
    this.adopt(bytes,file.destination,false,source,owned);
    state.usedDocuments.add(file.destination.documentId);state.usedCopies.add(file.destination.workingCopyId);
    state.source=source;state.instance=this.engine.a.documentId;
    this.lastEdit=undefined;this.clearHandles();this.exports.clear();
   }catch{throw new AIError('UNSUPPORTED_UNSAFE_FILE','문서를 안전하게 준비하거나 적용하지 못했습니다.');}
   finally{this.replacingOpen=false;}
   return this.commitOperation(op,{state:this.state(),...this.refresh()});
  }finally{if(detached&&detached!==this.engine.a.doc)detached.free();}
 }
 private async route(e:Envelope,input:unknown,op?:Operation,selection?:string):Promise<unknown>{
  const method=e.method;
  if(local.includes(method)){
   need(exact(input,[]),'INVALID_REQUEST','이 명령에는 인자가 없습니다.');
   await this.auth(method,method==='getState'?this.binding():undefined);
   if(method==='getState')return this.state();
   if(method==='getCatalog')return catalog;
   const open=this.openFormats();
   return {contractVersion,methods:Object.keys(methods).filter(k=>(k!=='openDocument'||open.length>0)&&this.permissions.includes(methods[k as Method])),
    formats:{open,export:this.openFeature&&this.openedSource()?.scope==='readonly'?[]:['hwpx']},
    ...(this.openFeature?{openPolicy:{availability:open.length?'guarded':'unavailable',scopes:open.length?(this.permissions.includes('edit')?['edit','readonly']:['readonly']):[],editRequiresCheckedExport:true,hwpOverwrite:false}}:{}),selection:'one uniform text range in body or unmerged top-level table cell',limits,
    notes:['HWP original write and SWP unavailable','Exact local-font registration and native Hancom roundtrip not certified']};
  }
  need(isBinding(e.binding),'INVALID_REQUEST','문서 바인딩이 필요합니다.');
  const b=e.binding!;
  const writing=['commitPreparedDocument','applyProposal','undo','redo'].includes(method);
  this.ready(b,writing);
  const fields=(r:string[],o:string[]=[]):Record<string,unknown>=>{need(exact(input,r,o),'INVALID_REQUEST','허용된 명령 인자만 보내세요.');return input as Record<string,unknown>};
  const id=(v:unknown):string=>{need(isId(v),'INVALID_REQUEST','올바른 핸들이 필요합니다.');return v as string};
  const h=this.engine;
  const find=<T extends Target>(map:Map<string,T>,key:unknown):T=>{
   const t=map.get(id(key));need(t&&t.expiresAt>this.clock(),'PREVIEW_EXPIRED','미리보기가 만료됐습니다.','recapture');
   need(sameBinding(t!.binding,b),'STALE_DOCUMENT','문서 또는 버전이 바뀌었습니다.','recapture');return t!;
  };
  // For writes with approval, validate the immutable preview before contacting policy.
  if(method==='commitPreparedDocument'||method==='applyProposal'){
   const p=fields([method==='applyProposal'?'proposalId':'candidateId'],['approval']);
   const d=method==='applyProposal'?find(this.proposals,p.proposalId):find(this.drafts,p.candidateId);
   const proof=this.approval(p.approval,d,method==='applyProposal'?'edit':'create');
   await this.auth(method,b,{approval:proof,operation:{id:e.idempotencyKey!,kind:method,phase:'authorize-write'},...('destination'in d?{destination:d.destination}:{} )});
   this.ensureLive(op);this.ready(b,true);this.approval(proof,d,proof.kind);
   if('bytes'in d){
    need(d.replaceDirty||!this.state().dirty,'UNSAVED_CHANGES','저장되지 않은 문서 교체는 따로 승인해야 합니다.');
    this.adopt(d.bytes,d.destination,true);this.clearHandles();this.exports.clear();
    return this.commitOperation(op,{state:this.state(),...this.refresh()});
   }
   let result;
   try{result=this.native.apply(d.intent);}
   catch(error){
    if(error instanceof AiNativeError&&error.code==='RECOVERY_REQUIRED'){
     this.recovery=h.a.documentId;this.refresh();
     throw new AIError('RECOVERY_REQUIRED','원복 확인 실패. 읽기 전용 상태에서 작업본을 보존했습니다.','reopen-copy');
    }
    if(error instanceof AiNativeError&&map[error.code]&&error.code!=='PRESERVATION_FAILED')throw error;
    throw new AIError('TRANSACTION_ROLLED_BACK','수정에 실패해 이전 문서를 복원했습니다.');
   }
   this.proposals.delete(d.id);
   if(result.committed)this.lastEdit={id:e.idempotencyKey!,binding:this.binding()};
   return this.commitOperation(op,{applied:result.committed,state:this.state(),...this.refresh()});
  }
  if((method==='exportDocument'||method==='acknowledgeSaved')&&this.openedSource()?.scope==='readonly')
   throw new AIError('PERMISSION_DENIED','읽기 전용으로 연 문서는 내보낼 수 없습니다.');
  if(method==='acknowledgeSaved'){
   const p=fields(['exportId','sha256','hostVersion','proof']);const t=this.exports.get(id(p.exportId));
   need(t&&t.binding.documentInstanceId===b.documentInstanceId&&t.binding.workingCopyId===b.workingCopyId&&
    t.binding.hostVersion===b.hostVersion&&p.sha256===t.sha256&&isId(p.hostVersion)&&p.hostVersion!==b.hostVersion&&typeof p.proof==='string'&&p.proof.length>0&&p.proof.length<=2048,
    'SAVE_CONFLICT','현재 내보내기와 서버 저장 확인이 다릅니다.');
   await this.auth(method,b,{receipt:{exportId:p.exportId as string,binding:t!.binding,sha256:t!.sha256,newVersion:p.hostVersion as string,proof:p.proof as string}});
   this.ready(b);await h.route('completeSave',{saveId:t!.saveId,success:true,sha256:t!.sha256,version:p.hostVersion});
   this.exports.delete(p.exportId as string);void h.route('releaseExport',{saveId:t!.saveId});
   return {state:this.state(),savedRevision:t!.binding.mutationRevision,...this.refresh()};
  }
  if(method==='openDocument')return this.openDocument(input,b,e,op);
  await this.auth(method,b);this.ready(b,writing);this.prune();
  switch(method){
   case 'getLayoutReport':fields([]);return {pageCount:h.a.pageCount,overflow:null,fontWarnings:['FONT_FIDELITY_UNVERIFIED']};
   case 'prepareDocument':{
    const markdown=this.hostV1&&exact(input,['markdown','destination'],['replaceDirty']);
    const p=fields([markdown?'markdown':'spec','destination'],['replaceDirty']);
    need(isNewBinding(p.destination)&&(p.replaceDirty===undefined||typeof p.replaceDirty==='boolean'),'INVALID_SPEC','작업본과 교체 정책이 필요합니다.');
    need(this.drafts.size<2,'BUSY','준비된 문서가 이미 있습니다.');
    let plan,markdownWarnings:string[]=[];
    if(markdown){
     need(typeof p.markdown==='string'&&[...p.markdown].length<=limits.characters,'INVALID_SPEC','지원되는 Markdown 범위를 확인하세요.');
     const source=p.markdown as string;
     try{
      const analysis=analyzeMarkdown({source,mode:'report'});
      // These three notes describe the registered report presentation itself.
      // Surface them in the reviewed preview, but never accept content/structure diagnostics.
      const presentation=new Set(['HEADING_PRESENTATION','LITERAL_LIST_MARKERS','REPORT_PRESENTATION']);
      need(analysis.diagnostics.every(d=>d.severity==='confirm'&&presentation.has(d.code)),
       'INVALID_SPEC','지원하지 않는 Markdown 구조가 있습니다.');
      markdownWarnings=analysis.diagnostics.map(d=>d.code);
      plan=analyzeMarkdown({source,mode:'report',acceptedDiagnostics:analysis.diagnostics.map(d=>d.id)});
     }
     catch{throw new AIError('INVALID_SPEC','Markdown 형식을 확인하세요.')}
     const tables=plan.blocks.filter(b=>b.kind==='table');
     need(plan.ready&&plan.blocks.every(b=>b.kind==='table'||!['quote','code'].includes(b.role)),
      'INVALID_SPEC','제목·문단·목록·일반 표를 사용하세요.');
     need(plan.blocks.length<=limits.blocks&&tables.length<=limits.tables&&tables.reduce((n,b)=>n+b.rows.reduce((m,row)=>m+row.length,0),0)<=limits.cells,
      'CONTENT_LIMIT_EXCEEDED','공공문서 생성 한도를 넘었습니다.');
    }else plan=compileDocumentSpec(p.spec,this.hostV1);
    let out;
    try{out=composeDocumentPlan(h.a.doc,plan);assertSafeHwpxEntryNames(out.bytes)}
    catch{throw new AIError('INVALID_SPEC','지원 범위 내에서 문서를 안전하게 생성하지 못했습니다.')}
    need(out.bytes.byteLength<=limits.fileBytes,'CONTENT_LIMIT_EXCEEDED','생성된 문서 크기 한도입니다.');
    const bytesHash=await sha256(out.bytes);this.ready(b);
    const d:Draft={id:crypto.randomUUID(),binding:b,expiresAt:this.clock()+limits.draftMs,digest:'',
     bytes:out.bytes,destination:p.destination as NewBinding,replaceDirty:p.replaceDirty===true};
    const layout={pageCount:out.pageCount,overflow:false,fontWarnings:['FONT_FIDELITY_UNVERIFIED']};
    const blocks=out.locations.map(v=>{
     if(v.kind!=='table')return {kind:v.kind,text:v.text};
     if(!v.grid)return {kind:v.kind,rows:v.rows};
     const {rowCount,colCount,cells}=v.grid;
     return {kind:v.kind,grid:{rowCount,colCount,cells}};
    });
    const gridPreview=blocks.some(v=>v.grid!==undefined)?[blocks]:[];
    d.digest=await digest([d.id,b,bytesHash,d.destination,d.replaceDirty,d.expiresAt,...(this.hostV1?[layout,markdownWarnings,...gridPreview]:[])]);this.ready(b);
    this.drafts.set(d.id,d);
    return {candidateId:d.id,previewDigest:d.digest,expiresAt:d.expiresAt,bytesHash,layout,...(this.hostV1?{warnings:markdownWarnings}:{}),
     blocks,destination:d.destination,replaceDirty:d.replaceDirty};
   }
   case 'captureSelection':{
    fields([]);need(selection===this.selectionKey(),'STALE_DOCUMENT','요청 중 선택이 바뀌었습니다.','recapture');need(this.captures.size<16,'BUSY','선택 핸들 한도입니다.');
    const c=await captureRange(h,this.native,this.clock());
    let details;
    try{
     this.ready(b);
     if(this.hostV1){
      need(selection===this.selectionKey(),'STALE_DOCUMENT','요청 중 선택이 바뀌었습니다.','recapture');
      details={selectionRevision:this.selectionRevision,start:c.start,end:c.end,targetId:c.targetId,sourceSha256:c.sourceHash,formatDigest:c.formatDigest};
     }
    }catch(e){this.native.release(c.rangeId);throw e}
    this.captures.set(c.id,{...c,binding:b});return {selectionSnapshotId:c.id,rangeId:c.rangeId,expiresAt:c.expiresAt,binding:b,...details};
   }
   case 'readSelection':case 'releaseSelection':case 'previewEdits':{
    const p=method==='previewEdits'?fields(['selectionSnapshotId',this.hostV1?'targetId':'rangeId','replacement']):fields(['selectionSnapshotId'],method==='readSelection'?['context']:[]);
    const key=id(p.selectionSnapshotId),c=this.captures.get(key);
    need(c&&c.expiresAt>this.clock(),'PREVIEW_EXPIRED','선택 스냅샷이 만료됐습니다.','recapture');
    if(method==='releaseSelection'){this.captures.delete(key);this.native.release(c!.rangeId);return{released:true}}
    if(method==='readSelection')return readRange(c!,p.context);
    need(this.hostV1?p.targetId===c!.targetId:p.rangeId===c!.rangeId,'SOURCE_MISMATCH','선택의 범위가 다릅니다.');
    need(this.proposals.size<16,'BUSY','수정안 한도입니다.');
    const replacement=replacementText(p.replacement);
    let intent;
    try{intent=this.native.previewDetached(c!.rangeId,replacement,this.openedSource()?.format==='hwpx')}
    catch(e){
     if(e instanceof AiNativeError&&map[e.code]&&e.code!=='PRESERVATION_FAILED')throw e;
     throw new AIError('UNSUPPORTED_SELECTION','분리 문서에서 조판과 보존을 확인하지 못했습니다.');
    }
    const prop:Proposal={id:crypto.randomUUID(),binding:b,digest:'',expiresAt:Math.min(c!.expiresAt,this.clock()+limits.proposalMs),intent,captureId:key};
    const evidence={targetId:intent.targetId,sourceSha256:intent.sourceHash,formatDigest:intent.formatDigest};
    if(this.hostV1)need(intent.rangeId===c!.rangeId&&intent.targetId===c!.targetId&&intent.sourceHash===c!.sourceHash&&intent.formatDigest===c!.formatDigest,
     'SOURCE_MISMATCH','미리보기의 선택 증거가 다릅니다.');
    prop.digest=await digest([prop.id,b,c!.rangeId,intent.before,replacement,intent.layout,prop.expiresAt,...(this.hostV1?[evidence]:[])]);this.ready(b);
    this.proposals.set(prop.id,prop);
    return {proposalId:prop.id,previewDigest:prop.digest,expiresAt:prop.expiresAt,rangeId:c!.rangeId,before:intent.before,after:replacement,layout:intent.layout,
     ...(this.hostV1?evidence:{})};
   }
   case 'discardProposal':{const p=fields(['proposalId']),t=find(this.proposals,p.proposalId);this.proposals.delete(t.id);return {discarded:true}}
   case 'undo':case 'redo':{
    const p=fields([],method==='undo'?['operationId']:[]);
    if(p.operationId!==undefined)need(this.lastEdit&&p.operationId===this.lastEdit.id&&sameBinding(this.lastEdit.binding,b),'UNDO_NOT_LATEST','지정한 AI 편집 이후 다른 변경이 있습니다.');
    const r=await h.route(method,current(h));return {changed:(r as {changed:boolean}).changed,state:this.state(),...this.refresh()};
   }
   case 'exportDocument':{
    const p=fields(['format']);need(p.format==='hwpx','UNSUPPORTED_EXPORT_FORMAT','HWPX 저장만 지원합니다.');
    need(this.exports.size<4,'BUSY','먼저 기존 저장 결과를 확인하세요.');
    const out=await h.route('exportHwpx',current(h)) as {bytes:Uint8Array;sha256:string;saveId:string};
    try{this.alive();need(out.bytes.byteLength<=limits.fileBytes,'CONTENT_LIMIT_EXCEEDED','내보낸 파일 크기 한도입니다.');
     const exportId=crypto.randomUUID();this.exports.set(exportId,{binding:b,saveId:out.saveId,sha256:out.sha256});
     return {format:'hwpx',exportId,binding:b,exportRevision:b.mutationRevision,sha256:out.sha256,bytes:out.bytes,warnings:[]};
    }catch(e){void h.route('releaseExport',{saveId:out.saveId}).catch(()=>{});throw e}
   }
  }
  throw new AIError('UNSUPPORTED_CAPABILITY','이 명령은 지원되지 않습니다.');
 }
}
