import { digest, limits } from "./ai-integration/contract.js";
import { RhwpAdapter } from "./adapter.js";
import { siblingDocument } from "./core-runtime.js";
import { applyFontEnvironment } from "./font-provider.js";
import { assertMarkdownSafety, existingHwpxLayoutProof } from "./markdown-compose.js";
import { assertSafeHwpxEntryNames } from "./hwpx-open-boundary.js";
import { Interaction } from "./interaction.js";
import {
  copy,
  nested,
  paraIndex,
  sameContainer,
  type Position,
  type Selection,
} from "./model.js";

export class AiNativeError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
  }
}
function need(
  condition: unknown,
  code: string,
  detail?: string,
): asserts condition {
  if (!condition) throw new AiNativeError(code, detail);
}
const equal = (x: unknown, y: unknown) =>
  JSON.stringify(x) === JSON.stringify(y);
const forbidden =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\uFFFC\p{Surrogate}]/u;
type Version = { documentInstanceId: string; mutationRevision: number };
type Intent = { readonly rangeId: string; readonly replacement: string };
type Range = {
  version: Version;
  start: Position;
  end: Position;
  scalarStart: number;
  scalarEnd: number;
  paragraph: string;
  text: string;
  charShapeId: number;
  properties: unknown;
  nativeOwner: unknown;
  semanticControl: number | undefined;
};
type SealedRange = Range & {
  doc: RhwpAdapter["doc"];
  rangeId: string;
  sourceHash: string;
  formatDigest: string;
  targetId: string;
};
type Receipt = {
  committed: boolean;
  before: Version;
  after: Version;
  target: { start: Position; end: Position };
  historyEntries: number;
};
const documentWriters = new WeakSet<RhwpAdapter["doc"]>();
const recovery = new WeakSet<RhwpAdapter["doc"]>();
const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("und", { granularity: "grapheme" })
    : undefined;
