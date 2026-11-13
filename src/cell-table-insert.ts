import type {RhwpAdapter} from './adapter.js';
import {result} from './adapter-core.js';
import {siblingDocument,coreRuntimeSupportsNestedTableCreation,fragmentForDocument} from './core-runtime.js';
import {MAX_CLIPBOARD_BYTES} from './clipboard.js';
import type {Position} from './model.js';

/** Existing Core constructor + immutable fragment insertion, inside ONE caller
 * History transaction. Never writes raw IR or changes the OS clipboard. */
export function insertCellTable(a:RhwpAdapter,p:Extract<Position,{kind:'cell'}>,rows:number,cols:number):Position {
 if(!coreRuntimeSupportsNestedTableCreation(a.doc))throw Error('현재 Core에서 셀 안의 표 만들기를 지원하지 않습니다.');
 a.validate(p);a.assertEditable(p);a.assertTextOnly(p);
 const props=a.call('getCellPropertiesByPath',p.sec,p.para,a.path(p),p.cell);
 let padding=props;
 if(!props.applyInnerMargin){
  if(!p.ancestors?.length)padding=a.call('getTableProperties',p.sec,p.para,p.control);
  else {
   // Existing path-aware capture exposes the parent table's exact native
   // padding through the ordinary root-table getter on a disposable fragment.
   const t=a.captureParagraph(p),table=a.call('getTableStructureByPath',p.sec,p.para,a.path(p),t.targetId).table;
   const captured=a.doc.captureNestedClipboard(p.sec,p.para,a.path(p),t.targetId,JSON.stringify({kind:'table',expectedRevision:table.revision}));
   try{const probe=siblingDocument(a.doc,captured.toFragmentBytes());try{
    const controls=result<any[]>(probe.getControls()).filter(c=>c.list===0&&c.ctrlId==='tbl');
    if(controls.length!==1)throw Error('부모 표의 안 여백을 확인할 수 없습니다.');
    padding=result(probe.getTableProperties(0,controls[0].para,controls[0].controlIndex));
   }finally{probe.free();}}finally{captured.free();}
  }
 }
 const width=props.width-padding.paddingLeft-padding.paddingRight;
 if(![props.width,padding.paddingLeft,padding.paddingRight,width].every(Number.isSafeInteger)||width<cols||rows<1||cols<1||rows>20||cols>20||rows*cols>100)throw Error('셀 안의 표 크기 또는 가용 너비를 확인하세요.');
 // Preserve the actual document's native profile and definitions. A generic
 // blank template can have a different origin; Core correctly refuses that
 // cross-profile import. This checked disposable clone is built ONLY on the
 // explicit table command; no authored content leaves the browser/clipboard.
 const source=siblingDocument(a.doc,a.exportChecked().bytes);
 try{
  const para=source.getParagraphCount(0);
  result(source.insertParagraph(0,para));
  const widths=Array.from({length:cols},(_,i)=>Math.floor(width/cols)+(i<width%cols?1:0));
  const created=result(source.createTableEx(JSON.stringify({sectionIdx:0,paraIdx:para,charOffset:0,rowCount:rows,colCount:cols,treatAsChar:true,colWidths:widths})));
  // Preserve the constructor's native outer margins and reserve their exact
  // envelope. Do not hard-code HU or alter common margins separately from the
  // legacy fields used by Core's fragment-width guard.
  const table=result(source.getTableProperties(0,created.paraIdx,created.controlIdx));
  const outer=Math.max(0,table.outerLeft+table.outerRight)+table.horzOffset;
  if(![table.outerLeft,table.outerRight,table.horzOffset,outer].every(Number.isSafeInteger)||outer<0||width-outer<cols)throw Error('새 표의 바깥 여백을 포함한 가용 너비가 부족합니다.');
  if(outer){
   const inner=width-outer,next=widths.map((_,i)=>Math.floor(inner/cols)+(i<inner%cols?1:0));
   result(source.resizeTableCells(0,created.paraIdx,created.controlIdx,JSON.stringify(Array.from({length:rows*cols},(_,cellIdx)=>({cellIdx,widthDelta:next[cellIdx%cols]-widths[cellIdx%cols],heightDelta:0})))));
   for(let cell=0;cell<rows*cols;cell++)if(result(source.getCellProperties(0,created.paraIdx,created.controlIdx,cell)).width!==next[cell%cols])throw Error('새 표의 최소 셀 너비가 현재 셀보다 큽니다.');
   if(result(source.getTableProperties(0,created.paraIdx,created.controlIdx)).tableWidth!==inner)throw Error('새 표의 외곽 너비를 확인할 수 없습니다.');
  }
  // Match StructuredClipboard's immutable wire import, including parser-owned
  // object/host reconstruction. Do not transplant constructor-only caches.
  const captured=source.captureBodyClipboard(0,created.paraIdx,0,created.paraIdx,1);
  let fragment;
  try{const bytes=captured.toFragmentBytes();if(bytes.byteLength>MAX_CLIPBOARD_BYTES)throw Error('새 표 조각의 크기 제한을 초과했습니다.');fragment=fragmentForDocument(a.doc,bytes);}
  finally{captured.free();}
  try{
   // Retain both text halves at an interior caret. Existing split and fragment
   // guards reject unsupported objects/flows and the caller rolls back atomically.
   const length=a.length(p),interior=p.offset>0&&p.offset<length;
   if(interior)a.split(p);
   const target=a.clipboardTarget(p);
   const r=JSON.parse(a.doc.pasteCapturedNested(fragment,JSON.stringify({...target,after:p.offset>0})));
   if(!r.ok)throw Error(`셀 안의 표 생성 거절: ${r.reason??r.error??'invalid-result'}`);
   if(!r.changed||r.inserted?.length!==1)throw Error('셀 안의 표 삽입 결과를 확인할 수 없습니다.');
   const host=a.clipboardInsertedPosition(r.inserted[0]),child=a.child(host);
   if(!child)throw Error('새 표의 첫 셀을 확인할 수 없습니다.');
   a.validate(child);a.exportChecked();return child;
  }finally{fragment.free();}
 }finally{source.free();}
}
