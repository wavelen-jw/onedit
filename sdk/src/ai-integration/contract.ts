// New generation; independent of legacy Host protocols 1 and 2.
export const contractVersion = 'onedit-ai/1.0' as const;
export const methods = {
 connect:'read', getCapabilities:'read', getState:'read', openDocument:'lifecycle',
 getCatalog:'read', prepareDocument:'lifecycle', commitPreparedDocument:'lifecycle',
 captureSelection:'read', readSelection:'read', releaseSelection:'read', previewEdits:'edit',
 applyProposal:'edit', discardProposal:'edit', getOperation:'read', cancelOperation:'edit',
 undo:'edit', redo:'edit', getLayoutReport:'read', exportDocument:'save', acknowledgeSaved:'save',
} as const;
export type Method=keyof typeof methods;
export type Permission=typeof methods[Method];
export const errorCodes=[
 'UNSUPPORTED_CONTRACT','UNSUPPORTED_CAPABILITY','ORIGIN_NOT_ALLOWED','PERMISSION_DENIED','NO_SELECTION',
 'COMPOSITION_IN_PROGRESS','UNSUPPORTED_SELECTION','MIXED_FORMAT_UNSUPPORTED','CONTENT_LIMIT_EXCEEDED',
 'INVALID_SPEC','STALE_DOCUMENT','SOURCE_MISMATCH','PREVIEW_EXPIRED','APPROVAL_REQUIRED','INVALID_APPROVAL',
 'IDEMPOTENCY_CONFLICT','UNSAVED_CHANGES','TRANSACTION_ROLLED_BACK','RECOVERY_REQUIRED','SAVE_CONFLICT',
 'UNSUPPORTED_EXPORT_FORMAT','UNDO_NOT_LATEST','ALREADY_COMMITTED','OPERATION_NOT_FOUND','BUSY',
 'INVALID_REQUEST','SESSION_CLOSED','OPERATION_CANCELLED','TIMEOUT',
 'UNSUPPORTED_UNSAFE_FILE','FORMAT_MISMATCH','DUPLICATE_DOCUMENT',
] as const;
export type ErrorCode=typeof errorCodes[number];
export type ErrorBody={code:ErrorCode;message:string;retryable:boolean;recovery:'none'|'resync'|'recapture'|'check-operation'|'reopen-copy'};
const safeMessages:Record<ErrorCode,string>={
 UNSUPPORTED_CONTRACT:'지원되지 않는 온편집 AI 계약입니다.',UNSUPPORTED_CAPABILITY:'이 명령은 현재 지원하지 않습니다.',
 ORIGIN_NOT_ALLOWED:'허용된 서비스 주소를 사용하세요.',PERMISSION_DENIED:'현재 작업 권한을 확인할 수 없습니다.',
 NO_SELECTION:'수정할 글자를 먼저 선택하세요.',COMPOSITION_IN_PROGRESS:'한글 조합을 마친 뒤 다시 요청하세요.',
 UNSUPPORTED_SELECTION:'이 선택 범위는 안전하게 수정할 수 없습니다.',MIXED_FORMAT_UNSUPPORTED:'서식이 서로 다른 글자는 따로 선택하세요.',
 CONTENT_LIMIT_EXCEEDED:'지원하는 입력 크기를 넘었습니다.',INVALID_SPEC:'지원하는 문서 구조와 글자 범위를 확인하세요.',
 STALE_DOCUMENT:'문서 또는 선택이 바뀌었습니다. 다시 선택하고 검토하세요.',SOURCE_MISMATCH:'선택 원문 또는 서식이 다릅니다.',
 PREVIEW_EXPIRED:'미리보기가 만료됐습니다. 다시 검토하세요.',APPROVAL_REQUIRED:'이 미리보기에 대한 사용자 승인이 필요합니다.',
 INVALID_APPROVAL:'현재 미리보기의 승인이나 권한을 확인할 수 없습니다.',IDEMPOTENCY_CONFLICT:'같은 작업 키로 다른 내용을 보낼 수 없습니다.',
 UNSAVED_CHANGES:'저장하지 않은 변경이 있습니다.',TRANSACTION_ROLLED_BACK:'작업에 실패해 이전 문서를 복원했습니다.',
 RECOVERY_REQUIRED:'원복을 확인할 수 없어 읽기 전용으로 보호했습니다.',SAVE_CONFLICT:'서버 저장 결과가 현재 내보내기와 다릅니다.',
 UNSUPPORTED_EXPORT_FORMAT:'지원하는 파일 형식을 확인하세요.',UNDO_NOT_LATEST:'지정한 작업 이후 다른 편집이 있습니다.',
 ALREADY_COMMITTED:'이미 적용된 작업입니다.',OPERATION_NOT_FOUND:'이 세션에서 해당 작업을 찾을 수 없습니다.',
 BUSY:'현재 작업이 끝난 뒤 다시 시도하세요.',INVALID_REQUEST:'요청 형식이 올바르지 않습니다.',SESSION_CLOSED:'연결이 종료되었습니다.',
 OPERATION_CANCELLED:'적용하기 전에 작업을 취소했습니다.',TIMEOUT:'응답을 받지 못했습니다. 적용 여부를 먼저 확인하세요.',
 UNSUPPORTED_UNSAFE_FILE:'안전하게 열 수 있는 문서인지 확인하지 못했습니다.',FORMAT_MISMATCH:'파일 형식과 실제 내용이 일치하지 않습니다.',
 DUPLICATE_DOCUMENT:'이 편집 세션에서 이미 사용한 문서 또는 작업본입니다.',
};
export class AIError extends Error {
 constructor(readonly code:ErrorCode,message:string,readonly recovery:ErrorBody['recovery']='none',readonly retryable=false){super(message)}
 toWire():ErrorBody{return {code:this.code,message:safeMessages[this.code],retryable:this.retryable,recovery:this.recovery}}
}
export const need=(ok:unknown,code:ErrorCode,message:string,recovery?:ErrorBody['recovery']):void=>{if(!ok)throw new AIError(code,message,recovery)};
export type Binding={documentId:string;documentInstanceId:string;workingCopyId:string;mutationRevision:number;hostVersion:string};
export type NewBinding=Pick<Binding,'documentId'|'workingCopyId'|'hostVersion'>;
export type Envelope={type:'request';contractVersion:typeof contractVersion;requestId:string;sessionId:string;method:Exclude<Method,'connect'>;binding?:Binding;params?:unknown;idempotencyKey?:string};
export type Connect={type:'onedit-ai-connect';contractVersion:typeof contractVersion;requestId:string;sessionId:string;permissions:Permission[];sessionProof:string};
export type Approval={subjectId:string;digest:string;kind:'create'|'edit';binding:Binding;sessionId:string;expiresAt:number;proof:string};
export const limits=Object.freeze({jsonBytes:2*1024*1024,fileBytes:30*1024*1024,characters:20000,blocks:200,tables:20,cells:1000,columns:12,selection:4000,context:500,snapshotMs:300000,proposalMs:180000,draftMs:600000,writers:1,queue:3,receipts:128});
export const isId=(x:unknown):x is string=>typeof x==='string'&&/^[\w:.-]{1,128}$/.test(x);
export const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&Object.getPrototypeOf(v)===Object.prototype;
export function exact(v:unknown,required:readonly string[],optional:readonly string[]=[]):v is Record<string,unknown>{
 return isObject(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
}
export const isBinding=(v:unknown):v is Binding=>exact(v,['documentId','documentInstanceId','workingCopyId','mutationRevision','hostVersion'])&&
 [v.documentId,v.documentInstanceId,v.workingCopyId,v.hostVersion].every(isId)&&typeof v.mutationRevision==='number'&&Number.isSafeInteger(v.mutationRevision)&&v.mutationRevision>=0;
export const isNewBinding=(v:unknown):v is NewBinding=>exact(v,['documentId','workingCopyId','hostVersion'])&&Object.values(v).every(isId);
export const sameBinding=(a:Binding,b:Binding)=>a.documentId===b.documentId&&a.documentInstanceId===b.documentInstanceId&&a.workingCopyId===b.workingCopyId&&a.mutationRevision===b.mutationRevision&&a.hostVersion===b.hostVersion;
export const isApproval=(v:unknown):v is Approval=>exact(v,['subjectId','digest','kind','binding','sessionId','expiresAt','proof'])&&
 isId(v.subjectId)&&typeof v.digest==='string'&&/^[a-f\d]{64}$/.test(v.digest)&&['create','edit'].includes(v.kind as string)&&isBinding(v.binding)&&isId(v.sessionId)&&
 typeof v.expiresAt==='number'&&Number.isSafeInteger(v.expiresAt)&&typeof v.proof==='string'&&v.proof.length>0&&v.proof.length<=2048;
// A bounded walk BEFORE serialization/fingerprinting. Binary is permitted only
// in the explicitly validated HWPX open slot. Reject cycles, clones with exotic
// prototypes, surrogate input and excessive keys without copying large strings.
function assertDense(a:unknown[]){
 need(a.length<=1000,'CONTENT_LIMIT_EXCEEDED','요청 배열이 너무 큽니다.');
 need(Object.keys(a).length===a.length,'INVALID_REQUEST','연속한 JSON 배열이 필요합니다.');
 for(let i=0;i<a.length;i++)need(Object.hasOwn(a,i),'INVALID_REQUEST','연속한 JSON 배열이 필요합니다.');
}
function assertUnicode(s:string){
 need(!/\p{Surrogate}/u.test(s),'INVALID_REQUEST','잘못된 Unicode 입력입니다.');
}
export function validateValue(value:unknown, binary?:Uint8Array|ArrayBuffer):void {
 const encoder=new TextEncoder(),seen=new Set<object>();let size=0, nodes=0;
 function walk(v:unknown,depth:number){
  need(depth<=16&&++nodes<=20000,'CONTENT_LIMIT_EXCEEDED','요청 구조가 너무 큽니다.');
  if(v===binary&&binary){need(binary.byteLength<=limits.fileBytes,'CONTENT_LIMIT_EXCEEDED','파일 크기 한도입니다.');return}
  if(typeof v==='string'){need(v.length<=limits.jsonBytes,'CONTENT_LIMIT_EXCEEDED','문자열 한도입니다.');assertUnicode(v);size+=encoder.encode(v).byteLength+2}
  else if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))size+=24;
  else if(Array.isArray(v)||isObject(v)){
   if(Array.isArray(v))assertDense(v);
   const o=v as object;need(!seen.has(o),'INVALID_REQUEST','순환 요청입니다.');seen.add(o);
   const entries=Object.entries(o);need(entries.length<=1000,'CONTENT_LIMIT_EXCEEDED','요청 필드가 너무 많습니다.');
   for(const [k,x]of entries){
    need(k.length<=128&&!['__proto__','prototype','constructor'].includes(k),'INVALID_REQUEST','지원하지 않는 키입니다.');
    assertUnicode(k);size+=encoder.encode(k).byteLength+4;walk(x,depth+1);
   }
   seen.delete(o);
  } else throw new AIError('INVALID_REQUEST','JSON과 지정된 파일만 지원합니다.');
  need(size<=limits.jsonBytes,'CONTENT_LIMIT_EXCEEDED','요청 메타데이터 한도입니다.');
 }
 walk(value,0);
 // Escaped string expansion is counted too.
 need(encoder.encode(JSON.stringify(value,(_k,v)=>binary&&v===binary?null:v)).byteLength<=limits.jsonBytes,'CONTENT_LIMIT_EXCEEDED','요청 메타데이터 한도입니다.');
}
export function canonical(v:unknown):string{
 if(Array.isArray(v)){assertDense(v);return '['+v.map(canonical).join(',')+']';}
 if(isObject(v))return '{'+Object.keys(v).sort().map(k=>{assertUnicode(k);return JSON.stringify(k)+':'+canonical(v[k])}).join(',')+'}';
 return JSON.stringify(v);
}
export async function digest(v:unknown):Promise<string>{
 const bytes=new TextEncoder().encode(canonical(v));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
