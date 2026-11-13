import type { RhwpAdapter } from "./adapter.js";
import type { MarkdownBlock, MarkdownPlan } from "./markdown-import.js";
import type { Position } from "./model.js";

export type MergedGridCell = Readonly<{
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
}>;
export type MergedGridBlock = Readonly<{
  kind: "merged-grid";
  rowCount: number;
  colCount: number;
  cells: readonly MergedGridCell[];
}>;
export type NativeDocumentPlan = Omit<MarkdownPlan, "blocks"> & {
  blocks: (MarkdownBlock | MergedGridBlock)[];
};
type CellPosition = Extract<Position, { kind: "cell" }>;
type GridError = "INVALID_GRID" | "GRID_LIMIT" | "GRID_NATIVE_PRESERVATION";
const issued = new WeakSet<MergedGridBlock>();
function requireGrid(ok: unknown, code: GridError, detail: string): asserts ok {
  if (!ok) throw Object.assign(Error(code), { code, detail });
}
const allowed = (
  v: unknown,
  keys: readonly string[],
): v is Record<string, unknown> =>
  !!v &&
  Object.getPrototypeOf(v) === Object.prototype &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const int = (v: unknown): v is number => Number.isSafeInteger(v);

/** Core-owned semantic admission after A's JSON/permission/schema admission.
 * No text normalization. A owns document-wide budgets and wire versioning. */
export function validateMergedGrid(input: unknown): MergedGridBlock {
  requireGrid(
    allowed(input, ["rowCount", "colCount", "cells"]),
    "INVALID_GRID",
    "SHAPE",
  );
  const { rowCount, colCount, cells } = input;
  requireGrid(
    int(rowCount) && int(colCount) && rowCount > 0 && colCount > 0,
    "INVALID_GRID",
    "DIMENSIONS",
  );
  requireGrid(
    colCount <= 12 && rowCount <= 1000 && rowCount * colCount <= 1000,
    "GRID_LIMIT",
    "TRACKS",
  );
  requireGrid(
    Array.isArray(cells) &&
      cells.length > 0 &&
      cells.length <= rowCount * colCount,
    "INVALID_GRID",
    "CELLS",
  );
  const filled = new Uint8Array(rowCount * colCount);
  let textSize = 0,
    merged = false,
    covered = 0;
  const normalized: MergedGridCell[] = [];
  for (const c of cells) {
    requireGrid(
      allowed(c, ["row", "col", "rowSpan", "colSpan", "text"]),
      "INVALID_GRID",
      "CELL_SHAPE",
    );
    const { row, col, rowSpan, colSpan, text } = c;
    requireGrid(
      int(row) &&
        int(col) &&
        int(rowSpan) &&
        int(colSpan) &&
        row >= 0 &&
        col >= 0 &&
        rowSpan > 0 &&
        colSpan > 0 &&
        rowSpan <= rowCount - row &&
        colSpan <= colCount - col,
      "INVALID_GRID",
      "SPAN",
    );
    requireGrid(
      typeof text === "string" &&
        !/[\p{Surrogate}\u0000-\u001f\u007f-\u009f\u2028\u2029\uFFFC]/u.test(
          text,
        ),
      "INVALID_GRID",
      "CELL_TEXT",
    );
    requireGrid(text.length <= 40000, "GRID_LIMIT", "TEXT");
    textSize += Array.from(text).length;
    requireGrid(textSize <= 20000, "GRID_LIMIT", "TEXT");
    for (let r = row; r < row + rowSpan; r++) {
      for (let k = col; k < col + colSpan; k++) {
        const i = r * colCount + k;
        requireGrid(!filled[i], "INVALID_GRID", "OVERLAP_OR_DUPLICATE_ANCHOR");
        filled[i] = 1;
        covered++;
      }
    }
    merged ||= rowSpan > 1 || colSpan > 1;
    normalized.push(Object.freeze({ row, col, rowSpan, colSpan, text }));
  }
  requireGrid(covered === filled.length, "INVALID_GRID", "HOLE");
  requireGrid(merged, "INVALID_GRID", "USE_ORDINARY_TABLE");
  const result = Object.freeze({
    kind: "merged-grid" as const,
    rowCount,
    colCount,
    cells: Object.freeze(
      normalized.sort((x, y) => x.row - y.row || x.col - y.col),
    ),
  });
  issued.add(result);
  return result;
}
/** Optional raw-JSON ingress helper for A. Structured clone input has already
 * lost duplicate-key provenance. This function accepts only bounded JSON text,
 * validates grammar natively, then rejects duplicate decoded member names
 * before returning the object for A's schema and semantic validation. */
