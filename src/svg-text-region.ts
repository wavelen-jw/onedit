import { separateSpaceMarkers } from './view-markers.js';

type Leaf = { start: number; end: number; node: SVGElement; parent: Node };
type Source = { markup: string; leaves: Leaf[] };
const sources = new WeakMap<SVGSVGElement, Source>();
const textPattern = /<text(?=\s|>)(?:"[^"]*"|'[^']*'|[^'">])*?>[^<]*<\/text\s*>|<(?:circle|line|path|rect)(?=\s|\/)(?:"[^"]*"|'[^']*'|[^'">])*?\/>/g;
const exceptionalXml = (value: string) => value.includes('<!') || value.includes('<?');

// Capture references before the existing screen-only space-marker projection.
// The source has already passed the complete XML/sanitizer/resource pipeline.
// This metadata neither owns a document nor survives the SVG's lifetime.
export function rememberSvgTextSource(svg: SVGSVGElement, markup: string): void {
  if (exceptionalXml(markup)) return;
  const spans = [...markup.matchAll(textPattern)];
  const nodes = [...svg.querySelectorAll<SVGElement>('text,circle,line,path,rect')];
  if (spans.length !== nodes.length || nodes.some(node => !node.parentNode)) return;
  sources.set(svg, { markup, leaves: spans.map((span, i) => ({
    start: span.index!, end: span.index! + span[0].length, node: nodes[i], parent: nodes[i].parentNode!,
  })) });
}

// Only plain drawing leaves, separated by XML whitespace, form a patch. A group,
// definition, resource, namespace or complex-text change takes the full parser.
function plainTexts(value: string): boolean {
  let end = 0, found = false;
  for (const match of value.matchAll(textPattern)) {
    if (!/^[\t\r\n ]*$/.test(value.slice(end, match.index))) return false;
    end = match.index! + match[0].length; found = true;
  }
  return found && /^[\t\r\n ]*$/.test(value.slice(end));
}
const safeAttributes = new Set([
  'x', 'y', 'dx', 'dy', 'font-family', 'font-size', 'font-weight', 'font-style',
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'opacity', 'textLength', 'lengthAdjust',
  'xml:space', 'transform', 'letter-spacing', 'word-spacing', 'text-anchor',
  'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'rx', 'ry', 'width', 'height', 'd',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule',
]);
function independentLeaf(node: SVGElement): boolean {
  return node.namespaceURI === 'http://www.w3.org/2000/svg' &&
    (node.localName === 'text' ? node.childNodes.length === 1 && node.firstChild?.nodeType === Node.TEXT_NODE :
      ['circle','line','path','rect'].includes(node.localName) && node.childNodes.length === 0) &&
    [...node.attributes].every(attr => safeAttributes.has(attr.name) &&
      (attr.namespaceURI === null || attr.namespaceURI === 'http://www.w3.org/XML/1998/namespace'));
}

// A scalar coordinate is the only new source admitted without XML parsing.
// Everything else, including quoting/entities/styles/text, must be identical
// to a fully validated leaf in this very same, unmodified parent/instance.
function positionedText(raw: string): { key: string; x: string; y: string } | undefined {
  const opening = /^<text(?=\s|>)(?:"[^"]*"|'[^']*'|[^'">])*?>/.exec(raw);
  if (!opening) return;
  const tag = opening[0], values: string[] = [];
  const key = tag.replace(/\s+([^\s=/'"<>]+)\s*=\s*("[^"]*"|'[^']*')/g, (all, name, quoted) => {
    if ((name !== 'x' && name !== 'y') || quoted[0] !== '"') return all;
    const value = quoted.slice(1, -1);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) return all;
    values.push(name, value); return all.slice(0, -quoted.length) + '""';
  }) + raw.slice(tag.length);
  if (values.length !== 4 || values[0] !== 'x' || values[2] !== 'y') return;
  return { key, x: values[1], y: values[3] };
}

