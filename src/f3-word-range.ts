import type { RhwpAdapter } from './adapter.js';
import type { Position } from './model.js';

// Existing Core word APIs consume root-list stream positions, not logical
// body offsets. Resolve both ways and refuse an ambiguous object/field edge.
export function f3WordRange(a: RhwpAdapter, p: Position): [Position, Position] {
  a.validate(p);
  if (p.kind !== 'body') throw Error('낱말 반복 블록은 본문에서 사용하세요. 셀 블록은 기존 F3 확장을 사용합니다.');
  const text = a.textOffset(p), chars = [...a.text(p)];
  // No word under an empty/end/whitespace caret: retain that exact endpoint;
  // the next explicit F3 can still select its paragraph. Native affinity NV.
  if (text === chars.length || /\s/u.test(chars[text] ?? '')) return [{...p}, {...p}];
  if (a.logical(p, text) !== p.offset)
    throw Error('개체 경계의 정확한 낱말 위치를 확인할 수 없습니다. 기존 선택을 유지합니다.');
  let para = p.para;
  for (let sec = 0; sec < p.sec; sec++) para += a.doc.getParagraphCount(sec);
  const stops = a.call<number[]>('getCaretStops', 0, para);
  const index = (pos: number) => a.call<{charIndex:number}>('getCharIndexAtStreamPos', 0, para, pos).charIndex;
  if (!Array.isArray(stops) || !stops.length || stops.some((n,i) => !Number.isSafeInteger(n) || n < 0 || (i > 0 && n <= stops[i-1])))
    throw Error('본문 낱말의 스트림 경계를 조회할 수 없습니다.');
  // Monotone Core mapping; do not assume stream units equal Unicode scalars.
  let lo = 0, hi = stops.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (index(stops[mid]) < text) lo = mid + 1; else hi = mid; }
  const pos = stops[lo];
  if (pos === undefined || index(pos) !== text || (lo + 1 < stops.length && index(stops[lo+1]) === text))
    throw Error('필드·개체와 같은 글자 경계의 낱말 선택은 아직 지원하지 않습니다. 기존 선택을 유지합니다.');
  const starts = a.call<number[]>('getWordStarts', 0, para);
  if (!Array.isArray(starts) || starts.some((n,i) => !Number.isSafeInteger(n) || n < 0 || (i > 0 && n <= starts[i-1])))
    throw Error('본문 낱말 시작을 조회할 수 없습니다.');
  const from = starts.filter(n => n <= pos).at(-1), to = a.call<number | null>('getWordEnd', 0, para, pos);
  if (from === undefined || !Number.isSafeInteger(to) || to! < pos || from > pos || !stops.includes(from) || !stops.includes(to!))
    throw Error('지원되는 정확한 낱말 끝점을 확인할 수 없습니다. 기존 선택을 유지합니다.');
  const begin = index(from), end = index(to!);
  if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin > text || end <= text || end > chars.length || chars.slice(begin,end).some(ch => /\s/u.test(ch)))
    throw Error('낱말의 문자 범위가 현재 본문과 일치하지 않습니다.');
  const range: [Position,Position] = [{...p,offset:a.logical(p,begin)},{...p,offset:a.logical(p,end)}];
  for (const q of range) a.validate(q);
  return range;
}
