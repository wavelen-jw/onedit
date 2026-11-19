import { rootEditorCoreSha256 } from "./root-editor-core-binding.js";
import { coreRuntimeDispatchEpoch, coreRuntimeScreenInputEpoch } from "./core-runtime.js";
import { isB338OwnerTrialDigest } from "./b338-focused-owner-trial.js";
import { cursorModelMemoEnabled, cursorModelMemoEpoch, cursorModelReadWitness, readCursorModelMemo, screenInputDispatchEpoch, withCursorModelReadTransaction, type CursorModelView, type CursorListRow } from "./cursor-model-memo.js";
import {focusedSelectionKey,withFocusedCellDisplay,type Port as FocusedCellPort,type Request as FocusedRequest,type Stamp as FocusedStamp} from './focused-cell-wire.js';
import {readTablePropertyProjection, type TablePropertyRequest, type TablePropertyProjection} from "./table-property-projection.js";
import { UpdateReads } from './update-reads.js';
import { OwnerProjection } from './owner-projection.js';
import {PassiveOwnerBatchRetired,planPassiveOwnerBatch,withPassiveOwnerRows,type PassiveOwnerBatchPort} from "./passive-owner-batch.js";
import { rootCellAddress, selectionContextScope } from './selection-context-lite.js';
import { localBodyRequest } from "./local-body-edit.js";
import * as positions from "./adapter-position.js";
import { projectSemantic } from "./adapter-semantic.js";
import { exportCheckedHwpx } from "./adapter-save.js";
import { result, invokeCore } from "./adapter-core.js";
import { widthPreviewReads, type WidthEvent, type WidthMethod } from "./width-preview-reads.js";
import {UnsupportedTableOperation} from './table-capability.js';
import {fragmentClipboardObjects} from './object-clipboard.js';
import { prepareMixedCellPictureRemoval } from './mixed-cell-picture.js';
import { cellLayoutKeys, hasCellLayout, validateCellLayout } from "./cell-layout.js";
import type { ListCatalog } from "./paragraph-lists.js";
import { HwpDocument } from "../development/core/rhwp.js";
import { coreRuntimeIdentity, coreRuntimeHasCapability, coreRuntimeHasUpdateReadProvenance, coreRuntimeOwnsCursorMemo, coreRuntimeRequestsCursorMemo, siblingDocument } from "./core-runtime.js";
import {
  type Position,
  type CellBox,
  type Run,
  type Props,
  type Selection,
  type SelectionReference,
  type ParagraphTarget,
  paraIndex,
  withPara,
  cellPath,
  nested,
  sameContainer,
  samePosition,
} from "./model.js";
type RootCell=Extract<Position,{kind:"cell"}>;
type CellPageUpdate = { pages: number[]; pageCount: number; cursor: NavigationRect };
type CellInsertResult = {
  charOffset?: number; logicalOffset?: number;
  cellPageUpdate?: Pick<CellPageUpdate, "pages" | "pageCount">;
  cellCursor?: NavigationRect;
};
type DisplayGridRead=(p:RootCell)=>CellBox[];
type TableDisplayOwner={close:()=>void;validate:(p:Position)=>void;check:(p:Position)=>void;cells?:DisplayGridRead};
type FocusedGrid={target:ParagraphTarget; reference:SelectionReference; generation:number; view:string;
  grid:readonly CellBox[]; history:Readonly<{undoStack:readonly unknown[];redoStack:readonly unknown[]}>};