function utf16Boundary(text: string, scalarOffset: number) {
  return Array.from(text).slice(0, scalarOffset).join("").length;
}
function graphemeBoundaries(text: string, ...indices: number[]) {
  // Segmenter.containing() avoids segmenting the complete paragraph for every
  // endpoint. Core offsets remain scalar/logical, not UTF-16.
  need(segmenter, "UNSUPPORTED_GRAPHEME_RUNTIME");
  const segments = segmenter.segment(text);
  return indices.every(
    (i) => i === text.length || segments.containing(i)?.index === i,
  );
}
async function sha(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
const version = (a: RhwpAdapter): Version => ({
  documentInstanceId: a.documentId,
  mutationRevision: a.revision,
});
function editable(a: RhwpAdapter) {
  need(!recovery.has(a.doc), "RECOVERY_REQUIRED");
  need(!a.transientEdit, "COMPOSITION_IN_PROGRESS");
  need(
    a.scope === "edit" && !a.documentLocked && !a.viewerOnlyReason,
    "READ_ONLY",
  );
}
function rootTableControls(
  lists: any[],
  p: Extract<Position, { kind: "cell" }>,
) {
  return [
    ...new Set(
      lists
        .filter(
          (l) =>
            l.isCell &&
            l.row !== undefined &&
            l.sectionIndex === p.sec &&
            l.hostListId === 0 &&
            l.hostPara === p.para,
        )
        .map((l) => l.controlIndex as number),
    ),
  ].sort((x, y) => x - y);
}
function effectiveProperties(v: unknown) {
  const strip = ({
    charShapeId,
    paraShapeId,
    borderFillId,
    ...rest
  }: Record<string, unknown>) => rest;
  const r = v as {
    character: Record<string, unknown>;
    paragraph: Record<string, unknown>;
  };
  return { character: strip(r.character), paragraph: strip(r.paragraph) };
}
function inspect(a: RhwpAdapter, selection: Selection): Range {
  editable(a);
  need(selection.kind !== "caret", "NO_SELECTION");
  need(selection.kind === "text", "UNSUPPORTED_RANGE", selection.kind);
  const { anchor, focus } = selection;
  need(
    sameContainer(anchor, focus) && paraIndex(anchor) === paraIndex(focus),
    "UNSUPPORTED_RANGE",
    "MULTIPLE_PARAGRAPHS_OR_OWNERS",
  );
  const [start, end] = copy(
    anchor.offset <= focus.offset ? [anchor, focus] : [focus, anchor],
  );
  a.validate(start);
  a.validate(end);
  need(start.offset !== end.offset, "NO_SELECTION");
  const at = { ...start, offset: 0 };
  const paragraph = a.text(at);
  need(paragraph.length <= 200_000, "RANGE_TOO_LARGE");
  const scalars = Array.from(paragraph);
  need(
    !forbidden.test(paragraph),
    "UNSUPPORTED_RANGE",
    "CONTROL_OR_INVALID_TEXT",
  );
  // A body paragraph with a structural Section/Column definition is safe only
  // if Core proves the selected text has no logical object slots.
  need(!nested(start), "UNSUPPORTED_RANGE", "NESTED_TABLE");
  const lists: any[] = a.call("getCursorModel").lists;
  const list = start.kind === "cell" ? a.list(at) : undefined;
  let nativeOwner: unknown, semanticControl: number | undefined;
  if (start.kind === "cell") {
    need(
      !nested(start) &&
        list?.isCell === true &&
        list.hostListId === 0 &&
        Number.isSafeInteger(list.row) &&
        Number.isSafeInteger(list.col),
      "UNSUPPORTED_RANGE",
      "NON_ROOT_TABLE_CELL",
    );
    const info = a.call(
      "getCellInfo",
      start.sec,
      start.para,
      start.control,
      start.cell,
    );
    need(
      list.rowSpan === 1 &&
        list.colSpan === 1 &&
        info.rowSpan === 1 &&
        info.colSpan === 1,
      "UNSUPPORTED_RANGE",
      "MERGED_CELL",
    );
    const own = a.cellProps(start);
    need(own.cellProtect === false, "READ_ONLY", "PROTECTED_CELL");
    need(
      own.fieldName === "" && !own.editableInForm,
      "UNSUPPORTED_RANGE",
      "FORM_CELL",
    );
    need(
      !lists.some((l) => l.hostListId === list.listId && l.isCell),
      "UNSUPPORTED_RANGE",
      "NESTED_CELL_CONTENT",
    );
    const target = a.resolveParagraph(a.captureParagraph(at));
    need(
      target.sectionIndex === start.sec &&
        target.parentParaIndex === start.para &&
        equal(
          a.fromPath(
            target.sectionIndex,
            target.parentParaIndex,
            target.path,
            0,
          ),
          at,
        ),
      "TARGET_CONFLICT",
    );
    nativeOwner = target;
    const controls = rootTableControls(lists, start);
    semanticControl = controls.indexOf(start.control);
    need(semanticControl >= 0, "TARGET_CONFLICT");
  }
  let controlPara = paraIndex(start);
  if (start.kind === "body")
    for (let n = 0; n < start.sec; n++)
      controlPara += a.doc.getParagraphCount(n);
  const listId = list?.listId ?? 0;
  const controls = a.call<any[]>("getControls");
  need(
    !controls.some((c) => c.props?.Lock),
    "READ_ONLY",
    "LOCKED_DOCUMENT_CONTROL",
  );
  need(
    !controls.some(
      (c) =>
        c.list === listId &&
        c.para === controlPara &&
        (start.kind === "cell" || !["secd", "cold"].includes(c.ctrlId)),
    ) &&
      !lists.some(
        (l) =>
          l.hostListId === listId &&
          l.hostPara === paraIndex(start) &&
          l.sectionIndex === start.sec &&
          l.isCell,
      ),
    "UNSUPPORTED_RANGE",
    "PARAGRAPH_HAS_CONTROL",
  );
  need(
    a.length(at) === scalars.length &&
      a.textOffset(start) === start.offset &&
      a.textOffset(end) === end.offset,
    "UNSUPPORTED_RANGE",
    "LOGICAL_CONTROL_SLOT",
  );
  a.assertEditable(start);
  const scalarStart = start.offset,
    scalarEnd = end.offset;
  need(scalarEnd - scalarStart <= limits.selection, "CONTENT_LIMIT_EXCEEDED");
  need(
    graphemeBoundaries(
      paragraph,
      utf16Boundary(paragraph, scalarStart),
      utf16Boundary(paragraph, scalarEnd),
    ),
    "INVALID_GRAPHEME_BOUNDARY",
  );
  const runs: {
    startOffset: number;
    endOffset: number;
    charShapeId: number;
  }[] =
    start.kind === "body"
      ? a.call(
          "getCharShapeRuns",
          start.sec,
          start.para,
          scalarStart,
          scalarEnd,
        )
      : a.call(
          "getCharShapeRunsInCellByPath",
          start.sec,
          start.para,
          a.path(start),
          scalarStart,
          scalarEnd,
        );
  need(runs.length === 1, "MIXED_FORMAT_UNSUPPORTED");
  const run = runs[0];
  need(
    run.startOffset === scalarStart &&
      run.endOffset === scalarEnd &&
      Number.isSafeInteger(run.charShapeId) &&
      run.charShapeId === a.charProps(start).charShapeId,
    "TARGET_CONFLICT",
  );
  return {
    version: version(a),
    start,
    end,
    scalarStart,
    scalarEnd,
    paragraph,
    text: scalars.slice(scalarStart, scalarEnd).join(""),
    charShapeId: run.charShapeId,
    properties: {
      character: copy(a.charProps(start)),
      paragraph: copy(a.paraProps(start)),
    },
    nativeOwner,
    semanticControl,
  };
}

function replaced(r: Range, replacement: string) {
  need(
    typeof replacement === "string" && !forbidden.test(replacement),
    "INVALID_REPLACEMENT",
  );
  need(
    replacement.length <= 2 * limits.selection &&
      Array.from(replacement).length <= limits.selection,
    "CONTENT_LIMIT_EXCEEDED",
  );
  const left = utf16Boundary(r.paragraph, r.scalarStart),
    right = utf16Boundary(r.paragraph, r.scalarEnd);
  const paragraph =
    r.paragraph.slice(0, left) + replacement + r.paragraph.slice(right);
  need(
    graphemeBoundaries(paragraph, left, left + replacement.length),
    "INVALID_GRAPHEME_BOUNDARY",
    "JOIN",
  );
  return paragraph;
}

// Semantic comparison by exact native owner, never by searching for the
// selected string. The normalized ordinal is used only inside semantic().
function compareMutation(
  before: any,
  after: any,
  r: Range,
  expected: string,
  newLength: number,
) {
  const p = r.start;
  const row = (value: any) =>
    p.kind === "body"
      ? value.body.find((b: any) => b.sec === p.sec && b.para === p.para)
      : value.cells.find(
          (c: any) =>
            c.sec === p.sec &&
            c.para === p.para &&
            c.control === r.semanticControl &&
            c.cell === p.cell,
        )?.paragraphs[p.cellPara];
  const old = row(before),
    current = row(after);
  need(
    old && current && old.text === r.paragraph && current.text === expected,
    "PRESERVATION_FAILED",
    "TARGET_TEXT",
  );
  need(
    (equal(
      old.chars.slice(0, r.scalarStart),
      current.chars.slice(0, r.scalarStart),
    ) &&
      equal(
        old.chars.slice(r.scalarEnd),
        current.chars.slice(r.scalarStart + newLength),
      )) ||
      (expected === "" && equal(old.chars[r.scalarStart], current.chars[0])),
    "PRESERVATION_FAILED",
    "OUTSIDE_FORMAT",
  );
  current.text = old.text;
  current.chars = old.chars;
  need(equal(before, after), "PRESERVATION_FAILED", "NON_TARGET_SEMANTICS");
}

// Only the derived previews and the one targeted section may differ in the
// produced package. Compare actual compressed member bytes, not just CRCs.
function members(bytes: Uint8Array, section: number) {
  assertSafeHwpxEntryNames(bytes);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    (v.getUint32(end, true) !== 0x06054b50 ||
      end + 22 + v.getUint16(end + 20, true) !== bytes.length)
  )
    end--;
  need(
    end >= Math.max(0, bytes.length - 65557),
    "PRESERVATION_FAILED",
    "ARCHIVE",
  );
  const entries = new Map<string, Uint8Array>(),
    names = new Set<string>();
  let p = v.getUint32(end + 16, true);
  for (let n = v.getUint16(end + 10, true); n; n--) {
    const nameLength = v.getUint16(p + 28, true),
      extra = v.getUint16(p + 30, true),
      comment = v.getUint16(p + 32, true);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(p + 46, p + 46 + nameLength),
    );
    need(!names.has(name), "PRESERVATION_FAILED", "DUPLICATE_MEMBER");
    names.add(name);
    if (
      ![
        `Contents/section${section}.xml`,
        "Preview/PrvText.txt",
        "Preview/PrvImage.png",
      ].includes(name)
    ) {
      const local = v.getUint32(p + 42, true),
        size = v.getUint32(p + 20, true);
      need(
        local + 30 <= p && v.getUint32(local, true) === 0x04034b50,
        "PRESERVATION_FAILED",
        "LOCAL_MEMBER",
      );
      const start =
        local +
        30 +
        v.getUint16(local + 26, true) +
        v.getUint16(local + 28, true);
      need(start + size <= p, "PRESERVATION_FAILED", "MEMBER_BOUNDS");
      entries.set(name, bytes.subarray(start, start + size));
    }
    p += 46 + nameLength + extra + comment;
  }
  return entries;
}
function exact(x: Uint8Array | undefined, y: Uint8Array) {
  return !!x && x.length === y.length && y.every((b, i) => b === x[i]);
}
function preserveMembers(
  old: Map<string, Uint8Array>,
  next: Map<string, Uint8Array>,
) {
  need(
    old.size === next.size &&
      [...old].every(([name, data]) => exact(next.get(name), data)),
    "PRESERVATION_FAILED",
    "PACKAGE_MEMBERS",
  );
}

