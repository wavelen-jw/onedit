import {readFormatPresentation} from './typing-format-presentation.js';
import { paragraphListItems } from "./paragraph-lists.js";
// Existing formatting toolbar popup; all edits use the shared Commands.
import type { Interaction } from "./interaction.js";
import { nested, type Command } from "./model.js";
import { linePositionItems } from "./line-position.js";
import { relativeCharacterMenuItems } from "./character-increments.js";
import { formatToggleState, markFormatToggle } from "./format-value-state.js";
export function mountFormatAdditions(toolbar: HTMLElement, editor: Interaction, actions: {
  busy: () => boolean;
  command: (command: Command, captured: ReturnType<Interaction["capture"]>) => void;
  dialog: () => void;
  feedback: (message: string) => void;
}) {
  const root = document.createElement("details"); root.id = "format-additions";
  const summary = document.createElement("summary"); summary.textContent = "문단 번호·글자 서식";
  const panel = document.createElement("div"); panel.dataset.formatAdditionsPanel = "true"; panel.hidden = true;
  root.append(summary, panel); toolbar.append(root);
  const items: { id: string; label: string; command?: Command; list?: boolean; shortcut?: string; value?: string; property?: "underlineType" }[] = [
    ...relativeCharacterMenuItems,
    ...linePositionItems,
    { id: "list-dialog", label: "문단 번호·글머리표…", list: true },
    ...paragraphListItems.map(item => ({ ...item, list: true })),
  ];
  const buttons = new Map<string, HTMLButtonElement>();
  let captured: ReturnType<Interaction["capture"]> | undefined;
  const sync = () => {
    // These queries are read-only for this synchronous projection. Share their
    // results only until it returns; every action and later sync validates anew.
    let editableReason = "", listReason = "";
    let targets: ReturnType<Interaction["targets"]> = [];
    try {
      if (actions.busy()) throw Error("대화상자·저장·IME 조합을 마친 후 사용하세요.");
      editor.adapter.assertEditable(editor.selection.focus);
      targets = editor.targets();
      for (const t of targets) editor.adapter.assertEditable(t.p);
    } catch (error) { editableReason = String(error); }
    if (!editableReason) {
      try {
        if (targets.some(t => nested(t.p))) throw Error("중첩 셀 문단 번호는 미지원입니다. 기존 문단 서식은 유지됩니다.");
        editor.adapter.paragraphListCatalog();
      } catch (error) { listReason = String(error); }
    }
    const formats = new Map<"char" | "paragraph", { state: ReturnType<Interaction["formatState"]>; queryReason: string }>();
    for (const item of items) {
      const button = buttons.get(item.id)!;
      const reason = editableReason || (item.list ? listReason : "");
      button.disabled = !!reason;
      button.title = reason || item.shortcut || item.label;
      if (item.value) {
        const kind = item.property ? "char" : "paragraph";
        let result = formats.get(kind);
        if (!result) {
          let state: ReturnType<Interaction["formatState"]> = {}, queryReason = "";
          try { state = readFormatPresentation(editor,kind); } catch (error) { queryReason = String(error); }
          result = { state, queryReason };
          formats.set(kind, result);
        }
        const { state, queryReason } = result;
        markFormatToggle(button,formatToggleState(state,item.property||"headType",item.value),queryReason||reason);
      }
    }
  };
  for (const item of items) {
    const button = document.createElement("button"); button.type = "button";
    button.textContent = item.label + (item.shortcut ? ` (${item.shortcut})` : ""); button.dataset.formatAddition = item.id;
    button.onclick = () => {
      sync(); if (button.disabled || !captured) return;
      const target = captured, now = editor.capture();
      if (target.documentId !== now.documentId || target.revision !== now.revision || JSON.stringify(target.selection) !== JSON.stringify(now.selection)) {
        root.open = false; actions.feedback("문서·선택이 변경되었습니다. 메뉴를 다시 여세요."); return;
      }
      root.open = false;
      if (item.command) actions.command(item.command, target); else actions.dialog();
    };
    buttons.set(item.id, button); panel.append(button);
  }
  const display = () => {
    panel.hidden = !root.open;
    if (!root.open) { captured = undefined; return; }
    try { captured ??= editor.capture(); } catch (error) { actions.feedback(String(error)); root.open = false; return; }
    const r = summary.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 380))}px`;
    panel.style.top = `${Math.max(8, r.bottom + 4)}px`;
    panel.style.maxHeight = `${Math.max(80, window.innerHeight - r.bottom - 16)}px`;
    sync();
  };
  const close = () => { root.open = false; panel.hidden = true; captured = undefined; };
  root.addEventListener("toggle", display);
  root.addEventListener("keydown", e => {
    const navigation = ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key);
    const ownedArrow = navigation || e.key === "ArrowLeft" || e.key === "ArrowRight";
    // This popup's summary is outside the main-menu navigator. Do not let
    // arrows on it reach document navigation and replace the captured block.
    if (e.isComposing || e.keyCode === 229 || e.repeat) {
      if (ownedArrow || ["Enter", " ", "Escape"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); summary.focus(); return; }
    if (!ownedArrow || !(e.target instanceof HTMLElement) ||
        e.target !== summary && !panel.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (!navigation || actions.busy()) return;
    if (!root.open) { captured = undefined; root.open = true; display(); }
    sync();
    const choices = [...buttons.values()].filter(b => !b.disabled && !!b.getClientRects().length);
    const index = choices.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "Home" || e.target === summary && e.key === "ArrowDown" ? 0
      : e.key === "End" || e.target === summary && e.key === "ArrowUp" ? choices.length - 1
      : (index + (e.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length;
    const target = choices[next];
    target?.focus({preventScroll:true}); target?.scrollIntoView({block:"nearest",inline:"nearest"});
  });
  root.addEventListener("focusout", e => { if (!(e.relatedTarget instanceof Node && root.contains(e.relatedTarget))) close(); });
  document.addEventListener("pointerdown", e => { if (!root.contains(e.target as Node)) close(); });
  window.addEventListener("resize", () => { const hadFocus = root.contains(document.activeElement); close(); if (hadFocus) summary.focus({preventScroll:true}); });
  // Passive selection publication does not demand closed/hidden rows. Every
  // existing disclosure and action above still computes fresh command state.
  sync(); return () => { if (root.open && !root.hidden) sync(); };
}
