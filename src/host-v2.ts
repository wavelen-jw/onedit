import { composeMarkdownHwpx } from "./markdown-compose.js";
import { assertSafeHwpxEntryNames } from "./hwpx-open-boundary.js";
import { RhwpAdapter } from "./adapter.js";
import { siblingDocument } from "./core-runtime.js";
import { type Position, type Selection, copy, paraIndex } from "./model.js";
import type { NextHostAdapter } from "./host.js";

export class HostError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
export function requireHost(
  ok: unknown,
  code: string,
  message: string,
): asserts ok {
  if (!ok) throw new HostError(code, message);
}
export const hostMethods = {
  getState: "read",
  getCapabilities: "read",
  readSelection: "read",
  readDocument: "read",
  previewEdits: "read",
  releaseHandles: "read",
  applyProposal: "edit",
  undo: "edit",
  redo: "edit",
  setEditScope: "edit",
  openHwpx: "lifecycle",
  createDocument: "lifecycle",
  generateMarkdown: "lifecycle",
  createMarkdownDocument: "lifecycle",
  exportHwpx: "save",
  completeSave: "save",
  releaseExport: "save",
} as const;
export type HostPermission = "read" | "edit" | "save" | "lifecycle";
export const uuid = () => crypto.randomUUID();
export const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const transient = (a: RhwpAdapter) =>
  !!(a as RhwpAdapter & { transientEdit?: boolean }).transientEdit;
const scalar = (text: string, from: number, to?: number) =>
  Array.from(text).slice(from, to).join("");
const string = (s: unknown, max = 256): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= max;
export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
type Segment = {
  id: string;
  position: Position;
  end: number;
  text: string;
  paragraphText: string;
  paragraphProperties: unknown;
  editable: boolean;
  reason?: string;
  format?: Record<string, any>;
};
type Capture = {
  documentId: string;
  revision: number;
  selection: Selection;
  segments: Segment[];
};
type Proposal = {
  capture: Capture;
  edits: { segmentId: string; replacement: string }[];
};
type SaveTicket = {
  documentId: string;
  revision: number;
  workingCopyId: string;
  sha256: string;
  sequence: number;
  status: "pending" | "failed" | "saved" | "superseded";
  version?: string;
};

