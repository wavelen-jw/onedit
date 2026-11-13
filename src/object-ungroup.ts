import type {RhwpAdapter} from './adapter.js';
import {copy,type Selection} from './model.js';

// The existing page-control DTO exposes the real Group variant. Description
// strings, a missing rectangle field, and a coincident bounding box are not type IDs.
export function selectedGroup(a:RhwpAdapter,s:Selection) {
  if(s.kind!=='object'||s.focus.kind!=='body')throw Error('본문의 묶음 개체 한 개를 선택하세요.');
  const p=s.focus;a.assertEditable(p);
  const box=a.call('getShapeBBox',p.sec,p.para,s.control);
  if(!Number.isSafeInteger(box.pageIndex)||box.pageIndex<0||box.pageIndex>=a.pageCount)throw Error('묶음 개체의 실제 쪽을 확인할 수 없습니다.');
  const candidates=(a.call('getPageControlLayout',box.pageIndex).controls??[]).filter((r:any)=>r.secIdx===p.sec&&r.paraIdx===p.para&&r.controlIdx===s.control&&!r.path?.length&&!r.cellPath?.length);
  if(candidates.length!==1||candidates[0].type!=='group'||JSON.stringify(candidates[0].stableIndex)!==JSON.stringify([p.sec,p.para,s.control]))throw Error('선택한 대상은 지원되는 본문 묶음 개체가 아닙니다.');
  const props=a.call('getShapeProperties',p.sec,p.para,s.control);
  let global=p.para;for(let sec=0;sec<p.sec;sec++)global+=a.doc.getParagraphCount(sec);
  const owner=a.call<any[]>('getControls').find(c=>c.list===0&&c.para===global&&c.controlIndex===s.control);
  if(!owner||owner.ctrlId!=='gso'||owner.props?.Lock||props.sizeProtect)throw Error('보호되었거나 소유 위치가 확인되지 않은 묶음 개체입니다.');
  if(props.hasCaption)throw Error('캡션 있는 묶음은 풀 때 캡션이 사라질 수 있어 원본을 유지합니다.');
  if(a.call('getCursorModel').lists.some((l:any)=>l.sectionIndex===p.sec&&l.hostListId===0&&l.hostPara===p.para&&l.controlIndex===s.control))throw Error('내부 글상자·캡션 목록을 가진 묶음은 정확한 편집 owner 수용 전 보존합니다.');
  return {sec:p.sec,para:p.para,control:s.control,props};
}

export function prepareUngroup(a:RhwpAdapter,s:Selection):()=>Selection {
  const target=selectedGroup(a,s),objects=a.call<any[]>('getObjects');
  const texts=Array.from({length:a.doc.getSectionCount()},(_,sec)=>Array.from({length:a.doc.getParagraphCount(sec)},(_,para)=>a.doc.getTextRange(sec,para,0,a.doc.getParagraphLength(sec,para))));
  return ()=>{
    // Execute still checks the exact owner within the same synchronous transaction.
    if(JSON.stringify(selectedGroup(a,s))!==JSON.stringify(target))throw Error('선택한 묶음 개체가 변경되었습니다. 다시 선택하세요.');
    a.call('ungroupShape',target.sec,target.para,target.control);
    const after=a.call<any[]>('getObjects'),delta=after.length-objects.length;
    if(delta<1)throw Error('묶음 해제 후 복원된 개체 수를 확인할 수 없습니다.');
    const global=target.para+Array.from({length:target.sec},(_,sec)=>a.doc.getParagraphCount(sec)).reduce((x,y)=>x+y,0);
    const original=objects.findIndex(o=>o.para===global&&o.controlIndex===target.control);
    const restored=after.slice(original,original+delta+1);
    if(original<0||restored.length!==delta+1||restored.some((o,i)=>o.para!==global||o.controlIndex!==target.control+i||o.kind!=='shape'))throw Error('해제한 자식 개체의 정확한 슬롯을 확인할 수 없습니다.');
    const expected=objects.filter((_,i)=>i!==original).map(o=>o.para===global&&o.controlIndex>target.control?{...o,controlIndex:o.controlIndex+delta}:o);
    if(JSON.stringify(after.filter((_,i)=>i<original||i>=original+delta+1))!==JSON.stringify(expected))throw Error('해제 대상 밖의 개체 목록이 변경되었습니다.');
    const now=Array.from({length:a.doc.getSectionCount()},(_,sec)=>Array.from({length:a.doc.getParagraphCount(sec)},(_,para)=>a.doc.getTextRange(sec,para,0,a.doc.getParagraphLength(sec,para))));
    if(JSON.stringify(now)!==JSON.stringify(texts))throw Error('묶음 해제 중 본문 문자가 변경되었습니다.');
    const next=copy(s);if(next.kind!=='object')throw Error('묶음 선택이 만료되었습니다.');next.control=target.control;
    a.validate(next.focus);return next;
  };
}
