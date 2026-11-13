import { cellDialogFor } from "./cell-dialog-command.js";
import type { Interaction } from "./interaction.js";
import type { FormatState } from "./formatting.js";
import { fields } from "./integration/a-format-dialog.js";
import { formatValueState, formatValueHint } from "./format-value-state.js";

// The existing cell dialog owns enums/units. This panel only projects its values.
export function cellPanelRows(state: FormatState) {
  return fields("cell").map(field => {
    const value = state[field.name], status = formatValueState(state,field.name), mixed = status === "mixed";
    const option = field.options?.find(([v]) => v === String(value));
    return {key: field.name, label: field.label, mixed, status,
      text: status!=="common" ? formatValueHint(status) : option?.[1] ?? String(value)};
  });
}
export function mountCellPropertiesPanel(doc: Document, editor: Interaction, busy: () => boolean,
  restoreFocus: () => void, stateReason: () => string) {
  const root = doc.createElement("details"), summary = doc.createElement("summary");
  root.id = "properties-cell"; root.open = true; root.hidden = true;
  summary.textContent = "셀 속성"; root.append(summary);
  const values = doc.createElement("dl"); values.dataset.cellSummary = ""; root.append(values);
  const more = doc.createElement("button"); more.type = "button"; more.textContent = "셀 속성…"; more.dataset.cellProperties = "open";
  const note = doc.createElement("output"); note.setAttribute("aria-live", "polite"); root.append(more, note);
  const command = cellDialogFor(doc);
  const unbind = command?.bind(more, "properties", "셀 속성…");
  let rendered = "";
  function sync() {
    const active = editor.selection.focus.kind === "cell" && editor.selection.kind !== "object";
    root.hidden = !active;
    if (!active) { values.replaceChildren(); rendered = ""; more.disabled = true; note.textContent = ""; return; }
    let rows: ReturnType<typeof cellPanelRows> = [], reason = "";
    try { rows = cellPanelRows(editor.formatState("cell")); }
    catch (error) { reason = String(error);rows=cellPanelRows({}); }
    root.dataset.queryState=reason?"unavailable":"queried";
    const key = JSON.stringify(rows);
    if (key !== rendered) {
      values.replaceChildren(); rendered = key;
      for (const row of rows) {
        const term = doc.createElement("dt"), value = doc.createElement("dd");
        term.textContent = row.label; value.textContent = row.text; value.dataset.cellProperty = row.key; value.dataset.mixed = String(row.mixed);value.dataset.valueState=row.status; values.append(term, value);
      }
    }
    if (!reason) reason = stateReason();
    // The registry owns disabled/title for this entrance. This panel owns
    // its exact displayed field values and never dispatches through a source button.
    note.textContent = reason || "공통값·혼합 조회 · 변경은 기존 셀 속성 창에서 적용/취소합니다. 병합·중첩·공유 테두리 제한은 그대로 유지됩니다.";
    note.title = note.textContent;
  }
  more.onclick = () => { command?.open("properties"); };
  // No local drafts or document setters: the original modal pins target/revision,
  // applies one existing Command, and owns Escape/History/editor focus restoration.
  return {root, sync, dispose() { unbind?.(); if (root.contains(doc.activeElement)) restoreFocus(); root.remove(); }};
}
