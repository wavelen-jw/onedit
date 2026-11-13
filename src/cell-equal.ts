import type {RhwpAdapter} from './adapter.js';
import {copy,nested,type Selection} from './model.js';
// Same integer conservation rule already used by Core's distribute_hwp_units:
// quotient plus one HU for the first remainder slots, in grid order.
export function prepareEqualCells(a:RhwpAdapter,s:Selection,axis:'width'|'height'){
  if(s.kind!=='cells'||s.focus.kind!=='cell'||nested(s.focus))throw Error('일반 셀 블록에서 전체 줄/칸을 선택하세요.');
  const p=s.focus;a.validate(p);a.assertEditable(p);const all=a.cells(p);
  if(!all.length||new Set(all.map(c=>c.pageIndex)).size!==1||new Set(all.map(c=>c.cellIdx)).size!==all.length||all.some(c=>c.rowSpan!==1||c.colSpan!==1))throw Error('분할·반복·병합 없는 한 쪽의 일반 표에서만 크기를 같게 합니다.');
  const anchor=all.find(c=>c.cellIdx===s.anchor.cell),focus=all.find(c=>c.cellIdx===s.focus.cell);if(!anchor||!focus)throw Error('셀 블록 끝점이 없습니다.');
  const selected=all.filter(c=>c.row>=Math.min(anchor.row,focus.row)&&c.row<=Math.max(anchor.row,focus.row)&&c.col>=Math.min(anchor.col,focus.col)&&c.col<=Math.max(anchor.col,focus.col));
  const groups=[...new Set(selected.map(c=>axis==='width'?c.col:c.row))].sort((a,b)=>a-b);if(groups.length<2)return;
  const others=new Set(all.map(c=>axis==='width'?c.row:c.col));if(selected.length!==groups.length*others.size)throw Error('너비는 칸 전체, 높이는 줄 전체를 선택하세요. 부분 줄/칸의 공유 경계는 유지합니다.');
  const before=new Map(all.map(c=>[c.cellIdx,a.cellProps({...p,cell:c.cellIdx})]));
  for(const props of before.values())if(props.cellProtect)throw Error('보호된 셀은 변경하지 않습니다.');
  const values=groups.map(g=>{const group=selected.filter(c=>(axis==='width'?c.col:c.row)===g),v=before.get(group[0].cellIdx)![axis];if(!Number.isSafeInteger(v)||Number(v)<200||group.some(c=>before.get(c.cellIdx)![axis]!==v))throw Error('공유 경계의 정확한 원래 치수를 조회할 수 없습니다.');return Number(v);});
  const total=values.reduce((a,b)=>a+b,0),base=Math.floor(total/groups.length),rest=total%groups.length;if(base<200)throw Error('최소 셀 크기를 유지할 수 없습니다.');
  const targets=new Map(groups.map((g,i)=>[g,base+(i<rest?1:0)]));
  const updates=selected.map(c=>({cellIdx:c.cellIdx,[axis==='width'?'widthDelta':'heightDelta']:targets.get(axis==='width'?c.col:c.row)!-Number(before.get(c.cellIdx)![axis]),localResize:true})).filter(u=>u[axis==='width'?'widthDelta':'heightDelta']!==0);
  if(!updates.length)return;
  return ()=>{a.call('resizeTableCells',p.sec,p.para,p.control,JSON.stringify(updates));
    for(const c of all){const expected={...before.get(c.cellIdx)!};if(selected.some(t=>t.cellIdx===c.cellIdx))expected[axis]=targets.get(axis==='width'?c.col:c.row)!;if(JSON.stringify(a.cellProps({...p,cell:c.cellIdx}))!==JSON.stringify(expected))throw Error('셀 치수 또는 비대상 속성이 요청과 다릅니다.');}
    const after=a.cells(p);if(after.length!==all.length)throw Error('크기 변경 후 정확한 표 배치를 확인할 수 없습니다.');
    // A content floor that prevents equal visible heights is a refusal, not a
    // silent stored-only success or a relaxed layout preservation assertion.
    for(const g of groups){const boxes=after.filter(c=>(axis==='width'?c.col:c.row)===g);const visible=axis==='width'?boxes[0]?.w:boxes[0]?.h;const expected=targets.get(g)!*96/7200;
      if(!Number.isFinite(visible)||Math.round(visible!*10)!==Math.round(expected*10)||boxes.some(c=>Math.round((axis==='width'?c.w:c.h)*10)!==Math.round(visible!*10)))throw Error('내용 하한 또는 배치 제한으로 화면 크기를 같게 할 수 없습니다. 변경을 취소했습니다.');}
    return copy(s);
  };
}
