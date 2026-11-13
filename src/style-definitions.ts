import type { RhwpAdapter } from "./adapter.js";
import { type Props, type Position } from "./model.js";
import { matches } from "./formatting.js";

export type StyleRow = { id: number; name: string; englishName: string; type: number; nextStyleId: number; paraShapeId: number; charShapeId: number };
export type StyleMutation =
  | { operation: "create"; baseId: number; name: string; englishName: string; nextStyleId: number; char?: Props; paragraph?: Props }
  | { operation: "update"; id: number; name: string; englishName: string; nextStyleId: number; char?: Props; paragraph?: Props }
  | { operation: "delete"; id: number };
export const styleCharFields = ["fontFamily", "fontSize", "bold", "italic", "underline", "textColor"] as const;
export const styleParaFields = ["alignment", "indent", "marginLeft", "marginRight", "spacingBefore", "spacingAfter"] as const;
export function styleCatalog(a: RhwpAdapter): StyleRow[] {
  for (const key of ["getStyleList", "getStyleDetail", "createStyle", "updateStyle", "updateStyleShapes", "deleteStyle"] as const)
    if (typeof a.doc[key] !== "function") throw Error("NOT_SUPPORTED: 설치 Core의 스타일 관리 API가 없습니다.");
  const rows = a.call<StyleRow[]>("getStyleList");
  if (!Array.isArray(rows) || !rows.length || rows.length > 256 || rows.some((s, id) =>
    s.id !== id || ![0, 1].includes(s.type) || typeof s.name !== "string" || typeof s.englishName !== "string" ||
    ![s.charShapeId, s.paraShapeId, s.nextStyleId].every(v => Number.isSafeInteger(v) && v >= 0) || s.nextStyleId >= rows.length))
    throw Error("스타일 목록/참조를 확인할 수 없습니다.");
  return rows;
}
export function styleDetail(a: RhwpAdapter, row: StyleRow) {
  const detail = a.call("getStyleDetail", row.id);
  if (!detail.charProps || !detail.paraProps || detail.charProps.charShapeId !== row.charShapeId ||
      detail.paraProps.paraShapeId !== row.paraShapeId)
    throw Error("NOT_SUPPORTED: 스타일의 기본/실효 모양 참조가 달라 편집을 보류합니다. 이름 편집은 가능합니다.");
  return detail;
}
// Core deleteStyle does not recursively remap every nested/control list. A full
// census must be possible before admitting shape propagation or deletion.
export function styleReferences(a: RhwpAdapter, id: number) {
  const controls = a.call<any[]>("getControls"), lists = a.call("getCursorModel").lists;
  if (!Array.isArray(controls) || controls.some(c => !["secd", "cold", "tbl"].includes(c.ctrlId)) ||
      !Array.isArray(lists) || lists.some((l: any) => !l.isCell || l.hostListId !== 0))
    throw Error("NOT_SUPPORTED: 중첩 표·머리말·각주·개체의 스타일 참조를 완전히 조회할 수 없어 모양 편집/삭제를 보류합니다.");
  const body: Position[] = [], cells: Position[] = [];
  let total = 0;
  for (let sec = 0; sec < a.doc.getSectionCount(); sec++) {
    const count = a.doc.getParagraphCount(sec);
    if (!Number.isSafeInteger(count) || count < 0 || (total += count) > 100000) throw Error("스타일 참조 조회 범위 초과");
    for (let para = 0; para < count; para++) {
      const current = a.call("getStyleAt", sec, para);
      if (!Number.isSafeInteger(current.id)) throw Error("본문 스타일 참조 조회 실패");
      if (current.id === id) body.push({ kind: "body", sec, para, offset: 0 });
    }
  }
  for (const l of lists) {
    if (!Number.isSafeInteger(l.paraCount) || l.paraCount < 0 || (total += l.paraCount) > 100000) throw Error("셀 스타일 참조 조회 범위 초과");
    for (let cellPara = 0; cellPara < l.paraCount; cellPara++) {
      const current = a.call("getCellStyleAt", l.sectionIndex, l.hostPara, l.controlIndex, l.cellIndex, cellPara);
      if (!Number.isSafeInteger(current.id)) throw Error("셀 스타일 참조 조회 실패");
      if (current.id === id) cells.push({ kind: "cell", sec: l.sectionIndex, para: l.hostPara, control: l.controlIndex, cell: l.cellIndex, cellPara, offset: 0 });
    }
  }
  return { body, cells };
}
export function styleDeleteReason(a: RhwpAdapter, row: StyleRow, rows = styleCatalog(a)) {
  try {
    if (row.id === 0) throw Error("바탕글 스타일은 삭제할 수 없습니다.");
    if (row.type !== 0) throw Error("글자 스타일 관리는 미지원입니다.");
    if (row.id !== rows.length - 1) throw Error("NOT_SUPPORTED: 다른 스타일 ID의 재매핑을 피하기 위해 마지막 스타일만 삭제할 수 있습니다.");
    if (rows.some(s => s.id !== row.id && s.nextStyleId === row.id)) throw Error("다른 스타일의 다음 스타일 참조가 있어 삭제할 수 없습니다.");
    const refs = styleReferences(a, row.id);
    if (refs.body.length || refs.cells.length) throw Error("사용 중인 스타일은 삭제할 수 없습니다. 미사용 마지막 스타일만 지원합니다.");
    return "";
  } catch (e) { return String(e); }
}
export function styleShapeReason(a: RhwpAdapter, row: StyleRow) {
  try {
    styleDetail(a, row);
    const refs = styleReferences(a, row.id);
    if (refs.cells.length) throw Error("NOT_SUPPORTED: 셀이 사용하는 스타일의 모양 편집은 실제 참조 보존 검증 전까지 보류합니다.");
    for (const p of refs.body) a.assertEditable(p);
    return "";
  } catch (e) { return String(e); }
}
function name(value: unknown, optional = false): string {
  if (typeof value !== "string" || (!optional && !value) || Array.from(value).length > 64 || value.trim() !== value || /[\u0000-\u001f\u007f"\\]/.test(value))
    throw Error("스타일 이름은 앞뒤 공백·제어문자·따옴표·역슬래시 없이 1~64자로 입력하세요. 영문 이름은 비울 수 있습니다.");
  return value;
}
function shapeInput(char: Props, para: Props) {
  for (const [k, v] of Object.entries(char)) {
    if (!(styleCharFields as readonly string[]).includes(k)) throw Error("이번 스타일 창에서 지원하지 않는 글자 모양입니다.");
    if (k === "fontFamily" && (typeof v !== "string" || !v.trim() || v.length > 200 || /[\u0000-\u001f]/.test(v))) throw Error("글꼴 이름을 확인하세요.");
    if (k === "fontSize" && (!Number.isSafeInteger(v) || Number(v) < 100 || Number(v) > 20000)) throw Error("스타일 크기는 1~200pt입니다.");
    if (["bold", "italic", "underline"].includes(k) && typeof v !== "boolean") throw Error("잘못된 글자 모양 값입니다.");
    if (k === "textColor" && (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v))) throw Error("글자색은 #RRGGBB 형식입니다.");
  }
  for (const [k, v] of Object.entries(para)) {
    if (k === "spacingUnitScale" && v === 1) continue;
    if (!(styleParaFields as readonly string[]).includes(k)) throw Error("이번 스타일 창에서 지원하지 않는 문단 모양입니다.");
    if (k === "alignment") { if (!["left", "right", "center", "justify", "distribute", "split"].includes(String(v))) throw Error("잘못된 정렬입니다."); }
    else if (!Number.isSafeInteger(v) || Number(v) < (k === "indent" ? -40000 : 0) || Number(v) > (k.startsWith("spacing") ? 100000 : 200000)) throw Error("문단 간격 범위를 확인하세요.");
  }
}
// Validate and compute a delta BEFORE History. Actual Core mutations occur only
// inside the returned transaction closure; no export/reload or XML editing.
export function prepareStyleMutation(a: RhwpAdapter, request: StyleMutation): (() => number) | undefined {
  if (a.scope !== "edit" || a.documentLocked) throw Error("읽기 전용 문서입니다.");
  if (!request || !["create", "update", "delete"].includes(request.operation)) throw Error("잘못된 스타일 관리 요청입니다.");
  const rows = styleCatalog(a), create = request.operation === "create";
  const id = create ? request.baseId : request.id;
  const row = rows[id];
  if (!Number.isSafeInteger(id) || !row || row.type !== 0) throw Error("문단 스타일만 관리할 수 있습니다.");
  if (request.operation === "delete") {
    const reason = styleDeleteReason(a, row, rows); if (reason) throw Error(reason);
    return () => {
      if (!a.doc.deleteStyle(id)) throw Error("Core 스타일 삭제 실패");
      const after = styleCatalog(a); if (after.length !== rows.length - 1 || JSON.stringify(after) !== JSON.stringify(rows.slice(0, -1))) throw Error("스타일 삭제 후 다른 참조가 변경되었습니다.");
      return 0;
    };
  }
  const metadata = { name: !create && request.name === row.name ? row.name : name(request.name), englishName: !create && request.englishName === row.englishName ? row.englishName : name(request.englishName, true), nextStyleId: request.nextStyleId };
  if (!Number.isSafeInteger(metadata.nextStyleId) || !rows[metadata.nextStyleId] || ((create || metadata.nextStyleId !== row.nextStyleId) && rows[metadata.nextStyleId].type !== 0)) throw Error("다음 문단 스타일을 선택하세요.");
  if ((create || metadata.name !== row.name) && rows.some(s => s.name === metadata.name && (create || s.id !== id))) throw Error("같은 이름의 스타일이 있습니다.");
  if (create && rows.length >= 256) throw Error("스타일 ID 범위(0~255)를 초과합니다.");
  const char = { ...request.char }, para = request.paragraph ?? {};
  if (typeof char.textColor === "string") char.textColor = char.textColor.toLowerCase();
  shapeInput(char, para);
  const hasShape = Object.keys(char).length || Object.keys(para).length;
  const detail = hasShape ? styleDetail(a, row) : undefined;
  const charDelta = Object.fromEntries(Object.entries(char).filter(([k,v]) => !matches("char", detail!.charProps, k, v, char)));
  const paraDelta = Object.fromEntries(Object.entries(para).filter(([k,v]) => !matches("paragraph", detail!.paraProps, k, v, para)));
  if (("spacingBefore" in paraDelta || "spacingAfter" in paraDelta) && "spacingUnitScale" in para) paraDelta.spacingUnitScale = para.spacingUnitScale;
  const metadataChanged = Object.entries(metadata).some(([k,v]) => row[k as keyof StyleRow] !== v);
  if (!create && !metadataChanged && !Object.keys(charDelta).length && !Object.keys(paraDelta).length) return;
  if (!create && (Object.keys(charDelta).length || Object.keys(paraDelta).length)) { const reason = styleShapeReason(a,row); if (reason) throw Error(reason); }
  return () => {
    const target = create ? a.doc.createStyle(JSON.stringify({ ...metadata, type: 0, baseCharShapeId: row.charShapeId, baseParaShapeId: row.paraShapeId })) : id;
    if (!Number.isSafeInteger(target) || target !== (create ? rows.length : id)) throw Error("Core 스타일 생성 ID 불일치");
    if (!create && metadataChanged && !a.doc.updateStyle(id, JSON.stringify(metadata))) throw Error("Core 스타일 이름 편집 실패");
    const coreChar = { ...charDelta };
    if (typeof coreChar.fontFamily === "string") {
      const family = coreChar.fontFamily; delete coreChar.fontFamily;
      const ids = Array.from({ length: 7 }, (_, lang) => a.doc.findOrCreateFontIdForLang(lang, family));
      if (ids.some(id => !Number.isSafeInteger(id) || id < 0 || id > 65535)) throw Error("스타일 글꼴 참조 등록 실패");
      coreChar.fontIds = ids;
    }
    if ((Object.keys(charDelta).length || Object.keys(paraDelta).length) && !a.doc.updateStyleShapes(target, JSON.stringify(coreChar), JSON.stringify(paraDelta))) throw Error("Core 스타일 모양 편집 실패");
    const actual = styleCatalog(a)[target];
    if (Object.entries(metadata).some(([k,v]) => actual[k as keyof StyleRow] !== v)) throw Error("스타일 메타데이터 반영 실패");
    const observed = (create || hasShape) ? styleDetail(a,actual) : undefined;
    for (const [kind, props, raw] of [["char",charDelta,observed?.charProps],["paragraph",paraDelta,observed?.paraProps]] as const)
      for (const [k,v] of Object.entries(props)) if (!matches(kind,raw,k,v,props)) throw Error("스타일 기본 모양 반영 실패: " + k);
    if (!Object.keys(charDelta).length && actual.charShapeId !== row.charShapeId) throw Error("글자 기본 참조 복제 실패");
    if (!Object.keys(paraDelta).length && actual.paraShapeId !== row.paraShapeId) throw Error("문단 기본 참조 복제 실패");
    return target;
  };
}
