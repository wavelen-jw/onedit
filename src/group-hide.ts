import type {RhwpAdapter} from './adapter.js';
import {copy,type Selection} from './model.js';
import {shapeCatalog,type ShapeTarget} from './shapes.js';

// UI ownership only. A group is chosen explicitly, never inferred from adjacent
// controls or from a text selection. Existing root-shape/Core APIs do the edit.
export function groupCandidates(a:RhwpAdapter,s:Selection){
 if(s.kind!=='object'||s.focus.kind!=='body'||s.textbox)throw Error('본문의 사각형 개체를 선택한 뒤 함께 묶을 개체를 고르세요.');
 const p=s.focus;a.validate(p);a.assertEditable(p);
 const lists=a.call('getCursorModel').lists;
 const rows=shapeCatalog(a).filter(r=>r.target.sec===p.sec&&r.target.para===p.para&&r.name==='사각형'&&!r.reason&&!r.props.treatAsChar&&!r.props.hasCaption&&!lists.some((l:any)=>l.sectionIndex===p.sec&&l.hostListId===0&&l.hostPara===p.para&&l.controlIndex===r.target.control));
 if(!rows.some(r=>r.target.control===s.control)||rows.length<2)throw Error('같은 본문 문단의 보호되지 않은 일반 사각형 두 개 이상만 묶습니다. 글상자·캡션·중첩 개체는 유지합니다.');
 return rows;
}
export function prepareGroup(a:RhwpAdapter,s:Selection,targets:ShapeTarget[]):()=>Selection{
 const rows=groupCandidates(a,s),p=s.focus;
 if(s.kind!=='object'||p.kind!=='body'||targets.length<2||new Set(targets.map(t=>JSON.stringify(t))).size!==targets.length||!targets.some(t=>t.control===s.control))throw Error('선택한 개체를 포함하여 묶을 개체 두 개 이상을 고르세요.');
 const chosen=targets.map(t=>{const r=rows.find(r=>JSON.stringify(r.target)===JSON.stringify(t));if(!r)throw Error('묶을 개체의 소유 위치·식별자가 변경되었습니다.');return r;}).sort((x,y)=>x.target.control-y.target.control);
 if(chosen.some((r,i)=>i&&r.target.control!==chosen[i-1].target.control+1))throw Error('다른 개체를 사이에 둔 묶기는 원본을 유지합니다. 연속된 사각형을 고르세요.');
 const snapshot=JSON.stringify(chosen),objects=a.call<any[]>('getObjects');let global=p.para;for(let sec=0;sec<p.sec;sec++)global+=a.doc.getParagraphCount(sec);
 return()=>{
  const now=groupCandidates(a,s);if(JSON.stringify(chosen.map(r=>now.find(n=>JSON.stringify(n.target)===JSON.stringify(r.target))))!==snapshot)throw Error('묶을 개체가 변경되었습니다. 다시 선택하세요.');
  const r=a.call('groupShapes',JSON.stringify({sectionIdx:p.sec,targets:chosen.map(({target:t})=>({paraIdx:t.para,controlIdx:t.control}))}));
  if(r.ok!==true||r.paraIdx!==p.para||r.controlIdx!==chosen[0].target.control)throw Error('묶은 개체의 정확한 소유 위치를 확인할 수 없습니다.');
  const removed=new Set(chosen.map(r=>r.target.control)),after=a.call<any[]>('getObjects'),delta=chosen.length-1;
  const expected=objects.filter(o=>o.para!==global||!removed.has(o.controlIndex)).map(o=>o.para===global&&o.controlIndex>r.controlIdx?{...o,controlIndex:o.controlIndex-delta}:o);
  if(JSON.stringify(after.filter(o=>o.para!==global||o.controlIndex!==r.controlIdx))!==JSON.stringify(expected))throw Error('묶기 대상 밖의 개체 목록이 변경되었습니다.');
  const box=a.call('getShapeBBox',p.sec,p.para,r.controlIdx),layout=a.call('getPageControlLayout',box.pageIndex).controls;
  if(!layout.some((b:any)=>b.type==='group'&&JSON.stringify(b.stableIndex)===JSON.stringify([p.sec,p.para,r.controlIdx])))throw Error('묶음 개체의 표시 소유권을 확인할 수 없습니다.');
  return {kind:'object',focus:copy(p),control:r.controlIdx};
 };
}
export const hideKeys=['hideHeader','hideFooter','hideMasterPage','hideBorder','hideFill','hidePageNum'] as const;
export function pageHideTarget(a:RhwpAdapter,s:Selection){
 if(s.kind!=='caret'||s.focus.kind!=='body')throw Error('감출 쪽의 본문 문자 커서에서 실행하세요. 셀·블록·개체는 유지합니다.');
 const p=s.focus;a.validate(p);a.assertEditable(p);const raw=a.call('getPageHide',p.sec,p.para);
 // exists:false explicitly means no PageHide control; this is not an unknown
 // or failed query. Only that documented case supplies six false flags.
 const flags=raw.exists===false?Object.fromEntries(hideKeys.map(k=>[k,false])):raw;
 if(raw.exists!==true&&raw.exists!==false)throw Error('감추기 제어의 존재 여부를 조회할 수 없습니다.');
 if(hideKeys.some(k=>typeof flags[k]!=='boolean'))throw Error('현재 쪽의 감추기 설정을 조회할 수 없습니다.');
 return {p,flags};
}
export function preparePageHide(a:RhwpAdapter,s:Selection,flags:boolean[]):(()=>Selection)|undefined{
 const {p,flags:before}=pageHideTarget(a,s);
 if(flags.length!==6||flags.some(v=>typeof v!=='boolean'))throw Error('감추기 설정을 확인하세요.');
 if(hideKeys.every((k,i)=>before[k]===flags[i]))return;
 return()=>{pageHideTarget(a,s);a.call('setPageHide',p.sec,p.para,...flags);const after=pageHideTarget(a,s).flags;if(hideKeys.some((k,i)=>after[k]!==flags[i]))throw Error('감추기 적용 결과가 요청과 다릅니다.');return copy(s);};
}
