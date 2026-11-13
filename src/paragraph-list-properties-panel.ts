import type { Interaction } from "./interaction.js";
import type { FormatState } from "./formatting.js";
import { formatMenuState } from "./integration/a-format-menu.js";
import { formatValueState, formatValueHint } from "./format-value-state.js";

// These are existing paragraph properties, not a rendered numbering calculation.
export function paragraphListPanelRows(state: FormatState) {
  const kinds: Record<string, string> = {None: "없음", Number: "문단 번호", Bullet: "글머리표", Outline: "개요 번호"};
  return ["headType", "numberingId", "paraLevel"].map(key => {
    const value = state[key], status=formatValueState(state,key), mixed = status === "mixed";
    const text = status!=="common" ? formatValueHint(status) : key === "headType" ? kinds[String(value)] || `기존 값: ${value} · 조회만`
      : key === "paraLevel" ? typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6 ? `${value + 1}수준` : `기존 값: ${value} · 조회만`
      : String(value);
    return {key, label: {headType: "종류", numberingId: "정의 참조 ID", paraLevel: "수준"}[key]!, text, mixed,status};
  });
}
export function mountParagraphListPropertiesPanel(doc: Document, editor: Interaction, busy: () => boolean,
  stateReason: () => string, open: () => void) {
  const root = doc.createElement("details"), summary = doc.createElement("summary");
  root.id = "properties-paragraph-list"; root.open = true; summary.textContent = "문단 번호·글머리표·개요"; root.append(summary);
  const values = doc.createElement("dl"), more = doc.createElement("button"), note = doc.createElement("output");
  more.type = "button"; more.textContent = "문단 번호·글머리표…"; more.dataset.paragraphListProperties = "open";
  note.setAttribute("aria-live", "polite"); root.append(values, more, note);
  let rendered = "";
  function sync() {
    root.hidden = editor.selection.kind === "object";
    if (root.hidden) { values.replaceChildren(); rendered = ""; more.disabled = true; note.textContent = ""; return; }
    let rows: ReturnType<typeof paragraphListPanelRows> = [], reason = "";
    try { rows = paragraphListPanelRows(editor.formatState("paragraph")); } catch (error) { reason = String(error);rows=paragraphListPanelRows({}); }
    const key = JSON.stringify(rows);
    if (rendered !== key) { rendered = key; values.replaceChildren(); for (const row of rows) {
      const term = doc.createElement("dt"), value = doc.createElement("dd"); term.textContent = row.label; value.textContent = row.text;
      value.dataset.paragraphListProperty = row.key; value.dataset.mixed = String(row.mixed);value.dataset.valueState=row.status; values.append(term, value);
    } }
    const blocked = busy() || !!doc.querySelector("dialog[open]");
    const state = formatMenuState(editor, blocked, stateReason()).get("paragraph-lists");
    reason ||= state?.reason || (!state ? "현재 문단 번호 명령을 확인할 수 없습니다." : "");
    more.disabled = !!reason; more.title = reason || "현재 선택의 기존 문단 번호·글머리표·개요 설정창 열기";
    note.textContent = reason || "공통값·혼합 조회 · 참조 ID는 실제 표시 번호가 아닙니다. 변경·취소는 기존 설정창에서 처리합니다."; note.title = note.textContent;
  }
  more.onclick = () => { sync(); if (!more.disabled) open(); };
  return {root, sync, dispose() { root.remove(); }};
}
