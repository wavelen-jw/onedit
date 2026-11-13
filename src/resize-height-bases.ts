import type {RhwpAdapter} from './adapter.js';
import type {Position} from './model.js';
import {UnsupportedTableOperation} from './table-capability.js';

// The pinned native whole-row command adds HU to the unrounded render frame,
// not to cellSz. Display bboxes (0.1px) identify a unique frame only; they must
// NEVER be converted back to a height. The same canonical tree emits cell clip
// rects with Rust's lossless f64 display, unlike the rounded JSON layout APIs.
// No stale DOM, guessed clip order, tolerance or alternative resize API is used.
export function exactCellFrames(a:RhwpAdapter,p:Extract<Position,{kind:'cell'}>,selected:number[]) {
  if(!a.heightCandidateIdentified)return;
  const boxes=a.call('getTableCellBboxes',p.sec,p.para,p.control,0) as {cellIdx:number;pageIndex:number;x:number;y:number;w:number;h:number}[];
  const chosen=selected.map(cell=>boxes.filter(b=>b.cellIdx===cell));
  // Native repeated/split cells use measured row sums, not a fragment frame.
  // Retain the old strict stored-HU check where that exact base is unavailable.
  if(chosen.some(rows=>rows.length!==1))return;
  const clips=new Map<number,number[][]>();
  for(const [b] of chosen){
    if(clips.has(b.pageIndex))continue;
    const svg=a.doc.renderPageSvg(b.pageIndex),rects:number[][]=[];
    const number='(-?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?)';
    const pattern=new RegExp('<clipPath id="cell-clip-[0-9]+"><rect x="'+number+'" y="'+number+'" width="'+number+'" height="'+number+'"/></clipPath>','g');
    for(const match of svg.matchAll(pattern)){const r=match.slice(1).map(Number);if(r.every(Number.isFinite)&&r[2]>0&&r[3]>0)rects.push(r);}
    clips.set(b.pageIndex,rects);
  }
  const result=new Map<number,{box:typeof boxes[number];rect:number[];hu:number}>(),dpi=a.doc.getDpi();
  if(!Number.isFinite(dpi)||dpi<=0)return;
  for(let i=0;i<selected.length;i++){
    const [b]=chosen[i],bounds=[b.x,b.y,b.w,b.h];
    // Both public queries originate from the SAME tree. Ambiguous coincident
    // parent/child clips cannot establish an owner, even if their heights match.
    const matching=clips.get(b.pageIndex)!.filter(r=>r.every((v,n)=>Number(v.toFixed(1))===bounds[n]));
    if(matching.length!==1)return;
    const base=Math.round(matching[0][3]*(7200/dpi));
    if(!Number.isSafeInteger(base)||base<0||base>2147483647)return;
    result.set(selected[i],{box:b,rect:matching[0],hu:base});
  }
  return {cells:result,units:7200/dpi};
}