export { result } from "./adapter-core.js";
export type BodyLayoutControl = {list:number;para:number;ctrlId:string;ctrlCh?:number};
export type BodyLine = { lineIndex: number; lineCount: number; charStart: number; charEnd: number };
export type NavigationRect = { pageIndex: number; x: number; y: number; height: number };
// A table path cannot encode a non-table ancestor (e.g. a shape's text list).
// This is an addressability limit, not a Core rendering failure.
export class UnsupportedTableOwner extends Error {}
const viewQueryMethods = new Set<string>([
  "getCursorModel", "getDocumentInfo", "getPageTextLayout", "getPageControlLayout",
  "getTableCellBboxes",
  "getCharPropertiesAt", "getCellCharPropertiesAt", "getCellCharPropertiesAtByPath",
  "getParaPropertiesAt", "getCellParaPropertiesAt", "getCellParaPropertiesByPath",
  "getCellOwnProperties", "getBodyInlineTables", "getCursorRect", "getCursorRectInCell",
  // Read-only visual-line queries share this projection's layout. In particular,
  // reading line info must not evict the same line edges between styled runs.
  "getLineInfo", "getCursorRectOnLine",
  "getCharShapeRuns", "getCharShapeRunsInCellByPath",
  "getCursorRectInCellByPath", "captureCellParagraphPath", "resolveCellParagraphPath",
  "validateCellParagraphPath", "getNumberingList", "getBulletList",
  "getControls", "getControlTextPositions", "getPictureProperties",
  // Reviewed JSON-valued read methods. Existing localLayoutReads still completes
  // pending flow before caching. Each result is reparsed for its consumer.
  "getPageInfo", "getCaretStops", "getCharIndexAtStreamPos", "getColumnDef",
  "getParaShapeSet", "getObjects", "getPageHide",
]);
// Existing Adapter/SDK readers that promise current whole-layout information.
// A local BODY result does not authenticate a focused-page patch for them.
const localLayoutReads = new Set<string>([
  "getDocumentInfo", "getPageInfo", "getPageSizeRuns", "getPageTextLayout", "getPageControlLayout",
  "getCursorModel", "getTableCellBboxes", "getTableCellBboxesByPath",
  "getCursorRect", "getCursorRectInCell", "getCursorRectInCellByPath",
  "getLineInfo", "getCursorRectOnLine",
]);
const updateReadMethods = new Set(['getPageInfo','getCaretStops','getCharIndexAtStreamPos','getColumnDef','getParaShapeSet','getObjects','getPageHide','getTextFileUnicode']);
export class RhwpAdapter {
  // Internal read fence, not an exposed Core layout epoch/certificate.
  private updateReadEpoch = 0;
  private updateReadDpi = 96;
  private presentationDepth = 0;
  private dpiReceipt?: {doc: HwpDocument; epoch: number; native?:number; value: number};
  /** Actual native DPI, shared only inside a non-yielding owned read scope. */
  presentationDpi(): number {
    const r=this.dpiReceipt;
    const native=this.nativeMutationGeneration();
    if(this.presentationDepth && r?.doc===this.doc && r.epoch===this.updateReadEpoch && r.native===native)return r.value;
    const value=this.doc.getDpi();
    if(this.presentationDepth)this.dpiReceipt={doc:this.doc,epoch:this.updateReadEpoch,native,value};
    this.updateReadDpi=value;return value;
  }
  presentationFlag(method: 'getShowParagraphMarks'|'getShowControlCodes'|'getShowTransparentBorders'): boolean {
    if(!this.presentationDepth)return this.doc[method]();
    return this.updateReads.read(method,[],()=>Number(this.doc[method]()))===1;
  }
  private updateReads = new UpdateReads(() => ({doc:this.doc,documentId:this.documentId,
    revision:this.revision,epoch:this.updateReadEpoch,native:this.nativeMutationGeneration(),environment:this.localBodyEnvironment?.(),
    transient:this.transientEdit,dpi:this.updateReadDpi}));
  /** @internal Read-only synchronous presentation; never retained across events. */
  withUpdateReads<T>(read: () => T, current?:()=>boolean): T {
    if(!this.heightCandidateIdentified || !coreRuntimeHasUpdateReadProvenance(this.doc) ||
      this.hasUnobservableCursorOwner())return read();
    this.presentationDepth++;
    try { return this.updateReads.with(() => this.withViewQueries(read,current)); }
    finally { if(!--this.presentationDepth)this.dpiReceipt=undefined; }
  }
  /** @internal Function-local line receipt only, after the existing page read.
   * No native layout lease and no completion bypass. Unknown/pending/live IME
   * states get the original getter path. Active UI DPI writes invalidate first;
   * this non-yielding pass has no async native/user callback boundary. */
  withBodyLineReadFence<T>(read: (current?: () => boolean) => T): T {
    if (!this.heightCandidateIdentified ||
        !coreRuntimeHasUpdateReadProvenance(this.doc) ||
        this.pendingLocalBody || this.transientEdit || this.localBodyEnvironment?.() === undefined)
      return read();
    return this.withUpdateReads(() => { this.presentationDpi(); return this.updateReads.with(key => {
      let open = true;
      const current = () => open && !this.pendingLocalBody && !this.transientEdit &&
        this.heightCandidateIdentified &&
        coreRuntimeHasUpdateReadProvenance(this.doc) &&
        this.updateReads.isCurrent(key);
      try { return read(current); } finally { open = false; }
    }); });
  }
  /** Internal presentation read; selection serial is owned by Interaction. */
  tablePropertyProjection(request:TablePropertyRequest, currentSelectionGeneration:()=>number, prior?:TablePropertyProjection) {
    if (this.pendingLocalBody || this.hasUnobservableCursorOwner()) return {status:"unavailable"} as const;
    return readTablePropertyProjection(this,request,()=>[this.doc,this.documentId,this.revision,this.updateReadEpoch,
      currentSelectionGeneration(),this.localBodyEnvironment?.(),this.transientEdit,this.scope,this.documentLocked,this.viewerOnlyReason,this.nativeMutationGeneration(),this.pendingLocalBody,this.updateReadDpi],prior);
  }
  private ownerReadScope?: { projection?: OwnerProjection };
  /** @internal Synchronous, read-only owner publication. A may pass the
   * existing Interaction projection to share it with positional readers.
   * Keep command admission, DOM callbacks, await and writes outside this scope. */
  withOwnerReads<T>(read: () => T, existing?: OwnerProjection): T {
    const outer = this.ownerReadScope;
    const use = (projection?: OwnerProjection) => {
      this.ownerReadScope = { projection };
      try { return read(); }
      catch (error) { projection?.close(); outer?.projection?.close(); throw error; }
      finally { this.ownerReadScope = outer; }
    };
    // A recursive publisher cannot borrow or create a second active receipt.
    if (outer) return use();
    if (existing) return use(existing.isCurrent(this) ? existing : undefined);
    return this.withBodyLineReadFence(current => {
      const own = current?.() ? new OwnerProjection(this, current) : undefined;
      try { return use(own); } finally { own?.close(); }
    });
  }
  /** @internal Authoritative owner fallback, bypassing only the old raw JSON
   * cache. Keep the existing pending-layout completion before the same query. */
  readOwnerModelFresh() {
    if (this.pendingLocalBody) this.completeLocalBodyFlow();
    return result(invokeCore(this.doc, 'getCursorModel', []));
  }
  private menuSelectionContext?: ReturnType<typeof selectionContextScope>;
  /** @internal Only the two menu display readers are in this non-yielding scope. */
  withMenuSelectionContext<T>(focus: Position, live:()=>boolean,
      read:(check?: (p:Position)=>void, validate?: (p:Position)=>void)=>T, nativeEnabled = false):T {
    const anchor=rootCellAddress(focus);
    if (this.menuSelectionContext) {this.menuSelectionContext.close();return read();}
    if (!anchor || this.scope!=="edit" || this.documentLocked || this.viewerOnlyReason) return read();
    return this.withBodyLineReadFence(current=>{
      if (!current?.() || !live()) return read();
      const doc=this.doc, id=this.documentId, rev=this.revision;
      const native = nativeEnabled && isB338OwnerTrialDigest(coreRuntimeIdentity(doc)?.sha256) &&
        typeof doc.oneditSelectionTargetContextLiteV1==="function" ? doc.oneditSelectionTargetContextLiteV1.bind(doc) : undefined;
      const slot=selectionContextScope(anchor,()=>current() && live() && this.doc===doc &&
        this.documentId===id && this.revision===rev && this.scope==="edit" && !this.documentLocked && !this.viewerOnlyReason,native);
      this.menuSelectionContext=slot;
      try { return read(
        p=>slot.valid() ? this.checkEditable(p,true,true) : this.assertEditable(p),
        p=>this.validate(p,true,slot.valid()),
      ); }
      finally { slot.close();this.menuSelectionContext=undefined; }
    });
  }
  /** @internal validate() only. Never returns list IDs or command admission. */
  validateMenuCellOwner(p:Extract<Position,{kind:"cell"}>):boolean {
    return this.menuSelectionContext?.validateOwner(p,()=>this.list(p))===true;
  }
  /** @internal One passive table-menu reason. Retain only successful
   * list(p) membership for the exact paragraph/offset, never the list or
   * a permission verdict. Native ref resolution and all scalar checks stay. */
  openPerf4TableReasonOwner(focus:RootCell,current:()=>boolean):TableDisplayOwner|undefined {
    const fence=this.tablePreviewFence(), anchor={...focus};
    let open=true, reading=false, first=false, reusable=false;
    const close=()=>{open=false;reusable=false;};
    const live=(p:Position)=>open && !this.ownerReadScope && !this.menuSelectionContext &&
      p.kind==="cell" && !nested(p) && samePosition(anchor,p) && current() && fence();
    if(!live(focus))return;
    const membership=(p:RootCell)=>{
      if(!live(p)||reading){close();return false;}
      if(first){
        const hit=reusable;
        close(); // At most one substitution; no second consumer or reason.
        return hit;
      }
      first=true;
      reading=true;
      try {
        const row=this.list(p,false); // The original full lookup and first-match validation.
        reusable=live(p) && row?.isCell===true && row.hostListId===0 &&
          row.sectionIndex===p.sec && row.hostPara===p.para && row.controlIndex===p.control &&
          row.cellIndex===p.cell && row.rowSpan===1 && row.colSpan===1;
        return true; // This call already performed list(p), even if not reusable.
      } catch(error) {close();throw error;}
      finally {reading=false;}
    };
    return {
      close,
      validate:p=>positions.validate.call(this,p,true,false,membership),
      check:p=>live(p) ? this.checkEditable(p,false,false,membership) : this.assertEditable(p),
    };
  }
  /** @internal Freeze native/derived generation without a new native read. */
  tablePreviewFence() {
    const doc=this.doc,id=this.documentId,rev=this.revision,epoch=this.updateReadEpoch;
    const env=this.localBodyEnvironment?.(),dpi=this.updateReadDpi,native=this.nativeMutationGeneration();
    return ()=>env!==undefined && this.doc===doc && !this.hasUnobservableCursorOwner() && this.documentId===id && this.revision===rev &&
      this.updateReadEpoch===epoch && this.nativeMutationGeneration()===native && this.localBodyEnvironment?.()===env && this.updateReadDpi===dpi &&
      !this.transientEdit && !this.pendingLocalBody;
  }
  /** Three exact matched &self getters; the generic call fence is untouched.
   * No pending work may be completed or model data retained by this producer. */
  openWidthPreviewInputs(ownerCurrent:()=>boolean, observe?:(event:WidthEvent)=>void) {
    const doc=this.doc, fence=this.tablePreviewFence();
    if (!this.heightCandidateIdentified || !coreRuntimeHasUpdateReadProvenance(doc) ||
        !isB338OwnerTrialDigest(coreRuntimeIdentity(doc)?.sha256) ||
        !fence() || !ownerCurrent()) return;
    return widthPreviewReads(
      ()=>fence()&&ownerCurrent(),
      (method,args)=>invokeCore(doc,method,args),
      result,
      <T>(method:WidthMethod,...args:number[])=>this.call<T>(method,...args),
      observe,
    );
  }
  /** @internal Display-only, explicit owner receipt; no installation into general validate/list. */
  tablePreviewOwner(focus: Position, live:()=>boolean,useNative=true, focused?:FocusedGrid):TableDisplayOwner|undefined {
    const anchor=rootCellAddress(focus), doc=this.doc;
    const fence=this.tablePreviewFence(), env=this.localBodyEnvironment?.();
    if (!anchor || anchor.sectionIndex!==0 || env===undefined || this.transientEdit || this.pendingLocalBody ||
        this.scope!=="edit" || this.documentLocked || this.viewerOnlyReason || !this.heightCandidateIdentified ||
        !isB338OwnerTrialDigest(coreRuntimeIdentity(doc)?.sha256) ||
        typeof doc.oneditSelectionTargetContextLiteV1!=="function" ||
        this.readStructural('getSectionCount')!==1) return;
    const focusedPort=useNative&&focused?this.focusedCellPortFor?.(doc):undefined;
    if(focusedPort&&focused&&focus.kind==="cell")
      return this.focusedTableDisplayOwner(focus,live,focusedPort,focused);
    const slot=selectionContextScope(anchor,()=>fence() &&
      !this.transientEdit && !this.pendingLocalBody && this.scope==="edit" && !this.documentLocked && !this.viewerOnlyReason && live(),
      useNative?doc.oneditSelectionTargetContextLiteV1.bind(doc):undefined);
    const owner=(p:Extract<Position,{kind:"cell"}>)=>slot.validateOwner(p,()=>this.list(p,false));
    return {
      close:slot.close,
      validate:(p:Position)=>positions.validate.call(this,p,true,false,owner),
      check:(p:Position)=>slot.valid() ? this.checkEditable(p,false,false,owner) : this.assertEditable(p),
    };
  }
  private focusedReading?:{retired:boolean};
  private focusedTableDisplayOwner(p:RootCell,live:()=>boolean,port:FocusedCellPort,f:FocusedGrid):TableDisplayOwner|undefined {
    if(this.focusedReading){this.focusedReading.retired=true;return;}
    const doc=this.doc,position={...p},fence=this.tablePreviewFence(),active={retired:false};
    const {target,reference,generation,view,history,grid}=f;
    const selected=grid.find(c=>c.cellIdx===position.cell);
    if(!selected||target.path.length!==1||!target.targetId||!fence()||!live())return;
    const hop=target.path[0];
    if(target.sectionIndex!==0||target.parentParaIndex!==position.para||
      hop.controlIndex!==position.control||hop.cellIndex!==position.cell||hop.cellParaIndex!==position.cellPara)return;
    const req:FocusedRequest={section:0,paragraph:position.para,offset:position.offset,path:[{...hop}],expectedTargetId:target.targetId};
    const key=focusedSelectionKey(req);
    let open=true;
    const valid=()=>open=open&&!active.retired&&fence()&&this.scope==="edit"&&!this.documentLocked&&!this.viewerOnlyReason&&
      live()&&port.owns(doc);
    const capture=():FocusedStamp|undefined=>valid()?{
      doc,documentId:this.documentId,reference,safe:true,revision:this.revision,readEpoch:this.updateReadEpoch,
      selectionGeneration:generation,viewAndFont:JSON.stringify([view,this.localBodyEnvironment?.()]),dpi:this.updateReadDpi,
      selectionKey:key,targetId:target.targetId,undoTop:history.undoStack.at(-1),redoTop:history.redoStack.at(-1),
      undoDepth:history.undoStack.length,redoDepth:history.redoStack.length
    }:undefined;
    this.focusedReading=active;
    let known;
    try{known=withFocusedCellDisplay(port,capture,capture(),req,read=>read());}
    finally{this.focusedReading=undefined;}
    if(!known||!valid()||known.grid.cellCount!==grid.length||known.grid.row!==selected.row||known.grid.col!==selected.col)return;
    const owner=(x:RootCell)=>valid()&&samePosition(x,position);
    return {
      close:()=>{open=false;},
      validate:(x:Position)=>positions.validate.call(this,x,true,false,owner),
      check:(x:Position)=>valid()?this.checkEditable(x,false,false,owner):this.assertEditable(x),
      // Only bypass the duplicate structure list() read. Current bbox is
      // always read by the old geometry getter; no cached geometry is used.
      cells:(x:RootCell)=>owner(x)?this.call("getTableCellBboxes",x.sec,x.para,x.control):this.cells(x),
    };
  }
  /** @internal Source-only adapter seam. No default verified port exists. */
  private currentPassiveOwnerBatch():PassiveOwnerBatchPort|undefined {
    return this.passiveBatchFor?.(this.doc) ?? this.passiveBatch;
  }
  passiveOwnerBatchAvailable():boolean {
    try {return this.heightCandidateIdentified && this.currentPassiveOwnerBatch()?.owns(this.doc)===true;}
    catch{return false;}
  }
  private passiveBatchActive?:{retired:boolean};
  checkPassiveTableCells(focus:Extract<Position,{kind:"cell"}>, grid:readonly CellBox[], current:()=>boolean) {
    const legacy=()=>{for(const c of grid)this.assertEditable({...focus,cell:c.cellIdx,cellPara:0,offset:0});};
    if(this.passiveBatchActive){this.passiveBatchActive.retired=true;return legacy();}
    if(!this.passiveOwnerBatchAvailable() || !current() || this.ownerReadScope || this.menuSelectionContext ||
        this.scope!=="edit" || this.documentLocked || this.viewerOnlyReason || this.hasCurrentCursorModelRead()) return legacy();
    const plan=planPassiveOwnerBatch(focus,grid), port=this.currentPassiveOwnerBatch(), doc=this.doc;
    if(!plan||!port)return legacy();
    const fence=this.tablePreviewFence(), active={retired:false};
    const live=()=>!active.retired && !this.ownerReadScope && !this.menuSelectionContext && fence() && current() &&
      this.scope==="edit" && !this.documentLocked &&
      !this.viewerOnlyReason && this.passiveOwnerBatchAvailable();
    this.passiveBatchActive=active;
    try {return withPassiveOwnerRows(plan,live,input=>port.read(doc,input),has=>{
      // A callback which invalidated the view must not reuse the old grid,
      // even on the legacy path. The menu retries once with the current selection.
      if(!fence()||!current())throw new PassiveOwnerBatchRetired();
      if(!has)return legacy();
      for(const p of plan.positions){
        if(!fence()||!current())throw new PassiveOwnerBatchRetired();
        if(has(p))this.checkEditable(p,false,false,has);
        else this.assertEditable(p);
      }
      if(!fence()||!current())throw new PassiveOwnerBatchRetired();
    });}finally{this.passiveBatchActive=undefined;}
  }
  invalidateUpdateReads() {
    this.menuSelectionContext?.close();
    this.ownerReadScope?.projection?.close();
    this.updateReadEpoch++;this.updateReads.invalidate();this.dpiReceipt=undefined;
    this.viewQueries?.clear();this.viewQueryUnits=0;
  }
  readStructural<T extends 'getSectionCount'|'getParagraphCount'|'getParagraphLength'|'getLogicalLength'|'getTextRange'|'logicalToTextOffset'|'textToLogicalOffset'>(method:T,...args:number[]):ReturnType<HwpDocument[T]> {
    const read=()=> (this.doc[method] as Function).apply(this.doc,args) as number|string;
    // Only this independently proven immutable bundle uses the private read scope.
    const bound=this.heightCandidateIdentified && coreRuntimeHasUpdateReadProvenance(this.doc);
    if (bound && (method === 'logicalToTextOffset' || method === 'textToLogicalOffset')) {
      const identity = this.updateReads.bodyOffsetIdentity(args,
        () => this.doc.getLogicalLength(args[0], args[1]),
        () => this.doc.getParagraphLength(args[0], args[1]));
      if (identity !== undefined) return identity as ReturnType<HwpDocument[T]>;
    }
    return (bound ? this.updateReads.read(method,args,read) : read()) as ReturnType<HwpDocument[T]>;
  }

