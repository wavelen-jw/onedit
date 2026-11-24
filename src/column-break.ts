import { editorFeedbackText } from "./editor-feedback-text.js";
import type { RhwpAdapter } from "./adapter.js";
import type { Selection } from "./model.js";
import { pageBreakReason } from "./page-break.js";
import { columnEditReason, columnView } from "./columns.js";

// Reuse the proven body/control and existing column-definition contracts.
// insertColumnBreak owns the split + explicit column break; never emulate Enter.
export function columnBreakTarget(a: RhwpAdapter, s: Selection, labelAsColumn = false) {
  const reason = pageBreakReason(a, s);
  if (reason) throw Error(labelAsColumn ? reason.replaceAll("쪽 나누기", "단 나누기") : reason);
  if (s.kind !== "caret" || s.focus.kind !== "body")
    throw Error(labelAsColumn ? "단 나누기 본문 커서를 확인하세요." : "본문 커서를 확인하세요.");
  const p = s.focus, columns = columnView(a, p.sec), blocked = columnEditReason(a, s, columns);
  if (blocked) throw Error(blocked);
  return {p, columns};
}

function target(a: RhwpAdapter, s: Selection) {
  const {p, columns} = columnBreakTarget(a, s, true);
  if (typeof a.doc.insertColumnBreak !== "function") throw Error("기존 Core 단 나누기 API가 없습니다.");
  return {p, columns};
}
export function columnBreakReason(a: RhwpAdapter, s: Selection) {
  try { target(a, s); return ""; } catch (error) { return editorFeedbackText(error); }
}
export function prepareColumnBreak(a: RhwpAdapter, s: Selection): () => Selection {
  const { p, columns } = target(a, s), before = [...a.text(p)], at = a.textOffset(p), count = a.doc.getParagraphCount(p.sec);
  return () => {
    const r = a.call("insertColumnBreak", p.sec, p.para, p.offset), next = { ...p, para: p.para + 1, offset: 0 };
    if (r.paraIdx !== next.para || r.charOffset !== 0 || a.doc.getParagraphCount(p.sec) !== count + 1 ||
      a.text(p) !== before.slice(0, at).join("") || a.text(next) !== before.slice(at).join("") ||
      JSON.stringify(columnView(a, p.sec)) !== JSON.stringify(columns))
      throw Error("단 나누기의 실제 문단·문자 위치·단 정의가 일치하지 않아 취소했습니다.");
    return { kind: "caret", focus: next };
  };
}
