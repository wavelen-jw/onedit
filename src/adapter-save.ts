import { RhwpAdapter } from "./adapter.js";
import { siblingDocument } from "./core-runtime.js";
import { result } from "./adapter-core.js";

// Internal responsibility only; no state ownership or policy changes.
export function exportCheckedHwpx(this: RhwpAdapter) {
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
