import { subscribeWhileOpen } from "./ui-demand-lifetime.js";
import { activeWorkset } from "./active-workset.js";
import { editMenuState } from "./integration/a-edit-menu.js";
import { formatMenuState } from "./integration/a-format-menu.js";
import { contextRow } from "./context-row.js";
import {registerPopupLifetime} from './menu-lifetime.js';
import type { Interaction } from "./interaction.js";
import type { EditAction } from "./integration/a-edit-menu.js";
import { ordered, sameContainer, type Position, type Selection } from "./model.js";
import { pagePoint, pageScale } from "./integration/a-view-menu.js";
import { sameTableContextTarget, tableContextKey } from "./table-context.js";

export function keepBodyContextSelection(selection: Selection, hit: Position) {
  if (selection.kind !== "text" || hit.kind !== "body" ||
      !sameContainer(selection.anchor, hit) || !sameContainer(selection.focus, hit)) return false;
  const [a, b] = ordered(selection.anchor, selection.focus);
  const compare = (p: Position, q: Position) => p.para - q.para || p.offset - q.offset;
  return compare(a, hit) <= 0 && compare(hit, b) <= 0;
}

// Only existing editor chords are consumed while this popup owns focus.
// Browser/OS chords (for example Ctrl+R/T/W and F6/F11) retain their defaults.
export function bodyContextAppShortcut(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">) {
  const k = e.key.toLowerCase(), primary = (e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.metaKey);
  return primary && !e.altKey && (e.shiftKey ? ["z", "s", "v"] : ["z", "y", "b", "i", "u", "s", "o", "p", "a", "c", "x", "v", "f", "h"]).includes(k) ||
    e.altKey && !e.ctrlKey && !e.metaKey && (e.shiftKey ? ["b", "i", "u", "p", "s"] : ["l", "t"]).includes(k) ||
    !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key === "F5";
}

