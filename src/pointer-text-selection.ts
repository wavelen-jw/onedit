import type {RhwpAdapter} from './adapter.js';
import {paraIndex, sameContainer, type Position} from './model.js';
import {bodyWordRange as coreBodyWordRange} from './f3-word-range.js';
import {bodyWordParagraph} from './word-stream.js';

type ControlOwner = {
  list: number;
  para: number;
  ctrlId: string;
  props?: { TreatAsChar?: number };
};

function controlsAt(a: RhwpAdapter, p: Position): ControlOwner[] {
  const para = p.kind === 'body' ? bodyWordParagraph(a, p) : paraIndex(p);
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
export function pointerTextRange(a: RhwpAdapter, page: number, x: number, y: number, unit: 'word' | 'sentence' | 'touch-word'): [Position,Position] | undefined {
  const p = glyphAtPoint(a, page, x, y);
  if (!p) return;
  const controls = controlsAt(a, p);
  if (controls.some(c => p.kind === 'cell' || !['secd', 'cold', 'tbl', 'gso'].includes(c.ctrlId))) return;
  if (unit !== 'sentence' && p.kind === 'body') return bodyWordRange(a, p, controls, unit === 'word');

  const text = a.text(p);
  const chars = [...text];
  const clicked = chars.slice(0, a.textOffset(p)).join('').length;
  const segment = new Intl.Segmenter('ko', {granularity:unit === 'touch-word' ? 'word' : 'sentence'}).segment(text).containing(clicked);
  if (!segment) return;
  const first = [...text.slice(0, segment.index)].length;
  let from = a.logical(p, first);
  const to = a.logical(p, first + [...segment.segment.trimEnd()].length);
  // Skip object slots immediately before the selected text. Never carry
  // an object inside a text-only selection.
  while (from < to && a.textOffset(p, from + 1) === first) from++;
  for (let n = from; n < to; n++)
    if (a.textOffset(p, n + 1) === a.textOffset(p, n)) return;
  return textRange(a, p, from, to, controls);
}

function bodyWordRange(a: RhwpAdapter, p: Extract<Position, {kind: 'body'}>, controls: ControlOwner[], includeFollowingSpace: boolean): [Position,Position] | undefined {
  const afterObject = a.logical(p,a.textOffset(p)) !== p.offset;
  const [begin,end]=coreBodyWordRange(a,p,afterObject),chars=[...a.text(p)],length=a.length(p);
  let from=begin.offset,to=end.offset;
  // Zero scalar advance is an existing logical control slot. Clip around the
  // clicked word owner; a word query must never drag an object into this range.
  for(let offset=from;offset<to;offset++)if(a.textOffset(p,offset+1)===a.textOffset(p,offset)){
    if(offset<p.offset)from=offset+1;else{to=offset;break;}
  }
  let text=a.textOffset(p,to);
  // Only literal ordinary spaces are newly included. Tabs, NBSP, punctuation,
  // paragraph boundaries and visual empty area retain the existing policy.
  while(includeFollowingSpace&&to<length&&chars[text]===' '&&a.textOffset(p,to+1)===text+1){to++;text++;}
  if(from>=to)return;
  return textRange(a, p, from, to, controls);
}
