import { withoutViewMarkers } from "./view-markers.js";
import type { RhwpAdapter } from "./adapter.js";
export function parsePrintRange(value: string, total: number): number[] {
  if (!Number.isInteger(total) || total < 1)
    throw Error("인쇄할 페이지가 없습니다.");
  if (!value.trim()) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set<number>();
  for (const part of value.split(",")) {
    const m = /^\s*([1-9]\d*)(?:\s*-\s*([1-9]\d*))?\s*$/.exec(part);
    if (!m) throw Error("쪽 범위 예: 1-3,5");
    const from = Number(m[1]),
      to = Number(m[2] ?? m[1]);
    if (from > to || to > total) throw Error("문서의 쪽 범위를 확인하세요.");
    for (let p = from; p <= to; p++) pages.add(p - 1);
  }
  return [...pages].sort((a, b) => a - b);
}
export function printSnapshot(a: RhwpAdapter, range: string) {
  const id = a.documentId,
    revision = a.revision;
  const pages = withoutViewMarkers(a, () => parsePrintRange(range, a.pageCount).map((page) => {
    const info = a.call("getPageInfo", page);
    if (
      !Number.isFinite(info.width) ||
      !Number.isFinite(info.height) ||
      info.width <= 0 ||
      info.height <= 0
    )
      throw Error("페이지 크기 조회 실패");
    return {
      page,
      width: info.width,
      height: info.height,
      margins:{left:info.marginLeft,right:info.marginRight,top:info.marginTop,bottom:info.marginBottom},
      svg: a.doc.renderPageSvg(page),
    };
  }));
  if (a.documentId !== id || a.revision !== revision)
    throw Error("인쇄 자료 준비 중 문서가 변경되었습니다.");
  return { documentId: id, revision, pages };
}
