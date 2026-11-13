import type { RhwpAdapter } from "./adapter.js";
import { type Position, nested } from "./model.js";

// Internal Studio bridge only. The Command's styleTargets guard owns admission;
// in particular, the ordinary-cell mutation branch remains unreachable in UI.
function target(a: RhwpAdapter, p: Position) {
  a.validate(p);
  if (nested(p)) throw Error("중첩 셀 스타일 적용은 미지원입니다");
}
export function styleAt(
  a: RhwpAdapter,
  p: Position,
): { id: number; name: string } {
  target(a, p);
  return p.kind === "body"
    ? a.call("getStyleAt", p.sec, p.para)
    : a.call("getCellStyleAt", p.sec, p.para, p.control, p.cell, p.cellPara);
}
export function observeStyle(a: RhwpAdapter, p: Position) {
  const binding = { documentId: a.documentId, revision: a.revision };
  const style = styleAt(a, p),
    detail = a.call("getStyleDetail", style.id);
  const paragraph = a.paraProps(p);
  const length = Array.from(a.text(p)).length;
  const runs: {
    startOffset: number;
    endOffset: number;
    charShapeId: number;
  }[] =
    p.kind === "body"
      ? a.call("getCharShapeRuns", p.sec, p.para, 0, length)
      : a.call(
          "getCharShapeRunsInCellByPath",
          p.sec,
          p.para,
          a.path(p),
          0,
          length,
        );
  // Empty paragraphs still have a typing/paragraph character reference.
  const characters = (runs.length ? runs : [{ startOffset: 0 }]).map((run) => {
    const at = {
      ...p,
      offset:
        p.kind === "body" ? a.logical(p, run.startOffset) : run.startOffset,
    };
    return { offset: run.startOffset, properties: a.charProps(at) };
  });
  const ids = [
    detail.paraProps.paraShapeId,
    detail.charProps.charShapeId,
    paragraph.paraShapeId,
    ...characters.map((c) => c.properties.charShapeId),
  ];
  if (
    !Number.isSafeInteger(style.id) ||
    style.id < 0 ||
    !ids.every((id) => Number.isSafeInteger(id) && Number(id) >= 0)
  )
    throw Error("스타일 실제 서식 참조를 확인할 수 없습니다.");
  if (
    runs.some(
      (run) =>
        characters.find((c) => c.offset === run.startOffset)?.properties
          .charShapeId !== run.charShapeId,
    )
  )
    throw Error("스타일 글자 서식 조회가 일치하지 않습니다.");
  if (binding.documentId !== a.documentId || binding.revision !== a.revision)
    throw Error("스타일 조회 대상 문서 또는 리비전이 변경되었습니다.");
  return {
    ...binding,
    target: structuredClone(p),
    style,
    paragraph,
    characters,
    defaults: { paragraph: detail.paraProps, character: detail.charProps },
    paragraphMatchesDefault:
      paragraph.paraShapeId === detail.paraProps.paraShapeId,
    characterReferences: [
      ...new Set(characters.map((c) => c.properties.charShapeId)),
    ],
    differingCharacterRuns: characters.filter(
      (c) => c.properties.charShapeId !== detail.charProps.charShapeId,
    ).length,
  };
}
export function applyStyleAt(
  a: RhwpAdapter,
  p: Position,
  id: number,
  resetDirect = false,
) {
  target(a, p);
  a.assertEditable(p);
  if (resetDirect && p.kind !== "body")
    throw Error("NOT_SUPPORTED: 스타일 기본값 초기화는 본문 문단만 지원합니다.");
  if (
    resetDirect &&
    (typeof a.doc.setParaShapeId !== "function" ||
      typeof a.doc.setCharShapeId !== "function")
  )
    throw Error("NOT_SUPPORTED: 설치 Core의 스타일 참조 복원 API가 필요합니다.");
  if (p.kind === "body") a.call("applyStyle", p.sec, p.para, id);
  else
    a.call("applyCellStyle", p.sec, p.para, p.control, p.cell, p.cellPara, id);
  let actual = observeStyle(a, p);
  if (resetDirect) {
    // Only explicit reset consumes the existing native ID-restoration APIs.
    // Never reinterpret getter JSON (display units) as formatting properties.
    if (!actual.paragraphMatchesDefault)
      a.call("setParaShapeId", p.sec, p.para, actual.defaults.paragraph.paraShapeId);
    if (actual.differingCharacterRuns)
      a.call(
        "setCharShapeId", p.sec, p.para, 0,
        Array.from(a.text(p)).length, actual.defaults.character.charShapeId,
      );
    actual = observeStyle(a, p);
    if (!actual.paragraphMatchesDefault || actual.differingCharacterRuns)
      throw Error("스타일 기본값 초기화가 실제 문단·글자 참조에 반영되지 않았습니다.");
  }
  if (actual.style.id !== id)
    throw Error("선택한 스타일 ID가 실제 문단에 반영되지 않았습니다.");
  return actual;
}
