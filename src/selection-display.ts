import type { Box } from "./model.js";
export type SelectionBox = Box & { textOnly?: boolean; lineKey?: string;
  flowKey?: string; flowLeft?: number; continues?: boolean; rangeStart?: number; rangeEnd?: number };
// These are browser-painted glyph bounds, not the Core run-layout cache.
// The weak SVG identity changes on render/edit/undo/open. Observe only the SVG
// so selection overlays cannot invalidate their own measurement on every paint.
type GlyphBounds = { key: string; fontRevision: number; dirty: boolean; boxes: Box[]; observer: MutationObserver };
const glyphBounds = new WeakMap<SVGSVGElement, GlyphBounds>();
const fontStates = new WeakMap<Document, { revision: number }>();
function fontState(doc: Document) {
  let state = fontStates.get(doc);
  if (!state) {
    state = { revision: 0 };
    fontStates.set(doc, state);
    const invalidate = () => { state!.revision++; };
    for (const event of ["loading", "loadingdone", "loadingerror"])
      doc.fonts?.addEventListener(event, invalidate);
  }
  return state;
}
function paintedGlyphs(page: HTMLElement, pageIndex: number): Box[] {
  const origin = page.getBoundingClientRect();
  const sx = origin.width / parseFloat(page.style.width), sy = origin.height / parseFloat(page.style.height);
  const svg = page.querySelector<SVGSVGElement>(":scope > svg");
  const doc = page.ownerDocument, win = doc.defaultView, fonts = fontState(doc);
  const key = JSON.stringify([pageIndex, origin.left, origin.top, origin.width, origin.height,
    sx, sy, win?.innerWidth, win?.innerHeight, win?.devicePixelRatio, win?.visualViewport?.scale]);
  let cached = svg && glyphBounds.get(svg);
  if (cached?.observer.takeRecords().length) cached.dirty = true;
  const reusable = Number.isFinite(sx) && sx > 0 && Number.isFinite(sy) && sy > 0 && doc.fonts?.status !== "loading";
  if (reusable && cached && !cached.dirty && cached.key === key && cached.fontRevision === fonts.revision)
    return cached.boxes;
  if (svg && !cached) {
    const entry = { key: "", fontRevision: -1, dirty: true, boxes: [] as Box[], observer: undefined as unknown as MutationObserver };
    entry.observer = new MutationObserver(() => { entry.dirty = true; });
    entry.observer.observe(svg, { attributes: true, childList: true, characterData: true, subtree: true });
    glyphBounds.set(svg, entry);
    cached = entry;
  }
  const boxes = Array.from(page.querySelectorAll<SVGTextElement>("svg text"), (text) => {
    const r = text.getBoundingClientRect();
    return { pageIndex, x: (r.left - origin.left) / sx, y: (r.top - origin.top) / sy,
      width: r.width / sx, height: r.height / sy };
  });
  if (cached) Object.assign(cached, { key, fontRevision: fonts.revision, dirty: !reusable, boxes });
  return boxes;
}
// Paint-only geometry. Core selection/offsets and hit testing remain authoritative.
// Pieces produced by subtractBox remain inside their original rectangle.
// A disjoint obstacle cannot affect any piece: retain the exact subtraction
// order/thresholds while avoiding flatMap and singleton arrays for that case.
function disjoint(a: Box, b: Box): boolean {
  return a.pageIndex !== b.pageIndex ||
    Math.min(a.x + a.width, b.x + b.width) <= Math.max(a.x, b.x) ||
    Math.min(a.y + a.height, b.y + b.height) <= Math.max(a.y, b.y);
}
function subtractBox(p: Box, old: Box): Box[] {
  if (p.pageIndex !== old.pageIndex) return [p];
  const x = Math.max(p.x, old.x), y = Math.max(p.y, old.y);
  const right = Math.min(p.x + p.width, old.x + old.width);
  const bottom = Math.min(p.y + p.height, old.y + old.height);
  if (right <= x || bottom <= y) return [p];
  return [
    { ...p, height: y - p.y },
    { ...p, y: bottom, height: p.y + p.height - bottom },
    { ...p, y, width: x - p.x, height: bottom - y },
    { ...p, x: right, y, width: p.x + p.width - right, height: bottom - y },
  ].filter((b) => b.width > 0.01 && b.height > 0.01);
}
export function unionSelectionBoxes(rects: Box[]): Box[] {
  const result: Box[] = [];
  for (const rect of rects) {
    let pieces = [rect];
    for (const old of result) {
      if (!disjoint(rect, old)) pieces = pieces.flatMap((p) => subtractBox(p,old));
    }
    result.push(...pieces);
  }
  return result;
}
export function selectionPaintBoxes(pages: HTMLElement, rects: SelectionBox[]): Box[] {
  const glyphs = new Map<number, Box[]>();
  for (const pageIndex of new Set(rects.filter((r) => r.textOnly).map((r) => r.pageIndex))) {
    const page = pages.querySelector<HTMLElement>(`[data-page="${pageIndex}"]`);
    if (!page) continue;
    glyphs.set(pageIndex, paintedGlyphs(page, pageIndex));
  }
  const painted = rects.flatMap((r) => {
    if (!r.textOnly) return [r];
    const selected = (glyphs.get(r.pageIndex) ?? []).filter((g) =>
      g.y + g.height / 2 >= r.y - 1 && g.y + g.height / 2 <= r.y + r.height + 1 &&
      g.x + g.width > r.x + .05 && g.x < r.x + r.width - .05
    );
    if (!selected.length) return [];
    // Core's run spans include spaces and exact partial-character boundaries;
    // SVG supplies the painted line height (not the enclosing inline-table height).
    const y = Math.min(...selected.map((g) => g.y));
    const bottom = Math.max(...selected.map((g) => g.y + g.height));
    return [{ ...r, y, height: bottom - y }];
  });
  // One visual line gets one selection band, even when Korean/Latin or
  // mixed-size runs have different painted glyph bounds. Keep horizontal
  // selected-character boundaries and separate paragraph/cell/page owners.
  const bands = new Map<string, { y: number; bottom: number }>();
  for (const r of painted) {
    if (!r.lineKey) continue;
    const old = bands.get(r.lineKey);
    bands.set(r.lineKey, { y: Math.min(old?.y ?? r.y, r.y),
      bottom: Math.max(old?.bottom ?? r.y + r.height, r.y + r.height) });
  }
  const ink = painted.map((r) => {
    const band = r.lineKey && bands.get(r.lineKey);
    return band ? { ...r, y: band.y, height: band.bottom - band.y } : r;
  });
  const joins: Box[] = [];
  const neighbors = new Map<string, SelectionBox[]>();
  for (const r of ink) if (r.textOnly && r.lineKey) {
    const group = neighbors.get(r.lineKey) ?? []; group.push(r); neighbors.set(r.lineKey,group);
  }
  for (const group of neighbors.values()) {
    group.sort((a,b)=>a.x-b.x);
    for (let i=1;i<group.length;i++) {
      const a=group[i-1], b=group[i], gap=b.x-a.x-a.width;
      // Core rounds separate run x/width values to tenths. Bridge only that
      // rounding gap between logically contiguous selected text. Never extend
      // the outer endpoints, skip an unselected character, or bridge objects.
      if (a.rangeEnd !== undefined && a.rangeEnd===b.rangeStart && gap>0 && gap<=.201)
        joins.push({pageIndex:a.pageIndex,x:a.x+a.width,y:a.y,width:gap,height:a.height});
    }
  }
  // Connect only the same page/column/text owner. Core range endpoints still
  // determine which characters/objects are selected; these are whitespace fills.
  const lines = new Map<string, SelectionBox>();
  for (const r of ink) {
    if (!r.lineKey || !r.flowKey) continue;
    const old=lines.get(r.lineKey), left=Math.min(old?.x??r.x,r.x), right=Math.max(old?old.x+old.width:0,r.x+r.width);
    lines.set(r.lineKey,{...r,x:left,width:right-left});
  }
  const flows = new Map<string,SelectionBox[]>();
  for (const r of lines.values()) {
    const left=r.continues&&Number.isFinite(r.flowLeft)?Math.min(r.x,r.flowLeft!):r.x;
    const line={...r,x:left,width:r.x+r.width-left};
    const group=flows.get(r.flowKey!)??[];group.push(line);flows.set(r.flowKey!,group);
  }
  const fills: Box[]=[];
  for (const group of flows.values()) {
    if (group.length<2) continue;
    group.sort((a,b)=>a.y-b.y);
    for (let i=0;i<group.length;i++) {
      const r=group[i];fills.push(r);
      const next=group[i+1];
      if (!next || next.y<=r.y+r.height || next.y-r.y-r.height>Math.max(r.height,next.height)) continue;
      const left=Math.max(r.x,next.x),right=Math.min(r.x+r.width,next.x+next.width);
      if (right>left) fills.push({pageIndex:r.pageIndex,x:left,y:r.y+r.height,width:right-left,height:next.y-r.y-r.height});
    }
  }
  const protectedRegions=new Map<number,Box[]>();
  for (const index of new Set(fills.map(r=>r.pageIndex))) {
    const page=pages.querySelector<HTMLElement>(`[data-page="${index}"]`);if(!page)continue;
    const origin=page.getBoundingClientRect(),sx=origin.width/parseFloat(page.style.width),sy=origin.height/parseFloat(page.style.height);
    const images=Array.from(page.querySelectorAll<SVGImageElement>(":scope > svg image"),n=>{
      const b=n.getBoundingClientRect();return{pageIndex:index,x:(b.left-origin.left)/sx,y:(b.top-origin.top)/sy,width:b.width/sx,height:b.height/sy};
    });
    // Never tint an unselected glyph or floating image by filling whitespace.
    // Selected images already have their exact Core-owned selection boxes.
    protectedRegions.set(index,[...(glyphs.get(index)??[]),...images]);
  }
  const whitespace=fills.flatMap(r=>{
    let pieces:Box[]=[r];
    for(const obstacle of protectedRegions.get(r.pageIndex)??[]) {
      if (!disjoint(r, obstacle)) pieces=pieces.flatMap(p=>subtractBox(p,obstacle));
    }
    return pieces;
  });
  return unionSelectionBoxes([...ink,...joins,...whitespace]);
}
