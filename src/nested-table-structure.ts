// A-4 bridge only: Core owns structure validation, geometry, identity and mutation.
// Called synchronously inside the existing History transaction (no second history).
import type { RhwpAdapter } from "./adapter.js";
import { coreRuntimeHasCapability } from './core-runtime.js';
import { UnsupportedTableOperation } from './table-capability.js';
import {
  cellPath,
  type CellPathEntry,
  type Command,
  type Position,
  type Selection,
} from "./model.js";
type Target = {
  targetId: string;
  sectionIndex: number;
  parentParaIndex: number;
  path: CellPathEntry[];
  charLength: number;
};
type Cell = {
  cellId: string;
  cellIndex: number;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
};
type Table = { revision: string; cells: Cell[] };
type Operation = Extract<Command, { type: "table-edit" }>["operation"];
const decode = (raw: string) => {
  const r = JSON.parse(raw);
  if (r.ok === false || r.error)
    throw Error(
      `중첩 표 변경 거절: ${r.reason ?? r.error ?? "invalid-target"}`,
    );
  return r;
};
const pathEqual = (a: CellPathEntry[], b: CellPathEntry[]) =>
  a.length === b.length &&
  a.every(
    (v, i) =>
      v.controlIndex === b[i].controlIndex &&
      v.cellIndex === b[i].cellIndex &&
      v.cellParaIndex === b[i].cellParaIndex,
  );
