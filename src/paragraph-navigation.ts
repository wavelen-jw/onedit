import type { RhwpAdapter } from './adapter.js';
import { paraIndex, withPara, type Position } from './model.js';

// Hancom MoveNextParaBegin / MovePrevParaBegin: adjacent paragraph start,
// current owner only; direction0 reuses the exact current paragraph start for Alt+Home. Core bounds are stream positions, not scalar offsets.
export function paragraphPosition(a: RhwpAdapter, p: Position, direction: -1 | 0 | 1): Position {
  a.validate(p);
  const index = paraIndex(p) + direction;
  // Do not turn a current-list boundary into a section/cell/parent traversal.
  if (index < 0 || index >= a.count(p)) return {...p};
  const target = {...withPara(p,index),offset:0};
  a.validate(target);
  let para = index;
  const list = p.kind === 'cell' ? a.list(target).listId : 0;
  if (p.kind === 'body')
    for (let sec = 0; sec < p.sec; sec++) para += a.doc.getParagraphCount(sec);
  const controls = a.call<any[]>('getControls').filter(c => c.list === list && c.para === para);
  if (controls.some(c => !['secd','cold','head','foot'].includes(c.ctrlId)))
    throw Error('필드·개체가 있는 대상 문단의 정확한 시작 위치는 아직 연결되지 않았습니다. 기존 선택을 유지합니다.');
  const bounds = a.call<{start:number;end:number}>('getParaBounds',list,para);
  const stops = a.call<number[]>('getCaretStops',list,para);
  if (!Number.isSafeInteger(bounds.start) || !Number.isSafeInteger(bounds.end) ||
      bounds.start < 0 || bounds.end < bounds.start || !Array.isArray(stops) ||
      !stops.length || stops[0] !== bounds.start || stops.at(-1) !== bounds.end ||
      stops.some((n,i) => !Number.isSafeInteger(n) || n < 0 || i > 0 && n <= stops[i-1]))
    throw Error('현재 소유 문단의 시작·끝 캐럿 경계를 조회할 수 없습니다. 기존 선택을 유지합니다.');
  const scalar = a.call<{charIndex:number}>('getCharIndexAtStreamPos',list,para,bounds.start).charIndex;
  const end = a.call<{charIndex:number}>('getCharIndexAtStreamPos',list,para,bounds.end).charIndex;
  if (scalar !== 0 || end !== [...a.text(target)].length ||
      a.logical(target,scalar) !== 0 || a.textOffset(target) !== scalar ||
      a.logical(target,end) !== a.length(target))
    throw Error('문단 시작의 스트림·문자·논리 위치가 일치하지 않습니다. 기존 선택을 유지합니다.');
  return target;
}
