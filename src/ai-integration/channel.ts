import {AIService,type Adopter,type Authority,type AuthorityRequest} from './service.js';
import {exact,isId,methods,type Permission} from './contract.js';
import {ExternalHost} from '../host-v2.js';
import {check,connectSchema,disconnectSchema,version,versionMatches} from '../ai-host-v1/wire.js';
import {routeHostV1} from '../ai-host-v1/bridge.js';
import type {NextHostAdapter} from '../host.js';
import {checkedOpenFeature,type HostOpenGate} from '../ai-host-v1/open.js';
import {configuredHostOpenGate} from '../ai-host-v1/open-gate.js';

const permissionSet=['read','edit','lifecycle','save'] as const;
export function validOrigin(o:string){
 try{const u=new URL(o);return u.origin===o&&(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))}
 catch{return false}
}
type Options={origins:readonly string[];permissions:readonly Permission[];
 openGate?:HostOpenGate;observeNative?:(publish:(()=>void)|undefined)=>void;
 policy:(sessionProof:string)=>Authority;adopt:Adopter;busy:()=>boolean;redraw:()=>void};
/** Parent admission is owned by the editor deployment, not request/query content.
 * Never use '*' or a received origin as the allowlist. */
export function connectAIHost(win:Window,host:NextHostAdapter,options:Options){
 const wire=version;
 const eventName=(v:string)=>v.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
 const origins=new Set(options.origins.filter(validOrigin));
 if(win.parent===win||!origins.size)return ()=>{};
 let active:{port:MessagePort;service:AIService;sessionId:string;read:boolean;seq:number;lastSelection?:string;last?:ReturnType<AIService['state']>}|undefined;
 let pending=false,closed=false;
 const used=new Set<string>();
 function stop(){
  const a=active;if(!a)return;active=undefined;
  try{a.port.postMessage({type:'event',event:eventName('sessionClosed'),sequence:++a.seq,sessionId:a.sessionId,...wire})}catch{}
  a.service.close();a.port.close();
 }
 function publish(force=false){
  const a=active;if(!a?.read||a.service.isReplacingOpen()||a.service.engine.a.transientEdit)return;
  const state=a.service.state(),last=a.last;
  const selectionChanged=!last||last.hasSelection!==state.hasSelection||
   a.lastSelection!==undefined&&a.lastSelection!==JSON.stringify(a.service.engine.editor.selection);
  const sel=JSON.stringify(a.service.engine.editor.selection);
  a.lastSelection=sel;
  const push=(event:string)=>{a.port.postMessage({type:'event',event:eventName(event),sessionId:a.sessionId,sequence:++a.seq,...wire,state});};
  try{
   if(force||state.binding.documentInstanceId!==last?.binding.documentInstanceId||state.binding.mutationRevision!==last?.binding.mutationRevision)push('documentChanged');
   if(!force&&selectionChanged)push('selectionChanged');
   if(last&&state.dirty!==last.dirty)push('dirtyChanged');
  }catch{stop();}
  a.last=state;
 }
 const receive=async(event:MessageEvent)=>{
  const h=event.data;
  if(closed||pending||event.source!==win.parent||!origins.has(event.origin)||event.ports.length!==1)return;
   // Only an allowed parent can receive a negotiation error; never call policy first.
   if(!h||h.protocol!==version.protocol||h.type!=='connect'||!isId(h.requestId)||!isId(h.sessionId))return;
   if(versionMatches(h)){try{check(connectSchema,h)}catch{return;}}
  const port=event.ports[0],sessionId=h.sessionId;
  const answer=(payload:unknown)=>port.postMessage(payload);
  if(!versionMatches(h)){
   answer({type:'connected',...wire,requestId:h.requestId,sessionId,ok:false,error:{code:'UNSUPPORTED_CONTRACT',message:'지원하지 않는 계약입니다.',retryable:false,recovery:'none'}});
   port.close();return;
  }
  if(used.has(sessionId)||used.size>=64){port.close();return;}
  const requested=h.permissions as unknown[];
  const permissions=options.permissions.filter(v=>requested.includes(v)&&Object.values(methods).includes(v));
  const auth=options.policy(h.sessionProof);
  pending=true;
  let granted=false;
  try{granted=await auth({method:'connect',sessionId,origin:event.origin,permissions})===true}catch{}
  finally{pending=false;}
  if(closed||!granted){
   if(!closed)answer({type:'connected',...wire,requestId:h.requestId,sessionId,ok:false,error:{code:'PERMISSION_DENIED',message:'연결 권한을 확인할 수 없습니다.',retryable:false,recovery:'none'}});
   port.close();return;
  }
  stop();used.add(sessionId);
  const service=new AIService(new ExternalHost(host),sessionId,event.origin,permissions,auth,options.adopt,options.busy,options.redraw,Date.now,true,h.feature===checkedOpenFeature,options.openGate);
  const read=permissions.includes('read');
  const connection={port,service,sessionId,read,seq:0,
   ...(read?{last:service.state(),lastSelection:JSON.stringify(service.engine.editor.selection)}:{})};
  active=connection;
  port.onmessage=async ({data})=>{
   if(active!==connection||data?.sessionId!==sessionId)return;
   if(data?.type==='disconnect'){
    try{check(disconnectSchema,data);stop()}catch{}return;
   }
   if(!isId(data?.requestId))return;
   try{
    const reply=await routeHostV1(service,sessionId,data,permissions);
    if(!reply||active!==connection)return;
    port.postMessage(reply.data,reply.transfer);
    if(reply.data.ok){
     const event=data.method==='acknowledgeSave'?'saved':data.method==='previewEdits'?'proposalReady':
       data.method==='openDocument'||data.method==='applyProposal'||data.method==='commitPreparedDocument'||data.method==='cancelOperation'?'operationProgress':null;
     if(event&&connection.read)answer({type:'event',event:eventName(event),sequence:++connection.seq,sessionId,...wire,state:service.state()});
    }
    publish();
   }catch{stop();}
  };
  port.onmessageerror=()=>{if(active===connection)stop()};
  port.start();
  answer({type:'connected',...wire,requestId:h.requestId,sessionId,ok:true,result:{permissions,...(connection.read?{state:service.state()}:{})}});
  answer({type:'event',event:'ready',sequence:++connection.seq,sessionId,...wire,...(connection.read?{state:service.state()}:{})});
 };
 win.addEventListener('message',receive);
 // Reuse current UI notification for native edits without logging content.
 const changed=()=>{if(active)try{publish()}catch{stop()}};
 win.document.addEventListener('rhwp:editor-state',changed);
 options.observeNative?.(changed);
 win.addEventListener('pagehide',stop);
 return ()=>{closed=true;win.removeEventListener('message',receive);win.document.removeEventListener('rhwp:editor-state',changed);win.removeEventListener('pagehide',stop);options.observeNative?.(undefined);stop()};
}
export function connectConfiguredAIHost(host:NextHostAdapter,adopt:Adopter,busy:()=>boolean,redraw:()=>void,
 observeNative?:(publish:(()=>void)|undefined)=>void){
 // Set only in deployment-owned editor HTML; no such tag is shipped by default.
 const next=document.querySelector<HTMLMetaElement>('meta[name="onedit-host-origins"]');
 if(window.parent===window||!next)return;
 const entry=next;
 const origins=entry.content.split(/\s+/).filter(validOrigin);
 if(!origins.length)return ()=>{}; // Explicit opt-in misconfiguration fails closed.
 return connectAIHost(window,host,{origins,permissions:permissionSet,adopt,busy,redraw,observeNative,openGate:configuredHostOpenGate(host.adapter.doc),
  policy:sessionProof=>async (request:AuthorityRequest)=>{
   const response=await fetch('/api/onedit-ai/authorize',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',
    headers:{'content-type':'application/json'},body:JSON.stringify({...request,...version,sessionProof}),signal:AbortSignal.timeout(5000)});
   if(!response.ok)return false;
   // The controlled policy endpoint replies with a small, typed decision.
   const reader=response.body?.getReader();if(!reader)return false;
   let size=0;const parts:Uint8Array[]=[];
   try{
    for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;
     if(size>256){await reader.cancel();return false;}parts.push(r.value);}
   }finally{reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;
   for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
   const answer=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(exact(answer,['allowed'])&&answer.allowed===true)return true;
   if(request.method==='openDocument'&&exact(answer,['allowed','code'])&&answer.allowed===false&&
    (answer.code==='STALE_DOCUMENT'||answer.code==='INVALID_APPROVAL'||answer.code==='PERMISSION_DENIED'))
    return {allowed:false,code:answer.code};
   return false;
  }});
}
