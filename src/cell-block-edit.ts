import type { RhwpAdapter } from "./adapter.js";
import { cellBlockPlan } from "./cell-block-scope.js";
import { sides } from "./formatting.js";
import type { CellBox, Position, Props } from "./model.js";

type CellPosition = Extract<Position, {kind: "cell"}>;
type Side = typeof sides[number];
type Line = {type: number; width: number; color: string};
type Piece = {start: number; end: number; line: Line};
const opposite = {Left: "Right", Right: "Left", Top: "Bottom", Bottom: "Top"} as const;
const key = (side: Side) => `border${side}`;
const fields = ["type", "width", "color"] as const;
const hex = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const appearance = (line: Line): Line => ({...line, color: line.color.toLowerCase()});
const sameLine = (a: Line, b: Line) => a.type === b.type && a.width === b.width &&
  a.color.toLowerCase() === b.color.toLowerCase();

function span(cell: CellBox, side: Side) {
  return side === "Left" || side === "Right"
    ? {start: cell.row, end: cell.row + cell.rowSpan}
    : {start: cell.col, end: cell.col + cell.colSpan};
}
function boundary(cell: CellBox, side: Side) {
  switch (side) {
    case "Left": return cell.col;
    case "Right": return cell.col + cell.colSpan;
    case "Top": return cell.row;
    case "Bottom": return cell.row + cell.rowSpan;
  }
}

/** A physical shared line is represented by the facing side of two cells.
 * Plan those sides explicitly so the legacy setter cannot copy other sides. */
export function prepareCellBlockEdit(a: RhwpAdapter, focus: CellPosition, grid: CellBox[], selected: number[], props: Props) {
  const cells = [...new Map(grid.map(cell => [cell.cellIdx, cell])).values()];
  const lowered = cellBlockPlan(cells, selected, props);
  const position = (cell: number): CellPosition => ({...focus, cell, cellPara: 0, offset: 0});
  const rows = new Map(cells.map(cell => {
    const p = position(cell.cellIdx);
    return [cell.cellIdx, {
      cell, p, before: a.cellProps(p), changes: new Map<Side, Line>(),
      shared: new Map<Side, Piece[]>(), fill: undefined as string | undefined,
    }];
  }));
  for (const [cell, delta] of lowered) {
    const row = rows.get(cell)!;
    if (delta.background !== undefined) {
      if (delta.background !== "none" && !hex(delta.background))
        throw Error("셀 배경색을 확인하세요.");
      const before = row.before, fill = delta.background.toLowerCase();
      if (fill === "none" ? before.fillType !== "none" :
          before.fillType !== "solid" || before.fillColor.toLowerCase() !== fill)
        row.fill = fill;
    }
    for (const side of sides) {
      const name = key(side);
      if (!fields.some(field => Object.hasOwn(delta, `${name}.${field}`))) continue;
      const previous: Line = row.before[name];
      const line = appearance({
        type: Number(delta[`${name}.type`] ?? previous.type),
        width: Number(delta[`${name}.width`] ?? previous.width),
        color: String(delta[`${name}.color`] ?? previous.color),
      });
      if (!sameLine(line, previous)) row.changes.set(side, line);
      const target = span(row.cell, side), facing = opposite[side];
      for (const neighbor of rows.values()) {
        if (lowered.has(neighbor.cell.cellIdx) ||
            boundary(row.cell, side) !== boundary(neighbor.cell, facing)) continue;
        const other = span(neighbor.cell, facing);
        const start = Math.max(target.start, other.start), end = Math.min(target.end, other.end);
        if (end <= start) continue;
        const pieces = neighbor.shared.get(facing) ?? [];
        pieces.push({start, end, line});
        neighbor.shared.set(facing, pieces);
      }
    }
  }
  for (const row of rows.values()) {
    for (const [side, pieces] of row.shared) {
      if (pieces.every(piece => sameLine(piece.line, row.before[key(side)]))) continue;
      const {start, end} = span(row.cell, side);
      const first = pieces[0].line;
      let next = start;
      for (const piece of pieces.sort((a, b) => a.start - b.start)) {
        if (piece.start !== next || !sameLine(first, piece.line)) break;
        next = piece.end;
      }
      if (next !== end)
        throw Error("이웃 셀과 공유하는 선의 일부만 선택했습니다. 공유하는 변 전체를 선택하세요.");
      row.changes.set(side, first);
    }
  }
  const writes = [...rows.values()].filter(row => row.changes.size || row.fill !== undefined);
  if (!writes.length) return;
  for (const row of writes) a.assertEditable(row.p);
  return () => {
    for (const row of writes) {
      const delta: Props = row.fill === undefined ? {} : {background: row.fill};
      for (const [side, line] of row.changes) {
        for (const field of fields) delta[`${key(side)}.${field}`] = line[field];
      }
      const reply = a.cellFormat(row.p, delta, true);
      if (!reply?.preservedNeighborBorders)
        throw Error("공유 테두리 변경을 확인할 수 없습니다. 원래 상태로 되돌렸습니다.");
    }
    for (const row of rows.values()) {
      const after = a.cellProps(row.p);
      const kept = {...row.before}, observed = {...after};
      if (row.changes.size || row.fill !== undefined) {
        delete kept.borderFillId; delete observed.borderFillId;
      }
      for (const [side, line] of row.changes) {
        if (!sameLine(after[key(side)], line)) throw Error("요청한 공유 테두리를 적용하지 못했습니다.");
        delete kept[key(side)]; delete observed[key(side)];
      }
      if (row.fill !== undefined) {
        if (row.fill === "none" ? after.fillType !== "none" :
            after.fillType !== "solid" || after.fillColor.toLowerCase() !== row.fill)
          throw Error("요청한 셀 배경을 적용하지 못했습니다.");
        for (const field of ["fillType", "fillColor", "patternColor", "patternType"]) {
          delete kept[field]; delete observed[field];
        }
      }
      if (JSON.stringify(observed) !== JSON.stringify(kept))
        throw Error("지정한 공유 테두리나 배경 외의 셀 속성이 달라져 적용을 취소했습니다.");
    }
  };
}
