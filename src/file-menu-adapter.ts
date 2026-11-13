import {activeWorkset} from "./active-workset.js";
import { withQaReadPhase } from "./cursor-model-memo.js";
import {observeSelectorMembership} from './selector-membership.js';
import { openThroughFileMenu, confirmThroughFileMenu, fileMenuEnabled, lifecycleCommands } from "./file-chooser.js";
export { openThroughFileMenu, confirmThroughFileMenu, fileMenuEnabled } from "./file-chooser.js";
import { connectHostViewUI } from "./host-view-ui.js";
import { fileAccessShortcut, fileAccessShortcuts } from "./file-access-shortcuts.js";
import { connectHostSearch } from "./host-search-integration.js";
import type { FileLifecycle } from "./file-lifecycle.js";
import {
  lifecycleCommandState,
  publishEditorChanges,
  syncEditorState,
} from "./editor-state-adapter.js";
import { connectViewIntegration } from "./view-integration-adapter.js";
import { connectMenuIntegration } from "./menu-integration-adapter.js";
import {
  connectDocumentTransition,
  syncFileRecovery,
} from "./document-transition-adapter.js";

const unavailable = new Map([
  ["save-hwp", "NOT_CONNECTED"], // exportHwp exists; guarded lifecycle transport is not wired.
  ["export-pdf", "NOT_SUPPORTED"],
  ["recover", "NOT_SUPPORTED"],
]);
// D owns the integration boundary; A owns menu markup/layout. Opt-in attributes
// share existing lifecycle APIs, without changing A's markup. No Core/API expansion.
export function markFileMenuSupport(root: ParentNode) {
  for (const item of root.querySelectorAll<HTMLElement>(
    "[data-rhwp-file-command]",
  )) {
    const status = unavailable.get(item.dataset.rhwpFileCommand ?? "");
    if (!status) continue;
    item.setAttribute("disabled", "");
    item.setAttribute("aria-disabled", "true");
    item.dataset.support = status;
    item.title =
      status === "NOT_CONNECTED"
        ? "이 파일 형식으로 저장하는 기능은 아직 연결되지 않았습니다."
        : "현재 지원하지 않는 파일 명령입니다.";
    if (!item.querySelector("[data-file-unsupported]")) {
      const label = item.ownerDocument.createElement("span");
      label.dataset.fileUnsupported = "";
      label.textContent =
        status === "NOT_CONNECTED" ? " · 미연결" : " · 미지원";
      item.append(label);
    }
  }
}



export function cancelThroughFileMenu(files: FileLifecycle, requestId: string) {
  const pending = files.pending;
  if (
    !files.ui.standalone ||
    files.busy ||
    !pending ||
    pending.requestId !== requestId ||
    pending.documentId !== files.adapter.documentId
  )
    return false;
  return files.cancelDownload(requestId);
}


export function runLifecycleMenu(files: FileLifecycle, command: string) {
  if (!fileMenuEnabled(files, command)) return Promise.resolve(false);
  if (command === "new") return files.newDocument();
  if (command === "save") return files.save();
  return Promise.resolve(false); // File selection is a separate, gesture-bound path.
}



const fileCommandMembership = new WeakMap<Document, ReturnType<typeof observeSelectorMembership>>();
export function syncLifecycleMenu(files: FileLifecycle, document: Document, state?: ReturnType<FileLifecycle["state"]>) {
  if(activeWorkset(document)){
    const pending=(state??files.state()).pending;
    const button=document.getElementById("download-confirm") as HTMLButtonElement|null;
    if(button){
      const disabled=!files.ui.standalone||files.busy||pending?.documentId!==files.adapter.documentId;
      if(button.disabled!==disabled)button.disabled=disabled;
      if(button.getAttribute("aria-disabled")!==String(disabled))button.setAttribute("aria-disabled",String(disabled));
      if(pending){if(button.dataset.requestId!==pending.requestId)button.dataset.requestId=pending.requestId;}
      else delete button.dataset.requestId;
    }
    return;
  }
  let membership = fileCommandMembership.get(document);
  if (!membership) {
    membership = observeSelectorMembership(document, '[data-rhwp-file-command]', ['data-rhwp-file-command']);
    fileCommandMembership.set(document, membership);
  }
  const commands = lifecycleCommandState(files, state);
  for (const node of membership.read()) {
    const item = node as HTMLButtonElement;
    const command = item.dataset.rhwpFileCommand ?? "";
    const availability =
      commands[
        command as keyof ReturnType<typeof lifecycleCommandState>
      ];
    if (!availability) continue;
    if (item.disabled !== !availability.enabled) item.disabled = !availability.enabled;
    if (item.getAttribute("aria-disabled") !== String(item.disabled))
      item.setAttribute("aria-disabled", String(item.disabled));
    if (command === "confirm-download") {
      if (files.pending) {
        if (item.dataset.requestId !== files.pending.requestId) item.dataset.requestId = files.pending.requestId;
      } else delete item.dataset.requestId;
    }
  }
}