function reusePositionedLeaves(
  oldChunk: string, newChunk: string, oldLeaves: Leaf[], parent: Node,
  paragraphOnly: boolean, parse: (fragment: string) => SVGSVGElement,
): { node: SVGElement; raw: RegExpMatchArray }[] | undefined {
  const oldSpans = [...oldChunk.matchAll(textPattern)], spans = [...newChunk.matchAll(textPattern)];
  if (oldSpans.length !== oldLeaves.length) return;
  const pools = new Map<string, SVGElement[]>();
  oldSpans.forEach((span, i) => {
    const value = positionedText(span[0]);
    if (value) { const list = pools.get(value.key) ?? []; list.push(oldLeaves[i].node); pools.set(value.key, list); }
  });
  const chosen = spans.map(raw => {
    const value = positionedText(raw[0]), node = value && pools.get(value.key)?.shift();
    return { raw, value, node };
  });
  if (!chosen.some(row => row.node)) return;
  // Unmatched text/format/attribute source still passes the complete existing
  // parser and resource/sanitizer checks, before any live DOM mutation.
  const missing = chosen.filter(row => !row.node);
  if (missing.length) {
    let fresh: SVGSVGElement;
    try { fresh = parse('<svg xmlns="http://www.w3.org/2000/svg">' + missing.map(row => row.raw[0]).join('\n') + '</svg>'); }
    catch { return; }
    const nodes = [...fresh.querySelectorAll<SVGElement>('text,circle,line,path,rect')];
    if (nodes.length !== missing.length || nodes.some(node => node.parentNode !== fresh || !independentLeaf(node))) return;
    missing.forEach((row, i) => { row.node = nodes[i]; });
    separateSpaceMarkers(fresh, paragraphOnly);
  }
  // Existing leaves include screen-only, detached space markers. The caller
  // has validated every attached/detached owner; no scope crosses a parent.
  for (const row of chosen) {
    if (row.value) {
      if (row.node!.getAttribute('x') !== row.value.x) row.node!.setAttribute('x', row.value.x);
      if (row.node!.getAttribute('y') !== row.value.y) row.node!.setAttribute('y', row.value.y);
    }
  }
  return chosen.map(row => ({node: row.node!, raw: row.raw}));
}