// One owner-bound instance per live editor. No exported public SDK or host IDs;
// A owns receipts, acceptance, expiry and the approved proposal's transport.
export class AiNativeRange {
  #lifetime = 0;
  #ranges = new Map<string, SealedRange>();
  #intents = new WeakSet<Intent>();
  #existingLayouts = new WeakMap<Intent, string>();
  #travel = new WeakMap<
    Receipt,
    {
      doc: RhwpAdapter["doc"];
      v: Version;
      entry: Interaction["history"]["undoStack"][number];
      redo: boolean;
    }
  >();
  constructor(private readonly editor: Interaction) {}
  #current(doc: RhwpAdapter["doc"], v: Version) {
    const a = this.editor.adapter;
    need(!a.transientEdit, "COMPOSITION_IN_PROGRESS");
    need(a.doc === doc && equal(version(a), v), "STALE_DOCUMENT");
    editable(a);
  }
  #get(id: string) {
    const r = this.#ranges.get(id);
    need(r, "STALE_DOCUMENT");
    this.#current(r.doc, r.version);
    return r;
  }
  release(id: string) {
    this.#ranges.delete(id);
  }
  clear() {
    this.#lifetime++;
    this.#ranges.clear();
    this.#intents = new WeakSet();
    this.#existingLayouts = new WeakMap();
    this.#travel = new WeakMap();
  }
  travel(operation: Receipt, redo = false) {
    const record = this.#travel.get(operation),
      a = this.editor.adapter;
    editable(a);
    need(
      record &&
        a.doc === record.doc &&
        equal(version(a), record.v) &&
        record.redo === redo &&
        (redo
          ? this.editor.history.redoStack
          : this.editor.history.undoStack
        ).at(-1) === record.entry,
      redo ? "REDO_NOT_LATEST" : "UNDO_NOT_LATEST",
    );
    need(!documentWriters.has(a.doc), "BUSY_TRANSACTION");
    documentWriters.add(a.doc);
    try {
      this.editor.undo(redo);
      record.v = version(a);
      record.redo = !redo;
      return copy(record.v);
    } finally {
      documentWriters.delete(record.doc);
    }
  }
  async capture() {
    const a = this.editor.adapter,
      doc = a.doc,
      lifetime = this.#lifetime;
    editable(a);
    // For supported text, resolve the Interaction-owned native selection
    // reference before sealing the range. No focus/DOM dependence thereafter.
    const s = this.editor.selection;
    const selection =
      s.kind === "text" && !nested(s.focus) && !nested(s.anchor)
        ? this.editor.capture().selection
        : s;
    const range = inspect(a, selection);
    const encoder = new TextEncoder();
    const [sourceHash, formatDigest] = await Promise.all([
      sha(encoder.encode(range.text)),
      digest(range.properties),
    ]);
    need(lifetime === this.#lifetime, "STALE_DOCUMENT");
    this.#current(doc, range.version);
    for (const [id, r] of this.#ranges)
      if (r.doc !== doc || !equal(r.version, range.version))
        this.#ranges.delete(id);
    need(this.#ranges.size < 32, "RANGE_LIMIT");
    const rangeId = crypto.randomUUID();
    const targetId = crypto.randomUUID();
    this.#ranges.set(rangeId, {
      ...range,
      doc,
      rangeId,
      sourceHash,
      formatDigest,
      targetId,
    });
    return copy({
      rangeId,
      ...range.version,
      source: range.text,
      sourceHash,
      formatDigest,
      targetId,
      format: range.properties,
    });
  }
  preview(rangeId: string, replacement: string) {
    const r = this.#get(rangeId);
    replaced(r, replacement);
    const preview = Object.freeze({
      rangeId,
      replacement,
      before: r.text,
      sourceHash: r.sourceHash,
      formatDigest: r.formatDigest,
      targetId: r.targetId,
      layout: "NOT_RUN" as const,
    });
    this.#intents.add(preview);
    return preview;
  }
  /** Same primitive on an isolated checked sibling. Never restore the live document
   * to make a preview. Core-normalized ordinals are used only to map to cold owner
   * candidates; inspect revalidates the cold native owner, source and formatting. */
  previewDetached(rangeId: string, replacement: string, existingHwpx = false) {
    const r = this.#get(rangeId),
      live = this.editor.adapter;
    replaced(r, replacement);
    const existingLayout = existingHwpx ? existingHwpxLayoutProof(live) : undefined;
    const bytes = live.exportChecked().bytes;
    const doc = siblingDocument(live.doc, bytes);
    let editor: Interaction | undefined;
    try {
      const a = new RhwpAdapter(doc);
      if (existingLayout !== undefined) applyFontEnvironment(a, live);
      editor = new Interaction(a);
      const beforePages = a.pageCount;
      need(
        beforePages === live.pageCount,
        "PRESERVATION_FAILED",
        "DETACHED_SOURCE_LAYOUT",
      );
      if (existingLayout !== undefined) verifyExistingHwpxLayout(a, existingLayout);
      let start = r.start,
        end = r.end;
      if (start.kind === "cell") {
        const control = rootTableControls(
          a.call("getCursorModel").lists,
          start,
        )[r.semanticControl!];
        need(Number.isSafeInteger(control), "TARGET_CONFLICT", "DETACHED_CELL");
        start = { ...start, control };
        end = { ...end, control } as Position;
      }
      editor.selection = { kind: "text", anchor: start, focus: end };
      const cold = inspect(a, editor.capture().selection);
      need(
        cold.text === r.text &&
          cold.paragraph === r.paragraph &&
          equal(
            effectiveProperties(cold.properties),
            effectiveProperties(r.properties),
          ),
        "TARGET_CONFLICT",
        "DETACHED_SOURCE",
      );
      const probe = new AiNativeRange(editor);
      const id = crypto.randomUUID();
      probe.#ranges.set(id, {
        ...cold,
        rangeId: id,
        sourceHash: r.sourceHash,
        formatDigest: r.formatDigest,
        targetId: r.targetId,
        doc,
      });
      probe.apply(probe.preview(id, replacement));
      if (existingLayout === undefined) assertMarkdownSafety(a);
      else verifyExistingHwpxLayout(a, existingLayout);
      const layout = Object.freeze({
        beforePages,
        afterPages: a.pageCount,
        overflow: false,
      });
      this.#current(r.doc, r.version);
      const preview = Object.freeze({
        rangeId,
        replacement,
        before: r.text,
        sourceHash: r.sourceHash,
        formatDigest: r.formatDigest,
        targetId: r.targetId,
        layout,
      });
      this.#intents.add(preview);
      if (existingLayout !== undefined) this.#existingLayouts.set(preview, existingLayout);
      return preview;
    } finally {
      try {
        editor?.history.clear();
      } finally {
        doc.free();
      }
    }
  }
  apply(intent: Intent): Receipt {
    need(this.#intents.has(intent), "INVALID_PROPOSAL");
    const r = this.#get(intent.rangeId),
      a = this.editor.adapter,
      doc = a.doc;
    const current = inspect(a, { kind: "text", anchor: r.start, focus: r.end });
    const {
      doc: _doc,
      rangeId: _id,
      sourceHash: _hash,
      formatDigest: _formatDigest,
      targetId: _targetId,
      ...baseline
    } = r;
    need(equal(current, baseline), "TARGET_CONFLICT");
    const expected = replaced(r, intent.replacement),
      size = Array.from(intent.replacement).length;
    const receipt = (committed: boolean, end: Position): Receipt => ({
      committed,
      before: r.version,
      after: version(a),
      target: copy({ start: r.start, end }),
      historyEntries: committed ? 1 : 0,
    });
    if (intent.replacement === r.text) {
      this.#intents.delete(intent);
      return receipt(false, r.end);
    }
    need(!documentWriters.has(doc), "BUSY_TRANSACTION");
    documentWriters.add(doc);
    try {
      const existingLayout = this.#existingLayouts.get(intent);
      if (existingLayout !== undefined) verifyExistingHwpxLayout(a, existingLayout);
      const pre = a.exportChecked(),
        original = members(pre.bytes, r.start.sec),
        before = a.semantic();
      const originalCellFrames =
        r.start.kind === "cell" ? a.cells(r.start) : undefined;
      const selection = this.editor.selection,
        undo = this.editor.history.undoStack,
        redo = this.editor.history.redoStack;
      const saved = a.savedRevision,
        undoCount = undo.length,
        redoCount = redo.length;
      this.#current(doc, r.version);
      let attempted = false;
      let next: Selection;
      try {
        next = this.editor.history.transact(
          "ai-native-range",
          selection,
          () => {
            attempted = true;
            a.remove(r.start, r.end);
            const end = size ? a.insert(r.start, intent.replacement) : r.start;
            need(
              end.offset === r.start.offset + size,
              "PRESERVATION_FAILED",
              "ENDPOINT",
            );
            if (size) {
              const p = r.start;
              if (p.kind === "body")
                a.call(
                  "setCharShapeId",
                  p.sec,
                  p.para,
                  r.scalarStart,
                  r.scalarStart + size,
                  r.charShapeId,
                );
              else
                a.call(
                  "setCharShapeIdInCell",
                  p.sec,
                  p.para,
                  p.control,
                  p.cell,
                  p.cellPara,
                  r.scalarStart,
                  r.scalarStart + size,
                  r.charShapeId,
                );
              const formatted: any[] =
                p.kind === "body"
                  ? a.call(
                      "getCharShapeRuns",
                      p.sec,
                      p.para,
                      r.scalarStart,
                      r.scalarStart + size,
                    )
                  : a.call(
                      "getCharShapeRunsInCellByPath",
                      p.sec,
                      p.para,
                      a.path(p),
                      r.scalarStart,
                      r.scalarStart + size,
                    );
              need(
                formatted.length === 1 &&
                  formatted[0].startOffset === r.scalarStart &&
                  formatted[0].endOffset === r.scalarStart + size &&
                  formatted[0].charShapeId === r.charShapeId,
                "PRESERVATION_FAILED",
                "TARGET_FORMAT",
              );
            }
            compareMutation(before, a.semantic(), r, expected, size);
            if (r.start.kind === "cell")
              need(
                equal(originalCellFrames, a.cells(r.start)),
                "PRESERVATION_FAILED",
                "CELL_FRAMES",
              );
            verifyLayout(a, r.start, expected);
            if (existingLayout !== undefined) verifyExistingHwpxLayout(a, existingLayout);
            preserveMembers(
              original,
              members(a.exportChecked().bytes, r.start.sec),
            );
            a.validate(end);
            return { kind: "caret", focus: end };
          },
        );
      } catch (error) {
        if (attempted) {
          let restored = false;
          try {
            restored =
              a.doc === doc &&
              equal(version(a), r.version) &&
              a.savedRevision === saved &&
              equal(this.editor.selection, selection) &&
              this.editor.history.undoStack === undo &&
              this.editor.history.redoStack === redo &&
              undo.length === undoCount &&
              redo.length === redoCount &&
              equal(a.semantic(), before) &&
              exact(a.exportChecked().bytes, pre.bytes);
          } catch {
            /* unverified rollback must not remain writable */
          }
          if (!restored) {
            recovery.add(doc);
            a.scope = "readonly";
            a.documentLocked = true;
            throw new AiNativeError("RECOVERY_REQUIRED");
          }
        }
        throw error;
      }
      // History has committed. No export/validation/async call belongs here.
      this.editor.selection = next;
      this.editor.refreshFontGeometry();
      this.editor.block = false;
      this.editor.typing = {};
      this.#ranges.delete(r.rangeId);
      this.#intents.delete(intent);
      const result = receipt(true, next.focus);
      this.#travel.set(result, {
        doc,
        v: version(a),
        entry: this.editor.history.undoStack.at(-1)!,
        redo: false,
      });
      return result;
    } finally {
      documentWriters.delete(doc);
    }
  }
}

