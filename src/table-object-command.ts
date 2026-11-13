import {PassiveOwnerBatchRetired} from './passive-owner-batch.js';
import type {RhwpAdapter} from './adapter.js';
import {copy,nested,samePosition,type Position,type Props,type Selection} from './model.js';
export function selectedTableObject(a:RhwpAdapter,s:Selection,transpose=false, prepareBatch?:(focus:Position)=>((page:number)=> (()=>boolean)|undefined)|undefined){
  if(s.kind!=='table'||s.focus.kind!=='cell'||nested(s.focus))throw Error('본문의 일반 표 개체 한 개를 선택하세요. 셀 블록·중첩 표는 기존 별도 명령을 사용하세요.');
  const p=s.focus;a.validate(p);a.assertEditable(p);
  let global=p.para;for(let sec=0;sec<p.sec;sec++)global+=a.doc.getParagraphCount(sec);
  const row=a.call<any[]>('getControls').find(c=>c.list===0&&c.para===global&&c.controlIndex===p.control);
  if(!row||row.ctrlId!=='tbl'||row.props?.Lock)throw Error('선택 표의 정확한 owner·보호 상태를 확인하세요.');
  const raw=a.call('getTableProperties',p.sec,p.para,p.control);
  const passiveBatchFence=prepareBatch?.(p);
  const cells=a.cells(p);
  if(!cells.length)throw Error('표의 셀 범위를 조회할 수 없습니다.');
  let batched=false;
  if(passiveBatchFence && cells.length>=2 && cells.length<=12){
    // Read the grid first: it may have populated the exact legacy raw hit.
    const read=a.tablePreviewFence(),focus={...p};
    const current=passiveBatchFence(cells[0].pageIndex);
    if(current){
      if(!read() || s.focus!==p || !samePosition(focus,p))throw new PassiveOwnerBatchRetired();
      a.checkPassiveTableCells(p,cells,()=>read()&&current());batched=true;
    }
  }
  if(!batched)for(const c of cells)a.assertEditable({...p,cell:c.cellIdx,cellPara:0,offset:0});
  if(transpose){
    if(row.props?.SizeProtect||raw.sizeProtect)throw Error('크기가 고정된 표는 전치하지 않습니다.');
    if(cells.some(c=>c.rowSpan!==1||c.colSpan!==1))throw Error('줄/칸 전치는 병합 없는 일반 표에서 지원합니다. 기존 표를 유지합니다.');
  }
  return {p,raw,cells,row};
}
const sides=['Left','Right','Top','Bottom'] as const;
export function tableObjectDelta(props:Props){
  if(Object.keys(props).some(k=>k!=='background'&&!/^border(Left|Right|Top|Bottom)\.(type|width|color)$/.test(k)))throw Error('표 개체의 방향별 테두리·단색 배경만 지원합니다.');
  const patch:Record<string,unknown>={};
  if('background'in props){const v=props.background;if(v!=='none'&&(typeof v!=='string'||!/^#[\da-f]{6}$/i.test(v)))throw Error('배경색은 #RRGGBB 또는 없음으로 지정하세요.');patch.fillType=v==='none'?'none':'solid';if(v!=='none'){patch.fillColor=v;patch.patternType=0;patch.patternColor='#000000';}}
  for(const side of sides){const keys=['type','width','color'].map(k=>`border${side}.${k}`);if(!keys.some(k=>k in props))continue;
    const [type,width,color]=keys.map(k=>props[k]);
    if(!Number.isSafeInteger(type)||Number(type)<0||Number(type)>3||!Number.isSafeInteger(width)||Number(width)<0||Number(width)>15||typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color))throw Error('변경할 방향의 선 종류·굵기·색을 모두 명시하세요. 다른 방향·셀별 원값은 유지됩니다.');
    patch['border'+side]={type,width,color};
  }return patch;
}
export function prepareTableObject(a:RhwpAdapter,s:Selection,action:'transpose'|'format',props:Props={}){
  const {p,cells,raw,row}=selectedTableObject(a,s,action==='transpose'),patch=action==='format'?tableObjectDelta(props):undefined;
  if(patch&&!Object.keys(patch).length)return;
  // The existing setter rebinds table.common.attr from table.attr even for a
  // fill-only request. Round-trip the exact already-queried wrap value so that
  // its common-control metadata cannot silently fall back to Square in hot UI.
  // Unknown/collapsed wrap variants are refused, never guessed.
  const controls=action==='format'?a.call('getControls'):undefined;
  if(patch){const wrap=['Square','TopAndBottom','BehindText','InFrontOfText'][row.props.TextWrap];if(!wrap||wrap!==raw.textWrap)throw Error('표 배치의 두 기존 조회가 일치하지 않아 원본을 유지합니다.');patch.textWrap=wrap;}
  const before=cells.map(c=>({c,props:a.cellProps({...p,cell:c.cellIdx}),text:Array.from({length:a.count({...p,cell:c.cellIdx})},(_,cellPara)=>a.text({...p,cell:c.cellIdx,cellPara,offset:0}))}));
  return ()=>{
    selectedTableObject(a,s,action==='transpose');
    if(action==='transpose')a.call('transposeTableCellsInPlace',p.sec,p.para,p.control);
    else a.call('setTableProperties',p.sec,p.para,p.control,JSON.stringify(patch));
    const after=a.cells(p);if(after.length!==cells.length)throw Error('표 변경 후 셀 개수가 다릅니다. 변경을 취소합니다.');
    for(const old of before){const c=after.find(c=>action==='transpose'?c.row===old.c.col&&c.col===old.c.row:c.cellIdx===old.c.cellIdx);if(!c)throw Error('변경한 셀의 정확한 주소를 확인할 수 없습니다.');
      const now=a.cellProps({...p,cell:c.cellIdx}),expected={...old.props};
      if(action==='transpose'){delete expected.width;delete expected.height;delete now.width;delete now.height;}
      else{delete expected.borderFillId;delete now.borderFillId;for(const [k,v]of Object.entries(patch!))if(k!=='textWrap')expected[k]=v;if(patch!.fillType==='none')Object.assign(expected,{fillColor:'#ffffff',patternColor:'#000000',patternType:0});}
      if(JSON.stringify(now)!==JSON.stringify(expected))throw Error('표 변경 결과가 요청한 속성 또는 비대상 속성과 다릅니다. 변경을 취소합니다.');
      const text=Array.from({length:a.count({...p,cell:c.cellIdx})},(_,cellPara)=>a.text({...p,cell:c.cellIdx,cellPara,offset:0}));if(JSON.stringify(text)!==JSON.stringify(old.text))throw Error('표 변경 중 셀 내용이 달라졌습니다. 변경을 취소합니다.');
    }
    if(controls&&JSON.stringify(a.call('getControls'))!==JSON.stringify(controls))throw Error('서식 변경 중 개체 배치·보호·비대상 메타데이터가 달라져 취소합니다.');
    const next=copy(s);if(next.focus.kind!=='cell')throw Error('표 선택이 만료되었습니다.');
    if(action==='transpose'){const old=cells.find(c=>c.cellIdx===p.cell)!,moved=after.find(c=>c.row===old.col&&c.col===old.row)!;next.focus.cell=moved.cellIdx;}
    a.validate(next.focus);return next;
  };
}
