import { rootEditorCoreSha256 } from "./root-editor-core-binding.js";
import type {RhwpAdapter} from './adapter.js';
import {coreRuntimeIdentity,tableTrackResizeOptIn} from './core-runtime.js';
import {cellPath, sameTable,type CellBox,type Position,type Selection} from './model.js';
import {UnsupportedTableOperation} from './table-capability.js';

type Cell=Extract<Position,{kind:'cell'}>;
type Axis='column'|'row';
export type NativeResizeEdge=Readonly<{owner:Cell;page:number;axis:Axis;boundary:number;
  intent:'internalBoundary'|'outerBoundary'}>;
type TrackIntent={intent:'selectedTracks';tracks:{track:number;delta:number}[]}|
  {intent:'internalBoundary'|'outerBoundary';boundary:number;delta:number}|
  {intent:'selectionRange';rangeEnd:{path:ReturnType<typeof cellPath>;targetId:string};delta:number}|
  {intent:'fitSelectedRows';rangeEnd:{path:ReturnType<typeof cellPath>;targetId:string}};
type Request=Readonly<{section:number;root:number;path:ReturnType<typeof cellPath>;targetId:string;
  page:number;axis:Axis}&TrackIntent>;
type Outcome={status:'unchanged'}|{status:'refused';reason:string}|
  {status:'planned'|'applied';plan:Record<string,unknown>};
type CorePort={oneditResizeTableTracksV1:(request:string)=>string};
// The exact matched Core and approved web test host or local QA opt-in are required.
const resizeTrackCoreDigest=rootEditorCoreSha256;
const cellAxis=(c:CellBox,axis:Axis)=>axis==='column'?[c.col,c.colSpan]:[c.row,c.rowSpan];
const refusal=(reason:string)=>new UnsupportedTableOperation('resize-track-'+reason,
  '선택한 표의 크기를 변경하지 않았습니다. ('+reason+')');
function port(a:RhwpAdapter):CorePort|undefined {
  if(!resizeTrackCoreDigest||coreRuntimeIdentity(a.doc)?.sha256!==resizeTrackCoreDigest||!tableTrackResizeOptIn())return;
  const d=a.doc as unknown as Partial<CorePort>;
  if(typeof d.oneditResizeTableTracksV1==='function')return d as CorePort;
}
export const hasNativeTrackResize=(a:RhwpAdapter)=>!!port(a);

