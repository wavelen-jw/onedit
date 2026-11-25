import { exportDocumentHwpx } from "./adapter-save.js";
import { replaceEditorDocument } from "./editor-document-replacement.js";
import { siblingDocument } from "./core-runtime.js";
import { assertPictureFreeTextEdit } from "./search-object-safety.js";
import type { HwpDocument } from "../development/core/rhwp.js";
import { RhwpAdapter } from "./adapter.js";
import { Interaction } from "./interaction.js";
import { type Position } from "./model.js";
/** Host metadata never owns document content. Server ACL/CAS remain the host's responsibility. */
type HostDocumentBinding = { documentId: string; workingCopyId: string; baseVersion: string };

export class NextHostAdapter {
  private bound?: { instance: string; value: HostDocumentBinding | null };
  private local?: HostDocumentBinding;

  constructor(
    readonly adapter: RhwpAdapter,
    readonly editor: Interaction,
    private readonly localWorkspace = false,
  ) {}

  get binding() {
    const id = this.adapter.documentId;
    if (!this.localWorkspace) return this.bound?.value ?? null;
    if (this.bound?.instance === id && this.bound.value) return this.bound.value;
    // Local files in this workspace need document identity for SDK requests.
    // A later local open must never reuse a previous Host working-copy ID.
    if (this.local?.documentId !== id)
      this.local = { documentId: id, workingCopyId: id, baseVersion: "local" };
    return this.local;
  }

  set binding(value: HostDocumentBinding | null) {
    this.bound = { instance: this.adapter.documentId, value };
  }

  state() {
    const a = this.adapter;
    return {
      binding: this.binding,
      documentId: a.documentId,
      mutationRevision: a.revision,
      dirty: a.revision !== a.savedRevision,
      pageCount: a.pageCount,
      scope: a.scope,
      hasSelection: this.editor.selection.kind !== "caret",
    };
  }
  check(params: any) {
    if (
      params.documentId !== this.adapter.documentId ||
      params.expectedRevision !== this.adapter.revision
    )
      throw Error("문서 ID 또는 변경 버전이 다릅니다.");
  }
  route(method: string, params: any = {}) {
    const a = this.adapter;
    if (a.transientEdit && method !== "getState")
      throw Error("한글 조합을 확정하거나 취소한 뒤 요청하세요.");
    switch (method) {
      case "getState":
        return this.state();
      case "openHwpx": return this.openHwpx(a, params);
      case "getSemanticSnapshot":
        this.check(params);
        return a.semantic();
      case "exportHwpx": {
        this.check(params);
        const binding = this.binding;
        return exportDocumentHwpx(a, () => {
          this.check(params);
          return this.binding === binding;
        }).then(out => ({ ...out, binding }));
      }
      case "markSaved":
        return this.markSaved(a, params);
      case "setEditScope":
        this.check(params);
        if (params.scope !== "readonly" && params.scope !== "edit")
          throw Error("영역별 Scope는 아직 미구현입니다.");
        a.scope = params.scope;
        return this.state();
      case "applyTextEdits": {
        this.check(params);
        if (!Array.isArray(params.edits) || !params.edits.length)
          throw Error("명시적인 편집 대상이 필요합니다.");
        const seen = new Set<string>();
        for (const edit of params.edits) {
          const p = edit.position as Position;
          a.assertEditable(p);
          assertPictureFreeTextEdit(a, p);
          if (
            p.kind === "body" &&
            (a.inline(p).length ||
              a
                .call("getCursorModel")
                .lists.some(
                  (l: any) =>
                    l.isCell &&
                    l.hostListId === 0 &&
                    l.sectionIndex === p.sec &&
                    l.hostPara === p.para,
                ))
          )
            throw Error(
              "표가 포함된 문단은 텍스트 전용 AI 교체 대상이 아닙니다.",
            );
          if (
            p.offset !== 0 ||
            typeof edit.expectedText !== "string" ||
            typeof edit.replacement !== "string" ||
            /[\r\n]/.test(edit.replacement)
          )
            throw Error("한 문단의 정확한 교체만 지원합니다.");
          if (a.text(p) !== edit.expectedText)
            throw Error("AI 편집 대상 원문이 변경되었습니다.");
          const first = JSON.stringify(a.charProps(p));
          for (let offset = 1; offset < a.length(p); offset++)
            if (JSON.stringify(a.charProps({ ...p, offset })) !== first)
              throw Error(
                "혼합 글자 서식 문단의 AI 교체는 아직 지원하지 않습니다.",
              );
          const key = JSON.stringify(p);
          if (seen.has(key)) throw Error("중복 편집 대상입니다.");
          seen.add(key);
        }
        this.editor.selection = this.editor.history.transact(
          "host-exact-text-edits",
          this.editor.selection,
          () => {
            let focus = this.editor.selection.focus;
            for (const edit of params.edits) {
              const p = edit.position as Position;
              const props = a.charProps(p);
              a.remove(p, { ...p, offset: a.length(p) });
              focus = a.insert(p, edit.replacement);
              if (edit.replacement) {
                const wanted = JSON.stringify(props);
                const unchanged = Array.from(edit.replacement).every((_, at) =>
                  JSON.stringify(a.charProps({ ...p, offset: a.logical(p, at) })) === wanted,
                );
                if (!unchanged) a.format(p, focus.offset, props);
              }
            }
            return { kind: "caret", focus };
          },
        );
        return this.state();
      }
      default:
        throw Error(`지원하지 않는 호스트 명령: ${method}`);
    }
  }
  private openHwpx(a: RhwpAdapter, params: any) {
        if (a.revision !== a.savedRevision)
          throw Error("저장하지 않은 변경이 있어 문서 전환을 거부합니다.");
        if (
          !(params.bytes instanceof Uint8Array) ||
          params.bytes.length > 30 * 1024 * 1024
        )
          throw Error("유효한 30 MB 이하 HWPX가 필요합니다.");
        for (const key of ["documentId", "workingCopyId", "baseVersion"])
          if (typeof params.binding?.[key] !== "string" || !params.binding[key])
            throw Error("작업본 바인딩이 필요합니다.");
        a.completeLocalBodyFlow();
        return this.adoptInspectedHwpx(siblingDocument(a.doc, params.bytes), params.binding);
  }

  /** Host v2 already inspected this exact detached document. This path consumes it. */
  adoptInspectedHwpx(candidate: HwpDocument, binding: NonNullable<NextHostAdapter["binding"]>) {
    let next: ReturnType<RhwpAdapter["openedDocumentState"]>;
    try {
      if (this.adapter.revision !== this.adapter.savedRevision || this.adapter.transientEdit)
        throw Error("저장하지 않은 변경이 있어 문서 전환을 거부합니다.");
      this.adapter.completeLocalBodyFlow();
      next = this.adapter.openedDocumentState(candidate);
    } catch (error) {
      if (candidate !== this.adapter.doc) candidate.free();
      throw error;
    }
    replaceEditorDocument(this.editor, next, {
      initialize: () => { this.binding = { ...binding }; },
      cleanupError: error => console.error("이전 문서 정리 실패", error),
    });
    return this.state();
  }

  private markSaved(a: RhwpAdapter, params: any) {
        this.check(params);
        if (
          !this.binding ||
          params.workingCopyId !== this.binding.workingCopyId
        )
          throw Error("저장 작업본이 다릅니다.");
        a.savedRevision = params.expectedRevision;
        return this.state();
  }
}
