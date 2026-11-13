import type { RhwpAdapter } from "./adapter.js";
import type { Position } from "./model.js";
/** Root-body control IDs are supplied by Core; unknown controls stay blocked. */
export function assertPictureFreeTextEdit(a: RhwpAdapter, p: Position) {
  if (p.kind !== "body") return;
  a.validate(p);
  const positions = a.call<number[]>("getControlTextPositions", p.sec, p.para);
  if (!positions.length) return;
  // getControls uses one flat body paragraph index across sections (list 0).
  let para = p.para;
  for (let sec = 0; sec < p.sec; sec++) para += a.doc.getParagraphCount(sec);
  const controls = a.call<{ list: number; para: number; controlIndex: number; ctrlId: string }[]>("getControls")
    .filter(c => c.list === 0 && c.para === para);
  if (controls.length !== positions.length || new Set(controls.map(c => c.controlIndex)).size !== positions.length)
    throw Error("문단 개체의 종류·위치를 확인할 수 없어 치환을 보류합니다.");
  for (let control = 0; control < positions.length; control++) {
    const row = controls.find(c => c.controlIndex === control);
    // Only these existing non-graphic controls are known safe here. Search's
    // existing inline-crossing/range/protection checks still run afterwards.
    if (row && ["secd", "cold", "tbl"].includes(row.ctrlId)) continue;
    throw Error("그림 또는 종류가 확인되지 않은 개체가 붙은 본문 문단의 텍스트 치환은 개체 보존이 확인되지 않아 지원하지 않습니다. 다른 문단을 선택하세요.");
  }
}
