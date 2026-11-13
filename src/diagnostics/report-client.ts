import {REPORT_LIMITS,receiptFrom,isUUID,isSHA,type ReportPayload,type ReportReceipt,type ReportFile} from './report-contract.js';
export type ReportFailureCode='NETWORK'|'RATE_LIMIT'|'UNAVAILABLE'|'CONFLICT'|'REJECTED'|'RECEIPT_INVALID'|'ABORTED'|'UPLOAD_EXPIRED';
export class ReportFailure extends Error {constructor(readonly code:ReportFailureCode,readonly receipt?:ReportReceipt){super(code);}}
export interface ReportTransport {send(payload:ReportPayload,files:readonly ReportFile[],signal:AbortSignal):Promise<ReportReceipt>;readonly supportsAttachments:boolean}
const aborted=(s:AbortSignal)=>{if(s.aborted)throw new ReportFailure('ABORTED');};
/** Response bodies are bounded; arbitrary failure bodies are never read or logged. */
async function boundedJSON(r:Response):Promise<unknown>{const reader=r.body?.getReader();if(!reader)throw new ReportFailure('RECEIPT_INVALID');let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});try{while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>4096){await reader.cancel();throw new ReportFailure('RECEIPT_INVALID');}text+=decoder.decode(c.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}try{return JSON.parse(text);}catch{throw new ReportFailure('RECEIPT_INVALID');}}
function retryWait(r:Response,attempt:number):number {const raw=r.headers.get('Retry-After');if(raw){const n=/^\d+$/.test(raw)?Number(raw)*1000:Date.parse(raw)-Date.now();if(!Number.isFinite(n)||n>10000)return -1;return Math.max(0,n);}return [400,1200][attempt]??1200;}
/** Same-origin reviewed v1 only. No admin credential or original filename enters this client. */
export function firstPartyTransport(fetcher:typeof fetch=fetch,wait:(ms:number,signal:AbortSignal)=>Promise<void>=delay):ReportTransport {
 const digests=new WeakMap<ReportFile,Promise<string>>();
 async function request(url:string,init:RequestInit,signal:AbortSignal,attachment=false):Promise<{value:unknown;retryMs:number}> {
  aborted(signal);const c=new AbortController(),abort=()=>c.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,8000);
  try{const r=await fetcher(url,{...init,credentials:'same-origin',redirect:'error',cache:'no-store',signal:c.signal});
   if(r.ok)return {value:await boundedJSON(r),retryMs:0};
   void r.body?.cancel().catch(()=>{});const code=r.status===409?'CONFLICT':attachment&&r.status===401?'UPLOAD_EXPIRED':r.status===429?'RATE_LIMIT':r.status>=500?'UNAVAILABLE':'REJECTED';
   const e=new ReportFailure(code);if(r.headers.has('Retry-After'))Object.assign(e,{retryMs:retryWait(r,0)});throw e;
  }catch(e){if(signal.aborted)throw new ReportFailure('ABORTED');if(e instanceof ReportFailure)throw e;throw new ReportFailure('NETWORK');}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
 }
 async function retry<T>(run:()=>Promise<T>,signal:AbortSignal):Promise<T>{for(let a=0;a<REPORT_LIMITS.attempts;a++){aborted(signal);try{return await run();}catch(e){const error=e instanceof ReportFailure?e:new ReportFailure('NETWORK');if(signal.aborted)throw new ReportFailure('ABORTED');if(!['NETWORK','RATE_LIMIT','UNAVAILABLE'].includes(error.code)||a===REPORT_LIMITS.attempts-1)throw error;const explicit=(error as ReportFailure&{retryMs?:number}).retryMs;if(explicit===-1)throw error;await wait(explicit??[400,1200][a],signal);}}throw new ReportFailure('NETWORK');}
 async function digest(f:ReportFile,signal:AbortSignal){aborted(signal);let p=digests.get(f);if(!p){p=(async()=>{const b=await f.file.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');})();digests.set(f,p);}const result=await p;aborted(signal);return result;}
 function checkStatus(value:unknown,file:ReportFile,sha:string):boolean {
  if(!value||typeof value!=='object'||Object.keys(value).length!==1||!Array.isArray((value as {attachments?:unknown}).attachments))throw new ReportFailure('RECEIPT_INVALID');
  const rows=(value as {attachments:unknown[]}).attachments;if(rows.length>3)throw new ReportFailure('RECEIPT_INVALID');let found=false;
  for(const row of rows){if(!row||typeof row!=='object')throw new ReportFailure('RECEIPT_INVALID');const r=row as Record<string,unknown>;
   if(Object.keys(r).some(k=>!['id','clientAttachmentId','kind','mime','bytes','sha256'].includes(k))||!isUUID(r.id)||!isUUID(r.clientAttachmentId)||!['screenshot','document','file'].includes(String(r.kind))||typeof r.mime!=='string'||r.mime.length>80||!Number.isSafeInteger(r.bytes)||Number(r.bytes)<=0||Number(r.bytes)>REPORT_LIMITS.fileBytes||!isSHA(r.sha256))throw new ReportFailure('RECEIPT_INVALID');
   if(r.clientAttachmentId===file.info.attachmentId){if(r.kind!==file.info.kind||r.mime!==file.info.mediaType||r.bytes!==file.info.size||r.sha256!==sha)throw new ReportFailure('CONFLICT');found=true;}
  }return found;
 }
 return {supportsAttachments:true,async send(payload,files,signal){
  if(files.length>3||files.some(f=>!isUUID(f.info.attachmentId)||f.info.size!==f.file.size||f.info.size<=0||f.info.size>REPORT_LIMITS.fileBytes||!payload.consent[f.info.kind])||files.reduce((n,f)=>n+f.info.size,0)>REPORT_LIMITS.totalFileBytes||payload.kind==='automatic_error'&&files.length)throw new ReportFailure('REJECTED');
  const body=JSON.stringify(payload);if(new TextEncoder().encode(body).byteLength>REPORT_LIMITS.jsonBytes)throw new ReportFailure('REJECTED');
  const prepared:{file:ReportFile;sha:string}[]=[];for(const f of files)prepared.push({file:f,sha:await digest(f,signal)});
  const receipt=await retry(async()=>{const r=await request('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body},signal);try{return receiptFrom(r.value);}catch{throw new ReportFailure('RECEIPT_INVALID');}},signal);
  try{for(const {file,sha} of prepared){
   if(!receipt.attachmentUploadToken||!receipt.attachmentUploadExpiresAt)throw new ReportFailure('RECEIPT_INVALID');const url='/api/reports/'+receipt.reportId+'/attachments',auth={Authorization:'Bearer '+receipt.attachmentUploadToken};
   await retry(async()=>{aborted(signal);if(Date.now()>Date.parse(receipt.attachmentUploadExpiresAt!))throw new ReportFailure('UPLOAD_EXPIRED');const s=await request(url,{headers:auth},signal,true);if(checkStatus(s.value,file,sha))return;
    const r=await request(url,{method:'POST',headers:{...auth,'Content-Type':file.info.mediaType,'X-Attachment-Id':file.info.attachmentId,'X-Attachment-Kind':file.info.kind,'X-Content-SHA256':sha,'X-File-Bytes':String(file.info.size)},body:file.file},signal,true);const v=r.value as Record<string,unknown>;if(!v||Object.keys(v).some(k=>!['attachmentId','bytes','sha256'].includes(k))||!isUUID(v.attachmentId)||v.bytes!==file.info.size||v.sha256!==sha)throw new ReportFailure('RECEIPT_INVALID');
   },signal);
  }}catch(e){throw new ReportFailure(e instanceof ReportFailure?e.code:'NETWORK',receipt);}
  return receipt;
 }};
}
function delay(ms:number,signal:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{if(signal.aborted){reject(new ReportFailure('ABORTED'));return;}const done=()=>{signal.removeEventListener('abort',abort);resolve();},timer=setTimeout(done,ms),abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new ReportFailure('ABORTED'));};signal.addEventListener('abort',abort,{once:true});});}
