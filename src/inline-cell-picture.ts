import type { RhwpAdapter } from './adapter.js';
import { samePosition, type Position, type Selection, type Box } from './model.js';
import { fragmentClipboardObjects } from './object-clipboard.js';

// A scalar-empty paragraph containing exactly one inline Picture has an exact
// existing object owner. This does not invent scalar slots for mixed cell text,
// multiple objects, Shape descendants or floating pictures.
export function inlineCellPicture(a: RhwpAdapter, p: Position) {
  if (p.kind !== 'cell' || p.offset !== 0 || a.length(p) !== 0) return;
  a.validate(p);
  const list = a.list(p).listId;
  const controls = a.call<any[]>('getControls').filter(c => c.list === list && c.para === p.cellPara);
  if (controls.length !== 1) return;
  const row = fragmentClipboardObjects(a).find(r => samePosition(r.focus, p) && r.control === controls[0].controlIndex);
  if (!row || row.kind !== '그림' || !row.props.treatAsChar || row.locked) return;
  return row;
}
export function inlineCellPictureBoxes(a: RhwpAdapter, s: Selection): Box[] {
  if (s.kind !== 'object' || s.focus.kind !== 'cell') return [];
  const row = inlineCellPicture(a, s.focus);
  if (!row || row.control !== s.control) return [];
  const path = JSON.parse(row.path), stable = [row.sec, row.para, ...path.flatMap((p: any) => [p.controlIndex, p.cellIndex, p.cellParaIndex]), row.control];
  const boxes: Box[] = [];
  for (let page = 0; page < a.pageCount; page++) {
    for (const c of a.call('getPageControlLayout', page).controls ?? []) {
      if (c.type !== 'image' || JSON.stringify(c.stableIndex) !== JSON.stringify(stable)) continue;
      if (![c.x,c.y,c.w,c.h].every(Number.isFinite) || c.w <= 0 || c.h <= 0)
        throw Error('셀 그림의 표시 위치가 유효하지 않습니다.');
      boxes.push({pageIndex:page,x:c.x,y:c.y,width:c.w,height:c.h});
    }
  }
  return boxes;
}
export function crossesPicture(box: Box, page: number, x0: number, y0: number, x1: number, y1: number) {
  if (box.pageIndex !== page || Math.hypot(x1-x0,y1-y0) < 4) return false;
  // Segment/rectangle clipping: crossing either side or dragging inside the
  // picture selects the same owner, in both directions, without character math.
  let lo=0, hi=1;
  for (const [origin,delta,min,max] of [[x0,x1-x0,box.x,box.x+box.width],[y0,y1-y0,box.y,box.y+box.height]]) {
    if (delta===0) {if(origin<min || origin>max)return false;continue;}
    const a=(min-origin)/delta,b=(max-origin)/delta;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
  }
  return lo<=hi;
}
