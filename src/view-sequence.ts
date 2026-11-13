import { shortcutPlatform } from "./hancom-web-shortcuts.js";
import type { KeyInput } from "./keyboard.js";

// Han/word 2024 View shortcuts. These resolve to existing menu buttons only.
export const viewSequenceItems = [
  ["KeyT", "paragraph-marks", "T"],
  ["KeyC", "control-codes", "C"],
  ["KeyQ", "actual", "Q"],
  [shortcutPlatform() === "mac" ? "KeyW" : "KeyB", "width", shortcutPlatform() === "mac" ? "W" : "B"],
  ["KeyP", "page", "P"],
  ["KeyZ", "fullscreen", "Z"],
] as const;
type Action = typeof viewSequenceItems[number][1];

/** Per-view, document-bound prefix; it never changes input/composition state. */
export class ViewSequence {
  private documentId = "";
  cancel() { this.documentId = ""; }
  reconcile(documentId: string, blocked: boolean) {
    if (blocked || documentId !== this.documentId) this.cancel();
  }
  route(e: KeyInput & {repeat?: boolean; defaultPrevented?: boolean}, documentId: string,
    enabled: boolean): Action | "prefix" | "cancel" | undefined {
    if (!enabled || !documentId || e.defaultPrevented || e.repeat || e.isComposing || e.keyCode === 229 || e.altGraph) {
      this.cancel(); return;
    }
    const pending = this.documentId === documentId;
    this.cancel();
    if (pending && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (e.key === "Escape") return "cancel";
      const item = viewSequenceItems.find(([code, action]) => code === e.code || action === "width" && e.code === "KeyW");
      if (item) return item[1];
    }
    if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === "KeyG") {
      this.documentId = documentId;
      return "prefix";
    }
    // Unrecognized second keys retain their ordinary editor/browser meaning.
  }
}
