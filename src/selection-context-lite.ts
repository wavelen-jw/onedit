// One validated structural owner for one synchronous display publication.
// No retained list array, ordinal index, layout, protection or format cache.
import type { Position } from './model.js';
type Cell = Extract<Position,{kind:'cell'}>;
export type SelectionContextRequest = Readonly<{
  sectionIndex:number; hostPara:number; controlIndex:number; cellIndex:number;
}>;
export type SelectionContextLite = Readonly<SelectionContextRequest & {paraCount:number}>;
// Exact RHW-92 private port. Request identity comes from the synchronous invocation.
export type NativeSelectionContextLite = (inputJson:string)=>string;
export function selectionTargetNativeOptIn(win:Window|null) {
  if (!selectionContextOptIn(win)) return false;
  const opt=new URL(win!.location.href).searchParams.getAll("oneditQaSelectionTargetNative");
  return opt.length===1 && opt[0]==="1";
}
function readNativeContext(native:NativeSelectionContextLite,p:Cell, address:SelectionContextRequest) {
  try {
    const raw=native(JSON.stringify({kind:'cell',section:p.sec,paragraph:p.para,offset:p.offset,
      path:[{controlIndex:p.control,cellIndex:p.cell,cellParaIndex:p.cellPara}]}));
    if(typeof raw!=='string' || raw.length>1024) return;
    const r=JSON.parse(raw), g=r?.grid;
    if(r?.status!=='ok' || r.kind!=='cell' || !uint(r.paraCount) || !uint(r.length) ||
       p.cellPara>=r.paraCount || p.offset>r.length || !g ||
       ![g.row,g.col,g.rowSpan,g.colSpan,g.cellCount].every(uint) ||
       g.rowSpan!==1 || g.colSpan!==1 || p.cell>=g.cellCount) return;
    return Object.freeze({...address,paraCount:r.paraCount});
  } catch { return; } // try authoritative legacy read; its failure remains observable
}

const uint = (n:unknown): n is number => typeof n==='number' && Number.isSafeInteger(n) && n>=0 && n<=0xffffffff;
export function rootCellAddress(p:Position):SelectionContextRequest|undefined {
  if (p.kind!=='cell' || p.ancestors?.length || ![p.sec,p.para,p.control,p.cell,p.cellPara,p.offset].every(uint)) return;
  return {sectionIndex:p.sec,hostPara:p.para,controlIndex:p.control,cellIndex:p.cell};
}
const same = (a:SelectionContextRequest,b:SelectionContextRequest) => a.sectionIndex===b.sectionIndex &&
  a.hostPara===b.hostPara && a.controlIndex===b.controlIndex && a.cellIndex===b.cellIndex;
export function selectionContextOptIn(win:Window|null) {
  if (!win || win.parent!==win) return false;
  const url=new URL(win.location.href), flags=url.searchParams.getAll('oneditQaSelectionContextLite');
  return url.protocol==='http:' && url.hostname==='127.0.0.1' && flags.length===1 && flags[0]==='1';
}
export function selectionContextScope(anchor:SelectionContextRequest, current:()=>boolean, native?:NativeSelectionContextLite) {
  let open=true, loading=false, value:SelectionContextLite|undefined;
  function close(){open=false;value=undefined;}
  function valid(){if(open&&!current())close();return open;}
  return {
    close, valid,
    validateOwner(p:Cell, readLegacy:()=>unknown) {
      const address=rootCellAddress(p);
      if (!valid() || !address || !same(anchor,address)) return false;
      if (loading) {close();return false;}
      if (value && p.cellPara < value.paraCount) return true;
      loading=true;
      try {
        // Existing authoritative first-match scan; exceptions and misses retain
        // their original result. A malformed result is never kept for reuse.
        const projected=native && readNativeContext(native,p,address);
        if(projected && valid()){value=projected;return true;}
        const raw=readLegacy() as Partial<SelectionContextLite> & {isCell?:boolean; row?:number; hostListId?:number};
        if (valid() && raw?.isCell===true && raw.hostListId===0 && uint(raw.row) &&
            uint(raw.paraCount) && p.cellPara<raw.paraCount &&
            same(address,raw as SelectionContextRequest))
          value=Object.freeze({...address,paraCount:raw.paraCount});
        return true; // this call already ran original positional validation
      } catch(error) {close();throw error;}
      finally {loading=false;}
    },
  };
}

// Separate Stage2 feature. It does not enable the earlier Edit menu trial.
export function tablePreviewLiteOptIn(win:Window|null) {
  if(!win || win.parent!==win)return false;
  const u=new URL(win.location.href),flags=u.searchParams.getAll('oneditQaTablePreviewLite');
  return u.protocol==='http:' && u.hostname==='127.0.0.1' && flags.length===1 && flags[0]==='1';
}
export function ordinaryPreviewGrid(cells:readonly import('./model.js').CellBox[], selected:number) {
  if (!cells.length || !uint(cells[0].pageIndex)) return false;
  const ids=new Set<number>(), slots=new Set<string>(), page=cells[0].pageIndex;
  for (const c of cells) {
    const key=c.row+':'+c.col;
    if(c.pageIndex!==page || ![c.cellIdx,c.row,c.col].every(uint) || c.rowSpan!==1 || c.colSpan!==1 ||
        ids.has(c.cellIdx) || slots.has(key))return false;
    ids.add(c.cellIdx); slots.add(key);
  }
  return ids.has(selected);
}

export function phase3LiteOptIn(win:Window|null) {
  if(!tablePreviewLiteOptIn(win))return false;
  const flags=new URL(win!.location.href).searchParams.getAll('oneditQaTablePreviewPhase3');
  return flags.length===1 && flags[0]==='1';
}
