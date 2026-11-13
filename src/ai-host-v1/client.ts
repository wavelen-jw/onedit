import {AIError,isId,isObject,limits,type Approval,type Binding,type ErrorBody} from '../ai-integration/contract.js';
import {check,connectSchema,connectedSchema,eventSchema,mutatingReceipt,replies,requests,version,versionMatches,
 type Input,type Output,type Method,type Scope,type Prepared,type Proposal,type State,type Snapshot} from './wire.js';

import {checkedOpenFeature} from './open.js';

type Options={binding?:Binding;operationId?:string};
type Connected={permissions:Scope[];state?:State};
export type HostEvent={type:'event';event:string;sequence:number;state?:State};
type Waiting={method:'connect'|Method;operationId?:string;resolve:(x:unknown)=>void;reject:(e:unknown)=>void;timer:ReturnType<typeof setTimeout>};

export class OutcomeUnknown extends Error {
 readonly code='OUTCOME_UNKNOWN';
 readonly recovery='check-operation';
 constructor(readonly operationId:string){super('완료 여부를 알 수 없습니다. 같은 세션의 getOperation으로 먼저 확인하세요.');}
}
const remoteError=(x:unknown)=>{const e=x as ErrorBody;return new AIError(e.code,e.message,e.recovery,e.retryable)};
async function verifyTransfer(value:unknown){
 if(!isObject(value)||!(value.bytes instanceof ArrayBuffer)||value.bytes.byteLength!==value.byteLength||
    value.bytes.byteLength<1||value.bytes.byteLength>limits.fileBytes)
  throw new AIError('INVALID_REQUEST','파일 길이가 맞지 않습니다.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value.bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==value.sha256)throw new AIError('INVALID_REQUEST','파일 SHA-256이 맞지 않습니다.');
}

export class OneditHostClient {
 private pending=new Map<string,Waiting>();
 private listeners=new Set<(e:HostEvent)=>void>();
 private closed=false;
 private sequence=0;
 private constructor(private readonly port:MessagePort,readonly sessionId:string){
  port.onmessage=e=>void this.receive(e.data);
  port.onmessageerror=()=>this.close(false);port.start();
 }
 static async connect(frame:HTMLIFrameElement,origin:string,options:{sessionProof:string;permissions:Scope[];sessionId?:string;checkedOpen?:boolean}){
  let target:URL;
  try{target=new URL(origin);}catch{throw new AIError('ORIGIN_NOT_ALLOWED','정확한 편집기 origin이 필요합니다.');}
  if(target.origin!==origin||!(target.protocol==='https:'||target.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(target.hostname))||
   !frame.contentWindow||new URL(frame.src,location.href).origin!==origin)
   throw new AIError('ORIGIN_NOT_ALLOWED','편집기 origin과 iframe이 일치해야 합니다.');
  const sessionId=options.sessionId??crypto.randomUUID(),requestId=crypto.randomUUID();
  const hello={...version,type:'connect',sessionId,requestId,permissions:options.permissions,sessionProof:options.sessionProof,...(options.checkedOpen?{feature:checkedOpenFeature}:{})};
  check(connectSchema,hello);
  const ports=new MessageChannel(),client=new OneditHostClient(ports.port1,sessionId);
  try{
   const connected=await client.send<Connected>('connect',requestId,()=>frame.contentWindow!.postMessage(hello,origin,[ports.port2]));
   if(!connected.permissions.every(p=>options.permissions.includes(p)))throw new AIError('INVALID_REQUEST','허용되지 않은 권한 응답입니다.');
   return {client,connected};
  }catch(e){client.close(false);ports.port2.close();throw e;}
 }
 private send<T>(method:Waiting['method'],requestId:string,post:()=>void,operationId?:string):Promise<T>{
  if(this.closed)return Promise.reject(new AIError('SESSION_CLOSED','연결이 종료되었습니다.'));
  if(this.pending.size>=16)return Promise.reject(new AIError('BUSY','연결 대기 요청 한도입니다.'));
  return new Promise<T>((resolve,reject)=>{
   const timer=setTimeout(()=>{
    this.pending.delete(requestId);
    reject(operationId?new OutcomeUnknown(operationId):new AIError('TIMEOUT','응답을 받지 못했습니다.'));
   },10000);
   this.pending.set(requestId,{method,operationId,resolve:resolve as Waiting['resolve'],reject,timer});
   try{post();}catch(e){clearTimeout(timer);this.pending.delete(requestId);reject(e);}
  });
 }
 private async receive(raw:unknown){
  if(!isObject(raw)||raw.sessionId!==this.sessionId||!versionMatches(raw))return;
  if(raw.type==='event'){
   try{check(eventSchema,raw);}catch{return;}
   const seq=raw.sequence as number;
   if(seq<=this.sequence)return;
   if(seq!==this.sequence+1)for(const f of this.listeners)try{f({type:'event',event:'resync-required',sequence:seq});}catch{}
   this.sequence=seq;
   for(const f of this.listeners)try{f(raw as unknown as HostEvent);}catch{}
   if(raw.event==='session-closed')this.close(false);
   return;
  }
  if(!isId(raw.requestId))return;
  const w=this.pending.get(raw.requestId);if(!w)return;
  const schema=w.method==='connect'?connectedSchema:replies[w.method];
  const result=raw.result;
  try{
   check(schema,raw,w.method==='exportDocument'&&isObject(result)&&result.bytes instanceof ArrayBuffer?result.bytes:undefined);
   if(raw.ok&&w.method==='exportDocument')await verifyTransfer(result);
  }catch(e){
   if(this.pending.get(raw.requestId)!==w)return;
   this.pending.delete(raw.requestId);clearTimeout(w.timer);
   w.reject(w.operationId?new OutcomeUnknown(w.operationId):e);return;
  }
  if(this.pending.get(raw.requestId)!==w)return;
  this.pending.delete(raw.requestId);clearTimeout(w.timer);
  if(raw.ok)w.resolve(result);
  else if(w.operationId&&isObject(raw.error)&&raw.error.code==='OUTCOME_UNKNOWN')w.reject(new OutcomeUnknown(w.operationId));
  else w.reject(remoteError(raw.error));
 }
 async request<M extends Method>(method:M,params:Input[M],options:Options={}):Promise<Output[M]>{
  const requestId=crypto.randomUUID();
  // Keep the caller's original file bytes. Copy to an owned transferable first.
  let payload:unknown=params,transfer:ArrayBuffer[]=[];
  const file:unknown=params;
  const binary=method==='openDocument'&&isObject(file)&&file.bytes instanceof ArrayBuffer?file.bytes:undefined;
  const envelope={...version,type:'request',requestId,sessionId:this.sessionId,method,params,
    ...(options.binding!==undefined?{binding:options.binding}:{}),...(options.operationId!==undefined?{operationId:options.operationId}:{})};
  check(requests[method],envelope,binary);
  const fixedBinding=binary&&options.binding?structuredClone(options.binding):undefined;
  if(binary){
   const bytes=binary.slice(0);
   payload=structuredClone({...params,bytes},{transfer:[bytes]});
   await verifyTransfer(payload);transfer=[(payload as {bytes:ArrayBuffer}).bytes];
  }
  return this.send<Output[M]>(method,requestId,()=>this.port.postMessage({...envelope,params:payload,...(fixedBinding?{binding:fixedBinding}:{})},transfer),
   mutatingReceipt(method)?options.operationId:undefined);
 }
 subscribe(fn:(e:HostEvent)=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 close(notify=true){
  if(this.closed)return;this.closed=true;
  if(notify)try{this.port.postMessage({...version,type:'disconnect',sessionId:this.sessionId});}catch{}
  this.port.close();
  for(const w of this.pending.values()){
   clearTimeout(w.timer);w.reject(w.operationId?new OutcomeUnknown(w.operationId):new AIError('SESSION_CLOSED','연결이 종료되었습니다.'));
  }
  this.pending.clear();this.listeners.clear();
 }
 async createFromChat(input:Input['prepareDocument'],binding:Binding,review:(draft:Readonly<Prepared>)=>Promise<Approval|null>,operationId=crypto.randomUUID()){
  const draft=await this.request('prepareDocument',input,{binding});
  const approval=await review(structuredClone(draft));
  if(!approval)return {cancelled:true} as const;
  return this.request('commitPreparedDocument',{candidateId:draft.candidateId,approval},{binding,operationId});
 }
 /** Take a snapshot explicitly before moving focus. Never capture from here. */
 async revisePinnedSelection(snapshot:Snapshot,
  propose:(input:{segmentKey:string;text:string;context?:Output['readSelection']['context']})=>Promise<{segmentKey:string;replacement:string}>,
  review:(draft:Readonly<Proposal>)=>Promise<Approval|null>,operationId=crypto.randomUUID(),context?:Input['readSelection']['context']){
  const {binding,snapshotId,targetId,sourceSha256,formatDigest}=structuredClone(snapshot);
  let draft:Proposal|undefined,unknown=false;
  try{
   const selected=await this.request('readSelection',{snapshotId,...(context?{context}:{})},{binding});
   const change=await propose({segmentKey:selected.segmentKey,text:selected.text,...(context&&selected.context?{context:selected.context}:{})});
   if(!isObject(change)||Object.keys(change).length!==2||change.segmentKey!==selected.segmentKey||typeof change.replacement!=='string')
    throw new AIError('SOURCE_MISMATCH','선택된 대상의 수정문만 사용하세요.');
   draft=await this.request('previewEdits',{snapshotId,targetId,replacement:change.replacement},{binding});
   if(draft.targetId!==targetId||draft.sourceSha256!==sourceSha256||draft.formatDigest!==formatDigest||
      draft.before!==selected.text||draft.after!==change.replacement)
    throw new AIError('SOURCE_MISMATCH','미리보기가 선택된 대상과 다릅니다.');
   const approval=await review(structuredClone(draft));
   if(!approval)return {cancelled:true} as const;
   return await this.request('applyProposal',{proposalId:draft.proposalId,approval},{binding,operationId});
  }catch(e){unknown=e instanceof OutcomeUnknown;throw e;}
  finally{
   if(!unknown){
    if(draft)void this.request('discardProposal',{proposalId:draft.proposalId},{binding}).catch(()=>{});
    void this.request('releaseSnapshot',{snapshotId},{binding}).catch(()=>{});
   }
  }
 }
}