function verifyExistingHwpxLayout(a: RhwpAdapter, proof: string) {
  need(existingHwpxLayoutProof(a) === proof, "PRESERVATION_FAILED", "DECORATION_LAYOUT");
}

// Native layout is allowed to repaginate. Check actual run ownership/coverage
// and containment; this is not a painted-ink or installed-Hancom claim.
function verifyLayout(a: RhwpAdapter, p: Position, text: string) {
  const cover = new Set<number>(),
    chars = Array.from(text);
  const boxes =
    p.kind === "cell" ? a.cells(p).filter((b) => b.cellIdx === p.cell) : [];
  const hasCell = p.kind === "cell";
  for (let page = 0; page < a.pageCount; page++) {
    const info = a.call("getPageInfo", page);
    for (const run of a.runs(page)) {
      if (!run.text || run.secIdx !== p.sec) continue;
      const matches =
        p.kind === "body"
          ? run.parentParaIdx === undefined && run.paraIdx === p.para
          : run.parentParaIdx === p.para &&
            run.controlIdx === p.control &&
            run.cellIdx === p.cell &&
            run.cellParaIdx === p.cellPara &&
            (run.cellPath?.length ?? 1) === 1;
      if (!matches) continue;
      need(
        run.x >= info.bodyLeft &&
          run.x + run.w <= info.bodyRight &&
          run.y >= info.headerArea.y + info.headerArea.height &&
          run.y + run.h <= info.footerArea.y,
        "PRESERVATION_FAILED",
        "BODY_CONTAINMENT",
      );
      if (hasCell)
        need(
          boxes.some(
            (b) =>
              b.pageIndex === page &&
              run.x >= b.x &&
              run.x + run.w <= b.x + b.w &&
              run.y >= b.y &&
              run.y + run.h <= b.y + b.h,
          ),
          "PRESERVATION_FAILED",
          "CELL_CONTAINMENT",
        );
      for (const [i, c] of Array.from(run.text).entries()) {
        const index = run.charStart + i;
        need(
          chars[index] === c && !cover.has(index),
          "PRESERVATION_FAILED",
          "RUN_COVERAGE",
        );
        cover.add(index);
      }
    }
  }
  need(
    chars.every((c, i) => cover.has(i) || c === " "),
    "PRESERVATION_FAILED",
    "MISSING_RUN",
  );
}
export async function checkedAiHwpx(a: RhwpAdapter) {
  need(!recovery.has(a.doc), "RECOVERY_REQUIRED");
  need(!a.transientEdit, "COMPOSITION_IN_PROGRESS");
  const doc = a.doc,
    v = version(a),
    out = a.exportChecked();
  assertSafeHwpxEntryNames(out.bytes);
  need(out.bytes.byteLength <= limits.fileBytes, "CONTENT_LIMIT_EXCEEDED");
  const checksum = await sha(Uint8Array.from(out.bytes));
  // Bytes remain a revision-bound artifact even when editing happens while
  // hashing; do not call them current, save to a host, or mark saved here.
  return {
    bytes: out.bytes,
    ...v,
    exportRevision: v.mutationRevision,
    checksum,
    current: a.doc === doc && equal(v, version(a)) && !a.transientEdit,
  };
}
