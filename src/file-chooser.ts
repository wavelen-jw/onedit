import { lifecycleCommandState } from "./editor-state-adapter.js";
import type { FileLifecycle } from "./file-lifecycle.js";

export const lifecycleCommands = new Set(["new", "save", "confirm-download"]);
export function fileMenuEnabled(files: FileLifecycle, command: string) {
  if (!lifecycleCommands.has(command)) return false;
  return lifecycleCommandState(files)[
    command as "new" | "save" | "confirm-download"
  ].enabled;
}


// Gesture-bound chooser metadata and focus only; FileLifecycle owns the transition.
export function openThroughFileMenu(files: FileLifecycle, document: Document) {
  if (!files.ui.standalone || files.busy || files.state().transition)
    return null;
  const { documentId, revision } = files.adapter;
  const origin = document.activeElement;
  const chooser = document.createElement("input");
  chooser.type = "file";
  chooser.accept = ".hwpx,.hwp";
  const restoreCancelledOpen = () => {
    const active = document.activeElement;
    if (
      files.busy || files.state().transition ||
      files.adapter.documentId !== documentId ||
      files.adapter.revision !== revision ||
      document.querySelector("dialog[open]")
    ) return;
    // This is the gesture-bound chooser used by the toolbar AND menu, not
    // the static #open input. Do not reclaim focus from another input/dialog.
    if (active === document.body || active === chooser ||
        active === document.getElementById("open") ||
        (active === origin && (active?.id === "input" ||
          active?.closest('[data-rhwp-file-command="open"]'))))
      document.getElementById("input")?.focus({ preventScroll: true });
  };
  chooser.oncancel = restoreCancelledOpen;
  chooser.onchange = async () => {
    const file = chooser.files?.[0];
    chooser.value = "";
    if (!file) { restoreCancelledOpen(); return; }
    if (
      files.adapter.documentId !== documentId ||
      files.adapter.revision !== revision
    ) {
      files.ui.error(
        Error(
          "문서가 변경되어 이전 열기 선택을 적용하지 않았습니다. 다시 열기를 선택하세요.",
        ),
      );
      return;
    }
    // Existing open owns dirty warning, async read CAS, Core preflight and rollback.
    const errorPanel = document.getElementById("error");
    if (errorPanel) errorPanel.hidden = true;
    await files.open(file);
    document.getElementById("input")?.focus({ preventScroll: true });
  };
  return chooser;
}

export function confirmThroughFileMenu(
  files: FileLifecycle,
  document: Document,
  requestId: string,
) {
  const pending = files.pending;
  if (
    !fileMenuEnabled(files, "confirm-download") ||
    pending?.requestId !== requestId
  )
    return null;
  const chooser = document.createElement("input");
  chooser.type = "file";
  chooser.accept = ".hwpx";
  chooser.onchange = async () => {
    const file = chooser.files?.[0];
    chooser.value = "";
    if (!file) return;
    // Capture the displayed request, not whichever request is current after IO.
    // Existing lifecycle checks exact bytes, filename, document and revision.
    const errorPanel = document.getElementById("error");
    if (errorPanel) errorPanel.hidden = true;
    await files.confirmDownloaded(requestId, file);
    document.getElementById("input")?.focus({ preventScroll: true });
  };
  // Dismissing file selection leaves the request intact. Explicit cancellation
  // remains the distinct, completed cancel-download command.
  return chooser;
}
