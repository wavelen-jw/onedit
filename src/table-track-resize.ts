import { checkedOpenCoreSha256 } from "./ai-checked-open-binding.js";
import type {RhwpAdapter} from './adapter.js';
import {coreRuntimeIdentity,tableTrackResizeOptIn} from './core-runtime.js';
import {cellPath,type CellBox,type Position,type Selection} from './model.js';
import {UnsupportedTableOperation} from './table-capability.js';

type Cell=Extract<Position,{kind:'cell'}>;
type Axis='column'|'row';
export type NativeResizeEdge=Readonly<{owner:Cell;page:number;axis:Axis;boundary:number;
  intent:'internalBoundary'|'outerBoundary'}>;
type TrackIntent={intent:'selectedTracks';tracks:{track:number;delta:number}[]}|
  {intent:'internalBoundary'|'outerBoundary';boundary:number;delta:number}|
  {intent:'selectionRange';rangeEnd:{path:ReturnType<typeof cellPath>;targetId:string};delta:number};
type Request=Readonly<{section:number;root:number;path:ReturnType<typeof cellPath>;targetId:string;
  page:number;axis:Axis}&TrackIntent>;
type Outcome={status:'unchanged'}|{status:'refused';reason:string}|
  {status:'planned'|'applied';plan:Record<string,unknown>};
type CorePort={oneditResizeTableTracksV1:(request:string)=>string};
// The exact matched Core and approved web test host or local QA opt-in are required.
const resizeTrackCoreDigest=checkedOpenCoreSha256;
const cellAxis=(c:CellBox,axis:Axis)=>axis==='column'?[c.col,c.colSpan]:[c.row,c.rowSpan];
const refusal=(reason:string)=>new UnsupportedTableOperation('resize-track-'+reason,
  '선택한 표의 크기를 변경하지 않았습니다. ('+reason+')');
function port(a:RhwpAdapter):CorePort|undefined {
  if(!resizeTrackCoreDigest||coreRuntimeIdentity(a.doc)?.sha256!==resizeTrackCoreDigest||!tableTrackResizeOptIn())return;
  const d=a.doc as unknown as Partial<CorePort>;
  if(typeof d.oneditResizeTableTracksV1==='function')return d as CorePort;
}
export const hasNativeTrackResize=(a:RhwpAdapter)=>!!port(a);

export function sameTrackTable(a:Cell,b:Cell){
  const ap=cellPath(a),bp=cellPath(b);
  return a.sec===b.sec&&a.para===b.para&&ap.length===bp.length&&
    ap.every((h,i)=>h.controlIndex===bp[i].controlIndex&&
      (i===ap.length-1||h.cellIndex===bp[i].cellIndex&&h.cellParaIndex===bp[i].cellParaIndex));
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
  redistribute?:'x'|'y';cellOnly?:true;nativeTrackKeys?:true;nativeEdge?:NativeResizeEdge},
  readSelectedBoxes?:()=>readonly CellBox[]){
  const d=port(a);
  if(!d){
    if(c.nativeEdge)throw refusal('unboundCore');
    return;
  }
  if(s.focus.kind!=='cell'||c.cellOnly)return;
  if(!c.nativeEdge&&(!c.nativeTrackKeys||s.kind!=='cells'))return;
  if(c.width===0&&c.height===0)return;
  if(![c.width,c.height].every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=2147483647)||c.width!==0&&c.height!==0)
    throw refusal('invalidDelta');
  const axis:Axis=c.width!==0?'column':'row',delta=c.width||c.height;
  let owner=s.focus;
  let selectedOwners:Cell[]=[];
  let rangeEnd:Cell|undefined;
  let intent:TrackIntent|undefined;
  let page:number;
  if(c.nativeEdge){
    const edge=c.nativeEdge;
    if(edge.axis!==axis||!sameTrackTable(owner,edge.owner))throw refusal('invalidTarget');
    owner=edge.owner;page=edge.page;
    intent={intent:edge.intent,boundary:edge.boundary,delta};
  }else{
    if(s.kind!=='cells'||s.anchor.kind!=='cell'||!sameTrackTable(owner,s.anchor))return;
    const grid=a.cells(owner);
    if(s.phase===3&&grid.length!==1)return;
    const current=grid.filter(x=>x.cellIdx===owner.cell);
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
      if(!c.redistribute&&!oneTrack)rangeEnd=s.anchor;
    }
    if(c.redistribute){
      if(c.redistribute!==(axis==='column'?'x':'y'))throw refusal('invalidDelta');
      const boundary=start+count;
      const max=Math.max(...grid.map(x=>{const [i,n]=cellAxis(x,axis);return i+n;}));
      if(boundary===max)return {unchanged:true} as const;
      intent={intent:'internalBoundary',boundary,delta};
    }else if(!rangeEnd)intent={intent:'selectedTracks',tracks:[{track:start+count-1,delta}]};
  }
  if(a.transientEdit||a.hasPendingLocalBodyFlow())throw refusal('unsettledLayout');
  a.assertEditable(owner);
  const members=selectedOwners.map(p=>{
    a.assertEditable(p);
    return {p,target:a.captureParagraph(p)};
  });
  const target=a.captureParagraph(owner);
  if(rangeEnd){
    a.assertEditable(rangeEnd);
    const endpoint=a.captureParagraph(rangeEnd);
    if(endpoint.sectionIndex!==target.sectionIndex||endpoint.parentParaIndex!==target.parentParaIndex)
      throw refusal('invalidRangeEnd');
    intent={intent:'selectionRange',rangeEnd:{path:endpoint.path,targetId:endpoint.targetId},delta};
  }
  if(!intent)throw refusal('invalidIntent');
  const request={section:target.sectionIndex,root:target.parentParaIndex,path:target.path,
    targetId:target.targetId,page,axis,...intent} satisfies Request;
  // Use the ordinary Adapter dispatch to retire update/view projections.
  const execute=(wire:unknown)=>result(a.call<unknown>('oneditResizeTableTracksV1',JSON.stringify(wire)));
  const reply=execute({mode:'plan',...request});
  if(reply.status==='refused'){report(reply.status,request,reply.reason);throw refusal(reply.reason);}
  if(reply.status==='unchanged'){report(reply.status,request);return {unchanged:true} as const;}
  if(reply.status!=='planned')throw refusal('invalidReceipt');
  const plan=reply.plan;
  const doc=a.doc,id=a.documentId,revision=a.revision;
  report('planned',request,plan);
  return {unchanged:false,apply(){
    if(doc!==a.doc||id!==a.documentId||revision!==a.revision||a.transientEdit)throw refusal('stalePlan');
    a.assertEditable(owner);
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
