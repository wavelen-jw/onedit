import type {DiagnosticSnapshot, TimedEvent, SourceFrame} from './recorder.js';
import type {Report, DiagnosticEvent as WireEvent, Source} from '../../server/report-collector/interfaces.js';
export const REPORT_LIMITS = Object.freeze({jsonBytes:1_048_576,attachments:3,fileBytes:10*1024*1024,totalFileBytes:20*1024*1024,description:8000,expected:4000,attempts:3});
export type Category=Report['category'];
export type AttachmentKind='screenshot'|'document'|'file';
export type BuildIdentity=Report['build'];
export type Environment=Report['environment'];
export type AttachmentInfo={attachmentId:string;kind:AttachmentKind;size:number;mediaType:string};
export type ReportPayload=Report;
export interface ReportReceipt {reportId:string;receivedAt:string;attachmentUploadToken?:string;attachmentUploadExpiresAt?:string}
export interface ReportFile {info:AttachmentInfo;file:File}
export const isUUID=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
export const isSHA=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export function validBuild(b:BuildIdentity|null):b is BuildIdentity{return !!b&&isSHA(b.product)&&isSHA(b.app)&&isSHA(b.wasmDeclared)&&(b.wasmObserved===null||isSHA(b.wasmObserved));}
/** Coarse family only; no UA/version, locale, URL, filename or device identifier. */
export function coarseEnvironment(ua:string):Environment{return {os:/iPhone|iPad|iPod/.test(ua)?'ios':/Android/.test(ua)?'android':/Windows/.test(ua)?'windows':/Macintosh|Mac OS/.test(ua)?'macos':/Linux/.test(ua)?'linux':'other',browser:/Edg\//.test(ua)?'edge':/Firefox\//.test(ua)?'firefox':/Chrome\/|CriOS\//.test(ua)?'chrome':/Safari\//.test(ua)?'safari':'other'};}
const utc=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v.replace(/Z$/,v.includes('.')?'Z':'.000Z');
export function receiptFrom(value:unknown):ReportReceipt {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('RECEIPT_INVALID');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['reportId','receivedAt','attachmentUploadToken','attachmentUploadExpiresAt'].includes(k))||!isUUID(v.reportId)||!utc(v.receivedAt))throw Error('RECEIPT_INVALID');
 const r:ReportReceipt={reportId:v.reportId,receivedAt:v.receivedAt};
 if(v.attachmentUploadToken!==undefined||v.attachmentUploadExpiresAt!==undefined){if(typeof v.attachmentUploadToken!=='string'||!/^[-A-Za-z0-9_]{43,128}$/.test(v.attachmentUploadToken)||!utc(v.attachmentUploadExpiresAt))throw Error('RECEIPT_INVALID');r.attachmentUploadToken=v.attachmentUploadToken;r.attachmentUploadExpiresAt=v.attachmentUploadExpiresAt;}
 return r;
}
const source:Record<SourceFrame,Source>={'workspace-startup':'runtime',interaction:'command','file-lifecycle':'save','page-presenter':'render',unknown:'unknown'};
/** Translate existing R primitives only at submission/preview boundaries.
 * atMs is relative to the frozen three-minute window, not an absolute clock.
 * R dirty and phase-only fields have no v1 variant and are explicitly omitted.
 * Unknown capture ownership/time never obtains invented timestamps. */
