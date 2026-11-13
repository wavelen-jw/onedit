/** Pending passive display demand only; no cached values or command verdicts.
 * General work is sticky until the existing frame/task consumes the batch. */
export class CellDisplayBatch {
  private pending: (() => boolean) | null | undefined;

  note(currentSelectionOnly: (() => boolean) | null) {
    if (this.pending !== null) this.pending = currentSelectionOnly;
  }

  widenIfPending() {
    if (this.pending !== undefined) this.pending = null;
  }

  reset() { this.pending = undefined; }

  takeSelectionOnly() {
    const current = this.pending;
    this.reset();
    return current?.() === true;
  }
}
