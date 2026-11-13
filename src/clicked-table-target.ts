import type { RhwpAdapter } from "./adapter.js";
import { cellPath, copy, nested, samePosition, type CellBox, type ParagraphTarget, type Position, type SelectionReference } from "./model.js";

type Cell = Extract<Position, {kind:"cell"}>;
export type ClickedTableTarget = {
  readonly position: Cell;
  readonly reference: SelectionReference;
  readonly page: number;
  readonly grid: () => readonly Readonly<CellBox>[] | undefined;
  readonly cellProtected: boolean;
  readonly current: () => boolean;
  readonly matches: (p:Position) => boolean;
  readonly ownsTable: (p:Position) => boolean;
};
type Prepared = {target:ClickedTableTarget} | {reason:string};
const index=(v:number)=>Number.isSafeInteger(v)&&v>=0&&v<=0xffff_ffff;
export function prepareClickedTable(a:RhwpAdapter,p:Position,page:number,x:number,y:number,
    tableWitness:boolean,view:()=>boolean,note:(reason:string)=>void):Prepared {
  if(p.kind!=="cell")return {reason:"not-cell"};
  if(nested(p))return {reason:"nested-path"};
  if(!tableWitness)return {reason:"non-table-or-unproved-hit"};
  if(![p.sec,p.para,p.control,p.cell,p.cellPara,p.offset,page].every(index))return {reason:"invalid-address"};
  if(a.scope!=="edit"||a.documentLocked||a.viewerOnlyReason)return {reason:"read-only"};
  const fence=a.tablePreviewFence(), current=()=>view()&&fence()&&a.scope==="edit"&&!a.documentLocked&&!a.viewerOnlyReason;
  if(!current())return {reason:"stale-before-read"};
  try{
    // This native getter checks that the addressed control is an actual Table;
    // a textbox with a compatible paragraph path cannot enter this branch.
    const own=a.call("getCellOwnProperties",p.sec,p.para,p.control,p.cell);
    if(own.fieldName!==""||typeof own.editableInForm!=="boolean"||own.editableInForm||
      typeof own.cellProtect!=="boolean")return {reason:"field-or-unknown-properties"};
    // W802e path-only getClipboardTarget cannot prove canonical global
    // uniqueness. Keep the one existing canonical capture for the stored
    // reference; replace its repeated App list prechecks, not that contract.
    const path=cellPath(p),t=a.call<{target:ParagraphTarget}>(
      "captureCellParagraphPath",p.sec,p.para,JSON.stringify(path)).target;
    const hop=t?.path?.[0];
    if(!t||!/^cell-para-[1-9][0-9]*$/.test(t.targetId)||t.sectionIndex!==p.sec||
      t.parentParaIndex!==p.para||t.path?.length!==1||hop?.controlIndex!==p.control||
      hop.cellIndex!==p.cell||hop.cellParaIndex!==p.cellPara||
      !index(t.charLength)||p.offset>t.charLength)return {reason:"owner-or-offset"};
    if(!current())return {reason:"stale-after-read"};
    const position=copy(p),reference:SelectionReference={documentId:a.documentId,
      selection:{kind:"caret",focus:copy(position)},focus:{target:copy(t),offset:p.offset}};
    // Current selected-table consumers only. Don't query a grid if neither
    // guide nor grip needs it. Legacy geometry remains for split or ambiguous
    // render ownership even when the hit's local paragraph identity is valid.
    let attempted=false,boxes:readonly Readonly<CellBox>[]|undefined;
    const grid=()=>{
      if(!current())return;
      if(attempted)return boxes;
      attempted=true;
      try{
        const raw=a.call<CellBox[]>("getTableCellBboxes",p.sec,p.para,p.control);
        if(!Array.isArray(raw)||!raw.length||raw.length>256||
          new Set(raw.map(c=>c.cellIdx)).size!==raw.length||
          raw.some(c=>c.pageIndex!==page||![c.cellIdx,c.row,c.col].every(index)||
            ![c.rowSpan,c.colSpan].every(n=>index(n)&&n>0)||
            ![c.x,c.y,c.w,c.h].every(Number.isFinite)||c.w<=0||c.h<=0)||
          !raw.some(c=>c.cellIdx===p.cell&&x>=c.x-.11&&x<=c.x+c.w+.11&&y>=c.y-.11&&y<=c.y+c.h+.11)){
          note("split-or-unproved-grid");return;
        }
        if(current())boxes=Object.freeze(raw.map(c=>Object.freeze({...c})));
      }catch{note("native-grid-refused");}
      return boxes;
    };
    return {target:{position,reference,page,grid,
      cellProtected:own.cellProtect,current,matches:v=>samePosition(position,v),
      ownsTable:v=>v.kind==="cell"&&!nested(v)&&v.sec===position.sec&&v.para===position.para&&v.control===position.control}};
  }catch{return {reason:"native-owner-refused"};}
}
