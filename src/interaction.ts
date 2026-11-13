import { prepareClickedTable, type ClickedTableTarget } from "./clicked-table-target.js";
import { cursorModelMemoEnabled, withFreshCursorModel } from "./cursor-model-memo.js";
import {PassiveOwnerBatchRetired} from "./passive-owner-batch.js";
import {ordinaryPreviewGrid} from "./selection-context-lite.js";
import type { WidthEvent, WidthLookup, WidthMethod, WidthSite } from "./width-preview-reads.js";
import { ordinaryF5Grid, type F5Epoch } from "./f5-render-transaction.js";
import { cellPresentationScope } from "./cell-presentation-scope.js";
import {releaseScreenSelection} from './screen-selection-projection.js';
import {OwnerProjection,ownerLists} from './owner-projection.js';
import {insertCellTable} from './cell-table-insert.js';
import {freezeDiagnosticFor} from './diagnostics/runtime.js';
import {prepareMergedGridResize,type MergedGridResizePlan} from './merged-grid-resize.js';
import {coreRuntimeHasCapability,coreRuntimeIdentity} from './core-runtime.js';
import {resizeHeightBases,resizeTableFrame,validateResizeTableFrame,partialHeightFloor,canonicalPartialHeightFloor,draggedHeightFloor,checkedReopenFrame} from './resize-height-bases.js';
import {prepareNativeTrackResize} from './table-track-resize.js';
import {prepareParentTableCut,type ParentTableCut} from './parent-table-cut.js';
import {prepareCellBlockObjectCut,type CellBlockObjectCut} from './cell-block-cut.js';
import {UnsupportedTableOperation,tableCaptureRefusal} from './table-capability.js';
import {assertLocalResizeProof} from './cell-local-resize.js';
import {wholeBodySection,prepareWholeBodyDelete} from './body-selection.js';
import {autofillPlan} from './table-autofill.js';
import { prepareTextboxEdit } from "./textbox-edit.js";
import {prepareTableObject} from './table-object-command.js';
import {prepareRemainingEdit} from './remaining-shortcut-commands.js';
import { externalTextFormat, externalCoreHTML } from "./external-text-format.js";
import { PasteFormatUnavailable } from "./paste-format-fallback.js";
import { isClipboardMarkdownTable } from "./clipboard-markdown-table.js";
import {preparePaper,columnPosition} from './shortcut-supported2.js';
import {prepareUngroup} from './object-ungroup.js';
import {prepareEqualCells} from './cell-equal.js';
import {prepareParagraphMove} from './paragraph-move.js';
import { cellBorderPlan, type CellBorderDraft } from "./cell-border-plan.js";
import { cellBlockPlan } from './cell-block-scope.js';
import { wordPosition } from './word-navigation.js';
import { paragraphPosition } from './paragraph-navigation.js';
import { f3WordRange } from './f3-word-range.js';
import { cellRowBlock } from './cell-row-block.js';
import { exactParagraphPosition, prepareCurrentPosition } from './paragraph-current-position.js';
import { lowerPairGrid } from './table-boundary-grid.js';
import type { SelectionBox } from "./selection-display.js";
import { stylesUnavailable } from "./style-availability.js";
import { cellLayoutKeys, cellLayoutHold, hasCellLayout, validateCellLayout } from "./cell-layout.js";
import { prepareShapeSize, prepareTextboxInsert } from "./shapes.js";
import { prepareHeaderFooter } from "./header-footer.js";
import { preparePageNumber } from "./page-number.js";
import { preparePageBreak } from "./page-break.js";
import { prepareColumnBreak } from "./column-break.js";
import { prepareColumnDefinitionBreak } from "./column-definition-break.js";
import { prepareColumns } from "./columns.js";
import { preparePicture, pictureSelectionRect } from "./pictures.js";
import { bodyClipboardObjects, prepareObjectCut, selectedCutObject } from './object-clipboard.js';
import { assertMixedCellPictureRange, mixedCellPictureBoxes, ownsMixedCellPictureHit } from './mixed-cell-picture.js';
import { inlineCellPicture, inlineCellPictureBoxes, crossesPicture } from './inline-cell-picture.js';
import { prepareParagraphAdjustment, paragraphAdjustmentRaw, type ParagraphAdjustment } from "./paragraph-adjustments.js";
import { numberRestartReason, validateNumberRestart } from "./numbering-restart.js";
import { prepareStyleMutation } from "./style-definitions.js";
import { normalizeUnderlineChange, mergeUnderlineTyping } from "./line-position.js";
import { prepareControlKey,prepareControlOffset } from "./control-shortcuts.js";
import { wordAcrossPosition, paragraphStepPlan, textSelection } from "./shortcut-batch.js";
import { cellColumnBlock } from "./cell-row-block.js";
import { listPlan } from "./paragraph-lists.js";
import { relativeCharacterPatch, relativeTyping } from "./character-increments.js";
import { clipboardSupport } from "./clipboard-ui-state.js";
import { editNestedTable, assertNestedRowDeletion } from "./nested-table-structure.js";
import {
  type FormatKind,
  type FormatState,
  displayed,
  mixed,
  matches,
  keepWithNextHold,
  bodyBorderHold,
  lineProtectionBodyUnsupported,
  validateParagraphDelta,
  toCoreCharacter,
} from "./formatting.js";
import { StructuredClipboard } from "./clipboard.js";
import { RhwpAdapter, type BodyLine, type NavigationRect } from "./adapter.js";
import { History } from "./history.js";
import { applyStyleAt, observeStyle, styleAt } from "./style-observation.js";
import {
  type Selection,
  type Position,
  type Command,
  type Props,
  type Box,
  type Run,
  type SelectionReference,
  type ParagraphTarget,
  copy,
  start,
  ordered,
  sameContainer,
  samePosition,
  paraIndex,
  withPara,
  sameTable,
  cellPath,
  nested,
} from "./model.js";
type ExecutionCapture = NonNullable<Parameters<Interaction["execute"]>[1]>;
export type WidthPreviewAdmission = (position: Position, resolved: ParagraphTarget|undefined, grid:readonly import("./model.js").CellBox[])=>WidthLookup|undefined;
// Exact Core reviewed for survivor identity in flat floating 2×1 row delete.

export class Interaction {
  private viewFormats?: Map<string, FormatState>;
  // Producer-owned navigation projection, synchronous only. Consumers receive
  // copies; no result survives the current native-owner/layout/font fence.
  private viewLines?: Map<string, {page:number;y:number;runs:Run[]}[]>;
  private viewLineCurrent?: () => boolean;
  private viewOwners?: OwnerProjection;
  // Toolbar/menu projections ask for the same mixed state many times. Resolve
  // it once per synchronous paint, without caching across a command or input.
  withViewQueries<T>(read: (owners?:OwnerProjection) => T): T {
    if (this.viewFormats) return read(this.viewOwners);
    this.viewFormats = new Map();
    const project=()=>this.adapter.withBodyLineReadFence(current => {
      this.viewLineCurrent=current;
      this.viewOwners=new OwnerProjection(this.adapter,current);
      if(current?.())this.viewLines=new Map();
      return this.adapter.withUpdateReads(() => this.adapter.withViewQueries(()=>read(this.viewOwners)));
    });
    try { return this.adapter.nativeMutationGeneration()===undefined ? project() : this.adapter.withViewQueries(project); }
    finally { releaseScreenSelection(this.viewOwners);this.viewOwners?.close();this.viewOwners=undefined;this.viewFormats = undefined;this.viewLines=undefined;this.viewLineCurrent=undefined; }
  }
  private blockPresentation?: {
    block: () => ReturnType<Interaction["readBlockPresentation"]> | undefined;
    targets: () => ReturnType<Interaction["targets"]> | undefined;
    rect: () => ReturnType<Interaction["cursorRect"]> | undefined;
  };
  private readBlockPresentation(s: Selection) {
    // Keep the authoritative validation, using the exact same raw fragments
    // for validation, the sorted logical owners and the selection overlay.
    let boxes!: ReturnType<Interaction["cellBoxes"]>;
    this.validateSelection(s, () => { boxes = this.cellBoxes(s); });
    return {boxes, cells: this.uniqueCells(boxes)};
  }
  /** Display-only. Command capture, targets(), cells() and rectangles() keep
   * their original authority. No prepared result survives this callback. */
  withCellBlockPresentation<T>(read: (owners?: OwnerProjection) => T): T {
    return this.withViewQueries(owners => {
      if (this.blockPresentation) return read(owners);
      const s = this.selection, a = this.adapter;
      if ((s.kind !== "cells" && s.kind !== "table") || !owners?.isCurrent(a)) return read(owners);
      const generation = this.selectionGeneration;
      const stamp = JSON.stringify(s);
      const current = () => owners.isCurrent(a) && this.selectionGeneration === generation &&
        this.selection === s && JSON.stringify(s) === stamp;
      const scope = cellPresentationScope(current);
      const blockSlot = scope.slot<ReturnType<Interaction["readBlockPresentation"]> | undefined>();
      const targetSlot = scope.slot<ReturnType<Interaction["targets"]> | undefined>();
      const rectSlot = scope.slot<ReturnType<Interaction["cursorRect"]> | undefined>();
      const block = () => blockSlot(() => this.readBlockPresentation(s), () => undefined);
      this.blockPresentation = {
        block,
        targets: () => {
          const rows = block();
          return rows && targetSlot(() => this.blockTargets(s, rows.cells), () => undefined);
        },
        rect: () => block() && rectSlot(() => this.cursorRect(), () => undefined),
      };
      try { return read(owners); }
      finally { scope.close(); this.blockPresentation = undefined; }
    });
  }
  presentationTargets(s: Selection = this.selection): ReturnType<Interaction["targets"]> {
    const prepared = s === this.selection ? this.blockPresentation?.targets() : undefined;
    return prepared ? copy(prepared) : this.targets(s);
  }
  presentationCellCount(s: Selection) {
    const prepared = s === this.selection ? this.blockPresentation?.block() : undefined;
    return prepared ? prepared.cells.length : this.cells(s).length;
  }
  presentationRectangles(runs: (page: number) => readonly Run[], owners?: OwnerProjection): SelectionBox[] {
    const prepared = this.blockPresentation?.block();
    return prepared ? this.blockRectangles(prepared.boxes) : this.rectangles(runs, owners);
  }
  presentationCursorRect() {
    const rect = this.blockPresentation?.rect();
    return rect && copy(rect);
  }
  private assertStylePolicy(command: Command) {
    if(command.type === "style" || command.type === "style-manage") throw Error(stylesUnavailable);
  }
  private current: Selection = { kind: "caret", focus: start() };
  private reference?: SelectionReference;
  private selectionError?: unknown;
  get selection(): Selection {
    return this.current;
  }
  private selectionGeneration = 0;
  get currentSelectionGeneration() { return this.selectionGeneration; }
  /** The native write boundary is owned by Adapter. Match this existing
   * selection reference and its resolved focus too, even if a publisher
   * re-enters without advancing the selection generation. */
  cellApplySelectionWitness(committed?:SelectionReference["focus"]):()=>boolean {
    const s=this.selection,ref=this.reference,generation=this.selectionGeneration;
    if(s.kind!=="caret"||s.focus.kind!=="cell"||!ref?.focus||ref.documentId!==this.adapter.documentId)return ()=>false;
    const focus=structuredClone(s.focus), endpoint=ref.focus;
    const matchesCommitted=()=>{
      if(!committed)return true;
      const a=endpoint.target,b=committed.target,h=a.path[0],expected=b.path[0];
      return !nested(focus)&&a.path.length===1&&b.path.length===1&&!!a.targetId&&a.targetId===b.targetId&&
        a.sectionIndex===b.sectionIndex&&a.sectionIndex===focus.sec&&
        a.parentParaIndex===b.parentParaIndex&&a.parentParaIndex===focus.para&&
        endpoint.offset===committed.offset&&endpoint.offset===focus.offset&&
        h.controlIndex===expected.controlIndex&&h.controlIndex===focus.control&&
        h.cellIndex===expected.cellIndex&&h.cellIndex===focus.cell&&
        h.cellParaIndex===expected.cellParaIndex&&h.cellParaIndex===focus.cellPara;
    };
    return ()=>this.selection===s&&this.reference===ref&&this.selectionGeneration===generation&&samePosition(s.focus,focus)&&
      (!committed||(ref.focus===endpoint&&!this.selectionError&&matchesCommitted()));
  }
  /** QA only: use the native target already captured by the selection setter.
   * This is evidence of a mounted selection, not command authorization. */
  qaCellTarget() {
    const s=this.selection,ref=this.reference,focus=ref?.focus,target=focus?.target,a=this.adapter,
      doc=a.doc,generation=this.selectionGeneration,docId=a.documentId;
    if(s.kind!=="cells"||!target||ref?.documentId!==docId||focus.offset!==s.focus.offset||
       !samePosition(s.focus,a.fromPath(target.sectionIndex,target.parentParaIndex,target.path,focus.offset)))return;
    const position=structuredClone(s.focus);
    return {target:structuredClone(target),position,phase:s.phase,generation,docId,
      current:()=>a.doc===doc&&a.documentId===docId&&this.reference===ref&&
        this.selectionGeneration===generation&&this.selection===s&&samePosition(s.focus,position)};
  }
  set selection(value: Selection) { this.setSelection(value); }
  private setSelection(value: Selection, clickReference?:SelectionReference) {
    this.selectionGeneration++;
    this.resetBlockSequence();
    this.current = value;
    this.selectionCaretOrigin = undefined;
    this.reference = undefined;
    this.selectionError = undefined;
    try {
      this.reference = clickReference ?? this.adapter.captureSelection(value);
    } catch (error) {
      this.selectionError = error;
    }
  }
  /** @internal Read-only fastpath gate, never repairs or captures a reference. */
  menuCaretReferenceMatches(s:Selection):boolean {
    const ref=this.reference;
    if(s!==this.current || this.selectionError || !ref?.focus || s.kind!=="caret") return false;
    try {
      const resolved=this.adapter.resolveSelection(ref);
      return s===this.current && ref===this.reference && resolved.kind==="caret" && samePosition(s.focus,resolved.focus);
    } catch { return false; }
  }
  /** @internal Bind a grid before its read to one stable native paragraph owner.
   * The existing reference resolver supplies the actual token and path; no new
   * native lookup is added to the toolbar. This is never a permission receipt. */
  tableDisplayGridOwner(kind:"caret"|"table") {
    const a=this.adapter,s=this.selection,ref=this.reference,h=this.history,endpoint=ref?.focus;
    if(s.kind!==kind||s.focus.kind!=="cell"||nested(s.focus)||s.focus.sec!==0||
       !ref||!endpoint?.target?.targetId||ref.documentId!==a.documentId||endpoint.offset!==s.focus.offset||
       this.selectionError||a.scope!=="edit"||a.documentLocked||a.viewerOnlyReason)return;
    const target=endpoint.target,ownerId=target.targetId,focus={...s.focus},gen=this.selectionGeneration;
    const stamp=JSON.stringify(target),read=a.tablePreviewFence(),native=a.cursorOwnerReadWitness();
    const doc=a.doc,id=a.documentId,rev=a.revision;
    const u=h.undoStack.at(-1),r=h.redoStack.at(-1),un=h.undoStack.length,rn=h.redoStack.length;
    let open=true;
    const sameOwner=()=>this.adapter===a&&a.doc===doc&&a.documentId===id&&a.revision===rev&&
      native?.()!==false&&
      this.selection===s&&s.kind===kind&&samePosition(s.focus,focus)&&this.reference===ref&&ref.documentId===id&&
      ref.focus===endpoint&&endpoint.target===target&&endpoint.offset===focus.offset&&JSON.stringify(target)===stamp&&
      this.selectionGeneration===gen&&!this.selectionError&&a.scope==="edit"&&!a.documentLocked&&!a.viewerOnlyReason&&
      !a.transientEdit&&!a.hasPendingLocalBodyFlow()&&this.history===h&&h.undoStack.at(-1)===u&&h.redoStack.at(-1)===r&&
      h.undoStack.length===un&&h.redoStack.length===rn;
    const current=()=>open=open&&read()&&sameOwner();
    const matches=(p:Position,resolved:ParagraphTarget|undefined)=>{
      const hop=resolved?.path?.[0];
      open=current()&&samePosition(p,focus)&&resolved?.targetId===ownerId&&resolved.sectionIndex===focus.sec&&
        resolved.parentParaIndex===focus.para&&resolved.path.length===1&&hop?.controlIndex===focus.control&&
        hop.cellIndex===focus.cell&&hop.cellParaIndex===focus.cellPara;
      return open;
    };
    if(current())return {current,sameOwner,matches,retire:()=>{open=false;},focusIs:(p:Position)=>current()&&samePosition(p,focus),ref};
  }
  /** @internal The passive batch grid already belongs to this pre-read owner. */
  passiveTableObjectBatchFence(view:()=>string|undefined,owner:NonNullable<ReturnType<Interaction["tableDisplayGridOwner"]>>):(()=>boolean)|undefined {
    const a=this.adapter;
    if(!owner.current()||!a.passiveOwnerBatchAvailable()||a.hasCurrentCursorModelRead())return;
    const v=view();if(v===undefined||!owner.current())return;
    let target:ParagraphTarget|undefined;
    let resolved:Selection;
    try {resolved=a.resolveSelection(owner.ref,t=>{target=t;});}
    catch{throw new PassiveOwnerBatchRetired();}
    if(resolved.kind!=="table"||!owner.matches(resolved.focus,target))throw new PassiveOwnerBatchRetired();
    let open=true;
    return ()=>open=open&&view()===v&&owner.current();
  }
  private resolveCurrent(s: Selection, observeFocus?: (target:ParagraphTarget)=>void) {
    if (s !== this.current) return;
    if (this.selectionError) throw this.selectionError;
    if (this.reference)
      Object.assign(s, this.adapter.resolveSelection(this.reference,observeFocus));
  }
  readonly clipboard = new StructuredClipboard();
  block = false;
  preferredX: number | undefined;
  private visualCaret?: { documentId: string; revision: number; selection: string;
    rect: NavigationRect; line?: BodyLine };
  private selectionCaretOrigin?: { documentId: string; revision: number; selection: string;
    anchor: Position; rect: NavigationRect; line: BodyLine };
  private allSelectionOrigin?: { documentId: string; revision: number; selection: string; focus: Position };
  private allSelectionFocus() {
    const origin = this.allSelectionOrigin;
    if (origin && origin.documentId === this.adapter.documentId && origin.revision === this.adapter.revision &&
        origin.selection === JSON.stringify(this.selection)) return origin.focus;
    this.allSelectionOrigin = undefined;
    return undefined;
  }
  private currentVisualCaret() {
    const v = this.visualCaret;
    if (v && v.documentId === this.adapter.documentId && v.revision === this.adapter.revision &&
        v.selection === JSON.stringify(this.selection)) return v;
    this.visualCaret = undefined;
    return undefined;
  }
  cursorRect() {
    const all = this.allSelectionFocus();
    if (all) return this.currentVisualCaret()?.rect ?? this.adapter.rect(all);
    const object = pictureSelectionRect(this.adapter, this.selection);
    if (object) return object;
    return this.currentVisualCaret()?.rect ?? this.adapter.rect(this.selection.focus);
  }
  private moveBodyLine(key: string, selecting: boolean): boolean {
    const a = this.adapter, p = this.selection.focus;
    if (p.kind !== "body" || !["Home", "End", "ArrowUp", "ArrowDown"].includes(key) || a.hasBodyLayoutObject(p))
      return false;
    const context = { documentId: a.documentId, revision: a.revision, selection: JSON.stringify(this.selection) };
    const v = this.currentVisualCaret();
    const current = a.bodyLine(p);
    // An explicit End can share an offset with the next line. Do not invent
    // offset-only affinity or moveVertical's source-line policy at that boundary.
    if (v && (!v.line || ((key === "ArrowUp" || key === "ArrowDown") &&
        v.line.lineIndex !== current.lineIndex))) return false;
    let position: Position, rect: NavigationRect, line: BodyLine | undefined, preferred: number | undefined;
    if (key === "Home" || key === "End") {
      line = v?.line ?? current;
      ({ position, rect } = a.bodyLineEdge(p, line, key === "End"));
    } else {
      const result = a.bodyVertical(p, key === "ArrowUp" ? -1 : 1, this.preferredX ?? v?.rect.x ?? -1);
      if (!result) return false;
      // Core body-only navigation cannot resolve a caret inside an inline table.
      // Use the existing cell boxes/layout path when the destination hosts one.
      if (a.hasBodyLayoutObject(result.position)) return false;
      ({ position, rect } = result); preferred = result.preferredX;
      const candidate = a.bodyLine(position);
      const edge = a.bodyLineEdge(position, candidate, false).rect;
      // Keep the returned rectangle verbatim. Attach a line identity only when
      // Core's explicit query agrees; no y tolerance or UI offset correction.
      if (edge.pageIndex === rect.pageIndex && edge.y === rect.y) line = candidate;
    }
    if (context.documentId !== a.documentId || context.revision !== a.revision ||
        context.selection !== JSON.stringify(this.selection)) throw Error("줄 탐색 대상이 변경되었습니다.");
    this.point(position, selecting);
    this.preferredX = preferred;
    this.visualCaret = { documentId: a.documentId, revision: a.revision,
      selection: JSON.stringify(this.selection), rect, line };
    return true;
  }
  // Existing Core visual edges retain the affinity of a wrapped screen line.
  // This is selection only: no transaction, document property or History entry.
  selectVisualLine(p: Position, lineIndex: number, origin?: {position:Position;lineIndex:number}) {
    const a=this.adapter;
    a.validate(p);
    if(p.kind!=="body"||a.hasBodyLayoutObject(p))throw Error("지원되는 본문 글줄을 선택하세요.");
    const line=a.bodyLine(p);
    if(line.lineIndex!==lineIndex)throw Error("화면 줄이 변경되었습니다. 다시 선택하세요.");
    let start=a.bodyLineEdge(p,line,false),end=a.bodyLineEdge(p,line,true);
    if(origin){
      a.validate(origin.position);
      if(origin.position.kind!=='body'||a.hasBodyLayoutObject(origin.position))throw Error('시작 글줄이 변경되었습니다.');
      const from=a.bodyLine(origin.position);
      if(from.lineIndex!==origin.lineIndex)throw Error('시작 글줄이 변경되었습니다.');
      const reverse=ordered(origin.position,p)[0]===p&&!samePosition(origin.position,p);
      start=a.bodyLineEdge(origin.position,from,reverse);end=a.bodyLineEdge(p,line,!reverse);
    }
    this.point(start.position);this.point(end.position,true);this.block=false;
    const identity={documentId:a.documentId,revision:a.revision,selection:JSON.stringify(this.selection)};
    this.selectionCaretOrigin={...identity,anchor:copy(start.position),rect:start.rect,line:origin?a.bodyLine(origin.position):line};
    this.visualCaret={...identity,rect:end.rect,line};
  }
  typing: Props = {};
  history: History;
  constructor(readonly adapter: RhwpAdapter) {
    this.history = new History(adapter);
  }
  refreshFontGeometry() {
    // Font supply changes derived geometry, never selection offsets or History.
    this.visualCaret = undefined;
    this.selectionCaretOrigin = undefined;
    this.preferredX = undefined;
  }
  reset() {
    this.visualCaret = undefined;
    this.selection = { kind: "caret", focus: start() };
    this.block = false;
    this.typing = {};
    this.preferredX = undefined;
  }
  /** @internal Replacement rollback preserves the original references. The
   * selection setter must run before block/typing/preferredX are restored. */
  captureDocumentReplacementRollback() {
    const state = {
      selection: this.selection,
      block: this.block,
      typing: this.typing,
      preferredX: this.preferredX,
    };
    return () => { Object.assign(this, state); };
  }
  private pointerOrigin?: {documentId:string;revision:number;page:number;x:number;y:number;focus:Position;selection:string};
  private clickScope?:{page:number;view:()=>boolean;entry:number;attempted:boolean;
    target?:ClickedTableTarget;selection?:Selection;published?:number; gripZero?:boolean;retired:boolean; note:(reason:string)=>void};
  /** Same pointer stack only: never carries a snapshot into the next input,
   * menu action, pointerup, MutationObserver or deferred page callback. */
  withClickedTablePointer(page:number,view:()=>boolean,note:(reason:string)=>void,run:()=>void) {
    if(this.clickScope){this.clickScope.retired=true;note("reentrant");return run();}
    const scope={page,view,note,entry:this.selectionGeneration,attempted:false,retired:false};
    this.clickScope=scope;
    try {run();}
    finally {this.clickScope=undefined;}
  }
  clickedTableDisplay() {
    const scope=this.clickScope,t=scope?.target;
    if(!scope||!t||scope.retired)return;
    if(scope.selection!==this.selection||this.selection.kind!=="caret"||scope.published!==this.selectionGeneration||
      this.reference!==t.reference||!t.matches(this.selection.focus)||!t.current()){
      scope.retired=true;scope.note("retired-before-display");return;
    }
    return t;
  }
  clickedTableDisplayGrid(p:Position,consumer:"guides"|"grip"|"properties") {
    const t=this.clickedTableDisplay();
    if(t?.ownsTable(p)){
      const scope=this.clickScope!;
      if(consumer==="grip"&&p.kind==="cell"&&p.cell===0&&t.position.cell!==0){
        scope.gripZero??=this.adapter.doc.getCellParagraphCount(p.sec,p.para,p.control,0)>0;
        if(!scope.gripZero||this.clickedTableDisplay()!==t)return;
      }
      const grid=t.grid();
      if(grid&&this.clickedTableDisplay()===t){this.clickScope?.note("grid-"+consumer);return grid;}
    }
  }
  /** Read-only presentation only. Command assertEditable() is untouched. */
  clickedTableDisplayChecks() {
    const t=this.clickedTableDisplay();
    if(!t)return;
    const a=this.adapter;
    const matches=(p:Position)=>this.clickedTableDisplay()===t&&t.matches(p);
    this.clickScope?.note("admission-reader");
    return {
      validate:(p:Position)=>{if(!matches(p))a.validate(p);},
      check:(p:Position)=>{
        if(!matches(p))return a.assertEditable(p);
        if(t.cellProtected)throw Error("보호된 셀은 편집할 수 없습니다.");
      },
    };
  }
  pointer(page: number, x: number, y: number, extend = false, start = false) {
    const a = this.adapter, drag = start ? undefined : this.pointerOrigin;
    // Only a continuous pointer gesture may restore its original scalar caret.
    // F5/Shift-click or any unrelated selection change keeps its own anchor.
    const cellDrag = extend && drag && drag.focus.kind === 'cell' &&
      drag.documentId === a.documentId && drag.revision === a.revision &&
      drag.selection === JSON.stringify(this.selection) ? drag : undefined;
    const origin = cellDrag && this.selection.kind === 'cells' ? cellDrag.focus :
      "anchor" in this.selection ? this.selection.anchor : this.selection.focus;
    const context = { documentId: a.documentId, revision: a.revision,
      selection: JSON.stringify(this.selection) };
    const hit = a.hitWithRect(page,x,y,!!this.clickScope&&start&&!extend);
    let p = hit.position;
    if (extend && origin.kind === "body" && p.kind === "cell") {
      const rootControl = cellPath(p)[0].controlIndex;
      const table = a.inline(p).find(t => t.controlIndex === rootControl);
      if (table) {
        // Extending a body block into an inline table includes its one logical
        // slot, irrespective of which nested cell or horizontal half was hit.
        // A selection originating inside a cell keeps the existing cell policy.
        const before = origin.sec < p.sec || (origin.sec === p.sec &&
          (origin.para < p.para || (origin.para === p.para && origin.offset <= table.offset)));
        p = {
          kind: "body",
          sec: p.sec,
          para: p.para,
          offset: table.offset + (before ? 1 : 0),
        };
      }
    }
    if (context.documentId !== a.documentId || context.revision !== a.revision ||
        context.selection !== JSON.stringify(this.selection)) throw Error("클릭 대상이 변경되었습니다.");
    if(extend&&origin.kind==='cell'){
      let cell=p.kind==='cell'?p:undefined;
      if(cell&&!sameTable(origin,cell)){
        const source=cellPath(origin),target=cellPath(cell),depth=source.length;
        if(cell.sec===origin.sec&&cell.para===origin.para&&target.length>=depth&&JSON.stringify(target.slice(0,depth-1))===JSON.stringify(source.slice(0,-1))&&target[depth-1].controlIndex===source[depth-1].controlIndex)
          cell=a.fromPath(origin.sec,origin.para,target.slice(0,depth).map((e,i)=>i===depth-1?{...e,cellParaIndex:0}:e),0) as Extract<Position,{kind:'cell'}>;
      }
      if(!cell||!sameTable(origin,cell)){
        const boxes=a.cells(origin);const nearest=boxes.filter(b=>b.pageIndex===page).sort((u,v)=>{
          const dist=(b:typeof u)=>Math.max(b.x-x,0,x-b.x-b.w)**2+Math.max(b.y-y,0,y-b.y-b.h)**2;
          return dist(u)-dist(v);
        })[0];
        if(nearest)cell={...origin,cell:nearest.cellIdx,cellPara:0,offset:0};
      }
      if(cell&&sameTable(origin,cell)&&cell.cell!==origin.cell){
        const candidate:Selection={kind:'cells',phase:2,anchor:{...origin,cellPara:0,offset:0},focus:{...cell,cellPara:0,offset:0}};
        this.validateSelection(candidate);this.selection=candidate;this.visualCaret=undefined;this.typing={};this.preferredX=undefined;this.block=false;
        this.pointerOrigin=cellDrag?{...cellDrag,selection:JSON.stringify(candidate)}:undefined;return;
      }
      if(this.selection.kind==='cells'&&cell&&sameTable(origin,cell)){
        // Re-entering the source cell resumes the actual text hit, not a sticky
        // single-cell block or its normalized offset0. No fabricated endpoint.
        const candidate:Selection=cellDrag&&sameContainer(origin,p)
          ? samePosition(origin,p)?{kind:'caret',focus:copy(origin)}
            :{kind:'text',anchor:copy(origin),focus:copy(p)}
          :{kind:'cells',phase:2,anchor:copy(origin),focus:{...cell,cellPara:0,offset:0}};
        this.validateSelection(candidate);this.selection=candidate;this.visualCaret=undefined;
        this.pointerOrigin=cellDrag?{...cellDrag,selection:JSON.stringify(candidate)}:undefined;return;
      }
      // Crossing a child control or leaving the table must not reset a parent
      // drag into that other owner. Resume text hits only in the origin cell;
      // another real cell above already becomes an exact cell block.
      if(!sameContainer(origin,p))return;
    }
    if (extend && origin.kind === 'cell' && !sameContainer(origin,p) &&
        ownsMixedCellPictureHit(a,origin,page,x,y)) {
      // Retain the real cell anchor while crossing its inline image. Resume
      // from Core's next valid cell text hit; image endpoints/affinity are not
      // represented by fabricated offsets or an enclosing-body selection.
      return;
    }
    if (extend && drag && drag.documentId === a.documentId && drag.revision === a.revision &&
        drag.page === page && samePosition(drag.focus, p) && samePosition(origin, p)) {
      const row = inlineCellPicture(a, p);
      if (row) {
        const selection: Selection = {kind:'object',focus:copy(row.focus),control:row.control};
        if (inlineCellPictureBoxes(a, selection).some(b => crossesPicture(b,page,drag.x,drag.y,x,y))) {
          this.selection = selection; this.visualCaret = undefined; this.typing = {}; this.preferredX = undefined;
          return;
        }
      }
    }
    const scope=this.clickScope;
    let scoped=false;
    if(scope&&!scope.retired&&!scope.attempted&&start&&!extend&&scope.page===page&&scope.entry===this.selectionGeneration){
      scope.attempted=true;
      const read=prepareClickedTable(a,p,page,x,y,hit.tableWitness,scope.view,scope.note);
      if(scope.retired||scope.entry!==this.selectionGeneration||!scope.view()){
        scope.note("stale-before-install");
        throw Error("클릭 대상이 변경되었습니다.");
      }
      if("target" in read&&read.target.current()){
        const target=read.target;
        const selected:Selection={kind:"caret",focus:p};
        this.pointSelection(selected,target.reference);
        scope.target=target;scope.selection=selected;scope.published=this.selectionGeneration;
        scope.note("selected-local");scoped=true;
      }else scope.note("reason" in read?read.reason:"selection-changed");
    }
    if(!scoped)this.point(p, extend && !(cellDrag && samePosition(cellDrag.focus,p)));
    this.pointerOrigin = extend ? drag && {...drag,selection:JSON.stringify(this.selection)}
      : {documentId:a.documentId,revision:a.revision,page,x,y,focus:copy(p),selection:JSON.stringify(this.selection)};
    if (!extend) this.block = false;
    if (hit.rect && hit.line && samePosition(p, hit.position))
      this.visualCaret = { documentId: a.documentId, revision: a.revision,
        selection: JSON.stringify(this.selection), rect: hit.rect, line: hit.line };
  }
  point(p: Position, extend = false) {
    this.pointerOrigin = undefined;
    this.adapter.validate(p);
    const old = this.selection;
    this.pointSelection(extend && sameContainer("anchor" in old ? old.anchor : old.focus, p)
      ? {kind:"text",anchor:copy("anchor" in old ? old.anchor : old.focus),focus:p}
      : {kind:"caret",focus:p});
  }
  private pointSelection(selection:Selection,reference?:SelectionReference) {
    this.pointerOrigin=undefined;
    this.allSelectionOrigin=undefined;
    this.visualCaret=undefined;
    this.setSelection(selection,reference);
    this.preferredX=undefined;
    this.typing={};
  }
  cells(s: Selection = this.selection) {
    this.resolveCurrent(s);
    // A paginated cell has several paint boxes but is one mutation target.
    return this.uniqueCells(this.cellBoxes(s));
  }
  private uniqueCells(boxes: ReturnType<Interaction["cellBoxes"]>) {
    return [...new Map(boxes.map(c => [c.cellIdx, c])).values()].sort((a,b) => a.row-b.row || a.col-b.col);
  }
  private cellBoxes(s: Selection = this.selection,
    observeFullGrid?: (grid: ReturnType<RhwpAdapter["cells"]>) => void) {
    if (s.kind !== "cells" && s.kind !== "table") return [];
    this.adapter.validate({ ...s.focus, cellPara: 0, offset: 0 });
    if (s.kind === "cells") {
      this.adapter.validate({ ...s.anchor, cellPara: 0, offset: 0 });
      if (!sameTable(s.anchor, s.focus))
        throw Error(
          "부모·자식 또는 서로 다른 표의 셀 선택은 지원하지 않습니다.",
        );
    }
    const all = this.adapter.cells(s.focus);
    observeFullGrid?.(all);
    if (s.kind === "table" || s.phase === 3) return all;
    const a = all.find((c) => c.cellIdx === s.anchor.cell)!;
    const b = all.find((c) => c.cellIdx === s.focus.cell)!;
    if (!a || !b) throw Error("셀 선택이 만료되었습니다.");
    let r0 = Math.min(a.row, b.row),
      r1 = Math.max(a.row + a.rowSpan - 1, b.row + b.rowSpan - 1),
      c0 = Math.min(a.col, b.col),
      c1 = Math.max(a.col + a.colSpan - 1, b.col + b.colSpan - 1);
    // Close the rectangle over real merged spans; never invent cells or split
    // a merged owner just because its anchor was not an original endpoint.
    for(let changed=true;changed;){changed=false;for(const c of all)if(c.row<=r1&&c.row+c.rowSpan>r0&&c.col<=c1&&c.col+c.colSpan>c0){
      const next=[Math.min(r0,c.row),Math.max(r1,c.row+c.rowSpan-1),Math.min(c0,c.col),Math.max(c1,c.col+c.colSpan-1)];
      if(next.some((n,i)=>n!==[r0,r1,c0,c1][i])){[r0,r1,c0,c1]=next;changed=true;}
    }}
    return all.filter(
      (c) =>
        c.row <= r1 &&
        c.row + c.rowSpan > r0 &&
        c.col <= c1 &&
        c.col + c.colSpan > c0,
    );
  }
  targets(s: Selection = this.selection): {
    p: Position;
    end: number;
  }[] {
    const a = this.adapter;
    if (s.kind === "object") throw Error("개체 서식은 아직 지원하지 않습니다.");
    if (s.kind === "cells" || s.kind === "table")
      return this.blockTargets(s, this.cells(s));
    if (s.kind === "caret") return [{ p: s.focus, end: s.focus.offset }];
    const [from, to] = ordered(s.anchor, s.focus);
    const bodyTargets = Array.from(
      { length: paraIndex(to) - paraIndex(from) + 1 },
      (_, i) => {
        const p = {
          ...withPara(from, paraIndex(from) + i),
          offset: i === 0 ? from.offset : 0,
        };
        return {
          p,
          end: paraIndex(p) === paraIndex(to) ? to.offset : a.length(p),
        };
      },
    );
    return bodyTargets.flatMap((t) => {
      if (t.p.kind !== "body") return [t];
      const cells = a
        .inline(t.p)
        .filter((table) => table.offset >= t.p.offset && table.offset < t.end)
        .flatMap((table) =>
          this.targets({
            kind: "table",
            focus: {
              kind: "cell",
              sec: t.p.sec,
              para: t.p.para,
              control: table.controlIndex,
              cell: 0,
              cellPara: 0,
              offset: 0,
            },
          }),
        );
      return [t, ...cells];
    });
  }
  private blockTargets(s: Extract<Selection, {kind:"cells" | "table"}>,
    cells: ReturnType<Interaction["cells"]>): ReturnType<Interaction["targets"]> {
    const a = this.adapter;
    return cells.flatMap((c) =>
        Array.from(
          {
            length: a.count({
              ...s.focus,
              cell: c.cellIdx,
              cellPara: 0,
              offset: 0,
            }),
          },
          (_, cellPara) => {
            const p: Position = {
              ...s.focus,
              cell: c.cellIdx,
              cellPara,
              offset: 0,
            };
            return { p, end: a.length(p) };
          },
        ),
      );
  }
  private formatTargets(kind: FormatKind, s: Selection, prepared?:ReturnType<Interaction["targets"]>) {
    if (kind === "cell") {
      if (s.focus.kind !== "cell" || nested(s.focus))
        throw Error("Core API 미지원: 본문 또는 중첩 셀의 셀 속성");
      const p = s.focus;
      const cells =
        s.kind === "cells" || s.kind === "table"
          ? this.cells(s)
          : [{ cellIdx: p.cell }];
      return cells.map((c) => ({
        p: { ...p, cell: c.cellIdx, cellPara: 0, offset: 0 } as Position,
        end: 0,
      }));
    }
    const end = s.kind === "text" ? ordered(s.anchor, s.focus)[1] : undefined;
    return (prepared??this.targets(s)).filter((t) =>
      kind === "paragraph"
        ? !(
            end &&
            end.offset === 0 &&
            sameContainer(t.p, end) &&
            paraIndex(t.p) === paraIndex(end) &&
            "anchor" in s &&
            !samePosition(s.anchor, s.focus)
          )
        : t.p.kind === "cell" ||
          s.kind === "caret" ||
          this.adapter.textOffset(t.p, t.end) > this.adapter.textOffset(t.p),
    );
  }

