import { closeEditorDialog } from "./editor-popup-focus.js";
import type { FileLifecycle } from "./file-lifecycle.js";
import { mountSearch } from "./integration/a-search.js";
import { searchShortcut } from "./keyboard.js";

const bindings = new WeakMap<Document, () => void>();
/** Search-only Host bridge. Standalone file/format/menu policy is unchanged. */
export function connectHostSearch(files: FileLifecycle, doc: Document) {
  const win = doc.defaultView;
  const input = doc.getElementById("input");
  const pages = doc.getElementById("pages");
  if (files.ui.standalone || !win || !input || !pages) return;
  bindings.get(doc)?.();
  const focus = () => input.focus({ preventScroll: true });
  const search = mountSearch(files.editor, () => files.ui.change(true), focus);
  const root = doc.getElementById("search-dialog")!;
  let documentId = files.adapter.documentId, composing = false;
  const sync = () => {
    if (documentId !== files.adapter.documentId) {
      documentId = files.adapter.documentId;
      if (search.open) closeEditorDialog((root as HTMLDialogElement), false);
    }
    search.sync();
  };
  // Host's existing callback repaints directly; observe only that projection.
  // act() also checks synchronously, so queued input never depends on observer timing.
  const observer = new MutationObserver(sync);
  observer.observe(pages, { childList: true, subtree: true });
  const key = (e: KeyboardEvent) => {
    const action = searchShortcut(e);
    if (composing || files.busy || e.isComposing || e.keyCode === 229 ||
        e.getModifierState("AltGraph") || e.altKey || e.shiftKey ||
        !(e.ctrlKey || e.metaKey) || (e.ctrlKey && e.metaKey) ||
        !action || doc.querySelector("dialog[open]")) return;
    if (e.target instanceof Element && e.target !== input &&
        e.target.closest("input,textarea,select,[contenteditable=true]")) return;
    e.preventDefault();e.stopImmediatePropagation();
    if (!e.repeat) search.show(action === "replace");
  };
  const protectDialog = (e: Event) => e.stopPropagation();
  const start = () => { composing = true; }, end = () => { composing = false; };
  win.addEventListener("keydown", key, true);
  root.addEventListener("keydown", protectDialog);
  doc.addEventListener("compositionstart", start, true);
  doc.addEventListener("compositionend", end, true);
  bindings.set(doc, () => {
    observer.disconnect();win.removeEventListener("keydown", key, true);
    root.removeEventListener("keydown", protectDialog);
    doc.removeEventListener("compositionstart", start, true);
    doc.removeEventListener("compositionend", end, true);root.remove();
  });
}
