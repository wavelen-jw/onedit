import type { RhwpAdapter } from "./adapter.js";
import type { Interaction } from "./interaction.js";

type OpenedDocument = Pick<RhwpAdapter, "doc" | "documentId" | "documentLocked" | "scope" | "viewerOnlyReason">;

type ReplacementOptions = {
  unsaved?: boolean;
  initialize?: () => void;
  restore?: () => void;
  committed?: () => void;
  cleanupError: (error: unknown) => void;
};

/** Takes ownership of a detached candidate. A failed initialization retains the
 * previous document and its History, including entries that own other handles. */
export function replaceEditorDocument(editor: Interaction, next: OpenedDocument, options: ReplacementOptions) {
  const { adapter, history } = editor;
  if (next.doc === adapter.doc) throw Error("현재 문서를 교체할 수 없습니다.");

  let adopted = false;
  try {
    const old = { ...adapter };
    const restoreSelection = editor.captureDocumentReplacementRollback();
    const restoreHistory = history.captureDocumentReplacementRollback();
    const retireDetached = history.retireDetachedDocuments();

    try {
      history.detachForDocumentReplacement(true);
      Object.assign(adapter, {
        doc: next.doc,
        documentId: next.documentId,
        documentLocked: next.documentLocked,
        scope: next.scope,
        viewerOnlyReason: next.viewerOnlyReason,
        revision: 0,
        savedRevision: options.unsaved ? -1 : 0,
      });
      editor.reset();
      options.initialize?.();
    } catch (error) {
      Object.assign(adapter, old);
      restoreSelection();
      restoreHistory();
      options.restore?.();
      throw error;
    }
    adopted = true;

    try {
      options.committed?.();
      old.doc.free();
      retireDetached();
    } catch (error) {
      options.cleanupError(error);
    }
  } finally {
    if (!adopted) next.doc.free();
  }
}
