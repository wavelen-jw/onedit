import { activeWorkset } from "./active-workset.js";
import type { OwnerProjection } from "./owner-projection.js";
import { readEditorDisplay } from "./editor-state-coordinator.js";
import { cellDialogFor } from "./cell-dialog-command.js";
import {observeSelectorMembership} from './selector-membership.js';
import {coreRuntimeSupportsNestedTableCreation} from './core-runtime.js';
// Fixed A7e toolbar projection, adapted only to D menu paths and D cell-format guard.
import { nested } from "./model.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";
import type { Interaction } from "./interaction.js";
import { formatMenuState } from "./integration/a-format-menu.js";
import { editItems, editMenuState } from "./integration/a-edit-menu.js";
import { markFormatToggle } from "./format-value-state.js";

const staticToolbars = new WeakSet<ParentNode>();
export function initializeStaticToolbar(root:ParentNode) {
  if(staticToolbars.has(root))return;
  staticToolbars.add(root);
  for(const node of root.querySelectorAll<HTMLButtonElement>("#character,#paragraph,#bold,#italic,#underline,[data-script],[data-align],#undo,#redo,#table,#inline-table")) {
    node.disabled=false;node.setAttribute("aria-disabled","false");
    node.dataset.commandTitle ??= node.title || node.getAttribute("aria-label") || node.textContent || "";
    node.title=node.dataset.commandTitle;
  }
}
// Same selector membership, including duplicate IDs and document order.
// Only membership is retained; admission/value/lock/History are read each call.
const toolbarSelector = "#character, #paragraph, #cell-format, #bold, #italic, #underline, [data-script], [data-align], #undo, #redo, #table, #inline-table";
const toolbarMembership = new WeakMap<ParentNode, ReturnType<typeof observeSelectorMembership>>();
function toolbarControls(root: ParentNode): readonly Element[] | NodeListOf<Element> {
  // Product callers pass Document. Preserve other ParentNode consumers through
  // the original exact query, without observing an unsupported root type.
  if (!("nodeType" in root) || ![1,9].includes(Number(root.nodeType)))
    return root.querySelectorAll(toolbarSelector);
  let membership = toolbarMembership.get(root);
  if (!membership) {
    membership = observeSelectorMembership(root as Document | Element,
      toolbarSelector, ['id','data-script','data-align']);
    toolbarMembership.set(root, membership);
  }
  return membership.read();
}

// Evidence of an already displayed result, not a retained command verdict.
// No coordinates, owner data or command values are read back from this receipt.
const paintedToolbars = new WeakMap<ParentNode, {
  token: object; context: string; controls: Element[]; state: string;
}>();
const toolbarReceiptAttributes = ["id", "data-script", "data-align", "data-command-title", "title",
  "disabled", "aria-disabled", "aria-keyshortcuts", "aria-pressed", "data-value-state", "aria-description"];
function toolbarSurface(root: ParentNode) {
  const nodes = toolbarControls(root);
  if (nodes.length > 64) return;
  const controls = Array.from(nodes);
  const access = root.querySelector("#edit-access");
  if (access) controls.push(access);
  const state = JSON.stringify(controls.map(e => {
    if (e === access) return [e.textContent];
    const note = e.querySelector("[data-format-state-note]");
    return [toolbarReceiptAttributes.map(name => e.getAttribute(name)),
      note && [note.textContent, note.hasAttribute("hidden")]];
  }));
  if (state.length > 16_384) return;
  return {controls, state};
}
export function cellToolbarContext(editor: Interaction, busy: boolean, reason: string) {
  return JSON.stringify([busy, reason, editor.history.undoStack.length, editor.history.redoStack.length]);
}
export function rememberCellToolbar(root: ParentNode, token: object, context: string) {
  const surface = toolbarSurface(root);
  if (surface) paintedToolbars.set(root, {token, context, ...surface});
  else paintedToolbars.delete(root);
}
export function cellToolbarAlreadyPainted(root: ParentNode, token: object, context: string) {
  const receipt = paintedToolbars.get(root);
  // One consumption; any later change needs its own synchronous paint.
  paintedToolbars.delete(root);
  if (!receipt || receipt.token !== token || receipt.context !== context) return false;
  const current = toolbarSurface(root);
  return !!current && current.state === receipt.state && current.controls.length === receipt.controls.length &&
    current.controls.every((node, i) => node === receipt.controls[i]);
}

export function projectToolbarAdmission(root: ParentNode, editor: Interaction, busy: boolean, reason: string,
  readDisplay: Parameters<typeof formatMenuState>[3], owners?: Parameters<typeof formatMenuState>[4],
  edits?: ReturnType<typeof editMenuState>, cellModalCaret = false) {
  if (activeWorkset(document)) { initializeStaticToolbar(root); return; }
  const ids = new Set<string>(["character"]);
  for (const node of toolbarControls(root)) {
    const button = node as HTMLButtonElement;
    ids.add(button.dataset.script ?? button.dataset.align ?? button.id);
  }
  const a = editor.adapter;
  const block = editor.selection.kind === "cells" || editor.selection.kind === "table";
  // Presentation-only protection checks, using the same current owner model
  // across the two read phases. No command invocation or DOM update in scope.
  // The modal caller has the same synchronous read fence for a single
  // ordinary cell. Share its structural model, never a protection verdict.
  const s = editor.selection;
  const modalCaret = cellModalCaret && s.kind === "caret" && s.focus.kind === "cell" && !nested(s.focus);
  const share = (block || modalCaret) && owners?.isCurrent(a) ? owners : undefined;
  const check = share ? a.assertEditableForPresentation.bind(a) : undefined;
  const targets = share ? editor.presentationTargets.bind(editor) : undefined;
  const read = () => {
    const click=editor.clickedTableDisplayChecks();
    return {
      formats:formatMenuState(editor,busy,reason,readDisplay,owners,ids,click?.check??check,targets),
      history:edits??editMenuState(editor,busy,true,click?.check??check,targets,click?.validate),
    };
  };
  const result = readEditorDisplay(editor,"toolbar",(display,retry)=>{
    const check=display?a.assertEditableForPresentation.bind(a):undefined;
    return {
      formats:formatMenuState(editor,busy,reason,retry?kind=>editor.freshDisplayFormat(kind):readDisplay,
        display,ids,check,undefined,!!display),
      history:(!retry&&edits)||editMenuState(editor,busy,true,check),
    };
  },()=>share?a.withOwnerReads(read,share):read());
  syncCommandToolbar(root, editor, busy, result.formats, result.history, share);
}