/** Reuse exact validated surrounding source; parse/validate every new byte. */
export function updateSvgTextRegion(
  svg: SVGSVGElement, before: string, after: string, paragraphOnly: boolean,
  parse: (fragment: string) => SVGSVGElement,
): boolean {
  const source = sources.get(svg);
  if (!source || source.markup !== before || before === after || exceptionalXml(after) ||
      svg.querySelector('[data-control-label]')) return false;
  const length = Math.min(before.length, after.length);
  // SVG repeats long font chains for every glyph. Let the string engine compare
  // exact spans instead of executing a JS loop for every unchanged code unit.
  // Equality is monotonic in span length; binary search finds the identical
  // UTF-16 boundary, including surrogate/entity interiors. The existing XML
  // leaf admission below still widens and validates the complete replacement.
  let head = 0, limit = length;
  while (head < limit) {
    const mid = head + Math.ceil((limit - head) / 2);
    if (before.slice(0, mid) === after.slice(0, mid)) head = mid;
    else limit = mid - 1;
  }
  let tail = 0;
  limit = length - head;
  while (tail < limit) {
    const mid = tail + Math.ceil((limit - tail) / 2);
    if (before.slice(before.length - mid) === after.slice(after.length - mid)) tail = mid;
    else limit = mid - 1;
  }
  const oldTail = before.length - tail, newTail = after.length - tail;
  let start = before.lastIndexOf('<text', head);
  // Include one complete common-tail leaf, giving exact matching outer bytes
  // even for insertions/deletions. No guessed glyph/paragraph coordinates.
  const close = before.indexOf('</text>', oldTail);
  if (start < 0 || close < 0) return false;
  let end = close + 7;
  let first = source.leaves.findIndex(leaf => leaf.start === start);
  let last = source.leaves.findIndex(leaf => leaf.end === end);
  if (first < 0 || last < first) return false;
  // The screen projection removes space indicators. Widen to real anchors,
  // retaining the exact source between them (including every removed marker).
  // The same-parent/plain-leaf checks below still reject structural crossings.
  while (first > 0 && source.leaves[first].node.parentNode === null) first--;
  while (last + 1 < source.leaves.length && source.leaves[last].node.parentNode === null) last++;
  start = source.leaves[first].start;
  end = source.leaves[last].end;
  const nextEnd = newTail + end - oldTail;
  if (before.slice(0, start) !== after.slice(0, start) || before.slice(end) !== after.slice(nextEnd)) return false;
  const oldLeaves = source.leaves.slice(first, last + 1), parent = oldLeaves[0].parent;
  if (!svg.contains(parent) || oldLeaves.some(leaf => leaf.parent !== parent || !independentLeaf(leaf.node))) return false;
  // Detached space markers are the only allowed missing leaves. A boundary
  // must remain attached so the exact replacement range has real DOM anchors.
  if (oldLeaves[0].node.parentNode !== parent || oldLeaves.at(-1)!.node.parentNode !== parent) return false;
  if (oldLeaves.some(leaf => leaf.node.parentNode !== parent &&
      !(paragraphOnly && leaf.node.parentNode === null && leaf.node.textContent === '∨' &&
        leaf.node.attributes.length === 4 && leaf.node.getAttribute('fill') === '#0066FF' &&
        ['x', 'y', 'font-size', 'fill'].every(name => leaf.node.hasAttribute(name)) &&
        ['x', 'y', 'font-size'].every(name => Number.isFinite(Number(leaf.node.getAttribute(name))))))) return false;
  const oldChunk = before.slice(start, end), newChunk = after.slice(start, nextEnd);
  if (!plainTexts(oldChunk) || !plainTexts(newChunk)) return false;
  // Prove the old DOM range before either the numeric-only path or the full
  // text-region replacement. External mutation always stays on full fallback.
  const attached = oldLeaves.filter(leaf => leaf.node.parentNode === parent);
  let cursor: ChildNode | null = attached[0].node;
  for (const leaf of attached) {
    while (cursor && cursor !== leaf.node && cursor.nodeType === Node.TEXT_NODE && /^[\t\r\n ]*$/.test(cursor.nodeValue ?? '')) cursor = cursor.nextSibling;
    if (cursor !== leaf.node) return false;
    cursor = cursor.nextSibling;
  }
  const positioned = reusePositionedLeaves(oldChunk, newChunk, oldLeaves, parent, paragraphOnly, parse);
  if (positioned) {
    const keep = new Set(positioned.map(row => row.node));
    const previous = attached[0].node.previousSibling;
    // Remove obsolete leaves first. Otherwise one replaced decoration would
    // leave the insertion cursor behind it and unnecessarily reparent every
    // retained glyph that follows it, invalidating their browser layout again.
    for (const old of attached) if (!keep.has(old.node)) old.node.remove();
    // Preserve exact source whitespace as well as element order. Reuse the
    // actual glyph nodes; do not remove/reinsert every retained sibling.
    let at: ChildNode | null = previous ? previous.nextSibling : parent.firstChild, offset = 0;
    const append = (node: Node) => {
      while (at && at !== cursor && at !== node && at.nodeType === Node.TEXT_NODE && /^[\t\r\n ]*$/.test(at.nodeValue ?? '')) {
        const next: ChildNode | null = at.nextSibling; parent.removeChild(at); at = next;
      }
      if (node === at) at = at!.nextSibling;
      else parent.insertBefore(node, at);
    };
    for (const row of positioned) {
      const gap = newChunk.slice(offset, row.raw.index);
      if (gap) {
        if (at && at !== cursor && at.nodeType === Node.TEXT_NODE && at.nodeValue === gap) at = at.nextSibling;
        else append(svg.ownerDocument.createTextNode(gap));
      }
      // A removed space-marker remains represented in source, not in paint.
      const marker = paragraphOnly && row.node.parentNode === null && row.node.textContent === '∨';
      if (!marker) append(row.node);
      offset = row.raw.index! + row.raw[0].length;
    }
    while (at && at !== cursor) { const next: ChildNode | null = at.nextSibling; parent.removeChild(at); at = next; }
    const delta = nextEnd - end;
    sources.set(svg, {markup: after, leaves: [
      ...source.leaves.slice(0, first), ...positioned.map(row => ({start: start + row.raw.index!, end: start + row.raw.index! + row.raw[0].length, node: row.node, parent})),
      ...source.leaves.slice(last + 1).map(leaf => ({...leaf, start: leaf.start + delta, end: leaf.end + delta})),
    ]});
    return true;
  }
  let fresh: SVGSVGElement;
  try {
    // The normal parser retains duplicate-attribute/entity/namespace and
    // sanitizer/CSS-URL guards. No raw HTML insertion or bypass parser exists.
    fresh = parse('<svg xmlns="http://www.w3.org/2000/svg">' + newChunk + '</svg>');
  } catch { return false; }
  const spans = [...newChunk.matchAll(textPattern)];
  const freshLeaves = [...fresh.querySelectorAll<SVGElement>('text,circle,line,path,rect')];
  if (spans.length !== freshLeaves.length || freshLeaves.some(node => node.parentNode !== fresh || !independentLeaf(node))) return false;
  const newLeaves = freshLeaves.map((node, i) => ({start: start + spans[i].index!, end: start + spans[i].index! + spans[i][0].length, node, parent}));
  separateSpaceMarkers(fresh, paragraphOnly);
  const fragment = svg.ownerDocument.createDocumentFragment();
  while (fresh.firstChild) fragment.append(fresh.firstChild);
  const range = svg.ownerDocument.createRange();
  range.setStartBefore(attached[0].node); range.setEndAfter(attached.at(-1)!.node);
  range.deleteContents(); range.insertNode(fragment);
  const delta = nextEnd - end;
  sources.set(svg, {markup: after, leaves: [
    ...source.leaves.slice(0, first), ...newLeaves,
    ...source.leaves.slice(last + 1).map(leaf => ({...leaf, start: leaf.start + delta, end: leaf.end + delta})),
  ]});
  return true;
}
