import type { RhwpAdapter } from './adapter.js';
import { type Position, type Selection, ordered, sameContainer } from './model.js';
import { fragmentClipboardObjects, prepareObjectCut, selectedCutObject } from './object-clipboard.js';

// Cell offsets remain Unicode scalars. Only a picture strictly between two
// text boundaries is unambiguous here; no synthetic object character/slot.
export function mixedCellPictures(a: RhwpAdapter, from: Position, to: Position) {
  if (from.kind !== 'cell' || to.kind !== 'cell' || !sameContainer(from, to) ||
      from.cellPara !== to.cellPara || from.offset >= to.offset) return [];
  const list = a.list(from).listId;
  const controls = a.call<any[]>('getControls').filter(c => c.list === list && c.para === from.cellPara);
  if (!controls.some(c => c.ctrlId === 'gso' && c.userDesc === '그림' && c.props?.TreatAsChar === 1)) return [];
  return fragmentClipboardObjects(a).filter(row => row.kind === '그림' && row.props.treatAsChar &&
    row.focus.kind === 'cell' && sameContainer(from, row.focus) && row.focus.cellPara === from.cellPara &&
    from.offset < row.anchor && row.anchor < to.offset);
}

export function assertMixedCellPictureRange(a: RhwpAdapter, from: Position, to: Position) {
  if (from.kind !== 'cell' || to.kind !== 'cell' || !sameContainer(from, to) ||
      from.cellPara !== to.cellPara || from.offset >= to.offset) return;
  const list = a.list(from).listId;
  const controls = a.call<any[]>('getControls').filter(c => c.list === list && c.para === from.cellPara);
  if (!controls.some(c => c.ctrlId === 'gso' && c.userDesc === '그림' && c.props?.TreatAsChar === 1)) return;
  // Inspect the owner before filtering by anchor. With several controls the
  // existing stream-position getter can undercount a later picture's scalar
  // anchor (AB[pic]CD[pic]EF: 3 instead of 4). Filtering first let [3,5)
  // fall through to text-only copy/delete, silently omitting the second picture.
  // Do not repair Core addresses by counting objects or weakening capture.
  if (controls.length !== 1)
    throw Error('복수 개체 셀의 정확한 문자 경계가 아직 지원되지 않아 복사·잘라내기·삭제를 거절합니다. 원문을 보존합니다.');
  const rows = fragmentClipboardObjects(a).filter(row => row.kind === '그림' && row.props.treatAsChar &&
    row.focus.kind === 'cell' && sameContainer(from,row.focus) && row.focus.cellPara === from.cellPara);
  if (rows.length !== 1) throw Error('셀 그림의 정확한 소유 경계를 확인할 수 없습니다.');
  if (from.offset === rows[0].anchor || to.offset === rows[0].anchor)
    throw Error('그림과 같은 문자 경계의 앞뒤 선택이 아직 지원되지 않습니다. 원문을 보존합니다.');
  if (!(from.offset < rows[0].anchor && rows[0].anchor < to.offset)) return;
  // A single inline picture strictly inside the scalar endpoints is covered
  // by the matched Core partial-paragraph clip/digest contract. Boundary ties
  // and multiple controls are not admitted by this path.
  if (rows[0].locked) throw Error('잠긴 그림은 셀 블록에서 편집할 수 없습니다.');
  return rows[0];
}

export function prepareMixedCellPictureRemoval(a: RhwpAdapter, from: Position, to: Position) {
  const row = assertMixedCellPictureRange(a, from, to);
  if (!row) return;
  const selection: Selection = {kind:'object', focus:row.focus, control:row.control};
  // Existing owner/path identity, resource and neighbor checks and rollback
  // run within the caller's one History transaction, before scalar text removal.
  return prepareObjectCut(a, selection, selectedCutObject(a, selection));
}

function pictureBoxes(a: RhwpAdapter, rows: ReturnType<typeof mixedCellPictures>) {
  if (!rows.length) return [];
  const keys = rows.map(row => JSON.stringify([row.sec,row.para,
    ...JSON.parse(row.path).flatMap((p:any) => [p.controlIndex,p.cellIndex,p.cellParaIndex]),row.control]));
  const boxes = [];
  for(let page=0;page<a.pageCount;page++) for(const c of a.call('getPageControlLayout',page).controls ?? []) {
    if(c.type !== 'image' || !keys.includes(JSON.stringify(c.stableIndex))) continue;
    if(![c.x,c.y,c.w,c.h].every(Number.isFinite) || c.w<=0 || c.h<=0)
      throw Error('선택 그림의 표시 범위를 확인할 수 없습니다.');
    boxes.push({pageIndex:page,x:c.x,y:c.y,width:c.w,height:c.h});
  }
  return boxes;
}

export function mixedCellPictureBoxes(a: RhwpAdapter, s: Selection) {
  if (s.kind !== 'text') return [];
  const [from,to] = ordered(s.anchor,s.focus);
  return pictureBoxes(a,mixedCellPictures(a,from,to));
}

// A cell drag may cross an inline picture whose Core hit currently falls back
// to the enclosing body paragraph. Exact owner + stable layout identity can
// reject that owner change without inventing a scalar position inside an image.
export function ownsMixedCellPictureHit(a: RhwpAdapter, origin: Position, page: number, x: number, y: number) {
  if (origin.kind !== 'cell') return false;
  const rows = fragmentClipboardObjects(a).filter(row => row.kind === '그림' && row.props.treatAsChar &&
    row.focus.kind === 'cell' && sameContainer(origin,row.focus) && row.focus.cellPara === origin.cellPara);
  return pictureBoxes(a,rows).some(b => b.pageIndex === page &&
    x >= b.x && x <= b.x+b.width && y >= b.y && y <= b.y+b.height);
}
