import { activeWorkset, activeMenuDemand, withMenuDemand } from "../active-workset.js";
import { mountDropdownKeys } from "../workspace-menu-navigation.js";
import { selectedCutObject } from "../object-clipboard.js";
import { mountEditTools } from "../edit-tools.js";
import { mountBodyContext } from "../body-context.js";
import { formatCopySelectionReason } from "../format-copy.js";
import { clipboardSupport } from "../clipboard-ui-state.js";
import { pastePolicyHelp } from "../paste-result-ui.js";
import type { Interaction } from "../interaction.js";
import { nested, samePosition } from "../model.js";
export const editItems = [
  ["undo", "되돌리기", "Ctrl+Z"],
  ["redo", "다시 실행", "Ctrl+Shift+Z / Ctrl+Y"],
  ["cut", "오려 두기", "Ctrl+X / Shift+Delete"],
  ["copy", "복사하기", "Ctrl+C · 개체/셀 블록: Ctrl+Insert"],
  ["paste", "붙이기", "Ctrl+V / Shift+Insert"],
  ["delete", "지우기", "Ctrl+E"],
  ["clear", "선택 셀 내용 지우기", ""],
  ["all", "모두 선택 (현재 본문/셀)", "Ctrl+A"],
  ["block", "블록 설정 · 본문 반복: 낱말 → 문단 → 전체", "F3"],
  ["find", "찾기", "Ctrl+F"],
  ["replace", "바꾸기", "Ctrl+H"],
  ["format-copy", "모양 복사", "Alt+C"],
  ["format-paste", "모양 붙여넣기", ""],
  ["paste-special", "텍스트만 붙이기", "Ctrl+Shift+V"],
] as const;
export type EditAction = (typeof editItems)[number][0];
export function editMenuState(editor: Interaction, busy = false, onlyHistory = false,
  checkEditable = (position: Parameters<Interaction["adapter"]["assertEditable"]>[0]) => editor.adapter.assertEditable(position),
  readTargets = () => editor.targets(),
  validate = (position:Parameters<Interaction["adapter"]["validate"]>[0]) => editor.adapter.validate(position),
  textOnly = (position:Parameters<Interaction["adapter"]["assertTextOnly"]>[0]) => editor.adapter.assertTextOnly(position)) {
  if (onlyHistory && busy) return new Map<EditAction, string>([
    ["undo", "입력 또는 클립보드 처리 중"], ["redo", "입력 또는 클립보드 처리 중"],
  ]);
  let invalid = "",
    write = "";
  try {
    validate(editor.selection.focus);
    readTargets();
  } catch (e) {
    invalid = String(e);
  }
  try {
    checkEditable(editor.selection.focus);
    for (const t of readTargets()) checkEditable(t.p);
  } catch (e) {
    write = String(e);
  }
  const s = editor.selection;
  // Object clipboard admission must not borrow targets()' text-format error.
  // Still validate the actual selection/path; stale selections are not allowed.
  let objectSelectionError = "";
  if (s.kind === "object") {
    try { editor.capture(); } catch (e) { objectSelectionError = String(e); }
  }
  const selected =
    !onlyHistory && s.kind !== "caret" &&
    (s.kind !== "text" ||
      !samePosition(s.anchor, s.focus) ||
      clipboardSupport(editor, "copy").structuredSelection);
  const nestedObject = s.kind === "table" && nested(s.focus);
  return new Map(
    (onlyHistory ? editItems.slice(0, 2) : editItems).map(([id, , shortcut]) => {
    if (s.kind === "object" && ["copy", "cut", "paste", "paste-special"].includes(id))
      return [id, busy ? "입력 또는 클립보드 처리 중" : objectSelectionError ||
        clipboardSupport(editor, id === "paste-special" ? "paste" : id as "copy" | "cut" | "paste").reason || ""];
    // Picture history restores document snapshots, not text-format targets.
    // Keep all text/clipboard and protected/stale object admission unchanged.
    if (s.kind === "object" && (id === "undo" || id === "redo")) {
      let reason = busy ? "입력 또는 클립보드 처리 중" : "";
      if (!reason) try {
        editor.adapter.assertEditable(s.focus);
        selectedCutObject(editor.adapter, s);
      } catch (e) { reason = String(e); }
      if (!reason && !(id === "undo" ? editor.history.undoStack : editor.history.redoStack).length)
        reason = id === "undo" ? "되돌릴 작업 없음" : "다시 실행할 작업 없음";
      return [id, reason];
    }
      let reason =
        busy
            ? "입력 또는 클립보드 처리 중"
            : invalid;
      if (!reason && !["copy", "all", "block", "find", "replace"].includes(id))
        reason = write;
      if (!reason && ["copy", "cut", "delete"].includes(id) && !selected)
        reason = "영역을 선택하세요";
      if (!reason && ["copy", "cut", "paste", "paste-special"].includes(id))
        reason =
          clipboardSupport(editor, id === "paste-special" ? "paste" : id as "copy" | "cut" | "paste").reason ?? "";
      if (!reason && ["cut", "delete"].includes(id) && nestedObject)
        reason = "중첩 표 객체 삭제·대체 미지원";
      if (!reason && ["cut", "delete", "clear"].includes(id)) {
        try {
          for (const t of editor.targets())
            if (t.p.kind === "cell") textOnly(t.p);
        } catch (e) {
          reason = String(e);
        }
      }
      if (!reason && ["format-copy", "format-paste"].includes(id)) reason = formatCopySelectionReason(editor);
      if (!reason && id === "format-copy" && s.kind !== "caret") reason = "원본 글자 바로 뒤에 커서를 두세요";
      if (!reason && id === "format-paste" && !["text", "cells"].includes(s.kind)) reason = "모양을 적용할 블록을 선택하세요";
      if (!reason && id === "clear" && s.kind !== "cells")
        reason = "F5 셀 블록을 선택하세요";
      if (!reason && id === "undo" && !editor.history.undoStack.length)
        reason = "되돌릴 작업 없음";
      if (!reason && id === "redo" && !editor.history.redoStack.length)
        reason = "다시 실행할 작업 없음";
      return [id, reason];
    }),
  );
}
export function mountEditMenu(
  root: HTMLDetailsElement,
  editor: Interaction,
  busy: () => boolean,
  run: (id: EditAction) => void,
  feedback: (message: string) => void = () => {},
  context?: { select: (page: number, x: number, y: number) => void; focus: () => void; formatPasteReason?: () => string; formatInvoke?: (id:string,target:ReturnType<Interaction["capture"]>)=>void },
) {
  const panel = root.querySelector<HTMLElement>("[data-edit-panel]")!,
    buttons = new Map<EditAction, HTMLButtonElement>(),
    mirrors = new Map<EditAction, HTMLButtonElement>();
  let captured: ReturnType<Interaction["capture"]> | undefined;
  let bodyContext: ReturnType<typeof mountBodyContext> | undefined;
  // Menu and direct toolbox share one admission/target check and dispatcher.
  const invoke = (id: EditAction, target = captured) => {
    const reason = (activeWorkset(root.ownerDocument)?extraReason(id):"") || editMenuState(editor,busy()).get(id);
    const source = buttons.get(id)!;
    if(reason || (!activeWorkset(root.ownerDocument) && source.disabled)) { feedback(reason || source.title); refresh(); return; }
    const now = editor.capture();
    if(target && (target.documentId !== now.documentId || target.revision !== now.revision || JSON.stringify(target.selection) !== JSON.stringify(now.selection))) {
      root.open = false; feedback("문서·리비전·선택이 변경되었습니다. 다시 선택하세요."); root.querySelector<HTMLElement>("summary")!.focus(); return;
    }
    root.open = false; run(id); refresh();
  };
  const extraReason=(id:EditAction)=>id==="format-paste"?context?.formatPasteReason?.()??"":"";
  const project = (states: ReadonlyMap<EditAction, string>) => {
    if(!activeMenuDemand(root))return;
    for (const [id, label] of editItems) {
      const b = buttons.get(id)!;
      const extra = id === "format-paste" ? context?.formatPasteReason?.() : "";
      b.disabled = !!states.get(id) || !!extra;
      b.title = extra || states.get(id) || (id === "paste" ? pastePolicyHelp.source : id === "paste-special" ? pastePolicyHelp.text : label);
      if (id === "block") b.setAttribute("aria-pressed", String(editor.block));
      const mirror = mirrors.get(id);
      if (mirror) {
        mirror.disabled = b.disabled; mirror.title = b.title;
        mirror.setAttribute("aria-disabled", String(b.disabled));
        mirror.setAttribute("aria-description", b.title);
        if (id === "block") mirror.setAttribute("aria-pressed", String(editor.block));
      }
    }
    bodyContext?.sync();
  };
  const refresh = () => {if(activeMenuDemand(root))project(editMenuState(editor, busy()));};
  const opening=()=>withMenuDemand(root,()=>{captured=editor.capture();refresh();});
  root.addEventListener("rhwp:menu-opening",opening);
  // Retain original sources for the accepted toolbox/body-context mirrors.
  // Only the main-menu presentation is reordered/skinned; invoke stays shared.
  const sources = document.createElement("div"); sources.hidden = true; panel.append(sources);
  for (const [id, label, shortcut] of editItems) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.editAction = id;
    b.textContent = `${label}　${shortcut}`;
    if (id === "undo" || id === "redo" || id === "replace")
      b.setAttribute("aria-keyshortcuts", shortcut.replaceAll("Ctrl+", "Control+").replaceAll(" / ", " "));
    b.onclick = () => invoke(id);
    buttons.set(id, b);
    sources.append(b);
  }
  panel.classList.add("ui1-edit-panel");
  const separator = () => { const hr = document.createElement("hr"); hr.setAttribute("role", "separator"); panel.append(hr); };
  const live = (id: EditAction, letter: string, label: string, shortcut: string) => {
    const b = document.createElement("button"); b.type = "button";
    b.dataset.editEntry = id; b.dataset.menuLetter = letter;
    b.setAttribute("role", "menuitem"); b.append(label);
    if (shortcut) { const k = document.createElement("kbd"); k.textContent = shortcut; b.append(k); }
    b.onclick = () => invoke(id); mirrors.set(id, b); panel.append(b);
  };
  const held = (letter: string, label: string, reason: string, shortcut = "") => {
    const b = document.createElement("button"); b.type = "button"; b.disabled = true;
    b.dataset.editHeld = letter; b.dataset.menuLetter = letter;
    b.setAttribute("role", "menuitem"); b.setAttribute("aria-disabled", "true");
    b.title = reason + " 기존 문서는 유지합니다."; b.setAttribute("aria-description", b.title); b.append(label);
    if (shortcut) { const k = document.createElement("kbd"); k.textContent = shortcut; b.append(k); } panel.append(b);
  };
  live("undo", "u", "되돌리기(U)", "Ctrl+Z");
  live("redo", "r", "다시 실행(R)", "Ctrl+Shift+Z"); separator();
  live("cut", "t", "오려 두기(T)", "Ctrl+X");
  live("copy", "c", "복사하기(C)", "Ctrl+C");
  live("paste", "p", "붙이기(P)", "Ctrl+V");
  const choose=document.createElement('button');choose.type='button';choose.textContent='골라 붙이기(S)…  Ctrl+Alt+V';choose.dataset.editChoosePaste='';choose.setAttribute('role','menuitem');choose.onclick=()=>{root.open=false;document.dispatchEvent(new CustomEvent('rhwp:shortcut-ui',{detail:'paste-choose'}));};
  root.querySelector('[data-menu-panel]')!.append(choose);
  live("format-copy", "g", "모양 복사(G)…", "Alt+C");
  live("format-paste", "v", "모양 붙여넣기", ""); separator();
  // Ctrl+E shares text/table-object deletion. A cell block's shortcut opens
  // the structural table draft; this explicit menu keeps content deletion.
  live("delete", "d", "지우기(D)", "Ctrl+E");
  held("y", "조판 부호 지우기(Y)…", "조판 부호 일괄 삭제 명령은 연결되지 않았습니다.");
  live("all", "a", "모두 선택(A)", "Ctrl+A"); separator();
  live("find", "f", "찾기(F)…", "Ctrl+F");
  live("replace", "n", "바꾸기(N)…", "Ctrl+H");
  const disposeDropdown = mountDropdownKeys(root, () => busy() || !!root.ownerDocument.querySelector("dialog[open]"));
  root.addEventListener("toggle", () => {
    captured = root.open ? (activeWorkset(root.ownerDocument)?captured??editor.capture():editor.capture()) : undefined;
    refresh();
  });
  root.addEventListener("pointerdown", (e) => {
    if (busy()) e.preventDefault();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing && e.keyCode !== 229 &&
        !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      root.open = false;
      if (context) context.focus(); else root.querySelector<HTMLElement>("summary")!.focus();
    }
  });
  const tools=mountEditTools(root.ownerDocument, buttons, () => editor.capture(), invoke, () => busy() || !!root.ownerDocument.querySelector("dialog[open]"));
  if (context) bodyContext = mountBodyContext(root.ownerDocument, editor, busy, buttons, invoke, context.select, context.focus, feedback, context.formatInvoke);
  refresh();
  return Object.assign(refresh, {
    // No map is retained; menu opening and invoke keep the fresh path.
    project,
    // Context-menu mirrors can reopen before passive panel projection catches
    // up after clipboardBusy. Refresh the same admission, never bypass it.
    liveState:()=>{const states=editMenuState(editor,busy());const extra=extraReason("format-paste");if(extra)states.set("format-paste",extra);return states;},
    invokeCurrent:invoke,
    invoke: (id: EditAction, target: ReturnType<Interaction["capture"]>) => { refresh(); invoke(id, target); },
    dispose: () => { root.removeEventListener("rhwp:menu-opening",opening); disposeDropdown(); tools.dispose(); bodyContext?.dispose(); },
  });
}
