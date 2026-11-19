import type { RhwpAdapter } from "./adapter.js";
import { coreRuntimeHasCapability } from "./core-runtime.js";
import type { Selection } from "./model.js";

type RootControl = { list:number; para:number; ctrlId:string; userDesc:string; props?:{Lock?:boolean} };
const documentDefinitions = new Set(["secd", "cold", "head", "foot"]);
const movableObjects = new Set(["tbl", "gso", "eqed"]);
function paragraphControls(a: RhwpAdapter, root: number, count = 1) {
  return a.call<RootControl[]>("getControls").filter(c => c.list === 0 && c.para >= root && c.para < root + count);
}

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
  const controls = paragraphControls(a, rootPara);
  if (controls.some(c => c.props?.Lock || (!documentDefinitions.has(c.ctrlId) && !movableObjects.has(c.ctrlId))))
    throw Error("필드나 보호된 개체가 있는 문단은 쪽을 나눌 수 없습니다.");
  return {p, rootPara, controls};
}
export function pageBreakReason(a: RhwpAdapter, s: Selection) {
  try { target(a, s); return ""; } catch (error) { return String(error).replace(/^Error: /, ""); }
}
export function preparePageBreak(a: RhwpAdapter, s: Selection): () => Selection {
  const {p, rootPara, controls} = target(a, s);
  const before = [...a.text(p)], count = a.doc.getParagraphCount(p.sec), offset = a.textOffset(p);
  const identities = (rows: RootControl[]) => rows.map(c => [c.ctrlId, c.userDesc, c.props]);
  return () => {
    // Same logical offset contract as the original splitParagraph path.
    const r = a.call("insertPageBreak", p.sec, p.para, p.offset);
    const next = { ...p, para: p.para + 1, offset: 0 };
    const after = paragraphControls(a, rootPara, 2);
    if (r.paraIdx !== next.para || r.charOffset !== 0 || a.doc.getParagraphCount(p.sec) !== count + 1 ||
      a.text(p) !== before.slice(0, offset).join("") || a.text(next) !== before.slice(offset).join("") ||
      after.some(c => c.para !== rootPara && documentDefinitions.has(c.ctrlId)) ||
      JSON.stringify(identities(after.filter(c => documentDefinitions.has(c.ctrlId)))) !==
        JSON.stringify(identities(controls.filter(c => documentDefinitions.has(c.ctrlId)))) ||
      JSON.stringify(identities(after.filter(c => movableObjects.has(c.ctrlId)))) !==
        JSON.stringify(identities(controls.filter(c => movableObjects.has(c.ctrlId)))) ||
      after.length !== controls.length)
      throw Error("쪽 나누기 후 문단이나 개체가 일치하지 않아 취소했습니다.");
    return { kind: "caret", focus: next };
  };
}
