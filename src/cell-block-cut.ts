import type {RhwpAdapter} from './adapter.js';
import {copy,nested,type Position,type Selection} from './model.js';
import {fragmentClipboardObjects,selectedCutObject,prepareObjectCut} from './object-clipboard.js';
import {wholeInlineCellBlock,tableCaptureRefusal,UnsupportedTableOperation} from './table-capability.js';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const key=(p:Position)=>p.kind==='cell'?JSON.stringify([p.sec,p.para,(p.ancestors??[]).map(x=>[x.controlIndex,x.cellIndex,x.cellParaIndex]),p.control,p.cell]):'';

// This capture is local to one cut request, not an OS transfer/cache or a new
// document model. Persist paragraph identities, never transient numeric list IDs.
export function captureCellBlockObjectCut(a:RhwpAdapter,s:Selection,indices:readonly number[]){
 if(s.kind!=='cells'||nested(s.focus)||indices.length<2||
    wholeInlineCellBlock(a,s,indices.map(cellIdx=>({cellIdx})))||!tableCaptureRefusal(a,s.focus))return;
 a.validate(s.anchor);a.validate(s.focus);
 if(!a.heightCandidateIdentified)throw new UnsupportedTableOperation('clipboard-mixed-host-object-cut','고정 부분 셀 fragment를 확인할 수 없어 원문을 보존합니다.');
 const all=a.cells(s.focus);if(new Set(indices).size!==indices.length||indices.some(i=>!all.some(c=>c.cellIdx===i)))throw Error('잘라낼 셀 블록이 현재 표에 없습니다.');
 const positions=indices.map(cell=>({...s.focus,cell,cellPara:0,offset:0}));
 const controls=a.call<any[]>('getControls');
 // Ordinary text-only blocks retain their existing cheap admission: do not
 // collect per-character snapshots when no object deletion will be needed.
 for(const p of positions)a.assertEditable(p);
 if(!positions.some(p=>controls.some(c=>c.list===a.list(p).listId)))return;
 const cells=positions.map(p=>{
  return{p,props:a.cellProps(p),paragraphs:Array.from({length:a.count(p)},(_,cellPara)=>{
   const q={...p,cellPara};a.assertEditable(q);
   const text=a.text(q);return{target:a.captureParagraph(q),text,props:a.paraProps(q),chars:Array.from({length:Math.max(1,[...text].length)},(_,offset)=>a.charProps({...q,offset}))};
  })};
 });
 const catalog=fragmentClipboardObjects(a),objects=[];
 for(const cell of cells){
  const list=a.list(cell.p).listId;
  for(const control of controls.filter(c=>c.list===list)){
   if(control.ctrlId!=='gso')throw new UnsupportedTableOperation('clipboard-cell-block-control-cut','선택 셀의 이 개체·필드 삭제는 아직 지원하지 않습니다. 원문을 보존합니다.');
   const row=catalog.find(r=>r.focus.kind==='cell'&&key(r.focus)===key(cell.p)&&r.focus.cellPara===control.para&&r.control===control.controlIndex);
   if(!row)throw Error('선택 셀 개체의 정확한 소유 문단을 확인할 수 없습니다.');
   if(row.locked||row.kind==='차트')throw new UnsupportedTableOperation('clipboard-cell-block-protected','선택 셀에 보호되었거나 제외된 개체가 있어 원문을 보존합니다.');
   const selection:Selection={kind:'object',focus:row.focus,control:row.control};
   const source=selectedCutObject(a,selection);if(!('target'in source))throw Error('셀 개체 삭제 대상이 본문으로 바뀌었습니다.');
   const method=source.cellPicture?'deleteCellPictureControlByPath':'deleteControlAt';
   if(typeof a.doc[method]!=='function')throw new UnsupportedTableOperation('clipboard-cell-block-delete-api','선택 셀 개체의 기존 삭제 API를 확인할 수 없습니다.');
   objects.push({selection,source});
  }
 }
 if(!objects.length)return;
 // Delete later slots first. Earlier captured owners/anchors then keep their
 // exact addresses; every object is resolved/checked again by the existing cut.
 objects.sort((a,b)=>{const x=a.selection.focus,y=b.selection.focus;return key(x).localeCompare(key(y))||('cellPara'in y?y.cellPara:0)-('cellPara'in x?x.cellPara:0)||b.selection.control-a.selection.control;});
 return{selection:copy(s),indices:[...indices],cells,objects,catalog};
}
export type CellBlockObjectCut=NonNullable<ReturnType<typeof captureCellBlockObjectCut>>;

// Called after OS write and shared doc/revision/selection validation, then run
// inside the caller's ONE existing History transaction. Any partial exception
// restores the whole source and old Redo through History, not inverse edits.
export function prepareCellBlockObjectCut(a:RhwpAdapter,s:Selection,capture:CellBlockObjectCut,indices:readonly number[]){
 for(const cell of capture.cells)for(const paragraph of cell.paragraphs)a.resolveParagraph(paragraph.target);
 const current=captureCellBlockObjectCut(a,s,indices);
 if(!current||!equal(current,capture))throw Error('클립보드 대기 중 잘라낼 셀·문단·개체가 변경되었습니다.');
 const selected=new Set(capture.objects.map(o=>{const row=o.source.cellPicture??o.source.cellShape!;return JSON.stringify([row.sec,row.para,row.path,row.control]);}));
 const expected=capture.catalog.filter(row=>!selected.has(JSON.stringify([row.sec,row.para,row.path,row.control])));
 return(clear:()=>void)=>{
  for(const object of capture.objects)prepareObjectCut(a,object.selection,object.source)();
  // Resolve each surviving cell paragraph before clearing its complete content.
  // All selected controls are already gone; text-only clear cannot leave a
  // copied floating object behind or cut it twice through a scalar range.
  for(const cell of capture.cells){a.resolveParagraph(cell.paragraphs[0].target);if(a.call<any[]>('getControls').some(c=>c.list===a.list(cell.p).listId))throw Error('선택 셀에 삭제하지 못한 개체가 있어 잘라내기를 취소합니다.');}
  clear();
  if(!equal(fragmentClipboardObjects(a),expected))throw Error('셀 블록 삭제 후 비선택 개체가 달라져 원문을 복원합니다.');
  for(const cell of capture.cells){if(a.count(cell.p)!==1||a.text(cell.p)!=='')throw Error('선택 셀 내용이 완전히 삭제되지 않았습니다.');if(!equal(a.cellProps(cell.p),cell.props))throw Error('셀 블록 삭제 중 셀 서식이 변경되었습니다.');}
  a.exportChecked();
  const focus={...capture.cells[0].p,cellPara:0,offset:0};a.validate(focus);return{kind:'caret' as const,focus};
 };
}