function wireEvent(e:TimedEvent,capturedAt:number):WireEvent|null {
 const age=capturedAt-e.atMs;if(!Number.isFinite(age)||age<0||age>180000)return null;const atMs=180000-age;
 switch(e.type){
  case 'command':return {type:'command',atMs,commandId:e.command,phase:e.result==='start'?'started':e.result==='cancel'?'cancelled':'finished',...(e.result==='ok'||e.result==='noop'?{result:e.result}:e.result==='fail'?{result:'failed' as const}:{}),...(e.durationMs<=600000?{durationMs:e.durationMs}:{})};
  case 'selection':return e.count<=100000?{type:'selection',atMs,selectionType:e.selection==='range'?'text':e.selection,count:e.count}:null;
  case 'state':return {type:'history',atMs,revision:e.revision,undoCount:e.undoCount,redoCount:e.redoCount};
  case 'focus':return {type:'focus',atMs,role:e.focus==='other'?'outside':e.focus==='none'?'unknown':e.focus};
  case 'queue':return e.depth<=100000?{type:'queue',atMs,phase:e.state==='start'?'started':'stopped',depth:e.depth}:null;
  case 'save':return {type:'save',atMs,state:e.state==='start'?'requested':e.state==='success'?'saved':e.state==='cancel'?'cancelled':'failed'};
  case 'phase':return null;
 }
}
/** Canonical diagnostic preview and wire projection share these exact fields.
 * Detail seconds describes the active configured budget, not elapsed CPU time.
 * Symbolic frame line/column zero means unavailable, not a measured source line. */
export function diagnosticView(s:DiagnosticSnapshot|null,at:number|null|undefined){
 const events=s&&typeof at==='number'&&Number.isFinite(at)?s.events.map(e=>wireEvent(e,at)).filter((e):e is WireEvent=>e!==null):[];
 return {diagnostics:{windowMs:180000,detailSeconds:s?.detail?60:0,events},...(s?{error:{code:s.code,frames:s.frames.map(f=>({source:source[f],line:0,column:0}))}}:{})};
}
/** Trusted immutable recorder snapshot only; no arbitrary Error/stack/log reads. */
export function makeReport(input:{id:string;sessionId:string;build:BuildIdentity;environment:Environment;category:Category;automatic:boolean;description:string;expected:string;diagnostics:boolean;snapshot:DiagnosticSnapshot|null;snapshotAtMs?:number|null;files:readonly ReportFile[]}):ReportPayload {
 if(!isUUID(input.id)||!isUUID(input.sessionId)||!validBuild(input.build))throw Error('IDENTITY_UNAVAILABLE');
 if(!['input','clipboard','table','layout','save','load','performance','other'].includes(input.category))throw Error('CATEGORY_INVALID');
 if(input.files.length>REPORT_LIMITS.attachments||input.files.some(x=>!isUUID(x.info.attachmentId)||x.info.size!==x.file.size||x.info.size<=0||x.info.size>REPORT_LIMITS.fileBytes)||input.files.reduce((n,x)=>n+x.info.size,0)>REPORT_LIMITS.totalFileBytes)throw Error('ATTACHMENT_LIMIT');
 if(input.description.length>REPORT_LIMITS.description||input.expected.length>REPORT_LIMITS.expected||!input.automatic&&!input.description.trim())throw Error('DESCRIPTION_INVALID');
 if(input.automatic&&(input.files.length||!input.diagnostics||!input.snapshot))throw Error('AUTOMATIC_CONSENT_INVALID');
 const s=input.diagnostics?input.snapshot:null,at=input.snapshotAtMs;
 const view=diagnosticView(s,at);
 const common={schemaVersion:1 as const,clientReportId:input.id,ephemeralSessionId:input.sessionId,occurredAt:s?.occurredAt??new Date().toISOString(),build:{...input.build},environment:{...input.environment},category:input.category,diagnostics:view.diagnostics};
 const error=view.error;
 const consent={diagnostics:input.diagnostics,detailCapture:s?.detail===true,screenshot:input.files.some(f=>f.info.kind==='screenshot'),document:input.files.some(f=>f.info.kind==='document'),file:input.files.some(f=>f.info.kind==='file')};
 const payload:ReportPayload=input.automatic?{...common,kind:'automatic_error',error:error!,consent:{...consent,manualSubmission:false,automaticUpload:true,screenshot:false,document:false,file:false}}:{...common,kind:'user_report',description:input.description,expected:input.expected,...error?{error}:{},consent:{...consent,manualSubmission:true,automaticUpload:false}};
 if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>REPORT_LIMITS.jsonBytes)throw Error('JSON_LIMIT');return payload;
}
