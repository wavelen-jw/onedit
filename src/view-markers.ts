import type { RhwpAdapter } from "./adapter.js";

export const viewMarkerItems = [
  {id: "paragraph-marks", label: "문단 부호", get: "getShowParagraphMarks", set: "setShowParagraphMarks"},
  {id: "control-codes", label: "조판 부호", get: "getShowControlCodes", set: "setShowControlCodes"},
  {id: "transparent-borders", label: "투명 선", get: "getShowTransparentBorders", set: "setShowTransparentBorders"},
] as const;
export type ViewMarker = typeof viewMarkerItems[number]["id"];
// Session view choices only. HWPX History restores documents, not these flags.
const choices = new WeakMap<RhwpAdapter, Map<ViewMarker, boolean>>();
const definition = (id: ViewMarker) => {
  const item = viewMarkerItems.find(item => item.id === id);
  if (!item) throw Error("지원하지 않는 표시 옵션입니다.");
  return item;
};
export function viewMarkerState(a: RhwpAdapter, id: ViewMarker): boolean | undefined {
  const item = definition(id), doc = a.doc;
  if (typeof doc[item.get] !== "function" || typeof doc[item.set] !== "function") return;
  const value = a.presentationFlag(item.get);
  return typeof value === "boolean" ? value : undefined;
}
export function setViewMarker(a: RhwpAdapter, id: ViewMarker, enabled: boolean) {
  setViewChoices(a, [[id, enabled]]);
}
function setViewChoices(a: RhwpAdapter, changes: readonly (readonly [ViewMarker, boolean])[]) {
  const rows = changes.map(([id, enabled]) => ({id, enabled, item: definition(id), previous: viewMarkerState(a, id)}));
  if (rows.some(r => typeof r.enabled !== "boolean" || r.previous === undefined))
    throw Error("현재 Core의 표시 조회·설정 연결을 확인할 수 없습니다.");
  try {
    a.invalidateUpdateReads();
    for (const row of rows) a.doc[row.item.set](row.enabled);
    if (rows.some(row => viewMarkerState(a, row.id) !== row.enabled)) throw Error("표시 설정을 확인하지 못했습니다.");
  } catch (error) {
    a.invalidateUpdateReads();
    for (const row of rows) a.doc[row.item.set](row.previous!);
    throw error;
  }
  const state = choices.get(a) ?? new Map<ViewMarker, boolean>();
  for (const row of rows) state.set(row.id, row.enabled);
  choices.set(a, state);
}
/** User-approved two transitions only; unobserved Hancom states remain NV. */
export function toggleViewMarker(a: RhwpAdapter, id: ViewMarker) {
  const current = viewMarkerState(a, id);
  if (current === undefined) throw Error("현재 Core의 표시 조회·설정 연결을 확인할 수 없습니다.");
  if (id === "control-codes" && !current)
    setViewChoices(a, [["paragraph-marks", true], ["control-codes", true]]);
  else if (id === "paragraph-marks" && current)
    setViewChoices(a, [["paragraph-marks", false], ["control-codes", false]]);
  else setViewMarker(a, id, !current);
}
// Called before the existing SVG renderer, including Undo/Redo/cold document swaps.
export function applyViewMarkers(a: RhwpAdapter) {
  if (!choices.has(a)) choices.set(a, new Map([["paragraph-marks", true]]));
  for (const [id, enabled] of choices.get(a) ?? []) {
    const item = definition(id);
    if (viewMarkerState(a, id) !== enabled) { a.invalidateUpdateReads();a.doc[item.set](enabled); }
  }
}
// Print keeps its existing SVG path. Suspend only these screen flags during the
// synchronous snapshot; never persist this temporary state as a view preference.
export function withoutViewMarkers<T>(a: RhwpAdapter, snapshot: () => T): T {
  const doc = a.doc, previous = viewMarkerItems.filter(item => viewMarkerState(a, item.id) === true);
  try { a.invalidateUpdateReads();for (const item of previous) doc[item.set](false); return snapshot(); }
  finally { a.invalidateUpdateReads();for (const item of previous) doc[item.set](true); }
}

// The pinned Core emits screen space indicators as standalone four-attribute
// text leaves. Real document text always carries its font-family/positioning
// contract. Do not match a user glyph by character or color alone, or alter
// Core text, runs, flags, export or the separately generated print snapshot.
export function paragraphOnlyMarkers(a:RhwpAdapter){
  return viewMarkerState(a,"paragraph-marks")===true&&viewMarkerState(a,"control-codes")===false;
}
export function separateSpaceMarkers(svg:SVGSVGElement,paragraphOnly:boolean){
  if(!paragraphOnly)return;
  // The exact fill is already a necessary marker condition below. Let the
  // DOM select that subset before reading every ordinary glyph's children and
  // text. Keep all producer-shape checks: blue document text is not a marker.
  for(const text of svg.querySelectorAll('text[fill="#0066FF"]')){
    if(text.childNodes.length!==1||text.firstChild?.nodeType!==3||text.textContent!=="∨"||
        text.attributes.length!==4||text.getAttribute("fill")!=="#0066FF"||
        !["x","y","font-size","fill"].every(name=>text.hasAttribute(name))||
        !["x","y","font-size"].every(name=>Number.isFinite(Number(text.getAttribute(name)))))continue;
    text.remove();
  }
}

/** Screen-only producer markers, never user text or print SVG. A small fixed
 * document-point size follows document zoom/DPI, not the paragraph character. */
export function projectParagraphMarks(svg:SVGSVGElement,dpi:number){
  if(!Number.isFinite(dpi)||dpi<=0)return;
  const size=String(10*dpi/96);
  for(const text of svg.querySelectorAll('text[fill="#0066FF"]')){
    if(text.childNodes.length!==1||text.firstChild?.nodeType!==3||text.textContent!=='↵'||
      text.attributes.length!==4||!['x','y','font-size','fill'].every(name=>text.hasAttribute(name))||
      !['x','y','font-size'].every(name=>Number.isFinite(Number(text.getAttribute(name)))))continue;
    if(text.getAttribute('font-size')!==size)text.setAttribute('font-size',size);
  }
}
