import {AIError,need,limits,exact} from './contract.js';
import type {ExternalHost} from '../host-v2.js';
import type {AiNativeRange} from '../ai-native-range.js';
import {sameContainer,paraIndex} from '../model.js';

export type Capture={id:string;rangeId:string;targetId:string;source:string;sourceHash:string;formatDigest:string;paragraph:string;format:unknown;expiresAt:number;start:number;end:number};
export const current=(h:ExternalHost)=>({documentId:h.a.documentId,expectedRevision:h.a.revision});
/** Host-facing context only. B owns all native owner, shape and Unicode write
 * admission. Verify its sealed source before retaining any adjacent text. */
export async function captureRange(h:ExternalHost,native:AiNativeRange,now:number):Promise<Capture>{
 const a=h.a,sel=h.editor.capture().selection;
 if(sel.kind==='caret')throw new AIError('NO_SELECTION','수정할 글자를 먼저 선택하세요.');
 if(sel.kind!=='text')throw new AIError('UNSUPPORTED_SELECTION','한 문단의 일부만 선택하세요.');
 need(sameContainer(sel.anchor,sel.focus)&&paraIndex(sel.anchor)===paraIndex(sel.focus),'UNSUPPORTED_SELECTION','한 문단의 일부만 선택하세요.');
 const from=Math.min(sel.anchor.offset,sel.focus.offset),to=Math.max(sel.anchor.offset,sel.focus.offset),
  start=a.textOffset(sel.focus,from),end=a.textOffset(sel.focus,to),paragraph=a.text(sel.focus);
 const r=await native.capture();
 try{
  need(r.source===[...paragraph].slice(start,end).join(''),'SOURCE_MISMATCH','캡처 원문이 일치하지 않습니다.');
  return {id:crypto.randomUUID(),rangeId:r.rangeId,targetId:r.targetId,source:r.source,sourceHash:r.sourceHash,formatDigest:r.formatDigest,paragraph,format:r.format,expiresAt:now+limits.snapshotMs,start,end};
 }catch(e){native.release(r.rangeId);throw e}
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
 if(typeof v!=='string'||/[\p{Surrogate}\u0000-\u001f\u007f\u2028\u2029]/u.test(v))throw new AIError('INVALID_SPEC','개행·제어문자 없는 수정문만 지원합니다.');
 need([...v].length<=limits.selection,'CONTENT_LIMIT_EXCEEDED','수정문은 4,000 코드포인트까지 가능합니다.');
 return v;
}
