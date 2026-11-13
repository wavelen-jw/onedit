import {nested,type CellBox,type Position} from './model.js';
import {ordinaryPreviewGrid} from './selection-context-lite.js';
type Cell=Extract<Position,{kind:'cell'}>;
export type BatchHop=Readonly<{controlIndex:number;cellIndex:number;cellParaIndex:number}>;
export type BatchTarget=Readonly<{section:number;paragraph:number;path:readonly BatchHop[]}>;
export type BatchRequest=Readonly<{targets:readonly BatchTarget[]}>;
export type BatchRow=Readonly<{listId:number;isCell:true;hostListId:number;sectionIndex:number;hostPara:number;
  controlIndex:number;cellIndex:number;paraCount:number;row:number;col:number;rowSpan:number;colSpan:number;cellCount:number}>;
export type BatchReply=Readonly<{status:'ok';rows:readonly (BatchRow|null)[]}|{status:'invalidRequest'|'budgetExceeded'}>;
/** No production binding. The future matched4 loader must mint this port for
 * one verified native document, not discover a same-named method by duck typing. */
export type PassiveOwnerBatchPort = Readonly<{
  owns(doc:object):boolean;
  read(doc:object,inputJson:string):string;
}>;
export class PassiveOwnerBatchRetired extends Error {}
const uint=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
export function stage5OwnerBatchOptIn(win:Window|null) {
  if(!win||win.parent!==win)return false;
  const u=new URL(win.location.href),f=u.searchParams.getAll('oneditQaOwnerBatchPhase5');
  return u.protocol==='http:'&&u.hostname==='127.0.0.1'&&f.length===1&&f[0]==='1';
}
/** Screen state is eligibility only. It can never prove native owner or permission. */
export function passiveBatchScreenWitness(doc:Document, index:number):(()=>string|undefined)|undefined {
  if(!uint(index)||doc.fonts.status!=='loaded')return;
  const pages=doc.getElementById('pages'),zoom=doc.getElementById('status-zoom');
  if(!pages||pages.childElementCount<2||!zoom)return;
  const page=pages.children.item(index),svg=page?.querySelector(':scope > svg');
  if(!page||page.getAttribute('data-page')!==String(index)||!svg||page.hasAttribute('data-render-pending'))return;
  const n=pages.childElementCount;
  return ()=>doc.fonts.status==='loaded' && pages.isConnected && page.parentElement===pages &&
    pages.childElementCount===n && pages.children.item(index)===page && svg.parentElement===page &&
    page.getAttribute('data-page')===String(index) && !page.hasAttribute('data-render-pending') &&
    zoom.isConnected && zoom.textContent ? zoom.textContent : undefined;
}
type Plan={positions:readonly Cell[]; grid:readonly CellBox[]; request:BatchRequest};
export function planPassiveOwnerBatch(p:Cell,grid:readonly CellBox[]):Plan|undefined {
  if(p.sec!==0 || nested(p) || ![p.para,p.control,p.cell,p.cellPara,p.offset].every(uint) ||
    grid.length<2 || grid.length>12 || !ordinaryPreviewGrid(grid,p.cell))return;
  const positions=grid.map(c=>({...p,cell:c.cellIdx,cellPara:0,offset:0}));
  return {positions,grid:grid.map(x=>Object.freeze({...x})),request:{targets:positions.map(x=>({section:x.sec,paragraph:x.para,
    path:[{controlIndex:x.control,cellIndex:x.cell,cellParaIndex:0}]}))}};
}
const same=(a:Cell,b:Cell)=>!nested(b)&&a.sec===b.sec&&a.para===b.para&&a.control===b.control&&
  a.cell===b.cell&&a.cellPara===b.cellPara&&a.offset===b.offset;
const fields=['listId','hostListId','sectionIndex','hostPara','controlIndex','cellIndex',
  'paraCount','row','col','rowSpan','colSpan','cellCount'] as const;
export function withPassiveOwnerRows<T>(plan:Plan,live:()=>boolean,
  native:(json:string)=>string,run:(has?:(p:Cell)=>boolean)=>T):T {
  if(!live())return run();
  const request=JSON.stringify(plan.request);
  if(new TextEncoder().encode(request).length>8192)return run();
  let rows:readonly BatchRow[]|undefined;
  try {
    const raw=native(request);
    if(typeof raw==='string'&&raw.length<=8192&&live()){
      const r=JSON.parse(raw) as BatchReply;
      if(r?.status==='ok'&&Object.keys(r).length===2&&Array.isArray(r.rows)&&r.rows.length===plan.positions.length&&
         r.rows.every((x,i)=> {
           const p=plan.positions[i],g=plan.grid[i];
           return !!x&&Object.keys(x).length===fields.length+1&&fields.every(k=>uint(x[k]))&&x.isCell===true&&
             x.hostListId===0&&x.listId>0&&x.sectionIndex===p.sec&&x.hostPara===p.para&&x.controlIndex===p.control&&
             x.cellIndex===p.cell&&x.cellIndex<x.cellCount&&x.cellCount===plan.positions.length&&x.paraCount>0&&
             x.row===g.row&&x.col===g.col&&x.rowSpan===g.rowSpan&&x.colSpan===g.colSpan;
         })&&new Set(r.rows.map(x=>x!.listId)).size===r.rows.length)
        rows=Object.freeze(r.rows.map(x=>Object.freeze({...x!})));
    }
  }catch{ /* Unknown replies fall through to the original read and error semantics. */ }
  if(!rows||!live())return run();
  let open=true;
  try {
    return run(p=>{
      if(!open||!live()){open=false;rows=undefined;return false;}
      return !!rows&&plan.positions.some(x=>same(x,p));
    });
  } finally {open=false;rows=undefined;}
}
