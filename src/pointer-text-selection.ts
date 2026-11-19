import type {RhwpAdapter} from './adapter.js';
import {paraIndex, sameContainer, type Position} from './model.js';
import {f3WordRange} from './f3-word-range.js';

// Core text-to-logical positions use before-object affinity. A real rendered
// glyph can prove the after-object owner instead. Reuse the same Core word
// queries as F3, but require a UNIQUE stream caret for this exact scalar; do not
// assume caret-stop count equals logical length (inline slots need not appear).
function wordRangeAtGlyph(a:RhwpAdapter,p:Position):[Position,Position]{
  const scalar=a.textOffset(p);
  if(a.logical(p,scalar)===p.offset)return f3WordRange(a,p);
  let para=p.para;for(let sec=0;sec<p.sec;sec++)para+=a.doc.getParagraphCount(sec);
  const chars=[...a.text(p)],stops=a.call<number[]>('getCaretStops',0,para);
  if(!Array.isArray(stops)||!stops.length||stops.some((n,i)=>!Number.isSafeInteger(n)||n<0||(i>0&&n<=stops[i-1])))throw Error('개체 인접 단어의 캐럿 조회 불일치');
  const index=(stream:number)=>{const n=a.call<{charIndex:number}>('getCharIndexAtStreamPos',0,para,stream).charIndex;if(!Number.isSafeInteger(n)||n<0||n>chars.length)throw Error('개체 인접 단어의 문자 조회 불일치');return n;};
  let lo=0,hi=stops.length;while(lo<hi){const mid=(lo+hi)>>>1;if(index(stops[mid])<scalar)lo=mid+1;else hi=mid;}
  const origin=stops[lo];
  if(origin===undefined||index(origin)!==scalar||(lo+1<stops.length&&index(stops[lo+1])===scalar))throw Error('개체 인접 단어의 스트림 위치가 모호합니다.');
  const starts=a.call<number[]>('getWordStarts',0,para);
  if(!Array.isArray(starts)||starts.some((n,i)=>!Number.isSafeInteger(n)||n<0||(i>0&&n<=starts[i-1])||!stops.includes(n)))throw Error('개체 인접 단어 경계 조회 불일치');
  const start=starts.findLast(n=>n<=origin),end=a.call<number|null>('getWordEnd',0,para,origin);
  if(start===undefined||!Number.isSafeInteger(end)||!stops.includes(end!))throw Error('개체 인접 단어 끝 조회 불일치');
  const from=index(start),to=index(end!);
  if(from>scalar||to<=scalar||chars.slice(from,to).some(ch=>/\s/u.test(ch)))throw Error('개체 인접 단어 범위를 확인할 수 없습니다.');
  return[{...p,offset:a.logical(p,from)},{...p,offset:a.logical(p,to)}];
}

type ControlOwner = {
  list: number;
  para: number;
  ctrlId: string;
  props?: { TreatAsChar?: number };
};

function controlsAt(a: RhwpAdapter, p: Position): ControlOwner[] {
  let para = paraIndex(p);
  if (p.kind === 'body')
    for (let sec = 0; sec < p.sec; sec++) para += a.doc.getParagraphCount(sec);
  const list = p.kind === 'body' ? 0 : a.list(p).listId;
  return a.call<ControlOwner[]>('getControls').filter(c => c.list === list && c.para === para);
}

function glyphAtPoint(a: RhwpAdapter, page: number, x: number, y: number): Position | undefined {
  const hit = a.hit(page, x, y);
  let glyph: Position | undefined;
  for (const run of a.runs(page)) {
    if (y < run.y || y >= run.y + run.h || x < run.x || x >= run.x + run.w) continue;
    if (run.cellIdx === undefined && (run.controlIdx !== undefined || run.cellPath?.length)) continue;
    const chars = [...run.text];
    if (run.charX.length !== chars.length + 1) continue;
    for (let i = 0; i < chars.length; i++) {
      if (/\s/u.test(chars[i]) || x < run.x + run.charX[i] || x >= run.x + run.charX[i + 1]) continue;
      const p = a.position(run, run.charStart + i);
      if (!sameContainer(p, hit) || paraIndex(p) !== paraIndex(hit)) continue;
      const end = a.position(run, run.charStart + i + 1);
      if (hit.offset < p.offset || hit.offset > end.offset || [...a.text(p)][a.textOffset(p)] !== chars[i]) continue;
      if (glyph) return;
      glyph = p;
    }
  }
  if (glyph) a.validate(glyph);
  return glyph;
}

function textRange(a: RhwpAdapter, p: Position, from: number, to: number, controls: ControlOwner[]): [Position,Position] | undefined {
  if (from >= to) return;
  // Full-body paragraph ranges can implicitly include floating objects.
  if (from === 0 && to === a.length(p) &&
      controls.some(c => ['tbl', 'gso'].includes(c.ctrlId) && c.props?.TreatAsChar !== 1)) return;
  const range: [Position,Position] = [{...p, offset: from}, {...p, offset: to}];
  range.forEach(q => a.validate(q));
  return range;
}

/** Deliberate text gestures only. A click on an object or a cell border has its own owner. */
export function pointerTextRange(a: RhwpAdapter, page: number, x: number, y: number, unit: 'word' | 'sentence'): [Position,Position] | undefined {
  const p = glyphAtPoint(a, page, x, y);
  if (!p) return;
  const controls = controlsAt(a, p);
  if (controls.some(c => p.kind === 'cell' || !['secd', 'cold', 'tbl', 'gso'].includes(c.ctrlId))) return;
  if (unit === 'word' && p.kind === 'body') return bodyWordRange(a, p, controls);

  const text = a.text(p);
  const chars = [...text];
  const clicked = chars.slice(0, a.textOffset(p)).join('').length;
  const sentence = new Intl.Segmenter('ko', {granularity:'sentence'}).segment(text).containing(clicked);
  if (!sentence) return;
  const first = [...text.slice(0, sentence.index)].length;
  let from = a.logical(p, first);
  const to = a.logical(p, first + [...sentence.segment.trimEnd()].length);
  // Skip object slots immediately before the selected text. Never carry
  // an object inside a text-only selection.
  while (from < to && a.textOffset(p, from + 1) === first) from++;
  for (let n = from; n < to; n++)
    if (a.textOffset(p, n + 1) === a.textOffset(p, n)) return;
  return textRange(a, p, from, to, controls);
}

function bodyWordRange(a: RhwpAdapter, p: Position, controls: ControlOwner[]): [Position,Position] | undefined {
  const [begin,end]=wordRangeAtGlyph(a,p),chars=[...a.text(p)],length=a.length(p);
  let from=begin.offset,to=end.offset;
  // Zero scalar advance is an existing logical control slot. Clip around the
  // clicked word owner; a word query must never drag an object into this range.
  for(let offset=from;offset<to;offset++)if(a.textOffset(p,offset+1)===a.textOffset(p,offset)){
    if(offset<p.offset)from=offset+1;else{to=offset;break;}
  }
  let text=a.textOffset(p,to);
  // Only literal ordinary spaces are newly included. Tabs, NBSP, punctuation,
  // paragraph boundaries and visual empty area retain the existing policy.
  while(to<length&&chars[text]===' '&&a.textOffset(p,to+1)===text+1){to++;text++;}
  if(from>=to)return;
  return textRange(a, p, from, to, controls);
}
