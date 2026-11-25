import { exportDocumentHwpx } from "./adapter-save.js";
import { editorChanged } from "./editor-state-adapter.js";
import { closeEditorDialog, showUtilityDialog, wrapDialogTab } from "./editor-popup-focus.js";
import type { FileLifecycle } from "./file-lifecycle.js";
import {
  listWorkingCopies, maxWorkingCopySize, readWorkingCopy, removeWorkingCopy, writeWorkingCopy,
  type WorkingCopy,
} from "./working-copy-storage.js";

type ActiveDocument = {
  id: string;
  savedRevision: number;
  checkpoint?: { copy: WorkingCopy; revision: number };
  failedRevision?: number;
  clearing?: Promise<void>;
  discarded?: boolean;
};

export function mountWorkingCopyRecovery(doc: Document, files: FileLifecycle, editingBusy: () => boolean) {
  const view = doc.defaultView;
  if (!view || view.top !== view || !files.ui.standalone) return;
  const button = doc.getElementById("working-copy-open") as HTMLButtonElement;
  const notice = doc.getElementById("working-copy-notice")!;
  const retry = doc.getElementById("working-copy-retry") as HTMLButtonElement;
  const dialog = doc.getElementById("working-copy-dialog") as HTMLDialogElement;
  const list = doc.getElementById("working-copy-list")!;
  const feedback = doc.getElementById("working-copy-feedback")!;
  const close = doc.getElementById("working-copy-close") as HTMLButtonElement;
  const { adapter } = files;
  const shortDelay = 1500;
  const maxDelay = 8000;
  let active: ActiveDocument | undefined;
  let timer: number | undefined;
  let scheduledRevision: number | undefined;
  let firstPending: number | undefined;
  let exporting: Promise<boolean> | undefined;
  let busy = false;
  let listGeneration = 0;
  const setNotice = (message: string) => { if (notice.textContent !== message) notice.textContent = message; };
  const blocked = () => files.busy || adapter.transientEdit || editingBusy();

  function resetTimer() {
    view!.clearTimeout(timer);
    timer = scheduledRevision = undefined;
  }

  function observe(soon = false) {
    if (active?.id !== adapter.documentId) {
      active = { id: adapter.documentId, savedRevision: adapter.savedRevision };
      resetTimer();
      firstPending = undefined;
      setNotice("");
      void refresh();
    }
    const state = active;
    retry.hidden = !files.dirty || state.failedRevision !== adapter.revision;
    retry.disabled = blocked() || !!exporting;
    const saved = state.savedRevision !== adapter.savedRevision;
    state.savedRevision = adapter.savedRevision;
    if (saved && !files.dirty) setNotice("");
    const checkpoint = state.checkpoint;
    if (!state.clearing && checkpoint && checkpoint.revision <= state.savedRevision) {
      state.clearing = removeWorkingCopy(checkpoint.copy).then(() => {
        if (state.checkpoint === checkpoint) state.checkpoint = undefined;
      }).catch(() => {
        if (state.checkpoint === checkpoint) state.checkpoint = undefined;
        if (active === state) setNotice("이전 복구본을 정리하지 못했습니다.");
      }).finally(() => {
        state.clearing = undefined;
        if (active === state) observe();
      });
    }
    if (!files.dirty || adapter.scope !== "edit" || adapter.documentLocked || adapter.viewerOnlyReason ||
        state.checkpoint?.revision === adapter.revision || state.failedRevision === adapter.revision) {
      resetTimer();
      firstPending = undefined;
      return;
    }
    if (exporting || state.clearing) return;
    if (timer !== undefined && scheduledRevision === adapter.revision && !soon) return;
    resetTimer();
    const now = performance.now();
    firstPending ??= now;
    const delay = soon ? 0 : Math.max(0, Math.min(shortDelay, firstPending + maxDelay - now));
    scheduledRevision = adapter.revision;
    timer = view!.setTimeout(() => {
      resetTimer();
      if (!exporting) void startCheckpoint(state);
    }, delay);
  }

  function startCheckpoint(state: ActiveDocument, transition = false) {
    firstPending = undefined;
    exporting = checkpointCurrent(state, transition).finally(() => {
      exporting = undefined;
      observe();
    });
    return exporting;
  }

  async function checkpointCurrent(state: ActiveDocument, transition: boolean) {
    const { doc: native, revision } = adapter;
    const name = files.filename;
    const current = () => active === state && adapter.documentId === state.id && adapter.doc === native &&
      revision === adapter.revision && files.dirty && !state.clearing &&
      (transition || !files.busy) && !adapter.transientEdit && !editingBusy() &&
      adapter.scope === "edit" && !adapter.documentLocked && !adapter.viewerOnlyReason;
    if (!current()) return false;
    try {
      const checkpoint = state.checkpoint;
      // Revalidate the saved token before using an existing checkpoint for a
      // transition. Another tab may have removed or superseded it.
      if (transition && checkpoint?.revision === revision &&
          await readWorkingCopy(checkpoint.copy) && current()) return true;
      if (!current()) return false;
      const { bytes } = await exportDocumentHwpx(adapter, current);
      if (!current()) return false;
      if (!bytes.byteLength || bytes.byteLength > maxWorkingCopySize) {
        state.failedRevision = revision;
        setNotice("복구본 크기 한도를 넘었습니다. 문서를 파일로 저장하세요.");
        return false;
      }
      const prior = state.checkpoint?.copy;
      let copy = { id: prior?.id ?? state.id, token: crypto.randomUUID(), name, updatedAt: Date.now() };
      let outcome = await writeWorkingCopy(copy, bytes, prior?.token);
      // A recovered copy can share its lineage with another live tab. Fork it
      // when that tab has changed the checkpoint, so neither draft is overwritten.
      if (outcome === "changed" && current()) {
        copy = { ...copy, id: crypto.randomUUID() };
        outcome = await writeWorkingCopy(copy, bytes);
      }
      if (outcome !== "saved") {
        if (current()) {
          state.failedRevision = revision;
          setNotice(outcome === "full"
            ? "복구본 보관함이 가득 찼습니다. 기존 복구본을 정리한 뒤 다시 시도하세요."
            : "복구본이 다른 창에서 바뀌었습니다. 다시 시도하세요.");
        }
        return false;
      }
      state.checkpoint = { copy, revision };
      if (state.discarded || (state.savedRevision >= revision && active !== state))
        await removeWorkingCopy(copy);
      if (active === state) setNotice("");
      return current();
    } catch (error) {
      if (current()) {
        state.failedRevision = revision;
        setNotice(error instanceof DOMException && error.name === "QuotaExceededError"
          ? "브라우저 저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도하세요."
          : "복구본을 보관하지 못했습니다. 다시 시도하거나 문서를 파일로 저장하세요.");
      }
      return false;
    }
  }

  async function refresh() {
    const generation = ++listGeneration;
    try {
      const entries = (await listWorkingCopies())
        .filter(copy => copy.id !== active?.id && copy.id !== active?.checkpoint?.copy.id);
      if (generation !== listGeneration) return;
      const label = `작업 복구 · ${entries.length}개`;
      if (button.textContent !== label) button.textContent = label;
      button.hidden = entries.length === 0 && !dialog.open;
      if (dialog.open) renderList(entries);
    } catch {
      if (generation === listGeneration && dialog.open) feedback.textContent = "복구본 목록을 열 수 없습니다.";
    }
  }

  function renderList(entries: WorkingCopy[]) {
    const rows = entries.map(copy => {
      const row = doc.createElement("li");
      const label = doc.createElement("div");
      const name = doc.createElement("strong");
      const time = doc.createElement("time");
      name.textContent = copy.name;
      time.dateTime = new Date(copy.updatedAt).toISOString();
      time.textContent = new Date(copy.updatedAt).toLocaleString("ko-KR");
      label.append(name, time);
      const restore = doc.createElement("button"), discard = doc.createElement("button");
      restore.type = discard.type = "button";
      restore.textContent = "복구";
      discard.textContent = "삭제";
      restore.setAttribute("aria-label", `${copy.name} 복구`);
      discard.setAttribute("aria-label", `${copy.name} 삭제`);
      restore.onclick = () => void restoreCopy(copy);
      discard.onclick = () => void discardCopy(copy);
      row.append(label, restore, discard);
      return row;
    });
    if (!rows.length) {
      const empty = doc.createElement("li");
      empty.textContent = "복구할 작업본이 없습니다.";
      rows.push(empty);
    }
    list.replaceChildren(...rows);
  }

  async function restoreCopy(copy: WorkingCopy) {
    if (busy || blocked()) return;
    busy = true;
    feedback.textContent = "";
    const { documentId, revision } = adapter;
    try {
      const bytes = await readWorkingCopy(copy);
      if (!dialog.open || blocked() || documentId !== adapter.documentId || revision !== adapter.revision) return;
      if (!bytes) throw Error("복구본이 다른 창에서 변경되었거나 지워졌습니다.");
      closeEditorDialog(dialog, false);
      await files.openRecovery(copy.name, bytes, () => {
        active = {
          id: adapter.documentId, savedRevision: adapter.savedRevision,
          checkpoint: { copy, revision: adapter.revision },
        };
        resetTimer();
        firstPending = undefined;
        if (!doc.querySelector("dialog[open]"))
          doc.getElementById("input")?.focus({ preventScroll: true });
        void refresh();
      });
    } catch (error) {
      if (dialog.open) feedback.textContent = error instanceof Error ? error.message : "복구본을 읽을 수 없습니다.";
    } finally {
      busy = false;
    }
  }

  async function discardCopy(copy: WorkingCopy) {
    if (busy || !view!.confirm(`‘${copy.name}’의 복구본을 삭제하시겠습니까?`)) return;
    busy = true;
    try {
      feedback.textContent = await removeWorkingCopy(copy) ? "" : "복구본이 다른 창에서 변경되었습니다.";
      await refresh();
      close.focus();
    } catch {
      feedback.textContent = "복구본을 삭제하지 못했습니다.";
    } finally {
      busy = false;
    }
  }

  files.ui.prepareDiscard = () => {
    const state = active;
    return () => {
      if (!state) return;
      state.discarded = true;
      const checkpoint = state.checkpoint;
      if (checkpoint) void removeWorkingCopy(checkpoint.copy).then(() => refresh()).catch(() => {
        setNotice("이전 문서의 복구본을 삭제하지 못했습니다.");
      });
    };
  };
  if (view.indexedDB) files.ui.keepWorkingCopy = async () => {
    const state = active;
    const { documentId, revision } = adapter;
    resetTimer();
    await exporting;
    await state?.clearing;
    resetTimer();
    if (state && active === state && documentId === adapter.documentId && revision === adapter.revision &&
        await startCheckpoint(state, true)) return true;
    throw Error("현재 작업을 복구본으로 보관하지 못했습니다. 파일로 저장하거나 다시 시도하세요.");
  };
  retry.onclick = () => {
    const state = active;
    if (!state || !files.dirty || state.failedRevision !== adapter.revision ||
        blocked() || exporting || state.clearing) return;
    state.failedRevision = undefined;
    resetTimer();
    setNotice("복구본을 보관하는 중입니다.");
    void startCheckpoint(state);
    observe();
  };
  button.onclick = () => {
    if (blocked() || doc.querySelector("dialog[open]")) return;
    feedback.textContent = "";
    showUtilityDialog(dialog, button);
    void refresh();
  };
  close.onclick = () => closeEditorDialog(dialog, false);
  dialog.addEventListener("keydown", event => wrapDialogTab(event, dialog));
  dialog.addEventListener("close", () => void refresh());
  doc.addEventListener("rhwp:editor-state", event => {
    if (editorChanged(event, "document", "storage", "admission")) observe();
  });
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") observe(true);
  });
  view.addEventListener("focus", () => { if (!dialog.open) void refresh(); });
  observe();
}
