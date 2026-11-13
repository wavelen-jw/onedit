import { HwpDocument } from '../development/core/rhwp.js';
import { coreRuntimeIdentity, siblingDocument } from './core-runtime.js';
import type { Interaction } from './interaction.js';
export type NumberRestart = {mode:0|1|2;start?:number};
let proven: boolean | undefined;
const byRuntime = new WeakMap<object, boolean>();
// Capability is established on a private blank document, never on the user's
// document. Old installed Core stays blocked; no preference/activation override.
export function numberRestartAvailable(source?: HwpDocument): boolean {
  const identity = source && coreRuntimeIdentity(source);
  const prior = identity ? byRuntime.get(identity) : proven;
  if(prior!==undefined)return prior;
  const remember = (value:boolean) => { if(identity)byRuntime.set(identity,value);else proven=value;return value; };
  let d:HwpDocument|undefined,b:HwpDocument|undefined;
  try {
    d=source?siblingDocument(source):HwpDocument.createEmpty();if(!source)JSON.parse(d.createBlankDocument());
    const id=d.ensureDefaultNumbering();JSON.parse(d.applyParaFormat(0,0,JSON.stringify({headType:'Number',numberingId:id,paraLevel:0})));
    const result=JSON.parse(d.setNumberingRestart(0,0,2,5));if(!result.ok)return remember(false);
    const live=JSON.parse(d.getParaPropertiesAt(0,0)),saved=d.exportHwpxWithReport();let bytes:Uint8Array;
    try{if(JSON.parse(saved.contentLoss()).count!==0)return remember(false);bytes=saved.takeBytes();}finally{saved.free();}
    b=siblingDocument(d,bytes);const back=JSON.parse(b.getParaPropertiesAt(0,0));
    // The private blank paragraph has only its number marker. Do not enable a
    // getter-only fix whose live rendering still double-counts the start offset.
    const marker=(doc:HwpDocument)=>Array.from(doc.renderPageSvg(0).matchAll(/<text\b[^>]*>([^<]*)<\/text>/g),m=>m[1]).join('');
    if(marker(d)!=='5.'||marker(b)!=='5.')return remember(false);

    return remember(live.headType==='Number'&&live.numberingRestartMode===2&&live.numberingStartNum===5&&live.numberingId!==id&&back.numberingRestartMode===2&&back.numberingStartNum===5&&back.numberingId===live.numberingId);
  } catch {return remember(false);} finally {b?.free();d?.free();}
}
export const restartScope='문단별 번호 연결은 본문의 일반 문단 번호 한 문단만 지원합니다. 개요·셀·복수 문단은 미지원입니다.';
export function numberRestartReason(editor:Interaction):string {
  try {
    const s=editor.selection;
    if(!numberRestartAvailable(editor.adapter.doc))throw Error('설치 Core의 번호 재조회·저장 보존 검사가 실패했습니다. 수정 Core 후보 통합 전까지 보류합니다.');

    if(s.focus.kind!=='body'||(s.kind!=='caret'&&s.kind!=='text')||(s.kind==='text'&&(s.anchor.kind!=='body'||s.anchor.sec!==s.focus.sec||s.anchor.para!==s.focus.para)))throw Error(restartScope);
    editor.adapter.assertEditable(s.focus);
    if(editor.adapter.paraProps(s.focus).headType!=='Number')throw Error(restartScope);
    return '';
  }catch(error){return String(error);}
}
export function validateNumberRestart(change:NumberRestart){
  if(!change||typeof change!=='object'||Object.keys(change).some(k=>!['mode','start'].includes(k))||![0,1,2].includes(change.mode)||
    (change.start!==undefined&&(!Number.isSafeInteger(change.start)||change.start<1||change.start>65535))||
    (change.mode===2&&change.start===undefined))throw Error('번호 방식과 시작값(1~65535)을 확인하세요.');
}