/** Editor-owned handles are opaque. Hosts never reconstruct a mutation address from a projection. */
export class ExternalHost {
  readonly instanceId = uuid();
  private captures = new Map<string, Capture>();
  private proposals = new Map<string, Proposal>();
  private saves = new Map<string, SaveTicket>();
  private sequence = 0;
  private acknowledgedSequence = 0;
  constructor(readonly host: NextHostAdapter) {}
  get a() {
    return this.host.adapter;
  }
  get editor() {
    return this.host.editor;
  }
  state() {
    return {
      ...this.host.state(),
      binding: copy(this.host.binding),
      instanceId: this.instanceId,
      transientEdit: transient(this.a),
      selection: copy(this.editor.selection),
      canUndo: this.editor.history.undoStack.length > 0,
      canRedo: this.editor.history.redoStack.length > 0,
    };
  }
  capabilities() {
    return {
      version: 2,
      methods: hostMethods,
      offsetUnits: { body: "Core logical slots", cell: "Unicode scalars" },
      editing:
        "Exact captured plain-text ranges within existing paragraphs; uniform selected character properties; one History transaction per approved proposal",
      creation: ["blank", "plain-paragraphs", "host-supplied-hwpx", "markdown-subset-v1"],
      extraction:
        "Core semantic projection and explicit native owner graph; table row/col/span/nested parent links retained",
      limitations: [
        "No structural AI table/object/field editing",
        "No multiline replacement within a segment",
        "Mixed selected character formatting is read-only",
        "Opaque object bytes are not AI text",
        "Handles expire on ANY committed document change; no automatic rebase",
        "Replay receipts survive channel reconnect, not iframe reload",
        "Host owns durable recovery and storage CAS",
      ],
    };
  }
  private ready() {
    requireHost(
      !transient(this.a),
      "BUSY_COMPOSITION",
      "한글 조합을 확정하거나 취소한 뒤 요청하세요.",
    );
  }
  private current(p: any) {
    this.ready();
    requireHost(
      p.documentId === this.a.documentId &&
        p.expectedRevision === this.a.revision,
      "REVISION_CONFLICT",
      "문서 또는 변경 버전이 달라졌습니다. 다시 읽고 검토하세요.",
    );
  }
  private captureCurrent(c: Capture) {
    this.current({ documentId: c.documentId, expectedRevision: c.revision });
  }
  private pruneHandles() {
    for (const [id, c] of this.captures)
      if (c.documentId !== this.a.documentId || c.revision !== this.a.revision)
        this.captures.delete(id);
    for (const [id, p] of this.proposals)
      if (
        p.capture.documentId !== this.a.documentId ||
        p.capture.revision !== this.a.revision
      )
        this.proposals.delete(id);
  }
  private plainReason(p: Position): string | undefined {
    const a = this.a;
    a.validate(p);
    const list = p.kind === "body" ? 0 : a.list(p).listId;
    // Include every control, including invisible fields. Table ownership and
    // object anchors are not inferred from string length or painted boxes.
    let controlPara = paraIndex(p);
    if (p.kind === "body")
      for (let sec = 0; sec < p.sec; sec++)
        controlPara += a.doc.getParagraphCount(sec);
    if (
      a
        .call<any[]>("getControls")
        .some(
          (c) =>
            c.list === list &&
            c.para === controlPara &&
            !["secd", "cold"].includes(c.ctrlId),
        )
    )
      return "PARAGRAPH_HAS_CONTROL";
    const model = a.call("getCursorModel");
    if (
      model.lists.some(
        (l: any) =>
          l.hostListId === list &&
          l.hostPara === paraIndex(p) &&
          l.sectionIndex === p.sec &&
          l.isCell,
      )
    )
      return "PARAGRAPH_HAS_OWNED_STRUCTURE";
    if (p.kind === "cell" && a.list(p).row === undefined)
      return "NON_TABLE_CONTAINER";
    if (/[\u0000-\u001f\u007f]/u.test(a.text(p))) return "CONTROL_TEXT";
    return undefined;
  }
  private segment(p: Position, end: number, id: string): Segment {
    const a = this.a;
    a.validate(p);
    a.validate({ ...p, offset: end });
    requireHost(end >= p.offset, "INVALID_RANGE", "잘못된 선택 범위입니다.");
    const paragraphText = a.text(p),
      fromText = a.textOffset(p),
      toText = a.textOffset(p, end);
    let reason = this.plainReason(p),
      format: Record<string, any> | undefined;
    if (!reason) {
      format = copy(a.charProps(p));
      for (let at = p.offset + 1; at < end; at++) {
        if (!equal(a.charProps({ ...p, offset: at }), format)) {
          reason = "MIXED_CHARACTER_FORMAT";
          break;
        }
      }
      try {
        a.assertEditable(p);
      } catch {
        reason ??= "PROTECTED_OR_READONLY";
      }
    }
    return {
      id,
      position: copy(p),
      end,
      text: scalar(paragraphText, fromText, toText),
      paragraphText,
      paragraphProperties: copy(a.paraProps(p)),
      editable: !reason,
      ...(reason ? { reason } : {}),
      format,
    };
  }
  readSelection(p: any) {
    this.current(p);
    this.pruneHandles();
    requireHost(
      this.captures.size < 32,
      "HANDLE_LIMIT",
      "선택 읽기 핸들이 가득 찼습니다. 기존 핸들을 사용하거나 해제하세요.",
    );
    const selection = copy(this.editor.selection),
      segments: Segment[] = [],
      omissions: unknown[] = [];
    if (selection.kind === "object")
      omissions.push({ reason: "OBJECT_NOT_TEXT", selection });
    else {
      const targets = this.editor.targets(selection);
      requireHost(
        targets.length <= 256,
        "SELECTION_TOO_LARGE",
        "한 번에 읽을 선택 문단은 256개까지입니다.",
      );
      for (const [i, t] of targets.entries())
        segments.push(this.segment(t.p, t.end, String(i)));
      requireHost(
        segments.reduce((n, s) => n + s.paragraphText.length, 0) <= 200_000,
        "SELECTION_TOO_LARGE",
        "선택 문맥이 너무 큽니다. 범위를 줄여 주세요.",
      );
    }
    const capture = {
      documentId: this.a.documentId,
      revision: this.a.revision,
      selection,
      segments,
    };
    const selectionToken = uuid();
    this.captures.set(selectionToken, capture);
    return {
      selectionToken,
      ...copy(capture),
      omissions,
      context: p.includeDocument ? this.readDocument(p) : undefined,
    };
  }
  readDocument(p: any) {
    this.current(p);
    const projection = this.a.semantic(),
      model = this.a.call("getCursorModel"),
      controls = this.a.call<any[]>("getControls");
    return {
      documentId: this.a.documentId,
      revision: this.a.revision,
      projection,
      ownerGraph: copy(model.lists),
      controls,
      coverage: {
        representation: "semantic-projection-plus-native-owner-graph",
        losslessFile: false,
        addressPolicy:
          "Semantic table ordinals are read-only. Native listId/hostListId/owner addresses belong only to this document revision. Apply only captured tokens.",
        omissions: controls
          .filter((c) => !["tbl", "secd", "cold"].includes(c.ctrlId))
          .map((c) => ({
            list: c.list,
            para: c.para,
            control: c.controlIndex,
            type: c.ctrlId,
            reason: "CONTROL_METADATA_ONLY_NOT_AI_TEXT",
          })),
        notes:
          "Pictures, drawings, equations, opaque graphs and binary resources are retained in the document; not flattened into text. Unsupported queries reject explicitly.",
      },
    };
  }
  preview(p: any) {
    this.ready();
    this.pruneHandles();
    const capture = this.captures.get(p.selectionToken);
    requireHost(
      capture,
      "STALE_SELECTION",
      "선택 핸들이 없거나 문서가 변경되었습니다.",
    );
    this.captureCurrent(capture);
    requireHost(
      Array.isArray(p.edits) &&
        p.edits.length > 0 &&
        p.edits.length <= capture.segments.length,
      "INVALID_EDITS",
      "선택 문단에 대응하는 수정안이 필요합니다.",
    );
    const seen = new Set<string>();
    const edits = p.edits.map((e: any) => {
      requireHost(
        e &&
          string(e.segmentId) &&
          typeof e.replacement === "string" &&
          e.replacement.length <= 32_000 &&
          !/[\u0000-\u001f\u007f]/u.test(e.replacement),
        "INVALID_REPLACEMENT",
        "수정안은 제어 문자·줄바꿈 없는 32,000자 이하 문자열이어야 합니다.",
      );
      const segment = capture.segments.find((s) => s.id === e.segmentId);
      requireHost(
        segment && !seen.has(e.segmentId),
        "INVALID_TARGET",
        "선택에 없는 대상 또는 중복 대상입니다.",
      );
      requireHost(
        segment.editable,
        "UNSUPPORTED_STRUCTURE",
        segment.reason ?? "이 구조는 안전한 텍스트 교체를 지원하지 않습니다.",
      );
      seen.add(e.segmentId);
      return {
        segmentId: e.segmentId as string,
        replacement: e.replacement as string,
      };
    });
    requireHost(
      this.proposals.size < 32 &&
        edits.reduce((n: number, e: any) => n + e.replacement.length, 0) <=
          200_000,
      "PROPOSAL_LIMIT",
      "보관 가능한 수정안 범위를 넘었습니다.",
    );
    const proposalId = uuid();
    this.proposals.set(proposalId, { capture: copy(capture), edits });
    return {
      proposalId,
      documentId: capture.documentId,
      revision: capture.revision,
      changes: edits.map((e: any) => ({
        segmentId: e.segmentId,
        before: capture.segments.find((s) => s.id === e.segmentId)!.text,
        after: e.replacement,
      })),
      approvalRequired: true,
      stateUnchanged: true,
    };
  }
  apply(p: any) {
    this.ready();
    requireHost(
      p.approved === true,
      "APPROVAL_REQUIRED",
      "연결 서비스에서 사용자가 확인한 수정안만 적용하세요.",
    );
    const proposal = this.proposals.get(p.proposalId);
    requireHost(
      proposal,
      "STALE_PROPOSAL",
      "수정안 핸들이 없거나 만료되었습니다.",
    );
    this.captureCurrent(proposal.capture);
    const a = this.a;
    const edits = proposal.edits.map((e) => ({
      ...e,
      segment: proposal.capture.segments.find((s) => s.id === e.segmentId)!,
    }));
    for (const { segment: s } of edits) {
      const current = this.segment(s.position, s.end, s.id);
      requireHost(
        current.editable && equal(current, s),
        "TARGET_CONFLICT",
        "대상 내용·주소·서식 또는 편집 권한이 변경되었습니다.",
      );
    }
    const changed = edits.filter((e) => e.replacement !== e.segment.text);
    if (!changed.length)
      return { applied: false, noOp: true, state: this.state() };
    const before = copy(a.semantic());
    const expectedParagraphs: {
      before: string;
      after: string;
      start: number;
      end: number;
      replacement: string;
    }[] = [];
    this.editor.selection = this.editor.history.transact(
      "host-reviewed-proposal",
      this.editor.selection,
      () => {
        let focus = copy(this.editor.selection.focus);
        for (const { segment: s, replacement } of [...changed].reverse()) {
          const p = s.position,
            start = a.textOffset(p),
            end = a.textOffset(p, s.end);
          const expected =
            scalar(s.paragraphText, 0, start) +
            replacement +
            scalar(s.paragraphText, end);
          a.remove(p, { ...p, offset: s.end });
          focus = a.insert(p, replacement);
          if (
            replacement &&
            Array.from(replacement).some(
              (_, i) =>
                !equal(a.charProps({ ...p, offset: p.offset + i }), s.format),
            )
          )
            a.format(p, focus.offset, s.format!);
          const properties = (value: Record<string, any>) => {
            const { charShapeId, ...rest } = value;
            return rest;
          };
          requireHost(
            !replacement ||
              Array.from(replacement).every((_, i) =>
                equal(
                  properties(a.charProps({ ...p, offset: p.offset + i })),
                  properties(s.format!),
                ),
              ),
            "PRESERVATION_FAILED",
            "선택한 글자 서식을 보존하지 못했습니다.",
          );
          requireHost(
            a.text(p) === expected &&
              equal(a.paraProps(p), s.paragraphProperties),
            "PRESERVATION_FAILED",
            "문자 또는 문단 서식 보존 검사에 실패했습니다.",
          );
          expectedParagraphs.push({
            before: s.paragraphText,
            after: expected,
            start,
            end,
            replacement,
          });
        }
        assertOnlyTextChanges(before, a.semantic(), expectedParagraphs);
        // Existing full serializer/reopen loss checks remain the final mutation
        // gate, inside the same snapshot transaction so failure retains old Redo.
        a.exportChecked();
        return { kind: "caret", focus };
      },
    );
    return { applied: true, historyEntries: 1, state: this.state() };
  }
  private cleanLifecycle(p: any) {
    this.current(p);
    requireHost(
      this.a.revision === this.a.savedRevision,
      "UNSAVED_CHANGES",
      "저장하지 않은 문서를 교체할 수 없습니다.",
    );
    requireHost(
      p.binding &&
        ["documentId", "workingCopyId", "baseVersion"].every((k) =>
          string(p.binding[k]),
        ),
      "INVALID_BINDING",
      "문서·작업본·기준 버전 바인딩이 필요합니다.",
    );
  }
  async route(method: string, p: any = {}): Promise<unknown> {
    requireHost(
      p && typeof p === "object" && !Array.isArray(p),
      "INVALID_PARAMS",
      "요청 인자가 올바르지 않습니다.",
    );
    switch (method) {
      case "getState":
        return this.state();
      case "getCapabilities":
        return this.capabilities();
      case "readSelection":
        return this.readSelection(p);
      case "readDocument":
        return this.readDocument(p);
      case "previewEdits":
        return this.preview(p);
      case "releaseHandles": {
        requireHost(
          Array.isArray(p.ids) &&
            p.ids.length <= 64 &&
            p.ids.every((id: unknown) => string(id)),
          "INVALID_HANDLES",
          "해제할 핸들 ID가 필요합니다.",
        );
        for (const id of p.ids) {
          this.captures.delete(id);
          this.proposals.delete(id);
        }
        return { released: p.ids.length };
      }
      case "applyProposal":
        return this.apply(p);
      case "undo":
      case "redo": {
        this.current(p);
        const revision = this.a.revision;
        // Interaction owns typing, block and visual-caret reset as well as
        // restoring the History selection. Do not bypass that owner here.
        this.editor.undo(method === "redo");
        return { changed: this.a.revision !== revision, state: this.state() };
      }
      case "setEditScope":
        this.current(p);
        return this.host.route(method, p);
      case "openHwpx": {
        this.cleanLifecycle(p);
        requireHost(
          p.bytes instanceof Uint8Array &&
            p.bytes.length > 0 &&
            p.bytes.length <= 30 * 1024 * 1024,
          "INVALID_DOCUMENT",
          "30 MiB 이하 HWPX bytes가 필요합니다.",
        );
        assertSafeHwpxEntryNames(p.bytes);
        // Reuse the same Core constructor for isolated read preflight before
        // the existing open path retires the old document and its History.
        const probe = new RhwpAdapter(siblingDocument(this.a.doc, p.bytes));
        try {
          probe.call("getDocumentInfo");
          probe.call("getControls");
          probe.semantic();
          probe.rect({ kind: "body", sec: 0, para: 0, offset: 0 });
        } finally {
          probe.doc.free();
        }
        const state = this.host.route(method, p);
        this.captures.clear();
        this.proposals.clear();
        this.saves.clear();
        this.acknowledgedSequence = 0;
        return state;
      }
      case "generateMarkdown":
      case "createMarkdownDocument": {
        this.current(p);
        requireHost(this.a.scope === "edit", "READ_ONLY", "읽기 전용 문맥에서 문서를 생성할 수 없습니다.");
        requireHost(p.approved === true, "APPROVAL_REQUIRED", "미리보기와 제한을 확인한 뒤 생성하세요.");
        if (method === "createMarkdownDocument") this.cleanLifecycle(p);
        let out;
        try { out = composeMarkdownHwpx(this.a.doc, p); }
        catch (error) {
          const e = error as Error & {code?: string; details?: unknown};
          throw new HostError(e.code ?? "MARKDOWN_REJECTED", e.message, e.details);
        }
        const digest = await sha256(out.bytes);
        // Hashing yields: a user may edit or switch documents while we await.
        this.current(p);
        requireHost(this.a.scope === "edit", "READ_ONLY", "문서 권한이 변경되었습니다.");
        if (method === "generateMarkdown") return {bytes:out.bytes,sha256:digest,plan:out.plan,locations:out.locations};
        this.cleanLifecycle(p);
        this.host.route("openHwpx", {bytes:out.bytes,binding:p.binding});
        this.a.savedRevision = -1;
        this.captures.clear(); this.proposals.clear(); this.saves.clear(); this.acknowledgedSequence = 0;
        return {state:this.state(),sha256:digest,plan:out.plan,locations:out.locations};
      }
      case "createDocument": {
        this.cleanLifecycle(p);
        const paragraphs = p.paragraphs ?? [""];
        requireHost(
          Array.isArray(paragraphs) &&
            paragraphs.length > 0 &&
            paragraphs.length <= 100 &&
            paragraphs.every(
              (t) =>
                typeof t === "string" &&
                t.length <= 10_000 &&
                !/[\u0000-\u001f\u007f]/u.test(t),
            ) &&
            paragraphs.join("").length <= 200_000,
          "INVALID_CREATION",
          "일반 텍스트 문단 1~100개만 지원합니다.",
        );
        // Preserve the source document's verified, private WASM instance.
        // A bare constructor loses the binding used by checked-export siblings.
        const doc = siblingDocument(this.a.doc);
        try {
          const candidate = new RhwpAdapter(doc);
          let at: Position = { kind: "body", sec: 0, para: 0, offset: 0 };
          for (let i = 0; i < paragraphs.length; i++) {
            if (i) at = candidate.split(at);
            at = candidate.insert(at, paragraphs[i]);
          }
          const bytes = candidate.exportChecked().bytes;
          this.host.route("openHwpx", { bytes, binding: p.binding });
          this.a.savedRevision = -1;
          this.captures.clear();
          this.proposals.clear();
          this.saves.clear();
          this.acknowledgedSequence = 0;
          return this.state();
        } finally {
          doc.free();
        }
      }
      case "exportHwpx": {
        this.current(p);
        requireHost(
          this.host.binding,
          "UNBOUND_DOCUMENT",
          "연결 서비스의 작업본 바인딩이 없습니다.",
        );
        if (this.saves.size >= 16)
          for (const [id, ticket] of this.saves) {
            if (["saved", "superseded"].includes(ticket.status))
              this.saves.delete(id);
          }
        requireHost(
          this.saves.size < 16,
          "SAVE_LIMIT",
          "저장 결과를 확인한 뒤 다시 내보내세요.",
        );
        const out = this.a.exportChecked(),
          binding = copy(this.host.binding),
          sha = await sha256(out.bytes),
          saveId = uuid();
        // A local edit may occur during hashing. This ticket still identifies
        // ONLY the exported revision; its acknowledgment never marks later edits saved.
        this.saves.set(saveId, {
          documentId: out.documentId,
          revision: out.revision,
          workingCopyId: binding.workingCopyId,
          sha256: sha,
          sequence: ++this.sequence,
          status: "pending",
        });
        return { ...out, binding, saveId, sha256: sha };
      }
      case "completeSave": {
        this.ready();
        const ticket = this.saves.get(p.saveId);
        requireHost(
          ticket &&
            ticket.documentId === this.a.documentId &&
            ticket.workingCopyId === this.host.binding?.workingCopyId,
          "STALE_SAVE",
          "현재 문서의 내보내기 티켓이 아닙니다.",
        );
        requireHost(
          typeof p.success === "boolean",
          "INVALID_RECEIPT",
          "저장 결과가 필요합니다.",
        );
        if (ticket.status === "saved" || ticket.status === "superseded") {
          requireHost(
            p.success &&
              p.sha256 === ticket.sha256 &&
              p.version === ticket.version,
            "RECEIPT_CONFLICT",
            "이미 처리한 저장 결과와 다릅니다.",
          );
          return { status: ticket.status, state: this.state() };
        }
        if (!p.success) {
          ticket.status = "failed";
          return { status: "failed", state: this.state() };
        }
        requireHost(
          p.sha256 === ticket.sha256 && string(p.version),
          "INVALID_RECEIPT",
          "저장된 bytes 지문과 서버 버전이 필요합니다.",
        );
        ticket.version = p.version;
        if (ticket.sequence < this.acknowledgedSequence)
          ticket.status = "superseded";
        else {
          ticket.status = "saved";
          this.acknowledgedSequence = ticket.sequence;
          this.a.savedRevision = Math.max(
            this.a.savedRevision,
            ticket.revision,
          );
          this.host.binding!.baseVersion = p.version;
        }
        return {
          status: ticket.status,
          savedRevision: ticket.revision,
          state: this.state(),
        };
      }
      case "releaseExport": {
        const ticket = this.saves.get(p.saveId);
        requireHost(
          ticket && ticket.documentId === this.a.documentId,
          "STALE_SAVE",
          "현재 문서의 내보내기 티켓이 아닙니다.",
        );
        this.saves.delete(p.saveId);
        return { released: true, state: this.state() };
      }
      default:
        throw new HostError(
          "UNSUPPORTED_METHOD",
          "지원하지 않는 외부 연계 명령입니다.",
        );
    }
  }
}

