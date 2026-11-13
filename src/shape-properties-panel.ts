import type { mountShapes } from "./shape-ui.js";

/** Existing list selection owns identity and admission; this panel never selects. */
export function mountShapePropertiesPanel(doc: Document, readSelected: ReturnType<typeof mountShapes>["readSelected"], busy: () => boolean, stateReason: () => string) {
  const root = doc.createElement("details"), summary = doc.createElement("summary");
  root.id = "properties-shape"; root.open = true; root.hidden = true; summary.textContent = "도형·글상자 속성";
  const values = doc.createElement("dl"), more = doc.createElement("button"), note = doc.createElement("output");
  more.type = "button"; more.textContent = "개체 크기…"; more.dataset.shapeProperties = "open"; note.setAttribute("aria-live", "polite"); root.append(summary, values, more, note);
  const source = () => doc.getElementById("shape-properties") as HTMLButtonElement | null;
  let rendered = "";
  function clear() { root.hidden = true; values.replaceChildren(); rendered = ""; more.disabled = true; note.textContent = ""; }
  function sync() {
    let row;
    try { row = readSelected(); } catch { clear(); return; }
    if (!row) { clear(); return; }
    root.hidden = false;
    const rows = [
      ["kind", "개체", row.name],
      ["owner", "소유 문단", `${row.target.sec + 1}구역 ${row.target.para + 1}문단`],
      ["width", "너비 (pt)", String(row.props.width / 100)],
      ["height", "높이 (pt)", String(row.props.height / 100)],
    ];
    const key = JSON.stringify(rows);
    if (key !== rendered) { rendered = key; values.replaceChildren(); for (const [id, label, text] of rows) {
      const term = doc.createElement("dt"), value = doc.createElement("dd"); term.textContent = label; value.textContent = text; value.dataset.shapeProperty = id; values.append(term, value);
    } }
    const button = source(), reason = stateReason() || (busy() || doc.querySelector("dialog[open]") ? "입력·저장 또는 열린 대화상자를 먼저 마치세요." : "") || row.reason
      || (!button ? "기존 개체 크기 창이 연결되지 않았습니다." : button.disabled ? button.title || "현재 개체는 크기를 편집할 수 없습니다." : "");
    more.disabled = !!reason; more.title = reason || "목록에서 선택한 기존 개체의 크기 창을 엽니다.";
    note.textContent = reason || "목록에서 명시적으로 선택한 본문 개체 한 개입니다. 기존 크기 편집만 사용하며 캔버스 선택·내부 글 편집·이동은 지원하지 않습니다.";
    note.title = note.textContent;
  }
  more.onclick = () => { sync(); const button = source(); if (!root.hidden && !more.disabled && button && !button.disabled) button.click(); };
  sync(); return { root, sync, dispose() { root.remove(); } };
}