// Layout evidence from the selected root table, never a global page count.
export function hasSplitTableFrames(owner:Cell,grid:readonly CellBox[]){
  if(owner.ancestors?.length||!grid.some(c=>c.cellIdx===owner.cell))return false;
  const pages=new Set<number>(), seen=new Set<string>();
  for(const c of grid){
    if(!Number.isSafeInteger(c.pageIndex)||c.pageIndex<0||!Number.isSafeInteger(c.cellIdx)||c.cellIdx<0||
      ![c.x,c.y,c.w,c.h].every(Number.isFinite)||c.w<=0||c.h<=0)return false;
    const key=`${c.pageIndex}:${c.cellIdx}`;
    if(seen.has(key))return false;
    seen.add(key);pages.add(c.pageIndex);
  }
  return pages.size>1;
}
export function splitTableResizeRefusal(){
  return new UnsupportedTableOperation('resize-track-split-table','여러 쪽에 걸친 표는 현재 크기를 조절할 수 없습니다.');
}
// A coarse key step is only for the complete row directly before a cut.
// Bboxes pick the candidate; Core proves fragment ownership and line reflow.
function precedesCutRow(grid:readonly CellBox[],frame:CellBox,rows:number,cols:number){
  if(!Number.isSafeInteger(rows)||!Number.isSafeInteger(cols)||cols<1||
    !Number.isSafeInteger(frame.row)||frame.row<1||frame.row+1>=rows)return false;
  const row=grid.filter(x=>x.row===frame.row);
  if(row.length!==cols||new Set(row.map(x=>x.cellIdx)).size!==cols||
    new Set(row.map(x=>x.col)).size!==cols||
    row.some(x=>x.pageIndex!==frame.pageIndex||!Number.isSafeInteger(x.col)||x.col<0||x.col>=cols)||
    grid.filter(x=>row.some(c=>c.cellIdx===x.cellIdx)).length!==cols)return false;
  const next=grid.filter(x=>x.row===frame.row+1);
  const ids=new Map<number,number>();
  for(const x of next){
    if(!Number.isSafeInteger(x.col)||x.col<0||x.col>=cols||
       (ids.has(x.col)&&ids.get(x.col)!==x.cellIdx))return false;
    ids.set(x.col,x.cellIdx);
  }
  if(ids.size!==cols||new Set(ids.values()).size!==cols)return false;
  const pages=[...new Set(next.map(x=>x.pageIndex))].sort((a,b)=>a-b);
  return pages.length>1&&(pages[0]===frame.pageIndex||pages[0]===frame.pageIndex+1)&&
    pages.every((p,i)=>p===pages[0]+i&&next.filter(x=>x.pageIndex===p).length===cols);
}
function isClosingCutRow(grid:readonly CellBox[],frame:CellBox,cols:number){
  if(!Number.isSafeInteger(cols)||cols<1||frame.row<1||grid.some(x=>x.cellIdx===frame.cellIdx&&x.row!==frame.row))return false;
  const row=grid.filter(x=>x.row===frame.row);
  const closing=row.filter(x=>x.pageIndex===frame.pageIndex);
  if(closing.length!==cols||row.some(x=>x.pageIndex>frame.pageIndex)||
    new Set(closing.map(x=>x.col)).size!==cols||new Set(closing.map(x=>x.cellIdx)).size!==cols)return false;
  // Every column belongs to the same logical cell across its fragments.
  return closing.every(c=>Number.isSafeInteger(c.col)&&c.col>=0&&c.col<cols&&
    row.some(x=>x.cellIdx===c.cellIdx&&x.col===c.col&&x.pageIndex<frame.pageIndex)&&
    row.every(x=>(x.col===c.col)===(x.cellIdx===c.cellIdx)));
}
// Keep protection and owner errors distinct even on a split table.
export function assertSplitTrackEditable(a:RhwpAdapter,owner:Cell,grid:readonly CellBox[],cell:CellBox,axis:Axis){
  a.assertEditable(owner);
  const [start,count]=cellAxis(cell,axis), checked=new Set<number>([owner.cell]);
  for(const peer of grid){
    const [i,n]=cellAxis(peer,axis);
    if(i>=start+count||i+n<=start||checked.has(peer.cellIdx))continue;
    a.assertEditable({...owner,cell:peer.cellIdx,cellPara:0,offset:0});
    checked.add(peer.cellIdx);
  }
}

// Geometry is used for picking only; the exact native layout verifies the
// complete boundary, its current owner, span constraints and all writes.
export function pickNativeTrackEdge(a:RhwpAdapter,p:Cell,page:number,x:number,y:number,tolerance:number){
  if(!hasNativeTrackResize(a)||!Number.isSafeInteger(page)||page<0)return;
  const all=a.cells(p);
  if(!all.length||new Set(all.map(c=>c.cellIdx)).size!==all.length||all.some(c=>c.pageIndex!==page))return;
  const hits=[];
  for(const axis of ['column','row'] as const){
    const horizontal=axis==='column',point=horizontal?x:y,cross=horizontal?y:x;
    const max=Math.max(...all.map(c=>{const [i,n]=cellAxis(c,axis);return i+n;}));
    for(const c of all){
      const [i,n]=cellAxis(c,axis),line=horizontal?c.x+c.w:c.y+c.h;
      const start=horizontal?c.y:c.x,end=start+(horizontal?c.h:c.w),boundary=i+n;
      if(Math.abs(point-line)>tolerance||cross<=start+tolerance||cross>=end-tolerance||boundary<=0)continue;
      if(all.some(o=>{
        const along=horizontal?o.x:o.y, across=horizontal?o.y:o.x;
        return point>=along-tolerance&&point<=along+(horizontal?o.w:o.h)+tolerance&&
          (Math.abs(cross-across)<=tolerance||Math.abs(cross-across-(horizontal?o.h:o.w))<=tolerance);
      }))continue;
      const owner={...p,cell:c.cellIdx,cellPara:0,offset:0};
      const edge:NativeResizeEdge={owner,page,axis,boundary,intent:boundary===max?'outerBoundary':'internalBoundary'};
      hits.push({edge,line,start,end,cell:c});
    }
  }
  return hits.length===1?hits[0]:undefined;
}

