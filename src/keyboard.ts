import { nested, type Command, type Selection } from "./model.js";
import { relativeCharacterShortcut } from "./character-increments.js";
import { hangingIndentCommand } from "./paragraph-adjustments.js";
import { hancomKeyLink } from "./hancom-key-links.js";
import { hancomWebKey, shortcutPlatform, type ShortcutPlatform } from "./hancom-web-shortcuts.js";

// One exact-modifier route, shared by every editor keyboard surface. Native
// character/IME input is committed by the input event, never by keydown.
export type KeyInput = Pick<
  KeyboardEvent,
  | "key"
  | "code"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "shiftKey"
  | "isComposing"
  | "keyCode"
> & { altGraph?: boolean };
export type KeyRoute =
  | { kind: "input" | "browser" }
  | { kind: "unsupported"; message: string }
  | { kind: "command"; command: Command }
  | { kind: "clipboard"; operation: "copy" | "cut" | "paste" | "paste-text" }
  | { kind: "history"; redo: boolean }
  | { kind: "save"; as?: true }
  | { kind: "print" }
  | { kind: "format-copy" }
  | { kind: "existing-ui"; action: "table-autofill" | "local-left" | "local-right" | "local-up" | "local-down" | "object-group" | "textbox-edit" | "character-map" | "table-transpose" | "table-object-line" | "table-object-background" | "toolbox" | "page-goto" | "paste-choose" | "object-line" | "object-background" | "table-add" | "table-delete" | "cell-split" | "paper" | "font-next" | "font-previous" | "equal-width" | "equal-height" }
  | {kind:"table-calculation";axis:"row"|"column";operation:"SUM"|"AVG"|"PRODUCT"}
  | { kind: "script-cycle" }
  | { kind: 'cell-block-format'; background: boolean }
  | { kind: "paragraph-list-toggle"; mode: "Number" | "Bullet" | "Outline" }
  | { kind: "search"; replace: boolean }
  | { kind: "format"; target: "char" | "paragraph" }
  | {
      kind: "view";
      operation: "all" | "f5" | "cell-start-extend" | "cell-extend" | "cell-rows" | "block" | "escape" | "tab" | "move" | "document" | "paragraph-start" | "paragraph-end" | "page-start" | "word" | "paragraph" | "word-across" | "cell-columns" | "cell-neighbour" | "table-exit" | "object-next" | "column";
      key: string;
      extend: boolean;
    };

