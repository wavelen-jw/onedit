import { RhwpAdapter } from "./adapter.js";
import { siblingDocument } from "./core-runtime.js";
import { result } from "./adapter-core.js";
import { projectSemanticParts } from "./adapter-semantic.js";
import { finishResponsiveWork } from "./responsive-work.js";
import { extractLinkZOrder, rememberLinkZOrder, retainLinkZOrder } from "./hwpx-link-zorder.js";
import { readPrintSettings, rememberPrintSettings, retainPrintSettings } from "./hwpx-print-settings.js";

// Optional metadata already supported by the archive helpers is tracked per Core handle.
export async function inspectHwpxPreservation(bytes: Uint8Array) {
    const [zOrder, printSettings] = await Promise.all([
        extractLinkZOrder(bytes, "local-open").catch(() => undefined),
        readPrintSettings(bytes).catch(() => undefined),
    ]);
    return {zOrder, printSettings};
}

export function rememberHwpxPreservation(doc: object, metadata: Awaited<ReturnType<typeof inspectHwpxPreservation>>) {
    rememberLinkZOrder(doc, metadata.zOrder);
    rememberPrintSettings(doc, metadata.printSettings);
}

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

function* verifyCheckedReopen(a: RhwpAdapter, bytes: Uint8Array) {
    const reopened = new RhwpAdapter(siblingDocument(a.doc, bytes));
    try {
      const actual = yield* projectSemanticParts.call(reopened);
      const expected = yield* projectSemanticParts.call(a);
      if (!(yield* compareSemanticRows(actual, expected)))
        throw Error("HWPX 재열기 내용·서식 검사 실패");
    } finally {
      reopened.doc.free();
    }
}

export function exportCheckedHwpx(this: RhwpAdapter) {
    const bytes = exportLosslessHwpx.call(this);
    const verification = verifyCheckedReopen(this, bytes);
    while (!verification.next().done) { /* Synchronous command verification. */ }
    return {bytes, documentId: this.documentId, revision: this.revision};
}

export async function exportCheckedDocumentHwpx(a: RhwpAdapter, current: () => boolean) {
    const {documentId, revision, doc} = a;
    if (!a.transientEdit && !a.viewerOnlyReason) a.completeLocalBodyFlow();
    const linked = await retainLinkZOrder(doc, exportLosslessHwpx.call(a));
    const bytes = await retainPrintSettings(doc, linked);
    if (!current()) throw Error("문서 작업 대상이 변경되었습니다. 다시 시도하세요.");
    const verification = verifyCheckedReopen(a, bytes);
    try {
      await finishResponsiveWork(verification, current);
      if (!current()) throw Error("문서 작업 대상이 변경되었습니다. 다시 시도하세요.");
      return {bytes, documentId, revision};
    } finally {
      verification.return(undefined);
    }
}

function* compareSemanticRows(actual: Record<string, unknown>, expected: Record<string, unknown>) {
    // Character runs deliberately share their projected properties. Compare
    // each exact pair once within this verification, preserving JSON's ordering
    // and values without expanding the same property object for every letter.
    const equalPairs = new WeakMap<object, object>();
    const omitted = (value: unknown) =>
      value === undefined || typeof value === "function" || typeof value === "symbol";
    const ownKeys = (value: Record<string, unknown>) =>
      Object.keys(value).filter(key => !omitted(value[key]));
    const sameKeys = (x: readonly string[], y: readonly string[]) =>
      x.length === y.length && x.every((key, i) => key === y[i]);
    const equal = (x: unknown, y: unknown): boolean => {
      if (x === y) return true;
      if (x === null || y === null || typeof x !== "object" || typeof y !== "object")
        return JSON.stringify(x) === JSON.stringify(y);
      if (equalPairs.get(x) === y) return true;
      const xx = x as Record<string, unknown>, yy = y as Record<string, unknown>;
      // Semantic projections contain plain JSON values. Preserve legacy JSON
      // behavior if a caller supplies an exotic object or a custom serializer.
      const plain = (o: object) => Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null;
      const xArray = Array.isArray(x), yArray = Array.isArray(y);
      if (typeof xx.toJSON === "function" || typeof yy.toJSON === "function" ||
          (!xArray && !plain(x)) || (!yArray && !plain(y)))
        return JSON.stringify(x) === JSON.stringify(y);
      if (xArray !== yArray) return false;
      if (xArray && yArray) {
        if (x.length !== y.length) return false;
        for (let i = 0; i < x.length; i++)
          if (!equal(omitted(x[i]) ? null : x[i], omitted(y[i]) ? null : y[i])) return false;
      } else {
        const keys = ownKeys(xx);
        if (!sameKeys(keys, ownKeys(yy)) || !keys.every(key => equal(xx[key], yy[key]))) return false;
      }
      equalPairs.set(x, y);
      return true;
    };
    const keys = ownKeys(expected);
    if (!sameKeys(ownKeys(actual), keys)) return false;
    for (const key of keys) {
      const x = actual[key], y = expected[key];
      if (Array.isArray(x) && Array.isArray(y) && typeof (x as {toJSON?:unknown}).toJSON !== "function" &&
          typeof (y as {toJSON?:unknown}).toJSON !== "function") {
        if (x.length !== y.length) return false;
        for (let i = 0; i < x.length; i++) {
          if (!equal(omitted(x[i]) ? null : x[i], omitted(y[i]) ? null : y[i])) return false;
          yield;
        }
      } else if (!equal(x, y)) return false;
    }
    return true;
}
