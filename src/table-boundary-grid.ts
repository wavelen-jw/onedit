import type { CellBox } from './model.js';
// Observed Hancom reference: a two-column header merged horizontally, followed
// by two ordinary cells. Only the lower internal vertical segment is admitted.
export function lowerPairGrid(cells: CellBox[]): boolean {
  return cells.length === 3 && cells.every(c => c.rowSpan === 1) &&
    cells.filter(c => c.row === 0 && c.col === 0 && c.colSpan === 2).length === 1 &&
    cells.filter(c => c.row === 1 && c.col === 0 && c.colSpan === 1).length === 1 &&
    cells.filter(c => c.row === 1 && c.col === 1 && c.colSpan === 1).length === 1;
}
