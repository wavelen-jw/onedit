import { type Selection, type SelectionReference, copy } from "./model.js";
import { RhwpAdapter } from "./adapter.js";
type Entry = {
  // The snapshot is the destination state of this stack entry. Successful
  // travel swaps it with the current state for the opposite stack.
  snapshot: number;
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
    this.typingRun = undefined;
    if (!current || this.undoStack.length !== undoCount + 1 || before.selection.kind !== 'caret' ||
        current.selectionAfter.kind !== 'caret' || before.documentId !== this.adapter.documentId ||
        JSON.stringify({...before.selection.focus,offset:0}) !== JSON.stringify({...current.selectionAfter.focus,offset:0})) return;
    if (prior && prior.documentId === before.documentId && prior.revision === before.revision &&
        this.undoStack.at(-2) === prior.entry &&
        JSON.stringify(prior.entry.selectionAfter) === JSON.stringify(before.selection)) {
      this.adapter.doc.discardSnapshot(current.snapshot);
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
    for (const e of entries) this.adapter.doc.discardSnapshot(e.snapshot);
  }
  private trim() {
    while (this.undoStack.length > this.maxEntries)
      this.adapter.doc.discardSnapshot(this.undoStack.shift()!.snapshot);
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
  detachForDocumentReplacement() {
    this.endTypingRun();
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
        snapshot: before,
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
    const current = this.adapter.doc.saveSnapshot();
    let selection: Selection;
    try {
      this.adapter.call("restoreSnapshot", e.snapshot);
      selection = this.adapter.resolveSelection(
        redo ? e.referenceAfter : e.referenceBefore,
      );
    } catch (error) {
      try { this.adapter.call("restoreSnapshot", current); }
      finally { this.adapter.doc.discardSnapshot(current); }
      throw error;
    }
    from.pop();
    this.adapter.doc.discardSnapshot(e.snapshot);
    e.snapshot = current;
    (redo ? this.undoStack : this.redoStack).push(e);
    this.adapter.revision++;
    this.completedTravels++;
    return selection;
  }
}
