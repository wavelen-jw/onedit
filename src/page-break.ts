import type { RhwpAdapter } from "./adapter.js";
import { coreRuntimeHasCapability } from "./core-runtime.js";
import type { Selection } from "./model.js";

// Existing insertPageBreak is a logical-cursor split + explicit page break;
// pageBreakBefore formatting and ordinary Enter are different operations.
function target(a: RhwpAdapter, s: Selection) {
  if (!coreRuntimeHasCapability(a.doc, 'page-break'))
    throw Error("쪽 나누기 저장·표시를 확인한 개발 Core가 아닙니다.");
  if (s.kind !== "caret" || s.focus.kind !== "body")
    throw Error("쪽 나누기는 본문 한 곳에 커서를 놓으세요. 셀·범위·개체 선택은 지원하지 않습니다.");
  const p = s.focus; a.validate(p); a.assertEditable(p);
  if (typeof a.doc.insertPageBreak !== "function") throw Error("기존 Core 쪽 나누기 API가 없습니다.");
  const rootPara = Array.from({ length: p.sec }, (_, sec) => a.doc.getParagraphCount(sec)).reduce((n, c) => n + c, 0) + p.para;
  const controls = a.call<any[]>("getControls").filter(c => c.list === 0 && c.para === rootPara);
  if (controls.some(c => c.props?.Lock || !["secd", "cold"].includes(c.ctrlId)))
    throw Error("개체·필드가 있는 문단의 쪽 나누기는 미검증입니다. 본문 텍스트 문단을 선택하세요.");
  return p;
}
export function pageBreakReason(a: RhwpAdapter, s: Selection) {
  try { target(a, s); return ""; } catch (error) { return String(error).replace(/^Error: /, ""); }
}
export function preparePageBreak(a: RhwpAdapter, s: Selection): () => Selection {
  const p = target(a, s), before = [...a.text(p)], count = a.doc.getParagraphCount(p.sec);
  return () => {
    // Same logical offset contract as the original splitParagraph path.
    const r = a.call("insertPageBreak", p.sec, p.para, p.offset);
    const next = { ...p, para: p.para + 1, offset: 0 };
    if (r.paraIdx !== next.para || r.charOffset !== 0 || a.doc.getParagraphCount(p.sec) !== count + 1 ||
      a.text(p) !== before.slice(0, p.offset).join("") || a.text(next) !== before.slice(p.offset).join(""))
      throw Error("쪽 나누기의 실제 문단·문자 위치가 일치하지 않아 취소했습니다.");
    return { kind: "caret", focus: next };
  };
}
