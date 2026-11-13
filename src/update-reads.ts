// Internal synchronous UI read transaction. No geometry or cross-event cache.
export type UpdateReadKey = Readonly<{
  doc: object; documentId: string; revision: number; epoch: number;
  native?: number;
  environment: string | number | undefined; transient: boolean; dpi: number;
}>;
const same = (a: UpdateReadKey, b: UpdateReadKey) => a.doc === b.doc &&
  a.documentId === b.documentId && a.revision === b.revision && a.epoch === b.epoch &&
  a.native === b.native && a.environment === b.environment && a.transient === b.transient && a.dpi === b.dpi;
export class UpdateReads {
  private active?: { key: UpdateReadKey; values: Map<string, number | string>; units: number; full: boolean; offsetEntries: number };
  constructor(private readonly key: () => UpdateReadKey) {}
  with<T>(read: (key: UpdateReadKey) => T): T {
    if (this.active) return read(this.active.key);
    this.active = { key: Object.freeze(this.key()), values: new Map(), units: 0, full: false, offsetEntries: 0 };
    try { return read(this.active.key); } finally { this.active = undefined; }
  }
  // Read-only authority for a second bounded, function-local receipt map.
  // isCurrent never refreshes a stale key or creates a scope. A key cannot
  // survive invalidation/replacement, return, error or a font/view generation.
  isCurrent(key: UpdateReadKey): boolean {
    return !!this.active && this.active.key === key && same(key, this.key());
  }
  /** Existing W2743 scalar/logical domain certificate. Synchronous only.
   * Lengths are native owner-checked receipts, not XML/UTF16/run guesses.
   * M=N excludes logical inline and overlap slots in this exact Core.
   * No geometry/permission/edit certificate is granted. */
  bodyOffsetIdentity(args: readonly number[], logicalLength: () => number,
      scalarLength: () => number): number | undefined {
    const ctx = this.active;
    if (!ctx || ctx.full || ctx.key.transient || ctx.key.environment === undefined ||
        args.length !== 3 || !args.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) ||
        !this.isCurrent(ctx.key)) return undefined;
    const key = ctx.key, [sec, para, offset] = args;
    // Reuse the SAME bounded metadata map. No per-offset identity entry,
    // second receipt cache, capacity expansion or cross-event retention.
    const logical = this.read('getLogicalLength', [sec, para], logicalLength);
    const scalar = this.read('getParagraphLength', [sec, para], scalarLength);
    if (!this.isCurrent(key) || ctx.full ||
        ![logical, scalar].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) ||
        logical !== scalar || offset > scalar) return undefined;
    return offset;
  }
  invalidate() { if (this.active) { this.active.values.clear(); this.active.units = 0; this.active.offsetEntries = 0; } }
  read<T extends number | string>(method: string, args: readonly number[], load: () => T): T {
    const ctx = this.active;
    if (!ctx || ctx.full) return load();
    const key = this.key();
    if (!same(ctx.key, key)) { ctx.key = Object.freeze(key); ctx.values.clear(); ctx.units = 0; ctx.offsetEntries = 0; }
    const id = JSON.stringify([method, args]);
    if (ctx.values.has(id)) return ctx.values.get(id) as T;
    // A throw cannot publish partial metadata. Unknown writes invalidate first.
    const before = ctx.key;
    const value = load(), units = typeof value === 'string' ? value.length : 1;
    if (before.native!==undefined && !this.isCurrent(before)) return value;
    // High-cardinality IR offsets may share at most64 of the SAME256 slots.
    // A conversion miss above this sublimit stays fresh; it cannot evict the
    // already-certified owner/count/text receipts of this synchronous update.
    // No second map, extra slots or cross-event lifetime is introduced.
    const offset = method === 'logicalToTextOffset' || method === 'textToLogicalOffset';
    if (offset && (ctx.offsetEntries >= 64 || ctx.values.size >= 256 || ctx.units + units > 65536))
      return value;
    if (ctx.values.size >= 256 || ctx.units + units > 65536) {
      ctx.values.clear(); ctx.full = true; return value; // bounded fresh-read fallback
    }
    ctx.values.set(id, value); ctx.units += units; if (offset) ctx.offsetEntries++;
    return value;
  }
}
