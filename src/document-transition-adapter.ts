import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import type { FileLifecycle } from "./file-lifecycle.js";

export function guardDocumentTransitionKeys(event: KeyboardEvent) {
  // Tab wraps within the existing decision buttons. Enter/Escape stay native.
  // Global editor shortcuts
  // must never consume the underlying document while its decision is pending.
  event.stopPropagation();
  const key = event.key.toLowerCase();
  const dialog = event.currentTarget as HTMLDialogElement | null;
  if (
    key === "tab" && dialog?.open &&
    !event.ctrlKey && !event.metaKey && !event.altKey &&
    !event.isComposing && event.keyCode !== 229
  ) {
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>(
      "button[data-transition-choice]:not(:disabled):not([hidden])",
    )).filter((button) => button.tabIndex >= 0);
    const index = buttons.findIndex((button) => button === dialog.ownerDocument.activeElement);
    const wrap = event.shiftKey ? index <= 0 : index < 0 || index === buttons.length - 1;
    if (buttons.length && wrap) {
      event.preventDefault();
      buttons[event.shiftKey ? buttons.length - 1 : 0].focus({ preventScroll: true });
    }
  }
  if (
    ((event.isComposing || event.keyCode === 229) && key === "enter") ||
    ((event.ctrlKey || event.metaKey) &&
      ["z", "y", "s", "o", "n"].includes(key)) ||
    (event.altKey && ["l", "t"].includes(key))
  )
    event.preventDefault();
}

/** Standalone UI choices only. Core, History and file acknowledgment stay authoritative. */
export function connectDocumentTransition(files: FileLifecycle, doc: Document) {
  const previous = files.ui.chooseUnsaved;
  let active: HTMLDialogElement | null = null;
  let cancel: (() => void) | null = null;
  const choose: NonNullable<typeof previous> = (message) =>
    new Promise((resolve) => {
      const dialog = doc.createElement("dialog");
      dialog.id = "document-transition";
      dialog.setAttribute("aria-labelledby", "document-transition-title");
      const title = doc.createElement("h2"),
        note = doc.createElement("p");
      title.id = "document-transition-title";
      title.textContent = "저장하지 않은 변경이 있습니다";
      note.textContent = `${message} 저장을 선택하면 실제 파일 저장 확인이 끝난 뒤에 계속합니다.`;
      dialog.append(title, note);
      let settled = false;
      const finish = (choice: "save" | "continue" | "cancel") => {
        if (settled) return;
        settled = true;
        if (dialog.open) closeEditorDialog(dialog, choice === "cancel");
        dialog.remove();
        active = null;
        cancel = null;
        resolve(choice);
      };
      for (const [choice, label] of [
        ["save", "저장하고 계속"],
        ["continue", "저장하지 않고 계속"],
        ["cancel", "취소"],
      ] as const) {
        const button = doc.createElement("button");
        button.type = "button";
        button.dataset.transitionChoice = choice;
        button.textContent = label;
        button.onclick = () => finish(choice);
        if (choice === "cancel") button.autofocus = true;
        dialog.append(button);
      }
      dialog.addEventListener("keydown", guardDocumentTransitionKeys, true);
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish("cancel");
      });
      dialog.addEventListener("close", () => finish("cancel"));
      active = dialog;
      cancel = () => finish("cancel");
      doc.body.append(dialog);
      try {
        showEditorDialog(dialog, false);
      } catch (error) {
        finish("cancel");
        files.ui.error(error);
      }
    });
  files.ui.chooseUnsaved = choose;
  const warn = (event: BeforeUnloadEvent) => {
    if (!files.dirty) return;
    event.preventDefault();
    event.returnValue = ""; // Browser-owned warning; no automatic confirmation.
  };
  doc.defaultView?.addEventListener("beforeunload", warn);
  return () => {
    cancel?.();
    active?.remove();
    if (files.ui.chooseUnsaved === choose) files.ui.chooseUnsaved = previous;
    doc.defaultView?.removeEventListener("beforeunload", warn);
  };
}

export function syncFileRecovery(files: FileLifecycle, doc: Document) {
  const panel = doc.getElementById("file-notice");
  if (!panel) return;
  let retry = panel.querySelector<HTMLButtonElement>("[data-retry-save]");
  if (!retry) {
    retry = doc.createElement("button");
    retry.type = "button";
    retry.dataset.retrySave = "";
    retry.textContent = "현재 문서 다시 저장";
    retry.onclick = async () => {
      if (files.busy || !files.ui.standalone) return;
      doc.getElementById("error")?.setAttribute("hidden", "");
      // A failed Save As must not retry into an older cached Save handle.
      // A new user gesture chooses the target again; no automatic fallback,
      // permission retry, filename substitution or cached-export replay.
      await files.save(!!files.ui.pickSaveTarget);
      doc.getElementById("input")?.focus({ preventScroll: true });
    };
    panel.append(retry);
  }
  const request=files.state().request;
  retry.textContent = "다른 이름·위치에 저장";
  retry.hidden = !files.ui.standalone || !files.ui.pickSaveTarget ||
    request?.status !== "failed" || request.failure === "export";
  retry.disabled = files.busy;
  let copy = panel.querySelector<HTMLButtonElement>("[data-download-save-copy]");
  if (!copy) {
    copy = doc.createElement("button");
    copy.type = "button";
    copy.dataset.downloadSaveCopy = "";
    copy.textContent = "HWPX 사본 다운로드";
    copy.onclick = async () => {
      if (files.busy || !files.canDownloadCopy) return;
      doc.getElementById("error")?.setAttribute("hidden", "");
      await files.downloadCopy();
      doc.getElementById("input")?.focus({ preventScroll: true });
    };
    panel.append(copy);
  }
  copy.hidden = !files.canDownloadCopy;
  copy.disabled = files.busy;
}
