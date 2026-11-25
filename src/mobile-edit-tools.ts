import { editorChanged } from "./editor-state-adapter.js";
import type { Interaction } from "./interaction.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";

export type MobileEditAction =
  | "undo" | "redo" | "copy" | "cut" | "paste" | "bold" | "character" | "paragraph"
  | "insert-table" | "insert-picture" | "previous-cell" | "next-cell" | "cell-properties"
  | "download-copy" | "confirm-download";

type Choice = "format" | "insert" | "file" | "cell-tools";
type Target = ReturnType<Interaction["capture"]>;

/** Phone controls are alternate entrances to the existing editor commands. */
export function mountMobileEditTools(doc: Document, editor: Interaction, actions: {
  busy: () => boolean;
  fileActionAvailable: (action: "download-copy" | "confirm-download") => boolean;
  run: (action: MobileEditAction, target: Target) => void;
  error: (error: unknown) => void;
}) {
  const win = doc.defaultView!, input = doc.getElementById("input")!;
  const media = win.matchMedia("(pointer: coarse) and (max-width: 900px)");
  const view = win.visualViewport;
  const root = doc.createElement("div"), row = doc.createElement("div"), choices = doc.createElement("div");
  root.id = "mobile-edit-tools";
  row.setAttribute("role", "toolbar");
  row.setAttribute("aria-label", "모바일 편집 도구");
  choices.id = "mobile-edit-choices";
  choices.className = "mobile-edit-choices";
  choices.hidden = root.hidden = true;
  root.append(row, choices);
  doc.body.append(root);

  let engaged = false, owner = editor.adapter.documentId, frame = 0;
  let open: Choice | undefined, choiceTarget: Target | undefined;
  const closeChoices = () => {
    open = undefined;
    choiceTarget = undefined;
    choices.hidden = true;
    for (const button of row.querySelectorAll("button[aria-controls]")) button.setAttribute("aria-expanded", "false");
  };
  const run = (action: MobileEditAction, expected?: Target) => {
    if (root.hidden || actions.busy()) return;
    closeChoices();
    try {
      const current = editor.capture();
      if (expected && !sameFormatTarget(expected, current))
        throw Error("편집 위치가 바뀌었습니다. 도구를 다시 여세요.");
      actions.run(action, current);
      reveal = true;
    } catch (error) { actions.error(error); }
    schedule();
  };
  const button = (label: string, id: string, press: () => void) => {
    const node = doc.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.dataset.mobileAction = id;
    node.onclick = press;
    return node;
  };
  const undo = button("실행 취소", "undo", () => run("undo"));
  const copy = button("복사", "copy", () => run("copy"));
  const cut = button("오려 두기", "cut", () => run("cut"));
  const paste = button("붙이기", "paste", () => run("paste"));
  const previous = button("이전 셀", "previous-cell", () => run("previous-cell"));
  const next = button("다음 셀", "next-cell", () => run("next-cell"));
  const done = button("완료", "done", () => {
    if (actions.busy()) return;
    engaged = false;
    closeChoices();
    if (doc.activeElement === input) input.blur();
    schedule();
  });

  const choiceButton = (label: string, kind: Choice, entries: readonly [string, MobileEditAction][]) => {
    const control = button(label, kind, () => {
      if (root.hidden || actions.busy()) return;
      const reopening = open !== kind;
      closeChoices();
      if (!reopening) return;
      try { choiceTarget = editor.capture(); }
      catch (error) { actions.error(error); return; }
      choices.replaceChildren(...entries.map(([label, action]) =>
        button(label, action, () => run(action, choiceTarget))));
      open = kind;
      choices.hidden = false;
      control.setAttribute("aria-expanded", "true");
      reveal = true;
      schedule();
    });
    control.setAttribute("aria-controls", choices.id);
    control.setAttribute("aria-expanded", "false");
    return control;
  };
  const format = choiceButton("서식", "format", [["진하게", "bold"], ["글자 모양", "character"], ["문단 모양", "paragraph"]]);
  const insert = choiceButton("삽입", "insert", [["붙이기", "paste"], ["표 만들기", "insert-table"], ["그림 넣기", "insert-picture"]]);
  const file = choiceButton("파일", "file", [["HWPX 사본 다운로드", "download-copy"], ["저장된 파일 선택·확인", "confirm-download"]]);
  const cell = choiceButton("셀 도구", "cell-tools", [
    ["붙이기", "paste"], ["실행 취소", "undo"], ["다시 실행", "redo"], ["셀 속성", "cell-properties"],
  ]);

  // Retain the editor's focus and system keyboard during direct touch actions.
  root.addEventListener("pointerdown", event => {
    if ((event.target as Element).closest("button")) event.preventDefault();
  });
  doc.addEventListener("pointerdown", event => {
    if (open && !root.contains(event.target as Node)) closeChoices();
  }, true);
  root.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    const launch = row.querySelector<HTMLButtonElement>('button[aria-expanded="true"]');
    closeChoices();
    launch?.focus();
  });

  let mode = "", geometry = "", reveal = false;
  let layoutWidth = 0, unobscuredHeight = 0, keyboardWasOpen = false;
  function sync() {
    frame = 0;
    if (owner !== editor.adapter.documentId) {
      owner = editor.adapter.documentId;
      engaged = false;
      closeChoices();
    }
    const active = doc.activeElement;
    const supported = media.matches;
    const editing = supported && engaged && (active === input || root.contains(active)) &&
      !doc.querySelector("dialog[open]");
    root.hidden = !editing;
    doc.body.toggleAttribute("data-mobile-editing", editing);

    // A keyboard may shrink only the visual viewport. Pin to that visible
    // rectangle rather than the layout viewport's bottom edge.
    const top = supported ? view?.offsetTop ?? 0 : 0;
    const left = supported ? view?.offsetLeft ?? 0 : 0;
    const h = supported ? view?.height ?? win.innerHeight : win.innerHeight;
    const w = supported ? view?.width ?? win.innerWidth : win.innerWidth;
    const bottom = Math.max(0, win.innerHeight - top - h);
    const unzoomed = Math.abs((view?.scale ?? 1) - 1) < .05;
    if (supported && unzoomed) {
      if (layoutWidth !== win.innerWidth) {
        layoutWidth = win.innerWidth;
        unobscuredHeight = win.innerHeight;
      } else {
        // Android may resize the layout viewport too. iOS can move its visual
        // top. Compare height before the keyboard with height after, separately
        // from the bottom inset used to place the toolbar.
        unobscuredHeight = Math.max(unobscuredHeight, win.innerHeight);
      }
    } else if (!supported) {
      layoutWidth = unobscuredHeight = 0;
    }
    const keyboard = editing && unzoomed && Math.max(unobscuredHeight, win.innerHeight) - h > 80;
    const viewport = [top, left, h, w, bottom, keyboard].join("/");
    const geometryChanged = viewport !== geometry;
    if (geometryChanged) {
      geometry = viewport;
      doc.body.style.setProperty("--editor-visible-top", top + "px");
      doc.body.style.setProperty("--editor-visible-height", h + "px");
      root.style.left = left + 6 + "px";
      root.style.width = Math.max(0, w - 12) + "px";
      root.style.bottom = bottom + (keyboard ? 6 : 36) + "px";
      doc.body.toggleAttribute("data-mobile-keyboard", keyboard);
      doc.body.style.setProperty("--editor-keyboard-inset", (keyboard ? bottom : 0) + "px");
    }
    const keyboardChanged = keyboardWasOpen !== keyboard;
    keyboardWasOpen = keyboard;
    if (!editing) { closeChoices(); reveal = false; return; }

    const selection = editor.selection;
    const nextMode = selection.kind === "text" ? "text" : selection.focus.kind === "cell" ? "cell" : "body";
    if (mode !== nextMode) {
      closeChoices();
      mode = nextMode;
      row.replaceChildren(...(mode === "text" ? [copy, cut, paste, format, file, done]
        : mode === "cell" ? [previous, next, cell, format, file, done] : [undo, format, insert, file, done]));
    }
    const busy = actions.busy();
    const readOnly = editor.adapter.scope !== "edit" || editor.adapter.documentLocked;
    for (const control of row.querySelectorAll("button")) {
      control.disabled = busy || control === undo && !editor.history.undoStack.length ||
        (control === cut || control === paste) && readOnly ||
        control === file && !actions.fileActionAvailable("download-copy") && !actions.fileActionAvailable("confirm-download");
    }
    let cellEditBlocked = readOnly;
    if (open === "cell-tools" && !cellEditBlocked) {
      try { editor.adapter.assertEditable(selection.focus); }
      catch { cellEditBlocked = true; }
    }
    for (const control of choices.querySelectorAll("button")) {
      const action = control.dataset.mobileAction;
      if (action === "download-copy" || action === "confirm-download")
        control.hidden = !actions.fileActionAvailable(action);
      control.disabled = busy || action === "paste" && cellEditBlocked ||
        action === "undo" && (cellEditBlocked || !editor.history.undoStack.length) ||
        action === "redo" && (cellEditBlocked || !editor.history.redoStack.length);
    }
    if ((keyboard && (reveal || geometryChanged)) || keyboardChanged)
      doc.dispatchEvent(new Event("rhwp:mobile-keyboard-layout"));
    reveal = false;
  }
  function schedule() {
    if (!frame) frame = win.requestAnimationFrame(sync);
  }
  const engage = () => {
    if (!media.matches) return;
    // The first touch after opening a file belongs to the new document.
    owner = editor.adapter.documentId;
    engaged = true;
    reveal = true;
    closeChoices();
    schedule();
  };
  doc.addEventListener("rhwp:touch-caret", engage);
  doc.addEventListener("rhwp:touch-selection", engage);
  doc.addEventListener("rhwp:editor-state", event => {
    if (!engaged) return;
    reveal ||= editorChanged(event, "document", "selection");
    schedule();
  });
  doc.addEventListener("focusin", () => { if (engaged) schedule(); });
  doc.addEventListener("focusout", () => { if (engaged) schedule(); });
  input.addEventListener("compositionstart", schedule);
  input.addEventListener("compositionend", schedule);
  media.addEventListener("change", schedule);
  view?.addEventListener("resize", schedule);
  view?.addEventListener("scroll", schedule);
  win.addEventListener("resize", schedule);
  schedule();
}
