import {UnsupportedTableOperation} from './table-capability.js';
import { lowerPairGrid } from './table-boundary-grid.js';
import type { Interaction } from './interaction.js';
import type { CellBox, Position, Selection } from './model.js';
import { sameFormatTarget } from './integration/a-format-input-guard.js';
import {coreRuntimeTableTrackDragEpoch} from './core-runtime.js';
import { pickNativeTrackEdge,type NativeResizeEdge } from './table-track-resize.js';
type Cell = Extract<Position,{kind:'cell'}>;
type Edge = {p:Cell;axis:'x'|'y';line:number;start:number;end:number;cells:CellBox[];adjacent:CellBox[];selection:Selection;nativeEdge?:NativeResizeEdge};
// Read only Core-serialized data. No input XML mutation or inferred noAdjust default.
async function sectionXml(bytes:Uint8Array,sec:number):Promise<Document>{
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),name=`Contents/section${sec}.xml`;
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('표 제한을 확인할 수 없습니다.');
  let pos=v.getUint32(end+16,true),found:Uint8Array|undefined;
  for(let i=0;i<v.getUint16(end+10,true);i++){
    if(v.getUint32(pos,true)!==0x02014b50)throw Error('표 제한 ZIP 확인 실패');
    const n=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true);
    if(new TextDecoder().decode(bytes.subarray(pos+46,pos+46+n))===name){
      if(found)throw Error('중복 구역 경로');
      const size=v.getUint32(pos+24,true),packed=v.getUint32(pos+20,true),local=v.getUint32(pos+42,true),method=v.getUint16(pos+10,true);
      if(size>16*1024*1024||v.getUint32(local,true)!==0x04034b50)throw Error('표 제한 조회 크기/구조 미지원');
      const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
      if(start+packed>bytes.length)throw Error('표 제한 조회 범위 오류');
      const data=bytes.slice(start,start+packed);
      if(method===0)found=data;
      else if(method===8){const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const parts:Uint8Array[]=[];let length=0;
        while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>size){await reader.cancel();throw Error('구역 크기 불일치');}parts.push(r.value);}
        found=new Uint8Array(length);let offset=0;for(const part of parts){found.set(part,offset);offset+=part.length;}
      }else throw Error('표 제한 압축 형식 미지원');
      if(found.length!==size)throw Error('구역 크기 불일치');
    }pos+=46+n+extra+comment;
  }
  if(!found)throw Error('대상 구역 없음');const xml=new DOMParser().parseFromString(new TextDecoder().decode(found),'application/xml');
  if(xml.querySelector('parsererror'))throw Error('구역 XML 오류');return xml;
}
export async function assertBoundaryTable(editor:Interaction,p:Cell){
  const a=editor.adapter,target=editor.capture(),inline=a.inline({kind:'body',sec:p.sec,para:p.para,offset:0});
  const native=a.doc,generation=editor.currentSelectionGeneration;
  let epoch=a.nativeMutationGeneration();
  const current=()=>editor.adapter===a&&a.doc===native&&editor.currentSelectionGeneration===generation&&
    a.nativeMutationGeneration()===epoch&&sameFormatTarget(target,editor.capture());
  const requireCurrent=()=>{if(!current())throw new UnsupportedTableOperation(
    'resize-drag-stale','표 제한 조회 중 문서·선택이 변경되어 경계 조절을 취소했습니다.');};
  // Only a sole root inline table is unambiguous without extending control identity.
  if(p.ancestors?.length||inline.length!==1||inline[0].controlIndex!==p.control)throw new UnsupportedTableOperation('resize-source-limit','중첩·복수 개체 표의 경계 조절은 미지원입니다.');
  const tablesIn=(xml:Document,para:number)=>{
    const paragraph=Array.from(xml.documentElement.children).filter(e=>e.localName==='p')[para];
    return Array.from(paragraph?.getElementsByTagNameNS('*','tbl')??[]);
  };
  let flag:string|null= null;
  try{
    // Do not omit a sibling object's nested table from the original sole-table
    // guard. Only a single root control qualifies for the smaller projection.
    let para=p.para;for(let sec=0;sec<p.sec;sec++)para+=a.doc.getParagraphCount(sec);
    const controls=a.call<any[]>('getControls').filter(c=>c.list===0&&c.para===para);
    if(controls.length!==1||controls[0].ctrlId!=='tbl'||controls[0].controlIndex!==p.control)throw Error('단일 본문 표 원문 제한 조회 미지원');
    // Existing immutable selected-IR capture preserves the table's attr/raw
    // restriction bits; its serializer validates references, content loss and
    // size. It restores Core's previous clipboard and never writes the OS one.
    // Query this one table, not a save/reopen of every unrelated page/resource.
    const slot=inline[0].offset;
    if(!Number.isSafeInteger(slot)||slot<0)throw Error('표 원문 위치 미확인');
    let bytes:Uint8Array;
    try{
      const fragment=a.doc.captureBodyClipboard(p.sec,p.para,slot,p.para,slot+1);
      try{bytes=fragment.toFragmentBytes();}finally{fragment.free();}
    }finally{
      // This audited source query advances the conservative dispatch counter
      // synchronously; any later advance across decompression is still stale.
      epoch=a.nativeMutationGeneration();
    }
    const xml=await sectionXml(bytes,0),paragraphs=Array.from(xml.documentElement.children).filter(e=>e.localName==='p'),tables=tablesIn(xml,0);
    if(paragraphs.length!==1||tables.length!==1)throw Error('단일 표 제한 조회 미지원');
    flag=tables[0].getAttribute('noAdjust');
    if(flag!=='0'&&flag!=='1')throw Error('표 제한 미확인');
  }catch{
    // Unsupported capture/serialization retains the original checked whole
    // source path, including its errors. Never infer permission from failure.
    requireCurrent();
    let bytes:Uint8Array;
    try{bytes=a.exportChecked().bytes;}finally{epoch=a.nativeMutationGeneration();}
    const tables=tablesIn(await sectionXml(bytes,p.sec),p.para);
    if(tables.length!==1)throw new UnsupportedTableOperation('resize-source-limit','중첩·복수 개체 표의 경계 조절은 미지원입니다.');
    flag=tables[0].getAttribute('noAdjust');
  }
  requireCurrent();
  if(flag!=='0')throw new UnsupportedTableOperation('resize-source-limit','크기 고정(noAdjust) 또는 제한 미확인 표입니다.');
  return epoch;
}
export function boundaryAt(editor:Interaction,page:number,x:number,y:number,tolerance:number):Edge|undefined{
  const p=editor.selection.focus;if(p.kind!=='cell')return;
  const native=pickNativeTrackEdge(editor.adapter,p,page,x,y,tolerance);
  if(native)return {p,axis:native.edge.axis==='column'?'x':'y',line:native.line,start:native.start,end:native.end,
    cells:[native.cell],adjacent:[],selection:editor.selection,nativeEdge:native.edge};
  if(p.ancestors?.length)return;
  const all=editor.adapter.cells(p),cells=all.filter(c=>c.pageIndex===page);
  // Split/repeated cells and partial spans are not ordinary boundaries.
  if(!cells.length||cells.length!==all.length||new Set(cells.map(c=>c.cellIdx)).size!==cells.length||(cells.some(c=>c.rowSpan!==1||c.colSpan!==1)&&!lowerPairGrid(cells)))return;
  const hits:Edge[]=[];
  for(const axis of ['x','y'] as const){const partial=lowerPairGrid(cells);if(partial&&axis==='y')continue;const index=axis==='x'?'col':'row';
    for(const n of new Set(cells.map(c=>c[index]))){if(partial&&n!==0)continue;const selected=cells.filter(c=>c[index]===n&&(!partial||c.row===1)).sort((a,b)=>axis==='x'?a.row-b.row:a.col-b.col);
      const lines=selected.map(c=>axis==='x'?c.x+c.w:c.y+c.h);if(lines.some(l=>Math.abs(l-lines[0])>.1))continue;
      const start=Math.min(...selected.map(c=>axis==='x'?c.y:c.x)),end=Math.max(...selected.map(c=>axis==='x'?c.y+c.h:c.x+c.w));
      const perpendicular=axis==='x'?y:x;if(Math.abs((axis==='x'?x:y)-lines[0])>tolerance||perpendicular<start+tolerance||perpendicular>end-tolerance)continue;
      // A crossing (including a T junction at the outside edge) is not a
      // one-axis resize target. Leave it to the existing text/cell selection.
      if(cells.some(c=>axis==='x'
        ? lines[0]>=c.x-tolerance&&lines[0]<=c.x+c.w+tolerance&&(Math.abs(y-c.y)<=tolerance||Math.abs(y-c.y-c.h)<=tolerance)
        : lines[0]>=c.y-tolerance&&lines[0]<=c.y+c.h+tolerance&&(Math.abs(x-c.x)<=tolerance||Math.abs(x-c.x-c.w)<=tolerance)))continue;
      const point=(c:CellBox):Cell=>({...p,cell:c.cellIdx,cellPara:0,offset:0});
      hits.push({p,axis,line:lines[0],start,end,cells:selected,adjacent:cells.filter(c=>c[index]===n+1&&(!partial||c.row===1)),selection:{kind:'cells',anchor:point(selected[0]),focus:point(selected.at(-1)!),phase:2}});
    }
  }return hits.length===1?hits[0]:undefined;
}
export function boundaryBlockReason(editor:Interaction,page:number,x:number,y:number,tolerance:number):string {
  const p=editor.selection.focus;if(p.kind!=='cell')return '';
  const cells=editor.adapter.cells(p),near=cells.some(c=>c.pageIndex===page&&x>=c.x-tolerance&&x<=c.x+c.w+tolerance&&y>=c.y-tolerance&&y<=c.y+c.h+tolerance&&(Math.min(Math.abs(x-c.x),Math.abs(x-c.x-c.w),Math.abs(y-c.y),Math.abs(y-c.y-c.h))<=tolerance));
  if(!near)return '';
  if(p.ancestors?.length)return '중첩 표 경계 조절은 미지원입니다.';
  if(cells.some(c=>c.rowSpan!==1||c.colSpan!==1)&&!boundaryAt(editor,page,x,y,tolerance))return '병합·부분 span 경계 조절은 검증 전 보류합니다.';
  if(cells.some(c=>c.pageIndex!==page)||new Set(cells.map(c=>c.cellIdx)).size!==cells.length)return '쪽에 나뉜 표 경계 조절은 미지원입니다.';
  // Editability belongs to each actual cell, not to the focused cell's text
  // paragraph/offset (which may not exist in a shorter neighboring cell).
  try{for(const c of cells)editor.adapter.assertEditable({...p,cell:c.cellIdx,cellPara:0,offset:0});}catch(error){return String(error);}
  if(!boundaryAt(editor,page,x,y,tolerance))return '왼쪽·위 외곽선 및 교차점 조절은 미지원입니다. 오른쪽·아래 경계선을 사용하세요.';
  return '';
}
export function mountTableBoundary(pages:HTMLElement,editor:Interaction,actions:{busy:()=>boolean;changed:()=>void;focus:()=>void;error:(e:unknown)=>void}){
  type Drag={id:number;page:HTMLElement;edge:Edge;target:ReturnType<Interaction['capture']>;
    start:{x:number;y:number};delta:number;released?:boolean;preview:HTMLElement;scale:number;units:number;
    adapter:Interaction['adapter'];native:Interaction['adapter']['doc'];selectionGeneration:number;
    mutationEpoch:ReturnType<Interaction['adapter']['nativeMutationGeneration']>};
  let drag:Drag|undefined,hover:HTMLElement|undefined;
  const unhover=()=>{if(hover){hover.style.removeProperty('cursor');hover.removeAttribute('title');hover=undefined;}};
  const stop=()=>{const d=drag;drag=undefined;d?.preview.remove();unhover();};
  const frame=(page:HTMLElement)=>{
    const rect=page.getBoundingClientRect(),scale=rect.width/parseFloat(page.style.width);
    if(!Number.isFinite(scale)||scale<=0)return;
    return {scale,point:(e:PointerEvent)=>({x:(e.clientX-rect.left)/scale,y:(e.clientY-rect.top)/scale})};
  };
  const units=()=>7200/editor.adapter.doc.getDpi();
  const cancelled=()=>new UnsupportedTableOperation('resize-drag-stale','표나 화면이 바뀌었습니다. 다시 끌어 주세요.');
  const refuseDrag=(d:Drag,stage:'move'|'release',reason:string,observed?:unknown):never=>{
    if(d.edge.nativeEdge){
      const detail={status:'refused',stage,reason,edge:structuredClone(d.edge.nativeEdge),observed};
      queueMicrotask(()=>pages.ownerDocument.dispatchEvent(new CustomEvent('rhwp:table-track-drag',{detail})));
    }
    throw cancelled();
  };
  const valid=(d:Drag,stage:'move'|'release')=>{
    const a=editor.adapter;
    if(actions.busy())refuseDrag(d,stage,'busy');
    if(!pages.contains(d.page))refuseDrag(d,stage,'unmountedPage');
    if(a!==d.adapter||a.doc!==d.native)refuseDrag(d,stage,'differentDocument');
    if(editor.currentSelectionGeneration!==d.selectionGeneration)refuseDrag(d,stage,'selectionGeneration',
      {from:d.selectionGeneration,to:editor.currentSelectionGeneration});
    const epoch=d.edge.nativeEdge?coreRuntimeTableTrackDragEpoch(a.doc):a.nativeMutationGeneration();
    if(epoch!==d.mutationEpoch||d.edge.nativeEdge&&epoch===undefined)refuseDrag(d,stage,'nativeDispatch',
      {from:d.mutationEpoch,to:epoch});
    if(!sameFormatTarget(d.target,editor.capture()))refuseDrag(d,stage,'targetChanged');
    const current=frame(d.page);
    if(!current||current.scale!==d.scale||d.units!==units())return refuseDrag(d,stage,'frameChanged');
    return current;
  };
  const hit=(e:PointerEvent)=>{
    const page=e.target instanceof Element?e.target.closest<HTMLElement>('.page'):null;
    if(!page||!pages.contains(page)||actions.busy())return;
    const current=frame(page);if(!current)return;
    const pos=current.point(e),scale=current.scale,pageIndex=Number(page.dataset.page);
    const edge=boundaryAt(editor,pageIndex,pos.x,pos.y,3/scale);
    // Unsupported geometry is not a resize affordance or a failed command.
    if(!edge)return;
    let reason='';
    if(edge.nativeEdge){
      try{editor.adapter.assertEditable(edge.nativeEdge.owner);}catch(error){reason=String(error);}
    }else reason=boundaryBlockReason(editor,pageIndex,pos.x,pos.y,3/scale);
    return {page,pos,edge,scale,reason};
  };
  const outside=(e:PointerEvent)=>{
    const r=(pages.closest('#viewport')??pages).getBoundingClientRect();
    return e.clientX<r.left||e.clientX>=r.right||e.clientY<r.top||e.clientY>=r.bottom;
  };
  const command=(d:Drag)=>({type:'resize' as const,width:d.edge.axis==='x'?d.delta:0,height:d.edge.axis==='y'?d.delta:0,
    ...(d.edge.nativeEdge?{nativeEdge:d.edge.nativeEdge}:d.edge.adjacent.length?{redistribute:d.edge.axis}:{})});
  const move=(d:Drag,e:PointerEvent,stage:'move'|'release'='move')=>{
    const p=valid(d,stage).point(e),axis=d.edge.axis;
    // The current page origin already includes scroll. Convert client CSS px
    // to page px, then to HU once using the actual Core DPI (not browser DPR).
    const delta=Math.round((p[axis]-d.start[axis])*d.units);
    if(!Number.isSafeInteger(delta)||Math.abs(delta)>2147483647)throw cancelled();
    d.delta=delta;
    d.preview.style[axis==='x'?'left':'top']=d.edge.line+delta/d.units+'px';
  };
  window.addEventListener('pointermove',e=>{
    if(!drag){
      unhover();if(e.buttons)return;const h=hit(e);
      if(h){hover=h.page;hover.style.cursor=h.reason?'not-allowed':h.edge.axis==='x'?'col-resize':'row-resize';hover.title=h.reason?'이 표의 경계는 끌어서 조절할 수 없습니다.':'선택한 표의 열 너비·행 높이 조절 · Esc 취소';}
      return;
    }
    const d=drag;if(e.pointerId!==d.id||d.released)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(outside(e)){stop();return;}
    try{move(d,e);}catch(error){stop();actions.error(error);}
  },true);
  window.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||drag)return;const h=hit(e);if(!h)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(h.reason){actions.error(new UnsupportedTableOperation('resize-drag-edge',h.reason));return;}
    try{
      const scaleUnits=units();if(!Number.isFinite(scaleUnits)||scaleUnits<=0)throw cancelled();
      for(const c of h.edge.nativeEdge?[]:[...h.edge.cells,...h.edge.adjacent]){
        const p={...h.edge.p,cell:c.cellIdx,cellPara:0,offset:0};editor.adapter.assertEditable(p);
        if(editor.adapter.call('getCellTextDirection',p.sec,p.para,p.control,p.cell)!==0)
          throw new UnsupportedTableOperation('resize-drag-vertical-text','세로쓰기 경계 조절 미지원');
      }
      const target=editor.capture(),preview=document.createElement('div'),{axis,line,start,end}=h.edge;
      preview.className='table-boundary-preview';
      Object.assign(preview.style,{position:'absolute',pointerEvents:'none',background:'#0067b1',zIndex:'5',
        left:(axis==='x'?line:start)+'px',top:(axis==='x'?start:line)+'px',
        width:(axis==='x'?1:end-start)+'px',height:(axis==='y'?1:end-start)+'px'});
      h.page.append(preview);
      const adapter=editor.adapter;
      const epoch=h.edge.nativeEdge?coreRuntimeTableTrackDragEpoch(adapter.doc):adapter.nativeMutationGeneration();
      if(h.edge.nativeEdge && epoch===undefined){preview.remove();throw cancelled();}
      drag={id:e.pointerId,page:h.page,edge:h.edge,target,start:h.pos,delta:0,preview,scale:h.scale,units:scaleUnits,
        adapter,native:adapter.doc,selectionGeneration:editor.currentSelectionGeneration,
        mutationEpoch:epoch};
    }catch(error){stop();actions.error(error);}
  },true);
  window.addEventListener('pointerup',async e=>{
    const d=drag;if(!d||e.pointerId!==d.id||d.released)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(outside(e)){stop();return;}
    try{
      // Use the actual release point, even if no final pointermove arrived.
      move(d,e,'release');
      if(d.delta===0){stop();return;}
      d.released=true;
      // Only the separately pinned Core contract validates this native path.
      // The legacy path always retains its original noAdjust/nested checks.
      if(!d.edge.nativeEdge)d.mutationEpoch=await assertBoundaryTable(editor,d.edge.p);
      if(drag!==d)return;
      valid(d,'release');
      const current=boundaryAt(editor,Number(d.page.dataset.page),d.start.x,d.start.y,3/d.scale);
      // Layout can change without a revision bump during the source query.
      if(!current||JSON.stringify(current)!==JSON.stringify(d.edge))refuseDrag(d,'release','edgeChanged');
      editor.execute(command(d),{documentId:d.target.documentId,revision:d.target.revision,selection:d.edge.selection,resizeSelectionBefore:d.target.selection});
      if(editor.adapter.revision===d.target.revision)editor.selection=d.target.selection;
      stop();if(editor.adapter.documentId!==d.target.documentId||editor.adapter.revision!==d.target.revision){actions.changed();actions.focus();}
    }catch(error){if(drag===d){stop();actions.error(error);}}
  },true);
  window.addEventListener('keydown',e=>{if(!drag)return;e.preventDefault();e.stopImmediatePropagation();stop();},true);
  window.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)stop();},true);
  window.addEventListener('blur',()=>{if(drag)stop();});
  document.addEventListener('pointerout',e=>{if(!e.relatedTarget){if(drag)stop();else unhover();}},true);
}
