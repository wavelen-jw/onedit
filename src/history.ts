import { type Selection, type SelectionReference, copy } from "./model.js";
import { RhwpAdapter } from "./adapter.js";
import { wasCreatedBlank } from "./core-runtime.js";
type NativeDocument = RhwpAdapter["doc"];
type Entry = {
  // The snapshot is the destination state of this stack entry. Successful
  // travel swaps it with the current state for the opposite stack.
  state: { kind: "snapshot"; doc: NativeDocument; id: number } | { kind: "document"; doc: NativeDocument };
  selectionBefore: Selection;
  selectionAfter: Selection;
  referenceBefore: SelectionReference;
  referenceAfter: SelectionReference;
  label: string;
};
export class History {
  private grouped = false;
  private completedTravels = 0;
  get travelGeneration() { return this.completedTravels; }
  private typingRun?: {entry: Entry; documentId: string; revision: number};
  endTypingRun() { this.typingRun = undefined; }
  /** UI native input only. Keep each command's validation/rollback, but retain
   * the first snapshot for adjacent typing in one paragraph. No time heuristic. */
  recordTyping(before: {documentId:string;revision:number;selection:Selection}, undoCount:number) {
    const current = this.undoStack.at(-1), prior = this.typingRun;
    if (prior && prior.entry === current && prior.revision === this.adapter.revision &&
        before.revision + 1 === prior.revision && this.undoStack.length === undoCount) return;
    this.typingRun = undefined;
    if (!current || this.undoStack.length !== undoCount + 1 || before.selection.kind !== 'caret' ||
        current.selectionAfter.kind !== 'caret' || before.documentId !== this.adapter.documentId ||
        JSON.stringify({...before.selection.focus,offset:0}) !== JSON.stringify({...current.selectionAfter.focus,offset:0})) return;
    if (prior && prior.documentId === before.documentId && prior.revision === before.revision &&
        this.undoStack.at(-2) === prior.entry &&
        JSON.stringify(prior.entry.selectionAfter) === JSON.stringify(before.selection)) {
      if(current.state.kind!=="snapshot"||current.state.doc!==this.adapter.doc) return;
      current.state.doc.discardSnapshot(current.state.id);
      this.undoStack.pop();
      prior.entry.selectionAfter = current.selectionAfter;
      prior.entry.referenceAfter = current.referenceAfter;
      this.typingRun = {...prior,revision:this.adapter.revision};
    } else this.typingRun = {entry:current,documentId:this.adapter.documentId,revision:this.adapter.revision};
  }
  undoStack: Entry[] = [];
  redoStack: Entry[] = [];
  private readonly maxEntries: number;
  constructor(readonly adapter: RhwpAdapter, private readonly transient = false) {
    const capacity = adapter.doc.snapshotCapacity();
    if (!Number.isSafeInteger(capacity) || capacity < 3)
      throw Error("Core 스냅샷 용량이 유효하지 않습니다.");
    // One pending IME snapshot and one rollback/current snapshot may coexist
    // with committed History. Never let Core silently evict a referenced ID.
    this.maxEntries = capacity - 2;
  }
  private discard(entries: Entry[]) {
    for (const entry of entries) if(entry.state.kind==="snapshot")
      entry.state.doc.discardSnapshot(entry.state.id);
    this.releaseAlternateDocuments(entries);
  }
  private releaseAlternateDocuments(entries: Entry[]) {
    for(const entry of entries) if(entry.state.kind==="document") entry.state.doc.free();
  }
  private trim() {
    while (this.undoStack.length > this.maxEntries)
      this.discard([this.undoStack.shift()!]);
  }
  /** A full-document paste is admitted only for an untouched, new document.
   * History owns the inactive Core handle after the synchronous commit. */
  adoptPreparedPaste(replacement: NativeDocument, before: Selection, after: Selection): Selection {
    this.admit();
    const a=this.adapter, current=a.doc;
    if(this.transient||this.grouped||a.scope!=="edit"||a.documentLocked||
       a.revision!==0||this.undoStack.length||this.redoStack.length||
       replacement===current||!wasCreatedBlank(current)||!current.isEmptyDocument()||
       replacement.snapshotCapacity()!==current.snapshotCapacity())
      throw Error("새 빈 문서 상태가 바뀌어 전체 붙여넣기를 취소했습니다.");
    a.completeLocalBodyFlow();
    const referenceBefore=a.captureSelection(before);
    try {
      a.doc=replacement;
      a.invalidateUpdateReads();
      const referenceAfter=a.captureSelection(after);
      this.undoStack.push({state:{kind:"document",doc:current},selectionBefore:copy(before),
        selectionAfter:copy(after),referenceBefore,referenceAfter,label:"paste"});
    } catch(error) {
      a.doc=current;
      a.invalidateUpdateReads();
      throw error;
    }
    this.endTypingRun();
    a.revision++;
    return after;
  }
  private admit() {
    if (this.adapter.transientEdit && !this.transient)
      throw Error("한글 조합을 확정하거나 취소한 뒤 편집하세요.");
  }
  // Transfer the already-applied single IME transaction; never apply it twice.
  commitComposition(pending: History) {
    if (this.transient || !pending.transient || this.adapter !== pending.adapter ||
        !this.adapter.transientEdit || pending.undoStack.length !== 1 || pending.redoStack.length)
      throw Error("한글 조합 이력 상태가 다릅니다.");
    this.adapter.completeLocalBodyFlow();
    this.discard(this.redoStack);
    this.redoStack = [];
    this.undoStack.push(pending.undoStack.pop()!);
    this.trim();
  }
  /** Amend only an already-applied transient entry. Its original native snapshot
   * remains the sole cancel/Undo destination; no per-preview snapshot is made.
   * A throw is handled by LiveComposition's existing atomic restore path. */
  amendComposition(run: () => Selection | undefined): Selection | undefined {
    const entry = this.undoStack[0];
    if (!this.transient || !this.adapter.transientEdit || this.undoStack.length !== 1 || this.redoStack.length)
      throw Error("Invalid pending composition transaction");
    const next = run();
    if (!next) return;
    const reference = this.adapter.captureSelection(next);
    entry.selectionAfter = copy(next);
    entry.referenceAfter = reference;
    return next;
  }
  clear() {
    this.endTypingRun();
    this.discard([...this.undoStack, ...this.redoStack]);
    this.undoStack = [];
    this.redoStack = [];
  }
  /** @internal Replacement rollback retains the original arrays and native IDs.
   * It runs only after the original adapter document has been restored. */
  captureDocumentReplacementRollback() {
    const undo = this.undoStack, redo = this.redoStack;
    return () => {
      this.undoStack = undo;
      this.redoStack = redo;
    };
  }
  /** @internal The old Core owns disposal, whether still live until commit or
   * already freed by Host.open. clear() would discard IDs through the new Core. */
  retireDetachedDocuments() {
    const entries=[...this.undoStack,...this.redoStack];
    return ()=>this.releaseAlternateDocuments(entries);
  }
  detachForDocumentReplacement(keepForRollback=false) {
    this.endTypingRun();
    if(!keepForRollback) this.releaseAlternateDocuments([...this.undoStack,...this.redoStack]);
    this.undoStack = [];
    this.redoStack = [];
  }
  transact(
    label: string,
    selection: Selection,
    run: () => Selection,
    unchanged?: () => boolean,
    redoSelection?: Selection,
    nativeVerifiedNoop = false,
    plainCellAppend = false,
  ): Selection {
    this.admit();
    if (this.adapter.scope !== "edit" || this.adapter.documentLocked)
      throw Error("읽기 전용 문서입니다.");
    this.adapter.completeLocalBodyFlow();
    // A synchronous UI compound action reuses the existing Commands. Its outer
    // transaction owns History/revision/Redo; inner commands still get their
    // rollback and verified no-op snapshot, without committing another entry.
    if (this.grouped) {
      if (nativeVerifiedNoop) throw Error("중첩 속성 작업을 묶어서 실행할 수 없습니다.");
      const before = this.adapter.doc.saveSnapshot();
      try {
        const next = run();
        if (unchanged?.()) {
          this.adapter.call("restoreSnapshot", before);
          return copy(selection);
        }
        return next;
      } catch (error) {
        this.adapter.call("restoreSnapshot", before);
        throw error;
      } finally { this.adapter.doc.discardSnapshot(before); }
    }
    const previous = this.typingRun;
    const p = selection.focus;
    const doc = this.adapter.doc;
    if (plainCellAppend && !this.transient && previous && selection.kind === 'caret' &&
        p.kind === 'cell' && !p.ancestors?.length && previous.documentId === this.adapter.documentId &&
        previous.revision === this.adapter.revision && previous.entry === this.undoStack.at(-1) &&
        !this.redoStack.length && JSON.stringify(previous.entry.selectionAfter) === JSON.stringify(selection) &&
        typeof doc.beginCellTypingRollback === 'function' &&
        doc.beginCellTypingRollback(p.sec, p.para, p.control, p.cell)) {
      try {
        const next = run();
        const reference = this.adapter.captureSelection(next);
        previous.entry.selectionAfter = copy(next);
        previous.entry.referenceAfter = reference;
        previous.revision = ++this.adapter.revision;
        doc.finishCellTypingRollback(false);
        return next;
      } catch (error) {
        this.adapter.invalidateUpdateReads();
        doc.finishCellTypingRollback(true);
        throw error;
      }
    }
    const referenceBefore = this.adapter.captureSelection(selection);
    const before = this.adapter.doc.saveSnapshot();
    try {
      const next = run();
      // Optional verified no-op: retain redo, revision and original selection.
      // Restore the snapshot as Core may have refreshed transient layout caches.
      if (unchanged?.()) {
        if (!nativeVerifiedNoop) this.adapter.call("restoreSnapshot", before);
        this.adapter.doc.discardSnapshot(before);
        return copy(selection);
      }
      // The immediate UI selection can differ from the selection restored by Redo.
      const restored = redoSelection ?? next;
      const referenceAfter = this.adapter.captureSelection(restored);
      this.discard(this.redoStack);
      this.redoStack = [];
      this.undoStack.push({
        state: {kind:"snapshot",doc:this.adapter.doc,id:before},
        selectionBefore: copy(selection),
        selectionAfter: copy(restored),
        referenceBefore,
        referenceAfter,
        label,
      });
      this.trim();
      this.adapter.revision++;
      return next;
    } catch (e) {
      try {
        this.adapter.call("restoreSnapshot", before);
      } finally {
        this.adapter.doc.discardSnapshot(before);
      }
      throw e;
    }
  }
  atomic(label: string, selection: Selection, run: () => Selection): Selection {
    if (this.grouped) throw Error("복합 작업을 중복 실행할 수 없습니다.");
    return this.transact(label, selection, () => {
      this.grouped = true;
      try { return run(); } finally { this.grouped = false; }
    });
  }
  travel(redo = false): Selection | undefined {
    this.endTypingRun();
    this.admit();
    if (this.adapter.scope !== "edit" || this.adapter.documentLocked)
      throw Error("읽기 전용 문서입니다.");
    const from = redo ? this.redoStack : this.undoStack;
    const e = from.at(-1);
    if (!e) return;
    // A transient rollback snapshot protects canonical IR only. Native restore
    // rebuilds layout; it must still work if preview completion itself failed.
    if (!this.transient) this.adapter.completeLocalBodyFlow();
    const ref=redo ? e.referenceAfter : e.referenceBefore;
    if(e.state.kind==="document"){
      const previous=this.adapter.doc;
      let selection: Selection;
      try {
        this.adapter.doc=e.state.doc;
        this.adapter.invalidateUpdateReads();
        selection=this.adapter.resolveSelection(ref);
      } catch(error) {
        this.adapter.doc=previous;
        this.adapter.invalidateUpdateReads();
        throw error;
      }
      e.state.doc=previous;
      from.pop();
      (redo ? this.undoStack : this.redoStack).push(e);
      this.adapter.revision++;
      this.completedTravels++;
      return selection;
    }
    if(e.state.doc!==this.adapter.doc) throw Error("편집 이력의 Core 문서가 바뀌었습니다.");
    const current = this.adapter.doc.saveSnapshot();
    let selection: Selection;
    try {
      this.adapter.call("restoreSnapshot", e.state.id);
      selection = this.adapter.resolveSelection(
        redo ? e.referenceAfter : e.referenceBefore,
      );
    } catch (error) {
      try { this.adapter.call("restoreSnapshot", current); }
      finally { this.adapter.doc.discardSnapshot(current); }
      throw error;
    }
    from.pop();
    e.state.doc.discardSnapshot(e.state.id);
    e.state.id = current;
    (redo ? this.undoStack : this.redoStack).push(e);
    this.adapter.revision++;
    this.completedTravels++;
    return selection;
  }
}
