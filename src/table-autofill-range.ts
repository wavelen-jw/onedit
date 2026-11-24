import type { RhwpAdapter } from './adapter.js';
import { sameTable, type Selection } from './model.js';

export function tableAutofillRange(
  adapter: RhwpAdapter,
  selection: Extract<Selection, {kind: 'cells'}>,
  topologyError: string,
) {
  if (!sameTable(selection.anchor, selection.focus))
    throw Error('같은 표의 연속된 셀 블록을 선택하세요.');
  const all = adapter.cells(selection.focus);
  const anchor = all.find(cell => cell.cellIdx === selection.anchor.cell);
  const focus = all.find(cell => cell.cellIdx === selection.focus.cell);
  if (!anchor || !focus || all.some(cell => cell.rowSpan !== 1 || cell.colSpan !== 1))
    throw Error(topologyError);
  const left = Math.min(anchor.col, focus.col), right = Math.max(anchor.col, focus.col);
  const top = Math.min(anchor.row, focus.row), bottom = Math.max(anchor.row, focus.row);
  const cells = all.filter(cell => cell.row >= top && cell.row <= bottom && cell.col >= left && cell.col <= right);
  if (cells.length !== (right - left + 1) * (bottom - top + 1) ||
      new Set(cells.map(cell => cell.cellIdx)).size !== cells.length)
    throw Error('정확한 사각형 셀 블록을 선택하세요.');
  return { all, cells: cells.sort((a, b) => right - left >= bottom - top
    ? a.row - b.row || a.col - b.col
    : a.col - b.col || a.row - b.row) };
}