export function resizeHeightBases(a:RhwpAdapter,p:Extract<Position,{kind:'cell'}>,selected:number[]):Map<number,number>|undefined {
  const frame=exactCellFrames(a,p,selected);
  return frame&&new Map([...frame.cells].map(([cell,f])=>[cell,f.hu]));
}
type Sizes={rows:number;cols:number;sizes:number[][]};
export type ResizeTableFrame=NonNullable<ReturnType<typeof resizeTableFrame>>;
// Authenticate every cell from this same canonical tree, not a stored/DOM
// envelope or inferred rounded bbox. Split/merged/ambiguous frames stay strict.
export function resizeTableFrame(a:RhwpAdapter,p:Extract<Position,{kind:'cell'}>,grid:Sizes){
  const frame=exactCellFrames(a,p,grid.sizes.map((_,i)=>i));
  if(!frame||grid.rows*grid.cols!==grid.sizes.length)return;
  const rows=new Map<number,{height:number;hu:number;cells:number[]}>();
  const cells=[...frame.cells.values()];
  const page=cells[0]?.box.pageIndex;
  for(const [cell,f]of frame.cells){
    const b=f.box as typeof f.box&{row:number;col:number;rowSpan:number;colSpan:number};
    if(b.pageIndex!==page||b.rowSpan!==1||b.colSpan!==1||
      !Number.isSafeInteger(b.row)||b.row<0||b.row>=grid.rows||
      !Number.isSafeInteger(b.col)||b.col<0||b.col>=grid.cols)return;
    let row=rows.get(b.row);
    if(!row){row={height:f.rect[3],hu:f.hu,cells:[]};rows.set(b.row,row);}
    if(row.height!==f.rect[3])return;
    if(row.cells.some(c=>(frame.cells.get(c)!.box as typeof b).col===b.col))return;
    row.cells.push(cell);
  }
  if(rows.size!==grid.rows||[...rows.values()].some(r=>r.cells.length!==grid.cols))return;
  const source=a.call('getTableProperties',p.sec,p.para,p.control).tableHeight;
  if(!Number.isSafeInteger(source)||source<0)return;
  const declared=[...rows.values()].reduce((sum,r)=>sum+Math.max(...r.cells.map(c=>grid.sizes[c][1])),0);
  const left=Math.min(...cells.map(f=>f.rect[0])),top=Math.min(...cells.map(f=>f.rect[1]));
  const right=Math.max(...cells.map(f=>f.rect[0]+f.rect[2])),bottom=Math.max(...cells.map(f=>f.rect[1]+f.rect[3]));
  return {...frame,rows:new Map([...rows].sort(([a],[b])=>a-b)),page,left,top,right,height:bottom-top,source,surplus:source>declared};
}
export function validateResizeTableFrame(before:ResizeTableFrame,after:ResizeTableFrame,selected:Set<number>,delta:number){
  const fail=()=>{throw new UnsupportedTableOperation('resize-frame-rollback','Core 높이 변경 결과가 요청·비대상 프레임과 달라 원문을 복원했습니다.');};
  if(before.units!==after.units||before.cells.size!==after.cells.size||
    before.rows.size!==after.rows.size||before.left!==after.left||before.right!==after.right||
    before.page===after.page&&before.top!==after.top)fail();
  let total=0;
  for(const [r,row]of before.rows){
    const next=after.rows.get(r);if(!next)fail();
    const count=row.cells.filter(c=>selected.has(c)).length;
    if(count!==0&&count!==row.cells.length)fail();
    const target=count?row.hu+delta:row.hu;
    if(next!.hu!==target)fail();
    total+=count?target/before.units:row.height;
    for(const c of row.cells){
      const old=before.cells.get(c)!,now=after.cells.get(c);
      if(!now||old.rect[0]!==now.rect[0]||old.rect[2]!==now.rect[2])fail();
    }
  }
  // The existing persisted envelope is integer HU. Authenticate that exact
  // representation, not storedHeight+delta and not a new pixel tolerance.
  const envelope=Math.round(total*before.units);
  if(after.source!==envelope||Math.round(after.height*after.units)!==envelope||
    (delta>0?after.height<=before.height:after.height>=before.height))fail();
}

