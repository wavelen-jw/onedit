import {prepareCaption} from './captions.js';
import {calculationPlan} from './table-calculation.js';
import {prepareNote} from './notes.js';
import {prepareGroup,preparePageHide} from './group-hide.js';
import type {RhwpAdapter} from './adapter.js';
import {nested,copy,type Selection,type Position} from './model.js';
export type RemainingEdit=
 |import('./captions.js').CaptionChange
 |import('./table-calculation.js').TableCalculation
 |import('./notes.js').NoteChange
 |{kind:'object-group';targets:import('./shapes.js').ShapeTarget[]}
 |{kind:'page-hide';flags:boolean[]}
 |{kind:'table-part';operation:'split'|'join'}
 |{kind:'equation';script:string;fontSize:number;color:number};
export function tablePartTarget(a:RhwpAdapter,s:Selection,operation:'split'|'join'){
 const p=s.focus;
 if(p.kind!=='cell'||nested(p)||s.kind!=='caret')throw Error('본문의 일반 표 셀 안에 커서를 놓으세요. 셀 블록·중첩 표는 나누거나 붙이지 않습니다.');
 a.validate(p);a.assertEditable(p);const cells=a.cells(p),cell=cells.find(c=>c.cellIdx===p.cell);
 if(!cell)throw Error('현재 셀의 정확한 행을 조회할 수 없습니다.');
 if(operation==='split'&&(cell.row===0||cells.some(c=>c.row<cell.row&&c.row+c.rowSpan>cell.row)))throw Error('첫 줄이나 세로 병합을 가로지르는 경계에서는 표를 나눌 수 없습니다.');
 let global=p.para;for(let sec=0;sec<p.sec;sec++)global+=a.doc.getParagraphCount(sec);
 const control=a.call<any[]>('getControls').find(c=>c.list===0&&c.para===global&&c.controlIndex===p.control);
 if(!control||control.ctrlId!=='tbl'||control.props?.Lock)throw Error('정확한 표 소유권·보호 상태를 확인하세요.');
 const props=a.call('getTableProperties',p.sec,p.para,p.control);
 if(props.sizeProtect)throw Error('보호된 표는 나누거나 붙이지 않습니다.');
 for(const c of cells)a.assertEditable({...p,cell:c.cellIdx,cellPara:0,offset:0});
 if(operation==='join'){
  const controls=a.call<any[]>('getControls'),sectionStart=global-p.para;let found=false;
  for(let para=p.para+1;para<a.doc.getParagraphCount(p.sec);para++){
   const text=a.doc.getTextRange(p.sec,para,0,a.doc.getParagraphLength(p.sec,para)),rows=controls.filter(c=>c.list===0&&c.para===sectionStart+para),back=rows.find(c=>c.ctrlId==='tbl');
   if(back){if(!/^ *$/.test(text)||rows.length!==1||back.props?.Lock)throw Error('뒤 표의 소유 문단·보호 상태 또는 사이 내용을 확인하세요.');const q={...p,para,control:back.controlIndex,cell:0,cellPara:0,offset:0},properties=a.call('getTableProperties',q.sec,q.para,q.control);if(properties.hasCaption||properties.sizeProtect)throw Error('캡션·보호가 있는 뒤 표는 원본을 유지합니다.');for(const c of a.cells(q))a.assertEditable({...q,cell:c.cellIdx});found=true;break;}
   if(!/^ *$/.test(text)||rows.length)throw Error('두 표 사이에 공백·빈 문단 외의 내용이 있습니다.');
  }
  if(!found)throw Error('붙일 다음 표가 없습니다.');
 }
 return{p,cell,cells};
}
function bodyCaret(a:RhwpAdapter,s:Selection){
 if(s.kind!=='caret'||s.focus.kind!=='body')throw Error('본문의 문자 커서에서 실행하세요. 블록·셀·개체는 원본을 유지합니다.');
 a.validate(s.focus);a.assertEditable(s.focus);return s.focus;
}
export function equationTarget(a:RhwpAdapter,s:Selection){
 const p=bodyCaret(a,s);let global=p.para;for(let sec=0;sec<p.sec;sec++)global+=a.doc.getParagraphCount(sec);
 const controls=a.call<any[]>('getControls').filter(c=>c.list===0&&c.para===global&&!['secd','cold'].includes(c.ctrlId));
 if(controls.length)throw Error('새 수식은 개체·필드 없는 본문 문단의 커서에서 넣으세요. 기존 수식·셀 내부 편집은 아직 미연결입니다.');
 return p;
}
export function prepareRemainingEdit(a:RhwpAdapter,s:Selection,change:RemainingEdit):(()=>Selection)|undefined{
 if(change.kind==='caption')return prepareCaption(a,s,change);
 if(change.kind==='table-calculation')return calculationPlan(a,s,change).apply;
 if(change.kind==='note-create'||change.kind==='note-append')return prepareNote(a,s,change);
 if(change.kind==='object-group')return prepareGroup(a,s,change.targets);
 if(change.kind==='page-hide')return preparePageHide(a,s,change.flags);
 if(change.kind==='table-part'){
  const{p,cell}=tablePartTarget(a,s,change.operation);return()=>{
   tablePartTarget(a,s,change.operation);const result=change.operation==='split'?a.call('splitTable',p.sec,p.para,p.control,cell.row):a.call('mergeTableWithNext',p.sec,p.para,p.control);
   const next=copy(s);if(next.focus.kind!=='cell')throw Error('표 선택이 만료되었습니다.');
   if(change.operation==='split'){if(!Number.isSafeInteger(result.backParaIdx))throw Error('나눈 뒤 표의 정확한 소유 문단을 확인할 수 없습니다.');const moved=a.cells({...p,para:result.backParaIdx,control:0,cell:0,cellPara:0,offset:0}).find(c=>c.row===0&&c.col===cell.col);if(!moved)throw Error('분할 후 원래 셀을 찾을 수 없습니다.');next.focus={...p,para:result.backParaIdx,control:0,cell:moved.cellIdx,cellPara:0,offset:0};}
   a.validate(next.focus);return next;
  };
 }
 const p=equationTarget(a,s);
 if(!change.script.trim()||change.script.length>16384||!Number.isSafeInteger(change.fontSize)||change.fontSize<100||change.fontSize>409600||!Number.isSafeInteger(change.color)||change.color<0||change.color>0xffffff)throw Error('수식·크기·색 범위를 확인하세요.');
 return()=>{equationTarget(a,s);const r=a.call('insertEquation',p.sec,p.para,a.textOffset(p),change.script,change.fontSize,change.color),props=a.call('getEquationProperties',p.sec,p.para,r.controlIdx,-1,-1);
  if(props.script!==change.script||props.fontSize!==change.fontSize||props.color!==change.color)throw Error('정확한 수식 입력 결과를 확인할 수 없습니다.');
  a.validate(p);return copy(s);
 };
}
