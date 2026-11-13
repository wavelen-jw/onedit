import type { RhwpAdapter } from './adapter.js';
import {samePosition,type Position} from './model.js';

type Scalar = 'count'|'length';
type CellProof = {
  focus: Extract<Position,{kind:'cell'}>;
};

/** Existing cursor-model values only; never a retained Core/selection identity. */
export type OwnerList = Readonly<{
  listId:number; isCell:boolean; hostListId:number; sectionIndex:number;
  hostPara:number; controlIndex:number; cellIndex:number; paraCount:number;
  row?:number; col?:number; rowSpan?:number; colSpan?:number; cellCount?:number;
}>;
const base = ['listId','hostListId','sectionIndex','hostPara','controlIndex','cellIndex','paraCount'];
const grid = ['row','col','rowSpan','colSpan','cellCount'];
// Retain at most one validated row array and one equally bounded index.
// This is a structural limit, not a raw-string limit or an estimated JS heap.
const maxOwnerRows = 8192;
// A weak brand identifies only arrays issued after validation; it never keeps retired rows alive.
const issuedOwnerRows = new WeakSet<readonly OwnerList[]>();
const cellKey = (sec:number, host:number, para:number, control:number, cell:number) =>
  `${sec}:${host}:${para}:${control}:${cell}`;
const allowed = new Set([...base,'isCell',...grid]);
const uint = (value:unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function supported(model:any): model is {lists:OwnerList[]} {
  if (!model || !Array.isArray(model.lists) || !uint(model.listCount) ||
      !model.root || Object.keys(model).some(k=>!['listCount','root','lists'].includes(k)) ||
      Object.keys(model.root).some(k=>!['paraCount','topPos','endPara','endPos'].includes(k)) ||
      !['paraCount','topPos','endPara','endPos'].every(k=>uint(model.root[k]))) return false;
  return model.lists.every((row:any)=>row && Object.getPrototypeOf(row) === Object.prototype &&
    Object.keys(row).every(k=>allowed.has(k)) && typeof row.isCell === 'boolean' &&
    base.every(k=>uint(row[k])) &&
    grid.every(k=>row[k] === undefined || uint(row[k])));
}

/** @internal A single existing read fence. No raw-JSON budget expansion, global
 * cache, async lease, ordinal renumbering, IR/resource copy or command verdict.
 * Consumers below are read-only and explicitly receive this projection. */
export class OwnerProjection {
  private adapter: RhwpAdapter | undefined;
  private current: (()=>boolean) | undefined;
  private scope: string;
  private locked: boolean;
  private viewerOnly: string | undefined;
  private rows: readonly OwnerList[] | undefined;
  private index?: Map<string, OwnerList>;
  private lookedUp=false;
  private retired=false;
  private loading=false;
  private scalars?:Partial<Record<Scalar,number>>;
  private loadingScalar=false;
  private nativeRead?:()=>boolean;
  constructor(adapter:RhwpAdapter,current?:()=>boolean,private cell?:CellProof) {
    this.nativeRead=adapter.cursorOwnerReadWitness?.();
    this.adapter=adapter;this.current=current;this.scope=adapter.scope;this.locked=adapter.documentLocked;this.viewerOnly=adapter.viewerOnlyReason;
  }
  isCurrent(adapter=this.adapter):boolean {
    return !this.retired && this.nativeRead?.()!==false && !!adapter && adapter===this.adapter &&
      adapter.scope===this.scope && adapter.documentLocked===this.locked &&
      adapter.viewerOnlyReason===this.viewerOnly && this.current?.()===true;
  }
  /** The first value comes from the same native getter as the cold path.
   * Only the exact proven paragraph can hit, and only in this display scope.
   * Do not memoize a protection result, exception, or any write authority. */
  cellScalar(adapter:RhwpAdapter,key:Scalar,p:Position,read:()=>number):number {
    if(!this.cell||!samePosition(p,this.cell.focus)||!this.isCurrent(adapter))return read();
    if(this.loadingScalar){this.close();return read();}
    const cached=this.scalars?.[key];
    if(cached!==undefined)return cached;
    this.loadingScalar=true;
    try{
      const value=read();
      if(this.nativeRead?.()===false){this.close();return read();}
      if(this.isCurrent(adapter)&&uint(value))(this.scalars??={})[key]=value;
      return value;
    }finally{this.loadingScalar=false;}
  }
  lists(adapter:RhwpAdapter):readonly OwnerList[] {
    if (!this.isCurrent(adapter) || this.loading) {
      this.close();
      return adapter.readOwnerModelFresh().lists;
    }
    if (this.rows) return this.rows;
    this.loading=true;
    try {
      const model=adapter.call('getCursorModel');
      // Preserve the authoritative first result/error. Unsupported responses
      // are never normalized, refused or requested a second time just to cache.
      if (this.nativeRead?.()===false) {this.close();return adapter.readOwnerModelFresh().lists;}
      if (!this.isCurrent(adapter) || !Array.isArray(model?.lists) ||
          model.lists.length > maxOwnerRows || !supported(model)) {
        this.close();return model.lists;
      }
      for (const row of model.lists) Object.freeze(row);
      this.rows=Object.freeze(model.lists);
      issuedOwnerRows.add(this.rows);
      return this.rows;
    } catch (error) {
      this.close();
      throw error;
    } finally { this.loading=false; }
  }
  /** Match the original strict predicate and its first-match order. Only a
   * repeated positional lookup builds the bounded index. Unknown rows still
   * use the original scan, without storing a different owner interpretation. */
  findCell(adapter:RhwpAdapter, rows:readonly OwnerList[], sec:number, host:number,
      para:number, control:number, cell:number):OwnerList|undefined {
    const current = rows === this.rows && this.isCurrent(adapter);
    // Refresh only a retired receipt we actually issued. Malformed or
    // unsupported responses retain the original lookup result or error.
    if (!current && issuedOwnerRows.has(rows)) {
      this.close();
      rows = adapter.readOwnerModelFresh().lists;
    }
    if (current && [sec,host,para,control,cell].every(uint)) {
      if (this.lookedUp && !this.index) {
        const index = new Map<string,OwnerList>();
        for (const row of rows) if (row.isCell && row.row !== undefined) {
          const key = cellKey(row.sectionIndex,row.hostListId,row.hostPara,row.controlIndex,row.cellIndex);
          if (!index.has(key)) index.set(key,row);
        }
        this.index = index;
      }
      this.lookedUp = true;
      if (this.index) return this.index.get(cellKey(sec,host,para,control,cell));
    }
    return rows.find(row => row.isCell && row.row !== undefined && row.sectionIndex === sec &&
      row.hostListId === host && row.hostPara === para && row.controlIndex === control && row.cellIndex === cell);
  }
  close() {
    this.retired=true;this.nativeRead=undefined;this.cell=undefined;this.scalars=undefined;this.rows=undefined;this.index=undefined;this.lookedUp=false;this.adapter=undefined;this.current=undefined;
  }
}
export const ownerLists = (adapter:RhwpAdapter,projection?:OwnerProjection):readonly OwnerList[] =>
  projection ? projection.lists(adapter) : adapter.call('getCursorModel').lists;
