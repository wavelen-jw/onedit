import type {RhwpAdapter} from './adapter.js';
import {ordered,type Selection} from './model.js';
export function wholeBodySection(a:RhwpAdapter,s:Selection){
 if(s.kind!=='text'||s.anchor.kind!=='body'||s.focus.kind!=='body')return;
 const [from,to]=ordered(s.anchor,s.focus);
 if(from.sec===to.sec&&from.para===0&&from.offset===0&&to.para===a.doc.getParagraphCount(from.sec)-1&&to.offset===a.length(to))return{from,to};
}
// One caller-owned History transaction. Keep section/column/page definitions,
// remove the selected body and any floating endpoint anchors left by block cut.
// Postconditions fail closed, so no partial deletion survives any failure.
export function prepareWholeBodyDelete(a:RhwpAdapter,s:Selection){
 const range=wholeBodySection(a,s);if(!range)throw Error('전체 본문 범위가 아닙니다.');
 const {from,to}=range;
 for(let para=0;para<=to.para;para++)a.assertEditable({...from,para});
 const controls=a.call<any[]>('getControls');
 const base=Array.from({length:from.sec},(_,n)=>a.doc.getParagraphCount(n)).reduce((a,b)=>a+b,0);
 if(to.para===0&&to.offset===0&&!controls.some(c=>c.list===0&&c.para===base&&['gso','tbl','eqed','fn','en'].includes(c.ctrlId)))return;
 if(controls.some(c=>c.list===0&&c.para>=base&&c.para<=base+to.para&&c.props?.Lock))throw Error('보호된 개체가 포함된 본문은 삭제할 수 없습니다.');
 return()=>{
  a.call('deleteBodyBlock',from.sec,0,0,to.para,to.offset);
  if(a.doc.getParagraphCount(from.sec)!==1||a.length(from)!==0)throw Error('전체 본문 삭제 후 빈 문단을 확인할 수 없습니다.');
  const remaining=a.call<any[]>('getControls').filter(c=>c.list===0&&c.para===base&&['gso','tbl','eqed'].includes(c.ctrlId)).sort((a,b)=>b.controlIndex-a.controlIndex);
  for(const c of remaining)a.call('deleteControlAt',0,base,c.controlIndex);
  const after=a.call<any[]>('getControls');
  if(after.some(c=>c.list===0&&c.para===base&&['gso','tbl','eqed','fn','en'].includes(c.ctrlId)))throw Error('전체 삭제 후 본문 개체가 남아 작업을 취소했습니다.');
  a.validate(from);return{kind:'caret' as const,focus:{...from,offset:0}};
 };
}
