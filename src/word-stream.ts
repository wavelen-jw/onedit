import type { RhwpAdapter } from './adapter.js';
import type { Position } from './model.js';

export function bodyWordParagraph(a: RhwpAdapter, p: Position) {
  let para = p.para;
  for (let sec = 0; sec < p.sec; sec++) para += a.doc.getParagraphCount(sec);
  return para;
}

export function orderedWordBoundaries(values: unknown): values is number[] {
  return Array.isArray(values) && values.every((value, index) =>
    Number.isSafeInteger(value) && value >= 0 && (!index || value > values[index - 1]));
}

/** Core stream positions and Unicode scalar offsets need not have the same units. */
export function wordStream(a: RhwpAdapter, list: number, para: number, length: number) {
  const stops = a.call<number[]>('getCaretStops', list, para);
  if (!orderedWordBoundaries(stops) || !stops.length)
    throw Error('단어의 캐럿 경계를 조회할 수 없습니다. 기존 선택을 유지합니다.');

  const scalar = (stream: number) => {
    const index = a.call<{charIndex: number}>('getCharIndexAtStreamPos', list, para, stream).charIndex;
    if (!Number.isSafeInteger(index) || index < 0 || index > length)
      throw Error('단어의 스트림·문자 위치가 현재 문서와 일치하지 않습니다.');
    return index;
  };
  const uniqueStop = (index: number) => {
    let low = 0, high = stops.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (scalar(stops[mid]) < index) low = mid + 1;
      else high = mid;
    }
    const stream = stops[low];
    if (stream === undefined || scalar(stream) !== index ||
        (low + 1 < stops.length && scalar(stops[low + 1]) === index)) return;
    return stream;
  };
  return {stops, scalar, uniqueStop};
}
