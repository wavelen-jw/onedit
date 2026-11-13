import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import type { HwpDocument, OneditPrivateFormatSnapshotV1 } from "../development/core/rhwp.js";
import { coreRuntimeIdentity } from "./core-runtime.js";
import { formatSnapshotCoreSha256, formatSnapshotOptIn } from "./format-snapshot-binding.js";
import {activeWorkset} from './active-workset.js';
import type { Interaction } from "./interaction.js";
import {recordTableRefusal,UnsupportedTableOperation} from './table-capability.js';
import { type Props, nested } from "./model.js";
import { formatInputGuard, sameFormatTarget } from "./integration/a-format-input-guard.js";

export type FormatCopyMode = "char" | "paragraph" | "both";
export type FormatCopySample = {
  documentId: string; revision: number; mode: FormatCopyMode;
  character?: Props; paragraph?: Props;
  snapshot?: Readonly<{ native: HwpDocument; value: OneditPrivateFormatSnapshotV1 }>;
};
export function formatCopySelectionReason(editor: Interaction) {
  const s = editor.selection;
  if (s.kind === "object" || s.kind === "table" || nested(s.focus))
    return "NOT_SUPPORTED: 본문·일반 셀의 글자·문단 모양만 지원합니다. 개체·중첩·표 전체 모양은 미지원입니다.";
  return "";
}
export function captureFormatCopy(editor: Interaction, mode: FormatCopyMode): FormatCopySample {
  if (!["char", "paragraph", "both"].includes(mode)) throw Error("지원하지 않는 모양 복사 항목입니다.");
  const reason = formatCopySelectionReason(editor); if (reason) throw Error(reason);
  if (editor.selection.kind !== "caret") throw Error("원본 글자 바로 뒤에 커서를 두세요.");
  const a = editor.adapter, p = editor.selection.focus;
  a.validate(p); a.assertTextOnly(p);
  const sample: FormatCopySample = { documentId: a.documentId, revision: a.revision, mode };
  if (mode !== "paragraph") {
    // At the paragraph start, use its first character (or the existing empty
    // paragraph insertion format). Else keep the preceding-character rule.
    // Never cross a paragraph/cell boundary or subtract from offset zero.
    const at = p.offset === 0 ? 0
      : p.kind === "body" ? a.logical(p, a.textOffset(p) - 1) : p.offset - 1;
    sample.character = structuredClone(a.charProps({ ...p, offset: at }));
    if (!Number.isSafeInteger(sample.character.charShapeId)) throw Error("글자 모양 참조 조회 실패");
  }
  if (mode !== "char") {
    sample.paragraph = structuredClone(a.paraProps(p));
    if (!Number.isSafeInteger(sample.paragraph.paraShapeId)) throw Error("문단 모양 참조 조회 실패");
  }
  if (formatSnapshotOptIn()) {
    if (coreRuntimeIdentity(a.doc)?.sha256 !== formatSnapshotCoreSha256) throw Error("모양 보관 Core가 확인되지 않았습니다.");
    const owner = a.clipboardTarget(p);
    const value = a.doc.oneditPrivateCaptureFormatSnapshotV1(JSON.stringify({
      target: { section: owner.sectionIndex, paragraph: owner.parentParaIndex,
        path: owner.path, expectedTargetId: owner.expectedTargetId },
      mode, offset: p.kind === "body" ? a.textOffset(p) : p.offset,
    }));
    sample.snapshot = Object.freeze({ native: a.doc, value });
  }
  return Object.freeze(sample);
}

