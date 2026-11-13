import type { TabStop } from "../model.js";
// Core tab positions use 2x HWPUNIT (200 per pt).
// Draft-only editor; imported unknown stop types remain untouched unless explicitly removed.
export function mountTabs(container: HTMLElement, initial: unknown) {
  const section = document.createElement("fieldset"),
    legend = document.createElement("legend");
  legend.textContent = "탭 위치 (pt)";
  section.append(legend);
  container.append(section);
  const rows = document.createElement("div");
  section.append(rows);
  const stops: TabStop[] = Array.isArray(initial)
    ? structuredClone(initial)
    : [];
  let changed = false;
  // Structural draft operations must retain raw input, including an empty or
  // invalid position. Numeric coercion belongs to the existing Apply validator.
  const drafts = new Map<TabStop, { position: string; type: string; fill: string }>();
  const controls: {
    position: HTMLInputElement;
    type: HTMLSelectElement;
    fill: HTMLSelectElement;
  }[] = [];
  function render() {
    rows.replaceChildren();
    controls.length = 0;
    stops.forEach((stop, index) => {
      const draft = drafts.get(stop);
      const row = document.createElement("div"),
        position = document.createElement("input");
      position.type = "number";
      position.min = "0";
      position.max = "1000";
      position.step = "0.01";
      position.value = draft?.position ?? String(stop.position / 200);
      position.setAttribute("aria-label", `탭 ${index + 1} 위치 (pt)`);
      const select = (
        name: string,
        value: number,
        options: [number, string][],
      ) => {
        const el = document.createElement("select");
        el.setAttribute("aria-label", `탭 ${index + 1} ${name}`);
        for (const [v, label] of options) el.add(new Option(label, String(v)));
        if (!options.some(([v]) => v === value))
          el.add(new Option(`현재 값 ${value} (유지)`, String(value)));
        el.value = String(value);
        return el;
      };
      const type = select("종류", Number(draft?.type ?? stop.type), [
        [0, "왼쪽"],
        [1, "오른쪽"],
        [2, "가운데"],
        [3, "소수점"],
      ]);
      const fill = select("채움선", Number(draft?.fill ?? stop.fill), [
        [0, "없음"],
        [1, "실선"],
        [2, "점선"],
        [3, "파선"],
      ]);
      const sync = () => {
        changed = true;
        drafts.set(stop, { position: position.value, type: type.value, fill: fill.value });
      };
      for (const control of [position, type, fill])
        control.addEventListener("input", sync);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "삭제";
      remove.onclick = () => {
        changed = true;
        drafts.delete(stop);
        stops.splice(index, 1);
        render();
        // The activated delete button was removed with its row. Keep keyboard
        // editing in the draft: next row, previous last row, or Add when empty.
        (controls[Math.min(index, controls.length - 1)]?.position ?? add).focus();
      };
      controls.push({ position, type, fill });
      row.append(position, type, fill, remove);
      rows.append(row);
    });
  }
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "탭 추가";
  add.onclick = () => {
    changed = true;
    stops.push({ position: 0, type: 0, fill: 0 });
    render();
  };
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "탭 모두 지우기";
  clear.onclick = () => {
    changed = true;
    stops.length = 0;
    drafts.clear();
    render();
  };
  section.append(add, clear);
  if (initial === undefined) {
    const hint = document.createElement("small");
    hint.textContent =
      "혼합 / 조회 불가: 추가·삭제하면 선택 문단에 새 탭 목록을 적용합니다.";
    section.append(hint);
  }
  render();
  return (): TabStop[] | undefined => {
    if (!changed) return undefined;
    const result = controls.map(({ position, type, fill }) => ({
      position: Math.round(Number(position.value) * 200),
      type: Number(type.value),
      fill: Number(fill.value),
    }));
    if (
      controls.some(({ position }) => !position.value.trim()) ||
      result.some(
        (s) =>
          !Number.isFinite(s.position) ||
          s.position < 0 ||
          s.position > 200000 ||
          ![0, 1, 2, 3].includes(s.type) ||
          ![0, 1, 2, 3].includes(s.fill),
      )
    )
      throw Error(
        "탭 위치/종류/채움선을 확인하세요. 미지원 항목은 제거 후 편집할 수 있습니다.",
      );
    if (new Set(result.map((s) => s.position)).size !== result.length)
      throw Error("같은 탭 위치를 중복 지정할 수 없습니다.");
    result.sort((a, b) => a.position - b.position);
    return JSON.stringify(result) === JSON.stringify(initial)
      ? undefined
      : result;
  };
}
