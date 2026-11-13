import type { Interaction } from "./interaction.js";
import { cellPath, nested, sameTable, type Selection } from "./model.js";
import { displayed, mixed, type FormatState } from "./formatting.js";
import { cellBlockState } from "./cell-block-scope.js";
import type { TablePropertyField, TablePropertyMember, TablePropertyTarget } from "./table-property-projection.js";

const cellFields = [
  "verticalAlign", "applyInnerMargin", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
  "fillType", "fillColor", "borderLeft", "borderRight", "borderTop", "borderBottom",
] as const satisfies readonly TablePropertyField[];

/** This receipt is consumed before returning from the current synchronous
 * preparation. It supplies displayed values only, never command permission,
 * new target identity, page geometry, or the authority to extend a range. */
export function projectCellDraft(editor: Interaction, selection: Selection, block: boolean,
    currentClickGrid?:()=>ReturnType<Interaction["adapter"]["cells"]>|undefined): FormatState | undefined {
  const p = selection.focus;
  // Native supports nested read-only members. The current dialog cannot
  // prepare/apply nested cell formatting and must retain its existing refusal.
  if (p.kind !== "cell" || nested(p) ||
      (selection.kind !== "caret" && selection.kind !== "cells" && selection.kind !== "table") ||
      (block && selection.kind !== "cells")) return;

  let range: TablePropertyTarget["range"] = {kind: "focus"};
  if (selection.kind === "cells") {
    if (!sameTable(selection.anchor, p)) return;
    range = selection.phase === 3 ? {kind: "table"} : {kind: "rectangle", anchor: selection.anchor.cell};
  } else if (selection.kind === "table") range = {kind: "table"};

  const a = editor.adapter;
  const generation = () => editor.currentSelectionGeneration;
  const result = a.tablePropertyProjection({
    target: {section: p.sec, paragraph: p.para, path: cellPath(p), range, selectionGeneration: generation()},
    fields: cellFields,
  }, generation);
  switch (result.status) {
    case "unsupported": case "unsupportedRuntime": case "budgetExceeded": case "unavailable": return;
    case "stale": throw Error("표/셀 속성 대상이 바뀌었습니다. 메뉴를 다시 여세요.");
    case "missing": throw Error("현재 선택한 셀을 찾을 수 없습니다.");
    case "invalidRequest": case "invalidResponse": throw Error("표/셀 속성값을 확인할 수 없습니다.");
    case "ok": break;
  }

  const first = result.members[0];
  if (range.kind === "focus" && first.rowSpan === 1 && first.colSpan === 1) {
    return {...mixed([displayed("cell", first.values)]), __cellLayoutHold: false};
  }

  // Native model cells need not be identical to the painted fragment scope.
  // Independently check every chosen ID and every fragment's authored grid
  // position/span. The legacy selection and its ordering remain authoritative.
  const members = new Map<number, TablePropertyMember>(result.members.map(m => [m.cellIndex, m]));
  const all = currentClickGrid?.()??a.cells(p);
  const expected = range.kind === "focus" ? all.filter(c => c.cellIdx === p.cell).slice(0, 1) : editor.cells(selection);
  if (expected.length !== members.size || expected.some(c => !members.has(c.cellIdx))) return;
  const seen = new Set<number>();
  for (const c of all) {
    const m = members.get(c.cellIdx);
    if (!m) continue;
    if (m.row !== c.row || m.col !== c.col || m.rowSpan !== c.rowSpan || m.colSpan !== c.colSpan) return;
    seen.add(c.cellIdx);
  }
  if (seen.size !== members.size) return;

  if (block) return cellBlockState(editor, selection, {cells: expected, all, read: id => members.get(id)!.values});
  const state = mixed(expected.map(c => displayed("cell", members.get(c.cellIdx)!.values)));
  state.__cellLayoutHold = expected.some(c => c.rowSpan !== 1 || c.colSpan !== 1);
  return state;
}