// Project the existing menu capabilities onto toolbar controls. No second
// command dispatcher, Core mutation or formatting inference lives here.
export function syncCommandToolbar(root: ParentNode, editor: Interaction, busy = false,
  formats?: ReturnType<typeof formatMenuState> | null, edits?: ReturnType<typeof editMenuState>,
  owners?: Parameters<typeof formatMenuState>[4]) {
  if (activeWorkset(document)) { initializeStaticToolbar(root); return; }
  formats = formats === undefined ? formatMenuState(editor, busy) : formats;
  edits ??= editMenuState(editor, busy);
  paintedToolbars.delete(root);
  for (const node of toolbarControls(root)) {
    const b = node as HTMLButtonElement;
    const id = b.dataset.script ?? b.dataset.align ?? b.id;
    if (!formats && id !== "undo" && id !== "redo") continue;
    const historyItem = (id === "undo" || id === "redo")
      ? editItems.find(([action]) => action === id) : undefined;
    const originalTitle = historyItem ? `${historyItem[1]} · ${historyItem[2]}`
      : b.dataset.commandTitle ?? b.title;
    if (historyItem) {
      const keys = historyItem[2].replaceAll("Ctrl+", "Control+").replaceAll(" / ", " ");
      if (b.getAttribute("aria-keyshortcuts") !== keys) b.setAttribute("aria-keyshortcuts", keys);
    }
    if (b.dataset.commandTitle !== originalTitle) b.dataset.commandTitle = originalTitle;
    let reason = "";
    if (id === "undo" || id === "redo") reason = edits.get(id) ?? "지원하지 않는 명령";
    else if (id === "cell-format") {
      if (cellDialogFor(b.ownerDocument)) continue;
      reason = busy ? "입력·대화상자 처리 중" : "";
      if (!reason) try {
        if (editor.selection.focus.kind !== "cell" || nested(editor.selection.focus)) throw Error("일반 셀을 선택하세요.");
        editor.adapter.assertEditable(editor.selection.focus);
        for (const target of editor.targets()) editor.adapter.assertEditable(target.p);
        editor.formatState("cell");
      } catch (error) { reason = String(error); }
    }
    else if (id === "table" || id === "inline-table") {
      reason = formats!.get("character")?.reason ?? "선택 조회 불가";
      if (!reason && !["body","cell"].includes(editor.selection.focus.kind)) reason = "본문이나 셀 안에 커서를 두세요.";
      if (!reason && editor.selection.focus.kind === "cell" && !coreRuntimeSupportsNestedTableCreation(editor.adapter.doc)) reason = "현재 Core에서 셀 안의 표 만들기를 지원하지 않습니다.";
    } else {
      const state = formats!.get(id);
      reason = state?.reason ?? "지원하지 않는 명령";
      if (state?.valueState)markFormatToggle(b,{valueState:state.valueState,pressed:state.pressed},state.valueReason||state.reason);
    }
    if (b.disabled !== !!reason) b.disabled = !!reason;
    if (b.title !== (reason || originalTitle)) b.title = reason || originalTitle;
    const ariaDisabled = String(!!reason);
    if (b.getAttribute("aria-disabled") !== ariaDisabled) b.setAttribute("aria-disabled", ariaDisabled);
  }
  const access = root.querySelector<HTMLElement>("#edit-access");
  if (access) {
    let reason = "";
    const a = editor.adapter;
    const share = owners?.isCurrent(a) ? owners : undefined;
    const readAccess = (display?:OwnerProjection) => {
      const check = editor.clickedTableDisplayChecks()?.check ??
        (share||display ? a.assertEditableForPresentation.bind(a) : a.assertEditable.bind(a));
      check(editor.selection.focus);
      for (const t of share ? editor.presentationTargets() : editor.targets()) check(t.p);
    };
    try { readEditorDisplay(editor,"toolbar-status",readAccess,
      ()=>share?a.withOwnerReads(()=>readAccess(),share):readAccess()); }
    catch (e) { reason = String(e).replace(/^Error: /, ""); }
    const text = reason || (busy ? "입력·대화상자 처리 중" : "편집 가능");
    if (access.textContent !== text) access.textContent = text;
  }
}

// History has one admission rule for menu, toolbar and keyboard. The existing
// History.travel remains the final document-wide read-only/lock guard.
export function runHistory(editor: Interaction, redo = false, busy = false) {
  if (!(redo ? editor.history.redoStack : editor.history.undoStack).length) return;
  const reason = editMenuState(editor, busy).get(redo ? "redo" : "undo");
  if (reason) throw Error(reason);
  editor.undo(redo);
}

// D view adapter owns scaled coordinates; command dispatch never guesses pixels.
export function revealCommandSelection(root: Document, before: ReturnType<Interaction["capture"]>, after: typeof before) {
  if (sameFormatTarget(before, after)) return;
  const Event = root.defaultView?.CustomEvent;
  if (Event) root.dispatchEvent(new Event("rhwp:reveal-selection"));
}
