import type { RhwpAdapter } from "./adapter.js";
import type { Selection } from "./model.js";
import { pageBreakReason } from "./page-break.js";
import { columnEditReason, columnView } from "./columns.js";

// Inherit the existing definition only. The section getter/setter cannot edit
// the newly-created zone; never use it as a position-specific settings API.
function target(a: RhwpAdapter, s: Selection) {
  const reason = pageBreakReason(a, s);
  if (reason) throw Error(reason);
  if (s.kind !== "caret" || s.focus.kind !== "body") throw Error("본문 커서를 확인하세요.");
  const p = s.focus, view = columnView(a, p.sec), blocked = columnEditReason(a, s, view);
  if (blocked) throw Error(blocked);
  const at = a.textOffset(p), text = [...a.text(p)];
  // Boundary/object-owner variants retain their existing restrictions until
  // their UI selection contracts have direct acceptance.
  if (at <= 0 || at >= text.length) throw Error("본문 문단의 글자 사이에서 앞 단 설정을 이어 나눕니다. 새 단의 설정 지정은 아직 지원하지 않습니다.");
  if (typeof a.doc.breakAtCursor !== "function") throw Error("기존 Core 단 설정 나누기 API가 없습니다.");
  const stops = a.call<number[]>("getCaretStops", 0, p.para);
  const stream = stops[at];
  if (stops.length !== text.length + 1 || !Number.isSafeInteger(stream) || stream < 0)
    throw Error("단 설정을 나눌 실제 캐럿 위치를 확인할 수 없습니다.");
  return { p, at, text, stream };
}
export function columnDefinitionBreakReason(a: RhwpAdapter, s: Selection) {
  try { target(a, s); return ""; } catch (error) { return String(error).replace(/^Error: /, ""); }
}
export function prepareColumnDefinitionBreak(a: RhwpAdapter, s: Selection): () => Selection {
  const { p, at, text, stream } = target(a, s), count = a.doc.getParagraphCount(p.sec);
  return () => {
    const result = a.call("breakAtCursor", 0, p.para, stream, "colDef");
    if (result.ok !== true || result.para !== p.para + 1 || !Number.isSafeInteger(result.pos))
      throw Error("단 설정 나누기의 실제 반환 위치가 일치하지 않습니다.");
    const stops = a.call<number[]>("getCaretStops", 0, result.para);
    const scalar = stops.indexOf(result.pos), next = { ...p, para: result.para, offset: 0 };
    // Native stream slots and Edit logical offsets are different contracts.
    // Resolve the returned stop to its actual scalar, then use the existing
    // scalar->logical conversion. Never clamp/fallback to body offset zero.
    if (scalar < 0 || stops.length !== [...a.text(next)].length + 1)
      throw Error("단 설정 나누기의 반환 캐럿이 실제 문자 경계에 없습니다.");
    next.offset = a.logical(next, scalar);
    if (a.doc.getParagraphCount(p.sec) !== count + 1 || scalar !== 0 ||
        a.textOffset(next) !== scalar || a.text(p) !== text.slice(0, at).join("") || a.text(next) !== text.slice(at).join(""))
      throw Error("단 설정 나누기의 문단·내용·캐럿이 일치하지 않아 취소했습니다.");
    a.validate(next);
    return { kind: "caret", focus: next };
  };
}
