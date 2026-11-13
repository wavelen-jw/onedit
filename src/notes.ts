import {bodyParagraphOwners} from './adapter-position.js';
import type {RhwpAdapter} from './adapter.js';
import {copy,type Selection} from './model.js';
export type NoteKind='footnote'|'endnote';
export type NoteTarget={sec:number;para:number;control:number;kind:NoteKind};
export type NoteChange={kind:'note-create';note:NoteKind;text:string}|{kind:'note-append';target:NoteTarget;paragraph:number;expected:unknown;text:string};
const id=(k:NoteKind)=>k==='footnote'?'fn':'en';
export function noteInsertion(a:RhwpAdapter,s:Selection){
 if(s.kind!=='caret'||s.focus.kind!=='body')throw Error('각주·미주는 본문 문자 커서에서 넣으세요. 셀·블록·개체는 유지합니다.');
 a.validate(s.focus);a.assertEditable(s.focus);a.assertTextOnly(s.focus);return s.focus;
}
export function noteView(a:RhwpAdapter,t:NoteTarget){
 if(!t||!['footnote','endnote'].includes(t.kind)||![t.sec,t.para,t.control].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('주석 소유 위치가 올바르지 않습니다.');
 a.validate({kind:'body',sec:t.sec,para:t.para,offset:0});let global=t.para;for(let sec=0;sec<t.sec;sec++)global+=a.doc.getParagraphCount(sec);
 const owner=a.call<any[]>('getControls').find(c=>c.list===0&&c.para===global&&c.controlIndex===t.control);
 if(!owner||owner.ctrlId!==id(t.kind)||owner.props?.Lock)throw Error('선택한 각주·미주의 소유 위치가 변경되었습니다.');
 const raw=a.call('getFootnoteInfo',t.sec,t.para,t.control);
 if(!Number.isSafeInteger(raw.paraCount)||raw.paraCount<1||raw.paraCount>256||!Array.isArray(raw.texts)||raw.texts.length!==raw.paraCount||raw.texts.some((s:any)=>typeof s!=='string')||raw.totalTextLen!==raw.texts.reduce((n:number,s:string)=>n+[...s].length,0))throw Error('주석의 정확한 문단 내용을 조회할 수 없습니다.');
 return{target:{...t},number:raw.number,texts:raw.texts as string[],properties:raw.texts.map((_:string,i:number)=>a.call('getParaPropertiesInFootnote',t.sec,t.para,t.control,i))};
}
export function noteCatalog(a:RhwpAdapter){
 const body=bodyParagraphOwners(a);
 return a.call<any[]>('getControls').filter(c=>c.list===0&&['fn','en'].includes(c.ctrlId)).map(c=>{const p=body[c.para];if(!p)throw Error('주석의 실제 본문 소유자가 없습니다.');return noteView(a,{...p,control:c.controlIndex,kind:c.ctrlId==='fn'?'footnote':'endnote'});});
}
function input(text:string){if(typeof text!=='string'||[...text].length>16000||/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text))throw Error('주석 내용은 16000자 이내의 평문·줄바꿈만 입력하세요.');}
// Existing note owner APIs only. Existing paragraphs are appended to, never
// replaced/deleted through a guessed table path or by rewriting object graphs.
export function prepareNote(a:RhwpAdapter,s:Selection,c:NoteChange):(()=>Selection)|undefined{
 input(c.text);
 if(c.kind==='note-append'&&c.text.includes('\n'))throw Error('기존 주석 추가는 한 문단의 평문만 지원합니다. 새 문단은 새 주석 입력에서만 지원합니다.');
 if(c.kind==='note-create'){
  const p=noteInsertion(a,s);if(!['footnote','endnote'].includes(c.note))throw Error('주석 종류를 확인하세요.');
  return()=>{const r=a.call(c.note==='footnote'?'insertFootnote':'insertEndnote',p.sec,p.para,a.textOffset(p)),t={sec:p.sec,para:p.para,control:r.controlIdx,kind:c.note},initial=noteView(a,t);
   if(r.paraIdx!==p.para||initial.texts.length!==1||initial.texts[0]!=='  ')throw Error('새 주석의 기본 번호·문자 경계를 확인할 수 없습니다.');
   append(a,t,0,initial,c.text,true);const display=a.call('getNoteEditInfo',t.sec,t.para,t.control);if(display.kind!==c.note||!Number.isSafeInteger(display.pageNum)||display.pageNum<0||display.pageNum>=a.pageCount)throw Error('만든 주석의 실제 표시 위치를 확인할 수 없습니다.');return copy(s);
  };
 }
 a.assertEditable(s.focus);a.assertEditable({kind:'body',sec:c.target.sec,para:c.target.para,offset:0});
 const before=noteView(a,c.target);
 if(JSON.stringify(before)!==JSON.stringify(c.expected)||!Number.isSafeInteger(c.paragraph)||c.paragraph<0||c.paragraph>=before.texts.length)throw Error('주석 대상·내용이 변경되었습니다. 다시 여세요.');
 if(!c.text)return;
 return()=>{if(JSON.stringify(noteView(a,c.target))!==JSON.stringify(before))throw Error('주석이 변경되었습니다.');append(a,c.target,c.paragraph,before,c.text);return copy(s);};
}
function append(a:RhwpAdapter,t:NoteTarget,index:number,before:ReturnType<typeof noteView>,text:string,newNativeNote=false){
 // splitParagraphInFootnote calls Paragraph::split_at with logical offsets;
 // a newly generated first note paragraph has the native one AutoNumber slot.
 // This exact template is source-pinned and checked before creation. Existing
 // imported notes have no public logical conversion, so never split them here.
 // Insert at the existing scalar end. The first two native placeholder spaces
 // and AutoNumber remain untouched, as do every preexisting explicit style/object.
 const parts=text.split('\n'),expected=[...before.texts];let at=index,offset=[...expected[at]].length;
 for(let i=0;i<parts.length;i++){
  const part=parts[i];if(part)a.call('insertTextInFootnote',t.sec,t.para,t.control,at,offset,part);expected[at]+=part;offset=[...expected[at]].length;
  if(i<parts.length-1){a.call('splitParagraphInFootnote',t.sec,t.para,t.control,at,offset+(newNativeNote&&at===0?1:0));at++;offset=0;expected.splice(at,0,'');}
 }
 const after=noteView(a,t);if(JSON.stringify(after.texts)!==JSON.stringify(expected)||after.number!==before.number)throw Error('주석 입력 결과·문단 순서가 요청과 다릅니다.');
 for(let i=0;i<before.texts.length;i++){const next=i>index?i+parts.length-1:i;if(JSON.stringify(before.properties[i])!==JSON.stringify(after.properties[next]))throw Error('기존 주석 문단 서식이 변경되었습니다.');}
}
