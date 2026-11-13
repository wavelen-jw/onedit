import type { Interaction } from "./interaction.js";
import type { LiveComposition } from "./live-composition.js";
import { type Box } from "./model.js";

/** Fresh Core selection geometry, never browser font arithmetic or a second
 * text rendering. Missing geometry leaves the established line caret intact. */
export function compositionCursorBoxes(editor: Interaction, composition: LiveComposition | undefined): Box[] {
  if (!composition) return [];
  try {
    const range = composition.presentationRange(editor);
    if (!range) return [];
    const a = editor.adapter, p = range.anchor, q = range.focus;
    const from = a.textOffset(p), to = a.textOffset(q);
    // Core's selection rectangle includes a negative first-line indent before
    // the first selected glyph. Composition is a character cursor, not that
    // paragraph selection. Use fresh native caret edges for each scalar only.
    if (to <= from || to - from > 64) return [];
    const boxes: Box[] = [];
    let start = a.rect(p);
    for (let offset = from + 1; offset <= to; offset++) {
      const next = {...p, offset: a.logical(p, offset)};
      a.validate(next);
      const end = a.rect(next);
      // A wrapped/ambiguous edge cannot certify a glyph interval. Keep the
      // normal caret rather than shade unrelated line or paragraph whitespace.
      if (start.pageIndex !== end.pageIndex || start.y !== end.y ||
          ![start.x,start.y,start.height,end.x,end.y,end.height].every(Number.isFinite) ||
          start.height <= 0 || end.height <= 0) return [];
      const width = Math.abs(end.x - start.x);
      if (width > 0) boxes.push({pageIndex:start.pageIndex,x:Math.min(start.x,end.x),
        y:start.y,width,height:Math.max(start.height,end.height)});
      start = end;
    }
    return boxes;
  } catch {
    // Optional presentation only. Current canonical edit/error handling and the
    // normal caret remain owned by the existing composition/selection paths.
    return [];
  }
}

/** Overlay contains no text/font/style substitute. Difference blending inverts
 * the already rendered glyph, retaining its exact face, weight and shaping. */
export function paintCompositionCursor(document: Document, pages: HTMLElement, boxes: readonly Box[]): boolean {
  if (!boxes.length || !document.defaultView?.CSS?.supports("mix-blend-mode", "difference")) return false;
  const targets = boxes.map(b => pages.querySelector<HTMLElement>(`[data-page="${b.pageIndex}"]:not([data-render-pending]) .overlay`));
  if (targets.some(p => !p)) return false;
  boxes.forEach((b, index) => {
    const block = document.createElement("div");
    block.className = "composition-cursor";
    block.setAttribute("aria-hidden", "true");
    Object.assign(block.style, {left:`${b.x}px`,top:`${b.y}px`,width:`${b.width}px`,height:`${b.height}px`});
    targets[index]!.append(block);
  });
  return true;
}