export function decodeDocumentSpecJson(raw: string): unknown {
  requireGrid(
    typeof raw === "string" &&
      raw.length <= 2 * 1024 * 1024 &&
      new TextEncoder().encode(raw).byteLength <= 2 * 1024 * 1024,
    "GRID_LIMIT",
    "JSON_BYTES",
  );
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    requireGrid(false, "INVALID_GRID", "JSON_SYNTAX");
  }
  const stack: ({ keys: Set<string>; awaitingKey: boolean } | null)[] = [];
  // JSON.parse established grammar; match only quote-delimited JSON tokens and
  // structural characters outside those tokens, without enumerating values.
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]/gu;
  for (const match of raw.matchAll(tokens)) {
    const token = match[0];
    if (token === "{") stack.push({ keys: new Set(), awaitingKey: true });
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else {
      const frame = stack.at(-1);
      if (frame && token === ",") frame.awaitingKey = true;
      else if (frame && token[0] === '"' && frame.awaitingKey) {
        const key = JSON.parse(token) as string;
        requireGrid(!frame.keys.has(key), "INVALID_GRID", "DUPLICATE_JSON_KEY");
        frame.keys.add(key);
        frame.awaitingKey = false;
      }
    }
    requireGrid(stack.length <= 16, "GRID_LIMIT", "JSON_DEPTH");
  }
  return value;
}
export function assertValidatedMergedGrids(plan: NativeDocumentPlan) {
  if (!plan.blocks.some((block) => block.kind === "merged-grid")) return;
  requireGrid(
    plan.mode === "report" && plan.blocks.length <= 200,
    "GRID_LIMIT",
    "REPORT_PLAN",
  );
  let tables = 0,
    tracks = 0,
    characters = 0;
  const count = (text: string) => {
    characters += Array.from(text).length;
  };
  for (const block of plan.blocks) {
    if (block.kind === "merged-grid") {
      requireGrid(issued.has(block), "INVALID_GRID", "UNVALIDATED_PLAN");
      tables++;
      tracks += block.rowCount * block.colCount;
      for (const c of block.cells) count(c.text);
    } else if (block.kind === "table") {
      tables++;
      tracks += block.rows.length * block.align.length;
      for (const row of block.rows)
        for (const cell of row) for (const run of cell) count(run.text);
    } else {
      for (const run of block.runs) count(run.text);
    }
    requireGrid(
      tables <= 20 && tracks <= 1000 && characters <= 20000,
      "GRID_LIMIT",
      "DOCUMENT_TOTAL",
    );
  }
}
type NativeCell = {
  listId: number;
  cellIndex: number;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  paraCount: number;
};
const footprint = (
  c: Pick<NativeCell, "row" | "col" | "rowSpan" | "colSpan">,
) => JSON.stringify([c.row, c.col, c.rowSpan, c.colSpan]);

function nativeCells(a: RhwpAdapter, p: CellPosition): NativeCell[] {
  return a
    .call("getCursorModel")
    .lists.filter(
      (l: any) =>
        l.isCell &&
        l.hostListId === 0 &&
        l.sectionIndex === p.sec &&
        l.hostPara === p.para &&
        l.controlIndex === p.control,
    );
}
function assertTiling(
  native: NativeCell[],
  expected: readonly MergedGridCell[],
) {
  const footprints = new Set(native.map(footprint));
  requireGrid(
    native.length === expected.length &&
      footprints.size === expected.length &&
      expected.every((c) => footprints.has(footprint(c))) &&
      native.every((c) => c.paraCount === 1),
    "GRID_NATIVE_PRESERVATION",
    "OWNER_OR_SPAN",
  );
}

