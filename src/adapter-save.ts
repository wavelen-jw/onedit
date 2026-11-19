import { RhwpAdapter } from "./adapter.js";
import { siblingDocument } from "./core-runtime.js";
import { result } from "./adapter-core.js";
import { projectSemanticParts } from "./adapter-semantic.js";
import { finishResponsiveWork } from "./responsive-work.js";

// Internal responsibility only; no state ownership or policy changes.
function exportLosslessHwpx(this: RhwpAdapter) {
    if (this.transientEdit) throw Error("한글 조합을 확정하거나 취소한 뒤 저장하세요.");
    if (this.viewerOnlyReason)
      throw Error(`${this.viewerOnlyReason} 원본 보존을 위해 이 읽기 전용 문서의 저장은 지원하지 않습니다.`);
    const out = this.doc.exportHwpxWithReport();
    let bytes: Uint8Array;
    try {
      const loss = result(out.contentLoss());
      if (loss.count !== 0)
        throw Error(
          "Core가 저장 시 내용 손실을 보고했습니다. 저장을 중단합니다.",
        );
      bytes = out.takeBytes();
    } finally {
      out.free();
    }
    return bytes;
}

export function exportCheckedHwpx(this: RhwpAdapter) {
    const bytes = exportLosslessHwpx.call(this);
    const reopened = new RhwpAdapter(siblingDocument(this.doc, bytes));
    try {
      if (
        JSON.stringify(reopened.semantic()) !== JSON.stringify(this.semantic())
      )
        throw Error("HWPX 재열기 내용·서식 검사 실패");
    } finally {
      reopened.doc.free();
    }
    return { bytes, documentId: this.documentId, revision: this.revision };
  }

// Retain the packed archive and cold semantic verification, with each
// top-level list compared row by row so one large JSON string is unnecessary.
export async function exportCheckedLocalHwpx(a: RhwpAdapter, current: () => boolean) {
    const {documentId, revision} = a;
    if (!a.transientEdit && !a.viewerOnlyReason) a.completeLocalBodyFlow();
    const bytes = exportLosslessHwpx.call(a);
    const reopened = new RhwpAdapter(siblingDocument(a.doc, bytes));
    try {
      const actual = await finishResponsiveWork(projectSemanticParts.call(reopened), current);
      const expected = await finishResponsiveWork(projectSemanticParts.call(a), current);
      const equal = await finishResponsiveWork(compareSemanticRows(actual, expected), current);
      if (!equal) throw Error("HWPX 재열기 내용·서식 검사 실패");
      if (!current()) throw Error("문서 작업 대상이 변경되었습니다. 다시 시도하세요.");
      return {bytes, documentId, revision};
    } finally {
      reopened.doc.free();
    }
}

function* compareSemanticRows(actual: Record<string, unknown>, expected: Record<string, unknown>) {
    const keys = Object.keys(expected).filter(key => expected[key] !== undefined);
    if (JSON.stringify(Object.keys(actual).filter(key => actual[key] !== undefined)) !== JSON.stringify(keys))
      return false;
    for (const key of keys) {
      const x = actual[key], y = expected[key];
      if (Array.isArray(x) && Array.isArray(y)) {
        if (x.length !== y.length) return false;
        for (let i = 0; i < x.length; i++) {
          if (JSON.stringify(x[i] ?? null) !== JSON.stringify(y[i] ?? null)) return false;
          yield;
        }
      } else if (JSON.stringify(x) !== JSON.stringify(y)) return false;
    }
    return true;
}
