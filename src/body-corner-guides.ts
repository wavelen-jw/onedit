export type BodyPageInfo = {
  width: number;
  height: number;
  bodyLeft: number;
  bodyRight: number;
  headerArea: { y: number; height: number };
  footerArea: { y: number };
};

/** Screen-only margin marks use the same page info already read for publication. */
export function paintBodyCorners(page: HTMLElement, info: BodyPageInfo) {
  const overlay = page.querySelector<HTMLElement>(":scope > .overlay");
  if (!overlay) return;
  const existing = overlay.querySelector<SVGSVGElement>(":scope > .body-corner-guides");
  const left = info.bodyLeft, right = info.bodyRight;
  const top = info.headerArea.y + info.headerArea.height, bottom = info.footerArea.y;
  if (![left, right, top, bottom].every(Number.isFinite) || left < 0 || top < 0 ||
      right <= left || bottom <= top || right > info.width || bottom > info.height) {
    existing?.remove();
    return;
  }
  const viewBox = `0 0 ${info.width} ${info.height}`;
  const bounds = JSON.stringify({left, right, top, bottom});
  if (existing?.dataset.bounds === bounds && existing.getAttribute("viewBox") === viewBox) return;
  const ns = "http://www.w3.org/2000/svg";
  const svg = page.ownerDocument.createElementNS(ns, "svg");
  svg.setAttribute("class", "body-corner-guides");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", viewBox);
  svg.dataset.editorOnly = "body-corners";
  svg.dataset.bounds = bounds;
  const line = page.ownerDocument.createElementNS(ns, "path");
  line.setAttribute("d", `M${left-10} ${top}H${left}V${top-10}M${right+10} ${top}H${right}V${top-10}M${left-10} ${bottom}H${left}V${bottom+10}M${right+10} ${bottom}H${right}V${bottom+10}`);
  svg.append(line);
  if (existing) existing.replaceWith(svg);
  else overlay.prepend(svg);
}
