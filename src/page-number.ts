import type { RhwpAdapter } from './adapter.js';
import { coreRuntimeHasCapability } from './core-runtime.js';
import { copy, type Selection } from './model.js';

export type PageNumberKind = 'page' | 'total';
export const pageNumberLimit = '본문 커서에 현재 쪽 번호 또는 전체 쪽 수 자동 필드를 삽입합니다. 머리말·꼬리말/셀 내부, 쪽 아래 위치 지정·번호 모양·시작 번호 변경은 지원하지 않습니다.';

// The existing API consumes root-list stream units, whereas Studio stores
// logical positions. Ask the existing cursor API; never multiply UI offsets or
// manufacture an ID/visible digit. An ambiguous inline-object side is refused.
export function pageNumberTarget(a: RhwpAdapter, s: Selection) {
  if (!coreRuntimeHasCapability(a.doc, 'page-number'))
    throw Error('자동 쪽번호 표시·저장을 검증한 개발 Core가 아닙니다.');
  if (s.kind !== 'caret' || s.focus.kind !== 'body')
    throw Error('쪽 번호 필드는 본문 한 곳에 커서를 놓은 뒤 삽입하세요. 셀·범위 선택은 미지원입니다.');
  const p = s.focus;
  a.assertEditable(p);
  const para = Array.from({ length: p.sec }, (_, sec) => a.readStructural('getParagraphCount',sec))
    .reduce((n, count) => n + count, 0) + p.para;
  const controls = a.call<any[]>('getControls').filter(c => c.list === 0 && c.para === para);
  if (controls.some(c => c.props?.Lock || !['secd', 'cold', 'head', 'foot', 'gso', 'tbl', 'atno'].includes(c.ctrlId)))
    throw Error('보호되었거나 위치 계약을 확인하지 못한 컨트롤이 있는 문단입니다.');
  const text = a.textOffset(p);
  if (a.logical(p, text) !== p.offset)
    throw Error('인라인 개체와 같은 글자 경계입니다. 개체 바로 뒤 대신 본문 글자 사이에 커서를 놓으세요.');
  const stops = a.call<number[]>('getCaretStops', 0, para);
  if (!Array.isArray(stops) || stops.some(n => !Number.isSafeInteger(n) || n < 0))
    throw Error('본문 삽입 위치를 확인할 수 없습니다.');
  const candidates = stops.filter(pos => a.call('getCharIndexAtStreamPos', 0, para, pos).charIndex === text);
  // B's fixed before-controls insertion case has an explicit stream origin.
  const pos = p.offset === 0 && text === 0 ? 0 : candidates.length === 1 ? candidates[0] : undefined;
  if (pos === undefined || a.call('getCharIndexAtStreamPos', 0, para, pos).charIndex !== text)
    throw Error('본문의 정확한 스트림 위치가 불명확하여 삽입하지 않습니다.');
  return { para, pos, text, controls };
}

export function pageNumberReason(a: RhwpAdapter, s: Selection) {
  try { pageNumberTarget(a, s); return ''; }
  catch (error) { return String(error).replace(/^Error: /, ''); }
}

export function preparePageNumber(a: RhwpAdapter, s: Selection, kind: PageNumberKind): () => Selection {
  if (!['page', 'total'].includes(kind)) throw Error('지원하지 않는 쪽 번호 필드입니다.');
  const target = pageNumberTarget(a, s), p = s.focus;
  const before = [...a.text(p)];
  return () => {
    a.call('insertAutoNumberAtCursor', 0, target.para, target.pos, kind);
    const expected = [...before.slice(0, target.text), ' ', ...before.slice(target.text)].join('');
    if (a.text(p) !== expected) throw Error('쪽 번호 필드 삽입 후 본문 재조회가 일치하지 않습니다.');
    const after = a.call<any[]>('getControls').filter(c => c.list === 0 && c.para === target.para);
    const signature = (rows: any[]) => rows.map(c => [c.ctrlId, c.ctrlCh, c.props]);
    const added = after.filter((_, n) => JSON.stringify(signature(after.filter((_, i) => i !== n))) === JSON.stringify(signature(target.controls)));
    if (after.length !== target.controls.length + 1 || !added.some(c => c.ctrlId === 'atno'))
      throw Error('자동 번호 컨트롤 또는 기존 개체 순서가 일치하지 않습니다.');
    return { kind: 'caret', focus: { ...copy(p), offset: p.offset + 1 } };
  };
}
