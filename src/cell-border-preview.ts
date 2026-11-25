import { cellBlockMasks } from "./cell-block-scope.js";
import { borderLineStyle, borderWidthsMm, sides } from "./formatting.js";
import type { Interaction } from "./interaction.js";
import { nested, type CellBox, type Props, type Selection } from "./model.js";

type Side = typeof sides[number];
type Line = { type: number; width: number; color: string };
type Cell = CellBox & { lines: Record<Side, Line>; fill: string; decorativeFill: boolean; mask?: Props };
type Segment = { side: Side; cell: Cell };
const hex = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const svgNS = "http://www.w3.org/2000/svg";

export function readCellBorderPreview(editor: Interaction, selection: Selection, outer: boolean) {
  const p = selection.focus;
  if (p.kind !== "cell") return;
  const a = editor.adapter;
  const all = a.cells(p);
  const chosen = selection.kind === "table" || selection.kind === "cells"
    ? editor.cells(selection) : all.filter(cell => cell.cellIdx === p.cell).slice(0, 1);
  // Bound diagram work independently of editing and import limits.
  if (!chosen.length || chosen.reduce((n, c) => n + c.rowSpan + c.colSpan, 0) > 2048) return;
  const masks = outer ? cellBlockMasks(all, chosen.map(c => c.cellIdx)) : undefined;
  const path = nested(p) ? a.path(p) : undefined;
  return chosen.map((cell): Cell => {
    const raw = path ? a.call("getCellPropertiesByPath", p.sec, p.para, path, cell.cellIdx)
      : a.cellProps({...p, cell: cell.cellIdx, cellPara: 0, offset: 0});
    const lines = Object.fromEntries(sides.map(side => [side, raw[`border${side}`]])) as Cell["lines"];
    const rawFill = raw.fillType === "solid" && raw.patternType <= 0 ? raw.fillColor : undefined;
    return {
      ...cell, lines, fill: hex(rawFill) ? rawFill : "#ffffff", mask: masks?.get(cell.cellIdx),
      decorativeFill: raw.fillType !== "none" && !hex(rawFill),
    };
  }).sort((a,b) => a.cellIdx - b.cellIdx);
}
export type CellBorderPreview = NonNullable<ReturnType<typeof readCellBorderPreview>>;

export function mountCellBorderPreview(target: HTMLElement, cells: CellBorderPreview | undefined) {
  if (!cells?.length) {
    target.textContent = "이 범위의 셀 배치를 미리 볼 수 없습니다.";
    return (_delta: Props) => {};
  }
  const doc = target.ownerDocument;
  const create = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const element = doc.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    return element;
  };
  const row = Math.min(...cells.map(c => c.row)), col = Math.min(...cells.map(c => c.col));
  const rows = Math.max(...cells.map(c => c.row + c.rowSpan)) - row;
  const cols = Math.max(...cells.map(c => c.col + c.colSpan)) - col;
  const x = (n: number) => 12 + (n - col) * 276 / cols;
  const y = (n: number) => 12 + (n - row) * 108 / rows;
  const svg = create("svg", {viewBox: "0 0 300 132", role: "img", "aria-label": "선택한 셀의 테두리와 배경 미리보기"});
  const segments = new Map<string, Segment[]>();
  const add = (axis: "h" | "v", fixed: number, at: number, cell: Cell, side: Side) => {
    const key = `${axis}:${fixed}:${at}`;
    const list = segments.get(key) ?? [];
    list.push({cell, side});
    segments.set(key, list);
  };
  const fills = cells.map(c => {
    const rect = create("rect", {x: x(c.col), y: y(c.row), width: x(c.col + c.colSpan) - x(c.col),
      height: y(c.row + c.rowSpan) - y(c.row), "data-preview-cell": c.cellIdx,
      "data-row-span": c.rowSpan, "data-col-span": c.colSpan});
    svg.append(rect);
    for (let i = c.col; i < c.col + c.colSpan; i++) {
      add("h", c.row, i, c, "Top");
      add("h", c.row + c.rowSpan, i, c, "Bottom");
    }
    for (let i = c.row; i < c.row + c.rowSpan; i++) {
      add("v", c.col, i, c, "Left");
      add("v", c.col + c.colSpan, i, c, "Right");
    }
    return {rect, cell: c};
  });
  const strokes = Array.from(segments, ([key, candidates]) => {
    const [axis, fixed, at] = key.split(":");
    const n = Number(fixed), i = Number(at);
    const coords = axis === "h" ? {x1: x(i), y1: y(n), x2: x(i + 1), y2: y(n)}
      : {x1: x(n), y1: y(i), x2: x(n), y2: y(i + 1)};
    const guide = create("line", coords);
    guide.classList.add("cell-border-preview-guide");
    const line = create("line", {...coords, "data-preview-edge": candidates.length > 1 ? "inside" : "outside"});
    svg.append(guide, line);
    return {line, candidates};
  });
  const note = doc.createElement("small");
  note.className = "cell-preview-note";
  target.append(svg, note);
  const rank = (type: number) => type === 11 ? 4 : type >= 8 && type <= 10 ? 3 : type === 12 || type === 13 ? 2 : 1;
  return (delta: Props) => {
    for (const {rect, cell} of fills)
      rect.setAttribute("fill", delta.background === "none" ? "#ffffff" : hex(delta.background) ? delta.background : cell.fill);
    let approximated = cells.some(cell => cell.decorativeFill) && !delta.background;
    let guide = false;
    for (const {line, candidates} of strokes) {
      let best: Line | undefined;
      for (const {cell, side} of candidates) {
        const name = `border${side}`;
        const base = cell.lines[side];
        const useDelta = !cell.mask || Object.hasOwn(cell.mask, name + ".type");
        const chosen = useDelta ? {
          type: Number(delta[name + ".type"] ?? base.type),
          width: Number(delta[name + ".width"] ?? base.width),
          color: String(delta[name + ".color"] ?? base.color),
        } : base;
        if (chosen.type && (!best || chosen.width > best.width ||
            chosen.width === best.width && rank(chosen.type) > rank(best.type))) best = chosen;
      }
      const dash = best && borderLineStyle(best.type)?.[3];
      const knownLine = best && borderLineStyle(best.type);
      approximated ||= !!best && !knownLine;
      guide ||= !best;
      line.setAttribute("stroke", best && hex(best.color) ? best.color : "none");
      line.setAttribute("stroke-width", String(best ? Math.max(1, (borderWidthsMm[best.width] ?? .1) * 3.78) : 0));
      if (dash || best && !knownLine) line.setAttribute("stroke-dasharray", dash ?? "1 3");
      else line.removeAttribute("stroke-dasharray");
      line.dataset.lineType = String(best?.type ?? 0);
    }
    note.textContent = approximated ? "특수선·무늬는 간략히 표시합니다."
      : guide ? "연한 점선은 셀 경계입니다." : "";
    note.hidden = !note.textContent;
  };
}