// The UI must carry the request it displayed, never infer "the latest" on click.
export function syncDownloadCancel(files: FileLifecycle, document: Document) {
  const notice = document.getElementById("file-notice");
  if (!notice) return;
  let button = notice.querySelector<HTMLButtonElement>(
    "[data-download-cancel]",
  );
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.dataset.downloadCancel = "";
    button.dataset.rhwpFileCommand = "cancel-download";
    button.textContent = "저장 확인 취소";
    button.title = "다운로드한 파일은 남기고 이 저장 요청의 확인을 취소합니다.";
    notice.append(button);
  }
  const pending = files.pending;
  button.hidden = !files.ui.standalone || !pending;
  button.disabled =
    files.busy || !pending || pending.documentId !== files.adapter.documentId;
  if (pending) button.dataset.requestId = pending.requestId;
  else delete button.dataset.requestId;
}

const bindings = new WeakMap<Window, () => void>();
export function connectFileMenu(files: FileLifecycle) {
  if (typeof window === "undefined") return;
  if (!files.ui.standalone) {
    connectHostSearch(files, window.document);
    // Host exposes only the existing View controller/status. Keep standalone
    // file/menu/edit gates below unchanged, and bootstrap after UI construction.
    queueMicrotask(() => {
      connectViewIntegration(files, window.document);
      connectHostViewUI(window.document, () => files.busy);
    });
    return;
  }
  bindings.get(window)?.();
  const document = window.document;
  for (const item of fileAccessShortcuts) {
    const source = document.getElementById(item.id);
    source?.setAttribute("aria-keyshortcuts", [item.shortcut,
      ...(item.id === "open" ? ["Control+O", "Meta+O"] : item.id === "save" ? ["Control+S", "Meta+S"]
        : item.id === "save-as" ? ["Control+Shift+S", "Meta+Shift+S"] : []),
    ].join(" "));
  }
  const disconnectTransition = connectDocumentTransition(files, document);
  const previousChange = files.ui.change;
  // One synchronous publication owns render, selection and state readers.
  // No result survives this call. Existing writes/completion/restore invalidate
  // Adapter receipts before mutation; each consumer still validates its owner.
  const change: typeof previousChange = (replaced, changedCellClose, committedCellApply, dormantTableTools) => {
    const publish = () => {
      // Keyboard saves and async confirmation/cancel also publish here. Keep
      // the visible controls bound to that request, not a previous menu click.
      if (document.getElementById("integration-menus")) {
        publishEditorChanges(files, document, state => {
          syncLifecycleMenu(files, document, state);
          syncDownloadCancel(files, document);
          syncFileRecovery(files, document);
        },dormantTableTools);
      } else {
        syncLifecycleMenu(files, document);
        syncDownloadCancel(files, document);
        syncEditorState(files, document);
        syncFileRecovery(files, document);
      }
    };
    const split=committedCellApply && files.adapter.canSplitCellApplyReads();
    const run=()=>{
      try { previousChange(replaced,changedCellClose,split); }
      finally {
        if(split) withQaReadPhase(files.adapter.doc,"lifecycle",()=>files.adapter.withUpdateReads(publish));
        else publish();
      }
    };
    if(split) run();
    else files.adapter.withUpdateReads(run);
  };
  files.ui.change = change;
  // Adapt the existing open affordance without editing A's HTML/UI files.
  const existingOpen = document
    .getElementById("open")
    ?.closest<HTMLElement>("label.file");
  if (existingOpen && !existingOpen.dataset.rhwpFileCommand)
    existingOpen.dataset.rhwpFileCommand = "open";
  for (const [id, command] of [
    ["new", "new"],
    ["save", "save"],
    ["save-as", "save-as"],
    ["close-document", "close"],
    ["download-confirm", "confirm-download"],
  ]) {
    const item = document.getElementById(id);
    if (item && !item.dataset.rhwpFileCommand)
      item.dataset.rhwpFileCommand = command;
  }
  let composing = false,
    active: HTMLInputElement | null = null;
  const choose = (command = "open", requestId = "") => {
    if (active) return;
    const next =
      command === "open"
        ? openThroughFileMenu(files, document)
        : confirmThroughFileMenu(files, document, requestId);
    if (!next) return;
    active = next;
    const release = () => {
      if (active === next) active = null;
    };
    next.addEventListener("change", release, { once: true });
    next.addEventListener("cancel", release, { once: true });
    try {
      next.click();
    } catch (e) {
      release();
      files.ui.error(e);
    }
  };
  const start = (e: Event) => {
      // Only the editor input owns document composition. Local drafts end
      // independently on close/dispose and must never latch this global guard.
      if (e.target !== document.getElementById("input")) return;
      composing = true;
    },
    end = (e: Event) => {
      // Only the editor input owns document composition. Local drafts end
      // independently on close/dispose and must never latch this global guard.
      if (e.target !== document.getElementById("input")) return;
      composing = false;
    };
  const key = (e: KeyboardEvent) => {
    const shortcut = fileAccessShortcut(e);
    const existingOpenKey = !e.altKey && !e.shiftKey && (e.ctrlKey || e.metaKey) &&
      !(e.ctrlKey && e.metaKey) && e.key.toLowerCase() === "o";
    if (
      composing ||
      e.isComposing ||
      e.keyCode === 229 ||
      e.getModifierState("AltGraph") ||
      (!shortcut && !existingOpenKey) ||
      document.querySelector("dialog[open]")
    )
      return;
    const target = e.target;
    // Published Alt aliases belong to the editing surface only. Form drafts,
    // menu access keys and the browser retain their own Alt handling.
    if (shortcut && target !== document.getElementById("input")) return;
    if (target instanceof Element && target.closest("#body-context-menu")) return;
    if (
      target instanceof Element &&
      target !== document.getElementById("input") &&
      target.closest("input,textarea,select,[contenteditable=true]")
    )
      return;
    e.preventDefault();
    // Let WorkspaceAccess observe the prevented Alt chord and cancel its
    // Alt-only latch. Otherwise releasing Alt steals focus to the menu title.
    // Existing Ctrl/Meta+O keeps its original exclusive route.
    if (!shortcut) e.stopImmediatePropagation();
    if (e.repeat) return;
    if (!shortcut || shortcut === "open") choose();
    else {
      const source = document.getElementById(shortcut) as HTMLButtonElement | null;
      // Reuse the real click path and its current lifecycle/admission guards.
      if (source && !source.disabled) source.click();
    }
  };
  const click = (e: MouseEvent) => {
    const target =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>("[data-rhwp-file-command]")
        : null;
    if (!target) return;
    const command = target.dataset.rhwpFileCommand;
    if (
      command !== "open" &&
      command !== "cancel-download" &&
      !lifecycleCommands.has(command ?? "") &&
      !unavailable.has(command ?? "")
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (lifecycleCommands.has(command ?? "")) {
      if (composing || e.detail >= 2 || document.querySelector("dialog[open]"))
        return;
      if (command === "confirm-download")
        choose(command, target.dataset.requestId ?? "");
      else {
        const action = runLifecycleMenu(files, command!);
        syncLifecycleMenu(files, document);
        void action.finally(() => {
          syncLifecycleMenu(files, document);
          syncDownloadCancel(files, document);
          document.getElementById("input")?.focus({ preventScroll: true });
        });
      }
    }
    if (command === "open" && !composing && e.detail < 2) choose();
    if (command === "cancel-download" && e.detail < 2) {
      cancelThroughFileMenu(files, target.dataset.requestId ?? "");
      syncDownloadCancel(files, document);
      document.getElementById("input")?.focus({ preventScroll: true });
    }
  };
  window.addEventListener("keydown", key, true);
  window.addEventListener("click", click, true);
  window.addEventListener("compositionstart", start, true);
  window.addEventListener("compositionend", end, true);
  markFileMenuSupport(document);
  syncDownloadCancel(files, document);
  syncLifecycleMenu(files, document);
  syncEditorState(files, document);
  syncFileRecovery(files, document);
  connectViewIntegration(files, document);
  connectMenuIntegration(files, document);
  // A may populate its menu after bootstrap. Observe only explicit opt-in nodes.
  const observer = new MutationObserver((records) => {
    // This observer admits dynamically inserted menu controls, not paint output.
    // Selection/command/file changes already publish via ui.change. Text and
    // overlay replacements must not re-read the same Core capabilities.
    const controls = '[data-rhwp-file-command],#undo,#redo,#character,#paragraph,#cell-format';
    if (!records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
      node.nodeType === 1 && ((node as Element).matches(controls) || (node as Element).querySelector(controls))))) return;
    markFileMenuSupport(document);
    syncDownloadCancel(files, document);
    syncLifecycleMenu(files, document);
    if (!document.getElementById("integration-menus")) syncEditorState(files, document);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  bindings.set(window, () => {
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("click", click, true);
    window.removeEventListener("compositionstart", start, true);
    window.removeEventListener("compositionend", end, true);
    observer.disconnect();
    disconnectTransition();
    if (files.ui.change === change) files.ui.change = previousChange;
  });
}
