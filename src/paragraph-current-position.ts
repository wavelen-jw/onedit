import type { RhwpAdapter, NavigationRect } from './adapter.js';
import { paraIndex, samePosition, type Position, type Selection } from './model.js';

// Hancom quick hanging indent: keep the first line and align subsequent lines
// to the current caret. Geometry is read from Core, never DOM/client pixels.
export function exactParagraphPosition(a: RhwpAdapter, p: Position) {
  let list = 0, para = p.para;
  if (p.kind === 'body') for (let sec = 0; sec < p.sec; sec++) para += a.doc.getParagraphCount(sec);
  else { list = a.list(p).listId; para = paraIndex(p); }
  const raw = a.call('getParaShapeSet', list, para);
  if (![raw.LeftMargin, raw.Indentation].every(Number.isSafeInteger))
    throw Error('현재 문단의 정확한 여백·들여쓰기를 조회할 수 없습니다.');
  return { left: Number(raw.LeftMargin), indent: Number(raw.Indentation) };
}

export function prepareCurrentPosition(a: RhwpAdapter, s: Selection, caret: NavigationRect) {
  if (s.kind !== 'caret' && !(s.kind === 'text' && samePosition(s.anchor, s.focus)))
    throw Error('현재 위치에 맞추기는 한 문단의 커서에서 실행하세요. 블록 선택은 유지합니다.');
  const p = s.focus;
  a.validate(p); a.assertEditable(p); a.assertTextOnly(p);
  if (p.kind === 'body' && a.hasBodyLayoutObject(p))
    throw Error('개체를 포함한 본문 문단의 현재 위치 맞추기는 미지원입니다.');
  const props = a.paraProps(p);
  if (!['left', 'justify'].includes(String(props.alignment)) || !['None', 'none', '0'].includes(String(props.headType ?? 'None')))
    throw Error('현재 위치 맞추기는 왼쪽·양쪽 정렬의 일반 텍스트 문단만 지원합니다.');
  const original = exactParagraphPosition(a, p), first = a.navigationRect(a.rect({ ...p, offset: 0 }));
  const dpi = a.presentationDpi();
  if (!Number.isFinite(dpi) || dpi <= 0 || first.pageIndex !== caret.pageIndex || !Number.isFinite(caret.x))
    throw Error('같은 쪽의 문단 시작·현재 커서 좌표를 확인할 수 없습니다.');
  // Existing ParaShape values are 200 IR units/pt; Core coordinates use its DPI.
  const advance = Math.round((caret.x - first.x) * 14400 / dpi);
  const firstLeft = original.left + Math.max(original.indent, 0);
  const left = firstLeft + Math.min(advance, 0), indent = -advance;
  if (![left, indent].every(Number.isSafeInteger) || left < 0 || left > 200000 || indent < -40000 || indent > 200000)
    throw Error('현재 커서에 맞춘 문단 여백이 지원 범위를 벗어납니다. 기존 문단을 유지합니다.');
  const physicalProps = {
    marginLeft: left, indent,
    // The value comes from this command's current native caret geometry.
    ...(p.kind === 'body' && indent < 0 && indent % 2 !== 0
      ? { hwpxPhysicalIndent: true as const } : {}),
  };
  return { p, original, first, caret, expected: { left, indent }, props: physicalProps,
    unchanged: original.left === left && original.indent === indent };
}