/** Body-only presentation of existing commands. Cell/object menus keep their owners. */
export function mountBodyContext(doc: Document, editor: Interaction, busy: () => boolean,
  sources: Map<EditAction, HTMLButtonElement>,
  invoke: (id: EditAction, target: ReturnType<Interaction["capture"]>) => void,
  select: (page: number, x: number, y: number) => void,
  restoreFocus: () => void, feedback: (reason: string) => void, formatInvoke?: (id:string,target:ReturnType<Interaction["capture"]>)=>void) {
  const pages = doc.getElementById("pages")!, input = doc.getElementById("input")!, win = doc.defaultView!;
  const popup = doc.createElement("div"); popup.id = "body-context-menu"; popup.hidden = true;
  popup.setAttribute("role", "menu"); popup.setAttribute("aria-label", "본문 바로 가기 메뉴"); doc.body.append(popup);
  const items = new Map<string, { button: HTMLButtonElement; source: () => HTMLButtonElement | null; edit?: EditAction }>();
  let captured: ReturnType<Interaction["capture"]> | undefined;
  const close = (focus = false) => { popup.hidden = true; captured = undefined; if (focus) restoreFocus(); };
  const valid = () => {
    try { return !!captured && sameTableContextTarget(captured, editor.capture()); } catch { return false; }
  };
  const eligible = () => (editor.selection.kind === "caret" || editor.selection.kind === "text") && editor.selection.focus.kind === "body";
  const sync = () => {
    if(activeWorkset(doc)&&!captured)return;
    const editStates=activeWorkset(doc)?editMenuState(editor,busy()):undefined;
    const formats=activeWorkset(doc)?formatMenuState(editor,busy()):undefined;
    if (captured && (busy() || !valid() || !eligible())) close();
    for (const [id,{button, source}] of items) {
      const original = source();
      const why=editStates ? (id==="character"||id==="paragraph" ? formats?.get(id)?.reason : editStates.get(id as EditAction)) : undefined;
      button.disabled = busy() || !original || (editStates?!!why:original.disabled);
      button.hidden = !original || ['cut','copy','delete'].includes(id)&&editor.selection.kind==='caret';
      const labels:Record<string,[string,string]>={undo:['실행 취소','Ctrl+Z'],redo:['다시 실행','Ctrl+Y'],cut:['오려두기','Ctrl+X'],copy:['복사','Ctrl+C'],paste:['붙이기','Ctrl+V'],delete:['지우기','Delete'],all:['전체 선택','Ctrl+A'],find:['찾기','Ctrl+F'],replace:['바꾸기','Ctrl+H'],character:['글자 모양…','Alt+L'],paragraph:['문단 모양…','Alt+T']};
      const [label,key]=labels[id];contextRow(button,id,label,key);
      button.title = original ? (editStates?why||original.textContent||id:original.title) : "기존 메뉴 연결이 없습니다.";
      button.setAttribute("aria-disabled", String(button.disabled));
    }
  };
  const activate = (id: string) => {
    if (!valid()) { close(true); feedback("문서·리비전·선택이 바뀌었습니다. 본문 메뉴를 다시 여세요."); return; }
    sync();
    const item = items.get(id)!, source = item.source();
    if (!captured || busy() || !source || item.button.disabled || (!activeWorkset(doc)&&source.disabled)) return;
    const target = captured; close();
    if (item.edit) invoke(item.edit, target);
    else if(activeWorkset(doc)&&formatInvoke)formatInvoke(id,target);
    else source.click(); // Existing format entry captures the same, revalidated selection.
  };
  for (const [heading, ids] of [
    ["편집", ["undo", "redo", "cut", "copy", "paste", "delete"]],
    ["선택·찾기", ["all", "find", "replace"]],
    ["서식", ["character", "paragraph"]],
  ] as const) {
    const label = doc.createElement("div"); label.textContent = heading; label.setAttribute("role", "presentation"); popup.append(label);
    for (const id of ids) {
      const button = doc.createElement("button"); button.type = "button"; button.dataset.bodyContextAction = id; button.setAttribute("role", "menuitem");
      const edit = id === "character" || id === "paragraph" ? undefined : id;
      items.set(id, {button, edit, source: () => edit ? sources.get(edit)! : doc.getElementById(id) as HTMLButtonElement | null});
      button.onclick = () => activate(id); popup.append(button);
    }
  }
  const open = (x: number, y: number) => {
    if (busy() || !eligible()) return;
    for (const menu of doc.querySelectorAll<HTMLDetailsElement>("#main-menu details[open]")) menu.open = false;
    captured = editor.capture(); sync(); popup.hidden = false;
    popup.style.left = popup.style.top = "8px";
    const box = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(x, win.innerWidth - box.width - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(y, win.innerHeight - box.height - 8))}px`;
    [...items.values()].find(i => !i.button.disabled&&!i.button.hidden)?.button.focus();
  };
  const openKeyboard = () => {
    if (busy() || !eligible()) return;
    try {
      const rect = editor.adapter.rect(editor.selection.focus), page = pages.querySelector<HTMLElement>(`[data-page="${rect.pageIndex}"]`);
      if (!page) return;
      const box = page.getBoundingClientRect(), scale = pageScale(page);
      open(box.left + rect.x * scale, box.top + (rect.y + rect.height) * scale);
    } catch (error) { close(true); feedback(String(error)); }
  };
  const pointer = (e: PointerEvent) => {
    if (e.button === 2) { e.preventDefault(); e.stopPropagation(); }
  };
  const context = (e: MouseEvent) => {
    if (busy()) { e.preventDefault(); return; }
    if (editor.selection.kind === "object" || (e.target as Element).closest("image")) return;
    try {
      const page = (e.target as Element).closest<HTMLElement>(".page"); if (!page) return;
      const p = pagePoint(page, e.clientX, e.clientY), index = Number(page.dataset.page), hit = editor.adapter.hit(index, p.x, p.y);
      if (hit.kind !== "body") return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!keepBodyContextSelection(editor.selection, hit)) select(index, p.x, p.y);
      open(e.clientX, e.clientY);
    } catch (error) { e.preventDefault(); close(); feedback(String(error)); }
  };
  const key = (e: KeyboardEvent) => {
    if (e.target === input && tableContextKey(e) && eligible()) {
      e.preventDefault(); e.stopImmediatePropagation(); openKeyboard(); return;
    }
    if (popup.hidden || !popup.contains(e.target as Node)) return;
    // Stop editor shortcuts behind the popup, retaining browser/OS defaults.
    e.stopImmediatePropagation();
    if (e.isComposing || e.keyCode === 229 || e.repeat) { e.preventDefault(); return; }
    if (bodyContextAppShortcut(e)) { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const enabled = [...items.values()].map(i => i.button).filter(b => !b.disabled&&!b.hidden), index = enabled.indexOf(doc.activeElement as HTMLButtonElement);
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(true); }
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const next = e.key === "Home" ? 0 : e.key === "End" ? enabled.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length;
      enabled[next]?.focus();
    }
  };
  const disposeLifetime=registerPopupLifetime(doc,{root:popup,close:()=>close(),focus:restoreFocus});
  const resized = () => close(popup.contains(doc.activeElement));
  const blurred = () => close();
  const observer = new MutationObserver(sync); if(!activeWorkset(doc))observer.observe(doc.body, {subtree:true, attributes:true, attributeFilter:["open"]});
  win.addEventListener("keydown", key, true);
  pages.addEventListener("pointerdown", pointer, true); pages.addEventListener("contextmenu", context);
  win.addEventListener("resize", resized); sync();
  const disposeDemand=activeWorkset(doc)?subscribeWhileOpen(doc,popup,sync,false):()=>{};
  return {sync, dispose() { disposeDemand(); disposeLifetime(); observer.disconnect(); close(); popup.remove(); win.removeEventListener("keydown", key, true); pages.removeEventListener("pointerdown", pointer, true); pages.removeEventListener("contextmenu", context); win.removeEventListener("resize", resized); }};
}
