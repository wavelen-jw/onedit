import type { RhwpAdapter } from './adapter.js';
import type { Position } from './model.js';
import {bodyWordParagraph, orderedWordBoundaries, wordStream} from './word-stream.js';
import { f3WordRange } from './f3-word-range.js';

// Read-only lowering of existing root-list word/caret queries. The accepted
// F3 helper stays unchanged; in particular its missing-tab-start guard remains.
export function wordPosition(a: RhwpAdapter, p: Position, direction: -1 | 1): Position {
  a.validate(p);
  if (p.kind === 'cell') return cellWordPosition(a,p,direction);
  if (p.kind !== 'body') throw Error('단어 이동은 본문 텍스트에서 사용하세요. 셀·개체 선택은 유지됩니다.');
  const para = bodyWordParagraph(a, p);
  const controls = a.call<any[]>('getControls').filter(c => c.list === 0 && c.para === para);
  if (controls.some(c => !['secd','cold','head','foot'].includes(c.ctrlId)))
    throw Error('필드·표·그림 등 개체가 있는 문단의 정확한 단어 이동 경계는 아직 연결되지 않았습니다. 기존 선택을 유지합니다.');
  const chars = [...a.text(p)], offset = a.textOffset(p);
  if (a.logical(p, offset) !== p.offset || a.logical(p, chars.length) !== a.length(p))
    throw Error('본문 단어의 정확한 논리 위치를 확인할 수 없습니다. 기존 선택을 유지합니다.');
  if (!chars.length) return {...p};
  // Do not let a new consumer silently bypass the known missing word start.
  f3WordRange(a, p);
  const {stops, scalar, uniqueStop} = wordStream(a, 0, para, chars.length);
  const starts = a.call<number[]>('getWordStarts', 0, para);
  if (!orderedWordBoundaries(starts) || !starts.length || starts.some(n => !stops.includes(n)))
    throw Error('본문 단어의 캐럿 경계를 조회할 수 없습니다. 기존 선택을 유지합니다.');
  const origin = uniqueStop(offset);
  if (origin === undefined)
    throw Error('같은 문자 위치의 단어 캐럿 경계가 모호합니다. 기존 선택을 유지합니다.');
  if (scalar(starts[0]) !== 0 || scalar(starts.at(-1)!) !== chars.length)
    throw Error('현재 문단의 단어 처음·끝을 확인할 수 없습니다.');
  const stream = direction > 0 ? starts.find(n => n > origin) ?? origin : starts.findLast(n => n < origin) ?? origin;
  const target = scalar(stream);
  if (uniqueStop(target) !== stream) throw Error('단어 끝점이 정확한 본문 캐럿 위치가 아닙니다.');
  // Independent validation of Core's documented whitespace-chunk contract.
  // This value is only an oracle: NEVER use it as a replacement destination.
  if (target !== whitespaceWordStart(chars, offset, direction))
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
  const {stops, scalar: indexAt} = wordStream(a, list, para, chars.length);
  const starts = a.call<number[]>('getWordStarts', list, para);
  if (!orderedWordBoundaries(starts) || !starts.length || stops.length !== chars.length + 1 ||
      starts.some(n => !stops.includes(n)))
    throw Error('셀의 정확한 단어·캐럿 경계를 조회할 수 없습니다.');
  const scalar = (stream: number) => {
    const index = indexAt(stream);
    if (stops[index] !== stream)
      throw Error('셀 단어의 스트림·문자 경계가 모호합니다. 기존 선택을 유지합니다.');
    return index;
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
  if (target !== whitespaceWordStart(chars, p.offset, direction)) throw Error('Core 셀 단어 시작 경계가 누락되었습니다. 기존 선택을 유지합니다.');
  const position = {...p,offset:target};
  a.validate(position);
  return position;
}

function whitespaceWordStart(chars: string[], offset: number, direction: -1 | 1) {
  for (let i = offset + direction; i > 0 && i < chars.length; i += direction)
    if (/\s/u.test(chars[i-1]) && !/\s/u.test(chars[i])) return i;
  return direction > 0 ? chars.length : 0;
}