  private formatSamples(
    kind: FormatKind,
    t: { p: Position; end: number },
  ): any[] {
    const a = this.adapter;
    if (kind === "cell") return [a.cellProps(t.p)];
    if (kind === "paragraph") return [a.paraProps(t.p)];
    const from = a.textOffset(t.p),
      end = a.textOffset(t.p, t.end);
    if (this.viewFormats && end > from) {
      // The existing range getter covers every character, including mixed
      // formatting. UI projections need one sample per shape run, not one
      // WASM/JSON crossing per selected character. Commands keep their path.
      const runs: { startOffset: number; endOffset: number; charShapeId: number }[] =
        t.p.kind === "body"
          ? a.call("getCharShapeRuns", t.p.sec, t.p.para, from, end)
          : a.call("getCharShapeRunsInCellByPath", t.p.sec, t.p.para, a.path(t.p), from, end);
      let next = from;
      const samples = runs.map(run => {
        if (run.startOffset !== next || !Number.isSafeInteger(run.endOffset) ||
            run.endOffset <= next || run.endOffset > end)
          throw Error("선택한 글자 모양 구간을 확인할 수 없습니다.");
        next = run.endOffset;
        const props = a.charProps({ ...t.p, offset: a.logical(t.p, run.startOffset) });
        if (props.charShapeId !== run.charShapeId)
          throw Error("선택한 글자 모양 참조가 일치하지 않습니다.");
        return props;
      });
      if (next !== end) throw Error("선택한 글자 모양 범위가 일치하지 않습니다.");
      return samples;
    }
    return Array.from({ length: Math.max(1, end - from) }, (_, n) =>
      a.charProps({ ...t.p, offset: a.logical(t.p, from + n) }),
    );
  }
  formatState(kind: FormatKind, s: Selection = this.selection): FormatState {
    if (!this.viewFormats || (this.adapter.nativeMutationGeneration()!==undefined && !this.viewOwners?.isCurrent(this.adapter)))
      return this.readFormatState(kind, s);
    const key = JSON.stringify([this.adapter.documentId, this.adapter.revision, this.adapter.nativeMutationGeneration(), kind, s, this.typing]);
    let state = this.viewFormats.get(key);
    if (!state) {
      state = this.readFormatState(kind, s);
      this.viewFormats.set(key, state);
    }
    return copy(state);
  }
  /** @internal Retired display reads may not replay an already prepared value. */
  freshDisplayFormat(kind:FormatKind):FormatState {return this.readFormatState(kind,this.selection);}
  /** Read-only visible values at a current canonical caret. No admission is cached.
   * Global canonical resolution remains on every real command. Local ID is only
   * compared with an already captured canonical endpoint, never stored as one. */
  currentCaretDisplayFormat(kind:FormatKind):FormatState|undefined {
    const a=this.adapter,s=this.selection,ref=this.reference;
    if(kind==="cell"||s.kind!=="caret"||s.focus.kind!=="cell"||nested(s.focus)||
       this.selectionError||!ref?.focus||ref.documentId!==a.documentId||a.transientEdit||
       a.hasPendingLocalBodyFlow()||a.nativeMutationGeneration()===undefined)return;
    const p=copy(s.focus),t=ref.focus.target,hop=t.path[0],generation=this.selectionGeneration;
    if(t.sectionIndex!==p.sec||t.parentParaIndex!==p.para||t.path.length!==1||
       hop.controlIndex!==p.control||hop.cellIndex!==p.cell||hop.cellParaIndex!==p.cellPara||
       ref.focus.offset!==p.offset)return;
    const fence=a.tablePreviewFence();
    const current=()=>fence()&&this.selection===s&&this.reference===ref&&
      this.selectionGeneration===generation&&!this.selectionError&&samePosition(s.focus,p);
    if(!current())return;
    try {
      const native=a.displayPathIdentity(p);
      if(!native.ok||native.kind!=="cell"||native.expectedTargetId!==t.targetId||!current())return;
      // Native identity can survive earlier text deletion. Use current scalar
      // length, never the captured target's old length or a clamped offset.
      const length=a.doc.getCellParagraphLength(p.sec,p.para,p.control,p.cell,p.cellPara);
      if(!Number.isSafeInteger(length)||length<0||!Number.isSafeInteger(p.offset)||
        p.offset<0||p.offset>length||!current())return;
      const value=this.readFormatState(kind,s,[{p,end:p.offset}]);
      if(current())return value;
    }catch{/* Unsupported/retired display falls back, never grants permission. */}
  }
  presentationFormatState(kind: FormatKind): FormatState {
    // Keep exact existing aggregation. The block producer shares only input
    // geometry and target paragraphs, not a protection/command decision.
    const click=kind!=="cell"&&this.clickedTableDisplay();
    if(click){
      const s=this.selection;
      const value=this.readFormatState(kind,s,[{p:s.focus,end:s.focus.offset}]);
      if(this.clickedTableDisplay()===click){this.clickScope?.note("format-consumed");return value;}
    }
    if (kind === "cell" || !this.blockPresentation) return this.formatState(kind);
    const s = this.selection, targets = this.blockPresentation.targets();
    return targets ? this.readFormatState(kind, s, targets) : this.formatState(kind);
  }
  private readFormatState(kind: FormatKind, s: Selection, displayTargets?: ReturnType<Interaction["targets"]>): FormatState {
    return this.adapter.withUpdateReads(() => {
    if (!displayTargets) this.validateSelection(s);
    // A collapsed range still has a real caret owner. Do not turn a tiny
    // pointer move / Shift reversal into an empty sample set or a stale font.
    if (s.kind === "text" && samePosition(s.anchor, s.focus))
      s = { kind: "caret", focus: s.focus };
    const targets = this.formatTargets(kind, s, displayTargets);
    const rows = targets.flatMap((t) =>
      this.formatSamples(kind, t),
    );
    if (kind === "char" && s.kind === "caret" && rows.length) {
      rows[0] = { ...rows[0], ...this.typing };
      if (typeof this.typing.fontFamily === "string")
        rows[0].fontFamilies = Array(7).fill(this.typing.fontFamily);
    }
    const displayedRows = rows.map((p) => displayed(kind, p));
    const state = mixed(displayedRows);
    if (kind === "char") state.__fontChoices = [...new Set(displayedRows.flatMap(p =>
      Array.from({length: 7}, (_, i) => p[`fontLanguage${i}`])
        .filter((name): name is string => typeof name === "string" && !!name.trim())
    ))];
    // UI-only scope metadata; imported properties remain available to Core.
    if (kind === "char")
      state.__bodyCharacterOffsetsHold = targets.some(
        (t) => t.p.kind === "body",
      );
    if (kind === "paragraph")
      state.__bodyLineProtectionHold = targets.some(
        (t) => t.p.kind === "body",
      );
    if (kind === "cell" && s.focus.kind === "cell") {
      const selected = new Set(targets.map(t => t.p.kind === "cell" ? t.p.cell : -1));
      state.__cellLayoutHold = this.adapter.cells(s.focus).some(c => selected.has(c.cellIdx) && (c.rowSpan !== 1 || c.colSpan !== 1));
    }
    return state;
    });
  }
  paragraphAdjustmentPlan(change: ParagraphAdjustment, s: Selection = this.selection, owners?:OwnerProjection, prepared?:ReturnType<Interaction["targets"]>, checkEditable?:(p:Position)=>void) {
    this.validateSelection(s);
    this.assertSupportedSelection(s,owners);
    return prepareParagraphAdjustment(this.adapter, this.formatTargets("paragraph", s, owners?.isCurrent(this.adapter)?prepared:undefined), change, checkEditable);
  }
  styleTargets(s: Selection = this.selection, queryOnly = false) {
    this.validateSelection(s);
    this.assertSupportedSelection(s);
    const targets = this.formatTargets("paragraph", s);
    for (const { p } of targets) {
      this.adapter.assertEditable(p);
      if (nested(p)) throw Error("중첩 셀 스타일 적용은 미지원입니다");
      if (!queryOnly && p.kind === "cell")
        throw Error(
          "NOT_SUPPORTED: Core22 셀 스타일 API가 스타일 ID만 바꾸고 실제 서식을 적용하지 않습니다.",
        );
    }
    return targets;
  }
  private formatPlan(kind: FormatKind, props: Props, s: Selection, borders?: CellBorderDraft, cellScope?: 'block') {
    if(cellScope && (kind!=='cell'||s.kind!=='cells'||s.focus.kind!=='cell'||nested(s.focus)||borders))
      throw Error('하나의 셀 범위의 일반 셀 블록을 다시 선택하세요. 원본은 유지됩니다.');
    const blockPlan=cellScope && s.focus.kind==='cell'
      ? cellBlockPlan(this.adapter.cells(s.focus),this.formatTargets(kind,s).map(t=>(t.p as Extract<Position,{kind:'cell'}>).cell),props) : undefined;
    const byCell = borders && kind === "cell" && s.focus.kind === "cell"
      ? cellBorderPlan(this.adapter.cells(s.focus), this.formatTargets(kind,s).map(t => (t.p as Extract<Position,{kind:"cell"}>).cell), borders)
      : undefined;
    return this.formatTargets(kind, s)
      .map((t) => {
        const requested = blockPlan && t.p.kind==='cell' ? blockPlan.get(t.p.cell)??{} : byCell && t.p.kind === "cell" ? {...props,...byCell.get(t.p.cell)} : props;
        const samples = this.formatSamples(kind, t);
        const delta = Object.fromEntries(
          Object.entries(requested).filter(
            ([k, v]) =>
              !samples.every((raw) => matches(kind, raw, k, v, requested)),
          ),
        );
        if (
          kind === "paragraph" &&
          ("spacingBefore" in delta || "spacingAfter" in delta) &&
          "spacingUnitScale" in props
        )
          delta.spacingUnitScale = props.spacingUnitScale;
        return {
          ...t,
          props: delta,
          paragraphTarget:
            kind === "paragraph" && nested(t.p)
              ? this.adapter.captureParagraph(t.p)
              : undefined,
        };
      })
      .filter((t) => Object.keys(t.props).length);
  }
  f5(readEpoch?: () => F5Epoch | undefined) {
    const s = this.selection;
    if (s.focus.kind !== "cell") return;
    let fullGridLast: number | undefined;
    if (readEpoch && s.kind === "cells" && s.phase === 2 && !nested(s.anchor) && !nested(s.focus)) {
      const a = this.adapter, native = a.doc, generation = this.selectionGeneration;
      this.validateSelection(s, () => {
        let started = false, validated = false;
        const stamp = () => {
          try {
            const value = readEpoch();
            return value && JSON.stringify(value);
          } catch { return undefined; } // optional screen witness, never validation
        };
        try {
          // Nested inside the original validation read scope, never widen it.
          a.withBodyLineReadFence(current => {
            if (!current?.()) return;
            const before = stamp();
            if (before === undefined) return;
            started = true;
            this.resolveCurrent(s);
            const owner = JSON.stringify(s);
            let last: number | undefined;
            const selected = this.cellBoxes(s, grid => {
              try {
                if (ordinaryF5Grid(s, grid)) last = this.uniqueCells(grid).at(-1)?.cellIdx;
              } catch { /* An unknown grid still runs the original validation and read. */ }
            });
            this.uniqueCells(selected);
            validated = true;
            // Only a scalar survives the original validation's return. Never
            // let geometry or permissions follow the new selection generation.
            if (last !== undefined && this.selection === s && this.selectionGeneration === generation &&
                a.doc === native && owner === JSON.stringify(s) && before === stamp() && current())
              fullGridLast = last;
          });
        } catch (error) {
          if (started && !validated) throw error; // authoritative failure
          fullGridLast = undefined;
        }
        if (!validated) this.cells(s);
      });
    } else this.validateSelection(s);
    if (s.kind !== "cells" || s.phase === 3)
      this.selection = {
        kind: "cells",
        anchor: copy(s.focus),
        focus: copy(s.focus),
        phase: 1,
      };
    else if (s.phase === 1)
      this.selection = {
        ...s,
        phase: 2,
      };
    else {
      // Whole-table F5 activates the last owned logical cell. Keep the block
      // anchor and scope; Esc/re-entry then use this focus without moving text.
      const last = fullGridLast === undefined
        ? this.cells({ ...s, phase: 3 }).at(-1)
        : {cellIdx: fullGridLast};
      if (!last) throw Error("전체 선택할 표의 셀이 없습니다.");
      this.selection = {
        ...s,
        phase: 3,
        focus: { ...s.focus, cell: last.cellIdx, cellPara: 0, offset: 0 },
      };
    }
    this.block = false;
  }
  extendCells() {
    const s = this.selection;
    if (s.kind !== 'cells') throw Error('셀 블록을 먼저 선택하세요.');
    this.validateSelection(s);
    if (s.phase === 1) this.selection = { ...s, phase: 2 };
    this.block = false;
  }
  startCellExtension() {
    const s=this.selection;
    if(s.focus.kind!=='cell'||!['caret','text','cells'].includes(s.kind))throw Error('표 안의 현재 셀을 먼저 선택하세요.');
    this.validateSelection(s);
    const candidate:Selection={kind:'cells',phase:2,anchor:copy(s.focus),focus:copy(s.focus)};
    this.validateSelection(candidate);this.resetBlockSequence();this.selection=candidate;this.block=false;this.preferredX=undefined;
  }
  selectCellRows(columns=false) {
    const s = this.selection;
    if (s.kind !== 'cells') throw Error('F5로 셀 블록을 먼저 선택하세요.');
    this.validateSelection(s);
    const plan = (columns?cellColumnBlock:cellRowBlock)(this.adapter.cells(s.focus), this.cells(s).map(c => c.cellIdx));
    const candidate: Selection = { kind: 'cells', phase: 2,
      anchor: { ...s.focus, cell: plan.anchor, cellPara: 0, offset: 0 },
      focus: { ...s.focus, cell: plan.focus, cellPara: 0, offset: 0 } };
    this.validateSelection(candidate);
    if (JSON.stringify(this.cells(candidate).map(c => c.cellIdx)) !== JSON.stringify(plan.ids))
      throw Error('현재 선택 모델로 줄 전체 범위를 표현할 수 없습니다. 기존 선택을 유지합니다.');
    this.selection = candidate;
    this.block = false;
  }
  nextBodyObject(backward=false) {
    this.validateSelection(this.selection);const s=this.selection;
    if(s.kind!=='table'&&(s.kind!=='object'||s.focus.kind!=='body')||nested(s.focus))throw Error('본문 개체를 선택한 상태에서 사용하세요.');
    const a=this.adapter,positions:{sec:number;para:number}[]=[];
    for(let sec=0;sec<a.doc.getSectionCount();sec++)for(let para=0;para<a.doc.getParagraphCount(sec);para++)positions.push({sec,para});
    const rows=a.call<any[]>('getObjectCycle').sort((a,b)=>a.page-b.page||a.z-b.z||a.para-b.para||a.controlIndex-b.controlIndex);
    const current=positions.findIndex(p=>p.sec===s.focus.sec&&p.para===s.focus.para),control=s.kind==='table'?s.focus.control:s.control;
    const at=rows.findIndex(r=>r.para===current&&r.controlIndex===control);
    if(at<0)throw Error('현재 본문 개체의 소유 경로를 확인할 수 없습니다.');
    const row=rows[(at+(backward?-1:1)+rows.length)%rows.length],owner=positions[row.para];
    if(!owner)throw Error('다음 개체의 본문 소유자가 없습니다.');
    const source=a.call<any[]>('getObjects').find(r=>r.para===row.para&&r.controlIndex===row.controlIndex);
    let next:Selection;
    if(source?.kind==='table')next={kind:'table',focus:{kind:'cell',...owner,control:row.controlIndex,cell:0,cellPara:0,offset:0}};
    else {const object=bodyClipboardObjects(a).find(r=>r.sec===owner.sec&&r.para===owner.para&&r.control===row.controlIndex);if(!object)throw Error('다음 개체의 기존 선택 계약을 확인할 수 없습니다.');next={kind:'object',control:row.controlIndex,focus:{kind:'body',...owner,offset:object.anchor}};}
    this.validateSelection(next);this.selection=next;this.block=false;this.typing={};this.preferredX=undefined;
  }
  moveCellNeighbour(key:string) {
    this.validateSelection(this.selection);
    const s=textSelection(this.selection),p=s.focus;
    if(p.kind!=='cell')throw Error('셀 안의 글자 커서에서 사용하세요.');
    const all=[...new Map(this.adapter.cells(p).map(c=>[c.cellIdx,c])).values()];
    const c=all.find(c=>c.cellIdx===p.cell);if(!c)throw Error('현재 셀의 소유 배치를 확인할 수 없습니다.');
    const row=c.row+(key==='ArrowDown'?c.rowSpan:key==='ArrowUp'?-1:0),col=c.col+(key==='ArrowRight'?c.colSpan:key==='ArrowLeft'?-1:0);
    const targets=all.filter(c=>row>=c.row&&row<c.row+c.rowSpan&&col>=c.col&&col<c.col+c.colSpan);
    if(!targets.length)return;
    if(targets.length!==1)throw Error('인접 셀 경계가 모호합니다. 기존 선택을 유지합니다.');
    const target={...p,cell:targets[0].cellIdx,cellPara:0,offset:0};this.adapter.validate(target);this.point(target);
  }
  leaveTable() {
    this.validateSelection(this.selection);
    const p=this.selection.focus;
    if(p.kind!=='cell'||nested(p))throw Error('일반 본문 표에서만 정확한 바깥 커서로 이동합니다.');
    const host:Position={kind:'body',sec:p.sec,para:p.para,offset:0};
    const slot=this.adapter.inline(host).find(c=>c.controlIndex===p.control);
    if(!slot)throw Error('글자처럼 취급 표의 본문 경계를 확인할 수 없습니다. 기존 선택을 유지합니다.');
    // Same-input native B02 exits before the root control. Use the queried
    // logical slot, not a native raw address or the position after the table.
    const target={...host,offset:slot.offset};this.adapter.validate(target);this.point(target);
  }
  selectTable() {
    const p = this.selection.focus;
    if (p.kind === "cell") this.selection = { kind: "table", focus: copy(p) };
  }
  selectAll() {
    this.validateSelection(this.selection);
    const focus = copy(this.allSelectionFocus() ?? this.selection.focus);
    const rect = this.cursorRect();
    const p = this.selection.focus;
    const first = { ...withPara(p, 0), offset: 0 };
    const last = withPara(p, this.adapter.count(p) - 1);
    this.selection = {
      kind: "text",
      anchor: first,
      focus: { ...last, offset: this.adapter.length(last) },
    };
    // Full logical endpoints still own copy/edit. Only the caret presentation
    // stays at the position from which Select All was requested.
    const context = { documentId: this.adapter.documentId, revision: this.adapter.revision,
      selection: JSON.stringify(this.selection) };
    this.visualCaret = { ...context, rect };
    this.allSelectionOrigin = { ...context, focus };
  }
  private blockSequence?: { stage: number; origin: Position; documentId: string; revision: number; selection: string };
  resetBlockSequence() { this.blockSequence = undefined; }
  advanceBlock() {
    this.validateSelection(this.selection);
    const a = this.adapter, s = this.selection;
    // Preserve the pre-existing cell-text toggle; F5 cell blocks are routed to
    // extendCells instead. Never turn a cell's contents into "whole document".
    if (s.focus.kind === 'cell' && (s.kind === 'caret' || s.kind === 'text')) {
      this.resetBlockSequence();
      this.block = !this.block;
      if (!this.block) this.cancelBlock();
      return;
    }
    if (s.focus.kind !== 'body' || (s.kind !== 'caret' && s.kind !== 'text'))
      throw Error('본문 텍스트에서 블록을 설정하세요. 셀·개체 선택은 유지됩니다.');
    const previous = this.blockSequence;
    const continuous = previous && previous.documentId === a.documentId && previous.revision === a.revision &&
      previous.selection === JSON.stringify(s);
    const stage = continuous ? Math.min(previous.stage + 1, 4) : 1;
    const origin = copy(continuous ? previous.origin : s.focus);
    if (stage === 2) {
      const [anchor, focus] = f3WordRange(a, origin);
      const candidate: Selection = { kind: 'text', anchor, focus };
      this.validateSelection(candidate);
      this.selection = candidate;
    } else if (stage === 3) {
      const candidate: Selection = { kind: 'text', anchor: {...origin,offset:0}, focus: {...origin,offset:a.length(origin)} };
      this.validateSelection(candidate);
      this.selection = candidate;
    } else if (stage === 4 && (!continuous || previous.stage !== 4)) {
      if (a.doc.getSectionCount() !== 1)
        throw Error('다른 구역까지의 전체 블록은 기존 선택 모델에서 지원하지 않습니다. 현재 선택을 유지합니다.');
      this.selectAll();
    }
    this.block = true;
    this.blockSequence = { stage, origin, documentId:a.documentId, revision:a.revision, selection:JSON.stringify(this.selection) };
  }
  cancelBlock() {
    this.resetBlockSequence();
    this.block = false;
    this.point(copy(this.allSelectionFocus() ?? this.selection.focus));
  }
  undo(redo = false) {
    try { return this.undoObserved(redo); } catch(error) { freezeDiagnosticFor(error,'COMMAND_FAILED','interaction'); throw error; }
  }
  private undoObserved(redo: boolean) {
    this.visualCaret = undefined;
    const s = this.history.travel(redo);
    if (s) {
      this.selection = s;
      this.typing = {};
      this.block = false;
      this.preferredX = undefined;
    }
  }
  documentBoundary(end: boolean, extend = false) {
    this.validateSelection(this.selection);
    const a = this.adapter;
    const sec = end ? a.doc.getSectionCount() - 1 : 0;
    let target: Position = { kind: "body", sec, para: 0, offset: 0 };
    if (end) {
      target = withPara(target, a.count(target) - 1);
      target.offset = a.length(target);
    }
    // Native logical offsets include inline controls. Never infer an endpoint
    // from rendered glyphs or preserve a cell/path handle across containers.
    if (extend) {
      const s = this.selection, anchor = "anchor" in s ? s.anchor : s.focus;
      if ((s.kind !== "caret" && s.kind !== "text") || s.focus.kind !== "body" || anchor.kind !== "body")
        throw Error("문서 처음·끝까지 선택 확장은 본문 텍스트에서만 지원합니다. 셀·개체 선택은 유지됩니다.");
      if (!sameContainer(anchor, target))
        throw Error("다른 구역까지의 본문 선택은 지원하지 않습니다. 기존 선택을 유지합니다.");
    }
    this.point(target, extend);
    this.block = false;
  }
  // Original navigation keys reuse the normal owner/offset checks and point().
  // Page navigation is a caret move, not the status bar's scroll-only command.
  navigateBoundary(kind: 'paragraph-start' | 'paragraph-end' | 'page-start', nextPage = false) {
    this.validateSelection(this.selection);
    const s = this.selection, a = this.adapter, p = s.focus;
    if (s.kind !== 'caret' && s.kind !== 'text')
      throw Error('문단·쪽 이동은 본문/셀 텍스트 커서에서 사용하세요. 셀 블록·개체 선택은 유지됩니다.');
    let target: Position;
    if (kind === 'paragraph-start') {
      target = paragraphPosition(a,p,0);
    } else if (kind === 'paragraph-end') {
      target = { ...copy(p), offset: a.length(p) };
    } else {
      const page = this.cursorRect().pageIndex + (nextPage ? 1 : -1);
      if (page < 0 || page >= a.pageCount) return;
      // Owner filtering precedes text-to-logical conversion, as in ordinary
      // navigation. Headers/footers never become fabricated body addresses.
      const line = this.lines(undefined, page)[0];
      if (!line) throw Error('이 쪽의 지원되는 편집 시작 위치를 조회할 수 없습니다. 기존 선택을 유지합니다.');
      const run = line.runs[0];
      target = a.position(run, run.charStart);
    }
    a.validate(target);
    // F3 is the existing extension mode for cursor navigation. Never turn a
    // cross-container page move into an implicit collapse or mixed-owner block.
    if (this.block && !sameContainer('anchor' in s ? s.anchor : p, target))
      throw Error('다른 본문·셀로 블록을 확장할 수 없습니다. 기존 선택을 유지합니다.');
    this.point(target, this.block);
  }
  moveParagraph(direction: -1 | 1) {
    this.validateSelection(this.selection);
    const s = this.selection;
    if (s.kind !== 'caret' && s.kind !== 'text')
      throw Error('문단 이동은 본문·셀 텍스트 커서에서 사용하세요. 셀·개체 블록은 유지됩니다.');
    const collapse = !this.block && s.kind === 'text' && !samePosition(s.anchor,s.focus);
    const origin = collapse ? ordered(s.anchor,s.focus)[direction > 0 ? 1 : 0] : s.focus;
    // Resolve/validate before changing a block, including stale owner refusal.
    const target = paragraphPosition(this.adapter,origin,direction);
    this.point(copy(collapse ? origin : target),this.block);
  }
  moveWord(direction: -1 | 1, across=false) {
    this.validateSelection(this.selection);
    const s = this.selection;
    if (s.kind !== 'caret' && s.kind !== 'text')
      throw Error('본문·셀 텍스트 커서에서 단어를 이동하세요. 셀·개체 블록은 유지됩니다.');
    // Reuse normal direction-key collapse semantics for an ordinary block.
    // Resolve the Core path FIRST: a rejected word query must not lose a block.
    const collapse = !this.block && s.kind === 'text' && !samePosition(s.anchor,s.focus);
    const origin = collapse ? ordered(s.anchor,s.focus)[direction > 0 ? 1 : 0] : s.focus;
    const target = (across?wordAcrossPosition:wordPosition)(this.adapter, origin, direction);
    this.point(copy(collapse ? origin : target), this.block);
  }
  move(key: string, extend = false, viewport = 600) {
    this.validateSelection(this.selection);
    const a = this.adapter,
      s = this.selection,
      p = s.focus;
    if (s.kind === "cells") {
      if (s.phase === 3) return;
      const all = a.cells(s.focus),
        c = all.find((c) => c.cellIdx === s.focus.cell)!;
      const lastRow = Math.max(...all.map((c) => c.row + c.rowSpan - 1));
      let row = c.row,
        col = c.col;
      if (key === "ArrowRight") col += c.colSpan;
      if (key === "ArrowLeft") col--;
      if (key === "ArrowDown") row += c.rowSpan;
      if (key === "ArrowUp") row--;
      if (key === "PageDown") row = lastRow;
      if (key === "PageUp") row = 0;
      if (key === "Home") col = 0;
      if (key === "End")
        col = Math.max(...all.map((c) => c.col + c.colSpan - 1));
      const next = all.find(
        (c) =>
          row >= c.row &&
          row < c.row + c.rowSpan &&
          col >= c.col &&
          col < c.col + c.colSpan,
      );
      if (next) {
        const focus = { ...s.focus, cell: next.cellIdx, cellPara: 0, offset: 0 };
        // First F5 selects ONE cell. Plain navigation keeps that mode; a
        // second F5 (or explicit Shift extension) owns range expansion.
        this.selection = s.phase === 1 && !extend
          ? { ...s, anchor: copy(focus), focus }
          : { ...s, phase: 2, focus };
      }
      return;
    }
    const selecting = extend || this.block;
    this.pointerOrigin = undefined;
    if (p.kind === 'cell' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      const row = inlineCellPicture(a, p);
      if (row && selecting && (s.kind === 'caret' || s.kind === 'text' && samePosition(s.anchor,s.focus))) {
        this.selection = {kind:'object',focus:copy(row.focus),control:row.control};
        this.visualCaret = undefined; this.typing = {}; this.preferredX = undefined; return;
      }
      if (row && s.kind === 'object' && s.control === row.control) {
        this.point(copy(p)); return;
      }
    }
    if (this.moveBodyLine(key, selecting)) return;
    let next = copy(p);
    let selectionOrigin: typeof this.selectionCaretOrigin;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      if (selecting && p.kind === "body" && !a.hasBodyLayoutObject(p)) {
        const carried = this.selectionCaretOrigin, visual = this.currentVisualCaret();
        const anchor = "anchor" in s ? s.anchor : p;
        if (carried && carried.documentId === a.documentId && carried.revision === a.revision &&
            carried.selection === JSON.stringify(s)) selectionOrigin = carried;
        else if (visual?.line && samePosition(anchor, p))
          selectionOrigin = { documentId: a.documentId, revision: a.revision,
            selection: JSON.stringify(s), anchor: copy(anchor), rect: visual.rect, line: visual.line };
      }
      const delta = key === "ArrowRight" ? 1 : -1;
      if (!selecting && s.kind === "text") {
        const pair = ordered(s.anchor, s.focus);
        this.point(copy(pair[delta > 0 ? 1 : 0]));
        return;
      }
      // Traverse root inline controls using Core's logical body offsets and
      // cell order. Extended/nested selections retain their existing contract.
      if (!selecting && p.kind === "body") {
        const table = a.inline(p).find((t) => p.offset === t.offset + (delta < 0 ? 1 : 0));
        const cell = delta > 0 ? table?.boxes[0] : table?.boxes.at(-1);
        if (table && cell) {
          const target: Position = { kind: "cell", sec: p.sec, para: p.para,
            control: table.controlIndex, cell: cell.cellIdx, cellPara: 0, offset: 0 };
          if (delta < 0) { target.cellPara = a.count(target) - 1; target.offset = a.length(target); }
          this.preferredX = undefined;
          this.point(target);
          return;
        }
      }
      if (!selecting && p.kind === "cell" && !nested(p) &&
          (delta < 0 ? p.cellPara === 0 && p.offset === 0
            : p.cellPara === a.count(p) - 1 && p.offset === a.length(p))) {
        const cells = a.cells(p), index = cells.findIndex((c) => c.cellIdx === p.cell);
        const adjacent = cells[index + delta];
        if (adjacent) {
          const target = { ...p, cell: adjacent.cellIdx, cellPara: 0, offset: 0 };
          if (delta < 0) { target.cellPara = a.count(target) - 1; target.offset = a.length(target); }
          this.preferredX = undefined;
          this.point(target);
          return;
        }
        const table = a.inline(p).find((t) => t.controlIndex === p.control);
        if (table) {
          this.preferredX = undefined;
          this.point({ kind: "body", sec: p.sec, para: p.para,
            offset: table.offset + (delta > 0 ? 1 : 0) });
          return;
        }
      }
      if (!selecting && p.kind === "cell") {
        // Enter only an object-only host paragraph. Mixed text/control boundaries
        // need Core logical-cell APIs before they can be traversed faithfully.
        if (a.length(p) === 0) {
          const child = a.child(p, delta < 0);
          if (child) {
            this.point(child);
            return;
          }
        }
        if (
          nested(p) &&
          ((delta < 0 && p.offset === 0 && paraIndex(p) === 0) ||
            (delta > 0 &&
              p.offset === a.length(p) &&
              paraIndex(p) === a.count(p) - 1))
        ) {
          const cells = a.cells(p),
            edge = delta < 0 ? cells[0] : cells.at(-1)!;
          if (edge.cellIdx === p.cell) {
            this.point(a.parent(p, delta < 0));
            return;
          }
        }
      }
      // Core offsets are Unicode scalar indices; avoid splitting non-BMP text.
      next.offset += delta;
      if (next.offset < 0 && paraIndex(p) > 0) {
        next = withPara(p, paraIndex(p) - 1);
        next.offset = a.length(next);
      } else if (next.offset > a.length(p) && paraIndex(p) + 1 < a.count(p)) {
        next = { ...withPara(p, paraIndex(p) + 1), offset: 0 };
      } else next.offset = Math.max(0, Math.min(a.length(p), next.offset));
      this.preferredX = undefined;
    } else {
      const rect = this.cursorRect();
      const x = this.preferredX ?? rect.x;
      this.preferredX = x;
      // Stay in the child cell for vertical text movement. F5 and Tab handle
      // cell traversal; parent exit is explicit at the text/table boundary.
      const ownerBoxes = p.kind === "cell" && !nested(p) ? a.cells(p) : [];
      // Text motion exhausts the current cell's own lines before considering
      // another cell. A vertically centered neighbour can lie between these
      // lines but is not an intermediate caret stop inside this cell.
      const ownLines = p.kind === "cell" && !selecting &&
        (key === "ArrowUp" || key === "ArrowDown") ? this.lines(p) : undefined;
      const base = rect.pageIndex * 100000 + rect.y;
      const ownDestination = ownLines?.some(l => key === "ArrowDown"
        ? l.page * 100000 + l.y > base + 2 : l.page * 100000 + l.y < base - 2);
      const lines = (ownDestination ? ownLines! : this.lines(selecting || nested(p) ? p : undefined)).map((line) => ({
        ...line,
        // An inline table's body text shares its enclosing line box, not a
        // preceding/following cell line. Leaving the table vertically must
        // not land on that same line's ABC/DEF text because of its top y.
        runs: !selecting && p.kind === "cell" && !nested(p) &&
          (key === "ArrowUp" || key === "ArrowDown")
          ? line.runs.filter((r) => !(r.cellIdx === undefined &&
              r.secIdx === p.sec && r.paraIdx === p.para && ownerBoxes.some((b) =>
                b.pageIndex === line.page && r.y < b.y + b.h && r.y + r.h > b.y)))
          : !selecting && p.kind === "body" &&
            (key === "ArrowUp" || key === "ArrowDown")
            ? line.runs.filter((r) => !(r.cellIdx !== undefined &&
                r.secIdx === p.sec && r.parentParaIdx === p.para))
            : line.runs,
      })).filter((line) => line.runs.length > 0);
      const current = lines.filter(
        (l) =>
          l.page === rect.pageIndex &&
          l.y <= rect.y + 2 &&
          l.runs.some(
            (r) =>
              r.y + r.h >= rect.y &&
              (r.text === ""
                ? samePosition(a.position(r, r.charStart), p)
                : a.textOffset(p) >= r.charStart &&
                  a.textOffset(p) <= r.charStart + Array.from(r.text).length),
          ) &&
          l.runs.some(
            (r) =>
              sameContainer(a.position(r, 0), p) &&
              paraIndex(a.position(r, 0)) === paraIndex(p),
          ),
      );
      if (key === "Home" || key === "End") {
        const rs = current
          .flatMap((l) => l.runs)
          .filter(
            (r) =>
              sameContainer(a.position(r, 0), p) &&
              paraIndex(a.position(r, 0)) === paraIndex(p),
          );
        if (rs.length) {
          const r = key === "Home" ? rs[0] : rs.at(-1)!;
          next = a.position(
            r,
            r.charStart + (key === "End" ? Array.from(r.text).length : 0),
          );
        }
        if (p.kind === "body") {
          const inline = a.inline(p);
          // The host's text runs omit the table's real logical control slot.
          // Include that slot only for the sole inline table on this visual
          // line; cell End stays inside its exact cell owner above.
          const table = inline.length === 1 ? inline[0] : undefined;
          if (table?.boxes.some(b => b.pageIndex === rect.pageIndex &&
              rect.y + rect.height > b.y && rect.y < b.y + b.h))
            next = { ...p, offset: key === "End"
              ? Math.max(next.offset, table.offset + 1)
              : Math.min(next.offset, table.offset) };
        }
      } else {
        const down = key === "ArrowDown" || key === "PageDown";
        const base = rect.pageIndex * 100000 + rect.y;
        const eligible = lines.filter((l) => !current.includes(l) && (
          down
            ? l.page * 100000 + l.y > base + 2
            : l.page * 100000 + l.y < base - 2
        ));
        if (eligible.length) {
          let targetY: number;
          let page: number;
          if (key.startsWith("Page")) {
            const offsets: number[] = [];
            let height = 0;
            for (let n = 0; n < a.pageCount; n++) {
              offsets.push(height);
              height += a.call("getPageInfo", n).height;
            }
            const global = (l: { page: number; y: number }) =>
              offsets[l.page] + l.y;
            const target =
              offsets[rect.pageIndex] + rect.y + (down ? viewport : -viewport);
            const chosen = eligible.reduce((best, l) =>
              Math.abs(global(l) - target) < Math.abs(global(best) - target)
                ? l
                : best,
            );
            targetY = chosen.y;
            page = chosen.page;
          } else {
            const chosen = down ? eligible[0] : eligible.at(-1)!;
            targetY = chosen.y;
            page = chosen.page;
          }
          let candidates = eligible
            .filter((l) => l.page === page && Math.abs(l.y - targetY) < 2)
            .flatMap((l) => l.runs);
          // Enter the inline cell occupying the preferred x rather than its
          // enclosing ABC/DEF line. Boxes and run ownership come from Core;
          // no fabricated offsets or nested-cell traversal policy.
          if (!selecting && p.kind === "body" && (key === "ArrowUp" || key === "ArrowDown")) {
            for (const host of candidates.filter((r) => r.cellIdx === undefined)) {
              const hostPosition = a.position(host, host.charStart);
              const tables = a.inline(hostPosition);
              const available = tables.flatMap((t) => t.boxes.filter((b) =>
                b.pageIndex === page && host.y < b.y + b.h && host.y + host.h > b.y)
                .map((b) => ({ table: t.controlIndex, cell: b.cellIdx, box: b })));
              const inside = available.filter(({ box: b }) => x >= b.x && x < b.x + b.w);
              const distance = ({ box: b }: typeof available[number]) => Math.max(b.x - x, x - b.x - b.w, 0);
              const nearest = Math.min(...available.map(distance));
              const entries = inside.length ? inside : available.filter((e) => distance(e) === nearest);
              const cellLines = eligible.map((l) => ({ ...l, runs: l.runs.filter((r) =>
                l.page === page && r.secIdx === host.secIdx && r.parentParaIdx === host.paraIdx &&
                (r.cellPath?.length ?? 0) <= 1 && entries.some((e) => r.controlIdx === e.table && r.cellIdx === e.cell))
              })).filter((l) => l.runs.length);
              const edge = down ? cellLines[0] : cellLines.at(-1);
              if (edge) { candidates = edge.runs; break; }
            }
          }
          const nearestStop = (r: typeof candidates[number]) => {
            let index = 0, distance = Math.abs(r.x + (r.charX[0] ?? 0) - x);
            for (let i = 1; i < r.charX.length; i++) {
              const delta = Math.abs(r.x + r.charX[i] - x);
              if (delta < distance) { index = i; distance = delta; }
            }
            return {r, index, distance};
          };
          if (key === "ArrowUp" || key === "ArrowDown") {
            // Compare actual caret stops on the chosen line. An edge of a
            // neighbouring run can be nearer than either edge of a wide run
            // even when a caret inside that wide run is at the requested X.
            const stop = candidates.map(nearestStop).reduce((best, current) =>
              current.distance < best.distance ? current : best);
            next = a.position(stop.r, stop.r.charStart + stop.index);
          } else {
            const r = candidates.reduce((b, r) =>
              Math.min(Math.abs(x - r.x), Math.abs(x - r.x - r.w)) <
              Math.min(Math.abs(x - b.x), Math.abs(x - b.x - b.w)) ? r : b);
            next = a.position(r, r.charStart + nearestStop(r).index);
          }
        }
      }
    }
    // Horizontal scalar movement can land on a shared soft-wrap offset. The
    // generic rect getter chooses the preceding line there; keep the existing
    // explicit line-start query instead. End, extended selections and layout
    // objects retain their separate visual/offset contracts.
    let startEdge: { rect: NavigationRect; line: BodyLine } | undefined;
    if (!selecting && (key === "ArrowLeft" || key === "ArrowRight") &&
        p.kind === "body" && next.kind === "body" && sameContainer(p, next) &&
        p.para === next.para && !a.hasBodyLayoutObject(next)) {
      const line = a.bodyLine(next);
      if (line.lineIndex > 0 && line.charStart === a.textOffset(next)) {
        const edge = a.bodyLineEdge(next, line, false);
        if (samePosition(edge.position, next)) startEdge = { rect: edge.rect, line };
      }
    }
    const preferred = this.preferredX;
    this.point(next, selecting);
    this.preferredX = preferred;
    if (startEdge) this.visualCaret = { documentId: a.documentId, revision: a.revision,
      selection: JSON.stringify(this.selection), ...startEdge };
    // Keep the actual anchor's visual side through horizontal Shift expansion.
    // A collapsed text selection retains its kind/positions; only its caret
    // display returns to the captured Home/End/hit line, not an offset guess.
    if (selectionOrigin && this.selection.kind === "text" &&
        samePosition(this.selection.anchor, selectionOrigin.anchor)) {
      this.selectionCaretOrigin = { ...selectionOrigin, selection: JSON.stringify(this.selection) };
      if (samePosition(next, selectionOrigin.anchor))
        this.visualCaret = { documentId: a.documentId, revision: a.revision,
          selection: JSON.stringify(this.selection), rect: selectionOrigin.rect, line: selectionOrigin.line };
    }
  }
  private textRunOwnerReader(owners?:OwnerProjection) {
    const a = this.adapter;
    const native=a.cursorOwnerReadWitness(), doc=a.doc, id=a.documentId, revision=a.revision;
    const ref=this.reference, generation=this.selectionGeneration, scope=a.scope, locked=a.documentLocked,
      viewer=a.viewerOnlyReason, transient=a.transientEdit;
    // Old rendered runs carry numeric addresses. If the native owner fence
    // retires, remapping an old run through fresh rows would select its successor.
    const current=native && (()=>native() && a.doc===doc && a.documentId===id && a.revision===revision &&
      this.reference===ref && this.selectionGeneration===generation && a.scope===scope &&
      a.documentLocked===locked && a.viewerOnlyReason===viewer && a.transientEdit===transient);
    // Display runs also include non-body lists (headers/footers, shape text).
    // Resolve navigation ownership before converting a text offset. Keep the
    // complete display layout and the normal position/error checks unchanged.
    const sections = a.readStructural('getSectionCount');
    const paragraphs = new Map<number, number>();
    let lists: any[] | undefined;
    return (r: Run): Position | undefined => {
      if(current?.()===false)return;
      const index = (n: number | undefined): n is number =>
        Number.isSafeInteger(n) && n! >= 0;
      if (!index(r.secIdx) || r.secIdx >= sections) return;
      if (!paragraphs.has(r.secIdx))
        paragraphs.set(r.secIdx, a.readStructural('getParagraphCount',r.secIdx));
      if(current?.()===false)return;
      const host = r.cellIdx === undefined ? r.paraIdx : r.parentParaIdx;
      if (!index(host) || host >= paragraphs.get(r.secIdx)!) return;
      if (r.cellIdx === undefined)
        return { kind: "body", sec: r.secIdx, para: host, offset: 0 };
      const p = (r.cellPath?.length ?? 0) > 1
        ? a.fromPath(r.secIdx, host, r.cellPath!, 0)
        : { kind: "cell" as const, sec: r.secIdx, para: host,
            control: r.controlIdx!, cell: r.cellIdx, cellPara: r.cellParaIdx!, offset: 0 };
      if (p.kind !== "cell") throw Error("셀 탐색 소유 경로가 유효하지 않습니다.");
      lists ??= ownerLists(a,owners) as any[];
      if(current?.()===false)return;
      let hostList = 0, hostPara = host;
      for (const step of cellPath(p)) {
        if (![step.controlIndex, step.cellIndex, step.cellParaIndex].every(index)) return;
        const owner = lists!.find((l) => l.isCell && l.row !== undefined &&
          l.sectionIndex === p.sec && l.hostListId === hostList && l.hostPara === hostPara &&
          l.controlIndex === step.controlIndex && l.cellIndex === step.cellIndex);
        if (!owner || step.cellParaIndex >= owner.paraCount) return;
        hostList = owner.listId;
        hostPara = step.cellParaIndex;
      }
      return p;
    };
  }
  moveColumn(direction:-1|1){
    this.validateSelection(this.selection);if(!['caret','text'].includes(this.selection.kind))throw Error('본문 커서를 먼저 선택하세요.');
    const p=this.selection.focus,next=columnPosition(this.adapter,p,this.lines(undefined,this.adapter.rect(p).pageIndex),direction);
    if(samePosition(p,next))return;this.resetBlockSequence();this.point(next,this.block);this.preferredX=undefined;
  }
  lines(container?: Position, onlyPage?: number) {
    const a = this.adapter;
    // Share immutable metadata only for this synchronous page traversal.
    // Every existing owner/affinity check and required layout read still runs.
    return a.withUpdateReads(() => {
    const cacheKey=JSON.stringify([container??null,onlyPage??null]);
    const current=this.viewLineCurrent?.()===true;
    if(!current)this.viewLines?.clear();
    const previous=current?this.viewLines?.get(cacheKey):undefined;
    if(previous)return copy(previous);
    const navigationOwner = this.textRunOwnerReader(this.viewOwners);
    const all: {
      page: number;
      y: number;
      runs: Run[];
    }[] = [];
    for (let page = onlyPage ?? 0, end = onlyPage === undefined ? a.pageCount : onlyPage + 1; page < end; page++) {
      const runs = a.runs(page);
      for (const r of runs) {
        const owner = navigationOwner(r);
        if (!owner || (container && !sameContainer(container, owner))) continue;
        a.position(r, 0);
        if (
          r.cellIdx === undefined &&
          r.text === "" &&
          runs.some(
            (c) => c.parentParaIdx === r.paraIdx && c.secIdx === r.secIdx,
          )
        )
          continue;
        let line = all.find((l) => l.page === page && Math.abs(l.y - r.y) < 1);
        if (!line) {
          line = { page, y: r.y, runs: [] };
          all.push(line);
        }
        line.runs.push(r);
      }
    }
    all.sort((a,b)=>a.page-b.page||a.y-b.y);
    if(this.viewLineCurrent?.()&&this.viewLines&&this.viewLines.size<8)
      this.viewLines.set(cacheKey,copy(all));
    return all;
    });
  }
  tabAddsRow(backward = false) {
    const p = this.selection.focus;
    return !backward && this.selection.kind === "caret" && p.kind === "cell" &&
      !nested(p) && this.adapter.cells(p).at(-1)?.cellIdx === p.cell;
  }
  tab(backward = false) {
    this.validateSelection(this.selection);
    const p = this.selection.focus;
    if (p.kind !== "cell") return;
    if (this.tabAddsRow(backward)) {
      this.execute({ type: "table-edit", operation: "row-add" });
      return;
    }
    const cells = this.adapter.cells(p),
      index = cells.findIndex((c) => c.cellIdx === p.cell),
      next = cells[index + (backward ? -1 : 1)];
    if (next) {
      const target = { ...p, cell: next.cellIdx, cellPara: 0, offset: 0 };
      if (backward && !nested(p)) {
        target.cellPara = this.adapter.count(target) - 1;
        target.offset = this.adapter.length(target);
      }
      this.point(target);
    } else if (nested(p)) this.point(this.adapter.parent(p, backward));
    // Shift+Tab in the first root cell retains the original caret/paragraph.
  }
  assertSupportedSelection(s: Selection, owners?:OwnerProjection) {
    if (
      s.kind !== "text" ||
      s.anchor.kind !== "body" ||
      s.focus.kind !== "body"
    )
      return;
    const [from, to] = ordered(s.anchor, s.focus);
    const table = ownerLists(this.adapter,owners).some(
      (l: any) =>
        l.isCell &&
        l.hostListId === 0 &&
        l.sectionIndex === from.sec &&
        l.hostPara >= from.para &&
        l.hostPara <= to.para &&
        !this.adapter
          .inline({
            kind: "body",
            sec: from.sec,
            para: l.hostPara,
            offset: 0,
          })
          .some((t) => t.controlIndex === l.controlIndex),
    );
    if (table)
      throw Error(
        "표를 포함한 본문 블록 편집은 아직 지원하지 않습니다. F5 셀 블록을 사용하세요.",
      );
  }
  private validateSelection(s: Selection, validateCells = () => { this.cells(s); }, validateFocus?: (p: Position) => void,
      observeFocus?: (target:ParagraphTarget)=>void) {
    return this.adapter.withUpdateReads(() => {
    this.resolveCurrent(s,observeFocus);
    const a = this.adapter;
    if (validateFocus) validateFocus(s.focus);
    else a.validate(s.focus);
    if (s.kind === "text") {
      a.validate(s.anchor);
      ordered(s.anchor, s.focus);
    } else if (s.kind === "cells") {
      a.validate(s.anchor);
      if (![1, 2, 3].includes(s.phase))
        throw Error("잘못된 셀 선택 단계입니다.");
      validateCells();
    } else if (s.kind === "table") validateCells();
    else if (s.kind !== "caret" && s.kind !== "object")
      throw Error("잘못된 선택 종류입니다.");
    });
  }
  // Existing resizeTableCells batch contract; no new Core entry point. Only a
  // complete ordinary track and its immediate neighbor may compensate each other.
  private redistribution(command: Extract<Command, {type: "resize"}>, s: Selection) {
    const p = s.focus, axis = command.redistribute;
    if (p.kind !== "cell" || nested(p) || !axis || s.kind !== "cells")
      throw new UnsupportedTableOperation("resize-boundary", "일반 표 내부 경계만 재분배할 수 있습니다.");
    const a = this.adapter, all = a.cells(p);
    let selected = this.cells(s);
    if(command.trackBoundary){
      if(command.cellOnly)throw Error('서로 다른 셀 크기 조절 요청입니다.');
      const focus=all.find(c=>c.cellIdx===p.cell),axisKey=axis==='x'?'col':'row';
      if(!focus||selected.some(c=>c[axisKey]!==focus[axisKey]))throw new UnsupportedTableOperation('resize-boundary', '크기 고정 조절은 하나의 행·열에서 실행하세요.');
      // Native Alt moves the complete shared boundary, even when F5 selected
      // just one cell. Keep the original Selection/History owner unchanged.
      selected=all.filter(c=>c[axisKey]===focus[axisKey]);
    }
    const independentRowWidth=!!command.cellOnly&&axis==='x'&&a.heightCandidateIdentified&&all.length>0&&all.every(c=>c.rowSpan===1&&c.colSpan===1);
    if(command.cellOnly&&!independentRowWidth&&(selected.length!==1||selected[0].cellIdx!==p.cell||all.some(c=>c.rowSpan!==1||c.colSpan!==1)||new Set(all.map(c=>axis==='x'?c.row:c.col)).size!==1))
      throw new UnsupportedTableOperation('local-resize-scope','일반 표의 세로·병합·중첩 부분 경계 조절은 아직 지원하지 않습니다.');
    if(independentRowWidth){
      const grid=a.call('getTableDimensions',p.sec,p.para,p.control),width=a.call('getTableProperties',p.sec,p.para,p.control).tableWidth;
      if(all.length!==grid.rowCount*grid.colCount||!Number.isSafeInteger(width)||width<=0||Array.from({length:grid.rowCount},(_,row)=>all.filter(c=>c.row===row).reduce((sum,c)=>sum+a.cellProps({...p,cell:c.cellIdx}).width,0)).some(sum=>sum!==width))
        throw new UnsupportedTableOperation('local-width-closed-row','각 행의 선언 너비가 정확히 닫힌 일반 표에서만 부분 가로 경계를 조절합니다.');
    }
    const partial = axis === "x" && lowerPairGrid(all);
    const index = axis === "x" ? "col" : "row", cross = axis === "x" ? "row" : "col";
    const delta = axis === "x" ? command.width : command.height;
    if (!Number.isSafeInteger(delta) || (axis === "x" ? command.height : command.width) !== 0 ||
        !all.length || all.some(c => c.rowSpan !== 1 || (!partial && c.colSpan !== 1) || c.pageIndex !== all[0].pageIndex) ||
        new Set(all.map(c => c.cellIdx)).size !== all.length || !selected.length ||
        new Set(selected.map(c => c[index])).size !== 1 ||
        (axis === "y" && !a.heightCandidateIdentified))
      throw new UnsupportedTableOperation("resize-boundary", "병합·분할·미확인 표의 내부 경계 재분배는 보류합니다.");
    const track = selected[0][index], first = independentRowWidth?selected:all.filter(c => c[index] === track && (!partial || c.row === 1)),
      second = all.filter(c => c[index] === track + 1 && (!partial || c.row === 1) && (!independentRowWidth||selected.some(t=>t.row===c.row)));
    if(command.trackBoundary&&!second.length)return{p,axis,updates:[]};
    if ((partial && track !== 0) || first.length !== selected.length || first.some(c => !selected.some(t => t.cellIdx === c.cellIdx)) ||
        !second.length || first.length !== second.length ||
        first.some(c => !second.some(t => t[cross] === c[cross])))
      throw new UnsupportedTableOperation("resize-boundary", "인접한 전체 행·열의 대응을 확인할 수 없습니다.");
    const updates = [...first, ...second].map(c => {
      // This is a whole-cell permission check. The focused character offset
      // belongs to p only; another cell can contain fewer characters/paragraphs.
      const target = {...p, cell:c.cellIdx, cellPara:0, offset:0}; a.assertEditable(target);
      if (a.call("getCellTextDirection",p.sec,p.para,p.control,c.cellIdx) !== 0)
        throw new UnsupportedTableOperation("resize-boundary", "세로쓰기 경계 조절 미지원");
      const props = a.call("getCellProperties",p.sec,p.para,p.control,c.cellIdx);
      const signed = c[index] === track ? delta : -delta;
      // CellBox is rounded to 0.1 CSS px. Only use a declared row height
      // that agrees within that serialization precision; expanded rows need
      // an exact public measurement before compensating an adjacent row.
      if (axis === "y" && Math.abs(c.h * 75 - props.height) >= 4)
        throw new UnsupportedTableOperation("resize-boundary", "표시 높이와 선언 높이가 다른 행의 재분배는 보류합니다.");
      const base = axis === "x" ? props.width : props.height;
      const expected = base + signed;
      if (!Number.isSafeInteger(expected) || expected < 200 || expected > 2147483647)
        throw new UnsupportedTableOperation("resize-boundary", "인접 셀의 기존 최소 크기를 침범하는 재분배입니다.");
      return {cellIdx:c.cellIdx,widthDelta:axis === "x" ? signed : 0,
        heightDelta:axis === "y" ? signed : 0,...(command.cellOnly?{localResize:true}:{}),expected};
    });
    return {p, axis, updates};
  }

  // Whole horizontal table resize follows the existing native track contract:
  // change each selected column in every ordinary row, not only the focused
  // column. The existing key delta is retained; native 283HU is NOT substituted.
  private resizeCells(command:Extract<Command,{type:"resize"}>,s:Selection,displayCells?:RhwpAdapter["cells"]){
    const p=s.focus;if(p.kind!=="cell")throw Error("표의 셀을 먼저 선택하세요.");
    const a=this.adapter,all=displayCells?displayCells(p):a.cells(p);
    // Native Ctrl vertical resize owns the complete selected rows. A cell
    // block must not leave siblings or another selected row behind.
    if(command.height!==0&&!command.redistribute&&(s.kind==='cells'||s.kind==='table')){
      const rows=new Set(this.cells(s).map(c=>c.row));
      if(rows.size)return all.filter(c=>rows.has(c.row));
    }
    if(!command.trackBoundary||command.redistribute)return s.kind==="cells"||s.kind==="table"?this.cells(s):all.filter(c=>c.cellIdx===p.cell);
    const grid=a.call("getTableDimensions",p.sec,p.para,p.control),focus=all.find(c=>c.cellIdx===p.cell);
    if(!focus)throw new UnsupportedTableOperation('resize-whole-width','전체 너비 조절의 현재 셀을 확인할 수 없습니다.');
    const columns=new Set((s.kind==='cells'||s.kind==='table'?this.cells(s):[focus]).map(c=>c.col));
    const ordinary=all.every(c=>c.rowSpan===1&&c.colSpan===1)&&all.length===grid.rowCount*grid.colCount;
    // A focused first-column track can cross a horizontal merge without
    // inventing a partial rectangular cell selection. Prove a complete grid,
    // one changed cell per row and equal exact source row/outer widths first.
    // Other merged tracks, vertical spans, split/duplicate frames stay held.
    const mergedFirstColumn=()=>{
      if(!a.widthContentFrameIdentified||columns.size!==1||!columns.has(0)||all.length!==grid.cellCount||all.some(c=>c.row<0||c.row>=grid.rowCount))return false;
      const t=a.call('getTableProperties',p.sec,p.para,p.control);
      if(!t.treatAsChar||t.hasCaption||t.cellSpacing!==0||t.textWrap!=='TopAndBottom'||!Number.isSafeInteger(t.tableWidth)||t.tableWidth<=0)return false;
      for(let row=0;row<grid.rowCount;row++){
        const cells=all.filter(c=>c.row===row).sort((a,b)=>a.col-b.col);let col=0,width=0;
        if(cells.filter(c=>c.col===0).length!==1)return false;
        for(const c of cells){
          if(c.rowSpan!==1||!Number.isSafeInteger(c.colSpan)||c.colSpan<1||c.col!==col)return false;
          col+=c.colSpan;const w=a.cellProps({...p,cell:c.cellIdx}).width;
          if(!Number.isSafeInteger(w)||w<=0)return false;width+=w;
        }
        if(col!==grid.colCount||width!==t.tableWidth)return false;
      }
      return true;
    };
    if(nested(p)||command.height!==0||!focus||new Set(all.map(c=>c.cellIdx)).size!==all.length||(!ordinary&&!mergedFirstColumn()))
      throw new UnsupportedTableOperation("resize-whole-width","병합·중첩 또는 불완전한 표의 전체 너비 조절은 아직 지원하지 않습니다.");
    return all.filter(c=>columns.has(c.col));
  }

  private validateCommand(command: Command, s: Selection, observeResizeGrid?: (p:Position, grid:ReturnType<RhwpAdapter["cells"]>)=>void, displayCells?:RhwpAdapter["cells"],
      widthInputs?:WidthPreviewAdmission, resolved?:ParagraphTarget) {
    if (command.type === "table-edit" && command.operation === "row-delete" && nested(s.focus))
      assertNestedRowDeletion(this.adapter, s,
        s.kind === "cells" ? this.cells(s).map(c => c.cellIdx) : [s.focus.kind === "cell" ? s.focus.cell : -1]);
    if (command.type === "cell" && hasCellLayout(command.props)) {
      const p = s.focus;
      if (p.kind !== "cell" || nested(p)) throw Error("일반 셀의 안 여백·세로 정렬만 지원합니다.");
      const selected = s.kind === "cells" || s.kind === "table" ? this.cells(s) : this.adapter.cells(p).filter(c => c.cellIdx === p.cell);
      if (selected.some(c => c.rowSpan !== 1 || c.colSpan !== 1)) throw Error(cellLayoutHold);
      for (const c of selected) validateCellLayout(this.adapter.cellProps({ ...p, cell: c.cellIdx }), command.props);
    }
    if (command.type === "char") normalizeUnderlineChange(command.props);
    if (
      command.type === "paragraph" &&
      ["fontLineHeight", "autoSpaceKrEn", "autoSpaceKrNum"].some(
        (key) =>
          command.props[key] === true &&
          this.formatTargets("paragraph", s).some(
            (t) =>
              t.p.kind === "body" && this.adapter.paraProps(t.p)[key] !== true,
          ),
      )
    )
      throw Error(
        "NOT_SUPPORTED: 본문 자동 간격은 저장만 지원하고 화면에는 반영되지 않습니다. 기존 값 유지·명시적 해제는 가능합니다.",
      );
    if (
      command.type === "char" &&
      "outlineType" in command.props &&
      this.formatTargets("char", s).some(
        (t) =>
          t.p.kind === "body" &&
          this.formatSamples("char", t).some(
            (current) => current.outlineType !== command.props.outlineType,
          ),
      )
    )
      throw Error(
        "NOT_SUPPORTED: 본문 외곽선은 저장만 지원하고 설치 Core SVG 화면에는 반영되지 않습니다. 기존 값은 보존됩니다.",
      );
    if (
      command.type === "char" &&
      (Array.isArray(command.props.charOffsets) ||
        [2, 3, 5, 6].some((n) => `charOffsetsLanguage${n}` in command.props)) &&
      this.formatTargets("char", s).some(
        (t) =>
          t.p.kind === "body" &&
          this.formatSamples("char", t).some((current) =>
            [2, 3, 5, 6].some(
              (n) =>
                (`charOffsetsLanguage${n}` in command.props &&
                  command.props[`charOffsetsLanguage${n}`] !==
                    current.charOffsets?.[n]) ||
                (Array.isArray(command.props.charOffsets) &&
                  command.props.charOffsets[n] !== current.charOffsets?.[n]),
            ),
          ),
      )
    )
      throw Error(
        "NOT_SUPPORTED: 본문 한자·일어·기호·사용자 글자 위치는 저장만 지원하고 화면에는 반영되지 않습니다. 기존 값은 보존됩니다.",
      );
    if (
      command.type === "paragraph" &&
      this.formatTargets("paragraph", s).some((t) => {
        if (t.p.kind !== "body") return false;
        const current = this.adapter.paraProps(t.p),
          props = command.props,
          spacing = Array.isArray(current.borderSpacing)
            ? current.borderSpacing
            : [];
        // Commands are already in Core units (borderGap UI pt → HWPUNIT).
        return (
          (props.borderIgnoreMargin === true &&
            current.borderIgnoreMargin !== true) ||
          [0, 1].some(
            (n) =>
              (`borderGap${n}` in props &&
                props[`borderGap${n}`] !== spacing[n]) ||
              (Array.isArray(props.borderSpacing) &&
                props.borderSpacing[n] !== spacing[n]),
          )
        );
      })
    )
      throw Error(bodyBorderHold);
    if (command.type === "paragraph")
      for (const name of ["keepLines", "widowOrphan"] as const)
        if (
          command.props[name] === true &&
          this.formatTargets("paragraph", s).some(
            (t) =>
              t.p.kind === "body" && this.adapter.paraProps(t.p)[name] !== true,
          )
        )
          throw Error(lineProtectionBodyUnsupported(name));
    if (
      command.type === "paragraph" &&
      command.props.keepWithNext === true &&
      this.formatTargets("paragraph", s).some(
        (t) => this.adapter.paraProps(t.p).keepWithNext !== true,
      )
    )
      throw Error(keepWithNextHold);
    if (command.type === "resize" && command.cellOnly) assertLocalResizeProof(this,command);
    if (command.type === "resize" && command.cellOnly && !command.redistribute)
      throw Error("현재 셀 조절 축이 없습니다.");
    if (command.type === "resize" && command.redistribute) {
      this.redistribution(command, s);
      return;
    }
    if (command.type === "resize") {
      const p = s.focus;
      if (p.kind !== "cell" || nested(p))
        throw new UnsupportedTableOperation("resize-scope", "중첩 또는 본문 크기 변경 미지원");
      if (![command.width, command.height].every(Number.isFinite))
        throw Error("유효한 크기 변경량이 필요합니다.");
      const all = displayCells?displayCells(p):this.adapter.cells(p);
      observeResizeGrid?.(p,all);
      const merged=all.some(c=>c.rowSpan>1||c.colSpan>1)?prepareMergedGridResize(this.adapter,s,command,this.cells(s)):undefined;
      if(merged)return merged;
      const selected = this.resizeCells(command,s,displayCells);
      if (command.width !== 0 && selected.some((c) => c.colSpan > 1) &&
          !(command.trackBoundary && this.adapter.widthContentFrameIdentified))
        throw new UnsupportedTableOperation("resize-scope",
          "열 병합 셀 너비 변경 보류: 설치 Core 표 폭 정합성 검토 중",
        );
      if (
        command.height !== 0 &&
        selected.some((c) => c.rowSpan > 1)
      )
        throw new UnsupportedTableOperation("resize-height-scope",
          this.adapter.heightCandidateIdentified
            ? "고정 후보도 세로 복수·행 병합 셀 높이 범위는 미입증: 변경 보류 · 검토 중"
            : "세로 복수·행 병합 셀 높이 변경 보류: 설치 Core 크기 정확성 검토 중",
        );
      // Fixed shrink never raises an undersized stored height to the content floor.
      // Admit only this pure negative-height path; other mismatched-frame edits
      // retain their guard and the existing exact size/no-op History check.
      if(command.height!==0&&!(command.width===0&&command.height<0&&this.adapter.heightCandidateIdentified)&&selected.some(c=>c.colSpan>1&&Math.abs(c.h*75-this.adapter.cellProps({...p,cell:c.cellIdx}).height)>=4))
        throw new UnsupportedTableOperation('resize-merged-height-frame','선언 높이와 표시 높이가 다른 병합 셀의 높이 조절은 보류합니다.');
      if (command.width > 0) {
        // Only the documented single-column, horizontal inline body frame is
        // provable here. Unknown layouts remain blocked; never clamp geometry.
        const a = this.adapter, readWidth=widthInputs?.(p,resolved,all)??a.call.bind(a),
          page = readWidth("getPageDef", p.sec),
          cols = a.call("getColumnDef", p.sec);
        const table = readWidth("getTableProperties", p.sec, p.para, p.control);
        const para = a.call("getParaPropertiesAt", p.sec, p.para);
        const rawPara = paragraphAdjustmentRaw(a,{kind:'body',sec:p.sec,para:p.para,offset:0});
        // ParaShape IR margins are exact 2x HU (the same contract used by
        // paragraph adjustments). The display query is rounded CSS px, not HU.
        // Account for existing nonzero margins instead of refusing them all.
        const margins=[rawPara.LeftMargin,rawPara.RightMargin].map(v=>typeof v==='number'?v:NaN);
        if (
          cols.columnCount !== 1 ||
          page.landscape ||
          page.marginGutter !== 0 ||
          !table.treatAsChar ||
          table.cellSpacing !== 0 ||
          table.hasCaption ||
          table.horzOffset !== 0 ||
          table.textWrap !== "TopAndBottom" ||
          margins.some(v=>!Number.isSafeInteger(v)||v<0) ||
          !Number.isFinite(para.indent) || para.indent > 0
        )
          throw new UnsupportedTableOperation("resize-scope", "현재 배치의 표 폭 상한 확인 불가: 크기 증가 보류");
        const bound = page.width - page.marginLeft - page.marginRight -
          margins.reduce((sum,v)=>sum+Math.trunc(v/2),0);
        // A negative first-line indent does not shrink the single-column page
        // frame. Do not grant its extra overhang as resize space: the same full
        // projected grid + outer-margin bound below remains mandatory.
        const chosen = new Set(selected.map((c) => c.cellIdx));
        const cells = all.map((c) => ({
          ...c,
          width: readWidth(
            "getCellProperties",
            p.sec,
            p.para,
            p.control,
            c.cellIdx,
          ).width,
        }));
        if (
          ![
            page.width,
            page.marginLeft,
            page.marginRight,
            table.outerLeft,
            table.outerRight,
          ].every((v) => Number.isFinite(v) && v >= 0) ||
          !Number.isFinite(bound) ||
          bound <= 0 ||
          cells.some((c) => !Number.isFinite(c.width) || c.width <= 0)
        )
          throw Error("표 폭 상한 확인 불가");
        const rows = new Set(cells.map((c) => c.row));
        const projected = Math.max(
          ...[...rows].map((row) =>
            cells
              .filter((c) => c.row <= row && row < c.row + c.rowSpan)
              .reduce(
                (sum, c) =>
                  sum + c.width + (chosen.has(c.cellIdx) ? command.width : 0),
                0,
              ),
          ),
        );
        if (projected + table.outerLeft + table.outerRight > bound)
          throw new UnsupportedTableOperation('resize-parent-bound',"표 너비가 본문 여백을 제외한 부모 폭을 초과합니다.");
      }
    }
    if (
      command.type === "clear-cells" &&
      s.kind !== "cells" &&
      s.kind !== "table"
    )
      throw Error("셀 블록을 먼저 선택하세요.");
    if(command.type==='table-edit'&&(command.count!==undefined||command.after!==undefined)) {
      const p=s.focus,count=command.count??1;
      if(p.kind!=='cell'||nested(p)||!Number.isSafeInteger(count)||count<1||count>16||command.after!==undefined&&typeof command.after!=='boolean'||['merge','split'].includes(command.operation))throw Error('일반 표의 줄/칸 수·위치를 확인하세요.');
      const all=this.adapter.cells(p),selected=s.kind==='cells'?this.cells(s):all.filter(c=>c.cellIdx===p.cell),first=selected[0];
      if(!first||all.some(c=>c.rowSpan!==1||c.colSpan!==1))throw Error('여러 줄/칸 조작은 병합 없는 일반 표에서만 지원합니다.');
      const size=Math.max(...all.map(c=>command.operation.startsWith('row')?c.row+1:c.col+1)),at=command.operation.startsWith('row')?first.row:first.col;
      if(command.operation.endsWith('delete')&&at+count>size)throw Error('지울 줄/칸 수가 현재 표 경계를 넘습니다.');
    }
    if (command.type === "table-edit" && command.operation === "merge") {
      if (s.kind !== "cells") throw Error("병합할 셀 블록을 먼저 선택하세요.");
      const cells = this.cells(s);
      if (cells.length < 2)
        throw Error("병합하려면 두 개 이상의 셀을 선택하세요.");
      const r0 = Math.min(...cells.map((c) => c.row)),
        c0 = Math.min(...cells.map((c) => c.col)),
        r1 = Math.max(...cells.map((c) => c.row + c.rowSpan)),
        c1 = Math.max(...cells.map((c) => c.col + c.colSpan));
      if (
        cells.reduce((area, c) => area + c.rowSpan * c.colSpan, 0) !==
        (r1 - r0) * (c1 - c0)
      )
        throw Error("병합할 셀을 빈틈 없는 사각형으로 선택하세요.");
    }
  }
  // Read-only UI preflight reuses the same selection/merge contracts as execute.
  // Core remains authoritative for geometry/path-specific atomic rejection.
  paragraphStepPlan(type:'list-level'|'line-spacing-step',direction:-1|1,s=this.selection,owners?:OwnerProjection,prepared?:ReturnType<Interaction["targets"]>, checkEditable?:(p:Position)=>void) {
    this.validateSelection(s);return paragraphStepPlan(this.adapter,this.formatTargets('paragraph',s,owners?.isCurrent(this.adapter)?prepared:undefined),type,direction,checkEditable);
  }
  localResizeReason(command: Extract<Command,{type:'resize'}>): string {
    try { this.validateSelection(this.selection);this.redistribution(command,this.selection);return ''; }
    catch(error){return String(error);}
  }
  private widthPreviewSequence=0;
  /** Wrap only the existing synchronous passive writer. The same exact
   * resolved owner is checked for each preview; command execution has no port. */
  withWidthPreviewInputs<T>(view:()=>string|undefined, active:()=>boolean,
      run:(reader?:(site:WidthSite)=>WidthPreviewAdmission)=>T,
      observe?:(scope:number,event:WidthEvent)=>void):T {
    const v=view(),a=this.adapter,owner=this.tableDisplayGridOwner("caret");
    if(v===undefined||!owner||!active())return run();
    const current=()=>active()&&this.adapter===a&&view()===v&&owner.current();
    const id=++this.widthPreviewSequence;
    const scope=a.openWidthPreviewInputs(current,observe?(row)=>observe(id,row):undefined);
    if(!scope)return run();
    try{return run(site=>(p,resolved,grid)=>{
      if(p.kind!=="cell"||!scope.valid()||!owner.matches(p,resolved)||!ordinaryPreviewGrid(grid,p.cell))return;
      const read=scope.by(site);
      return <U>(method:WidthMethod,...args:number[]):U=>{
        const same=method==="getPageDef" ? args.length===1&&args[0]===p.sec :
          args.length===(method==="getCellProperties"?4:3)&&args[0]===p.sec&&args[1]===p.para&&args[2]===p.control&&
          (method!=="getCellProperties"||grid.some(c=>c.cellIdx===args[3]));
        return same?read<U>(method,...args):a.call<U>(method,...args);
      };
    });}
    finally{scope.close();owner.retire();}
  }
  /** @internal Same synchronous table-menu display. The owner read starts only
   * from a validateSelection callback, after the existing live ref resolution. */
  withTableMenuPreview<T>(grid:readonly import("./model.js").CellBox[]|undefined,
      currentView:()=>string|undefined, read:(reason:(c:Parameters<Interaction["tableCommandReason"]>[0])=>string)=>T,
      reuseRawHit=false,gridOwner?:NonNullable<ReturnType<Interaction["tableDisplayGridOwner"]>>, widthInputs?:WidthPreviewAdmission):T {
    const s=this.selection, a=this.adapter, h=this.history;
    const legacy=(c:Parameters<Interaction["tableCommandReason"]>[0])=>this.tableCommandReason(c,undefined,undefined,undefined,widthInputs);
    if(!grid || s.kind!=="caret" || s.focus.kind!=="cell" || nested(s.focus) || !this.reference?.focus ||
        this.selectionError || !ordinaryPreviewGrid(grid,s.focus.cell)) return read(legacy);
    const view=currentView();
    if(view===undefined) return read(legacy);
    const ref=this.reference, generation=this.selectionGeneration, stamp=JSON.stringify(s);
    const undo=h.undoStack.at(-1),redo=h.redoStack.at(-1),ud=h.undoStack.length,rd=h.redoStack.length;
    const fence=a.tablePreviewFence();
    const live=()=>fence() && (!gridOwner||gridOwner.current()) && this.selection===s && this.reference===ref && this.selectionGeneration===generation &&
      JSON.stringify(s)===stamp && this.history===h && h.undoStack.at(-1)===undo && h.redoStack.at(-1)===redo &&
      h.undoStack.length===ud && h.redoStack.length===rd && currentView()===view;
    let receipt:ReturnType<RhwpAdapter["tablePreviewOwner"]>;
    let attempted=false,open=true;
    const provider=(p:Position,target?:ParagraphTarget)=>{
      if(!open || !live() || (gridOwner&&!gridOwner.matches(p,target)))return;
      if(!attempted){
        attempted=true;
        receipt=a.tablePreviewOwner(p,live,!reuseRawHit || !a.hasCurrentCursorModelRead(),
          gridOwner&&target?{target,reference:ref,generation,view,grid,history:h}:undefined);
      }
      return receipt;
    };
    const observe=gridOwner ? (target?:ParagraphTarget)=>{if(!target)gridOwner.retire();} : undefined;
    try {return read(c=>open ? this.tableCommandReason(c,provider,undefined,observe,widthInputs) : this.tableCommandReason(c));}
    finally {open=false;receipt?.close();}
  }
  /** @internal Passive toolbar only. First verdict pays its existing grid read;
   * subsequent checks can share only a current structural owner, never geometry. */
  toolbarTableReasons(commands:readonly Parameters<Interaction["tableCommandReason"]>[0][],
      busy:()=>boolean,currentView:()=>string|undefined, phase3:boolean,widthInputs?:WidthPreviewAdmission):string[] {
    const legacy=(c:Parameters<Interaction["tableCommandReason"]>[0])=>busy()?"입력 처리 중":this.tableCommandReason(c,undefined,undefined,undefined,widthInputs);
    const a=this.adapter;
    if(!phase3||commands.length<2||busy()||a.hasCurrentCursorModelRead())return commands.map(legacy);
    const view=currentView();
    const owner=view===undefined?undefined:this.tableDisplayGridOwner("caret");
    if(!owner)return commands.map(legacy);
    let proof:readonly import("./model.js").CellBox[]|undefined;
    let resolved:ParagraphTarget|undefined;
    const first=this.tableCommandReason(commands[0],undefined,(p,grid)=>{
      if(owner.matches(p,resolved)&&ordinaryPreviewGrid(grid,p.kind==="cell"?p.cell:-1))
        proof=grid.map(c=>({...c}));
    },target=>{resolved=target;},widthInputs);
    const ready=proof;
    if(currentView()!==view||!owner.sameOwner()||(ready&&!owner.current()))return commands.map(legacy);
    if(first||!ready||a.hasCurrentCursorModelRead())return [first,...commands.slice(1).map(legacy)];
    const rest=this.withTableMenuPreview(ready,()=>currentView()===view&&owner.current()?view:undefined,
      reason=>commands.slice(1).map(c=>busy()?"입력 처리 중":reason(c)),true,owner,widthInputs);
    return currentView()===view&&owner.sameOwner() ? [first,...rest] : commands.map(legacy);
  }

  /** @internal Only the closed table-menu writer opts into this read pair. */
  perf4PassiveTableReason(command: Parameters<Interaction["tableCommandReason"]>[0], view:()=>string|undefined) {
    const a=this.adapter, owner=this.tableDisplayGridOwner("caret"), start=view();
    if(!owner || start===undefined)return this.tableCommandReason(command);
    let receipt:ReturnType<RhwpAdapter["openPerf4TableReasonOwner"]>;
    try {
      return this.tableCommandReason(command,(p,resolved)=>{
        // validateSelection has just resolved the original ref; same numeric
        // address alone cannot admit the second topology read.
        if(p.kind!=="cell" || !owner.matches(p,resolved) || view()!==start)return;
        receipt=a.openPerf4TableReasonOwner(p,()=>owner.current()&&view()===start);
        return receipt;
      });
    } finally {receipt?.close();owner.retire();}
  }

  tableCommandReason(
    command: Extract<Command, { type: "table-edit" | "resize" | "cell" | "control-key" }>,
    owner?: (p:Position,target?:ParagraphTarget)=>ReturnType<RhwpAdapter["tablePreviewOwner"]>,
    observeResizeGrid?: (p:Position,grid:ReturnType<RhwpAdapter["cells"]>)=>void,
    observeFocus?: (target?:ParagraphTarget)=>void,
    widthInputs?:WidthPreviewAdmission,
  ): string {
    let resolved:ParagraphTarget|undefined;
    try {
      const s = this.selection,
        p = s.focus;
      let display:ReturnType<RhwpAdapter["tablePreviewOwner"]>;
      this.validateSelection(s,undefined,owner ? focus=>{
        display=owner(focus,resolved);
        if(display) display.validate(focus);
        else this.adapter.validate(focus);
      } : undefined,owner||observeFocus||widthInputs&&command.type==="resize"&&command.width>0 ? target=>{resolved=target;observeFocus?.(target);} : undefined);
      if (p.kind !== "cell") throw Error("표의 셀을 먼저 선택하세요.");
      for (const t of this.targets(s)) {
        if(display) display.check(t.p);
        else this.adapter.assertEditable(t.p);
      }
      this.validateCommand(command, s,observeResizeGrid,command.type==="resize"&&s.kind==="caret"?display?.cells:undefined,widthInputs,resolved);
      if(command.type==='control-key')prepareControlKey(this.adapter,s,command.action);
      if (nested(p) && command.type !== "table-edit")
        throw Error("중첩 셀 속성·크기 변경 미지원");
      if (command.type === "table-edit" && nested(p)) {
        if (typeof this.adapter.doc.editTableStructureByPath !== "function")
          throw Error("중첩 표 구조 API 미지원");
        const cells = this.adapter.cells(p);
        if (
          ["row-add", "row-delete"].includes(command.operation) &&
          cells.some((c) => c.rowSpan > 1)
        )
          throw Error("행 병합을 포함한 중첩 표의 행 변경 미지원");
        if (command.operation === "split") {
          const selected =
            s.kind === "cells"
              ? this.cells(s)
              : cells.filter((c) => c.cellIdx === p.cell);
          if (selected[0]?.rowSpan === 1 && selected[0]?.colSpan === 1)
            throw Error("해제할 병합 셀이 없습니다.");
        }
      }
      return "";
    } catch (e) {
      if(!resolved)observeFocus?.();
      return String(e);
    }
  }
  execute(
    command: Command,
    captured?: {
      documentId: string;
      revision: number;
      selection: Selection;
      paths?: SelectionReference;
      paragraphTargets?: ParagraphTarget[];
      cellBlockCut?: CellBlockObjectCut;
      parentTableCut?: ParentTableCut;
      // Drag operation targets may differ from the actual pointerdown selection.
      resizeSelectionBefore?: Selection;
    },
  ) {
    try {
      const doc=this.adapter.doc;
      return cursorModelMemoEnabled(doc) ? withFreshCursorModel(doc,()=>this.executeObserved(command,captured))
        : this.executeObserved(command,captured);
    } catch(error) { freezeDiagnosticFor(error,'COMMAND_FAILED','interaction'); throw error; }
  }
  private executeObserved(
    command: Command,
    captured?: {
      documentId: string;
      revision: number;
      selection: Selection;
      paths?: SelectionReference;
      paragraphTargets?: ParagraphTarget[];
      cellBlockCut?: CellBlockObjectCut;
      parentTableCut?: ParentTableCut;
      // Drag operation targets may differ from the actual pointerdown selection.
      resizeSelectionBefore?: Selection;
    },
  ) {
    const { a, s } = this.prepareCommandExecution(command, captured);
    // An empty insertion at an exact caret has no edit or History effect.
    // A nonempty selection still means deletion; identical visible text is
    // not a no-op because explicit replacement formatting may differ.
    if (command.type === "insert" && command.text === "" &&
        (s.kind === "caret" || (s.kind === "text" && samePosition(s.anchor, s.focus)))) {
      this.validateSelection(s);
      return;
    }
    if (this.executePreparedTargetCommand(command, s, a, captured)) return;
    command = this.lowerExecutionAlias(command, s, a);
    if (this.executePageObjectCommand(command, s, a, captured)) return;
    this.validateSelection(s);
    if (this.executeWholeBodyDeletionCommand(command, s, a, captured)) return;
    this.assertSupportedSelection(s);
    if (this.executeCurrentPositionCommand(command, s, a, captured)) return;
    if ((["char-relative", "paragraph-list", "numbering-restart", "paragraph-relative"].includes(command.type) || (command.type === "char" && "underlineType" in command.props) || (command.type === "cell" && (hasCellLayout(command.props)||command.cellScope))) && captured && JSON.stringify(captured.selection) !== JSON.stringify(this.selection))
      throw Error("문서·선택이 변경되었습니다. 다시 여세요.");
    if (this.executeCopiedStyleCommand(command, s, a, captured)) return;
    if(command.type==='resize'){
      const generation=this.currentSelectionGeneration,live=copy(this.selection);
      const plan=prepareNativeTrackResize(a,s,command,()=>this.cellBoxes(s));
      if(plan){
        if(plan.unchanged)return;
        const reference=a.captureSelection(live);
        this.selection=this.history.transact('resize-table-tracks',live,()=>{
          if(this.currentSelectionGeneration!==generation||this.adapter!==a)throw Error('표 크기 조절 선택이 변경되었습니다.');
          plan.apply();
          return a.resolveSelection(reference);
        });
        this.preferredX=undefined;
        return;
      }
      if(command.nativeEdge||command.nativeTrackRequired)
        throw new UnsupportedTableOperation('resize-track-unsupported','현재 표 경계나 선택 범위를 조절할 수 없습니다.');
    }
    if (command.type === "paragraph" && nested(s.focus))
      validateParagraphDelta(command.props);
    if (
      nested(s.focus) &&
      ["cell", "resize"].includes(command.type)
    ) {
      if(command.type==='resize')throw new UnsupportedTableOperation('resize-nested-scope','중첩 표의 크기 조절은 아직 지원하지 않습니다.');
      throw Error("Core API 미지원: 중첩 표 구조·크기·셀 속성 변경");
    }
    if (
      s.kind === "table" &&
      nested(s.focus) &&
      ["delete", "insert", "paste", "break"].includes(command.type)
    )
      throw Error("Core API 미지원: 자식 표 전체 삭제·대체");
    if (this.executePreparedPasteCommand(command, s, a, captured)) return;
    let emptyResize = false;
    const preflight = () => {
      const plan = this.validateCommand(command, s);
      if(command.type==='resize'&&command.trackBoundary&&command.redistribute&&!this.redistribution(command,s).updates.length){emptyResize=true;return plan;}
      for (const t of this.targets(s)) a.assertEditable(t.p);
      return plan;
    };
    // Synchronous reads only, ending BEFORE History/snapshot/Core mutation.
    // Existing Adapter invalidation and raw-value isolation remain unchanged.
    const mergedResize = command.type==='resize' ? a.withViewQueries(preflight) : preflight();
    if(emptyResize)return;
    if (this.executeRelativeFormattingCommand(command, s, a, captured)) return;
    if (
      command.type === "delete" &&
      s.kind === "caret" &&
      (command.backward
        ? s.focus.offset === 0 && paraIndex(s.focus) === 0
        : s.focus.offset === a.length(s.focus) &&
          paraIndex(s.focus) === a.count(s.focus) - 1)
    )
      return;
    const typingCommand = this.prepareTypingCommand(command, s, a);
    if (typingCommand === undefined) return;
    command = typingCommand;
    if (this.executeDirectFormatCommand(command, s, a, captured)) return;
    this.transactDefaultCommand(command, s, a, captured, mergedResize);
  }
  private prepareCommandExecution(command: Command, captured?: ExecutionCapture): { a: RhwpAdapter; s: Selection } {
    const emptyInsert = command.type === "insert" && command.text === "";
    if (!emptyInsert) this.resetBlockSequence();
    this.assertStylePolicy(command);
    if (captured?.resizeSelectionBefore &&
        (command.type !== "resize" || JSON.stringify(captured.resizeSelectionBefore) !== JSON.stringify(this.selection)))
      throw Error("크기 조절 시작 선택이 변경되었습니다.");
    const a = this.adapter;
    if (
      captured &&
      (captured.documentId !== a.documentId || captured.revision !== a.revision)
    )
      throw Error("대화상자 대상 문서가 변경되었습니다.");
    if (
      command.type === "style" &&
      captured &&
      JSON.stringify(captured.selection) !== JSON.stringify(this.selection)
    )
      throw Error("스타일 선택 대상이 변경되었습니다. 다시 여세요.");
    const s = captured?.paths
      ? a.resolveSelection(captured.paths)
      : (captured?.selection ?? this.selection);
    if (emptyInsert && !(s.kind === "caret" || (s.kind === "text" && samePosition(s.anchor, s.focus))))
      this.resetBlockSequence();
    return { a, s };
  }
  private executePreparedTargetCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture): boolean {
    if(command.type==='textbox-edit'){
      this.validateSelection(s);
      if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('글상자 선택 대상이 변경되었습니다.');
      const apply=prepareTextboxEdit(a,s,command.change);if(!apply)return true;
      this.selection=this.history.transact('textbox-edit',s,apply);this.typing={};this.block=false;this.preferredX=undefined;return true;
    }
    if(command.type==='remaining-edit'){
      this.validateSelection(s);if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('명령의 정확한 선택 대상이 변경되었습니다.');
      const apply=prepareRemainingEdit(a,s,command.change);if(!apply)return true;
      this.selection=this.history.transact('remaining-'+command.change.kind,s,apply);this.preferredX=undefined;this.block=false;return true;
    }
    if(command.type==='paragraph-move'){
      this.validateSelection(s);if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('이동할 문단 선택이 변경되었습니다.');const apply=prepareParagraphMove(a,s,command.direction);if(!apply)return true;
      this.selection=this.history.transact('paragraph-move',s,apply);this.preferredX=undefined;return true;
    }
    if(command.type==='cell-equal'){
      this.validateSelection(s);if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('같게 할 셀 선택이 변경되었습니다.');
      const apply=prepareEqualCells(a,s,command.axis);if(!apply)return true;
      this.selection=this.history.transact('cell-equal',s,apply);this.preferredX=undefined;return true;
    }
    if(command.type==='paper'){
      this.validateSelection(s);
      if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('용지 대상 선택이 변경되었습니다.');
      const apply=preparePaper(a,s,command.change);if(!apply)return true;
      this.selection=this.history.transact('paper',s,apply);this.preferredX=undefined;return true;
    }
    if(command.type==='table-split') {
      this.validateSelection(s);const p=s.focus;
      if(p.kind!=='cell'||nested(p)||s.kind!=='cells')throw Error('일반 셀 블록에서 나눌 셀을 선택하세요. 중첩 병합 해제는 기존 명령을 사용하세요.');
      if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('나눌 셀 선택이 변경되었습니다.');
      if(![command.rows,command.cols].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=16)||typeof command.equalHeight!=='boolean')throw Error('나눌 줄·칸 수는 1~16 정수로 입력하세요.');
      if(command.rows===1&&command.cols===1)return true;
      const request=command;
      const selected=this.cells(s),all=a.cells(p);
      if(!selected.length||all.some(c=>c.rowSpan!==1||c.colSpan!==1))throw Error('현재 임의 나누기는 병합 없는 일반 표의 정확한 셀 블록에서 지원합니다. 기존 표는 유지합니다.');
      for(const t of this.targets(s))a.assertEditable(t.p);
      const r0=Math.min(...selected.map(c=>c.row)),c0=Math.min(...selected.map(c=>c.col)),r1=Math.max(...selected.map(c=>c.row)),c1=Math.max(...selected.map(c=>c.col));
      if(selected.length!==(r1-r0+1)*(c1-c0+1)||new Set(selected.map(c=>c.cellIdx)).size!==selected.length)throw Error('나눌 셀을 정확한 사각형으로 선택하세요.');
      this.selection=this.history.transact('table-split',s,()=>{
        a.call('splitTableCellsInRange',p.sec,p.para,p.control,r0,c0,r1,c1,request.rows,request.cols,request.equalHeight);
        const next=a.cells(p).find(c=>c.row===r0&&c.col===c0);if(!next)throw Error('나눈 셀의 정확한 대상 재조회 실패');
        return {kind:'caret',focus:{...p,cell:next.cellIdx,cellPara:0,offset:0}};
      });this.preferredX=undefined;this.block=false;return true;
    }
    if(command.type==='table-object'){
      this.validateSelection(s);if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('표 개체 선택이 변경되었습니다.');
      const apply=prepareTableObject(a,s,command.action,command.props);if(!apply)return true;
      const before=a.doc.exportHwpx();
      this.selection=this.history.transact('table-object',s,apply,()=>{const after=a.doc.exportHwpx();return before.length===after.length&&before.every((v,i)=>v===after[i]);});
      this.preferredX=undefined;this.block=false;return true;
    }
    if(command.type==='object-ungroup'){
      this.validateSelection(s);
      if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('묶음 개체 선택이 변경되었습니다.');
      const apply=prepareUngroup(a,s);
      this.selection=this.history.transact('object-ungroup',s,apply);this.preferredX=undefined;this.block=false;return true;
    }
    if(command.type==='control-offset'){
      this.validateSelection(s);if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('개체 대상 선택이 변경되었습니다.');
      const apply=prepareControlOffset(a,s,command.dx,command.dy);if(!apply)return true;
      this.selection=this.history.transact('control-offset',s,apply);this.preferredX=undefined;return true;
    }
    if(command.type==='control-key'){
      this.validateSelection(s);if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('개체 대상 선택이 변경되었습니다.');
      const apply=prepareControlKey(a,s,command.action);if(!apply)return true;
      this.selection=this.history.transact('control-key',s,apply);this.preferredX=undefined;return true;
    }
    if(command.type==='table-autofill'){
      this.validateSelection(s);
      if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('채울 셀 선택이 변경되었습니다.');
      const plan=autofillPlan(a,s,command.repeat);if(!plan.writes.length)return true;
      this.selection=this.history.transact('table-autofill',s,plan.apply);this.preferredX=undefined;this.block=false;return true;
    }
    if(command.type==='delete-line-end'||command.type==='delete-current-line'||command.type==='delete-word') {
      this.validateSelection(s);const text=textSelection(s),p=text.focus;
      let range:Selection=text;
      if(text.kind==='caret') {
        let end:Position;
        let start=copy(p);
        if(command.type==='delete-word')end=wordAcrossPosition(a,p,command.backward?-1:1);
        else {
          if(p.kind!=='body'||a.hasBodyLayoutObject(p))throw Error('줄 끝 지우기는 개체 없는 본문 줄에서 지원합니다. 기존 선택을 유지합니다.');
          const v=this.currentVisualCaret(),line=v?.line??a.bodyLine(p);end=a.bodyLineEdge(p,line,true).position;
          if(command.type==='delete-current-line')start=a.bodyLineEdge(p,line,false).position;
        }a.validate(end);
        if(samePosition(start,end))return true;
        range={kind:'text',anchor:start,focus:end};
      }
      for(const t of this.targets(range))a.assertEditable(t.p);
      this.validateCommand({type:'delete',backward:false},range);
      this.selection=this.history.transact(command.type,s,()=>this.apply({type:'delete',backward:false},range));
      this.typing={};this.preferredX=undefined;this.block=false;return true;
    }
    return false;
  }
  private lowerExecutionAlias(command: Command, s: Selection, a: RhwpAdapter): Command {
    // Preserve A's existing semantic aliases after resolving D's stable target.
    // They still enter the same char plan and single History transaction.
    if(command.type === "script") {
      const mode=command.mode, enabled=mode!=="normal"&&this.formatState("char",s)[mode]!==true;
      command={type:"char",props:{superscript:mode==="superscript"&&enabled,subscript:mode==="subscript"&&enabled}};
    }
    if(command.type === "toggle-char") {
      a.assertEditable(s.focus);
      command={type:"char",props:{[command.property]:this.formatState("char",s)[command.property]!==true}};
    }
    if(command.type === "underline") command={type:"char",props:{underline:this.formatState("char",s).underline!==true}};
    return command;
  }
  private executePageObjectCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture): boolean {
    if (command.type === "columns") {
      this.validateSelection(s);
      if (captured && (JSON.stringify(captured.selection) !== JSON.stringify(this.selection) || JSON.stringify(s) !== JSON.stringify(this.selection)))
        throw Error("다단 적용 본문 선택이 변경되었습니다.");
      const apply = prepareColumns(a, s, command.change);
      if (!apply) return true;
      this.selection = this.history.transact("columns", s, apply);
      this.typing = {};
      return true;
    }
    if (command.type === "page-break") {
      this.validateSelection(s);
      if (captured && (JSON.stringify(captured.selection) !== JSON.stringify(this.selection) || JSON.stringify(s) !== JSON.stringify(this.selection)))
        throw Error("쪽 나누기 본문 선택이 변경되었습니다.");
      const apply = preparePageBreak(a, s);
      this.selection = this.history.transact("page-break", s, apply);
      this.typing = {}; this.preferredX = undefined;
      return true;
    }
    if (command.type === "column-definition-break") {
      this.validateSelection(s);
      if (captured && (JSON.stringify(captured.selection) !== JSON.stringify(this.selection) || JSON.stringify(s) !== JSON.stringify(this.selection)))
        throw Error("단 설정을 나눌 본문 선택이 변경되었습니다.");
      const apply = prepareColumnDefinitionBreak(a, s);
      this.selection = this.history.transact("column-definition-break", s, apply);
      this.typing = {}; this.preferredX = undefined;
      return true;
    }
    if (command.type === "column-break") {
      this.validateSelection(s);
      if (captured && (JSON.stringify(captured.selection) !== JSON.stringify(this.selection) || JSON.stringify(s) !== JSON.stringify(this.selection)))
        throw Error("단 나누기 본문 선택이 변경되었습니다.");
      const apply = prepareColumnBreak(a, s);
      this.selection = this.history.transact("column-break", s, apply);
      this.typing = {}; this.preferredX = undefined;
      return true;
    }
    if (command.type === "page-number") {
      this.validateSelection(s);
      if (captured && (JSON.stringify(captured.selection) !== JSON.stringify(this.selection) || JSON.stringify(s) !== JSON.stringify(this.selection)))
        throw Error("쪽 번호를 넣을 본문 선택이 변경되었습니다.");
      const apply = preparePageNumber(a, s, command.kind);
      this.selection = this.history.transact("page-number", s, apply);
      this.typing = {};
      return true;
    }
    if (command.type === "header-footer") {
      this.validateSelection(s);
      if (captured && (JSON.stringify(captured.selection) !== JSON.stringify(this.selection) || JSON.stringify(s) !== JSON.stringify(this.selection)))
        throw Error("머리말·꼬리말의 본문 선택이 변경되었습니다.");
      const apply = prepareHeaderFooter(a, s, command.change);
      if (!apply) return true;
      this.selection = this.history.transact("header-footer", s, apply);
      this.typing = {};
      return true;
    }
    if (command.type === "textbox-insert") {
      this.validateSelection(s);
      if (captured && (JSON.stringify(captured.selection) !== JSON.stringify(this.selection) || JSON.stringify(s) !== JSON.stringify(this.selection))) throw Error("글상자 입력 위치가 변경되었습니다.");
      const apply = prepareTextboxInsert(a, s, command.change);
      this.selection = this.history.transact("textbox-insert", s, apply);
      this.typing = {};
      return true;
    }
    if (command.type === "shape-size") {
      this.validateSelection(s);
      if (captured && (JSON.stringify(captured.selection) !== JSON.stringify(this.selection) || JSON.stringify(s) !== JSON.stringify(this.selection))) throw Error("개체 대상 선택이 변경되었습니다.");
      const apply = prepareShapeSize(a, s, command.change);
      if (!apply) return true;
      this.selection = this.history.transact("shape-size", s, apply);
      this.typing = {};
      return true;
    }
    if(captured?.parentTableCut){
      this.validateSelection(s);
      if(command.type!=='delete'||command.backward||s.kind!=='table'||JSON.stringify(s)!==JSON.stringify(this.selection)||JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('잘라낼 부모표 선택이 변경되었습니다.');
      const apply=prepareParentTableCut(a,s,captured.parentTableCut);
      this.selection=this.history.transact('cut-parent-table',s,apply);
      this.typing={};this.preferredX=undefined;this.block=false;return true;
    }
    if(captured?.cellBlockCut){
      this.validateSelection(s);
      if(command.type!=='delete'||command.backward||s.kind!=='cells'||
         JSON.stringify(s)!==JSON.stringify(this.selection)||JSON.stringify(captured.selection)!==JSON.stringify(this.selection))
        throw Error('잘라낼 셀 블록 선택이 변경되었습니다.');
      const apply=prepareCellBlockObjectCut(a,s,captured.cellBlockCut,this.cells(s).map(c=>c.cellIdx));
      this.selection=this.history.transact('delete',s,()=>apply(()=>this.clear(s)));
      this.typing={};this.preferredX=undefined;this.block=false;return true;
    }
    if (command.type === 'cut-object') {
      this.validateSelection(s);
      if (!captured || JSON.stringify(s) !== JSON.stringify(this.selection) ||
          JSON.stringify(captured.selection) !== JSON.stringify(this.selection))
        throw Error('잘라낼 개체 선택이 변경되었습니다.');
      const apply = prepareObjectCut(a, s, command.source);
      this.selection = this.history.transact('cut-object', s, apply);
      this.typing = {}; this.preferredX = undefined; this.block = false;
      return true;
    }
    if (s.kind === 'object' && s.focus.kind === 'cell' &&
        (command.type === 'delete' || command.type === 'picture' && command.change.action === 'delete')) {
      this.validateSelection(s);
      if (captured && JSON.stringify(s) !== JSON.stringify(this.selection)) throw Error('셀 그림 선택이 변경되었습니다.');
      const source = selectedCutObject(a,s);
      if (!('cellPicture' in source) || !source.cellPicture) throw Error('선택한 셀 그림만 삭제할 수 있습니다.');
      const apply = prepareObjectCut(a,s,source);
      this.selection = this.history.transact('picture',s,apply);
      this.typing = {}; this.preferredX = undefined; this.block = false; return true;
    }
    if (command.type === "picture") {
      this.validateSelection(s);
      if(captured && JSON.stringify(s)!==JSON.stringify(this.selection))throw Error("그림 대상 선택이 변경되었습니다.");
      const apply=preparePicture(a,s,command.change);
      if(!apply)return true;
      this.selection=this.history.transact("picture",s,apply);this.typing={};return true;
    }
    return false;
  }
  private executeWholeBodyDeletionCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture): boolean {
    if(command.type==='delete'&&wholeBodySection(a,s)){
      const apply=prepareWholeBodyDelete(a,s);if(!apply)return true;
      this.selection=this.history.transact('delete-whole-body',s,apply);
      this.block=false;this.typing={};this.preferredX=undefined;return true;
    }
    return false;
  }
  private executeCurrentPositionCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture): boolean {
    if (command.type === 'paragraph-current-position') {
      if (captured && JSON.stringify(captured.selection) !== JSON.stringify(this.selection))
        throw Error('현재 위치 맞추기의 선택이 변경되었습니다.');
      const plan = prepareCurrentPosition(a, s, this.cursorRect());
      if (plan.unchanged) return true;
      const reference = a.captureSelection(s);
      // Hancom keeps the Apply caret, but Undo/Redo return to this owner's
      // text start. Keep body/cell/ancestor identity; native raw control-slot
      // positions must not be used as Core logical offsets.
      const historySelection: Selection = { kind: 'caret', focus: { ...plan.p, offset: 0 } };
      this.selection = this.history.transact('paragraph-current-position', historySelection, () => {
        a.paragraph(plan.p, plan.props, plan.p.kind === 'cell' ? a.captureParagraph(plan.p) : undefined);
        const observed = exactParagraphPosition(a, plan.p);
        if (observed.left !== plan.expected.left || observed.indent !== plan.expected.indent)
          throw Error('Core가 현재 위치에 맞춘 문단 여백을 반영하지 않아 취소했습니다.');
        if (plan.caret.y === plan.first.y) {
          const after = a.navigationRect(a.rect(plan.p));
          if (after.pageIndex !== plan.caret.pageIndex || after.x !== plan.caret.x)
            throw Error('Core 재조판에서 첫 줄의 현재 글자 위치가 바뀌어 적용을 취소했습니다. 기존 문단·선택을 유지합니다.');
        }
        return a.resolveSelection(reference);
      }, undefined, historySelection);
      this.preferredX = undefined;
      return true;
    }
    return false;
  }
  private executeCopiedStyleCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture): boolean {
    if (command.type === "format-copy") {
      const sample = command.sample;
      if (sample.documentId !== a.documentId || (sample.snapshot
        ? sample.snapshot.native !== a.doc : sample.revision !== a.revision))
        throw Error("모양을 가져온 문서 또는 지원되는 상태가 변경되었습니다. 다시 가져오세요.");
      if (!["char", "paragraph", "both"].includes(sample.mode) ||
          !["text", "cells"].includes(s.kind) || nested(s.focus))
        throw Error("본문 블록·일반 셀의 글자·문단 모양만 적용할 수 있습니다.");
      if (s.kind === "text" && samePosition(s.anchor, s.focus)) throw Error("모양을 적용할 대상 블록을 선택하세요.");
      if (captured && JSON.stringify(s) !== JSON.stringify(this.selection)) throw Error("모양 적용 대상 선택이 변경되었습니다.");
      const character = sample.mode !== "paragraph" ? sample.character : undefined;
      const paragraph = sample.mode !== "char" ? sample.paragraph : undefined;
      if ((sample.mode !== "paragraph" && (!character || !Number.isSafeInteger(character.charShapeId))) ||
          (sample.mode !== "char" && (!paragraph || !Number.isSafeInteger(paragraph.paraShapeId))))
        throw Error("가져온 모양 참조를 확인할 수 없습니다.");
      const charTargets = character ? this.formatTargets("char", s) : [];
      const paraTargets = paragraph ? this.formatTargets("paragraph", s) : [];
      for (const t of [...charTargets, ...paraTargets]) { a.assertEditable(t.p); a.assertTextOnly(t.p); }
      if (character) {
        this.validateCommand({ type: "char", props: { outlineType: character.outlineType, charOffsets: character.charOffsets } }, s);
        if (charTargets.some(t => t.p.kind === "body" && this.formatSamples("char", t).some(v => JSON.stringify(v.charOffsets) !== JSON.stringify(character.charOffsets))))
          throw Error("NOT_SUPPORTED: 기존 본문 글자 위치 제한을 모양 복사로 변경할 수 없습니다.");
      }
      if (paragraph) this.validateCommand({ type: "paragraph", props: paragraph }, s);
      // Hancom's uninterrupted format-copy traces distinguish release/Undo
      // blocks from Redo: forward single-body-paragraph -> range start;
      // single F5 cell at its first paragraph start -> that same cell caret.
      // Keep unobserved reverse/multi-paragraph/multi-cell selection behavior.
      const redoSelection: Selection | undefined = s.kind === "text" &&
        s.anchor.kind === "body" && s.focus.kind === "body" &&
        s.anchor.sec === s.focus.sec && s.anchor.para === s.focus.para &&
        s.anchor.offset < s.focus.offset
        ? { kind: "caret", focus: copy(s.anchor) }
        : s.kind === "cells" && s.phase === 1 && samePosition(s.anchor, s.focus) &&
          s.focus.cellPara === 0 && s.focus.offset === 0
          ? { kind: "caret", focus: copy(s.focus) } : undefined;
      if (sample.snapshot) {
        // This snapshot contract applies to one exact paragraph, never the
        // first element of a mixed/multiple paragraph selection.
        const t = charTargets[0] ?? paraTargets[0];
        if (!t || charTargets.length > 1 || paraTargets.length > 1 ||
            character && (!charTargets[0] || t.end <= t.p.offset) ||
            paragraph && !paraTargets[0] ||
            character && paragraph && (!sameContainer(t.p, paraTargets[0].p) ||
              paraIndex(t.p) !== paraIndex(paraTargets[0].p)))
          throw Error("복사한 모양을 적용할 한 문단 범위를 선택하세요.");
        const live = this.selection, generation = this.currentSelectionGeneration;
        const id = a.documentId, revision = a.revision;
        const owner = a.clipboardTarget(t.p);
        const reference = a.captureSelection(s);
        const request = JSON.stringify({ target: {
          section: owner.sectionIndex, paragraph: owner.parentParaIndex,
          path: owner.path, expectedTargetId: owner.expectedTargetId,
        }, start: t.p.kind === "body" ? a.textOffset(t.p) : t.p.offset,
          end: t.p.kind === "body" ? a.textOffset(t.p, t.end) : t.end });
        const native = sample.snapshot;
        let unchanged = false;
        const next = this.history.transact("format-copy", s, () => {
          if (this.adapter !== a || a.doc !== native.native || a.documentId !== id ||
              a.revision !== revision || this.selection !== live ||
              this.currentSelectionGeneration !== generation || a.transientEdit)
            throw Error("모양 적용 문서 또는 선택이 변경되었습니다.");
          const reply = a.call<{status:string;reason?:string}>("oneditPrivateApplyFormatSnapshotV1", native.value, request);
          if (reply.status !== "applied" && reply.status !== "unchanged")
            throw Error(`복사한 모양을 적용할 수 없습니다 (${reply.reason ?? "unknown"}).`);
          unchanged = reply.status === "unchanged";
          return unchanged ? s : a.resolveSelection(reference);
        }, () => unchanged, redoSelection, true);
        if (!unchanged) {
          this.selection = next;
          this.typing = {}; this.preferredX = undefined;
        }
        return true;
      }
      const chars = charTargets.filter(t => t.end > t.p.offset && this.formatSamples("char", t).some(v => v.charShapeId !== character!.charShapeId));
      const paras = paraTargets.filter(t => a.paraProps(t.p).paraShapeId !== paragraph!.paraShapeId);
      for (const t of chars) if (typeof a.doc[t.p.kind === "body" ? "setCharShapeId" : "setCharShapeIdInCell"] !== "function") throw Error("기존 글자 모양 참조 적용 API 미지원");
      for (const t of paras) if (typeof a.doc[t.p.kind === "body" ? "setParaShapeId" : "setCellParaShapeId"] !== "function") throw Error("기존 문단 모양 참조 적용 API 미지원");
      if (!chars.length && !paras.length) return true;
      const reference = a.captureSelection(s);
      this.selection = this.history.transact("format-copy", s, () => {
        for (const t of chars) {
          if (t.p.kind === "body") a.call("setCharShapeId", t.p.sec, t.p.para, a.textOffset(t.p), a.textOffset(t.p, t.end), Number(character!.charShapeId));
          else a.call("setCharShapeIdInCell", t.p.sec, t.p.para, t.p.control, t.p.cell, t.p.cellPara, t.p.offset, t.end, Number(character!.charShapeId));
        }
        for (const t of paras) {
          if (t.p.kind === "body") a.call("setParaShapeId", t.p.sec, t.p.para, Number(paragraph!.paraShapeId));
          else a.call("setCellParaShapeId", t.p.sec, t.p.para, t.p.control, t.p.cell, t.p.cellPara, Number(paragraph!.paraShapeId));
        }
        return a.resolveSelection(reference);
      }, undefined, redoSelection);
      this.typing = {}; this.preferredX = undefined; return true;
    }
    if (command.type === "style-manage") {
      if (captured && JSON.stringify(captured.selection) !== JSON.stringify(this.selection))
        throw Error("스타일 관리 대상 선택이 변경되었습니다.");
      a.assertEditable(s.focus);
      const mutate = prepareStyleMutation(a, command.request);
      if (!mutate) return true;
      const reference = a.captureSelection(s);
      this.selection = this.history.transact("style-manage", s, () => {
        mutate();
        return a.resolveSelection(reference);
      });
      this.typing = {};
      return true;
    }
    if (command.type === "style") {
      if (command.resetDirect !== undefined && typeof command.resetDirect !== "boolean")
        throw Error("잘못된 스타일 초기화 요청입니다.");
      const resetDirect = command.resetDirect ?? false;
      const targets = this.styleTargets(s),
        styles = a.call("getStyleList"),
        id = command.id;
      if (
        !Number.isInteger(id) ||
        !styles.some((v: any) => v.id === id && v.type === 0)
      )
        throw Error("지원하지 않는 문단 스타일입니다");
      const needed = targets.filter(({ p }) => {
        if (styleAt(a, p).id !== id) return true;
        if (!resetDirect) return false;
        const actual = observeStyle(a, p);
        return !actual.paragraphMatchesDefault || actual.differingCharacterRuns > 0;
      });
      if (!needed.length) {
        if (resetDirect) this.typing = {};
        return true;
      }
      const reference = a.captureSelection(s);
      this.selection = this.history.transact("style", s, () => {
        for (const { p } of needed) {
          applyStyleAt(a, p, id, resetDirect);
        }
        return a.resolveSelection(reference);
      });
      this.typing = {};
      this.preferredX = undefined;
      return true;
    }
    return false;
  }
  private executePreparedPasteCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture): boolean {
    if (command.type === "paste" && command.markdownTable) {
      const plan = command.markdownTable, p = s.focus;
      if (!isClipboardMarkdownTable(plan) || command.structured)
        throw Error("마크다운 표 붙여넣기 계획을 확인할 수 없습니다.");
      if (p.kind !== "body" || !(s.kind === "caret" || s.kind === "text" && samePosition(s.anchor, p)))
        throw new PasteFormatUnavailable("마크다운 표는 일반 본문의 커서 위치에 붙일 수 있습니다.");
      a.assertEditable(p);
      if (a.hasBodyLayoutObject(p))
        throw new PasteFormatUnavailable("표와 개체가 없는 본문 문단에 붙여넣으세요.");
      const html = externalCoreHTML(plan.html, command.text);
      if (!html) throw Error("마크다운 표의 변환 결과를 확인할 수 없습니다.");
      const offset = a.textOffset(p), original = Array.from(a.text(p));
      const left = original.slice(0, offset).join(""), right = original.slice(offset).join("");
      const expected = [...(left ? [{text: left}] : []), ...plan.blocks, ...(right ? [{text: right}] : [])];
      const count = a.doc.getParagraphCount(p.sec);
      this.selection = this.history.transact("paste", s, () => {
        const r = a.call("pasteHtml", p.sec, p.para, offset, html);
        if (r.ok !== true || !Number.isSafeInteger(r.paraIdx) || !Number.isSafeInteger(r.charOffset) ||
            r.paraIdx !== p.para + expected.length - 1 ||
            a.doc.getParagraphCount(p.sec) !== count + expected.length - 1)
          throw Error("마크다운 표의 삽입 위치나 원래 문단을 확인할 수 없습니다.");
        let finalTableEnd: number | undefined;
        for (const [i, block] of expected.entries()) {
          const body = { ...p, para: p.para + i, offset: 0 };
          if ("text" in block) {
            if (a.text(body) !== block.text) throw Error("붙여넣기 전후 문단 내용을 확인할 수 없습니다.");
            continue;
          }
          const tables = a.inline(body);
          if (tables.length !== 1) throw Error("새 표의 소유 위치를 확인할 수 없습니다.");
          const table = tables[0], {controlIndex} = table;
          const dims = a.call("getTableDimensions", body.sec, body.para, controlIndex);
          if (dims.rowCount !== block.rows.length || dims.colCount !== block.rows[0].length)
            throw Error("붙여넣은 표의 행과 열이 원본과 다릅니다.");
          for (const [row, cells] of block.rows.entries()) {
            for (const [col, text] of cells.entries()) {
              const index = row * cells.length + col;
              const cell = {kind: "cell" as const, sec: body.sec, para: body.para,
                control: controlIndex, cell: index, cellPara: 0, offset: 0};
              const grid = a.call("getCellInfo", body.sec, body.para, controlIndex, index);
              if (grid.row !== row || grid.col !== col || grid.rowSpan !== 1 || grid.colSpan !== 1 ||
                  a.doc.getCellParagraphCount(body.sec, body.para, controlIndex, index) !== 1 ||
                  a.text(cell) !== text) throw Error("붙여넣은 표의 셀 내용이 원본과 다릅니다.");
            }
          }
          if (i === expected.length - 1) finalTableEnd = table.offset + 1;
        }
        const next = { ...p, para: r.paraIdx, offset: 0 };
        next.offset = finalTableEnd ?? a.logical(next, r.charOffset);
        a.validate(next); a.exportChecked();
        return {kind: "caret", focus: next};
      });
      this.preferredX = undefined;
      this.typing = {};
      return true;
    }
    if (
      command.type === "paste" &&
      this.clipboard.isNested(command.html ?? "", command.structured)
    ) {
      if (
        s.kind !== "caret" ||
        (s.focus.offset !== 0 && s.focus.offset !== a.length(s.focus))
      )
        throw new PasteFormatUnavailable(
          "NOT_SUPPORTED: 중첩 구조화 붙여넣기는 선택 대체 없이 문단 시작/끝 경계만 지원합니다.",
        );
      a.assertEditable(s.focus);
      const { html = "", structured } = command;
      this.selection = this.history.transact("paste", s, () => ({
        kind: "caret",
        focus: this.clipboard.pasteNested(a, s.focus, html, structured),
      }));
      this.preferredX = undefined;
      this.typing = {};
      return true;
    }
    if (command.type === "paste" && s.focus.kind === "cell" &&
        (command.structured || this.clipboard.recognizes(command.html ?? ""))) {
      if (s.kind !== "caret")
        throw new PasteFormatUnavailable("NOT_SUPPORTED: 셀 서식 붙여넣기는 선택 대체 없이 커서 위치에서 지원합니다.");
      a.assertEditable(s.focus);
      // pasteCell checks text-only splices itself; an owned object fragment at
      // an exact paragraph boundary must retain its real cell owner instead.
      const { text, html = "", structured } = command;
      this.selection = this.history.transact("paste", s, () => ({
        kind: "caret",
        focus: this.clipboard.pasteCell(a, s.focus, text, html, structured),
      }));
      this.preferredX = undefined;
      this.typing = {};
      return true;
    }
    if (
      command.type === "paste" &&
      s.focus.kind === "cell" &&
      (command.structured ||
        this.clipboard.recognizes(command.html ?? "") ||
        /<table[\s>]/i.test(command.html ?? ""))
    )
      throw new PasteFormatUnavailable(
        "NOT_SUPPORTED: D Studio의 셀 구조화 붙여넣기 연결은 미지원입니다. 텍스트 붙여넣기는 지원합니다.",
      );
    if (command.type === "paste" && !command.structured) {
      const html = externalCoreHTML(command.html ?? "", command.text);
      if (html) {
        // A click with sub-character pointer motion can leave a text range
        // whose validated endpoints are identical. It replaces no content and
        // owns the same exact insertion point as a caret. Keep the original
        // selection for History/Undo; nonempty ranges keep their refusal.
        const insertionOnly = s.kind === "caret" ||
          s.kind === "text" && samePosition(s.anchor, s.focus);
        if (insertionOnly && s.focus.kind === "cell" &&
            s.focus.offset === a.length(s.focus) && !/<table[\s>]/i.test(html)) {
          // The existing path-aware HTML importer owns whitespace and definitions.
          // Keep the same text-only paragraph-end boundary and caller History.
          const p = s.focus;
          a.assertEditable(p); a.assertTextOnly(p);
          this.selection = this.history.transact("paste", s, () => {
            const r = a.call("pasteHtmlInCellByPath", p.sec, p.para, a.path(p), a.textOffset(p), html);
            if (!Number.isSafeInteger(r.cellParaIdx) || !Number.isSafeInteger(r.charOffset))
              throw Error("외부 HTML 셀 붙여넣기 커서 결과를 확인할 수 없습니다.");
            const next = { ...p, cellPara: r.cellParaIdx, offset: 0 };
            next.offset = a.logical(next, r.charOffset);
            a.validate(next); a.exportChecked();
            return { kind: "caret", focus: next };
          });
          this.typing = {}; this.preferredX = undefined;
          return true;
        }
        // Sanitize HTML and validate every ordinary body owner before mutation.
        // Only the outer History transaction may delete and insert this range.
        const range = s.kind === "text" && !samePosition(s.anchor,s.focus)
          ? ordered(s.anchor,s.focus) : undefined;
        if (range) {
          // This new connection certifies formatted text, not replacement of
          // object/table graphs. Preserve the existing caret importer separately.
          if(/<table[\s>]/i.test(html))throw new PasteFormatUnavailable("NOT_SUPPORTED: 표가 포함된 외부 HTML의 선택 대체는 별도 지원 범위입니다.");
          const [from,to]=range;
          if(from.kind!=="body"||to.kind!=="body"||from.sec!==to.sec)
            throw new PasteFormatUnavailable("NOT_SUPPORTED: 외부 HTML 선택 대체는 같은 구역의 일반 본문에서 지원합니다.");
          a.validate(from);a.validate(to);a.assertTextOnly(from,to.para);
          for(let para=from.para;para<=to.para;para++){
            const p={...from,para,offset:para===from.para?from.offset:0};a.assertEditable(p);
            if(a.hasBodyLayoutObject(p))throw new PasteFormatUnavailable("NOT_SUPPORTED: 개체가 포함된 본문 선택의 외부 HTML 대체는 지원하지 않습니다.");
          }
        } else {
          if (!insertionOnly || s.focus.kind !== "body" || a.hasBodyLayoutObject(s.focus))
            throw new PasteFormatUnavailable("NOT_SUPPORTED: 외부 HTML 서식은 개체 없는 일반 본문 커서 또는 본문 선택에 붙여넣으세요.");
          a.validate(s.focus);
          if (s.focus.offset !== a.length(s.focus)) {
            // Existing Core pasteHtml splits the text-only host at this exact
            // scalar boundary and merges its preserved suffix into the final
            // imported paragraph. No preliminary deletion or caret relocation.
            // Interior table/object imports remain outside this connection.
            if (/<table[\s>]/i.test(html))
              throw new PasteFormatUnavailable("NOT_SUPPORTED: 표가 포함된 외부 HTML은 문단 끝 커서에 붙여넣으세요.");
            a.assertTextOnly(s.focus);
          }
        }
        a.assertEditable(s.focus);
        this.selection = this.history.transact("paste", s, () => {
          const p = range ? copy(range[0]) : s.focus;
          if(range)a.remove(range[0],range[1]);
          const r = a.call("pasteHtml", p.sec, p.para, a.textOffset(p), html);
          if (!Number.isSafeInteger(r.paraIdx) || !Number.isSafeInteger(r.charOffset))
            throw Error("외부 HTML 붙여넣기 커서 결과를 확인할 수 없습니다.");
          const next = { ...p, para: r.paraIdx, offset: 0 };
          next.offset = a.logical(next, r.charOffset);
          a.validate(next); a.exportChecked();
          return { kind: "caret", focus: next };
        });
        this.typing = {}; this.preferredX = undefined;
        return true;
      }
    }
    if (command.type === "paste" && !command.structured && externalTextFormat(command.html ?? "", command.text)) {
      if(s.kind==="text"&&s.anchor.kind==="body"&&s.focus.kind==="body"&&s.anchor.sec===s.focus.sec){
        const [from,to]=ordered(s.anchor,s.focus);a.validate(from);a.validate(to);a.assertTextOnly(from,to.para);
        for(let para=from.para;para<=to.para;para++){const p={...from,para,offset:para===from.para?from.offset:0};a.assertEditable(p);if(a.hasBodyLayoutObject(p))throw new PasteFormatUnavailable("NOT_SUPPORTED: 개체가 포함된 선택의 외부 부분 서식 대체는 지원하지 않습니다.");}
      }else{
        if (s.kind !== "caret" || s.focus.kind !== "body" || s.focus.offset !== a.length(s.focus))
          throw new PasteFormatUnavailable("NOT_SUPPORTED: 외부 부분 텍스트는 일반 본문 선택 또는 문단 끝에서 붙여넣으세요.");
        a.assertTextOnly(s.focus);
      }
    }
    return false;
  }
  private executeRelativeFormattingCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture): boolean {
    if(command.type==='list-level'||command.type==='line-spacing-step') {
      if(captured&&JSON.stringify(captured.selection)!==JSON.stringify(this.selection))throw Error('서식 증감 선택이 변경되었습니다.');
      const plan=this.paragraphStepPlan(command.type,command.direction,s);
      if(!plan.length)return true;
      const reference=a.captureSelection(s);
      this.selection=this.history.transact(command.type,s,()=>{
        for(const t of plan){a.paragraph(t.p,t.props);const actual=a.paraProps(t.p);for(const [k,v]of Object.entries(t.props))if(actual[k]!==v)throw Error('Core 문단 증감 결과가 요청과 일치하지 않습니다.');}
        return a.resolveSelection(reference);
      });this.preferredX=undefined;return true;
    }
    if (command.type === "paragraph-relative") {
      const plan = this.paragraphAdjustmentPlan(command.change, s);
      if (!plan.length) return true;
      const reference = a.captureSelection(s);
      this.selection = this.history.transact("paragraph-relative", s, () => {
        for (const t of plan) {
          a.paragraph(t.p, t.props);
          if (paragraphAdjustmentRaw(a, t.p)[t.key] !== t.expected)
            throw Error("Core 문단 여백 재조회가 요청과 일치하지 않습니다.");
        }
        return a.resolveSelection(reference);
      });
      this.preferredX = undefined;
      return true;
    }
    if (command.type === "char-relative") {
      const change = command.change;
      if (s.kind === "caret") {
        this.typing = relativeTyping(a.charProps(s.focus), this.typing, change);
        return true;
      }
      // Plan the entire selection before any setter: one out-of-range character
      // refuses the whole action, including earlier paragraphs and selected cells.
      const plan: { p: Position; end: number; props: Props }[] = [];
      for (const t of this.formatTargets("char", s)) {
        a.assertEditable(t.p);
        const from = a.textOffset(t.p), end = a.textOffset(t.p, t.end);
        for (let at = from; at < end; at++) {
          const p = { ...t.p, offset: a.logical(t.p, at) };
          const next = a.logical(t.p, at + 1);
          const props = relativeCharacterPatch(a.charProps(p), change);
          const previous = plan.at(-1);
          if (previous && samePosition({ ...previous.p, offset: previous.end }, p) &&
              JSON.stringify(previous.props) === JSON.stringify(props)) previous.end = next;
          else plan.push({ p, end: next, props });
        }
      }
      if (!plan.length) return true;
      const reference = a.captureSelection(s);
      this.selection = this.history.transact("char-relative", s, () => {
        for (const t of plan) a.format(t.p, t.end, t.props);
        return a.resolveSelection(reference);
      });
      this.preferredX = undefined;
      return true;
    }
    if (command.type === "numbering-restart") {
      validateNumberRestart(command.change);
      const reason = numberRestartReason(this);
      if (reason) throw Error(reason);
      const { mode, start = 1 } = command.change, before = a.paraProps(s.focus);
      if ((mode === 2 && before.numberingRestartMode === 2 && before.numberingStartNum === start) ||
          (mode !== 2 && before.numberingRestartMode === mode) ||
          (mode === 1 && before.numberingRestartMode === 0)) return true;
      const reference = a.captureSelection(s);
      this.selection = this.history.transact("numbering-restart", s, () => {
        a.call("setNumberingRestart", s.focus.sec, s.focus.para, mode, start);
        const observed = a.paraProps(s.focus);
        if (observed.headType !== "Number" || (mode === 2
          ? observed.numberingRestartMode !== 2 || observed.numberingStartNum !== start
          : ![0, 1].includes(Number(observed.numberingRestartMode))))
          throw Error("Core 번호 재조회가 요청과 일치하지 않습니다.");
        return a.resolveSelection(reference);
      });
      this.preferredX = undefined;
      return true;
    }
    if (command.type === "paragraph-list") {
      const request = command.list;
      const paragraphProps = command.props ?? {};
      if (["headType", "numberingId", "paraLevel"].some(k => k in paragraphProps))
        throw Error("번호 속성은 문단 번호 명령으로 함께 변경하세요.");
      this.validateCommand({ type: "paragraph", props: paragraphProps }, s);
      const catalog = a.paragraphListCatalog();
      if (request.custom && (typeof a.doc.createNumbering !== "function" || catalog.numbers.length >= 65535))
        throw Error("사용자 번호 정의 생성 API 또는 정의 용량 제한");
      const deltas = this.formatPlan("paragraph", paragraphProps, s);
      const plans = this.formatTargets("paragraph", s).map(t => {
        a.assertEditable(t.p);
        if (nested(t.p)) throw Error("NOT_SUPPORTED: 중첩 셀 문단 번호 변경은 지원하지 않습니다.");
        const list = listPlan(a.paraProps(t.p), request, catalog);
        const delta = deltas.find(d => samePosition(d.p, t.p));
        return { ...t, props: { ...delta?.props, ...list.props }, create: list.create };
      }).filter(t => t.create || Object.keys(t.props).length);
      if (!plans.length) return true;
      const reference = a.captureSelection(s);
      this.selection = this.history.transact("paragraph-list", s, () => {
        const ids = new Map<"Number" | "Bullet" | "custom", number>();
        for (const t of plans) {
          if (t.create) {
            if (!ids.has(t.create)) ids.set(t.create, t.create === "custom"
              ? a.doc.createNumbering(JSON.stringify(request.custom)) : t.create === "Number"
              ? a.doc.ensureDefaultNumbering() : a.doc.ensureDefaultBullet("•"));
            const id = ids.get(t.create)!;
            if (!Number.isSafeInteger(id) || id < 1 || id > 65535) throw Error("기본 번호 정의 생성 실패");
            if (t.create === "custom") {
              const after = a.paragraphListCatalog().numbers, observed = after.find(d => d.id === id);
              if (after.length !== catalog.numbers.length + 1 ||
                  JSON.stringify(after.slice(0, -1)) !== JSON.stringify(catalog.numbers) ||
                  id !== catalog.numbers.length + 1 || !observed ||
                  observed.startNumber !== request.custom!.startNumber ||
                  JSON.stringify(observed.levelFormats) !== JSON.stringify(request.custom!.levelFormats))
                throw Error("Core 번호 정의 재조회 실패");
            }
            t.props.numberingId = id;
          }
          a.paragraph(t.p, t.props);
          const observed = a.paraProps(t.p);
          for (const key of ["headType", "numberingId", "paraLevel"])
            if (key in t.props && observed[key] !== t.props[key])
              throw Error("Core가 요청한 문단 번호 속성을 반영하지 않았습니다.");
        }
        return a.resolveSelection(reference);
      });
      this.preferredX = undefined;
      return true;
    }
    return false;
  }
  private prepareTypingCommand(command: Command, s: Selection, a: RhwpAdapter): Command | undefined {
    if (command.type === "char") command = { ...command, props: normalizeUnderlineChange(command.props) };
    if (command.type === "char" && s.kind === "caret") {
      this.typing = mergeUnderlineTyping(this.typing, command.props);
      return;
    }
    if (command.type === "bold" && s.kind === "caret") {
      this.typing = {
        ...this.typing,
        bold: !(this.typing.bold ?? a.charProps(s.focus).bold),
      };
      return;
    }
    if (command.type === "bold")
      command = {
        type: "char",
        props: { bold: this.formatState("char", s).bold !== true },
      };
    return command;
  }
  private executeDirectFormatCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture): boolean {
    if (
      command.type === "char" ||
      command.type === "paragraph" ||
      command.type === "cell"
    ) {
      const kind = command.type;
      if (kind === "paragraph" && captured?.paragraphTargets) {
        const expected = captured.paragraphTargets.map(
          (t) => a.resolveParagraph(t).targetId,
        );
        const current = this.formatTargets(kind, s)
          .filter((t) => nested(t.p))
          .map((t) => a.captureParagraph(t.p).targetId);
        if (JSON.stringify(expected) !== JSON.stringify(current))
          throw Error("대화상자 대상 문단 범위가 변경되었습니다.");
      }
      const plan = this.formatPlan(kind, command.props, s, command.type === "cell" ? command.borders : undefined, command.type === 'cell' ? command.cellScope : undefined);
      if (!plan.length) return true;
      const selectionReference = a.captureSelection(s);
      // Snapshots cover the entire multi-target command. Shared-edge changes outside
      // the selection are rejected rather than silently widening the user's target.
      const selected = new Set(
        this.formatTargets(kind, s).map((t) =>
          t.p.kind === "cell" ? t.p.cell : -1,
        ),
      );
      const outside =
        kind === "cell" && s.focus.kind === "cell"
          ? this.adapter
              .cells(s.focus)
              .filter((c) => !selected.has(c.cellIdx))
              .map((c) => ({
                p: { ...s.focus, cell: c.cellIdx } as Position,
                props: this.adapter.cellProps({
                  ...s.focus,
                  cell: c.cellIdx,
                } as Position),
              }))
          : [];
      // Hancom's uninterrupted character Border/Fill trace keeps the forward
      // single-body-paragraph block on apply/Undo, then restores its start
      // caret on Redo. Scope this to an actual Border/Fill delta; ordinary
      // character edits, reverse/cell/multi-paragraph selections stay intact.
      const characterBorderRedo: Selection | undefined = kind === "char" &&
        plan.some(t => Object.keys(t.props).some(key => key === "characterBackground" || /^charBorder(Left|Right|Top|Bottom)\./.test(key))) &&
        s.kind === "text" && s.anchor.kind === "body" && s.focus.kind === "body" &&
        s.anchor.sec === s.focus.sec && s.anchor.para === s.focus.para &&
        s.anchor.offset < s.focus.offset
        ? { kind: "caret", focus: copy(s.anchor) } : undefined;
      this.selection = this.history.transact(kind, s, () => {
        for (const t of plan) {
          if (kind === "char") a.format(t.p, t.end, t.props);
          else if (kind === "paragraph")
            a.paragraph(t.p, t.props, t.paragraphTarget);
          else a.cellFormat(t.p, t.props);
          if (kind === "cell") {
            const observed = a.cellProps(t.p);
            if (cellLayoutKeys.some(k => k in t.props && observed[k] !== t.props[k])) throw Error("셀 안 여백·세로 정렬 재조회가 요청과 일치하지 않습니다.");
          }
        }
        for (const t of outside)
          if (JSON.stringify(a.cellProps(t.p)) !== JSON.stringify(t.props))
            throw Error(
              "Core 공유 테두리가 비선택 셀을 변경합니다. 이웃 셀도 선택하거나 바깥쪽 테두리를 사용하세요.",
            );
        return a.resolveSelection(selectionReference);
      }, undefined, characterBorderRedo);
      this.preferredX = undefined;
      return true;
    }
    return false;
  }
  private transactDefaultCommand(command: Command, s: Selection, a: RhwpAdapter, captured?: ExecutionCapture, mergedResize?:MergedGridResizePlan): void {
    if(mergedResize){
      this.selection=this.history.transact('resize',captured?.resizeSelectionBefore??s,()=>{mergedResize.apply();return copy(s);},()=>a.withViewQueries(()=>mergedResize.unchanged()),
        captured?.resizeSelectionBefore?.kind==='caret'?captured.resizeSelectionBefore:undefined);
      this.preferredX=undefined;return;
    }
    // Core can report success at a content floor without resizing any cell.
    // Inspect exact stored HU dimensions, never rounded layout boxes or the
    // requested delta. If no cell changed size, History restores the WHOLE
    // before snapshot: even incidental Core changes must not survive a no-op.
    // A real resize uses the same atomic snapshot contract as other edits.
    // Full loss/reopen/semantic validation remains in exportChecked at save;
    // serializing/reopening the entire document twice is not a no-op query.
    const resizeDimensions = () => {
      const p = s.focus;
      if (p.kind !== "cell") throw Error("크기 변경 대상 셀이 없습니다.");
      const grid = a.call("getTableDimensions", p.sec, p.para, p.control);
      if (!Number.isSafeInteger(grid.cellCount) || grid.cellCount <= 0)
        throw Error("크기 변경 대상 표 구성을 확인할 수 없습니다.");
      const sizes = Array.from({ length: grid.cellCount }, (_, cell) => {
        const { width, height } = a.call("getCellProperties", p.sec, p.para, p.control, cell);
        if (![width, height].every(v => Number.isSafeInteger(v) && v >= 0))
          throw Error("크기 변경 셀 치수를 확인할 수 없습니다.");
        return [width, height];
      });
      return { rows: grid.rowCount, cols: grid.colCount, sizes };
    };
    const resizeBefore = command.type === "resize" ? resizeDimensions() : undefined;
    const heightFrame=command.type==='resize'&&!command.redistribute&&command.height!==0&&s.focus.kind==='cell'&&resizeBefore
      ? resizeTableFrame(a,s.focus,resizeBefore):undefined;
    const heightBases=heightFrame?new Map([...heightFrame.cells].map(([cell,f])=>[cell,f.hu])):
      command.type==='resize'&&!command.redistribute&&command.height!==0&&s.focus.kind==='cell'
        ? resizeHeightBases(a,s.focus,this.resizeCells(command,s).map(c=>c.cellIdx)):undefined;
    const multipleHeightRows=command.type==='resize'&&!command.redistribute&&command.height!==0&&
      new Set(this.resizeCells(command,s).map(c=>c.row)).size>1;
    const proportionalHeightRow=!!(heightFrame?.surplus&&command.type==='resize'&&command.width===0&&
      !multipleHeightRows&&s.focus.kind==='cell'&&coreRuntimeHasCapability(a.doc,'proportional-float-height')&&
      (()=>{
        const props=a.call('getTableProperties',s.focus.sec,s.focus.para,s.focus.control);
        return props.treatAsChar===false&&props.allowOverlap===false&&props.textWrap==='TopAndBottom'&&
          props.vertRelTo==='Para'&&props.cellSpacing===0&&!props.hasCaption;
      })());
    // The pinned inverse authenticates complete ordinary compressed rows in
    // Core. Its selected cellSz is an inverse, NOT the requested display HU.
    // Keep exact non-target declarations and the existing whole-frame target
    // validator; split/merged/whole-table or unauthenticated frames stay guarded.
    // A native re-save can already close common.height over content minima.
    // Authenticate that exact whole-frame envelope and the selected declarations;
    // surplus alone does not prove compression. The pinned Core still verifies
    // its own source-line/content inverse and every forward target frame.
    const closedHeightRows=!!(heightFrame&&resizeBefore&&command.type==='resize'&&
      heightFrame.surplus&&heightFrame.source===[...heightFrame.rows.values()].reduce((n,r)=>n+r.hu,0)&&
      this.resizeCells(command,s).every(c=>heightFrame.cells.get(c.cellIdx)?.hu===resizeBefore.sizes[c.cellIdx][1]));
    // An approved explicit envelope can contain fractional content-owned rows:
    // sum(round(row HU)) is not its persisted round(sum(raw row HU)). Admit
    // only the authenticated full plain grid, anchored selected declarations
    // and exact integer outer envelope. Core still proves its stored-source
    // policy/full forward vector; a failed proof rolls back this transaction.
    const quantizedHeightRows=!!(heightFrame&&resizeBefore&&command.type==='resize'&&
      a.quantizedHeightCandidateIdentified&&heightFrame.surplus&&
      heightFrame.source===Math.round([...heightFrame.rows.values()].reduce((n,r)=>n+r.height,0)*heightFrame.units)&&
      this.resizeCells(command,s).every(c=>heightFrame.cells.get(c.cellIdx)?.hu===resizeBefore.sizes[c.cellIdx][1])&&
      [...heightFrame.cells].every(([cell,f])=>f.hu>=resizeBefore.sizes[cell][1]));
    // The fixed content-minima runtime authenticates the intact source-line
    // ladder internally even when common predates the actual row floors. Only
    // an exact ordinary grid with anchored selected declarations can use it;
    // the existing post-command full-vector/envelope/rollback proof still runs.
    const naturalHeightRows=!!(heightFrame&&resizeBefore&&command.type==='resize'&&
      a.naturalHeightCandidateIdentified&&
      this.resizeCells(command,s).every(c=>heightFrame.cells.get(c.cellIdx)?.hu===resizeBefore.sizes[c.cellIdx][1])&&
      [...heightFrame.cells].every(([cell,f])=>f.hu>=resizeBefore.sizes[cell][1]));
    // Complete-table admission is separate from partial-row inverse policy.
    // Authenticate this one runtime, every unique ordinary-grid cell, the
    // existing persisted physical envelope and declared minima before calling
    // Core. Its source-line/content/forward guards remain the final proof.
    const wholeHeightRows=!!(multipleHeightRows&&heightFrame&&resizeBefore&&
      command.type==='resize'&&!command.redistribute&&command.width===0&&
      a.wholeHeightCandidateIdentified&&
      new Set(this.resizeCells(command,s).map(c=>c.cellIdx)).size===heightFrame.cells.size&&
      this.resizeCells(command,s).every(c=>heightFrame.cells.has(c.cellIdx))&&
      heightFrame.source===Math.round([...heightFrame.rows.values()].reduce((sum,r)=>sum+r.height,0)*heightFrame.units)&&
      [...heightFrame.cells].every(([cell,f])=>f.hu>=resizeBefore.sizes[cell][1]));
    // Width reflow persists the complete content-owned envelope while keeping
    // authored cell minima. Selected row minima therefore need not equal the
    // visible HU. The fixed Core already certifies this proper-row inverse and
    // all unselected rows; require the same exact full-grid source envelope.
    // Post-command full-frame/request/non-target guards still run unchanged.
    const contentOwnedHeightRows=!!(multipleHeightRows&&heightFrame&&resizeBefore&&
      command.type==='resize'&&!command.redistribute&&command.width===0&&
      a.wholeHeightCandidateIdentified&&
      heightFrame.source===Math.round([...heightFrame.rows.values()].reduce((sum,r)=>sum+r.height,0)*heightFrame.units)&&
      [...heightFrame.cells].every(([cell,f])=>f.hu>=resizeBefore.sizes[cell][1]));
    const inverseHeightRows=!!(multipleHeightRows&&heightFrame&&resizeBefore&&
      a.heightCandidateIdentified&&(!heightFrame.surplus||closedHeightRows||quantizedHeightRows||naturalHeightRows||contentOwnedHeightRows)&&command.type==='resize'&&command.width===0&&
      new Set(this.resizeCells(command,s).map(c=>c.row)).size<heightFrame.rows.size&&
      [...heightFrame.cells].some(([cell,f])=>f.hu!==resizeBefore.sizes[cell][1]));
    const certifiedHeightRows=inverseHeightRows||wholeHeightRows;
    if(multipleHeightRows&&!certifiedHeightRows&&(!heightFrame||!resizeBefore||
      [...heightFrame.cells].some(([cell,f])=>f.hu!==resizeBefore.sizes[cell][1])))
      throw new UnsupportedTableOperation('resize-multirow-frame','여러 행의 표시·저장 높이가 달라 동시 높이 조절을 보류합니다.');
    const wholeWidthBefore=command.type==='resize'&&command.trackBoundary&&!command.redistribute&&s.focus.kind==='cell'
      ? a.call('getTableProperties',s.focus.sec,s.focus.para,s.focus.control).tableWidth as number:undefined;
    this.selection = this.history.transact(command.type, captured?.resizeSelectionBefore ?? s, () =>
      this.apply(command, s),
      resizeBefore ? () => {
        const after = resizeDimensions();
        if (after.rows !== resizeBefore.rows || after.cols !== resizeBefore.cols ||
            after.sizes.length !== resizeBefore.sizes.length)
          throw Error("크기 변경 중 표 구성이 변경되어 취소했습니다.");
        const unchanged=after.sizes.every(([w, h], cell) =>
          w === resizeBefore.sizes[cell][0] && h === resizeBefore.sizes[cell][1]);
        if(!unchanged&&command.type==='resize'&&!command.redistribute&&command.height!==0){
          const focus=s.focus;if(focus.kind!=='cell')throw Error('높이 변경 대상 셀이 없습니다.');
          const selected=new Set(this.resizeCells(command,s).map(c=>c.cellIdx));
          let physical:ReturnType<typeof resizeTableFrame>;
          if(certifiedHeightRows&&command.height<0&&heightFrame&&
            after.sizes.every(([w,h],cell)=>w===resizeBefore.sizes[cell][0]&&
              (selected.has(cell)?Number.isSafeInteger(h)&&h>=200&&h<=2147483647:h===resizeBefore.sizes[cell][1]))){
            physical=resizeTableFrame(a,focus,after);
            if(physical&&(partialHeightFloor(heightFrame,physical,selected,command.height)||
              wholeHeightRows&&canonicalPartialHeightFloor(a,focus,heightFrame,physical,resizeBefore,after,selected,command.height))){
              // Preserve the old atomic floor no-op outside the new certified
              // explicit policy. Its valid partial step is a real single edit
              // only when each selected declaration equals its physical HU.
              const anchoredPartial=(quantizedHeightRows||naturalHeightRows)&&[...selected].every(cell=>
                after.sizes[cell][1]===physical!.cells.get(cell)?.hu);
              // New whole-table content clamps are valid partial edits only
              // when unchanged physical rows keep every authored declaration,
              // and moving rows persist their exact integer physical target.
              // Literal geometry or the explicitly approved same-painter +
              // checked cold-source certificate above remains mandatory.
              const wholePartial=wholeHeightRows&&[...heightFrame.rows].every(([index,row])=>{
                const next=physical!.rows.get(index)!;
                return row.cells.every(cell=>after.sizes[cell][1]===
                  (next.hu===row.hu?resizeBefore.sizes[cell][1]:next.hu));
              });
              if(wholeHeightRows&&!wholePartial)
                throw Error('전체 표 하한 결과의 변경·보존 행 선언이 달라 원문을 복원했습니다.');
              return !(wholePartial||anchoredPartial);
            }
          }
          // Match the native visible-frame HU base. Shrink is additionally
          // capped by cellSz so a stale minimum never grows on a negative key.
          // Unavailable/ambiguous exact frames retain the old strict base.
          const expected=(cell:number)=>{
            const stored=resizeBefore.sizes[cell][1];
            if(!selected.has(cell))return stored;
            const target=(heightBases?.get(cell)??stored)+command.height;
            return command.height<0?Math.min(target,stored):target;
          };
          // A partially floor-clamped negative step is a verified WHOLE no-op,
          // not an exact shrink. Never retain a partial edit or clear old Redo.
          if(!certifiedHeightRows&&command.height<0&&after.sizes.every(([w,h],cell)=>w===resizeBefore.sizes[cell][0]&&
            (selected.has(cell)?h>=expected(cell)&&h<=resizeBefore.sizes[cell][1]:h===resizeBefore.sizes[cell][1]))&&
            after.sizes.some(([,h],cell)=>selected.has(cell)&&h!==expected(cell))){
            if(captured?.resizeSelectionBefore&&heightFrame){
              physical??=resizeTableFrame(a,focus,after);
              if(physical&&draggedHeightFloor(a,focus,heightFrame,physical,resizeBefore,after,selected,command.height))return false;
            }
            return true;
          }
          if(after.sizes.some(([w,h],cell)=>w!==resizeBefore.sizes[cell][0]||
            ((certifiedHeightRows||proportionalHeightRow)&&selected.has(cell)
              ? !Number.isSafeInteger(h)||h<200||h>2147483647||command.height<0&&h>resizeBefore.sizes[cell][1]
              : h!==expected(cell))))
            throw Error('Core 높이 변경 결과가 요청·비대상 치수와 달라 원문을 복원했습니다.');
          if(heightFrame){
            physical??=resizeTableFrame(a,focus,after);
            if(!physical)throw Error('높이 변경 후 정확한 표 프레임을 확인할 수 없어 원문을 복원했습니다.');
            // A matching declared envelope does not prove the layout kept the
            // other rows. Check the physical result even for one ordinary row.
            validateResizeTableFrame(heightFrame,physical,selected,command.height);
            if(proportionalHeightRow&&!checkedReopenFrame(a,focus,physical,after))
              throw new UnsupportedTableOperation('resize-frame-rollback','Floating inverse did not reproduce the exact saved frame');
          }
        }
        if(!unchanged&&command.type==='resize'&&command.trackBoundary&&!command.redistribute){
          const selected=new Set(this.resizeCells(command,s).map(c=>c.cellIdx));
          // Width reflow changes the content frame in either direction, not
          // authored cell-height minima. The fixed Core keeps every cellSz
          // height exact; derived row growth must not become a stored floor.
          // Requested widths/outer width and non-target declarations stay strict.
          if(after.sizes.some(([w,h],cell)=>w!==resizeBefore.sizes[cell][0]+(selected.has(cell)?command.width:0)||
            h!==resizeBefore.sizes[cell][1]))
            throw Error('전체 표 너비 변경의 대상·비대상 치수가 달라 원문을 복원했습니다.');
          const focus=s.focus;if(focus.kind!=='cell')throw Error('전체 표 너비 대상이 없습니다.');
          const columns=new Set(this.resizeCells(command,s).map(c=>c.col)).size;
          if(!Number.isSafeInteger(wholeWidthBefore)||a.call('getTableProperties',focus.sec,focus.para,focus.control).tableWidth!==wholeWidthBefore!+command.width*columns)
            throw Error('전체 표 외곽 너비가 요청과 달라 원문을 복원했습니다.');
        }
        return unchanged;
      } : undefined,
      // Only a resize drag that began at an actual caret has a confirmed
      // Hancom Redo caret reference. Keep release and F5 block behavior intact.
      captured?.resizeSelectionBefore?.kind === "caret"
        ? captured.resizeSelectionBefore : undefined,
    );
    this.preferredX = undefined;
    if (this.selection.kind === "caret") this.block = false;
  }
  private apply(command: Command, s: Selection): Selection {
    const a = this.adapter;
    let p = copy(s.focus);
    a.validate(p);
    const collapse = (p: Position): Selection => ({ kind: "caret", focus: p });
    const erase = () => {
      if (s.kind === "text") {
        const [from, to] = ordered(s.anchor, s.focus);
        a.remove(from, to);
        p = copy(from);
      } else if (s.kind === "cells") {
        // Resolve the validated destination BEFORE clearing its paragraph. The
        // old block endpoint can no longer resolve once its text is removed.
        const destination = {
          ...s.focus,
          cell: this.cells(s)[0].cellIdx,
          cellPara: 0,
          offset: 0,
        };
        this.clear(s);
        p = destination;
      } else if (s.kind === "table") {
        const t = a
          .inline(s.focus)
          .find((t) => t.controlIndex === s.focus.control);
        if (!t) throw Error("글자취급 표만 잘라낼 수 있습니다.");
        p = {
          kind: "body",
          sec: s.focus.sec,
          para: s.focus.para,
          offset: t.offset,
        };
        a.remove(p, { ...p, offset: p.offset + 1 });
      } else if (s.kind !== "caret")
        throw Error("이 선택에 텍스트 편집을 적용할 수 없습니다.");
    };
    if (command.type === "insert" || command.type === "paste") {
      const external = command.type === "paste" && !command.structured
        ? externalTextFormat(command.html ?? "", command.text) : undefined;
      // Core owns the insertion run. The toolbar's glyph-format query can
      // describe the character to the right instead of this insertion point
      // (also after leading section/column slots). Keep replacement/paste
      // semantics unchanged; explicit typing still overrides Core below.
      if (command.type === "insert" && (s.kind === "caret" || s.kind === "text")) {
        const [from, to] = s.kind === "text" ? ordered(s.anchor, s.focus) : [p, p];
        const local = a.tryReplaceLocalBody(from, to, command.text);
        if (local) {
          if (Object.keys(this.typing).length && command.text) a.format(from, local.offset, this.typing);
          return collapse(local);
        }
      }
      erase();
      if (command.type === "paste" && (command.html || command.structured)) {
        if (
          command.structured ||
          this.clipboard.recognizes(command.html ?? "") ||
          /<table[\s>]/i.test(command.html ?? "")
        )
          return collapse(this.clipboard.paste(a, p, command.html ?? "", command.structured, s.kind==='caret'));
        if (!command.text)
          throw Error("외부 HTML은 텍스트 대체 데이터가 필요합니다.");
      }
      for (const [i, line] of command.text
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .entries()) {
        if (i) p = a.split(p);
        const from = copy(p);
        p = a.insert(p, line);
        if (Object.keys(this.typing).length && line)
          a.format(from, p.offset, this.typing);
        if (external && line) a.format(from, p.offset, toCoreCharacter(external.props));
      }
      return collapse(p);
    }
    if (command.type === "break") {
      if (command.soft && s.kind !== "caret" && s.kind !== "text")
        throw Error("문단 내 줄바꿈은 글자 커서 또는 텍스트 선택에서 사용하세요.");
      erase();
      if (!command.soft) return collapse(a.split(p));
      const from = copy(p);
      p = a.insert(p, "\n");
      if (Object.keys(this.typing).length) a.format(from, p.offset, this.typing);
      return collapse(p);
    }
    if (command.type === "delete") {
      // Only this ordinary, single BODY range is eligible. Structural/paste/
      // cross-paragraph/cell commands keep the original Adapter operations.
      if (s.kind === "text") {
        const [from, to] = ordered(s.anchor, s.focus);
        const local = a.tryReplaceLocalBody(from, to, "");
        if (local) return collapse(local);
      } else if (s.kind === "caret" && p.kind === "body") {
        const from = command.backward ? { ...p, offset: p.offset - 1 } : p;
        const to = command.backward ? p : { ...p, offset: p.offset + 1 };
        if (from.offset >= 0 && to.offset <= a.length(p)) {
          const local = a.tryReplaceLocalBody(from, to, "");
          if (local) return collapse(local);
        }
      }
      if (s.kind !== "caret") {
        erase();
        return collapse(p);
      }
      const next = copy(p);
      if (command.backward) {
        if (p.offset > 0) {
          p.offset--;
          a.remove(p, next);
        } else if (paraIndex(p) > 0) {
          p = withPara(p, paraIndex(p) - 1);
          p.offset = a.length(p);
          a.remove(p, next);
        }
      } else if (p.offset < a.length(p)) {
        next.offset++;
        a.remove(p, next);
      } else if (paraIndex(p) + 1 < a.count(p)) {
        const end = { ...withPara(p, paraIndex(p) + 1), offset: 0 };
        a.remove(p, end);
      }
      return collapse(p);
    }
    if (command.type === "clear-cells") {
      this.clear(s);
      if (s.kind === "cells")
        return {
          ...copy(s),
          anchor: { ...s.anchor, cellPara: 0, offset: 0 },
          focus: { ...s.focus, cellPara: 0, offset: 0 },
        };
      if (s.kind === "table")
        return { ...copy(s), focus: { ...s.focus, cellPara: 0, offset: 0 } };
      return copy(s);
    }
    if (command.type === "insert-table") {
      if(p.kind==='cell')return collapse(insertCellTable(a,p,command.rows,command.cols));
      if (p.kind !== "body") throw Error("새 표는 본문에 삽입하세요.");
      const r = command.inline
        ? a.call(
            "createTableEx",
            JSON.stringify({
              sectionIdx: p.sec,
              paraIdx: p.para,
              charOffset: a.textOffset(p),
              rowCount: command.rows,
              colCount: command.cols,
              treatAsChar: true,
            }),
          )
        : a.call(
            "createTable",
            p.sec,
            p.para,
            p.offset,
            command.rows,
            command.cols,
          );
      return collapse({
        kind: "cell",
        sec: p.sec,
        para: r.paraIdx,
        control: r.controlIdx,
        cell: 0,
        cellPara: 0,
        offset: 0,
      });
    }
    if (p.kind !== "cell") throw Error("표의 셀을 먼저 선택하세요.");
    const cellIndex = p.cell;
    if (command.type === "resize" && command.redistribute) {
      const plan = this.redistribution(command, s);
      if(command.cellOnly)assertLocalResizeProof(this,command,true);
      a.call("resizeTableCells",plan.p.sec,plan.p.para,plan.p.control,
        JSON.stringify(plan.updates.map(({expected,...update}) => update)));
      // Content floors can limit shrink. Never retain an uncompensated partial
      // update: throwing here restores the existing History snapshot atomically.
      for (const u of plan.updates) {
        const props = a.call("getCellProperties",plan.p.sec,plan.p.para,plan.p.control,u.cellIdx);
        if ((plan.axis === "x" ? props.width : props.height) !== u.expected)
          throw Error("내용·여백 하한으로 인접 셀 보상이 불가능하여 변경을 취소했습니다.");
      }
      return copy(s);
    }
    if (command.type === "resize") {
      const cells = this.resizeCells(command,s);
      const focus=p;
      const beforeWidths=command.trackBoundary?new Map(cells.map(c=>[c.cellIdx,a.cellProps({...focus,cell:c.cellIdx}).width])):new Map<number,number>();
      try{a.call(
        "resizeTableCells",
        p.sec,
        p.para,
        p.control,
        JSON.stringify(
          cells.map((c) => ({
            cellIdx: c.cellIdx,
            widthDelta: command.width,
            heightDelta: command.height,
          })),
        ),
      );}catch(error){
        if(coreRuntimeHasCapability(a.doc,'proportional-float-height')&&
          String(error).includes('렌더링 오류: Floating row resize: '))
          throw new UnsupportedTableOperation('resize-float-frame',String(error));
        throw error;
      }
      if(command.trackBoundary){
        for(const c of cells){const actual=a.cellProps({...p,cell:c.cellIdx});
          // Core can clamp a shrink at its content floor. The whole-column
          // request must remain exact; transaction rollback preserves all rows.
          if(actual.width!==beforeWidths.get(c.cellIdx)!+command.width)
            throw new UnsupportedTableOperation("resize-whole-width-min","내용 하한에 도달하여 표 너비 변경을 취소했습니다.");
        }
      }
      return copy(s);
    }
    if (command.type === "table-edit") {
      // The fixed structural subset needs the guarded path API even at root:
      // legacy flat column edits do not provide its staged inverse/refusal.
      // Split and multi-track dialogs retain their existing distinct contract.
      if (nested(p) || coreRuntimeHasCapability(a.doc, 'structural-table-frame') &&
          command.operation !== 'split' && command.count === undefined && command.after === undefined)
        return editNestedTable(
          a,
          s,
          command.operation,
          s.kind === "cells" ? this.cells(s).map((c) => c.cellIdx) : [p.cell],
        );
      const cells =
        s.kind === "cells"
          ? this.cells(s)
          : a.cells(p).filter((c) => c.cellIdx === cellIndex);
      const first = cells[0];
      if(command.count!==undefined||command.after!==undefined) {
        const row=command.operation.startsWith('row'),add=command.operation.endsWith('add'),at=row?first.row:first.col;
        const count=command.count??1;
        const rowDelete=command.operation==='row-delete';
        if(command.operation==='col-delete'||rowDelete){
          const before=a.call('getTableDimensions',p.sec,p.para,p.control);
          const axis=(c:{row:number;col:number})=>row?c.row:c.col;
          const survivor=a.cells(p)
            .filter(c=>axis(c)<at||axis(c)>=at+count)
            .sort((x,y)=>x.row-y.row||x.col-y.col)[0];
          if(!survivor||count>=(row?before.rowCount:before.colCount))
            throw Error(row?'표에는 최소 한 줄을 남겨야 합니다.':'표에는 최소 한 칸을 남겨야 합니다.');
          // Capture the live owner before any mutation. A legacy row outside
          // the identity contract may still use its previous selection path.
          const survivorPosition:Position={...p,cell:survivor.cellIdx,cellPara:0,offset:0};
          const capture=()=>a.captureParagraph(survivorPosition);
          let owner:ReturnType<typeof capture>|undefined;
          if(row){
            try { owner=capture(); } catch { /* Require the owner only when native confirms its contract. */ }
          } else owner=capture();
          const rowProofs:unknown[]=[];
          for(let i=0;i<count;i++){
            if(row)rowProofs.push(a.call('deleteTableRow',p.sec,p.para,p.control,at).preservedSurvivorIdentity);
            else a.call('deleteTableColumn',p.sec,p.para,p.control,at);
          }
          if(row&&rowProofs.some(v=>v!==true&&v!==false&&v!==undefined))
            throw Error('줄 삭제 후 남은 셀의 소유권을 확인할 수 없습니다.');
          if(row&&rowProofs.some(v=>v===false||v===undefined)){
            const remaining=a.cells(p);
            return remaining.length
              ? collapse({...p,cell:remaining[0].cellIdx,cellPara:0,offset:0})
              : collapse({kind:'body',sec:p.sec,para:p.para,offset:0});
          }
          if(!owner)
            throw Error('줄 삭제 후 남은 셀의 소유권을 확인할 수 없습니다.');
          const live=a.resolveParagraph(owner);
          const destination=a.fromPath(live.sectionIndex,live.parentParaIndex,live.path,0);
          if(destination.kind!=='cell'||!sameTable(p,destination))
            throw Error('삭제 후 남은 셀의 표 소유자가 일치하지 않습니다.');
          a.validate(destination);
          const after=a.call('getTableDimensions',destination.sec,destination.para,destination.control);
          const shift=axis(survivor)>=at+count?count:0;
          const expectedRow=survivor.row-(row?shift:0);
          const expectedCol=survivor.col-(row?0:shift);
          if(after.rowCount!==before.rowCount-(row?count:0)||
             after.colCount!==before.colCount-(row?0:count)||
             after.cellCount!==after.rowCount*after.colCount||
             !a.cells(destination).some(c=>c.cellIdx===destination.cell&&c.row===expectedRow&&
                 c.col===expectedCol&&c.rowSpan===1&&c.colSpan===1))
            throw Error('삭제 후 남은 셀의 위치를 확인할 수 없습니다.');
          return collapse(destination);
        }
        for(let i=0;i<(command.count??1);i++)a.call(row?(add?'insertTableRow':'deleteTableRow'):(add?'insertTableColumn':'deleteTableColumn'),p.sec,p.para,p.control,at,...(add?[command.after??true]:[]));
      } else switch (command.operation) {
        case "merge":
          a.call(
            "mergeTableCells",
            p.sec,
            p.para,
            p.control,
            Math.min(...cells.map((c) => c.row)),
            Math.min(...cells.map((c) => c.col)),
            Math.max(...cells.map((c) => c.row + c.rowSpan - 1)),
            Math.max(...cells.map((c) => c.col + c.colSpan - 1)),
          );
          break;
        case "split":
          a.call(
            "splitTableCellInto",
            p.sec,
            p.para,
            p.control,
            first.row,
            first.col,
            1,
            2,
            true,
            false,
          );
          break;
        case "row-add":
          a.call("insertTableRow", p.sec, p.para, p.control, first.row, true);
          break;
        case "row-delete":
          a.call("deleteTableRow", p.sec, p.para, p.control, first.row);
          break;
        case "col-add":
          a.call(
            "insertTableColumn",
            p.sec,
            p.para,
            p.control,
            first.col,
            true,
          );
          break;
        case "col-delete":
          a.call("deleteTableColumn", p.sec, p.para, p.control, first.col);
          break;
      }
      const remaining = a.cells(p);
      const destination = command.operation === "row-add"
        ? remaining.find((c) => c.row === first.row + 1) ?? remaining[0]
        : remaining[0];
      return remaining.length
        ? collapse({ ...p, cell: destination.cellIdx, cellPara: 0, offset: 0 })
        : collapse({ kind: "body", sec: p.sec, para: p.para, offset: 0 });
    }
    return copy(s);
  }
  clear(s: Selection) {
    if (s.kind !== "cells" && s.kind !== "table")
      throw Error("셀 블록을 먼저 선택하세요.");
    const a = this.adapter;
    for (const cell of this.cells(s)) {
      const p = { ...s.focus, cell: cell.cellIdx, cellPara: 0, offset: 0 };
      const last = { ...p, cellPara: a.count(p) - 1 };
      last.offset = a.length(last);
      a.remove(p, last);
    }
  }
  private blockRectangles(boxes: ReturnType<Interaction["cellBoxes"]>): SelectionBox[] {
    return boxes.map(c => ({pageIndex:c.pageIndex, x:c.x, y:c.y, width:c.w, height:c.h}));
  }
  rectangles(pageRuns: (page: number) => readonly Run[] = (page) => this.adapter.runs(page), owners?:OwnerProjection): SelectionBox[] {
    const s = this.selection,
      a = this.adapter;
    if (s.kind === 'object' && s.focus.kind === 'cell') return inlineCellPictureBoxes(a,s);
    if (s.kind === "cells" || s.kind === "table")
      return this.blockRectangles(this.cellBoxes(s));
    if (s.kind === "text") {
      const [p, q] = ordered(s.anchor, s.focus);
      const textRects: SelectionBox[] = [];
      // A display-only header/footer/shape run has no selectable body/cell
      // address. Reuse navigation ownership admission before offset conversion;
      // valid selected runs still use the normal checked position conversion.
      const runOwner = this.textRunOwnerReader(owners);
      for (let page = 0; page < a.pageCount; page++) {
        const rows = pageRuns(page).map(r => ({r, candidate:runOwner(r)}))
          .filter((row): row is {r:Run;candidate:Position} => !!row.candidate && sameContainer(p,row.candidate));
        const columns: {x:number;width:number}[] = p.kind === "body" ? a.call("getPageInfo",page).columns ?? [] : [];
        const lineStarts = new Map<string,number>(), flowLefts = new Map<string,number>();
        const columnOf = (r:Run) => columns.find(c=>Number.isFinite(c.x)&&Number.isFinite(c.width)&&c.width>0&&r.x>=c.x&&r.x<c.x+c.width);
        const lineYs = new Map<string, number[]>();
        const lineKey = (r:Run,candidate:Position) => {
          const owner = JSON.stringify([page,{...candidate,offset:0},columnOf(r)]);
          const ys = lineYs.get(owner) ?? [];
          // Reuse the navigation layer's <1px same-line tolerance. Raw
          // fractional run y values otherwise split one selected line into
          // independently filled strips (including gaps between style runs).
          let y = ys.find(y => Math.abs(y-r.y) < 1);
          if (y === undefined) { y = r.y; ys.push(y); lineYs.set(owner,ys); }
          return JSON.stringify([owner,y]);
        };
        const flow = (candidate:Position) => candidate.kind === "body"
          ? {kind:"body",sec:candidate.sec} : {...candidate,cellPara:0,offset:0};
        for (const {r,candidate} of rows) {
          const key=lineKey(r,candidate), scope=JSON.stringify(flow(candidate));
          lineStarts.set(key,Math.min(lineStarts.get(key)??Infinity,r.charStart));
          flowLefts.set(scope,Math.min(flowLefts.get(scope)??Infinity,r.x));
        }
        for (const {r,candidate} of rows) {
          if (paraIndex(candidate) < paraIndex(p) || paraIndex(candidate) > paraIndex(q)) continue;
          const owner = a.position(r, r.charStart);
          const from = paraIndex(owner) === paraIndex(p) ? a.textOffset(p) : 0;
          const to = paraIndex(owner) === paraIndex(q) ? a.textOffset(q) : Infinity;
          const begin = Math.max(0, from - r.charStart);
          const end = Math.min(Array.from(r.text).length, to - r.charStart);
          if (begin >= end || r.charX[begin] === undefined || r.charX[end] === undefined) continue;
          const key=lineKey(r,candidate), scope=JSON.stringify(flow(candidate));
          const column=columnOf(r);
          const left=candidate.kind === "body" ? column?.x : flowLefts.get(scope);
          textRects.push({ pageIndex: page, x: r.x + r.charX[begin], y: r.y,
            width: r.charX[end] - r.charX[begin], height: r.h, textOnly: true,
            rangeStart:r.charStart+begin, rangeEnd:r.charStart+end,
            lineKey:key, flowKey:left===undefined?undefined:JSON.stringify([page,scope,column]),flowLeft:left,
            continues:paraIndex(candidate)>paraIndex(p)||lineStarts.get(key)!>a.textOffset(p) });
        }
      }
      const tables = p.kind === "body" ? Array.from({ length: q.para - p.para + 1 }, (_, i) => ({ ...p, para: p.para + i }))
        .flatMap((pos) => a.inline(pos).filter((t) =>
          t.offset >= (pos.para === p.para ? p.offset : 0) &&
          t.offset < (pos.para === q.para ? q.offset : a.length(pos)))
          .flatMap((t) => t.boxes.map((b) => ({ pageIndex: b.pageIndex, x: b.x, y: b.y, width: b.w, height: b.h })))) : [];
      const pictures: SelectionBox[] = [];
      if (p.kind === "body") {
        const selected = Array.from({ length: q.para - p.para + 1 }, (_, i) => ({ ...p, para: p.para + i }))
          .flatMap(pos => a.inlinePictures(pos).filter(t =>
            t.offset >= (pos.para === p.para ? p.offset : 0) &&
            t.offset < (pos.para === q.para ? q.offset : a.length(pos)))
            .map(t => ({ sec: pos.sec, para: pos.para, control: t.controlIndex })));
        if (selected.length) for (let page = 0; page < a.pageCount; page++) {
          for (const c of a.call("getPageControlLayout", page).controls ?? []) {
            if (c.type !== "image" || c.cellPath?.length || c.path?.length ||
                !selected.some(t => t.sec === c.secIdx && t.para === c.paraIdx && t.control === c.controlIdx) ||
                JSON.stringify(c.stableIndex) !== JSON.stringify([c.secIdx, c.paraIdx, c.controlIdx])) continue;
            if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.w <= 0 || c.h <= 0)
              throw Error("선택 그림의 표시 범위를 확인할 수 없습니다.");
            pictures.push({ pageIndex: page, x: c.x, y: c.y, width: c.w, height: c.h });
          }
        }
      }
      // Whole selected paragraphs own their floating controls too. Use actual
      // page/control owner boxes, never infer a table from its left text strip.
      const owned:SelectionBox[]=[];
      // A partial single paragraph cannot own floating controls under the
      // existing whole-paragraph rule. Keep inline/mixed branches and unknown
      // or unfenced callers on their original path.
      const noWholeOwner=owners?.isCurrent(a)&&p.kind==='body'&&q.kind==='body'&&p.sec===q.sec&&p.para===q.para&&
        (p.offset!==0||q.offset!==a.length(p));
      if(!noWholeOwner&&p.kind==='body'&&q.kind==='body')for(let page=0;page<a.pageCount;page++)for(const c of a.call('getPageControlLayout',page).controls??[]){
        if(c.secIdx!==p.sec||c.paraIdx<p.para||c.paraIdx>q.para||c.cellPath?.length||c.path?.length||JSON.stringify(c.stableIndex)!==JSON.stringify([c.secIdx,c.paraIdx,c.controlIdx]))continue;
        const start=c.paraIdx===p.para?p.offset:0,end=c.paraIdx===q.para?q.offset:a.length({...p,para:c.paraIdx});
        if(start!==0||end!==a.length({...p,para:c.paraIdx})||![c.x,c.y,c.w,c.h].every(Number.isFinite)||c.w<=0||c.h<=0)continue;
        owned.push({pageIndex:page,x:c.x,y:c.y,width:c.w,height:c.h});
      }
      return [...tables, ...pictures, ...owned, ...mixedCellPictureBoxes(a,s), ...textRects];
    }
    return [];
  }
  capture(coalesceLocalCellSubmit = false) {
    // The opt-in is used only by a standalone modal submit. Resolve the live
    // reference first, even if the Selection object and its generation match.
    // A flat caret has just one endpoint: captureSelection -> captureParagraph
    // itself validates that exact position before issuing a fresh native path.
    // All other shapes still validate first and then capture as before.
    const read = () => {
    const a = this.adapter, s = this.selection;
    let paths: SelectionReference | undefined;
    this.validateSelection(s, undefined, coalesceLocalCellSubmit ? p => {
      if (s === this.selection && s.kind === "caret" && p.kind === "cell" && !nested(p) &&
          !a.transientEdit && !a.hasPendingLocalBodyFlow() && a.scope === "edit" &&
          !a.documentLocked && !a.viewerOnlyReason && a.heightCandidateIdentified) {
        paths = a.captureSelection(s);
      } else a.validate(p);
    } : undefined);
    return {
      documentId: this.adapter.documentId,
      revision: this.adapter.revision,
      selection: copy(this.selection),
      paths: paths ?? this.adapter.captureSelection(this.selection),
      paragraphTargets:
        nested(this.selection.focus) && this.selection.kind !== "object"
          ? this.formatTargets("paragraph", this.selection)
              .filter((t) => nested(t.p))
              .map((t) => this.adapter.captureParagraph(t.p))
          : [],
    };
    };
    // Owned synchronous capture: share repeated owner reads without an eager DPI query.
    return this.adapter.withUpdateReads(read);
  }
  copyClipboard(s:Selection = this.selection) {
    this.validateSelection(s);
    if(s.kind==='object')return this.clipboard.captureObject(this.adapter,s);
    if(!wholeBodySection(this.adapter,s))this.assertSupportedSelection(s);
    if (s.kind === 'text' && s.anchor.kind === 'cell' && s.focus.kind === 'cell') {
      const [from,to] = ordered(s.anchor,s.focus);
      if (assertMixedCellPictureRange(this.adapter,from,to))
        // This is an object-bearing paragraph fragment, not a text splice.
        // Keep the existing nested scope so a body receiver inserts a paragraph
        // at its supported boundary instead of overwriting its host para style.
        return {...this.clipboard.captureNested(this.adapter,s),text:this.copyText(s)};
    }
    if (nested(s.focus) && (s.kind === "cells" || s.kind === "table"))
      return this.clipboard.captureNested(this.adapter, s, this.cells(s));
    // F5 in an ordinary cell copies its paragraph content, not table geometry.
    // Use the existing immutable paragraph importer so character/paragraph IDs
    // travel with the text instead of inheriting the destination's formatting.
    if (s.kind === "cells" && s.focus.kind === "cell") {
      const cells = this.cells(s);
      if (cells.length !== 1)return this.clipboard.captureNested(this.adapter,s,cells);
      const from = { ...s.focus, cell: cells[0].cellIdx, cellPara: 0, offset: 0 };
      const to = { ...from, cellPara: this.adapter.count(from) - 1 };
      to.offset = this.adapter.length(to);
      this.adapter.assertTextOnly(from, to.cellPara);
      return this.clipboard.captureCellText(this.adapter,
        { kind: "text", anchor: from, focus: to }, this.copyText(s));
    }
    if (nested(s.focus) && s.kind === "text") {
      const [from, to] = ordered(s.anchor, s.focus);
      try {
        this.adapter.assertTextOnly(from, paraIndex(to));
      } catch {
        return this.clipboard.captureNested(this.adapter, s);
      }
      // Existing partial paragraph capture + body text splice: preserve offsets
      // and source formatting without converting the selection into a table.
      // Formatted cell destinations remain explicitly unsupported below.
      return this.clipboard.captureCellText(this.adapter, s, this.copyText(s));
    }
    if (
      s.kind === "text" &&
      s.anchor.kind === "body" &&
      s.focus.kind === "body"
    ) {
      const [from, to] = ordered(s.anchor, s.focus);
      // A collapsed text block is not an explicit floating-object selection.
      if (samePosition(from, to)) return { text: "", html: "" };
      return this.clipboard.capture(this.adapter, from, to);
    }
    if (s.kind === "table") {
      const t = this.adapter
        .inline(s.focus)
        .find((t) => t.controlIndex === s.focus.control);
      if (!t) throw Error("구조화된 표 복사는 글자취급 표만 지원합니다.");
      // A standalone root table containing child tables already has an exact
      // owner-bound immutable table capture. Do not send that selection through
      // the legacy body-range profile, which deliberately rejects nested tables.
      const lists=new Set(this.adapter.call<any>('getCursorModel').lists.filter((l:any)=>l.isCell&&l.hostListId===0&&l.sectionIndex===s.focus.sec&&l.hostPara===s.focus.para&&l.controlIndex===s.focus.control).map((l:any)=>l.listId));
      if(this.adapter.call<any[]>('getControls').some(c=>c.ctrlId==='tbl'&&lists.has(c.list))&&!tableCaptureRefusal(this.adapter,s.focus))
        return this.clipboard.captureNested(this.adapter,s);
      const from: Position = {
        kind: "body",
        sec: s.focus.sec,
        para: s.focus.para,
        offset: t.offset,
      };
      return this.clipboard.capture(this.adapter, from, {
        ...from,
        offset: t.offset + 1,
      });
    }
    return { text: this.copyText(s), html: "" };
  }
  copyText(s:Selection = this.selection) {
    if(!wholeBodySection(this.adapter,s))this.assertSupportedSelection(s);
    if (s.kind === "caret") return "";
    return this.targets(s)
      .map((t) =>
        Array.from(this.adapter.text(t.p))
          .slice(
            this.adapter.textOffset(t.p),
            this.adapter.textOffset(t.p, t.end),
          )
          .join(""),
      )
      .join("\n");
  }
}