// Read-only admission for proven Core restrictions. Core still validates IR
// line-cache/geometry on its candidate; never probe with a mutating command.
export function assertNestedRowDeletion(
  a: RhwpAdapter,
  s: Selection,
  selected: number[],
) {
  const p = s.focus;
  if (p.kind !== "cell" || !p.ancestors?.length) return;
  const target = a.resolveParagraph(a.captureParagraph(p));
  const controls = a.call<any[]>("getControls");
  for (let level = 1; level < target.path.length; level++) {
    const host = a.fromPath(p.sec, p.para, target.path.slice(0, level), 0);
    if (host.kind !== "cell") throw Error("중첩 표의 부모 경로를 확인할 수 없습니다.");
    const list = a.list(host);
    const owned = controls.filter(c => c.list === list.listId && c.para === host.cellPara);
    if (host.cellPara + 1 !== a.count(host) || a.text(host).trim() ||
        owned.length !== 1 || owned[0].ctrlId !== "tbl" ||
        owned[0].controlIndex !== target.path[level].controlIndex)
      throw Error("중첩 행 삭제 미지원: 바깥 셀의 마지막 단독 표 문단만 지원합니다. 뒤 문단이나 함께 배치된 내용은 보존해야 합니다.");
  }
  const table = a.call("getTableStructureByPath", p.sec, p.para,
    JSON.stringify(target.path), target.targetId).table;
  const cells: Cell[] = table.cells;
  const chosen = selected.map(index => {
    const cell = cells.find(c => c.cellIndex === index);
    if (!cell) throw Error("셀 선택이 만료되었습니다.");
    return cell;
  }).sort((x, y) => x.row - y.row || x.col - y.col);
  if (!chosen.length) throw Error("셀 선택이 만료되었습니다.");
  if (table.rowCount <= 1) throw Error("중첩 표의 마지막 행은 삭제할 수 없습니다.");
  if (cells.some(c => c.rowSpan > 1))
    throw Error("행 병합을 포함한 중첩 표의 행 변경 미지원");
  for (const cell of cells.filter(c => c.row !== chosen[0].row)) {
    const live = a.call("resolveTableCell", cell.cellId);
    if (!live.valid) throw Error("셀 선택이 만료되었습니다.");
    const remaining = a.fromPath(p.sec, p.para, live.target.path, 0);
    const list = a.list(remaining);
    if (a.count(remaining) !== 1 || controls.some(c => c.list === list.listId))
      throw Error("중첩 행 삭제 미지원: 남는 셀은 개체 없는 단일 문단이어야 합니다. 줄 배치·높이는 Core가 추가 확인합니다.");
  }
}
export function tableOperation(operation: Operation, cells: Cell[], spanExtent = false) {
  if (!cells.length) throw Error("셀 선택이 만료되었습니다.");
  const first = [...cells].sort((a, b) => a.row - b.row || a.col - b.col)[0];
  switch (operation) {
    case "merge":
      return {
        kind: "merge",
        startRow: Math.min(...cells.map((c) => c.row)),
        startCol: Math.min(...cells.map((c) => c.col)),
        endRow: Math.max(...cells.map((c) => c.row + c.rowSpan - 1)),
        endCol: Math.max(...cells.map((c) => c.col + c.colSpan - 1)),
      };
    case "split":
      return { kind: "split", row: first.row, col: first.col };
    case "row-add":
      return { kind: "insertRow", row: spanExtent ? Math.max(...cells.map(c => c.row + c.rowSpan - 1)) : first.row, below: true };
    case "col-add":
      return { kind: "insertColumn", col: spanExtent ? Math.max(...cells.map(c => c.col + c.colSpan - 1)) : first.col, right: true };
    // These explicit row/column delete commands authorize deleting that line's contents.
    // Core still owns the restrictive nested row deletion preflight.
    case "row-delete":
      return { kind: "deleteRow", row: first.row, allowContentDeletion: true };
    case "col-delete":
      return {
        kind: "deleteColumn",
        col: first.col,
        allowContentDeletion: true,
      };
  }
}
export function editNestedTable(
  a: RhwpAdapter,
  s: Selection,
  operation: Operation,
  selected: number[],
): Selection {
  const p = s.focus;
  const certifiedRoot = p.kind === 'cell' && !p.ancestors?.length &&
    coreRuntimeHasCapability(a.doc, 'structural-table-frame');
  if (p.kind !== "cell" || !p.ancestors?.length && !certifiedRoot)
    throw Error("중첩 셀 경로가 필요합니다.");
  const targets: Target[] = decode(a.doc.getCellParagraphPaths()).targets;
  const targetFor = (p: Position) => {
    if (p.kind !== "cell") throw Error("셀 선택이 필요합니다.");
    const t = targets.find(
      (t) =>
        t.sectionIndex === p.sec &&
        t.parentParaIndex === p.para &&
        pathEqual(t.path, cellPath(p)),
    );
    if (!t) throw Error("셀 선택이 만료되었습니다.");
    const live = decode(a.doc.resolveCellParagraphPath(t.targetId));
    if (!live.valid || !pathEqual(live.target.path, cellPath(p)))
      throw Error("셀 선택이 만료되었습니다.");
    return live.target as Target;
  };
  const focus = targetFor(p),
    anchor = targetFor("anchor" in s ? s.anchor : p);
  const args = [
    focus.sectionIndex,
    focus.parentParaIndex,
    JSON.stringify(focus.path),
    focus.targetId,
  ] as const;
  const table: Table = decode(a.doc.getTableStructureByPath(...args)).table;
  const cells = selected.map((index) => {
    const c = table.cells.find((c) => c.cellIndex === index);
    if (!c) throw Error("셀 선택이 만료되었습니다.");
    const live = decode(a.doc.resolveTableCell(c.cellId));
    if (!live.valid || live.target.path.at(-1).cellIndex !== index)
      throw Error("셀 선택이 만료되었습니다.");
    return c;
  });
  const raw = a.doc.editTableStructureByPath(
      ...args,
      JSON.stringify({
        expectedRevision: table.revision,
        operation: tableOperation(operation, cells, certifiedRoot),
        anchor: {
          targetId: anchor.targetId,
          offset: ("anchor" in s ? s.anchor : p).offset,
        },
        focus: { targetId: focus.targetId, offset: p.offset },
      }),
    );
  const reply = JSON.parse(raw);
  // Capability refusal is distinct from internal transaction/parse errors.
  // Keep the exact native reason for diagnosis, never as user-facing copy.
  if ((reply.ok === false || reply.error) && typeof reply.reason === 'string' &&
      reply.reason.startsWith('unsupported-'))
    throw new UnsupportedTableOperation('table-structure-unsupported', reply.reason);
  const result = decode(raw);
  if (!result.changed) throw Error("중첩 표 구조가 변경되지 않았습니다.");
  // A merged-away cell can lose its ID while its paragraph survives in the winner.
  // Resolve paragraph first, then verify the new owning cell, never reuse old indices.
  const live = JSON.parse(a.doc.resolveCellParagraphPath(focus.targetId));
  let position: Position;
  if (live.valid) {
    const t: Target = live.target;
    const owner = result.table.cells.find(
      (c: Cell) => c.cellIndex === t.path.at(-1)!.cellIndex,
    );
    if (!owner) throw Error("Core 결과에 커서의 셀이 없습니다.");
    const cell = decode(a.doc.resolveTableCell(owner.cellId));
    if (!cell.valid) throw Error("Core 결과의 셀이 삭제되었습니다.");
    position = a.fromPath(t.sectionIndex, t.parentParaIndex, t.path, p.offset);
  } else if (certifiedRoot || operation === "row-delete" && cells.every(c => c.row === 0)) {
    // Preserve the existing root/first-row deletion policy: only after the
    // focused paragraph is actually deleted, enter the first surviving cell.
    // Resolve Core's surviving identity; the
    // deleted paragraph ID and its old flattened cell index are no longer valid.
    const first = [...result.table.cells].sort(
      (x: Cell, y: Cell) => x.row - y.row || x.col - y.col,
    )[0];
    if (!first) throw Error("삭제 후 남은 자식 셀을 확인할 수 없습니다.");
    const cell = decode(a.doc.resolveTableCell(first.cellId));
    if (!cell.valid || !cell.target ||
        cell.target.path.length !== focus.path.length ||
        !pathEqual(cell.target.path.slice(0, -1), focus.path.slice(0, -1)))
      throw Error("삭제 후 자식 셀의 경로가 일치하지 않습니다.");
    const t: Target = cell.target;
    position = a.fromPath(t.sectionIndex, t.parentParaIndex, t.path, 0);
  } else {
    // Explicit exit to the unchanged parent host, not an arbitrary neighbour cell.
    // Existing assertTextOnly protects its inline object from ordinary text replacement.
    if (!p.ancestors?.length) throw Error('삭제 후 상위 셀 경로가 없습니다.');
    position = a.fromPath(p.sec, p.para, p.ancestors, 0);
  }
  if (certifiedRoot && (position.kind !== 'cell' || position.sec !== p.sec ||
      position.para !== p.para || position.control !== p.control || position.ancestors?.length))
    throw Error('표 변경 후 커서의 현재 소유자가 일치하지 않습니다.');
  a.validate(position); // Any postcondition failure rolls back via History.
  return { kind: "caret", focus: position };
}