// Verify the full existing semantic projection. Only text and selected chars
// in the exact number of independently checked target paragraphs may change.
function assertOnlyTextChanges(
  before: any,
  after: any,
  edits: {
    before: string;
    after: string;
    start: number;
    end: number;
    replacement: string;
  }[],
) {
  const unused = [...edits];
  function visit(b: any, a: any): void {
    if (equal(b, a)) return;
    if (
      b &&
      a &&
      typeof b === "object" &&
      typeof a === "object" &&
      !Array.isArray(b) &&
      !Array.isArray(a) &&
      typeof b.text === "string" &&
      typeof a.text === "string" &&
      Array.isArray(b.chars) &&
      Array.isArray(a.chars)
    ) {
      const index = unused.findIndex(
        (e) => e.before === b.text && e.after === a.text,
      );
      requireHost(
        index >= 0,
        "PRESERVATION_FAILED",
        "선택 밖 문단이 변경됐습니다.",
      );
      const e = unused.splice(index, 1)[0],
        { text: bt, chars: bc, ...bo } = b,
        { text: at, chars: ac, ...ao } = a;
      requireHost(
        equal(bo, ao) &&
          equal(bc.slice(0, e.start), ac.slice(0, e.start)) &&
          equal(
            bc.slice(e.end, Array.from(bt).length),
            ac.slice(
              e.start + Array.from(e.replacement).length,
              Array.from(at).length,
            ),
          ),
        "PRESERVATION_FAILED",
        "비선택 내용 또는 명시 서식이 변경됐습니다.",
      );
      return;
    }
    requireHost(
      b &&
        a &&
        typeof b === "object" &&
        typeof a === "object" &&
        Array.isArray(b) === Array.isArray(a) &&
        equal(Object.keys(b), Object.keys(a)),
      "PRESERVATION_FAILED",
      "문서 구조·개체·참조가 변경됐습니다.",
    );
    for (const key of Object.keys(b)) visit(b[key], a[key]);
  }
  visit(before, after);
  requireHost(
    unused.length === 0,
    "PRESERVATION_FAILED",
    "수정 대상의 의미 구조를 확인할 수 없습니다.",
  );
}