// A batch shrink is atomic: if one complete row reaches its content floor,
// discard every partial row change through History's existing no-op rollback.
// Compressed inputs can persist a content-owned row above its old cellSz even
// while its actual frame stays put. Prove the complete physical result instead
// of treating that declaration repair as an enlargement. No tolerance is used.
export function partialHeightFloor(before:ResizeTableFrame,after:ResizeTableFrame,selected:Set<number>,delta:number){
  return partialFloorFrame(before,after,selected,delta,false);
}
function partialFloorFrame(before:ResizeTableFrame,after:ResizeTableFrame,selected:Set<number>,delta:number,samePainter:boolean){
  if(delta>=0||before.units!==after.units||before.page!==after.page||
    before.left!==after.left||before.top!==after.top||before.right!==after.right||
    before.rows.size!==after.rows.size||before.cells.size!==after.cells.size)return false;
  let clamped=false,shift=0,total=0;
  for(const [index,row]of before.rows){
    const next=after.rows.get(index);if(!next||JSON.stringify(row.cells)!==JSON.stringify(next.cells))return false;
    const count=row.cells.filter(c=>selected.has(c)).length;
    if(count!==0&&count!==row.cells.length)return false;
    const change=next.hu-row.hu;
    if(count?change<delta||change>0:change!==0)return false;
    if(!samePainter&&next.height!==row.height+change/before.units)return false;
    if(count&&change>delta)clamped=true;
    for(const cell of row.cells){
      const old=before.cells.get(cell)!,now=after.cells.get(cell);
      if(!now||old.rect[0]!==now.rect[0]||old.rect[2]!==now.rect[2]||
        (!samePainter&&now.rect[1]!==old.rect[1]+shift)||now.rect[3]!==next.height)return false;
    }
    shift+=change/before.units;total+=next.height;
  }
  const envelope=Math.round(total*before.units);
  return clamped&&(samePainter||after.height===before.height+shift)&&after.source===envelope&&
    Math.round(after.height*before.units)===envelope;
}

// Approved ONLY for the fixed ordinary whole-table partial-floor command.
// Core proves original replay + post-commit equality to the same forward trial.
// UI additionally requires exact HU/declarations and an independent checked
// source reopen to reproduce every cell's full coordinates. No epsilon and no
// renderer rewrite: old+delta and cumulative subtraction need not have equal bits.
export function canonicalPartialHeightFloor(a:RhwpAdapter,p:Extract<Position,{kind:'cell'}>,before:ResizeTableFrame,after:ResizeTableFrame,
  original:Sizes,changed:Sizes,selected:Set<number>,delta:number){
  if(!a.wholeHeightCandidateIdentified||selected.size!==before.cells.size||
    [...before.cells.keys()].some(c=>!selected.has(c))||
    !partialFloorFrame(before,after,selected,delta,true)||
    ![...before.rows].every(([index,row])=>{
      const next=after.rows.get(index)!;
      return row.cells.every(c=>changed.sizes[c][0]===original.sizes[c][0]&&
        changed.sizes[c][1]===(next.hu===row.hu?original.sizes[c][1]:next.hu));
    }))return false;
  return checkedReopenFrame(a,p,after,changed);
}

// An outer drag may stop at a content floor rather than undo a safely
// clamped move. Only the already measured complete ordinary bottom row may
// use this rule. Other rows keep both their declarations and painted frames.
export function draggedHeightFloor(a:RhwpAdapter,p:Extract<Position,{kind:'cell'}>,before:ResizeTableFrame,after:ResizeTableFrame,
  original:Sizes,changed:Sizes,selected:Set<number>,delta:number){
  const bottom=[...before.rows].at(-1);
  if(!a.wholeHeightCandidateIdentified||!bottom||bottom[1].cells.length!==selected.size||
    bottom[1].cells.some(cell=>!selected.has(cell))||
    !partialFloorFrame(before,after,selected,delta,true))return false;
  const next=after.rows.get(bottom[0])!;
  if(next.hu>=bottom[1].hu||[...before.rows].some(([i,r])=>i!==bottom[0]&&r.height!==after.rows.get(i)?.height))return false;
  if(!changed.sizes.every(([w,h],cell)=>w===original.sizes[cell][0]&&
    h===(selected.has(cell)?next.hu:original.sizes[cell][1])))return false;
  return checkedReopenFrame(a,p,after,changed);
}
export function checkedReopenFrame(a:RhwpAdapter,p:Extract<Position,{kind:'cell'}>,after:ResizeTableFrame,changed:Sizes){
  const certificate=(f:ResizeTableFrame)=>JSON.stringify({units:f.units,page:f.page,left:f.left,top:f.top,right:f.right,
    height:f.height,source:f.source,rows:[...f.rows],cells:[...f.cells]});
  return a.withCheckedReopen(reopened=>{
    const fresh=resizeTableFrame(reopened,p,changed);
    return fresh!==undefined&&certificate(fresh)===certificate(after);
  });
}
