import type {RhwpAdapter} from './adapter.js';
import {cellPath,type Position} from './model.js';

export class UnsupportedTableOperation extends Error {
 constructor(readonly code:string,message:string){super(message);this.name='UnsupportedTableOperation';}
}
export function tableCaptureRefusal(a:RhwpAdapter,p:Position,kind:'cells'|'table'='table'){
 if(p.kind!=='cell')return;
 const path=cellPath(p),last=path[path.length-1],parent=path.length>1?a.fromPath(p.sec,p.para,path.slice(0,-1),0):{kind:'body' as const,sec:p.sec,para:p.para,offset:0};
 const list=parent.kind==='cell'?a.list(parent).listId:0;
 const para=parent.kind==='cell'?parent.cellPara:Array.from({length:p.sec},(_,sec)=>a.doc.getParagraphCount(sec)).reduce((n,c)=>n+c,0)+p.para;
 const controls=a.call<any[]>('getControls').filter(c=>c.list===list&&c.para===para);
 // Only the fixed immutable Cells capture can detach its exact table owner.
 // Whole-table mixed-host capture retains its existing separate policy. Native
 // revision, span and resource checks still decide whether a fragment is safe.
 if(kind==='cells'&&a.heightCandidateIdentified&&controls.some(c=>c.controlIndex===last.controlIndex&&c.ctrlId==='tbl'))return;
 if(a.text(parent)!==''||controls.length!==1||last.controlIndex!==0)
  return new UnsupportedTableOperation('clipboard-cohabiting-table-host','글자·다른 개체와 같은 문단에 있는 표의 부분 셀 복사는 아직 지원하지 않습니다.');
}
export function wholeInlineCellBlock(a:RhwpAdapter,s:import('./model.js').Selection,cells:readonly {cellIdx:number}[]){
 if(s.kind!=='cells'||s.focus.kind!=='cell'||s.focus.ancestors?.length||!cells.length)return;
 const all=new Set(a.cells(s.focus).map(c=>c.cellIdx));
 if(all.size!==cells.length||cells.some(c=>!all.has(c.cellIdx)))return;
 return a.inline(s.focus).find(t=>t.controlIndex===s.focus.control);
}
// Only explicit capability refusals reach this path. RPC/save/validation errors
// keep the ordinary error UI; no string-wide exception filter is used.
export function recordTableRefusal(doc:Document,error:UnsupportedTableOperation,selection:unknown){
 const detail={code:error.code,reason:error.message,selection};
 console.debug('rhwp:table-capability',detail);
 doc.dispatchEvent(new CustomEvent('rhwp:table-capability',{detail}));
}

/** Only explicit table operation refusals use this notice; other errors
 * keep their normal error/report path. No extra reads of the document. */
export function tableOperationNotice(error:unknown) {
 if(!(error instanceof UnsupportedTableOperation))return;
 switch(error.code){
  case 'resize-drag-stale':return '표나 화면이 바뀌었습니다. 다시 끌어 주세요.';
  case 'resize-frame-rollback':return '다른 행도 함께 바뀔 수 있어 표의 크기를 그대로 두었습니다.';
  case 'resize-parent-bound':return '표가 문서 여백을 넘도록 늘릴 수 없습니다.';
  case 'resize-track-exceedsFrame':
  case 'resize-track-clippedBefore':return '표가 현재 쪽이나 상위 셀의 가용 범위를 벗어나 크기를 바꾸지 않았습니다.';
  case 'resize-track-contentWidthFloor':
  case 'resize-track-contentHeightFloor':return '셀 내용을 유지하려면 더 줄일 수 없습니다.';
  case 'resize-track-staleTarget':
  case 'resize-track-stalePlan':
  case 'resize-track-unsettledLayout':return '표나 화면이 바뀌었습니다. 다시 조절해 주세요.';
  case 'resize-track-protectedDocument':
  case 'resize-track-protectedTarget':
  case 'resize-track-protectedAffectedCell':return '보호된 문서나 셀에 영향을 주는 크기 변경은 할 수 없습니다.';
  case 'resize-whole-width-min':return '내용이 잘리지 않도록 더 줄일 수 없습니다.';
  case 'table-structure-unsupported':return '선택한 셀은 이 방법으로 변경할 수 없습니다.';
  default:
   if(error.code.startsWith('resize-')||error.code.startsWith('local-'))
    return '선택한 셀의 크기를 이 방법으로 조절할 수 없습니다.';
 }
}