// Existing search commands: retain Ctrl/Meta F/H and the published Han/word
// Ctrl+F2 alias. Do not infer Meta+F2 or any Ctrl+Q/OS sequence.
export function searchShortcut(e: KeyInput): "find" | "replace" | undefined {
  if (!e.isComposing && e.keyCode !== 229 && !e.altGraph && !e.altKey && !e.ctrlKey && e.metaKey && e.shiftKey && e.key.toLowerCase() === "h" && shortcutPlatform() === "mac") return "replace";
  if (e.isComposing || e.keyCode === 229 || e.altGraph || e.altKey || e.shiftKey ||
      !(e.ctrlKey || e.metaKey) || (e.ctrlKey && e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === "f") return "find";
  if (key === "h" || e.ctrlKey && key === "f2") return "replace";
}

export function routeKey(e: KeyInput, s: Selection, platform = shortcutPlatform()): KeyRoute {
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  const plain = !ctrl && !e.altKey;
  const primary = ctrl && !e.altKey && !(e.ctrlKey && e.metaKey);
  if (!e.isComposing && e.keyCode !== 229 && s.kind === "object" && plain && !e.shiftKey && ["delete", "backspace"].includes(key)) return {kind:"command",command:{type:"picture",change:{action:"delete"}}};
  if(!e.isComposing&&e.keyCode!==229&&!e.altGraph&&s.kind==="object"&&plain&&!e.shiftKey&&e.key==="Enter")return {kind:"existing-ui",action:"textbox-edit"};
  const command = (command: Command): KeyRoute => ({
    kind: "command",
    command,
  });
  const view = (
    operation: Extract<KeyRoute, { kind: "view" }>["operation"],
  ): KeyRoute => ({ kind: "view", operation, key: e.key, extend: e.shiftKey });
  if (e.isComposing || e.keyCode === 229 || e.altGraph)
    return { kind: "input" };
  const web = hancomWebKey(e, s, platform);
  if (web) return web;
  if(e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&(key==='e'||e.code==='KeyE')) {
    // On a cell block, offer the existing structural draft. A shortcut must
    // not silently erase cell contents or commit a row/column deletion.
    if(s.kind==='cells') return {kind:'existing-ui',action:'table-delete'};
    if(s.kind==='text'||s.kind==='table') return command({type:'delete',backward:false});
    return {kind:'unsupported',message:'지울 내용의 블록을 선택하세요.'};
  }
  const nativeLink=hancomKeyLink(e,s);if(nativeLink)return nativeLink;
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key === "Enter")
    return command({ type: "page-break" });
  if (e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.key === "Enter")
    return command({ type: "column-break" });
  // UI1 native reference: exact Ctrl+Shift chords, distinct from the existing
  // Ctrl+Insert / Shift+Insert / Shift+Delete clipboard aliases below.
  if (e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && (key === "insert" || key === "delete"))
    return { kind: "paragraph-list-toggle", mode: key === "insert" ? "Number" : "Bullet" };
  if (e.altKey && !e.shiftKey && !ctrl && (e.code === "KeyC" || key === "c")) return { kind: "format-copy" };
  if (e.altKey && e.shiftKey && !ctrl) {
    const relative = relativeCharacterShortcut(e.key, e.code);
    if (relative) return command({ type: "char-relative", change: relative });
    const letter = /^Key[BIPSU]$/.test(e.code) ? e.code.slice(3).toLowerCase() : key;
    if (letter === "b") return command({ type: "bold" });
    if (letter === "i") return command({ type: "toggle-char", property: "italic" });
    if (letter === "u") return command({ type: "underline" });
    if (letter === "p" || letter === "s")
      return command({ type: "script", mode: letter === "p" ? "superscript" : "subscript" });
  }
  // Hancom paragraph alignment. C/R/M stay browser-owned (DevTools/reload/profile).
  if (e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey) {
    const letter = /^KeyL$/.test(e.code) ? e.code.slice(3).toLowerCase() : key;
    if (letter === "l") {
      if (nested(s.focus)) return { kind: "unsupported", message: "중첩 셀 문단 정렬은 현재 Core 연결에서 미지원입니다." };
      return command({ type: "paragraph", props: { alignment: "left" } });
    }
  }
  // User restored native outline shortcut. Ctrl+C remains copy in text contexts;
  // Ctrl+Insert keeps copying objects/cell blocks where outline is not applicable.
  if(e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&key==='insert'&&(s.kind==='caret'||s.kind==='text'))
    return {kind:'paragraph-list-toggle',mode:'Outline'};
  // Standard edit aliases use the same async OS clipboard path, never native textarea mutation.
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key === "Insert")
    return { kind: "clipboard", operation: "copy" };
  if (plain && e.shiftKey && (e.key === "Insert" || e.key === "Delete"))
    return { kind: "clipboard", operation: e.key === "Insert" ? "paste" : "cut" };
  if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "Home" || e.key === "End")) {
    // Same-input Hancom 12.0.0.535 kept the caret and no selection for both
    // chords. Do not treat a generic browser/word shortcut as a Hancom binding.
    if (e.shiftKey) return { kind: "unsupported", message: "Ctrl+Shift+Home/End는 한컴 기준 선택 명령에 연결하지 않습니다. 기존 선택을 유지합니다. Shift+Home/End·블록 설정(F3)·전체 선택을 사용하세요." };
    return view("document");
  }
  if (primary && e.shiftKey && key === "s") return {kind:"save",as:true};
  if (primary && !e.shiftKey) {
    if (["c", "x", "v"].includes(key))
      return {
        kind: "clipboard",
        operation: key === "c" ? "copy" : key === "x" ? "cut" : "paste",
      };
    const search = searchShortcut(e);
    if (search) return { kind: "search", replace: search === "replace" };
    if (key === "p") return {kind:"print"};
    if (key === "s") return { kind: "save" };
    if (key === "y") return { kind: "history", redo: true };
    if (key === "b") return command({ type: "bold" });
    if (e.metaKey && key === "e" && s.kind === "cells")
      return command({ type: "clear-cells" });
    if (key === "a") return view("all");
  }
  if (primary && e.shiftKey && key === "v") return {kind:"clipboard",operation:"paste-text"};
  if (primary && key === "z") return { kind: "history", redo: e.shiftKey };
  if (plain && key === "m" && s.kind === "cells")
    return command({ type: "table-edit", operation: "merge" });
  if (e.altKey && !ctrl && !e.shiftKey && (key === "l" || key === "t"))
    return { kind: "format", target: key === "l" ? "char" : "paragraph" };
  if (primary && e.shiftKey && e.code === "Backquote")
    return command(hangingIndentCommand);
  if (plain && !e.shiftKey) {
    if (e.key === "F5") return view("f5");
    if (e.key === "F3") return view("block");
    if (e.key === "Escape") return view("escape");
  }
  // User 2026-10-20 23:32: the same quick-indent action in body and cells.
  // Previous-cell traversal stays available through its menu, not Shift+Tab.
  if (plain && e.shiftKey && e.key === 'Tab') return command({ type: 'paragraph-current-position' });
  if (plain && e.key === "Tab" && s.focus.kind === "cell") return view("tab");
  if (plain && !e.shiftKey && e.key === "Tab" && s.focus.kind === "body" && ["caret", "text"].includes(s.kind))
    return command({ type: "insert", text: "\t" });
  const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (
    !e.shiftKey &&
    (s.kind === "cells" || s.kind === "table") &&
    (primary || (e.altKey && !ctrl)) &&
    arrows.includes(e.key)
  )
    return command({
      type: "resize",
      nativeTrackKeys: true,
      ...(!e.altKey&&["ArrowLeft","ArrowRight"].includes(e.key)?{trackBoundary:true}:{}),
      ...(e.altKey?{redistribute:(["ArrowLeft","ArrowRight"].includes(e.key)?"x":"y") as "x"|"y",trackBoundary:true}:{}),
      width: e.key === "ArrowLeft" ? -300 : e.key === "ArrowRight" ? 300 : 0,
      height: e.key === "ArrowUp" ? -300 : e.key === "ArrowDown" ? 300 : 0,
    });
  if (plain && [...arrows, "Home", "End", "PageUp", "PageDown"].includes(e.key))
    return view("move");
  if (["Delete", "Backspace", "Enter"].includes(e.key)) {
    if (plain && e.shiftKey && e.key === "Enter")
      return command({ type: "break", soft: true });
    if (plain && !e.shiftKey)
      return e.key === "Enter"
        ? command({ type: "break" })
        : command({ type: "delete", backward: e.key === "Backspace" });
    // Ctrl+Alt+Delete belongs to the OS.
    if (ctrl && e.altKey)
      return { kind: "browser" };
    return {
      kind: "unsupported",
      message: "이 수정자 조합의 삭제·줄바꿈 명령은 아직 지원하지 않습니다.",
    };
  }
  // Ctrl+Tab, reload, address bar, browser search and unknown modified keys
  // belong to the browser/OS. They must not degrade to single-character edits.
  return { kind: plain && [...e.key].length === 1 ? "input" : "browser" };
}
