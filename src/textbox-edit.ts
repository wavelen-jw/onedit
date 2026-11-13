import type { RhwpAdapter } from './adapter.js';
import { copy, type ParagraphTarget, type Selection } from './model.js';
import { shapeCatalog } from './shapes.js';

// UI-only editing address for an existing root drawing.text_box. It is not a
// body text address or a table cell; Core's original path API owns the identity.
export type TextboxCaret={target:ParagraphTarget;instanceId:number;scInstId:number;anchor:number;offset:number};
export type TextboxEdit={expected:string;text:string;caret:number;splitAt?:number};
type ObjectSelection=Extract<Selection,{kind:'object'}>;
export function textboxView(a:RhwpAdapter,s:Selection,paragraph?:number){
  if(s.kind!=='object'||s.focus.kind!=='body')throw Error('본문의 일반 글상자를 선택하세요.');
  a.validate(s.focus);a.assertEditable(s.focus);
  let target=s.textbox?.target;
  if(target){target=a.resolveParagraph(target);if(target.path.length!==1||target.path[0].cellIndex!==0)throw Error('일반 글상자 문단이 아닙니다.');}
  const sec=target?.sectionIndex??s.focus.sec,para=target?.parentParaIndex??s.focus.para,control=target?.path[0].controlIndex??s.control;
  if(sec!==s.focus.sec||para!==s.focus.para||control!==s.control)throw Error('글상자 소유 위치가 변경되었습니다. 다시 선택하세요.');
  const row=shapeCatalog(a).find(r=>r.target.sec===sec&&r.target.para===para&&r.target.control===control);
  if(!row||row.name!=='글상자'||!Object.hasOwn(row.props,'roundRate')||row.props.hasCaption)throw Error('캡션·그룹·중첩을 제외한 본문 일반 글상자만 편집합니다.');
  if(s.textbox&&(row.target.instanceId!==s.textbox.instanceId||row.target.scInstId!==s.textbox.scInstId))throw Error('선택한 글상자가 다른 개체로 바뀌었습니다.');
  const global=Array.from({length:sec},(_,n)=>a.doc.getParagraphCount(n)).reduce((x,y)=>x+y,0)+para;
  const own=a.call<any[]>('getControls').find(c=>c.list===0&&c.para===global&&c.controlIndex===control);
  if(!own||own.props?.Lock||row.props.sizeProtect)throw Error('보호된 글상자는 편집할 수 없습니다.');
  const list=a.call('getCursorModel').lists.find((l:any)=>l.isCell===false&&l.hostListId===0&&l.sectionIndex===sec&&l.hostPara===para&&l.controlIndex===control);
  if(!list||!Number.isSafeInteger(list.listId)||!Number.isSafeInteger(list.paraCount)||list.paraCount<1)throw Error('글상자 내부 문단을 확인할 수 없습니다.');
  if(a.call<any[]>('getControls').some(c=>c.list===list.listId))throw Error('내부 개체가 있는 글상자는 아직 편집하지 않습니다.');
  const index=paragraph??target?.path[0].cellParaIndex??0;
  if(!Number.isSafeInteger(index)||index<0||index>=list.paraCount)throw Error('글상자 문단이 현재 문서에 없습니다.');
  const path=[{controlIndex:control,cellIndex:0,cellParaIndex:index}];
  // A deliberate paragraph switch captures the actual new paragraph. Ordinary
  // restore/edit always resolves the original handle; no index recapture fallback.
  if(!target||paragraph!==undefined)target=a.call('captureCellParagraphPath',sec,para,JSON.stringify(path)).target;
  if(!target||target.path[0].cellParaIndex!==index)throw Error('글상자 문단 식별자가 일치하지 않습니다.');
  const text=a.doc.getTextInCellByPath(sec,para,JSON.stringify(path),0,target.charLength);
  if([...text].length!==target.charLength)throw Error('글상자 문자 범위를 확인할 수 없습니다.');
  const marker:TextboxCaret={target,instanceId:row.target.instanceId,scInstId:row.target.scInstId,anchor:paragraph!==undefined?0:s.textbox?.anchor??0,offset:paragraph!==undefined?0:s.textbox?.offset??0};
  for(const offset of[marker.anchor,marker.offset])if(!Number.isSafeInteger(offset)||offset<0||offset>target.charLength)throw Error('글상자 선택 위치가 만료되었습니다.');
  return{selection:{...copy(s),textbox:marker}as ObjectSelection,marker,listId:list.listId,index,count:list.paraCount,path:JSON.stringify(path),text,props:a.call('getCellParaPropertiesByPath',sec,para,JSON.stringify(path))};
}
export function resolveTextboxSelection(a:RhwpAdapter,s:ObjectSelection):ObjectSelection {
  if(!s.textbox)return copy(s);
  return textboxView(a,s).selection;
}
export function prepareTextboxEdit(a:RhwpAdapter,s:Selection,c:TextboxEdit):(()=>Selection)|undefined{
  const v=textboxView(a,s);
  if(typeof c.expected!=='string'||typeof c.text!=='string'||c.expected!==v.text||/[\u0000-\u0008\u000a-\u001f\u007f]/.test(c.text))throw Error('글상자 내용이 바뀌었거나 지원하지 않는 문자가 있습니다. 다시 여세요.');
  const next=[...c.text],before=[...v.text];
  if(!Number.isSafeInteger(c.caret)||c.caret<0||c.caret>next.length||c.splitAt!==undefined&&(!Number.isSafeInteger(c.splitAt)||c.splitAt<0||c.splitAt>next.length))throw Error('글상자 입력 위치가 올바르지 않습니다.');
  if(c.text===v.text&&c.splitAt===undefined)return;
  let start=0,end=before.length,tail=next.length;
  while(start<end&&start<tail&&before[start]===next[start])start++;
  while(end>start&&tail>start&&before[end-1]===next[tail-1]){end--;tail--;}
  const stream=(scalar:number)=>{
    const stops=a.call<number[]>('getCaretStops',v.listId,v.index),t=a.resolveParagraph(v.marker.target);
    if(!Array.isArray(stops)||stops.length!==t.charLength+1)throw Error('글상자 캐럿 범위를 확인할 수 없습니다.');
    const pos=stops[scalar];if(!Number.isSafeInteger(pos)||pos<0)throw Error('글상자 캐럿 변환에 실패했습니다.');return pos;
  };
  return()=>{
    if(end>start)a.call('deleteAtCursor',v.listId,v.index,stream(start),stream(end));
    const text=next.slice(start,tail).join('');if(text)a.call('insertTextAtCursor',v.listId,v.index,stream(start),text);
    const live=textboxView(a,{...v.selection,textbox:{...v.marker,anchor:0,offset:0}});if(live.text!==c.text)throw Error('글상자 입력 결과가 일치하지 않습니다.');
    let index=v.index,offset=c.caret;
    if(c.splitAt!==undefined){const r=a.call('splitParaAtCursor',live.listId,live.index,stream(c.splitAt));if(r.cellParaIndex!==v.index+1||r.charOffset!==0)throw Error('나눈 글상자 문단 위치가 일치하지 않습니다.');index=r.cellParaIndex;offset=0;}
    const after=textboxView(a,live.selection,index),expected=c.splitAt===undefined?c.text:next.slice(c.splitAt).join('');
    if(after.count!==v.count+(c.splitAt===undefined?0:1)||after.text!==expected)throw Error('글상자 문단 결과가 일치하지 않습니다.');
    if(c.splitAt!==undefined&&textboxView(a,after.selection,v.index).text!==next.slice(0,c.splitAt).join(''))throw Error('글상자 앞 문단이 일치하지 않습니다.');
    after.selection.textbox!.anchor=offset;after.selection.textbox!.offset=offset;return after.selection;
  };
}
