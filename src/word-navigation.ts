import type { RhwpAdapter } from './adapter.js';
import type { Position } from './model.js';
import { f3WordRange } from './f3-word-range.js';

// Read-only lowering of existing root-list word/caret queries. The accepted
// F3 helper stays unchanged; in particular its missing-tab-start guard remains.
export function wordPosition(a: RhwpAdapter, p: Position, direction: -1 | 1): Position {
  a.validate(p);
  if (p.kind === 'cell') return cellWordPosition(a,p,direction);
  if (p.kind !== 'body') throw Error('단어 이동은 본문 텍스트에서 사용하세요. 셀·개체 선택은 유지됩니다.');
  let para = p.para;
  for (let sec = 0; sec < p.sec; sec++) para += a.doc.getParagraphCount(sec);
  const controls = a.call<any[]>('getControls').filter(c => c.list === 0 && c.para === para);
  if (controls.some(c => !['secd','cold','head','foot'].includes(c.ctrlId)))
    throw Error('필드·표·그림 등 개체가 있는 문단의 정확한 단어 이동 경계는 아직 연결되지 않았습니다. 기존 선택을 유지합니다.');
  const chars = [...a.text(p)], offset = a.textOffset(p);
  if (a.logical(p, offset) !== p.offset || a.logical(p, chars.length) !== a.length(p))
    throw Error('본문 단어의 정확한 논리 위치를 확인할 수 없습니다. 기존 선택을 유지합니다.');
  if (!chars.length) return {...p};
  // Do not let a new consumer silently bypass the known missing word start.
  f3WordRange(a, p);
  const valid = (rows: number[]) => Array.isArray(rows) && rows.length > 0 &&
    rows.every((n,i) => Number.isSafeInteger(n) && n >= 0 && (!i || n > rows[i-1]));
  const stops = a.call<number[]>('getCaretStops', 0, para), starts = a.call<number[]>('getWordStarts', 0, para);
  if (!valid(stops) || !valid(starts) || starts.some(n => !stops.includes(n)))
    throw Error('본문 단어의 캐럿 경계를 조회할 수 없습니다. 기존 선택을 유지합니다.');
  const scalar = (stream: number) => {
    const value = a.call<{charIndex:number}>('getCharIndexAtStreamPos', 0, para, stream).charIndex;
    if (!Number.isSafeInteger(value) || value < 0 || value > chars.length)
      throw Error('단어의 스트림·문자 위치가 현재 문서와 일치하지 않습니다.');
    return value;
  };
  const streamAt = (text: number) => {
    let lo = 0, hi = stops.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (scalar(stops[mid]) < text) lo = mid + 1; else hi = mid; }
    const stream = stops[lo];
    if (stream === undefined || scalar(stream) !== text || (lo + 1 < stops.length && scalar(stops[lo+1]) === text))
      throw Error('같은 문자 위치의 단어 캐럿 경계가 모호합니다. 기존 선택을 유지합니다.');
    return stream;
  };
  const origin = streamAt(offset);
  if (scalar(starts[0]) !== 0 || scalar(starts.at(-1)!) !== chars.length)
    throw Error('현재 문단의 단어 처음·끝을 확인할 수 없습니다.');
  const stream = direction > 0 ? starts.find(n => n > origin) ?? origin : starts.findLast(n => n < origin) ?? origin;
  const target = scalar(stream);
  if (streamAt(target) !== stream) throw Error('단어 끝점이 정확한 본문 캐럿 위치가 아닙니다.');
  // Independent validation of Core's documented whitespace-chunk contract.
  // This value is only an oracle: NEVER use it as a replacement destination.
  let expected = direction > 0 ? chars.length : 0;
  if (direction > 0) {
    for (let i = offset + 1; i < chars.length; i++)
      if (/\s/u.test(chars[i-1]) && !/\s/u.test(chars[i])) { expected = i; break; }
  } else {
    for (let i = offset - 1; i > 0; i--)
      if (/\s/u.test(chars[i-1]) && !/\s/u.test(chars[i])) { expected = i; break; }
  }
  if (target !== expected)
    throw Error('Core 단어 시작 경계가 누락되거나 일치하지 않습니다. 기존 선택을 유지합니다.');
  const position: Position = {...p, offset:a.logical(p,target)};
  a.validate(position);
  return position;
}

// The owner-bound list is resolved anew from the complete existing cell path.
// Its text offsets are scalars; stream units still come only from Core queries.
function cellWordPosition(a: RhwpAdapter, p: Extract<Position,{kind:'cell'}>, direction: -1 | 1): Position {
  const list = a.list(p).listId, para = p.cellPara, chars = [...a.text(p)];
  if (a.call<any[]>('getControls').some(c => c.list === list && c.para === para))
    throw Error('셀 개체·필드 경계의 단어 이동은 아직 연결되지 않았습니다. 기존 선택을 유지합니다.');
  if (!chars.length) return {...p};
  const valid = (rows: number[]) => Array.isArray(rows) && rows.length > 0 &&
    rows.every((n,i) => Number.isSafeInteger(n) && n >= 0 && (!i || n > rows[i-1]));
  const stops = a.call<number[]>('getCaretStops',list,para), starts = a.call<number[]>('getWordStarts',list,para);
  if (!valid(stops) || !valid(starts) || stops.length !== chars.length + 1 || starts.some(n => !stops.includes(n)))
    throw Error('셀의 정확한 단어·캐럿 경계를 조회할 수 없습니다.');
  const scalar = (stream: number) => {
    const value = a.call<{charIndex:number}>('getCharIndexAtStreamPos',list,para,stream).charIndex;
    if (!Number.isSafeInteger(value) || value < 0 || value > chars.length || stops[value] !== stream)
      throw Error('셀 단어의 스트림·문자 경계가 모호합니다. 기존 선택을 유지합니다.');
    return value;
  };
  const origin = stops[p.offset];
  if (scalar(origin) !== p.offset || scalar(starts[0]) !== 0 || scalar(starts.at(-1)!) !== chars.length)
    throw Error('셀 문단의 단어 처음·끝이 현재 소유 문단과 일치하지 않습니다.');
  if (p.offset < chars.length && !/\s/u.test(chars[p.offset])) {
    const begin = scalar(starts.findLast(n => n <= origin)!);
    const end = a.call<number|null>('getWordEnd',list,para,origin);
    if (!Number.isSafeInteger(end) || !stops.includes(end!) || begin > p.offset || scalar(end!) <= p.offset || chars.slice(begin,scalar(end!)).some(ch => /\s/u.test(ch)))
      throw Error('Core 셀 단어 시작 경계가 누락되었습니다. 기존 선택을 유지합니다.');
  }
  const stream = direction > 0 ? starts.find(n => n > origin) ?? origin : starts.findLast(n => n < origin) ?? origin;
  const target = scalar(stream);
  let expected = direction > 0 ? chars.length : 0;
  if (direction > 0) {
    for (let i = p.offset + 1; i < chars.length; i++)
      if (/\s/u.test(chars[i-1]) && !/\s/u.test(chars[i])) { expected = i; break; }
  } else {
    for (let i = p.offset - 1; i > 0; i--)
      if (/\s/u.test(chars[i-1]) && !/\s/u.test(chars[i])) { expected = i; break; }
  }
  if (target !== expected) throw Error('Core 셀 단어 시작 경계가 누락되었습니다. 기존 선택을 유지합니다.');
  const position = {...p,offset:target};
  a.validate(position);
  return position;
}
