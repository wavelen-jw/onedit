import type { CellBox } from './model.js';

// Logical grid only: repeated page paint boxes are the same owned cell.
// Do not enlarge a row band through a vertically merged neighbour or guess
// missing cells. The existing two-endpoint Selection must represent it exactly.
export function cellColumnBlock(boxes:CellBox[],selected:number[]) {
  const swap=(c:CellBox):CellBox=>({...c,row:c.col,col:c.row,rowSpan:c.colSpan,colSpan:c.rowSpan});
  const result=cellRowBlock(boxes.map(swap),selected);
  // Interaction.cells uses the canonical row-major order.
  const ids=new Set(result.ids);
  return {...result,ids:[...new Map(boxes.map(c=>[c.cellIdx,c])).values()].filter(c=>ids.has(c.cellIdx)).sort((a,b)=>a.row-b.row||a.col-b.col).map(c=>c.cellIdx)};
}
export function cellRowBlock(boxes: CellBox[], selected: number[]) {
  const cells = new Map<number, CellBox>();
  const geometry = (c: CellBox) => [c.row, c.col, c.rowSpan, c.colSpan];
  const refuse = () => { throw Error('줄 전체 선택 범위를 정확히 확인할 수 없습니다. 병합 경계·셀 배치를 확인하세요. 기존 선택을 유지합니다.'); };
  for (const c of boxes) {
    if (!Number.isInteger(c.cellIdx) || c.cellIdx < 0 ||
        geometry(c).some(v => !Number.isSafeInteger(v)) || c.row < 0 || c.col < 0 || c.rowSpan < 1 || c.colSpan < 1) refuse();
    const old = cells.get(c.cellIdx);
    if (old && JSON.stringify(geometry(old)) !== JSON.stringify(geometry(c))) refuse();
    cells.set(c.cellIdx, c);
  }
  if (!selected.length || selected.some(id => !cells.has(id))) refuse();
  const all = [...cells.values()], source = selected.map(id => cells.get(id)!);
  const top = Math.min(...source.map(c => c.row)), bottom = Math.max(...source.map(c => c.row + c.rowSpan));
  const right = Math.max(...all.map(c => c.col + c.colSpan));
  const band = all.filter(c => c.row < bottom && c.row + c.rowSpan > top);
  if (band.some(c => c.row < top || c.row + c.rowSpan > bottom)) refuse();
  const cuts = [...new Set([top, bottom, ...band.flatMap(c => [c.row, c.row + c.rowSpan])])].sort((a,b) => a-b);
  for (const row of cuts.slice(0,-1)) {
    let end = 0;
    for (const c of band.filter(c => c.row <= row && c.row + c.rowSpan > row).sort((a,b) => a.col-b.col)) {
      if (c.col !== end) refuse();
      end = c.col + c.colSpan;
    }
    if (end !== right) refuse();
  }
  const anchor = band.find(c => c.row === top && c.col === 0);
  const focus = band.find(c => c.row + c.rowSpan === bottom && c.col + c.colSpan === right);
  if (!anchor || !focus) refuse();
  return { anchor: anchor!.cellIdx, focus: focus!.cellIdx, ids: band.sort((a,b) => a.row-b.row || a.col-b.col).map(c => c.cellIdx) };
}
