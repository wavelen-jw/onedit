import type { RhwpAdapter } from "./adapter.js";
import type { Selection } from "./model.js";
import { pageBreakReason } from "./page-break.js";
import { columnEditReason, columnView } from "./columns.js";

// Reuse the proven body/control and existing column-definition contracts.
// insertColumnBreak owns the split + explicit column break; never emulate Enter.
function target(a: RhwpAdapter, s: Selection) {
  const reason = pageBreakReason(a, s).replaceAll("쪽 나누기", "단 나누기");
  if (reason) throw Error(reason);
  if (s.kind !== "caret" || s.focus.kind !== "body") throw Error("단 나누기 본문 커서를 확인하세요.");
  const columns = columnView(a, s.focus.sec), blocked = columnEditReason(a, s, columns);
  if (blocked) throw Error(blocked);
  if (typeof a.doc.insertColumnBreak !== "function") throw Error("기존 Core 단 나누기 API가 없습니다.");
  return { p: s.focus, columns };
}
export function columnBreakReason(a: RhwpAdapter, s: Selection) {
  try { target(a, s); return ""; } catch (error) { return String(error).replace(/^Error: /, ""); }
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
