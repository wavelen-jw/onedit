import type { CellBox, Props } from "./model.js";

/** UI-only intent lowered into the existing per-cell formatting transaction.
 * Never serialized to HWPX/clipboard or sent to a new Core API. */
export type CellBorderDraft = {
  edges: ("top" | "bottom" | "left" | "right" | "insideH" | "insideV")[];
  style: { type?: number; width?: number; color?: string };
  preset?: "outer" | "inner" | "all" | "none" | "weighted";
};
const edges = ["top", "bottom", "left", "right", "insideH", "insideV"] as const;
export function cellBorderPlan(all: CellBox[], chosen: number[], draft: CellBorderDraft): Map<number, Props> {
  if (!chosen.length || new Set(chosen).size !== chosen.length) throw Error("테두리 적용 셀을 다시 선택하세요.");
  if (draft.edges.some(e => !edges.includes(e)) || new Set(draft.edges).size !== draft.edges.length)
    throw Error("지원하는 테두리 위치를 선택하세요.");
  if (draft.preset && !["outer", "inner", "all", "none", "weighted"].includes(draft.preset)) throw Error("지원하는 빠른 설정이 아닙니다.");
  const style = draft.style;
  if (Object.keys(style).some(k => !["type", "width", "color"].includes(k)) ||
      (style.type !== undefined && ![0,1,2,3].includes(style.type)) ||
      (style.width !== undefined && (!Number.isInteger(style.width) || style.width < 0 || style.width > 15)) ||
      (style.color !== undefined && !/^#[\da-f]{6}$/i.test(style.color))) throw Error("선 모양·굵기·색을 확인하세요.");
  const cells = [...new Map(all.map(c => [c.cellIdx,c])).values()], selected = new Set(chosen);
  const targets = chosen.map(id => cells.find(c => c.cellIdx === id));
  if (targets.some(c => !c || c.rowSpan !== 1 || c.colSpan !== 1))
    throw Error("빠른 테두리는 병합되지 않은 일반 셀만 지원합니다. 원본은 유지하며 기존 셀 속성에서 확인하세요.");
  const result = new Map<number, Props>();
  for (const c of targets as CellBox[]) {
    const props: Props = {};
    for (const [side,dr,dc,outer,inner] of [["Top",-1,0,"top","insideH"],["Bottom",1,0,"bottom","insideH"],["Left",0,-1,"left","insideV"],["Right",0,1,"right","insideV"]] as const) {
      const neighbor = cells.find(n => n.row <= c.row+dr && n.row+n.rowSpan > c.row+dr && n.col <= c.col+dc && n.col+n.colSpan > c.col+dc);
      const inside = !!neighbor && selected.has(neighbor.cellIdx);
      const edge = inside ? inner : outer;
      if (!draft.edges.includes(edge)) continue;
      const patch = draft.preset === "none" ? {type:0} : draft.preset === "weighted"
        ? {...style,type:1,width:inside?1:5} : {...style};
      // Choosing a quick preset explicitly draws a line, while unstated width
      // and color keep each side's original value (including mixed values).
      if (draft.preset && patch.type === undefined) patch.type = 1;
      for (const [key,value] of Object.entries(patch)) props[`border${side}.${key}`] = value;
    }
    if (Object.keys(props).length) result.set(c.cellIdx, props);
  }
  return result;
}
