import type { Interaction } from "./interaction.js";
import { selectedPicture, pictureCanvasPlacement,cellPictureSizeNote } from "./pictures.js";

const placements: Record<string, string> = {Square: "어울림", TopAndBottom: "자리 차지", BehindText: "글 뒤로", InFrontOfText: "글 앞으로"};
// Read the exact existing object selection. Never infer a target from its paragraph.
export function picturePanelState(editor: Interaction) {
  const picture = selectedPicture(editor.adapter, editor.selection), p = picture.props;
  const placement = p.treatAsChar ? "글자처럼 취급" : placements[p.textWrap];
  return {rows: [
    {key: "width", label: "너비 (pt)", text: Number.isFinite(p.width) ? String(p.width / 100) : "조회 불가"},
    {key: "height", label: "높이 (pt)", text: Number.isFinite(p.height) ? String(p.height / 100) : "조회 불가"},
    {key: "placement", label: "본문과의 배치", text: placement || "기존 배치 · 편집 미지원"},
    {key: "canvas", label: "캔버스 선택", text: picture.cellPath ? "일반셀 단일 그림 · 속성 창 사용" : !pictureCanvasPlacement(p).supported ? "좌표 미검증 · 목록 사용" : pictureCanvasPlacement(p).click ? "지원" : "목록 선택 후 크기 핸들 사용"},
  ], unsupported: placement ? "" : "현재 그림 배치의 편집은 미지원입니다."};
}
export function mountPicturePropertiesPanel(doc: Document, editor: Interaction, busy: () => boolean, stateReason: () => string) {
  const root = doc.createElement("details"), summary = doc.createElement("summary"); root.id = "properties-picture"; root.open = true; root.hidden = true;
  summary.textContent = "그림 속성"; root.append(summary);
  const values = doc.createElement("dl"); root.append(values);
  const more = doc.createElement("button"); more.type = "button"; more.textContent = "그림 속성…"; more.dataset.pictureProperties = "open";
  const note = doc.createElement("output"); note.setAttribute("aria-live", "polite"); root.append(more, note);
  const source = () => doc.getElementById("picture-properties") as HTMLButtonElement | null;
  let rendered = "";
  function sync() {
    root.hidden = editor.selection.kind !== "object";
    if (root.hidden) { values.replaceChildren(); rendered = ""; more.disabled = true; note.textContent = ""; return; }
    let rows: ReturnType<typeof picturePanelState>["rows"] = [], reason = "";
    try { const state = picturePanelState(editor); rows = state.rows; reason = state.unsupported; } catch (error) { reason = String(error); }
    const key = JSON.stringify(rows);
    if (key !== rendered) { rendered = key; values.replaceChildren(); for (const row of rows) {
      const term = doc.createElement("dt"), value = doc.createElement("dd"); term.textContent = row.label; value.textContent = row.text; value.dataset.pictureProperty = row.key; values.append(term, value);
    } }
    if (!reason) reason = stateReason() || (busy() || doc.querySelector("dialog[open]") ? "입력·저장 또는 열린 대화상자를 먼저 마치세요." : "");
    if (!reason) { try { editor.adapter.assertEditable(editor.selection.focus); } catch (error) { reason = String(error); } }
    if (!reason && (!source() || source()!.disabled)) reason = "현재 그림 속성 명령을 사용할 수 없습니다.";
    more.disabled = !!reason; more.title = reason || (editor.selection.focus.kind==='cell' ? "선택한 일반셀 그림의 크기 속성 창 열기" : "선택한 본문 그림의 기존 속성 창 열기");
    note.textContent = reason || (editor.selection.focus.kind==='cell' ? cellPictureSizeNote : "본문 그림 한 개 · 비율 유지·적용/취소는 기존 그림 속성 창을 사용합니다. 복수·중첩·그룹·회전·자르기 편집은 미지원입니다."); note.title = note.textContent;
  }
  more.onclick = () => { sync(); if (!more.disabled) source()?.click(); };
  return {root, sync, dispose() { root.remove(); }};
}
