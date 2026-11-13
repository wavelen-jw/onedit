import type {RhwpAdapter} from './adapter.js';
import {copy,nested,sameTable,type Selection,type Position} from './model.js';
import {repeatAutofillPlan} from './table-autofill-repeat.js';

// Exact arithmetic series, with optional identical literal prefix/suffix,
// use existing owner-bound text APIs. Registered lists are not inferred.
// Rich repetition/list transfer must not silently degrade to plain text.
// Numeric writes preserve cell properties; unlike rich repetition, no nested
// property setter or guessed outer-cell address is needed.
function seriesCell(a:RhwpAdapter,p:Position){
 return nested(p)&&p.kind==='cell'?a.call('getCellPropertiesByPath',p.sec,p.para,a.path(p),p.cell):a.cellProps(p);
}
export function autofillPlan(a:RhwpAdapter,s:Selection,repeat=false){
 if(repeat)return repeatAutofillPlan(a,s);
 if(s.kind!=='cells'||!sameTable(s.anchor,s.focus))throw Error('같은 표의 연속된 셀 블록을 선택하세요.');
 const p=s.focus;a.validate(p);
 // Each ancestor and the exact leaf must be editable. assertEditable alone
 // intentionally checks the outer cell, not every nested owner.
 if(nested(p)){for(let depth=0;depth<(p.ancestors?.length??0);depth++){const step=p.ancestors![depth],parent={...p,control:step.controlIndex,cell:step.cellIndex,cellPara:step.cellParaIndex,offset:0,ancestors:p.ancestors!.slice(0,depth)};const props=seriesCell(a,parent);if(props.cellProtect||props.fieldName||props.editableInForm)throw Error('보호·필드·양식 셀 안에서는 자동 채우기를 적용하지 않습니다.');}}
 const all=a.cells(p),anchor=all.find(c=>c.cellIdx===s.anchor.cell),focus=all.find(c=>c.cellIdx===p.cell);
 if(!anchor||!focus||all.some(c=>c.rowSpan!==1||c.colSpan!==1))throw Error('병합·분할 없는 일반 표에서 숫자 연속 채우기를 지원합니다.');
 const left=Math.min(anchor.col,focus.col),right=Math.max(anchor.col,focus.col),top=Math.min(anchor.row,focus.row),bottom=Math.max(anchor.row,focus.row);
 const cells=all.filter(c=>c.row>=top&&c.row<=bottom&&c.col>=left&&c.col<=right);
 if(cells.length!==(right-left+1)*(bottom-top+1)||new Set(cells.map(c=>c.cellIdx)).size!==cells.length)throw Error('정확한 사각형 셀 블록을 선택하세요.');
 // The official square example 1,2 -> 3..25 advances across columns.
 cells.sort((a,b)=>right-left>=bottom-top?a.row-b.row||a.col-b.col:a.col-b.col||a.row-b.row);
 const entries=cells.map(c=>{const q={...p,cell:c.cellIdx,cellPara:0,offset:0};a.validate(q);a.assertEditable(q);a.assertTextOnly(q);if(a.count(q)!==1)throw Error('각 셀이 한 문단인 숫자 연속 채우기만 지원합니다.');const cell=seriesCell(a,q);if(nested(q)&&(cell.cellProtect||cell.fieldName||cell.editableInForm))throw Error('보호·필드·양식 셀은 자동 채우기에서 보존합니다.');return{p:q,text:a.text(q),para:a.paraProps(q),cell};});
 const end=entries.findIndex(x=>x.text==='');if(end<0)return {writes:[],apply:()=>copy(s)};
 if(end<2)throw Error('처음 두 셀 이상에 같은 간격의 숫자를 넣으세요. 한 값 반복·문자 목록은 아직 지원하지 않습니다.');
 const replaces=entries.slice(end).some(x=>x.text!=='');
 const seeds=entries.slice(0,end).map(x=>{
  const pure=x.text.match(/^(-?\d+)(?:\.(\d{1,6}))?$/);
  if(pure)return{text:x.text,places:pure[2]?.length??0,prefix:'',suffix:''};
  // Exactly one unambiguous ASCII decimal. A second number, sign, period,
  // date-like spelling or padded integer needs its own confirmed policy.
  const m=x.text.match(/^([^\d+\-.]*)(-?(?:0|[1-9]\d*)(?:\.(\d{1,6}))?)([^\d+\-.]*)$/u);
  if(!m||!m[1]&&!m[4])throw Error('같은 앞뒤 문자와 숫자 한 개로 된 연속값을 넣으세요. 날짜·여러 숫자·자리 맞춤은 아직 지원하지 않습니다.');
  return{text:m[2],places:m[3]?.length??0,prefix:m[1],suffix:m[4]};
 });
 const {prefix,suffix}=seeds[0];
 if(seeds.some(x=>x.prefix!==prefix||x.suffix!==suffix))throw Error('숫자 앞뒤 문자가 모두 같아야 합니다. 사용자 목록은 아직 지원하지 않습니다.');
 if(prefix||suffix||replaces||nested(p)){
  // Do not admit newly supported literal cells by looking at their visible
  // text alone. Existing objects/fields remain outside this series scope.
  const lists=new Set(entries.map(e=>a.list(e.p).listId));
  if(a.call<any[]>('getControls').some(c=>lists.has(c.list))||entries.some(e=>e.cell.fieldName||e.cell.editableInForm))
   throw Error('개체·필드·양식이 있는 셀은 숫자 앞뒤 문자·기존 내용 대체에서 보존합니다.');
 }
 const places=Math.max(...seeds.map(x=>x.places)),scale=10n**BigInt(places),limit=BigInt(Number.MAX_SAFE_INTEGER),values=seeds.map(x=>BigInt(x.text.replace('.',''))*10n**BigInt(places-x.places));
 if(values.some(x=>x>limit||x< -limit))throw Error('정확하게 계산할 수 있는 숫자 범위를 벗어났습니다.');
 const step=values[1]-values[0];if(step>limit||step< -limit||step===0n||values.some((v,i)=>v!==values[0]+step*BigInt(i)))throw Error('일정한 간격으로 증가·감소하는 숫자를 넣으세요.');
 const writes=entries.slice(end).map((entry,i)=>{
  const v=values[0]+step*BigInt(end+i);if(v>limit||v< -limit)throw Error('결과가 정확한 숫자 범위를 벗어났습니다.');const abs=v<0n?-v:v;
  const text=prefix+(v<0n?'-':'')+String(abs/scale)+(places?'.'+String(abs%scale).padStart(places,'0'):'')+suffix;
  const originalText=entry.text,shape=originalText?a.charProps(entry.p).charShapeId:undefined;
  if(originalText!==text&&Array.from(originalText).some((_,offset)=>a.charProps({...entry.p,offset}).charShapeId!==shape))
   throw Error('서로 다른 글자 서식이 섞인 기존 셀은 숫자로 대체하지 않습니다. 문자·서식 반복을 사용하세요.');
  return{...entry,originalText,shape,text};
 }).filter(w=>w.originalText!==w.text);
 return{writes,apply:()=>{for(const w of writes){if(a.text(w.p)!==w.originalText)throw Error('채울 셀 내용이 변경되었습니다.');if(w.originalText)a.remove(w.p,{...w.p,offset:a.length(w.p)});a.insert(w.p,w.text);if(a.text(w.p)!==w.text||JSON.stringify(a.paraProps(w.p))!==JSON.stringify(w.para)||JSON.stringify(seriesCell(a,w.p))!==JSON.stringify(w.cell)||w.shape!==undefined&&Array.from(w.text).some((_,offset)=>a.charProps({...w.p,offset}).charShapeId!==w.shape))throw Error('채우기 결과 또는 비대상 서식이 달라 취소했습니다.');}return copy(s);}};
}
