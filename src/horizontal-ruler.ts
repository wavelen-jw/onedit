// View-only projection of Core page geometry. No setters, selection or History.
const SVG = "http://www.w3.org/2000/svg";
export function rulerGeometry(info: unknown, dpi: number) {
  // Use the same Core instance DPI as getPageInfo, never OS DPI or browser zoom.
  if (!Number.isFinite(dpi) || dpi <= 0 || dpi > 1200) throw Error("Core 눈금 단위를 확인할 수 없습니다.");
  const pxPerMm = dpi / 25.4;
  if (!info || typeof info !== "object") throw Error("쪽 눈금 조회를 확인할 수 없습니다.");
  const { width, bodyLeft, bodyRight } = info as Record<string, unknown>;
  if (![width, bodyLeft, bodyRight].every(n => typeof n === "number" && Number.isFinite(n)) ||
      !(Number(width) > 0 && Number(width) <= 20000 && Number(bodyLeft) >= 0 && Number(bodyRight) > Number(bodyLeft) && Number(bodyRight) <= Number(width)))
    throw Error("현재 Core의 쪽 본문 경계 조회 미지원");
  const left = Number(bodyLeft), right = Number(bodyRight), ticks = [];
  for (let mm = 0; left + mm * pxPerMm <= right; mm++)
    ticks.push({mm, x: left + mm * pxPerMm, major: mm % 10 === 0, half: mm % 5 === 0});
  return {width: Number(width), left, right, pxPerMm, ticks};
}
export function mountHorizontalRuler(doc: Document, pages: HTMLElement, viewport: HTMLElement, read: (page: number) => {info: unknown; dpi: number}) {
  const bar = doc.createElement("div"); bar.id = "horizontal-ruler"; bar.hidden = true;
  bar.setAttribute("role", "img"); bar.title = "쪽 본문 폭 · mm · 조회 전용: 여백·탭 끌기 편집은 제공하지 않습니다.";
  doc.body.append(bar);
  let shown = false, reason = "", drawKey = "";
  function refresh() {
    const v = viewport.getBoundingClientRect(), top = v.top + viewport.clientTop + 24;
    const list = [...pages.querySelectorAll<HTMLElement>(".page")];
    const page = list.find(p => p.getBoundingClientRect().bottom > top) ?? list.at(-1);
    try {
      if (!page) throw Error("문서를 먼저 여세요.");
      const index = Number(page.dataset.page), result = read(index), geometry = rulerGeometry(result.info, result.dpi);
      const p = page.getBoundingClientRect(), scale = p.width / geometry.width;
      if (!Number.isSafeInteger(index) || index < 0 || !Number.isFinite(scale) || scale <= 0)
        throw Error("쪽·배율 연결을 확인할 수 없습니다.");
      reason = ""; bar.hidden = !shown;
      if (!shown) return;
      Object.assign(bar.style, {left: `${v.left + viewport.clientLeft}px`, top: `${v.top + viewport.clientTop}px`, width: `${viewport.clientWidth}px`});
      bar.dataset.page = String(index); bar.dataset.scale = String(scale);
      bar.setAttribute("aria-label", `${index + 1}쪽 가로 눈금자 · 본문 폭 ${((geometry.right - geometry.left) / geometry.pxPerMm).toFixed(1)} mm · 조회 전용`);
      const key = JSON.stringify([geometry, scale, p.left - v.left - viewport.clientLeft]);
      if (key === drawKey) return;
      drawKey = key;
      const svg = doc.createElementNS(SVG, "svg"); svg.setAttribute("width", String(p.width)); svg.setAttribute("height", "24");
      svg.style.left = `${p.left - v.left - viewport.clientLeft}px`;
      svg.setAttribute("aria-hidden", "true");
      const add = (name: string, attrs: Record<string, string | number>, text?: string) => {
        const n = doc.createElementNS(SVG, name); for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, String(value));
        if (text !== undefined) n.textContent = text; svg.append(n);
      };
      add("rect", {width: p.width, height: 24, fill: "#dce2ea"});
      add("rect", {x: geometry.left * scale, width: (geometry.right - geometry.left) * scale, height: 24, fill: "#fff"});
      for (const tick of geometry.ticks) {
        const x = tick.x * scale;
        add("line", {x1: x, x2: x, y1: tick.major ? 15 : tick.half ? 18 : 21, y2: 24, stroke: "#526277", "stroke-width": 1});
        // Keep every millimetre tick; avoid overlapping numbers at small zoom.
        if (tick.major && (scale >= .6 || tick.mm % 20 === 0))
          add("text", {x: x + 2, y: 11, fill: "#334155", "font-size": 10}, String(tick.mm));
      }
      bar.replaceChildren(svg);
    } catch (error) { reason = String(error); bar.hidden = true; drawKey = ""; }
  }
  refresh();
  return {
    refresh,
    state: () => ({shown, reason}),
    toggle() { refresh(); if (reason) throw Error(reason); shown = !shown; refresh(); },
  };
}
