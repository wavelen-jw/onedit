import {AIError,isObject,type Envelope,type ErrorBody,contractVersion} from '../ai-integration/contract.js';
import type {AIService} from '../ai-integration/service.js';
import {catalog} from '../ai-integration/document-spec.js';
import {check,methodOf,methods,mutatingReceipt,replies,requests,version,type Method,type Scope} from './wire.js';

type WireReply={data:Record<string,unknown>;transfer:ArrayBuffer[]};
const error=(e:unknown):ErrorBody=>(e instanceof AIError?e:new AIError('INVALID_REQUEST','응답을 처리할 수 없습니다.')).toWire();

export async function routeHostV1(service:AIService,sessionId:string,raw:Record<string,unknown>,permissions:readonly Scope[]):Promise<WireReply|undefined>{
 const method=methodOf(raw.method);
 const envelope={...version,type:'reply',sessionId,requestId:raw.requestId,method:raw.method};
 // Unknown method has no result variant; its explicit error uses a separate envelope.
 if(!method)return {data:{...envelope,method:'unsupported',ok:false,error:error(new AIError('UNSUPPORTED_CAPABILITY','지원하지 않는 명령입니다.'))},transfer:[]};
 let committed=false;
 try{
  const params=raw.params;
  const binary=method==='openDocument'&&isObject(params)&&params.bytes instanceof ArrayBuffer?params.bytes:undefined;
  check(requests[method],raw,binary);
  if(method==='openDocument'&&(!isObject(params)||binary?.byteLength!==params.byteLength))
   throw new AIError('INVALID_REQUEST','파일 길이가 맞지 않습니다.');
  const p=params as Record<string,unknown>;
  const translated=method==='openDocument'?{...p,bytes:new Uint8Array(binary!)}:method==='readSelection'?{selectionSnapshotId:p.snapshotId,...(p.context?{context:p.context}:{})}:
   method==='previewEdits'?{selectionSnapshotId:p.snapshotId,targetId:p.targetId,replacement:p.replacement}:
   method==='releaseSnapshot'?{selectionSnapshotId:p.snapshotId}:method==='getStyleCatalog'?{}:p;
  const adapted={type:'request',contractVersion,sessionId,requestId:raw.requestId,method:methods[method][0],params:translated,
   ...(Object.hasOwn(raw,'binding')?{binding:raw.binding}:{}),
   ...(Object.hasOwn(raw,'operationId')?{idempotencyKey:raw.operationId}:{})} as Envelope;
  const reply=await service.request(adapted);
  if(!reply.ok){
   const data={...envelope,...reply};
   check(replies[method],data);
   return {data,transfer:[]};
  }
  committed=mutatingReceipt(method);
  const value=reply.result as Record<string,unknown>;
  const result=project(method,value,permissions);
  const transfer=method==='exportDocument'?[result.bytes as ArrayBuffer]:[];
  const data={...envelope,ok:true,result};
  check(replies[method],data,transfer[0]);
  return {data,transfer};
 }catch(e){
  const data={...envelope,ok:false,error:committed?{
  code:'OUTCOME_UNKNOWN',message:'완료 여부를 알 수 없습니다. 작업 상태를 확인하세요.',retryable:false,recovery:'check-operation',
  }:error(e)};
  check(replies[method],data);
  return {data,transfer:[]};
 }
}
function project(method:Method,value:Record<string,unknown>,permissions:readonly Scope[]):Record<string,unknown>{
 switch(method){
  case 'getCapabilities':{
   const {contractVersion:_,methods:__,...rest}=value;
   return {...rest,methods:(Object.keys(methods) as Method[]).filter(m=>(m!=='openDocument'||(rest.formats as {open:unknown[]}).open.length>0)&&permissions.includes(methods[m][1]))};
  }
  case 'listTemplates':return {templates:[{templateId:catalog.templateId,templateVersion:catalog.templateVersion}]};
  case 'captureSelection':{
   const {selectionSnapshotId,rangeId:_,...rest}=value;return {snapshotId:selectionSnapshotId,...rest};
  }
  case 'readSelection':{
   const {rangeId:_,...rest}=value;return {segmentKey:crypto.randomUUID(),...rest};
  }
  case 'previewEdits':{
   const {rangeId:_,...rest}=value;return rest;
  }
  case 'exportDocument':{
   const {bytes,...rest}=value;
   if(!(bytes instanceof Uint8Array))throw new AIError('INVALID_REQUEST','잘못된 내보내기 응답입니다.');
   // The service owns the original export. Transfer only a dedicated buffer.
   const buffer=new Uint8Array(bytes).buffer;
   return {...rest,byteLength:buffer.byteLength,bytes:buffer};
  }
  default:return value;
 }
}