  // One synchronous UI projection only. Cache raw JSON so consumers cannot
  // mutate a value another control reads; never retain queries across events.
  nativeMutationGeneration(): number|undefined {
    return coreRuntimeOwnsCursorMemo(this.doc) ? cursorModelMemoEpoch(this.doc) : coreRuntimeDispatchEpoch(this.doc);
  }
  private hasUnobservableCursorOwner(): boolean {
    return !coreRuntimeOwnsCursorMemo(this.doc) &&
      (this.requiresCursorMemoOwner || cursorModelMemoEnabled(this.doc));
  }
  // An unowned enrollment is not proof of alias coverage. It cannot issue an
  // owner receipt; the untouched M-off path keeps its existing read fences.
  cursorOwnerReadWitness(): (()=>boolean)|undefined {
    const doc=this.doc;
    if (!coreRuntimeOwnsCursorMemo(doc)) return this.hasUnobservableCursorOwner() ? ()=>false : undefined;
    const witness=cursorModelReadWitness(doc);
    return ()=>this.doc===doc&&witness?.()===true;
  }
  private viewQueries?: Map<string, string>;
  private viewQueryUnits=0;
  private viewCursorMemoEpoch?:number;
  private viewQueryOwner?: readonly unknown[];
  private viewQueryCurrent?:()=>boolean;
  private currentViewQueries() {
    const map=this.viewQueries;if(!map||this.hasUnobservableCursorOwner()||this.viewQueryCurrent&&!this.viewQueryCurrent())return;
    const owner=[this.doc,this.documentId,this.revision,this.updateReadEpoch,this.localBodyEnvironment?.(),this.transientEdit,this.nativeMutationGeneration()];
    if(!this.viewQueryOwner || owner.some((v,i)=>v!==this.viewQueryOwner![i])){
      map.clear();this.viewQueryUnits=0;this.viewQueryOwner=owner;
    }
    return map;
  }
  /** @internal Query the existing exact-generation raw hit. No native reads. */
  hasCurrentCursorModelRead(): boolean {
    const queries=this.currentViewQueries();
    return queries?.has(JSON.stringify(["getCursorModel",[]]))===true &&
      (!cursorModelMemoEnabled(this.doc)||this.viewCursorMemoEpoch===cursorModelMemoEpoch(this.doc));
  }
  /** A cell Apply's page job and display writer must own different scopes.
   * Reentrant callers use the established conservative path; never replace a
   * live scope or restart a retired one from a nested consumer. */
  canSplitCellApplyReads(): boolean {
    return coreRuntimeOwnsCursorMemo(this.doc) && !this.viewQueries && !this.presentationDepth &&
      !this.pendingLocalBody && !this.transientEdit && this.scope==="edit" &&
      !this.documentLocked && !this.viewerOnlyReason;
  }
  /** Only for the page-job/display join, not a cursor memo or write lease. */
  cellApplyScreenInputs(): (()=>boolean)|undefined {
    const doc=this.doc,id=this.documentId,rev=this.revision,native=screenInputDispatchEpoch(doc),
      dpi=this.updateReadDpi,env=this.localBodyEnvironment?.(),pending=this.pendingLocalBody;
    if(!coreRuntimeOwnsCursorMemo(doc)||native===undefined||env===undefined||pending||this.transientEdit)return;
    return ()=>this.doc===doc&&this.documentId===id&&this.revision===rev&&
      screenInputDispatchEpoch(doc)===native&&this.updateReadDpi===dpi&&this.localBodyEnvironment?.()===env&&
      this.pendingLocalBody===pending&&!this.transientEdit;
  }
  /** Read-only QA mirror; does not query Core or claim a new current DPI. */
  observedLocalBodyEnvironment(): string|undefined {
    const epoch=this.localBodyEnvironment?.();
    return epoch===undefined?undefined:JSON.stringify([this.updateReadDpi,epoch]);
  }
  cellApplyDisplayFence(current:()=>boolean): (()=>boolean)|undefined {
    if(!this.canSplitCellApplyReads()||!current())return;
    const doc=this.doc,id=this.documentId,revision=this.revision,native=this.nativeMutationGeneration(),
      dpi=this.updateReadDpi,environment=this.localBodyEnvironment?.();
    if(native===undefined||environment===undefined)return;
    return ()=>this.doc===doc&&this.documentId===id&&this.revision===revision&&
      this.nativeMutationGeneration()===native&&this.updateReadDpi===dpi&&this.localBodyEnvironment?.()===environment&&
      !this.pendingLocalBody&&!this.transientEdit&&this.scope==="edit"&&!this.documentLocked&&!this.viewerOnlyReason&&current();
  }
  withViewQueries<T>(read: () => T, current?:()=>boolean): T {
    if (this.viewQueries) return read();
    this.viewQueries = new Map();this.viewQueryUnits=0;this.viewQueryOwner=undefined;this.viewQueryCurrent=current;
    try {
      return coreRuntimeOwnsCursorMemo(this.doc) ? withCursorModelReadTransaction(this.doc,read,current) : read();
    } finally { this.viewQueries = undefined;this.viewQueryOwner=undefined;this.viewQueryUnits=0;this.viewQueryCurrent=undefined; }
  }
  doc: HwpDocument;
  documentId = crypto.randomUUID();
  documentLocked = false;
  revision = 0;
  // An uncommitted live IME transaction must not be exported or replaced.
  transientEdit = false;
  savedRevision = 0;
  scope: "edit" | "readonly" = "edit";
  viewerOnlyReason: string | undefined;
  #runtime: ReturnType<typeof coreRuntimeIdentity>;
  #runtimeReplaced = false;
  readonly localBodyTextEnabled: boolean;
  private readonly localBodyEnvironment?: () => string | number;
  private readonly requiresCursorMemoOwner: boolean;
  private pendingLocalBody?: HwpDocument;
  private readonly passiveBatch?:PassiveOwnerBatchPort;
  private readonly focusedCellPortFor?:(doc:HwpDocument)=>FocusedCellPort|undefined;
  private readonly passiveBatchFor?:(doc:HwpDocument)=>PassiveOwnerBatchPort|undefined;
  constructor(doc?: HwpDocument, options: {localBodyText?: boolean; localBodyEnvironment?: () => string | number;
      passiveOwnerBatch?:PassiveOwnerBatchPort; passiveOwnerBatchFor?:(doc:HwpDocument)=>PassiveOwnerBatchPort|undefined;
      focusedCellPortFor?:(doc:HwpDocument)=>FocusedCellPort|undefined} = {}) {
    this.passiveBatch=options.passiveOwnerBatch;
    this.passiveBatchFor=options.passiveOwnerBatchFor;
    this.focusedCellPortFor=options.focusedCellPortFor;
    this.localBodyTextEnabled = options.localBodyText === true;
    this.localBodyEnvironment = options.localBodyEnvironment;
    this.doc = doc ?? HwpDocument.createEmpty();
    this.requiresCursorMemoOwner = coreRuntimeOwnsCursorMemo(this.doc) || coreRuntimeRequestsCursorMemo();
    if (!doc) result(this.doc.createBlankDocument());
    this.#runtime = coreRuntimeIdentity(this.doc);
  }
  get heightCandidateIdentified(): boolean {
    // Identity grants no extra selection or geometry capability.
    const current = coreRuntimeIdentity(this.doc);
    if (current !== this.#runtime) this.#runtimeReplaced = true;
    return !this.#runtimeReplaced && current !== undefined && coreRuntimeHasCapability(this.doc, "cell-height");
  }
  get localBodyTextIdentified(): boolean {
    // Only the reviewed2743 loader binding grants this private capability.
    // Unknown/unbound/replaced documents retain the original command path.
    return this.localBodyTextEnabled && this.heightCandidateIdentified &&
      coreRuntimeHasCapability(this.doc, "local-body-text");
  }
  get widthContentFrameIdentified(): boolean {
    // This one fixed cumulative runtime authenticates plain width-reflow
    // growth internally. It grants no capability to another runtime/owner.
    return this.heightCandidateIdentified && coreRuntimeHasCapability(this.doc, "width-content-frame");
  }
  get quantizedHeightCandidateIdentified(): boolean {
    // This matched runtime authenticates the source-derived full row vector
    // before and after mutation. Identity alone grants no owner/frame scope.
    return this.heightCandidateIdentified && coreRuntimeHasCapability(this.doc, "quantized-height");
  }
  get naturalHeightCandidateIdentified(): boolean {
    // Only this fixed runtime authenticates every stored text/padding floor.
    // A stale common envelope is not proof that the visible rows are compressed.
    return this.heightCandidateIdentified && coreRuntimeHasCapability(this.doc, "natural-height");
  }
  get wholeHeightCandidateIdentified(): boolean {
    // Only this independently matched cumulative runtime forward-certifies
    // complete-table vectors and retains declarations on content-floor rows.
    return this.heightCandidateIdentified && coreRuntimeHasCapability(this.doc, "whole-height");
  }
  get mergedGridCandidateIdentified(): boolean {
    // Identity authenticates only this additive, independently verified runtime.
    // The UI plan still proves the exact closed grid/selection/frame each time.
    return this.heightCandidateIdentified && coreRuntimeHasCapability(this.doc, "merged-grid");
  }
  /** Complete advisory unchanged-flow pagination at synchronous global boundaries.
   * saveSnapshot clones current canonical IR, not page trees; restore repaginates.
   * Current geometry/SVG still comes from Core's refreshed normalization, never JS. */
  completeLocalBodyFlow() {
    if (!this.pendingLocalBody) return;
    if (this.pendingLocalBody !== this.doc) { this.pendingLocalBody = undefined; return; }
    this.viewQueries?.clear();
    this.invalidateUpdateReads();
    const completed = result(this.doc.flushDeferredPagination());
    if (completed.ok !== true || !["complete", "fallback"].includes(completed.status))
      throw Error("Local BODY pagination completion was not established");
    this.pendingLocalBody = undefined;
  }
  hasPendingLocalBodyFlow():boolean { return !!this.pendingLocalBody; }
  localBodyEnvironmentToken(includeReadEpoch=false): string | undefined {
    const epoch = this.localBodyEnvironment?.();
    return epoch === undefined ? undefined : JSON.stringify(includeReadEpoch
      ? [this.presentationDpi(),epoch,this.updateReadEpoch] : [this.presentationDpi(),epoch]);
  }
  tryReplaceLocalBody(from: Position, to: Position, text: string): Position | undefined {
    const request = localBodyRequest(this, from, to, text);
    if (!request) return;
    if (!request.deleted && !request.count) return { ...from };
    const r = this.call("replaceBodyTextLocal", from.sec, from.para, request.start, request.deleted, text);
    if (r.charOffset !== request.start + request.count || typeof r.flowChanged !== "boolean" ||
        typeof r.documentPaginationPending !== "boolean" || r.flowChanged === r.documentPaginationPending)
      throw Error("Local BODY result does not certify the requested scalar edit");
    this.pendingLocalBody = r.documentPaginationPending ? this.doc : undefined;
    const next = { ...from, offset: this.logical(from, r.charOffset) };
    this.validate(next);
    return next;
  }
  open(bytes: Uint8Array) {
    if (this.transientEdit) throw Error("한글 조합을 확정하거나 취소한 뒤 문서를 여세요.");
    this.completeLocalBodyFlow();
    const candidate = siblingDocument(this.doc, bytes);
    try {
      result(candidate.getDocumentInfo());
    } catch (e) {
      candidate.free();
      throw e;
    }
    const locked = result<any[]>(candidate.getControls()).some(
      (c) => c.props?.Lock,
    );
    this.doc.free();
    this.doc = candidate;
    this.documentLocked = locked;
    this.scope = locked ? "readonly" : "edit";
    this.viewerOnlyReason = undefined;
    this.documentId = crypto.randomUUID();
    this.revision = 0;
    this.savedRevision = 0;
  }
  private readCursorMemo(doc:HwpDocument, immutable:boolean) {
    const packet=readCursorModelMemo(doc,()=>this.doc===doc&&!this.pendingLocalBody&&!this.transientEdit&&
      this.scope==="edit"&&!this.documentLocked&&!this.viewerOnlyReason
      ? [this.documentId,this.revision,this.localBodyEnvironment?.(),this.scope,this.documentLocked,this.viewerOnlyReason]
      : undefined,immutable,()=>invokeCore(doc,"getCursorModel",[]));
    // Preserve the existing P cache's independent hit/admission contract; M's
    // larger single-entry budget does not widen P or claim a P hit for A32.
    const queries=this.currentViewQueries(), key=JSON.stringify(["getCursorModel",[]]);
    const epoch=cursorModelMemoEpoch(doc), old=queries?.get(key);
    if(queries&&old!==undefined&&(!packet.admitted||this.viewCursorMemoEpoch!==epoch)){
      queries.delete(key);this.viewQueryUnits-=old.length;
    }
    if(queries&&!queries.has(key)&&packet.admitted&&queries.size<256&&
      this.viewQueryUnits+packet.raw.length<=65536){
      queries.set(key,packet.raw);this.viewQueryUnits+=packet.raw.length;this.viewCursorMemoEpoch=epoch;
    }
    return packet.value;
  }
  /** @internal Only adapter-position's read-only structural lookups. */
  readCursorModelForLookup(): CursorModelView {
    if(!coreRuntimeOwnsCursorMemo(this.doc)||this.pendingLocalBody||this.transientEdit)
      return this.call("getCursorModel");
    return this.readCursorMemo(this.doc,true);
  }
  call<T = any>(method: keyof HwpDocument, ...args: any[]): T {
    // Keep the old geometry-query invalidation unchanged. These additional
    // source-reviewed read calls preserve ONLY structural/count/text values.
    if (!viewQueryMethods.has(String(method)) && !updateReadMethods.has(String(method))) this.invalidateUpdateReads();
    if (method === "restoreSnapshot") {
      // Restore discards the current derived generation. Never require a
      // failed/pending preview to paginate before its rollback can execute.
      const pending = this.pendingLocalBody;
      this.pendingLocalBody = undefined;
      this.viewQueries?.clear();
      try { return result<T>(invokeCore(this.doc, method, args)); }
      catch (error) { this.pendingLocalBody = pending; throw error; }
    }
    // Reads use current authoritative Core output. Unsupported writes and global
    // completion boundaries cannot carry an advisory local-flow state forward.
    if (this.pendingLocalBody && method !== "replaceBodyTextLocal" &&
        (localLayoutReads.has(String(method)) ||
         !/^(get|capture|resolve|validate|logical|textOffset)/.test(String(method))))
      this.completeLocalBodyFlow();
    if(method==="getCursorModel"&&args.length===0&&coreRuntimeOwnsCursorMemo(this.doc))
      return this.readCursorMemo(this.doc,false);
    if (method === "getCursorRectInCell" || method === "getTableCellBboxes") {
      const reads = this.currentCellReads();
      if (reads) {
        const key = JSON.stringify(args);
        const cached = reads.geometry.get(method);
        if (cached?.key === key) return result<T>(cached.raw);
        const raw = invokeCore(this.doc, method, args);
        const value = result<T>(raw);
        if (raw.length <= 65536 && reads === this.currentCellReads())
          reads.geometry.set(method, {key, raw});
        return value;
      }
    }
    const queries = this.currentViewQueries();
    const cacheable = typeof method === 'string' && viewQueryMethods.has(method) &&
      (!updateReadMethods.has(method) || this.heightCandidateIdentified && coreRuntimeHasUpdateReadProvenance(this.doc));
    if (queries && !cacheable) { queries.clear();this.viewQueryUnits=0; }
    const key = queries && cacheable ? JSON.stringify([method, args]) : undefined;
    let raw = key === undefined ? undefined : queries!.get(key);
    if (raw === undefined) {
      const native = this.nativeMutationGeneration();
      raw = invokeCore(this.doc, method, args);
      const value = result<T>(raw!);
      // No unbounded geometry/JSON retention. Oversized reads stay fresh without
      // evicting unrelated certified metadata. Same 256/65536 limits as UpdateReads.
      if (key !== undefined && native===this.nativeMutationGeneration() && queries!.size < 256 && raw!.length+this.viewQueryUnits <= 65536) {
        queries!.set(key, raw!);this.viewQueryUnits+=raw!.length;
      }
      return value;
    }
    return result<T>(raw);
  }
  path(p: Position) {
    return positions.path.call(this, p);
  }
  fromPath(
    sec: number,
    para: number,
    path: import("./model.js").CellPathEntry[],
    offset: number,
  ): Position {
    return positions.fromPath.call(this, sec, para, path, offset);
  }
  /** Effective border read from the already admitted W802e click grid.
   * Pure native table properties; no generic dispatcher whitelist change. */
  readClickedTableGuideBorders(p:RootCell,cell:number) {
    return result<Record<string,{type:number}>>(this.doc.getCellProperties(p.sec,p.para,p.control,cell));
  }
  captureParagraph(p: Position): ParagraphTarget {
    return positions.captureParagraph.call(this, p);
  }
  resolveParagraph(target: ParagraphTarget): ParagraphTarget {
    return positions.resolveParagraph.call(this, target);
  }
  clipboardTarget(p: Position) {
    return positions.clipboardTarget.call(this, p);
  }
  clipboardInsertedPosition(t: ParagraphTarget): Position {
    return positions.clipboardInsertedPosition.call(this, t);
  }
  captureSelection(selection: Selection): SelectionReference {
    return positions.captureSelection.call(this, selection);
  }
  resolveSelection(ref: SelectionReference, observeFocus?: (target:ParagraphTarget)=>void): Selection {
    return positions.resolveSelection.call(this, ref, observeFocus);
  }
  // Resolve only the active cell during an ordinary typing event. The row
  // expires on every native write and at the end of the synchronous event.
  private typingCellOwner?: {
    doc: HwpDocument; key: string; epoch?: number; row?: CursorListRow;
  };
  withTypingCellOwner<T>(p: RootCell, read: () => T): T {
    const doc=this.doc;
    if (this.typingCellOwner || this.scope!=="edit" || this.transientEdit ||
        this.documentLocked || this.viewerOnlyReason ||
        coreRuntimeIdentity(doc)?.sha256!==rootEditorCoreSha256 ||
        typeof doc.oneditCursorOwnerRowsBatchV1!=="function" || this.nativeMutationGeneration()===undefined)
      return read();
    this.typingCellOwner={doc,key:JSON.stringify([p.sec,p.para,cellPath(p)])};
    try { return read(); }
    finally { this.typingCellOwner=undefined; }
  }
  private readTypingCellOwner(p: Position): CursorListRow | undefined {
    const scope=this.typingCellOwner;
    if (!scope || p.kind!=="cell" || scope.doc!==this.doc || this.pendingLocalBody || this.transientEdit ||
        this.scope!=="edit" || this.documentLocked || this.viewerOnlyReason) return;
    const path=cellPath(p);
    if (scope.key!==JSON.stringify([p.sec,p.para,path])) return;
    const epoch=this.nativeMutationGeneration();
    if (epoch===undefined) return;
    if (scope.epoch===epoch) return scope.row;
    scope.epoch=epoch;
    scope.row=undefined;
    try {
      const reply=JSON.parse(scope.doc.oneditCursorOwnerRowsBatchV1(
        JSON.stringify({targets:[{section:p.sec,paragraph:p.para,path}]})));
      const row=reply.status==="ok" && reply.rows?.length===1 ? reply.rows[0] : undefined;
      const hop=path.at(-1)!;
      const hostPara=path.at(-2)?.cellParaIndex ?? p.para;
      if (this.nativeMutationGeneration()===epoch && row?.isCell===true &&
          row.sectionIndex===p.sec && row.hostPara===hostPara &&
          row.controlIndex===hop.controlIndex && row.cellIndex===hop.cellIndex &&
          [row.listId,row.hostListId,row.paraCount,row.row,row.col,row.rowSpan,row.colSpan,row.cellCount]
            .every(v=>Number.isSafeInteger(v)&&v>=0) &&
          row.listId>0 && (path.length===1 ? row.hostListId===0 : row.hostListId>0) &&
          row.paraCount>hop.cellParaIndex && row.cellCount>hop.cellIndex &&
          row.rowSpan>0 && row.colSpan>0) scope.row=row;
    } catch { /* Keep the existing owner lookup for unsupported paths. */ }
    return scope.row;
  }
  // Repeated live validation and presentation often address exactly the same
  // cell. Retain one canonical row and one raw answer per geometry reader.
  // The root native dispatch fence observes writes through other JS aliases.
  private cellReads?: {
    doc: HwpDocument; generation: number; id: string; revision: number;
    environment: string | number; dpi: number;
    owner?: {key: string; row: CursorListRow};
    geometry: Map<string, {key: string; raw: string}>;
  };
  private currentCellReads(): RhwpAdapter["cellReads"] {
    const generation = coreRuntimeDispatchEpoch(this.doc);
    const environment = this.localBodyEnvironment?.();
    if (generation === undefined || environment === undefined || this.pendingLocalBody ||
        this.transientEdit || this.documentLocked || this.viewerOnlyReason || this.scope !== "edit" ||
        coreRuntimeIdentity(this.doc)?.sha256 !== rootEditorCoreSha256) {
      this.cellReads = undefined;
      return;
    }
    const prior = this.cellReads;
    if (prior && prior.doc === this.doc && prior.generation === generation &&
        prior.id === this.documentId && prior.revision === this.revision &&
        prior.environment === environment && prior.dpi === this.updateReadDpi) return prior;
    return this.cellReads = {
      doc: this.doc, generation, id: this.documentId, revision: this.revision,
      environment, dpi: this.updateReadDpi, geometry: new Map(),
    };
  }
  list(p: Position, allowOwnerRead = true) {
    const scope = this.ownerReadScope;
    if (p.kind !== "cell" || scope || !allowOwnerRead)
      return positions.list.call(this, p, allowOwnerRead ? scope?.projection : undefined, !!scope);
    const reads = this.currentCellReads();
    const key = reads && JSON.stringify([p.sec, p.para, cellPath(p)]);
    if (key && reads?.owner?.key === key) return {...reads.owner.row};
    const typed = this.readTypingCellOwner(p);
    if (typed) return {...typed};
    const row = positions.list.call(this, p);
    if (reads && key && reads === this.currentCellReads()) reads.owner = {key, row: {...row}};
    return row;
  }
  listPosition(entry: any, lists: readonly any[]): Position {
    return positions.listPosition.call(this, entry, lists);
  }
  child(p: Position, last = false): Position | undefined {
    return positions.child.call(this, p, last);
  }
  assertTextOnly(p: Position, endPara = paraIndex(p)) {
    return positions.assertTextOnly.call(this, p, endPara);
  }
  assertTextOnlyForDisplay(p:Position,owners:OwnerProjection) {
    return positions.assertTextOnly.call(this,p,paraIndex(p),owners);
  }
  parent(p: Position, backward: boolean): Position {
    return positions.parent.call(this, p, backward);
  }
  length(p: Position) {
    return positions.length.call(this, p);
  }
  count(p: Position) {
    return positions.count.call(this, p);
  }
  /** Only display readers installed by the coordinator can share scalars. */
  displayCellScalar(key:"count"|"length",p:Position,read:()=>number) {
    return this.ownerReadScope?.projection?.cellScalar(this,key,p,read) ?? read();
  }
  text(p: Position) {
    return positions.text.call(this, p);
  }
  validate(p: Position, allowOwnerRead = true, menuDisplay = false) {
    return positions.validate.call(this, p, allowOwnerRead, menuDisplay);
  }
  textOffset(p: Position, offset = p.offset) {
    return positions.textOffset.call(this, p, offset);
  }
  logical(p: Position, offset: number): number {
    return positions.logical.call(this, p, offset);
  }
  inline(
    p: Position,
  ): { controlIndex: number; offset: number; boxes: CellBox[] }[] {
    return this.call("getBodyInlineTables", p.sec, p.para);
  }
  // Body text positions omit inline control slots. Resolve pictures using the
  // existing control identity/positions and verify the slot against Core's
  // logical mapping; never borrow a cell or floating object's body address.
  inlinePictures(p: Position): { controlIndex: number; offset: number }[] {
    if (p.kind !== "body") return [];
    const end = this.length(p), textEnd = this.textOffset(p, end);
    if (end === textEnd) return [];
    let globalPara = p.para;
    for (let sec = 0; sec < p.sec; sec++) globalPara += this.readStructural('getParagraphCount',sec);
    const controls = this.call<any[]>("getControls")
      .filter(c => c.list === 0 && c.para === globalPara);
    const pictures = controls.filter(c => c.ctrlId === "gso" && c.userDesc === "그림" && c.props?.TreatAsChar === 1);
    if (!pictures.length) return [];
    const positions = this.call<number[]>("getControlTextPositions", p.sec, p.para);
    return pictures.map(c => {
      const props = this.call("getPictureProperties", p.sec, p.para, c.controlIndex);
      const text = positions[c.controlIndex];
      if (!props.treatAsChar || !Number.isInteger(text) || text < 0 || text > textEnd)
        throw Error("인라인 그림의 원문 위치를 확인할 수 없습니다.");
      const first = this.logical(p, text);
      const after = text === textEnd ? end : this.logical(p, text + 1) - 1;
      const siblings = controls.filter(other => positions[other.controlIndex] === text &&
        (other.props?.TreatAsChar === 1 || other.ctrlId === "fn" || other.ctrlId === "en"))
        .sort((a, b) => a.controlIndex - b.controlIndex);
      const index = siblings.findIndex(other => other.controlIndex === c.controlIndex);
      if (index < 0 || siblings.length !== after - first)
        throw Error("같은 위치의 인라인 개체 순서를 확인할 수 없습니다.");
      const offset = first + index;
      if (this.textOffset(p, offset) !== text || this.textOffset(p, offset + 1) !== text)
        throw Error("인라인 그림의 논리 범위가 일치하지 않습니다.");
      return { controlIndex: c.controlIndex, offset };
    });
  }
  /** Synchronous ephemeral display identity, never cached or used by a command. */
  displayPathIdentity(p:Position):{ok:boolean;expectedTargetId?:string;kind?:string} {
    return result(invokeCore(this.doc,"getClipboardTarget",[p.sec,p.para,JSON.stringify(p.kind==="cell"?cellPath(p):[])]));
  }
  charProps(p: Position): Props {
    if (nested(p))
      return this.call(
        "getCellCharPropertiesAtByPath",
        p.sec,
        p.para,
        this.path(p),
        p.offset,
      );
    return p.kind === "body"
      ? this.call("getCharPropertiesAt", p.sec, p.para, this.textOffset(p))
      : this.call(
          "getCellCharPropertiesAt",
          p.sec,
          p.para,
          p.control,
          p.cell,
          p.cellPara,
          p.offset,
        );
  }
  paraProps(p: Position): Props {
    if (nested(p))
      return this.call(
        "getCellParaPropertiesByPath",
        p.sec,
        p.para,
        this.path(p),
      );
    return p.kind === "body"
      ? this.call("getParaPropertiesAt", p.sec, p.para)
      : this.call(
          "getCellParaPropertiesAt",
          p.sec,
          p.para,
          p.control,
          p.cell,
          p.cellPara,
        );
  }
  paragraphListCatalog(): ListCatalog {
    if (typeof this.doc.getNumberingList !== "function" || typeof this.doc.getBulletList !== "function" ||
        typeof this.doc.ensureDefaultNumbering !== "function" || typeof this.doc.ensureDefaultBullet !== "function")
      throw Error("NOT_SUPPORTED: 문단 번호·글머리표 조회/기본 정의 API가 없습니다.");
    const numbers = this.call<ListCatalog["numbers"]>("getNumberingList"), bullets = this.call<ListCatalog["bullets"]>("getBulletList");
    for (const rows of [numbers, bullets]) {
      if (!Array.isArray(rows) || rows.some(d => !Number.isSafeInteger(d?.id) || d.id < 1 || d.id > 65535) ||
          new Set(rows.map(d => d.id)).size !== rows.length) throw Error("번호 정의 조회 실패");
    }
    if (numbers.some(d => !Array.isArray(d.levelFormats) || !d.levelFormats.length ||
        d.levelFormats.length > 7 || d.levelFormats.some((f: unknown) => typeof f !== "string")) ||
        bullets.some(d => typeof d.char !== "string")) throw Error("번호 정의 조회 실패");
    return { numbers, bullets };
  }
  format(p: Position, end: number, props: Props) {
    this.validate(p);
    if (!Number.isSafeInteger(end) || end < p.offset || end > this.length(p))
      throw Error("잘못된 서식 범위입니다.");
    const metricPattern =
      /^(ratios|spacings|relativeSizes|charOffsets)Language([0-6])$/;
    const metricChanges = Object.entries(props).filter(([key]) =>
      metricPattern.test(key),
    );
    if (metricChanges.length) {
      for (let at = this.textOffset(p); at < this.textOffset(p, end); at++) {
        const here = { ...p, offset: this.logical(p, at) },
          raw = this.charProps(here);
        const patch: any = Object.fromEntries(
          Object.entries(props).filter(([key]) => !metricPattern.test(key)),
        );
        for (const [key, value] of metricChanges) {
          const [, name, index] = metricPattern.exec(key)!;
          if (
            !Number.isInteger(value) ||
            Number(value) <
              (name === "ratios" || name === "relativeSizes" ? 1 : -100) ||
            Number(value) >
              (name === "ratios" || name === "relativeSizes" ? 200 : 100)
          )
            throw Error("잘못된 언어별 글자 간격");
          if (!Array.isArray(raw[name]) || raw[name].length !== 7)
            throw Error("언어별 글자 간격 조회 실패");
          if (!Array.isArray(patch[name]) || patch[name] === props[name])
            patch[name] = [...(patch[name] ?? raw[name])];
          patch[name][Number(index)] = value;
        }
        this.format(here, this.logical(p, at + 1), patch);
      }
      return;
    }
    const languageChanges = Object.entries(props).filter(([k]) =>
      /^fontLanguage[0-6]$/.test(k),
    );
    if (languageChanges.length) {
      const rest = Object.fromEntries(
        Object.entries(props).filter(
          ([k]) => !/^fontLanguage[0-6]$/.test(k) && k !== "fontFamily",
        ),
      );
      // Preserve each existing run's OTHER language slots, not just the first run.
      const from = this.textOffset(p),
        to = this.textOffset(p, end);
      for (let at = from; at < to; at++) {
        const here = { ...p, offset: this.logical(p, at) },
          next = this.logical(p, at + 1);
        const families = this.charProps(here).fontFamilies;
        if (!Array.isArray(families) || families.length !== 7)
          throw Error("언어별 글꼴 조회 실패");
        const names =
          typeof props.fontFamily === "string"
            ? Array(7).fill(props.fontFamily)
            : [...families];
        for (const [key, value] of languageChanges) {
          if (
            typeof value !== "string" ||
            !value.trim() ||
            value.length > 200 ||
            /[\u0000-\u001f]/.test(value)
          )
            throw Error("잘못된 글꼴 이름");
          names[Number(key.at(-1))] = value;
        }
        const fontIds = names.map((name, lang) =>
          this.doc.findOrCreateFontIdForLang(lang, name),
        );
        if (fontIds.some((id) => id < 0)) throw Error("언어별 글꼴 등록 실패");
        this.format(here, next, { ...rest, fontIds });
      }
      return;
    }
    if (Object.keys(props).some(key => key === "characterBackground" || /^charBorder(Left|Right|Top|Bottom)\./.test(key))) {
      // The existing Core creates a BorderFill from an original ID. Preserve
      // each selected character's own fill, other sides and dormant metadata;
      // never flatten mixed runs to the selection's first BorderFill.
      const from = this.textOffset(p), to = this.textOffset(p, end);
      for (let at = from; at < to; at++) {
        const here = { ...p, offset: this.logical(p, at) }, next = this.logical(p, at + 1);
        const current: any = this.charProps(here), patch: any = { ...props, borderFillId: current.borderFillId };
        for (const [key, value] of Object.entries(props)) {
          if (key === "characterBackground") {
            delete patch[key]; patch.fillType = value === "none" ? "none" : "solid";
            if (value !== "none") { patch.fillColor = value; patch.patternColor = current.patternColor; patch.patternType = current.fillType === "solid" ? current.patternType : -1; }
          } else if (/^charBorder(Left|Right|Top|Bottom)\.(type|width|color)$/.test(key)) {
            delete patch[key]; const [side, field] = key.slice(4).split(".");
            const name = side[0].toLowerCase() + side.slice(1);
            patch[name] ??= { ...current[name] }; patch[name][field] = value;
          }
        }
        this.format(here, next, patch);
      }
      return;
    }
    let coreProps: any = props;
    if (typeof props.fontFamily === "string") {
      const { fontFamily, ...rest } = props;
      const fontIds = Array.from({ length: 7 }, (_, lang) =>
        this.doc.findOrCreateFontIdForLang(lang, fontFamily),
      );
      if (fontIds.some((id) => id < 0))
        throw Error("글꼴을 등록할 수 없습니다.");
      coreProps = { ...rest, fontIds };
    }
    if (nested(p))
      return this.call(
        "applyCharFormatInCellByPath",
        p.sec,
        p.para,
        this.path(p),
        p.offset,
        end,
        JSON.stringify(coreProps),
      );
    if (p.kind === "body" && this.length(p)!==0 && this.textOffset(p, end) === this.textOffset(p))
      return;
    return p.kind === "body"
      ? this.call(
          "applyCharFormat",
          p.sec,
          p.para,
          this.textOffset(p),
          this.textOffset(p, end),
          JSON.stringify(coreProps),
        )
      : this.call(
          "applyCharFormatInCell",
          p.sec,
          p.para,
          p.control,
          p.cell,
          p.cellPara,
          p.offset,
          end,
          JSON.stringify(coreProps),
        );
  }
  paragraph(p: Position, props: Props, target?: ParagraphTarget) {
    if (nested(p)) {
      const resolved = this.resolveParagraph(
        target ?? this.captureParagraph(p),
      );
      return this.call(
        "applyParaFormatToCellTargets",
        JSON.stringify([resolved.targetId]),
        JSON.stringify(props),
      );
    }
    const patch: any = { ...props };
    const current: any = this.paraProps(p);
    for (const [key, value] of Object.entries(props)) {
      if (key === "paragraphBackground") {
        delete patch[key];
        patch.borderFillId = current.borderFillId;
        patch.fillType = value === "none" ? "none" : "solid";
        if (value !== "none") {
          patch.fillColor = value;
          patch.patternType =
            current.fillType === "solid" ? current.patternType : -1;
          patch.patternColor = current.patternColor;
        }
      } else if (
        /^border(Left|Right|Top|Bottom)\.(type|width|color)$/.test(key)
      ) {
        delete patch[key];
        patch.borderFillId = current.borderFillId;
        const [side, field] = key.split(".");
        patch[side] ??= { ...current[side] };
        patch[side][field] = value;
      } else if (/^borderGap[0-3]$/.test(key)) {
        delete patch[key];
        patch.borderSpacing ??= [...current.borderSpacing];
        patch.borderSpacing[Number(key.at(-1))] = value;
      }
    }
    return p.kind === "body"
      ? this.call("applyParaFormat", p.sec, p.para, JSON.stringify(patch))
      : this.call(
          "applyParaFormatInCell",
          p.sec,
          p.para,
          p.control,
          p.cell,
          p.cellPara,
          JSON.stringify(patch),
        );
  }
  cellProps(p: Position): any {
    if (p.kind !== "cell" || nested(p))
      throw Error("Core API 미지원: 중첩 셀 속성 변경");
    return this.call("getCellOwnProperties", p.sec, p.para, p.control, p.cell);
  }
  cellFormat(p: Position, props: Props) {
    if (p.kind !== "cell" || nested(p))
      throw Error("Core API 미지원: 중첩 셀 속성 변경");
    const current = this.cellProps(p);
    if (hasCellLayout(props)) validateCellLayout(current, props);
    // Clone the existing border-fill in Core; don't reconstruct unrelated fill/diagonal fields.
    const patch: any = { borderFillId: current.borderFillId };
    for (const [key, value] of Object.entries(props)) {
      if (key === "background") {
        patch.fillType = value === "none" ? "none" : "solid";
        if (value !== "none")
          Object.assign(patch, {
            fillColor: value,
            patternType:
              current.fillType === "solid" ? current.patternType : -1,
            patternColor: current.patternColor,
          });
      } else if (
        /^border(Left|Right|Top|Bottom)\.(type|width|color)$/.test(key)
      ) {
        const [side, field] = key.split(".");
        patch[side] ??= { ...current[side] };
        patch[side][field] = value;
      } else if ((cellLayoutKeys as readonly string[]).includes(key)) patch[key] = value;
      else throw Error(`미지원 셀 서식: ${key}`);
    }
    // The typed Core API recognizes borderLeft as its border-edit discriminator.
    if (Object.keys(props).some((k) => k.startsWith("border")))
      patch.borderLeft ??= current.borderLeft;
    return this.call(
      "setCellProperties",
      p.sec,
      p.para,
      p.control,
      p.cell,
      JSON.stringify(patch),
    );
  }
  private cellInsertDisplay?: {
    position: Position; doc: HwpDocument; epoch: number; revision: number;
    update: CellPageUpdate; presented: boolean;
  };
  private currentCellInsertDisplay(p: Position) {
    const display = this.cellInsertDisplay;
    return display && display.doc === this.doc && display.revision === this.revision &&
      coreRuntimeScreenInputEpoch(this.doc) === display.epoch &&
      !this.transientEdit && samePosition(p, display.position) ? display : undefined;
  }
  consumeCellPageUpdate(p: Position): CellPageUpdate | undefined {
    const display = this.currentCellInsertDisplay(p);
    if (!display || display.presented) return;
    display.presented = true;
    return display.update;
  }
  insert(p: Position, text: string, publishCell = false): Position {
    this.cellInsertDisplay = undefined;
    this.validate(p);
    this.assertTextOnly(p);
    const r: CellInsertResult = nested(p)
      ? this.call(
          "insertTextInCellByPath",
          p.sec,
          p.para,
          this.path(p),
          p.offset,
          text,
        )
      : p.kind === "body"
        ? this.call("insertTextLogical", p.sec, p.para, p.offset, text)
        : this.call(
            "insertTextInCell",
            p.sec,
            p.para,
            p.control,
            p.cell,
            p.cellPara,
            p.offset,
            text,
          );
    const position = { ...p, offset: (r.logicalOffset ?? r.charOffset)! };
    const update = r.cellPageUpdate, cursor = r.cellCursor;
    if (publishCell && update && cursor && !this.transientEdit) {
      const epoch = coreRuntimeScreenInputEpoch(this.doc);
      if (epoch !== undefined && Number.isSafeInteger(cursor.pageIndex) && update.pages.includes(cursor.pageIndex) &&
          [cursor.x, cursor.y, cursor.height].every(Number.isFinite) && cursor.height > 0) {
        this.cellInsertDisplay = {
          position, doc: this.doc, epoch, revision: this.revision + 1,
          update: { ...update, cursor }, presented: false,
        };
      }
    }
    return position;
  }
  inheritCharacterShape(p: Position, end: number, shapeId: number) {
    this.validate(p);
    if (!Number.isSafeInteger(shapeId) || shapeId < 0 || !Number.isSafeInteger(end) || end < p.offset || end > this.length(p))
      throw Error("잘못된 입력 글자모양 범위입니다.");
    if (end === p.offset || this.charProps(p).charShapeId === shapeId) return;
    // Reuse the existing definition verbatim: do not reconstruct language slots,
    // effects or unsupported offsets from a partial toolbar projection.
    if (nested(p))
      this.call("setCharShapeIdInCellByPath", p.sec, p.para, this.path(p), p.offset, end, shapeId);
    else if (p.kind === "body")
      this.call("setCharShapeId", p.sec, p.para, this.textOffset(p), this.textOffset(p, end), shapeId);
    else
      this.call("setCharShapeIdInCell", p.sec, p.para, p.control, p.cell, p.cellPara, p.offset, end, shapeId);
  }
  split(p: Position): Position {
    this.validate(p);
    this.assertTextOnly(p);
    const r = nested(p)
      ? this.call(
          "splitParagraphInCellByPath",
          p.sec,
          p.para,
          this.path(p),
          p.offset,
          undefined,
        )
      : p.kind === "body"
        ? this.call("splitParagraph", p.sec, p.para, p.offset, undefined)
        : this.call(
            "splitParagraphInCell",
            p.sec,
            p.para,
            p.control,
            p.cell,
            p.cellPara,
            p.offset,
            undefined,
          );
    return {
      ...withPara(p, r.cellParaIdx ?? r.paraIdx ?? paraIndex(p) + 1),
      offset: 0,
    };
  }
  remove(a: Position, b: Position) {
    this.validate(a);
    this.validate(b);
    if (
      !sameContainer(a, b) ||
      paraIndex(a) > paraIndex(b) ||
      (paraIndex(a) === paraIndex(b) && a.offset > b.offset)
    )
      throw Error("잘못된 삭제 범위입니다.");
    this.assertTextOnly(a, paraIndex(b));
    const removePicture = prepareMixedCellPictureRemoval(this, a, b);
    removePicture?.();
    if (nested(a)) {
      this.call(
        "deleteRangeInCellByPath",
        a.sec,
        a.para,
        this.path(a),
        paraIndex(a),
        a.offset,
        paraIndex(b),
        b.offset,
      );
      if (removePicture) this.exportChecked();
      return;
    }
    if (a.kind === "body" && b.kind === "body")
      this.call("deleteBodyBlock", a.sec, a.para, a.offset, b.para, b.offset);
    else if (a.kind === "cell" && b.kind === "cell")
      this.call(
        "deleteRangeInCell",
        a.sec,
        a.para,
        a.control,
        a.cell,
        a.cellPara,
        a.offset,
        b.cellPara,
        b.offset,
      );
    if (removePicture) this.exportChecked();
  }
  // Layout objects use extended control slots; the plain-text line API's
  // offsets cannot be assumed to share that domain. Keep established hit/rect.
  hasBodyLayoutObject(p: Position, controls?: readonly BodyLayoutControl[]): boolean {
    if(p.kind !== "body") return false;
    const para=p.para+Array.from({length:p.sec},(_,s)=>this.readStructural('getParagraphCount',s)).reduce((x,y)=>x+y,0);
    return (controls ?? this.call<BodyLayoutControl[]>("getControls")).some(c=>c.list===0&&c.para===para&&(c.ctrlId==="gso"||c.ctrlId==="tbl"||c.ctrlCh===11));
  }
  // Consume existing Core visual-line APIs; never change logical document offsets.
  bodyLine(p: Position): BodyLine {
    this.validate(p);
    if (p.kind !== "body") throw Error("본문 줄 탐색 대상이 아닙니다.");
    const line = this.call("getLineInfo", p.sec, p.para, this.textOffset(p));
    if (![line.lineIndex, line.lineCount, line.charStart, line.charEnd].every(Number.isSafeInteger) ||
        line.lineIndex < 0 || line.lineCount <= line.lineIndex || line.charStart < 0 ||
        line.charEnd < line.charStart || line.charEnd > Array.from(this.text(p)).length)
      throw Error("Core 줄 정보가 유효하지 않습니다.");
    return line;
  }
  navigationRect(raw: any): NavigationRect {
    if (!raw || !Number.isSafeInteger(raw.pageIndex) || raw.pageIndex < 0 || raw.pageIndex >= this.pageCount ||
        ![raw.x, raw.y, raw.height].every(Number.isFinite) || raw.height <= 0)
      throw Error("Core 줄 커서 좌표가 유효하지 않습니다.");
    return { pageIndex: raw.pageIndex, x: raw.x, y: raw.y, height: raw.height };
  }
  bodyLineEdge(p: Position, line: BodyLine, atEnd: boolean) {
    if (p.kind !== "body") throw Error("본문 줄 탐색 대상이 아닙니다.");
    const max = 0xffffffff;
    const rect = this.navigationRect(this.call("getCursorRectOnLine", p.sec, p.para,
      line.lineIndex, atEnd, max, max, max, max));
    const position = { ...p, offset: this.logical(p, atEnd ? line.charEnd : line.charStart) };
    this.validate(position);
    return { position, rect };
  }
  bodyVertical(p: Position, delta: -1 | 1, preferredX: number) {
    if (p.kind !== "body") throw Error("본문 줄 탐색 대상이 아닙니다.");
    const max = 0xffffffff;
    const raw = this.call("moveVertical", p.sec, p.para, this.textOffset(p), delta,
      preferredX, max, max, max, max);
    // Root/nested cell traversal keeps the established Studio path.
    if (raw.cellIndex !== undefined || raw.cellPath !== undefined) return undefined;
    if (![raw.sectionIndex, raw.paragraphIndex, raw.charOffset].every(Number.isSafeInteger) ||
        raw.charOffset < 0 || !Number.isFinite(raw.preferredX))
      throw Error("Core 수직 이동 결과가 유효하지 않습니다.");
    const position: Position = { kind: "body", sec: raw.sectionIndex,
      para: raw.paragraphIndex, offset: 0 };
    position.offset = this.logical(position, raw.charOffset);
    this.validate(position);
    return { position, rect: this.navigationRect(raw), preferredX: raw.preferredX };
  }
  rect(p: Position): any {
    const display = this.currentCellInsertDisplay(p);
    if (display) return display.update.cursor;
    if (nested(p))
      return this.call(
        "getCursorRectByPath",
        p.sec,
        p.para,
        this.path(p),
        p.offset,
      );
    return p.kind === "body"
      ? this.call("getCursorRect", p.sec, p.para, p.offset)
      : this.call(
          "getCursorRectInCell",
          p.sec,
          p.para,
          p.control,
          p.cell,
          p.cellPara,
          p.offset,
        );
  }
  cells(
    p: Extract<
      Position,
      {
        kind: "cell";
      }
    >,
    start?: "owner-page",
  ): CellBox[] {
    this.list({ ...p, cellPara: 0, offset: 0 });
    if (!nested(p)) {
      if (start === "owner-page") {
        // Pagination includes both the paragraph and its table fragments.
        // Start at its first page, even when the caret is in a later fragment.
        try {
          const {ok,page} = this.call("getPageOfPosition", p.sec, p.para);
          if (ok && Number.isSafeInteger(page) && page > 0) {
            const boxes = this.call<CellBox[]>("getTableCellBboxes", p.sec, p.para, p.control, page);
            if (boxes.length && boxes[0].pageIndex === page) return boxes;
          }
        } catch { /* Keep the ordinary lookup when the hint is unavailable. */ }
      }
      return this.call("getTableCellBboxes", p.sec, p.para, p.control);
    }
    const boxes = this.call<CellBox[]>("getTableCellBboxesByPath", p.sec, p.para, this.path(p));
    // 9aab may paint the last row of a complete 2×2 child on the following
    // physical page. Its bbox cellIdx is local to each fragment, while the
    // document path and hit-test own the original model indices.
    if (coreRuntimeIdentity(this.doc)?.sha256 !==
          rootEditorCoreSha256 ||
        p.ancestors?.length !== 1 || boxes.length !== 4 ||
        new Set(boxes.map(b => b.cellIdx)).size !== 2 ||
        new Set(boxes.map(b => b.pageIndex)).size !== 2 ||
        new Set(boxes.map(b => `${b.row}:${b.col}`)).size !== 4 ||
        boxes.some(b => (b.row !== 0 && b.row !== 1) || (b.col !== 0 && b.col !== 1) ||
          b.rowSpan !== 1 || b.colSpan !== 1 || b.cellIdx !== b.col ||
          !Number.isSafeInteger(b.pageIndex) || b.pageIndex < 0 ||
          ![b.x,b.y,b.w,b.h].every(Number.isFinite) || b.w <= 0 || b.h <= 0))
      return boxes;
    const top = boxes.find(b => b.row === 0)!.pageIndex;
    if (boxes.some(b => b.pageIndex !== top + b.row)) return boxes;
    try {
      const dims = this.call("getTableDimensionsByPath", p.sec, p.para, this.path(p));
      if (dims.rowCount !== 2 || dims.colCount !== 2 || dims.cellCount !== 4) return boxes;
      const result: CellBox[] = [];
      for (const b of boxes) {
        const cellIdx = b.row * 2 + b.col;
        const position = {...p,cell:cellIdx,cellPara:0,offset:0};
        const path = this.path(position);
        const model = this.call("getCellInfoByPath", p.sec, p.para, path);
        if (model.row !== b.row || model.col !== b.col || model.rowSpan !== 1 || model.colSpan !== 1)
          return boxes;
        const caret = this.rect(position);
        if (caret.pageIndex !== b.pageIndex || ![caret.x,caret.y,caret.height].every(Number.isFinite) ||
            caret.x < b.x || caret.x >= b.x + b.w || caret.y < b.y ||
            caret.y + caret.height > b.y + b.h + .2)
          return boxes;
        const hit = this.call("hitTest", b.pageIndex, caret.x + Math.min(1,(b.x+b.w-caret.x)/2), caret.y + caret.height/2);
        if (hit.isTextBox || hit.sectionIndex !== p.sec || hit.parentParaIndex !== p.para ||
            hit.cursorRect?.pageIndex !== b.pageIndex ||
            !Array.isArray(hit.cellPath) || hit.cellPath.length !== 2 ||
            !JSON.parse(path).every((h:{controlIndex:number;cellIndex:number;cellParaIndex:number},i:number)=>
              h.controlIndex===hit.cellPath[i].controlIndex && h.cellIndex===hit.cellPath[i].cellIndex &&
              h.cellParaIndex===hit.cellPath[i].cellParaIndex)) return boxes;
        result.push({...b,cellIdx});
      }
      return result;
    } catch {
      // If the render/model bridge cannot prove all four owners, keep the
      // existing raw selection refusal. Core authorizes every write itself.
      return boxes;
    }
  }
  runs(page: number): Run[] {
    return this.call("getPageTextLayout", page).runs;
  }
  get pageCount(): number {
    // Preserve the existing whole-layout barrier. The scalar already calls the
    // SAME native page_count() as documentInfo, without font-table JSON work.
    if(this.pendingLocalBody)this.completeLocalBodyFlow();
    const bound=this.heightCandidateIdentified && coreRuntimeHasUpdateReadProvenance(this.doc);
    if(!bound)return this.call("getDocumentInfo").pageCount;
    return this.updateReads.read('pageCount',[],()=>{
      const count=this.doc.pageCount();
      if(!Number.isSafeInteger(count)||count<1)throw Error('현재 전체 쪽수를 확인할 수 없습니다.');
      return count;
    });
  }
  position(run: Run, offset: number): Position {
    if ((run.cellPath?.length ?? 0) > 1)
      return this.fromPath(
        run.secIdx,
        run.parentParaIdx!,
        run.cellPath!,
        offset,
      );
    if (run.cellIdx === undefined) {
      const p: Position = {
        kind: "body",
        sec: run.secIdx,
        para: run.paraIdx,
        offset: 0,
      };
      // The empty marker after an object-only line already carries the Core
      // logical end (paragraph_layout's empty_line_logical_end), not a scalar
      // text offset. Match an actual inline control end before consuming it.
      // Other empty runs (fields/plain paragraphs) keep normal conversion.
      if (run.text === "" && offset === run.charStart &&
          this.readStructural('getParagraphLength',p.sec, p.para) === 0 &&
          [...this.inline(p), ...this.inlinePictures(p)].some(c => c.offset + 1 === offset))
        return { ...p, offset };
      p.offset = this.logical(p, offset);
      // A text run beginning at an object boundary lies after those objects.
      if (offset === run.charStart)
        for (const table of [...this.inline(p), ...this.inlinePictures(p)])
          if (
            this.textOffset(p, table.offset) === offset
          )
            p.offset = Math.max(p.offset, table.offset + 1);
      return p;
    }
    return {
      kind: "cell",
      sec: run.secIdx,
      para: run.parentParaIdx!,
      control: run.controlIdx!,
      cell: run.cellIdx,
      cellPara: run.cellParaIdx!,
      offset,
    };
  }
  hit(page: number, x: number, y: number): Position {
    return this.hitPosition(page, x, this.call("hitTest", page, x, y));
  }
  hitWithRect(page: number, x: number, y: number, needTableWitness=false) {
    const r = this.call("hitTest", page, x, y);
    const position = this.hitPosition(page, x, r);
    // Use the original native hit's structured table text address, not the
    // converted position alone (which can also describe a textbox/object).
    const hop=Array.isArray(r.cellPath)&&r.cellPath.length===1 ? r.cellPath[0] : undefined;
    const tableWitness=!!hop&&position.kind==="cell"&&!nested(position)&&r.isTextBox!==true&&
      r.innerControlIdx===undefined&&r.cursorRect?.pageIndex===page&&
      r.sectionIndex===position.sec&&r.parentParaIndex===position.para&&r.charOffset===position.offset&&
      r.paragraphIndex===position.cellPara&&hop.controlIndex===position.control&&
      hop.cellIndex===position.cell&&hop.cellParaIndex===position.cellPara;
    // Only plain body interior coordinates have a confirmed consumer contract.
    // Preserve existing cell/object paths and the unresolved shared-offset policy.
    let rect: NavigationRect | undefined, line: BodyLine | undefined;
    if (position.kind === "body" && !this.hasBodyLayoutObject(position) && r.cursorRect) {
      const candidate = this.bodyLine(position);
      const offset = this.textOffset(position);
      if (offset > candidate.charStart && offset < candidate.charEnd) {
        const hitRect = this.navigationRect(r.cursorRect);
        if (hitRect.pageIndex !== page) throw Error("클릭 결과의 쪽이 일치하지 않습니다.");
        const edge = this.bodyLineEdge(position, candidate, false).rect;
        // Consume the returned rectangle verbatim, never synthesize a y correction.
        if (edge.pageIndex === hitRect.pageIndex && edge.y === hitRect.y) {
          rect = hitRect; line = candidate;
        }
      }
    }
    return {position,rect,line,tableWitness:needTableWitness&&tableWitness,rootTableHitPage:tableWitness?page:undefined};
  }
  private hitPosition(page: number, x: number, r: any): Position {
    // Resolve no-text-run cell object hits through their exact owned control.
    // Legacy hits carry tuple paths/logical offsets; the current Core carries
    // structured paths/scalar offsets. Neither may become a body address.
    if (r.innerControlIdx !== undefined) {
      const structured = Number.isSafeInteger(r.parentParaIndex) && r.parentParaIndex >= 0;
      const path = Array.isArray(r.cellPath) ? r.cellPath.map((p: any) => structured && p && !Array.isArray(p)
        ? [p.controlIndex, p.cellIndex, p.cellParaIndex] : p) : [];
      if (!Number.isSafeInteger(r.innerControlIdx) || r.innerControlIdx < 0 ||
          !path.length || path.some((p: any) =>
            !Array.isArray(p) || p.length !== 3 || p.some((n: any) => !Number.isSafeInteger(n) || n < 0)))
        throw Error("셀 개체의 소유 경로가 유효하지 않습니다.");
      if (structured && (r.controlIndex !== path[0][0] || r.cellIndex !== path[0][1] ||
          r.cellParaIndex !== path[0][2] || r.paragraphIndex !== path[path.length - 1][2]))
        throw Error("셀 개체의 소유 경로가 유효하지 않습니다.");
      const row = fragmentClipboardObjects(this).find(c => c.focus.kind === 'cell' &&
        c.sec === r.sectionIndex && c.para === (structured ? r.parentParaIndex : r.paragraphIndex) && c.control === r.innerControlIdx &&
        JSON.stringify(JSON.parse(c.path).map((p: any) => [p.controlIndex,p.cellIndex,p.cellParaIndex])) === JSON.stringify(path));
      if (!row || (structured && row.focus.offset !== r.charOffset))
        throw Error("클릭한 셀 개체의 현재 소유 문단을 확인할 수 없습니다.");
      this.validate(row.focus);
      return { ...row.focus };
    }
    if ((r.cellPath?.length ?? 0) > 1)
      return this.fromPath(
        r.sectionIndex,
        r.parentParaIndex,
        r.cellPath,
        r.charOffset,
      );
    if (r.cellIndex === undefined) {
      // An empty object-only line returns its logical end, just as its empty
      // layout marker does. Converting that end as text counts the object twice.
      // Require the exact current marker and owned inline slot; other hits keep
      // the scalar conversion and normal validation below.
      if (r.cursorRect?.pageIndex === page &&
          this.doc.getParagraphLength(r.sectionIndex, r.paragraphIndex) === 0) {
        const markers = this.runs(page).filter(run => run.cellIdx === undefined &&
          !run.cellPath?.length && run.secIdx === r.sectionIndex &&
          run.paraIdx === r.paragraphIndex && run.text === "" &&
          run.charStart === r.charOffset && run.x === r.cursorRect.x &&
          run.y === r.cursorRect.y && run.h === r.cursorRect.height);
        const owner: Position = { kind: "body", sec: r.sectionIndex,
          para: r.paragraphIndex, offset: 0 };
        if (markers.length === 1 &&
            [...this.inline(owner), ...this.inlinePictures(owner)]
              .some(control => control.offset + 1 === r.charOffset)) {
          const position = this.position(markers[0], r.charOffset);
          this.validate(position);
          return position;
        }
      }
      const p: Position = {
        kind: "body",
        sec: r.sectionIndex,
        para: r.paragraphIndex,
        offset: this.doc.textToLogicalOffset(
          r.sectionIndex,
          r.paragraphIndex,
          r.charOffset,
        ),
      };
      for (const table of this.inline(p)) {
        if (
          this.doc.logicalToTextOffset(p.sec, p.para, table.offset) !==
          r.charOffset
        )
          continue;
        const after = this.call(
          "getCursorRect",
          p.sec,
          p.para,
          table.offset + 1,
        );
        const before = this.call("getCursorRect", p.sec, p.para, table.offset);
        if (r.charOffset > 0 && r.charOffset < this.doc.getParagraphLength(p.sec, p.para) &&
            (before.pageIndex !== after.pageIndex || before.y !== after.y)) {
          // Existing hit geometry encodes the side of this shared scalar.
          // Match complete current rectangles; never infer affinity from x alone.
          const matches = (rect: any) => r.cursorRect && rect.pageIndex === page &&
            ["pageIndex", "x", "y", "height"].every(key => rect[key] === r.cursorRect[key]);
          const beforeHit = matches(before), afterHit = matches(after);
          if (beforeHit === afterHit) throw Error("인라인 표 경계의 현재 클릭 위치를 확정할 수 없습니다.");
          p.offset = table.offset + (afterHit ? 1 : 0);
        } else if (after.pageIndex === page && x >= after.x - 1)
          p.offset = table.offset + 1;
      }
      // Both sides of a body inline picture share one scalar anchor. Core's
      // returned caret rectangle retains the chosen side; resolve it against
      // the existing logical slot, never add an inferred picture count.
      for (const picture of this.inlinePictures(p)) {
        if (this.textOffset(p, picture.offset) !== r.charOffset || !r.cursorRect) continue;
        const before = this.rect({ ...p, offset: picture.offset });
        const after = this.rect({ ...p, offset: picture.offset + 1 });
        if (after.pageIndex === page && r.cursorRect.pageIndex === page &&
            Math.abs(r.cursorRect.x - after.x) < .01 &&
            Math.abs(r.cursorRect.x - before.x) >= .01)
          p.offset = Math.max(p.offset, picture.offset + 1);
      }
      return p;
    }
    return {
      kind: "cell",
      sec: r.sectionIndex,
      para: r.parentParaIndex,
      control: r.controlIndex,
      cell: r.cellIndex,
      cellPara: r.cellParaIndex,
      offset: r.charOffset,
    };
  }
  // Read-only projection; never feeds document changes back into Core.
  semantic() {
    return projectSemantic.call(this);
  }
  assertEditable(p: Position) {
    // A command never takes its admission from the presentation receipt,
    // including an accidental command invocation inside an owner read.
    this.menuSelectionContext?.close();
    if (this.ownerReadScope) this.invalidateUpdateReads();
    this.checkEditable(p, false);
  }
  /** @internal Display-only check. Permission/protection checks still run;
   * only the position's structural owner resolution may share a receipt. */
  assertEditableForPresentation(p: Position) {
    this.checkEditable(p, true);
  }
  private checkEditable(p: Position, allowOwnerRead: boolean, menuDisplay = false, tableOwner?: (p:Extract<Position,{kind:"cell"}>)=>boolean) {
    if (this.viewerOnlyReason) throw Error(this.viewerOnlyReason);
    if (tableOwner) positions.validate.call(this,p,allowOwnerRead,menuDisplay,tableOwner);
    else this.validate(p, allowOwnerRead, menuDisplay);
    if (this.scope !== "edit" || this.documentLocked)
      throw Error("읽기 전용 문서입니다.");
    if (
      p.kind === "cell" &&
      this.call(
        "getCellOwnProperties",
        p.sec,
        p.para,
        p.ancestors?.[0]?.controlIndex ?? p.control,
        p.ancestors?.[0]?.cellIndex ?? p.cell,
      ).cellProtect
    )
      throw Error("보호된 셀은 편집할 수 없습니다.");
  }
  exportChecked() {
    // Retain the existing refusal before any completion work on forbidden Save.
    if (!this.transientEdit && !this.viewerOnlyReason) this.completeLocalBodyFlow();
    return exportCheckedHwpx.call(this);
  }
  // Rare resize certificate only. Reopen checked bytes through this document's
  // private runtime; never replace the live document, selection or History.
  withCheckedReopen<T>(read: (reopened: RhwpAdapter) => T): T {
    const { bytes } = this.exportChecked();
    const reopened = new RhwpAdapter(siblingDocument(this.doc, bytes));
    try { return read(reopened); } finally { reopened.doc.free(); }
  }
}
