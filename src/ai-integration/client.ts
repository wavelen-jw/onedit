import {AIError,contractVersion,isId,type Binding,type ErrorBody,type Method,type Permission} from './contract.js';
export type Event={event:string;sequence:number;state?:unknown};
type Waiting={accept:(v:unknown)=>void;reject:(e:unknown)=>void;timer:ReturnType<typeof setTimeout>};
/** Only the trusted Host UI/policy creates approval or save proof. This client
 * transports it; model/tool output must never be allowed to call write methods. */
export class OneditAIClient {
 private waiting=new Map<string,Waiting>();
 private listeners=new Set<(event:Event)=>void>();
 private closed=false;
 private sequence=0;
 private constructor(private port:MessagePort,readonly sessionId:string){
  port.onmessage=({data:d})=>{
   if(d?.sessionId!==this.sessionId||d?.contractVersion!==contractVersion)return;
   if(d.type==='event'){
    if(!Number.isSafeInteger(d.sequence)||d.sequence<=this.sequence)return;
    if(d.sequence!==this.sequence+1)
     for(const listener of this.listeners)try{listener({event:'resyncRequired',sequence:d.sequence})}catch{}
    this.sequence=d.sequence;
    for(const listener of this.listeners)try{listener(d)}catch{}
    if(d.event==='sessionClosed')this.close(false);
    return;
   }
   if(d.type!=='connected'&&d.type!=='reply')return;
   const w=this.waiting.get(d.requestId);if(!w)return;
   this.waiting.delete(d.requestId);clearTimeout(w.timer);
   if(d.ok)w.accept(d.result);
   else{const x=d.error as ErrorBody;w.reject(new AIError(x.code,x.message,x.recovery,x.retryable));}
  };
  port.onmessageerror=()=>this.close(false);port.start();
 }
 static async connect(frame:HTMLIFrameElement,origin:string,opts:{sessionProof:string;permissions:Permission[];sessionId?:string}){
  let u:URL;try{u=new URL(origin)}catch{throw new AIError('ORIGIN_NOT_ALLOWED','정확한 편집기 origin이 필요합니다.')}
  if(u.origin!==origin||!frame.contentWindow||new URL(frame.src,location.href).origin!==origin)
   throw new AIError('ORIGIN_NOT_ALLOWED','편집기 origin과 iframe이 일치해야 합니다.');
  const sessionId=opts.sessionId??crypto.randomUUID(),requestId=crypto.randomUUID();
  if(!isId(sessionId))throw new AIError('INVALID_REQUEST','올바른 세션 ID가 필요합니다.');
  const channel=new MessageChannel(),client=new OneditAIClient(channel.port1,sessionId);
  try{
   const pending=client.wait(requestId);
   frame.contentWindow.postMessage({type:'onedit-ai-connect',contractVersion,requestId,sessionId,
    permissions:opts.permissions,sessionProof:opts.sessionProof},origin,[channel.port2]);
   return {client,connected:await pending};
  }catch(e){client.close(false);throw e}
 }
 private wait(id:string):Promise<unknown>{
  if(this.closed)return Promise.reject(new AIError('SESSION_CLOSED','연결이 종료되었습니다.'));
  if(this.waiting.size>=16)return Promise.reject(new AIError('BUSY','연결 대기 요청 한도입니다.'));
  return new Promise((accept,reject)=>{
   const timer=setTimeout(()=>{this.waiting.delete(id);reject(new AIError('TIMEOUT','응답을 받지 못했습니다. 적용 여부를 확인하세요.','check-operation'));},10000);
   this.waiting.set(id,{accept,reject,timer});
  });
 }
 request<T=unknown>(method:Exclude<Method,'connect'>,params:unknown={},options:{binding?:Binding;idempotencyKey?:string}={}):Promise<T>{
  if(this.closed||this.waiting.size>=16)return this.wait('') as Promise<T>;
  const requestId=crypto.randomUUID(),promise=this.wait(requestId) as Promise<T>;
  try{this.port.postMessage({type:'request',contractVersion,requestId,sessionId:this.sessionId,method,params,
   ...(options.binding?{binding:options.binding}:{}),...(options.idempotencyKey?{idempotencyKey:options.idempotencyKey}:{})});}
  catch(e){const w=this.waiting.get(requestId);if(w){clearTimeout(w.timer);this.waiting.delete(requestId);w.reject(e)}}
  return promise;
 }
 subscribe(listener:(event:Event)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
 close(notify=true){
  if(this.closed)return;this.closed=true;
  if(notify)try{this.port.postMessage({type:'disconnect',contractVersion,sessionId:this.sessionId})}catch{}
  this.port.close();
  for(const w of this.waiting.values()){clearTimeout(w.timer);w.reject(new AIError('SESSION_CLOSED','연결이 종료되었습니다.'));}
  this.waiting.clear();this.listeners.clear();
 }
 /** Helpers are explicit two-phase orchestration, never implicit approval. */
 async createDocument(spec:unknown,destination:unknown,binding:Binding,approve:(preview:any)=>Promise<unknown>,idempotencyKey=crypto.randomUUID()){
  const p=await this.request<any>('prepareDocument',{spec,destination},{binding});
  const approval=await approve(p);if(!approval)return {cancelled:true};
  return this.request('commitPreparedDocument',{candidateId:p.candidateId,approval},{binding,idempotencyKey});
 }
 async editSelection(binding:Binding,propose:(selection:{rangeId:string;text:string})=>Promise<string>,
  approve:(preview:any)=>Promise<unknown>,idempotencyKey=crypto.randomUUID()){
  const cap=await this.request<any>('captureSelection',{}, {binding});
  try{
   const selected=await this.request<{rangeId:string;text:string;format:unknown}>('readSelection',{selectionSnapshotId:cap.selectionSnapshotId},{binding});
   const replacement=await propose({rangeId:selected.rangeId,text:selected.text});
   const p=await this.request<any>('previewEdits',{selectionSnapshotId:cap.selectionSnapshotId,rangeId:cap.rangeId,replacement},{binding});
   const approval=await approve(p);
   if(!approval){await this.request('discardProposal',{proposalId:p.proposalId},{binding});return {cancelled:true}}
   return await this.request('applyProposal',{proposalId:p.proposalId,approval},{binding,idempotencyKey});
  }finally{void this.request('releaseSelection',{selectionSnapshotId:cap.selectionSnapshotId},{binding}).catch(()=>{});}
 }
}
