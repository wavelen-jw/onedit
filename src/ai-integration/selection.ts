import {AIError,need,limits,exact} from './contract.js';
import type {ExternalHost} from '../host-v2.js';
import type {AiNativeRange} from '../ai-native-range.js';

export type Capture={id:string;rangeId:string;targetId:string;source:string;sourceHash:string;formatDigest:string;paragraph:string;format:unknown;expiresAt:number;start:number;end:number};
export const current=(h:ExternalHost)=>({documentId:h.a.documentId,expectedRevision:h.a.revision});
/** Host-facing context only. B owns all native owner, shape and Unicode write
 * admission. Verify its sealed source before retaining any adjacent text. */
export async function captureRange(_h:ExternalHost,native:AiNativeRange,now:number):Promise<Capture>{
 const r=await native.capture();
 return {id:crypto.randomUUID(),rangeId:r.rangeId,targetId:r.targetId,source:r.source,sourceHash:r.sourceHash,formatDigest:r.formatDigest,paragraph:r.paragraph,format:r.format,expiresAt:now+limits.snapshotMs,start:r.start,end:r.end};
}
export function readRange(c:Capture,context?:unknown){
 let before=0,after=0;
 if(context!==undefined){
  if(!exact(context,['before','after'])||!Number.isInteger(context.before)||!Number.isInteger(context.after)||
   (context.before as number)<0||(context.after as number)<0||(context.before as number)>limits.context||(context.after as number)>limits.context)
   throw new AIError('INVALID_REQUEST','앞뒤 문맥은 각각 최대 500 코드포인트입니다.');
  before=context.before as number;after=context.after as number;
 }
 const f=(c.format as {character?:Record<string,unknown>})?.character??{},s=[...c.paragraph],a=Math.max(0,c.start-before),b=Math.min(s.length,c.end+after);
 return {rangeId:c.rangeId,text:c.source,format:{bold:f.bold===true,italic:f.italic===true,underline:f.underline===true,
  fontSize:typeof f.fontSize==='number'?f.fontSize:null},
  ...(context!==undefined?{context:{before:s.slice(a,c.start).join(''),after:s.slice(c.end,b).join(''),readOnly:true,
   truncatedBefore:a>0,truncatedAfter:b<s.length}}:{})};
}
export function replacementText(v:unknown):string{
 if(typeof v!=='string'||/[\p{Surrogate}\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/u.test(v))throw new AIError('INVALID_SPEC','문단 구분 LF 외 제어문자 없는 수정문만 지원합니다.');
 need([...v].length<=limits.selection,'CONTENT_LIMIT_EXCEEDED','수정문은 4,000 코드포인트까지 가능합니다.');
 return v;
}