export function mountFormatCopy(doc: Document, editor: Interaction, hooks: {
  busy: () => boolean; changed: () => void; focus: () => void; feedback: (error: unknown) => void;
}) {
  let sample: FormatCopySample | undefined, target: ReturnType<Interaction["capture"]> | undefined;
  const discardSample = () => { const prior = sample; sample = undefined; prior?.snapshot?.value.free(); };
  doc.defaultView?.addEventListener("pagehide", discardSample);
  const dialog = doc.createElement("dialog"); dialog.id = "format-copy-dialog";
  dialog.setAttribute("aria-labelledby", "format-copy-title");
  dialog.innerHTML = `<form id="format-copy-form"><h2 id="format-copy-title">모양 복사</h2><fieldset><legend>본문 모양 복사</legend>
<label><input type="radio" name="mode" value="char" checked> 글자 모양</label>
<label><input type="radio" name="mode" value="paragraph"> 문단 모양</label>
<label><input type="radio" name="mode" value="both"> 글자 모양과 문단 모양 둘 다 복사</label></fieldset>
<fieldset disabled title="이번 지원 범위는 글자·문단의 직접 모양입니다. 기존 스타일·셀·개체 데이터는 보존합니다."><legend>미지원</legend>
<label><input type="checkbox"> 글자·문단 스타일</label><label><input type="checkbox"> 셀 속성·테두리·배경 / 개체 모양</label></fieldset>
<p>커서 바로 앞 글자의 모양을 가져오며, 문단 맨 앞에서는 첫 글자의 모양을 가져옵니다. 대상 블록을 선택한 뒤 편집 → 모양 붙여넣기를 실행하세요. Alt+C 재실행도 유지합니다. 지원되는 문서와 모양은 복사한 값을 보관합니다. 지원하지 않는 모양은 알림을 확인하세요.</p>
<p id="format-copy-note" role="status"></p><footer><button type="submit">복사</button><button type="button" data-format-copy-cancel>취소</button></footer></form>`;
  doc.body.append(dialog);
  const status = doc.createElement("span"); status.id = "format-copy-status"; status.setAttribute("role", "status");
  doc.getElementById("toolbar")?.append(status);
  const form = dialog.querySelector("form")!, guard = formatInputGuard(form);
  const confirm = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  // On mouse confirmation the dialog closes immediately after the button
  // takes focus. Keep the modal's current native focus until its normal
  // close restores the editor; a mouse click still submits the same form.
  let mousePress = false;
  confirm.addEventListener("pointerdown", (e) => {
    mousePress = e.isTrusted && e.pointerType === "mouse" && e.isPrimary && e.button === 0;
  });
  confirm.addEventListener("mousedown", (e) => {
    const pressed = mousePress; mousePress = false;
    if (!pressed || !e.isTrusted || e.button !== 0 || !e.cancelable ||
        !dialog.open || confirm.disabled || !guard.ready() || hooks.busy()) return;
    e.preventDefault();
  });
  const update = () => {
    if (sample && (sample.documentId !== editor.adapter.documentId ||
        sample.snapshot && sample.snapshot.native !== editor.adapter.doc)) discardSample();
    if(activeWorkset(doc)){
      status.textContent=sample?.snapshot ? "복사한 모양 보관 중 · 대상 블록에서 Alt+C"
        : sample ? "모양 붙여넣기는 대상 블록에서 Alt+C · 문서 변경 후에는 다시 가져오세요." : "";
      return;
    }
    status.textContent = sample?.snapshot ? "복사한 모양 보관 중 · 대상 블록에서 Alt+C" : sample ? sample.revision === editor.adapter.revision
      ? `모양 가져옴 · ${sample.mode === "char" ? "글자" : sample.mode === "paragraph" ? "문단" : "글자·문단"} · 대상 블록에서 Alt+C`
      : "모양을 가져온 뒤 문서가 변경됐습니다. 원본에서 다시 가져오세요." : "";
  };
  dialog.addEventListener("close", () => { if (dialog.open) return; mousePress = false; guard.close(); target = undefined; });
  dialog.addEventListener("cancel", e => {
    if (!guard.ready()) e.preventDefault();
  });
  dialog.querySelector<HTMLButtonElement>("[data-format-copy-cancel]")!.onclick = () => { closeEditorDialog(dialog); update(); };
  form.onsubmit = e => {
    e.preventDefault();
    if (!guard.ready() || hooks.busy()) return;
    try {
      if (!target || !sameFormatTarget(target, editor.capture())) throw Error("원본 문서·선택이 변경되었습니다. 취소 후 다시 여세요.");
      const mode = (new FormData(form)).get("mode") as FormatCopyMode;
      const next = captureFormatCopy(editor, mode); guard.consume(); discardSample(); sample = next; closeEditorDialog(dialog); update();
    } catch (error) { dialog.querySelector("#format-copy-note")!.textContent = String(error); }
  };
  dialog.addEventListener("keydown", e => {
    if (e.key !== "Tab" || e.isComposing || e.keyCode === 229) return;
    const controls = [...form.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)')].filter(e => !e.closest('fieldset[disabled]'));
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
  const run = () => {
    if (hooks.busy() || doc.querySelector("dialog[open]")) return;
    try {
      const reason = formatCopySelectionReason(editor);
      if(reason&&(nested(editor.selection.focus)||editor.selection.kind==='table')){
        recordTableRefusal(doc,new UnsupportedTableOperation('format-copy-table-scope',reason),editor.selection);
        const error=doc.getElementById('error');if(error)error.hidden=true;
        status.textContent='이 표 선택의 모양 복사는 아직 지원하지 않습니다.';hooks.focus();return;
      }
      if (reason) throw Error(reason);
      if (editor.selection.kind === "caret") {
        target = editor.capture(); guard.open(); dialog.querySelector("#format-copy-note")!.textContent = "";
        showEditorDialog(dialog); form.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.focus();
      } else {
        if (!sample) throw Error("원본 커서에서 모양을 먼저 가져오세요.");
        editor.execute({ type: "format-copy", sample }, sample.snapshot ? editor.capture() : undefined);
        if (!sample.snapshot) sample = { ...sample, revision: editor.adapter.revision };
        hooks.changed(); hooks.focus(); update();
      }
    } catch (error) { hooks.feedback(error); hooks.focus(); update(); }
  };
  const pasteReason = () => !sample ? "원본 커서에서 모양을 먼저 가져오세요." : sample.documentId !== editor.adapter.documentId || (sample.snapshot ? sample.snapshot.native !== editor.adapter.doc : sample.revision !== editor.adapter.revision) ? "원본 모양을 다시 가져오세요." : formatCopySelectionReason(editor) || (!["text", "cells"].includes(editor.selection.kind) ? "대상 블록을 선택하세요." : "");
  const paste = () => { const reason = pasteReason(); if(reason){hooks.feedback(Error(reason));hooks.focus();return;}run(); };
  const copy = () => {if(editor.selection.kind!=="caret"){hooks.feedback(Error("원본 글자 바로 뒤에 커서를 두세요."));hooks.focus();return;}run();};
  return { run, copy, paste, pasteReason, sync: update };
}
