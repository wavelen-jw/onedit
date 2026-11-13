import type { FormatKind, FormatState } from "./formatting.js";
import {freezeDiagnosticFor} from './diagnostics/runtime.js';
import {composeMarkdownHwpx,applyMarkdownCommands} from './markdown-compose.js';
import type {MarkdownRequest} from './markdown-import.js';
import { initializeBlankDocument } from './blank-document-defaults.js';
import { assertSafeHwpxEntryNames } from "./hwpx-open-boundary.js";
import { isCheckedExternalSibling, siblingDocument } from "./core-runtime.js";
import { RhwpAdapter, UnsupportedTableOwner } from "./adapter.js";
import { Interaction } from "./interaction.js";
import { start } from "./model.js";
import { connectFileMenu } from "./file-menu-adapter.js";

type Download = {
  requestId: string;
  sequence: number;
  filename: string;
  confirmedFilename?: string;
  failure?: "unavailable" | "permission" | "write" | "export" | "download" | "readback";
  documentId: string;
  revision: number;
  status:
    | "preparing"
    | "awaiting-file"
    | "canceled"
    | "failed"
    | "completed"
    | "superseded";
};
type SavedFile = Pick<File, "name" | "size" | "arrayBuffer">;
export type NativeSaveTarget = {
  name: string;
  createWritable: () => Promise<{
    write: (data: Uint8Array) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
  getFile: () => Promise<SavedFile>;
};
type UI = {
  standalone: boolean;
  confirm: (message: string) => boolean;
  chooseUnsaved?: (message: string) => Promise<"save" | "continue" | "cancel">;
  prompt: (message: string, name: string) => string | null;
  pickSaveTarget?: (suggestedName: string) => Promise<NativeSaveTarget | null>;
  download: (bytes: Uint8Array, name: string, requestId: string) => void;
  prepareDisplay?: (candidate: RhwpAdapter) => void;
  clickTableScope?: (page:HTMLElement,run:()=>void)=>void;
  paintedCellFormats?: () => Readonly<Partial<Record<FormatKind, FormatState>>> | undefined;
  change: (replaced: boolean, changedCellClose?: () => void, committedCellApply?:boolean, dormantTableTools?:()=>boolean) => void;
  error: (error: unknown) => void;
};
export function hwpxName(name: string) {
  const value = name.trim();
  if (!value || /^\.(hwpx|hwp)$/i.test(value))
    throw Error("파일 이름을 입력하세요.");
  if (/[<>:"\\/|?*\x00-\x1f\x7f]/.test(value))
    throw Error('파일 이름에는 < > : " / \\ | ? * 및 제어 문자를 사용할 수 없습니다.');
  if (/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(value) || value.endsWith('.'))
    throw Error("예약된 이름이나 마침표로 끝나는 이름은 사용할 수 없습니다.");
  const result = /\.hwpx$/i.test(value)
    ? value
    : value.replace(/\.hwp$/i, "") + ".hwpx";
  if (new TextEncoder().encode(result).length > 255)
    throw Error("파일 이름이 너무 깁니다. 이름을 줄여 주세요.");
  return result;
}

/** Filename evidence only; request identity and checked export bytes remain mandatory.
 * Match the literal name or a bounded browser collision suffix. Never normalize,
 * trim, case-fold, parse a path or infer the user's download directory.
 */
function matchesDownloadedHwpxName(requested: string, selected: string) {
  if (typeof selected !== "string" || /[\\/\x00-\x1f\x7f]/.test(selected))
    return false;
  const extension = requested.slice(-5);
  if (!/^\.hwpx$/i.test(extension)) return false;
  if (selected === requested) return true;
  if (new TextEncoder().encode(selected).length > 255) return false;
  const prefix = requested.slice(0, -5) + " (";
  const suffix = ")" + extension;
  if (!selected.startsWith(prefix) || !selected.endsWith(suffix)) return false;
  return /^[1-9][0-9]{0,5}$/.test(
    selected.slice(prefix.length, -suffix.length),
  );
}

/** Standalone file metadata only. Core and the existing History own all content. */
export class FileLifecycle {
  filename = "새 문서.hwpx";
  busy = false;
  saving = false;
  private sequence = 0;
  private nativeTarget: { documentId: string; target: NativeSaveTarget } | null = null;
  private request: Download | null = null;
  private exported: Uint8Array | null = null;
  private continuation: {
    requestId: string;
    documentId: string;
    revision: number;
    action: () => boolean | Promise<boolean>;
  } | null = null;
  notice = "";
  constructor(
    readonly adapter: RhwpAdapter,
    readonly editor: Interaction,
    readonly ui: UI,
  ) {
    connectFileMenu(this);
  }
  get dirty() {
    return this.adapter.revision !== this.adapter.savedRevision;
  }
  get pending(): Download | null {
    return this.request?.status === "awaiting-file"
      ? { ...this.request }
      : null;
  }
  state() {
    return {
      filename: this.filename,
      busy: this.busy,
      saving: this.saving,
      dirty: this.dirty,
      pending: this.pending ? { ...this.pending } : null,
      request: this.request ? { ...this.request } : null,
      notice: this.notice,
      transition: this.continuation
        ? {
            requestId: this.continuation.requestId,
            documentId: this.continuation.documentId,
            revision: this.continuation.revision,
          }
        : null,
    };
  }
  private reportError(error: unknown) {
    try {
      this.ui.error(error);
    } catch (reportError) {
      // A broken error display must not interrupt rollback or busy cleanup.
      console.error(error, reportError);
    }
  }
  private async run(action: () => boolean | Promise<boolean>) {
    if (this.adapter.transientEdit) {
      this.reportError(Error("한글 조합을 확정하거나 취소한 뒤 파일 작업을 진행하세요."));
      return false;
    }
    if (this.busy) return false;
    this.busy = true;
    try {
      this.ui.change(false);
      return await action();
    } catch (error) {
      this.reportError(error);
      return false;
    } finally {
      this.busy = false;
      try {
        this.ui.change(false);
      } catch (error) {
        // This notification is after the action's commit/rollback boundary.
        this.reportError(error);
      }
    }
  }
  private transition(
    message: string,
    action: () => boolean | Promise<boolean>,
    beforeDecision?: () => Promise<void>,
  ) {
    return this.run(async () => {
      if (!this.ui.standalone || this.continuation) return false;
      await beforeDecision?.();
      if (this.dirty) {
        const { documentId, revision } = this.adapter;
        const choice = this.ui.chooseUnsaved
          ? await this.ui.chooseUnsaved(message)
          : this.ui.confirm(message)
            ? "continue"
            : "cancel";
        if (
          documentId !== this.adapter.documentId ||
          revision !== this.adapter.revision
        )
          throw Error(
            "경고를 여는 동안 문서가 변경되었습니다. 다시 선택하세요.",
          );
        if (choice === "cancel") return false;
        if (choice === "save") {
          if (!await this.prepareSave(false)) return false;
          if (!this.pending) {
            // Native read-back may finish the save immediately (e.g. repair of
            // an opened filename). Continue only the same, now-clean document.
            return documentId === this.adapter.documentId && revision === this.adapter.revision && !this.dirty
              ? action() : false;
          }
          this.continuation = {
            requestId: this.pending.requestId,
            documentId,
            revision,
            action,
          };
          this.notice +=
            " · 저장 파일 확인이 완료되면 요청한 문서 전환/닫기를 계속합니다. 취소하면 현재 문서를 유지합니다.";
          this.ui.change(false);
          return false; // A download request is not a committed replacement.
        }
        if (choice !== "continue") return false;
      }
      return action();
    });
  }
  private replacementCandidate(bytes: Uint8Array | undefined, admit?: (next: RhwpAdapter)=>void, prepared?: RhwpAdapter["doc"]) {
    const doc = prepared ?? siblingDocument(this.adapter.doc, bytes);
    try {
      const next = new RhwpAdapter(doc);
      if (bytes === undefined && !prepared) initializeBlankDocument(next);
      // Set the current display environment before preflight builds page trees.
      // The candidate is still isolated; failure frees it and preserves the old document.
      this.ui.prepareDisplay?.(next);
      // Preflight the projections used by the UI before retiring the old document.
      next.call("getDocumentInfo");
      next.documentLocked = next
        .call<any[]>("getControls")
        .some((c) => c.props?.Lock);
      next.scope = next.documentLocked ? "readonly" : "edit";
      try {
        next.semantic();
      } catch (error) {
        if (!(error instanceof UnsupportedTableOwner)) throw error;
        // Existing Core can paint this document, but the editor's cell path
        // cannot address a table below a non-table owner. Keep it viewable with
        // an explicit restriction; do not skip preservation checks for editing.
        next.viewerOnlyReason = error.message;
        next.scope = "readonly";
        next.semantic();
      }
      admit?.(next);
      next.rect(start());
      for (let page = 0; page < next.pageCount; page++) {
        next.call("getPageInfo", page);
        next.doc.renderPageSvg(page);
      }
      return next;
    } catch (error) {
      doc.free();
      throw error;
    }
  }
  private replace(bytes: Uint8Array | undefined, name: string, unsaved = false, prepareCommands?:()=>void, admit?: (next: RhwpAdapter)=>void, prepared?: RhwpAdapter["doc"]) {
    const next = this.replacementCandidate(bytes, admit, prepared);
    let adopted = false;
    try {
      const state = this.captureReplacementState();
      const { old, files, history } = state;
      try {
        this.adoptReplacement(next, name, history, unsaved, prepareCommands);
      } catch (error) {
        this.restoreReplacementState(state);
        throw error;
      }
      adopted = true;
      if (files.request?.status === "awaiting-file")
        files.request.status = "superseded";
      // The replacement is committed. Freeing Core also releases its native
      // snapshots; cleanup errors must not be reported as replacement failure.
      try {
        old.doc.free();
      } catch (error) {
        this.reportError(error);
      }
    } finally {
      if (!adopted) next.doc.free();
    }
  }
  /** Internal AI integration: request policy/digest/current state were checked
   * by the opt-in bridge. Existing replacement owns the old document rollback. */
  adoptPreparedAI(bytes: Uint8Array) {
    if (this.ui.standalone || this.busy || this.continuation || this.adapter.transientEdit ||
        this.adapter.scope !== "edit" || this.adapter.documentLocked)
      throw Error("연결된 편집기에서 준비된 문서를 적용할 수 없습니다.");
    this.replace(bytes, "새 문서.hwpx", true);
  }
  /** Checked host open transfers only the detached, admitted model. */
  adoptHostOpen(prepared: RhwpAdapter["doc"], format: 'hwp'|'hwpx', scope: 'edit'|'readonly', fileName?: string) {
    if (!isCheckedExternalSibling(this.adapter.doc, prepared)) {
      // This call consumes a transferred detached handle even on admission failure.
      if (prepared !== this.adapter.doc) prepared.free();
      throw Error("문서 검사 경로를 확인할 수 없습니다.");
    }
    if (this.ui.standalone || this.busy || this.continuation || this.adapter.transientEdit || this.dirty) {
      prepared.free();
      throw Error("현재 작업본은 교체할 수 없습니다.");
    }
    this.replace(undefined, fileName ?? "연결 문서." + format, false, undefined, next => {
      if (next.pageCount > 100) throw Error("연결 문서의 페이지 한도를 넘었습니다.");
      if (scope === "readonly") {
        next.scope = "readonly";
        next.viewerOnlyReason = "연결된 서비스에서 읽기 전용으로 열었습니다";
      } else {
        if (next.scope !== "edit" || next.documentLocked)
          throw Error("이 문서는 읽기 전용으로만 열 수 있습니다.");
        next.exportChecked();
      }
    }, prepared);
  }
  private captureReplacementState() {
      const old = { ...this.adapter };
      const restoreSelection = this.editor.captureDocumentReplacementRollback();
      const files = {
        filename: this.filename,
        request: this.request,
        exported: this.exported,
        notice: this.notice,
        continuation: this.continuation,
        nativeTarget: this.nativeTarget,
      };
      const history = this.editor.history;
      const restoreHistory = history.captureDocumentReplacementRollback();
    return { old, restoreSelection, files, history, restoreHistory };
  }
  private adoptReplacement(next: RhwpAdapter, name: string, history: Interaction["history"], unsaved = false, prepareCommands?:()=>void) {
        // Detach old snapshots without discarding them. UI sees only candidate
        // history; the old Core remains its snapshots' owner until commit.
        history.detachForDocumentReplacement();
        Object.assign(this.adapter, {
          doc: next.doc,
          documentId: next.documentId,
          documentLocked: next.documentLocked,
          scope: next.scope,
          viewerOnlyReason: next.viewerOnlyReason,
          revision: 0,
          savedRevision: unsaved ? -1 : 0,
        });
        this.editor.reset();
        this.filename = name;
        this.nativeTarget = null;
        this.request = null;
        this.exported = null;
        this.continuation = null;
        this.notice = next.viewerOnlyReason ? `읽기 전용 표시 · ${next.viewerOnlyReason} · 편집/저장 미지원, 원본 파일 보존` : "";
        // Build through the real editor while the old document and snapshot
        // arrays are still retained for replacement rollback. No blank paint.
        prepareCommands?.();
        this.ui.change(true);

  }
  private restoreReplacementState(state: ReturnType<FileLifecycle["captureReplacementState"]>) {
    const { old, restoreSelection, files, restoreHistory } = state;
        Object.assign(this.adapter, old);
        restoreSelection();
        Object.assign(this, files);
        restoreHistory();
        try {
          this.ui.change(true);
        } catch (paintError) {
          this.reportError(paintError);
        }
  }

  private emptyDocument(message: string) {
    return this.transition(message, () => {
      this.replace(undefined, "새 문서.hwpx");
      return true;
    });
  }
  newDocument() {
    return this.emptyDocument(
      "저장하지 않은 변경을 닫고 새 문서를 여시겠습니까?",
    );
  }
  closeDocument() {
    return this.emptyDocument(
      "저장하지 않은 변경을 버리고 현재 문서를 닫으시겠습니까?",
    );
  }
  open(file: Pick<File, "name" | "size" | "arrayBuffer">) {
    let bytes: Uint8Array;
    return this.transition(
      "현재 변경을 닫고 선택한 문서를 여시겠습니까?",
      () => {
        this.replace(bytes, file.name);
        return true;
      },
      async () => {
        // Reject malformed input BEFORE offering to save/discard the current
        // dirty document. An invalid drop must not mark the original clean.
        // Keep bytes, not an extra live Core, across a deferred download save.
        const { documentId, revision } = this.adapter;
        if (file.size > 30 * 1024 * 1024)
          throw Error("PoC 파일 크기 제한은 30 MB입니다.");
        bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > 30 * 1024 * 1024)
          throw Error("PoC 파일 크기 제한은 30 MB입니다.");
        if (documentId !== this.adapter.documentId || revision !== this.adapter.revision)
          throw Error("파일을 읽는 동안 현재 문서가 변경되었습니다. 다시 열기를 선택하세요.");
        assertSafeHwpxEntryNames(bytes);
        const candidate = this.replacementCandidate(bytes);
        candidate.doc.free();
      },
    );
  }
  /** Local generated-file adoption. Reuses the atomic open/History rollback path;
   * never changes the old file's target; dirty replacement uses the same explicit
   * save/continue/cancel transition as ordinary Open. */
  openGenerated(bytes: Uint8Array, expected: {documentId:string;expectedRevision:number}) {
    const validate=()=>{
      if (!this.ui.standalone || this.adapter.scope !== "edit") throw Error("새 문서는 편집 가능한 독립 창에서 여세요.");
      if (this.adapter.documentId !== expected.documentId || this.adapter.revision !== expected.expectedRevision) throw Error("생성 중 문서가 변경되었습니다. 다시 가져오세요.");
      if (!(bytes instanceof Uint8Array) || bytes.length > 30 * 1024 * 1024) throw Error("유효한 HWPX 크기가 아닙니다.");
      assertSafeHwpxEntryNames(bytes);
    };
    return this.transition("현재 문서의 변경을 저장하고 Markdown 문서를 여시겠습니까?", () => {
      validate();
      this.replace(bytes, "새 문서.hwpx", true);
      return true;
    },async()=>validate());
  }
  /** @internal Markdown command import retains one real Undo entry on the
   * newly opened blank. Existing unsaved-file choice/replacement rollback owns
   * original files, History, selection and pending Save tokens throughout. */
  openMarkdownCommands(request:MarkdownRequest,expected:{documentId:string;expectedRevision:number}){
    const draft=structuredClone(request),identity={...expected};
    const validate=()=>{
      if(!this.ui.standalone||this.adapter.scope!=='edit')throw Error('편집 가능한 독립 창에서 가져오세요.');
      if(this.adapter.documentId!==identity.documentId||this.adapter.revision!==identity.expectedRevision)throw Error('마크다운을 준비하는 동안 문서가 변경되었습니다. 다시 가져오세요.');
    };
    return this.transition('현재 문서의 변경을 저장하고 Markdown 문서를 여시겠습니까?',()=>{
      validate();this.replace(undefined,'새 문서.hwpx',true,()=>{applyMarkdownCommands(this.editor,draft);});return true;
    },async()=>{
      validate();
      // Reject malformed/unsafe documents before Save/Discard is offered.
      // Isolated preflight is disposed; no snapshot/resource crosses modules.
      const checked=composeMarkdownHwpx(this.adapter.doc,draft);assertSafeHwpxEntryNames(checked.bytes);validate();
    });
  }
  save(as = false) {
    return this.run(() => this.prepareSave(as));
  }
  get canDownloadCopy() {
    const r = this.request;
    return this.ui.standalone && r?.documentId === this.adapter.documentId && r.status === "failed" &&
      r.failure !== undefined && r.failure !== "export";
  }
  downloadCopy() {
    if (!this.canDownloadCopy) return Promise.resolve(false);
    return this.run(() => this.prepareSave(false, true));
  }
  private async prepareSave(as: boolean, copy = false) {
    this.continuation = null; // A fresh save supersedes any deferred switch.
    if (as && !this.ui.standalone) return false;
    // Every accepted attempt supersedes the old token, including prompt cancel
    // and export/dispatch failure. Never fall back to a previous download.
    const sequence = ++this.sequence;
    if (this.request?.status === "awaiting-file")
      this.request.status = "superseded";
    const request: Download = {
      requestId: `${this.adapter.documentId}:${sequence}`,
      sequence,
      filename: this.filename,
      documentId: this.adapter.documentId,
      revision: this.adapter.revision,
      status: "preparing",
    };
    this.request = this.ui.standalone ? request : null;
    this.exported = null;
    this.saving = true;
    let phase: "picker" | "write" | "export" | "download" | "readback" = "picker";
    try {
      if (this.ui.standalone && !copy && !this.ui.pickSaveTarget) {
        request.status = "failed";
        request.failure = "unavailable";
        this.notice = "이 브라우저에서는 저장 위치를 직접 선택할 수 없습니다. HWPX 사본을 내려받아 저장하세요.";
        return false;
      }
      let name: string;
      let needsTarget = !copy && (as || !!this.ui.pickSaveTarget);
      try { name = hwpxName(this.filename); }
      catch { name = "새 문서.hwpx"; needsTarget = true; }
      let target: NativeSaveTarget | null = null;
      if (!copy && needsTarget && this.ui.standalone && this.ui.pickSaveTarget) {
        // Invoke the native chooser before export/any unrelated async work so the
        // original click/shortcut user activation reaches the browser unchanged.
        const choice = !as && this.nativeTarget?.documentId === this.adapter.documentId
          ? Promise.resolve(this.nativeTarget.target)
          : this.ui.pickSaveTarget(name);
        this.ui.change(false);
        target = await choice;
        if (target === null) {
          request.status = "canceled";
          this.notice = "저장 취소됨 · 문서는 변경되지 않았습니다.";
          return false;
        }
        // Use exactly the user-approved handle name; never rename a different
        // physical target behind the native chooser or relax file verification.
        name = hwpxName(target.name);
        if (name !== target.name)
          throw Error("저장 창에서 확장자가 .hwpx인 파일 이름을 선택하세요.");
      }
      const current = () => this.request === (this.ui.standalone ? request : null) &&
        request.documentId === this.adapter.documentId && request.revision === this.adapter.revision &&
        (request.status === "preparing" || request.status === "awaiting-file");
      if (!current())
        throw Error("저장 창이 열린 동안 문서 또는 저장 요청이 변경되었습니다. 다시 저장하세요.");
      phase = "export";
      const { bytes, documentId, revision } = this.adapter.exportChecked();
      Object.assign(request, { filename: name, documentId, revision });
      // Keep a private copy of the checked export, independent of the transport.
      this.exported = this.ui.standalone ? new Uint8Array(bytes) : null;
      request.status = "awaiting-file";
      if (target) {
        phase = "write";
        const writable = await target.createWritable();
        try {
          if (!current()) throw Error("저장 대상 또는 문서가 변경되어 저장을 취소했습니다.");
          await writable.write(new Uint8Array(bytes));
          if (!current()) throw Error("저장 중 문서가 변경되어 저장을 취소했습니다.");
          await writable.close();
        } catch (error) {
          try { await writable.abort(); } catch { /* preserve original write error */ }
          throw error;
        }
        if (!current()) throw Error("저장 요청이 변경되었습니다. 현재 문서는 저장 완료로 처리하지 않습니다.");
        // Read the actual selected file back; close() alone is not a clean claim.
        phase = "readback";
        const saved = await target.getFile();
        const confirmed = await this.confirmFile(request.requestId, saved, true);
        if (confirmed) {
          this.nativeTarget = { documentId: request.documentId, target };
          this.notice = `${saved.name} 저장 완료`;
        }
        if (!confirmed) throw Error("선택한 파일의 저장 내용을 확인하지 못했습니다.");
        return true;
      }
      phase = "download";
      this.ui.download(bytes, name, request.requestId);
      if (request.status === "awaiting-file")
        this.notice = this.ui.standalone
          ? "HWPX 사본 다운로드를 요청했습니다. 저장을 완료하려면 내려받은 파일을 선택해 확인하세요."
          : `${name} 다운로드 요청됨 · 호스트 저장 상태는 호스트에서 확인하세요.`;
      this.ui.change(false);
      return true;
    } catch (error) {
      request.status = "failed";
      freezeDiagnosticFor(error,'SAVE_FAILED','file-lifecycle');
      this.exported = null;
      const code = error instanceof DOMException ? error.name : "";
      request.failure = (phase === "picker" || phase === "write") && ["NotAllowedError", "SecurityError"].includes(code)
        ? "permission" : phase === "picker" ? "write" : phase;
      this.notice = request.failure === "permission"
        ? "저장 권한이 허용되지 않았습니다. 다른 위치에서 다시 시도하거나 HWPX 사본을 내려받으세요."
        : phase === "export" ? "문서를 HWPX로 안전하게 만들지 못했습니다. 현재 문서는 그대로 유지됩니다."
        : phase === "readback" ? "파일이 올바르게 저장됐는지 확인할 수 없습니다. 현재 문서는 그대로 유지됩니다."
        : phase === "download" ? "HWPX 사본을 내려받지 못했습니다. 다시 시도하세요."
        : code === "NoModificationAllowedError" ? "선택한 파일에 쓸 수 없습니다. 파일을 닫거나 다른 위치를 선택하세요."
        : "파일을 저장하지 못했습니다. 다른 위치에서 다시 시도하거나 HWPX 사본을 내려받으세요.";
      if (!this.ui.standalone) throw error;
      return false;
    } finally {
      this.saving = false;
    }
  }
  cancelDownload(requestId: string) {
    const request = this.request;
    if (
      !this.ui.standalone ||
      !request ||
      request.requestId !== requestId ||
      !["preparing", "awaiting-file"].includes(request.status)
    )
      return false;
    request.status = "canceled";
    this.exported = null;
    if (this.continuation?.requestId === requestId) this.continuation = null;
    this.notice = "다운로드 확인 취소됨 · 다시 저장하세요.";
    try {
      this.ui.change(false);
    } catch (error) {
      this.reportError(error);
    }
    return true;
  }
  async confirmDownloaded(requestId?: string, file?: SavedFile) {
    return this.confirmFile(requestId, file);
  }
  private async confirmFile(requestId?: string, file?: SavedFile, duringNativeSave = false) {
    const pending = this.request,
      exported = this.exported;
    const current = () =>
      this.ui.standalone &&
      (!this.busy || duringNativeSave) &&
      this.request === pending &&
      pending?.requestId === requestId &&
      pending?.status === "awaiting-file" &&
      pending.documentId === this.adapter.documentId &&
      pending.revision <= this.adapter.revision &&
      pending.revision >= this.adapter.savedRevision;
    if (!pending || !exported || !file || !current()) return false;
    const selectedName = file.name;
    try {
      if (
        !matchesDownloadedHwpxName(pending.filename, selectedName) ||
        file.size !== exported.length
      )
        throw Error(
          "확인 대상의 파일명·크기가 다릅니다. 해당 요청으로 저장한 파일을 선택하세요.",
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Save/cancel/replace or another completion may have invalidated the token
      // while this file was being read. No old callback may promote a new request.
      if (!current()) return false;
      if (
        bytes.length !== exported.length ||
        bytes.some((b, i) => b !== exported[i])
      )
        throw Error(
          "저장 파일이 해당 요청의 HWPX와 다릅니다. 다시 저장하세요.",
        );
    } catch (error) {
      if (current()) {
        if (duringNativeSave) throw error;
        this.reportError(error);
      }
      return false;
    }
    // An edit after the export remains dirty; acknowledgment covers that export only.
    const continuation = this.commitFileConfirmation(pending, selectedName, duringNativeSave);
    if (continuation && continuation.requestId === requestId) {
      if (
        continuation.documentId === this.adapter.documentId &&
        continuation.revision === this.adapter.revision &&
        !this.dirty
      ) {
        await this.run(continuation.action);
      } else {
        this.notice +=
          " · 추가 변경이 있어 문서 전환/닫기는 취소했습니다. 현재 문서를 유지합니다.";
        try {
          this.ui.change(false);
        } catch (error) {
          this.reportError(error);
        }
      }
    }
    return true;
  }
  private commitFileConfirmation(pending: Download, selectedName: string, native: boolean) {
    // An edit after the export remains dirty; acknowledgment covers that export only.
    this.adapter.savedRevision = pending.revision;
    this.filename = selectedName;
    // A confirmed download is now the saved file. The previous native handle
    // may refer to a different file and must never receive the next Ctrl+S.
    if (!native) this.nativeTarget = null;
    pending.confirmedFilename = selectedName;
    pending.status = "completed";
    this.exported = null;
    this.notice = `${selectedName} 다운로드 파일 저장 확인됨`;
    const continuation = this.continuation;
    this.continuation = null;
    try {
      this.ui.change(false);
    } catch (error) {
      this.reportError(error);
    }
    return continuation;
  }

}

export function downloadHwpx(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/hwp+zip" }),
  );
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
