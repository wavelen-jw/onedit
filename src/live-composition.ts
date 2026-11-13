import { Interaction } from "./interaction.js";
import { History } from "./history.js";
import { copy, nested, type Selection } from "./model.js";

// A pending transaction on the current Core document, not a sibling document.
// The existing insertion Command and native snapshots own all edits/rollback.
export class LiveComposition {
  private readonly adapter;
  private readonly doc;
  private readonly documentId;
  private readonly revision;
  private readonly original;
  private readonly typing;
  private readonly block;
  private readonly preferredX;
  private readonly localEnvironment;
  private localRangeInvalidated = false;
  private readonly pending: Interaction;
  private expectedRevision;
  private expectedSelection: string;
  private closed = false;
  text = "";
  constructor(private readonly editor: Interaction) {
    const a = this.adapter = editor.adapter;
    this.localEnvironment = a.localBodyTextIdentified && editor.selection.focus.kind === "body"
      ? a.localBodyEnvironmentToken() : undefined;
    if (a.transientEdit) throw Error("이미 한글을 조합하고 있습니다.");
    a.assertEditable(editor.selection.focus);
    this.original = editor.capture().selection;
    this.doc = a.doc; this.documentId = a.documentId;
    this.revision = this.expectedRevision = a.revision;
    this.expectedSelection = JSON.stringify(editor.selection);
    this.typing = { ...editor.typing };
    this.block = editor.block; this.preferredX = editor.preferredX;
    this.pending = new Interaction(a);
    this.pending.history = new History(a, true);
    a.transientEdit = true;
  }
  private assertCurrent() {
    if (this.closed || this.adapter.doc !== this.doc || this.adapter.documentId !== this.documentId ||
        this.adapter.revision !== this.expectedRevision ||
        JSON.stringify(this.editor.selection) !== this.expectedSelection)
      throw Error("조합 대상 문서·선택이 변경되었습니다. 조합을 취소하고 다시 입력하세요.");
  }
  /** Current native text range for a paint-only composition cursor. No state,
   * History or glyph is changed. Unsupported multi-paragraph input keeps the
   * normal caret; never infer a rectangle from font size or average widths. */
  presentationRange(presenter: Interaction = this.editor): Extract<Selection, {kind: "text"}> | undefined {
    if (presenter !== this.editor) return;
    this.assertCurrent();
    if (!this.text || /[\r\n\t]/u.test(this.text) || this.editor.selection.kind !== "caret") return;
    if (this.text.length > 8192) return;
    const count = Array.from(this.text).length;
    if (count > 4096) return;
    const a = this.adapter, end = copy(this.editor.selection.focus);
    const to = a.textOffset(end), from = to - count;
    if (from < 0) return;
    const actual = nested(end)
      ? a.doc.getTextInCellByPath(end.sec, end.para, a.path(end), from, count)
      : end.kind === "body"
        ? a.doc.getTextRange(end.sec, end.para, from, count)
        : a.doc.getTextInCell(end.sec, end.para, end.control, end.cell, end.cellPara, from, count);
    if (actual !== this.text) return;
    const anchor = {...end, offset: a.logical(end, from)};
    a.validate(anchor);
    if (a.textOffset(anchor) !== from) return;
    return {kind: "text", anchor, focus: end};
  }
  private restore() {
    if (this.pending.history.undoStack.length) {
      const selection = this.pending.history.travel();
      if (!selection) throw Error("조합 원문 복원 실패");
      this.pending.history.clear();
    }
    this.adapter.revision = this.revision;
    this.editor.selection = copy(this.original);
    this.editor.typing = { ...this.typing };
    this.editor.block = this.block;
    this.editor.preferredX = this.preferredX;
    this.expectedRevision = this.adapter.revision;
    this.expectedSelection = JSON.stringify(this.editor.selection);
  }
  update(text: string): boolean {
    this.assertCurrent();
    if (text === this.text) return false;
    try {
      // A short BODY preview can replace its own certified current range.
      // First insertion/selected replacement still uses the existing transaction.
      // Unsupported input restores the original snapshot and takes the old path.
      if (this.localEnvironment !== undefined &&
          this.localEnvironment !== this.adapter.localBodyEnvironmentToken()) this.localRangeInvalidated = true;
      const originalBody = this.original.focus.kind === "body" &&
        (this.original.kind === "caret" || this.original.kind === "text" &&
          this.original.anchor.kind === "body" && this.original.anchor.sec === this.original.focus.sec &&
          this.original.anchor.para === this.original.focus.para &&
          Math.abs(this.original.anchor.offset - this.original.focus.offset) <= 8);
      const range = originalBody && this.editor.selection.focus.kind === "body" &&
        this.adapter.localBodyTextEnabled && !this.localRangeInvalidated && this.localEnvironment !== undefined && text && this.text
        ? this.presentationRange() : undefined;
      if (range && this.pending.history.undoStack.length === 1) {
        const next = this.pending.history.amendComposition(() => {
          // Retain the complete already-applied insertion shape, including
          // language slots/effects not represented by the toolbar projection.
          const shape = this.adapter.charProps(range.anchor).charShapeId;
          if (typeof shape !== "number" || !Number.isSafeInteger(shape) || shape < 0) return;
          const end = this.adapter.tryReplaceLocalBody(range.anchor, range.focus, text);
          if (!end) return;
          this.adapter.inheritCharacterShape(range.anchor, end.offset, shape);
          return {kind: "caret", focus: end};
        });
        if (next) {
          this.pending.selection = copy(next);
          this.editor.selection = copy(next);
          this.editor.typing = { ...this.typing };
          this.editor.block = false;
          this.text = text;
          this.expectedRevision = this.adapter.revision;
          this.expectedSelection = JSON.stringify(this.editor.selection);
          return true;
        }
      }
      this.restore();
      if (text) {
        this.pending.selection = copy(this.original);
        this.pending.typing = { ...this.typing };
        this.pending.execute({ type: "insert", text });
        this.editor.selection = copy(this.pending.selection);
        this.editor.block = false;
      }
      this.text = text;
      this.expectedRevision = this.adapter.revision;
      this.expectedSelection = JSON.stringify(this.editor.selection);
      return true;
    } catch (error) {
      // A failed insertion already rolls back through History.transact.
      this.restore();
      this.close();
      throw error;
    }
  }
  commit(text: string): boolean {
    this.assertCurrent();
    try {
      const changed = this.update(text);
      if (text) this.editor.history.commitComposition(this.pending.history);
      else this.restore();
      this.close();
      return changed;
    } catch (error) {
      if (!this.closed) { this.restore(); this.close(); }
      throw error;
    }
  }
  cancel() {
    if (this.closed) return;
    // Never restore an old snapshot into a replaced or independently edited doc.
    if (this.adapter.doc !== this.doc || this.adapter.documentId !== this.documentId ||
        this.adapter.revision !== this.expectedRevision)
      throw Error("조합 원복 대상 문서가 변경되었습니다.");
    this.restore();
    this.close();
  }
  private close() {
    this.pending.history.clear();
    this.adapter.transientEdit = false;
    this.closed = true;
  }
}