function result(v:unknown):Outcome{
  if(!v||typeof v!=='object'||!('status'in v))throw refusal('invalidReceipt');
  if(v.status==='unchanged')return {status:'unchanged'};
  if(v.status==='refused'&&'reason'in v&&typeof v.reason==='string'&&/^[a-zA-Z0-9]{1,64}$/.test(v.reason))
    return {status:'refused',reason:v.reason};
  if((v.status==='planned'||v.status==='applied')&&'plan'in v&&v.plan&&typeof v.plan==='object'&&!Array.isArray(v.plan))
    return {status:v.status,plan:v.plan as Record<string,unknown>};
  throw refusal('invalidReceipt');
}
function report(status:string,request:Request,detail?:unknown){
  if(typeof document==='undefined')return;
  const eventDetail={status,request:structuredClone(request),detail:structuredClone(detail)};
  // Observers cannot run inside the plan/apply transaction or influence its target.
  queueMicrotask(()=>document.dispatchEvent(new CustomEvent('rhwp:table-track-resize',{detail:eventDetail})));
}
export function prepareNativeTrackResize(a:RhwpAdapter,s:Selection,c:{width:number;height:number;
  redistribute?:'x'|'y';cellOnly?:true;nativeTrackKeys?:true;nativeTrackRequired?:true;nativeEdge?:NativeResizeEdge;splitRowKey?:true;splitRangeKey?:true},
  readSelectedBoxes?:()=>readonly CellBox[],hitPage?:number){
  const d=port(a);
  if(!d){
    if(c.nativeEdge)throw refusal('unboundCore');
    if((c.splitRowKey&&c.height<0||c.splitRangeKey&&s.kind==='cells'&&s.anchor.cell!==s.focus.cell)&&
      s.kind==='cells'&&s.focus.kind==='cell'&&
      !s.focus.ancestors?.length&&new Set(a.cells(s.focus).map(x=>x.pageIndex)).size>1)
      throw refusal('unboundCore');
    return;
  }
  if(s.focus.kind!=='cell'||c.cellOnly)return;
  if(!c.nativeEdge&&(!c.nativeTrackKeys||s.kind!=='cells'))return;
  if(c.width===0&&c.height===0)return;
  if(![c.width,c.height].every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=2147483647)||c.width!==0&&c.height!==0)
    throw refusal('invalidDelta');
  const axis:Axis=c.width!==0?'column':'row';
  let delta=c.width||c.height;
  const coarseCut=c.nativeTrackRequired&&c.splitRowKey&&c.splitRangeKey&&axis==='row'&&
    (Math.abs(delta)===1200||Math.abs(delta)===1500);
  let owner=s.focus;
  let selectedOwners:Cell[]=[];
  let rangeEnd:Cell|undefined;
  let fitSelectedRows=false;
  let directCut=false;
  let intent:TrackIntent|undefined;
  let page:number;
  if(c.nativeEdge){
    const edge=c.nativeEdge;
    if(edge.axis!==axis||!sameTable(owner,edge.owner))throw refusal('invalidTarget');
    owner=edge.owner;page=edge.page;
    intent={intent:edge.intent,boundary:edge.boundary,delta};
  }else{
    if(s.kind!=='cells'||s.anchor.kind!=='cell'||!sameTable(owner,s.anchor))return;
    const grid=a.cells(owner);
    const splitRoot=!owner.ancestors?.length&&new Set(grid.map(x=>x.pageIndex)).size>1;
    const splitRange=splitRoot&&axis==='row'&&s.anchor.cell!==owner.cell;
    const splitShrinkKey=c.splitRowKey&&axis==='row'&&delta<0&&
      splitRoot;
    if(splitRange){
      if(!c.splitRangeKey||s.phase!==2||c.redistribute||!hasSplitTableFrames(owner,grid))
        throw splitTableResizeRefusal();
      if(a.transientEdit||a.hasPendingLocalBodyFlow())throw refusal('unsettledLayout');
      const {rowCount,colCount}=a.readLayout('getTableDimensions',owner.sec,owner.para,owner.control);
      const ends=grid.filter(x=>x.cellIdx===owner.cell||x.cellIdx===s.anchor.cell);
      const f=ends.find(x=>x.cellIdx===owner.cell),t=ends.find(x=>x.cellIdx===s.anchor.cell);
      if(ends.length!==2||!f||!t||f.pageIndex!==t.pageIndex||
        (hitPage!==undefined&&hitPage!==f.pageIndex))throw refusal('unownedRangeFrame');
      const first=Math.min(f.row,t.row),last=Math.max(f.row,t.row),count=last-first+1;
      const frame=grid.filter(x=>x.row>=first&&x.row<=last);
      if(!Number.isSafeInteger(rowCount)||!Number.isSafeInteger(colCount)||colCount<1||
        !Number.isSafeInteger(first)||first<1||last!==rowCount-1||count<2||count>3||
        Math.min(f.col,t.col)!==0||Math.max(f.col,t.col)!==colCount-1||
        grid.some(x=>x.rowSpan!==1||x.colSpan!==1)||
        frame.length!==count*colCount||new Set(frame.map(x=>x.cellIdx)).size!==frame.length||
        new Set(frame.map(x=>`${x.row}:${x.col}`)).size!==frame.length||
        frame.some(x=>x.pageIndex!==f.pageIndex||!Number.isSafeInteger(x.row)||
          !Number.isSafeInteger(x.col)||x.col<0||x.col>=colCount))
        throw splitTableResizeRefusal();
      page=f.pageIndex;
      rangeEnd=s.anchor;
      selectedOwners=frame.filter(x=>x!==f&&x!==t)
        .map(x=>({...owner,cell:x.cellIdx,cellPara:0,offset:0}));
    }else{
    if(splitShrinkKey&&(!hasSplitTableFrames(owner,grid)||s.phase!==2||
      s.anchor.cell!==owner.cell||c.redistribute))throw splitTableResizeRefusal();
    if(s.phase===3&&grid.length!==1){
      // F5 phase 3 is the entire table, not the caret's (often identical)
      // anchor/focus pair. Bind a complete, ordinary, single-page root grid.
      // All other scopes retain their existing admission and refusal.
      if(axis!=='row'||delta<=0||c.redistribute||cellPath(owner).length!==1)return;
      const members=readSelectedBoxes?.();
      const framePage=grid[0]?.pageIndex;
      if(framePage===undefined||!members||members.length!==grid.length||
          new Set(grid.map(x=>x.cellIdx)).size!==grid.length||
          new Set(members.map(x=>x.cellIdx)).size!==grid.length||
          members.some(x=>!grid.some(g=>g.cellIdx===x.cellIdx&&g.pageIndex===x.pageIndex))||
          grid.some(x=>x.pageIndex!==framePage||x.rowSpan!==1||x.colSpan!==1||
            !Number.isSafeInteger(x.row)||!Number.isSafeInteger(x.col)||x.row<0||x.col<0))return;
      const rows=Math.max(...grid.map(x=>x.row))+1,cols=Math.max(...grid.map(x=>x.col))+1;
      if(rows*cols!==grid.length||new Set(grid.map(x=>`${x.row}:${x.col}`)).size!==grid.length||
         !grid.some(x=>x.cellIdx===owner.cell))return;
      const first=grid.find(x=>x.row===0&&x.col===0)!;
      const last=grid.find(x=>x.row===rows-1&&x.col===cols-1)!;
      const asCell=(x:CellBox):Cell=>({...owner,cell:x.cellIdx,cellPara:0,offset:0});
      owner=asCell(first);rangeEnd=asCell(last);page=framePage;
      selectedOwners=grid.filter(x=>x!==first&&x!==last).map(asCell);
      delta*=rows;
      if(!Number.isSafeInteger(delta)||delta>2147483647)throw refusal('invalidDelta');
    }else{
    const current=grid.filter(x=>x.cellIdx===owner.cell);
    if(s.phase!==3&&s.anchor.cell===owner.cell&&!c.redistribute&&hasSplitTableFrames(owner,grid)){
      if(a.transientEdit||a.hasPendingLocalBodyFlow())throw refusal('unsettledLayout');
      const frame=hitPage===undefined?(current.length===1?current[0]:undefined):
        current.find(x=>x.pageIndex===hitPage);
      assertSplitTrackEditable(a,owner,grid,frame??current[0],axis);
      if(!c.splitRowKey||axis!=='row'||s.phase!==2)
        throw splitTableResizeRefusal();
      if(!frame)throw refusal('splitPageUnconfirmed');
      if(grid.some(x=>x.rowSpan!==1||x.colSpan!==1))throw refusal('unsupportedAffectedContent');
      const {rowCount,colCount}=a.readLayout('getTableDimensions',owner.sec,owner.para,owner.control);
      if(coarseCut&&current.length===1)throw splitTableResizeRefusal();
      if(current.length!==1){
        if(!c.splitRangeKey||(!coarseCut&&Math.abs(delta)!==300)||hitPage!==frame.pageIndex||
          !isClosingCutRow(grid,frame,colCount)||a.rect(owner)?.pageIndex!==hitPage)
          throw splitTableResizeRefusal();
        directCut=true;
      }
      const cutPredecessor=!directCut&&c.splitRangeKey&&Math.abs(delta)===300&&
        precedesCutRow(grid,frame,rowCount,colCount);
      if(cutPredecessor)delta*=8;
      else if(delta<0&&!directCut){
        const row=grid.filter(x=>x.row===frame.row);
        const ids=new Set(row.map(x=>x.cellIdx));
        const preceding=grid.filter(x=>x.row===frame.row-1);
        // For a backward move, verify this is the first complete body row of
        // the continuation and that it won't empty that fragment. Core still
        // proves the actual partition change and checks clip/ink/fresh layout.
        const canReturn=frame.row>0&&frame.row<rowCount-1&&frame.pageIndex>0&&
          preceding.length===colCount&&new Set(preceding.map(x=>x.col)).size===colCount&&
          preceding.every(x=>x.pageIndex===frame.pageIndex-1&&Number.isSafeInteger(x.col)&&x.col>=0&&x.col<colCount)&&
          grid.some(x=>x.row===frame.row+1&&x.pageIndex===frame.pageIndex);
        if(!Number.isSafeInteger(rowCount)||rowCount<1||!Number.isSafeInteger(colCount)||colCount<1||
          !Number.isSafeInteger(frame.row)||(frame.row!==rowCount-1&&!canReturn)||
          row.length!==colCount||ids.size!==colCount||
          new Set(row.map(x=>x.col)).size!==colCount||
          row.some(x=>x.pageIndex!==frame.pageIndex||!Number.isSafeInteger(x.col)||x.col<0||x.col>=colCount)||
          grid.filter(x=>ids.has(x.cellIdx)).length!==colCount)
          throw splitTableResizeRefusal();
      }
      page=frame.pageIndex;
      intent={intent:'selectedTracks',tracks:[{track:frame.row,delta}]};
    }else{
    if(current.length!==1)throw refusal('unownedFrame');
    const [start,count]=cellAxis(current[0],axis);
    // The selected cell owns one measured trailing edge. Never multiply a
    // key step by its span or choose an interior row from a reference fixture.
    page=current[0].pageIndex;
    if(s.anchor.cell!==owner.cell){
      // Both endpoints and every selected physical cell must belong to a
      // single rendered fragment. Core independently resolves the canonical
      // endpoints and the logical tracks, merge boundaries and affected cells.
      const members=readSelectedBoxes?.();
      const byCell=new Map<number,CellBox|null>();
      for(const cell of grid)byCell.set(cell.cellIdx,byCell.has(cell.cellIdx)?null:cell);
      if(!members||members.length<2||
          !members.some(x=>x.cellIdx===owner.cell)||!members.some(x=>x.cellIdx===s.anchor.cell)||
          new Set(members.map(x=>x.cellIdx)).size!==members.length||
          members.some(x=>byCell.get(x.cellIdx)?.pageIndex!==page||x.pageIndex!==page))
        throw refusal('unownedRangeFrame');
      const oneTrack=count===1&&members.every(x=>{const [i,n]=cellAxis(x,axis);return i===start&&n===1;});
      if(c.redistribute&&!oneTrack)return;
      selectedOwners=members.filter(x=>x.cellIdx!==owner.cell)
        .map(x=>({...owner,cell:x.cellIdx,cellPara:0,offset:0}));
      if(!c.redistribute&&!oneTrack){
        rangeEnd=s.anchor;
        if(c.splitRangeKey&&delta===-300&&axis==='row'&&!splitRoot&&!owner.ancestors?.length&&
            grid.every(x=>x.rowSpan===1&&x.colSpan===1)){
          const t=a.call<{treatAsChar:boolean;textWrap:string}>('getTableProperties',owner.sec,owner.para,owner.control);
          fitSelectedRows=t.treatAsChar&&t.textWrap==='TopAndBottom';
        }
      }
    }
    if(c.redistribute){
      if(c.redistribute!==(axis==='column'?'x':'y'))throw refusal('invalidDelta');
      const boundary=start+count;
      const max=Math.max(...grid.map(x=>{const [i,n]=cellAxis(x,axis);return i+n;}));
      if(boundary===max)return {unchanged:true} as const;
      intent={intent:'internalBoundary',boundary,delta};
    }else if(!rangeEnd){
      const host=owner.ancestors?.length===1&&owner.ancestors[0];
      // The last row of a whole two-row child shares the child's outer edge.
      // Type this key as an outer boundary only in its witnessed split parent;
      // Core still proves the exact owner, unchanged fragment and fresh output.
      const childOuter=axis==='row'&&c.splitRangeKey&&s.phase===2&&s.anchor.cell===owner.cell&&
        Math.abs(delta)===300&&host&&start===1&&count===1&&
        (hitPage===undefined||hitPage===page)&&a.rect(owner)?.pageIndex===page&&
        grid.length===4&&new Set(grid.map(x=>`${x.row}:${x.col}`)).size===4&&
        grid.every(x=>x.pageIndex===page&&x.rowSpan===1&&x.colSpan===1&&
          (x.row===0||x.row===1)&&(x.col===0||x.col===1))&&
        (()=>{const root:Cell={...owner,ancestors:undefined,control:host.controlIndex,
          cell:host.cellIndex,cellPara:host.cellParaIndex,offset:0};
          const frames=a.cells(root);
          return hasSplitTableFrames(root,frames)&&frames.some(x=>x.pageIndex===page&&x.cellIdx===root.cell);})();
      intent=childOuter?{intent:'outerBoundary',boundary:2,delta}:
        {intent:'selectedTracks',tracks:[{track:start+count-1,delta}]};
    }
    }
    }
    }
  }
  if(a.transientEdit||a.hasPendingLocalBodyFlow())throw refusal('unsettledLayout');
  if(coarseCut&&!directCut)throw splitTableResizeRefusal();
  a.assertEditable(owner);
  const members=selectedOwners.map(p=>{
    a.assertEditable(p);
    return {p,target:a.captureParagraph(p)};
  });
  const target=a.captureParagraph(owner);
  let endpointTarget:ReturnType<RhwpAdapter['captureParagraph']>|undefined;
  if(rangeEnd){
    a.assertEditable(rangeEnd);
    const endpoint=a.captureParagraph(rangeEnd);
    if(endpoint.sectionIndex!==target.sectionIndex||endpoint.parentParaIndex!==target.parentParaIndex)
      throw refusal('invalidRangeEnd');
    endpointTarget=endpoint;
    const bound={path:endpoint.path,targetId:endpoint.targetId};
    intent=fitSelectedRows?{intent:'fitSelectedRows',rangeEnd:bound}:{intent:'selectionRange',rangeEnd:bound,delta};
  }
  if(!intent)throw refusal('invalidIntent');
  const request={section:target.sectionIndex,root:target.parentParaIndex,path:target.path,
    targetId:target.targetId,page,axis,...intent} satisfies Request;
  // Use the ordinary Adapter dispatch to retire update/view projections.
  const execute=(wire:unknown)=>result(a.call<unknown>('oneditResizeTableTracksV1',JSON.stringify(wire)));
  const reply=execute({mode:'plan',...request});
  if(reply.status==='refused'){report(reply.status,request,reply.reason);throw refusal(reply.reason);}
  if(reply.status==='unchanged'){
    if(directCut)throw splitTableResizeRefusal();
    report(reply.status,request);return {unchanged:true} as const;
  }
  if(reply.status!=='planned')throw refusal('invalidReceipt');
  const plan=reply.plan;
  if(directCut&&plan.directCutHeight!==true)throw splitTableResizeRefusal();
  const doc=a.doc,id=a.documentId,revision=a.revision;
  report('planned',request,plan);
  return {unchanged:false,apply(){
    if(doc!==a.doc||id!==a.documentId||revision!==a.revision||a.transientEdit)throw refusal('stalePlan');
    a.assertEditable(owner);
    if(rangeEnd&&endpointTarget){
      const current=a.captureParagraph(rangeEnd);
      if(current.targetId!==endpointTarget.targetId||current.sectionIndex!==endpointTarget.sectionIndex||
          current.parentParaIndex!==endpointTarget.parentParaIndex||JSON.stringify(current.path)!==JSON.stringify(endpointTarget.path))
        throw refusal('stalePlan');
      a.assertEditable(rangeEnd);
    }
    for(const {p,target} of members){
      const current=a.captureParagraph(p);
      if(current.targetId!==target.targetId||current.sectionIndex!==target.sectionIndex||
          current.parentParaIndex!==target.parentParaIndex||JSON.stringify(current.path)!==JSON.stringify(target.path))
        throw refusal('stalePlan');
      a.assertEditable(p);
    }
    const done=execute({mode:'apply',...request,expectedPlan:plan});
    if(done.status==='refused'){report(done.status,request,done.reason);throw refusal(done.reason);}
    if(done.status!=='applied'||JSON.stringify(done.plan)!==JSON.stringify(plan))throw refusal('invalidReceipt');
    report('applied',request,done.plan);
  }} as const;
}