/** Called only for the new blank table inserted by the shared detached
 * composer, before typing or assigning formats. Native merge owns all tracks
 * and reflow; no raw model/line/size writes, no use for existing document edits. */
export function constructFreshMergedGrid(
  a: RhwpAdapter,
  p: CellPosition,
  block: MergedGridBlock,
  populate: (target: CellPosition, cell: MergedGridCell) => void,
) {
  requireGrid(
    issued.has(block) && !p.ancestors?.length,
    "INVALID_GRID",
    "UNVALIDATED_OWNER",
  );
  const { rowCount, colCount, cells } = block;
  const dims = a.call("getTableDimensions", p.sec, p.para, p.control);
  requireGrid(
    dims.rowCount === rowCount && dims.colCount === colCount,
    "GRID_NATIVE_PRESERVATION",
    "DIMENSIONS",
  );
  const ordinary = Array.from({ length: rowCount * colCount }, (_, i) => ({
    row: Math.floor(i / colCount),
    col: i % colCount,
    rowSpan: 1,
    colSpan: 1,
    text: "",
  }));
  const initial = nativeCells(a, p);
  assertTiling(initial, ordinary);
  const position = (i: number): CellPosition => ({
    ...p,
    cell: i,
    cellPara: 0,
    offset: 0,
  });
  const controls = a.call("getControls");
  requireGrid(
    initial.every(
      (c) =>
        a.text(position(c.cellIndex)) === "" &&
        Number.isSafeInteger(c.listId) &&
        !controls.some((k: any) => k.list === c.listId),
    ),
    "GRID_NATIVE_PRESERVATION",
    "NOT_FRESH_EMPTY",
  );
  for (const c of cells)
    if (c.rowSpan > 1 || c.colSpan > 1) {
      a.call(
        "mergeTableCells",
        p.sec,
        p.para,
        p.control,
        c.row,
        c.col,
        c.row + c.rowSpan - 1,
        c.col + c.colSpan - 1,
      );
    }
  const owners = nativeCells(a, p);
  assertTiling(owners, cells);
  const byFootprint = new Map(owners.map((o) => [footprint(o), o]));
  for (const c of cells) {
    const o = byFootprint.get(footprint(c))!;
    populate(position(o.cellIndex), c);
  }
  const after = nativeCells(a, p);
  assertTiling(after, cells);
  const expected = new Map(cells.map((c) => [footprint(c), c.text]));
  for (const o of after)
    requireGrid(
      a.text(position(o.cellIndex)) === expected.get(footprint(o)),
      "GRID_NATIVE_PRESERVATION",
      "TEXT",
    );
  const emitted = new Map<number, { start: number; text: string }[]>();
  for (let page = 0; page < a.pageCount; page++)
    for (const run of a.runs(page)) {
      if (
        run.secIdx !== p.sec ||
        run.parentParaIdx !== p.para ||
        run.controlIdx !== p.control ||
        run.cellParaIdx !== 0 ||
        run.cellIdx === undefined ||
        !run.text
      )
        continue;
      const items = emitted.get(run.cellIdx) ?? [];
      items.push({ start: run.charStart, text: run.text });
      emitted.set(run.cellIdx, items);
    }
  const actualIds = new Set(after.map((c) => c.cellIndex));
  requireGrid(
    [...emitted.keys()].every((id) => actualIds.has(id)),
    "GRID_NATIVE_PRESERVATION",
    "UNEXPECTED_RUN_OWNER",
  );
  for (const o of after) {
    const text = expected.get(footprint(o))!,
      scalars = Array.from(text);
    const used = new Set<number>();
    for (const run of emitted.get(o.cellIndex) ?? [])
      for (const [i, c] of Array.from(run.text).entries()) {
        const index = run.start + i;
        requireGrid(
          !used.has(index) && scalars[index] === c,
          "GRID_NATIVE_PRESERVATION",
          "RUN_ORDER",
        );
        used.add(index);
      }
    requireGrid(
      scalars.every((c, i) => used.has(i) || c === " "),
      "GRID_NATIVE_PRESERVATION",
      "MISSING_RUN",
    );
  }
}
