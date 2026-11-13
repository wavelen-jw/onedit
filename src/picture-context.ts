import {captionTarget} from './captions.js';
import {registerPopupLifetime} from './menu-lifetime.js';
import {prepareControlKey} from './control-shortcuts.js';
import type { Interaction } from "./interaction.js";
import { pictureCanvasBoxes, pictureCanvasHit } from "./picture-canvas.js";
import { selectedPicture } from "./pictures.js";
import { clipboardSupport } from "./clipboard-ui-state.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";
import { pagePoint, pageScale } from "./integration/a-view-menu.js";
import { tableContextKey } from "./table-context.js";
import { bodyContextAppShortcut } from "./body-context.js";
import { objectContextItems, renderObjectContextItems } from "./object-context-menu.js";
import { controlPoint, onControlOutline,controlClientPoint,type ControlPointer } from "./object-hit-point.js";
import type { Selection } from "./model.js";
import { inlineCellPictureBoxes } from "./inline-cell-picture.js";

// A view of existing single-body-picture commands and the shared OS copy entry.
export function mountPictureContext(doc: Document, editor: Interaction, actions: {
  busy: () => boolean; changed: () => void; focus: () => void;
  properties: () => void; error: (error: unknown) => void; selectionChanged?:()=>void;
}) {
  const win = doc.defaultView!, pages = doc.getElementById("pages")!, input = doc.getElementById("input")!;
  const popup = doc.createElement("div"); popup.id = "picture-context-menu"; popup.hidden = true;
  popup.setAttribute("role", "menu"); popup.setAttribute("aria-label", "그림 바로 가기 메뉴"); doc.body.append(popup);
  const items = objectContextItems("picture");
  let captured: ReturnType<Interaction["capture"]> | undefined;
  let lastPointer:ControlPointer|undefined;
  const close = (focus = false) => { popup.hidden = true; captured = undefined; if (focus) actions.focus(); };
  const valid = () => {
    try {
      return !!captured && sameFormatTarget(captured, editor.capture()) &&
        !!selectedPicture(editor.adapter, editor.selection);
    } catch { return false; }
  };
  const reason = (id: string) => {
    if(id==='caption'){try{if(actions.busy())throw Error('현재 작업을 마친 후 사용하세요.');captionTarget(editor.adapter,editor.selection);return '';}catch(error){return String(error);}}
    if(['front','back','inFrontOfText','behindText'].includes(id)){try{if(actions.busy())throw Error('현재 작업을 마친 후 사용하세요.');prepareControlKey(editor.adapter,editor.selection,id as 'front'|'back'|'inFrontOfText'|'behindText');return '';}catch(error){return String(error);}}
    if(id==='line')return actions.busy()?'현재 작업을 마친 후 사용하세요.':'';
    if (!["properties","description","delete","copy","cut"].includes(id)) return id==="placement" ? "개체 속성 기본 탭에서 지원하는 본문 배치를 변경하세요. 이 하위 메뉴는 미연결입니다." : "이 그림 명령의 UI 연결은 미지원입니다. 원본 개체를 유지합니다.";
    if (id === "copy" || id === "cut" || id === "paste") return clipboardSupport(editor, id).reason ?? "";
    if (actions.busy()) return "입력·저장·대화상자를 마친 후 사용하세요.";
    try { editor.adapter.assertEditable(editor.selection.focus); const p=selectedPicture(editor.adapter, editor.selection);if(id==='description'&&typeof p.props.description!=='string')return '개체 설명문을 조회할 수 없습니다. 원본을 유지합니다.'; }
    catch (error) { return String(error); }
    return "";
  };
  const sync = () => {
    if (!captured) return; // No per-pointer picture query while this menu is closed.
    if (actions.busy() || !valid()) { close(); return; }
    for (const [id, label] of items) {
      const button = buttons.get(id)!, why = reason(id);
      button.disabled = !!why; button.title = why || label;
      button.setAttribute("aria-disabled", String(button.disabled));
    }
  };
  const removeSelected = (target:ReturnType<Interaction["capture"]>) => {
    editor.execute({type:"picture",change:{action:"delete"}},target);actions.changed();actions.focus();
  };
  const activate = (id: string) => {
    if (!valid()) { close(true); actions.error("문서·리비전·선택한 그림이 바뀌었습니다. 그림 메뉴를 다시 여세요."); return; }
    const why = reason(id); if (why) { actions.error(why); sync(); return; }
    const target = captured!; close();
    try {
      if(id==='caption')doc.dispatchEvent(new CustomEvent('rhwp:remaining-open',{detail:'caption'}));
      else if(['front','back','inFrontOfText','behindText'].includes(id)){editor.execute({type:'control-key',action:id as 'front'|'back'|'inFrontOfText'|'behindText'},target);actions.changed();actions.focus();}
      else if(id==='line'){actions.properties();doc.querySelector<HTMLButtonElement>('#picture-dialog [data-object-tab="2"]')?.click();}
      else if (id === "copy" || id === "cut") {
        actions.focus();
        input.dispatchEvent(new ClipboardEvent(id, { bubbles: true, cancelable: true }));
      }
      else if (id === "properties") actions.properties();
      else if (id === "description") { actions.properties(); doc.querySelector<HTMLTextAreaElement>('#picture-dialog[open] [data-picture-description]')?.focus(); }
      else if (id === "delete") removeSelected(target);
    } catch (error) { actions.error(error); actions.focus(); }
  };
  const buttons = renderObjectContextItems(popup,"picture",activate,"pictureContextAction");
  const open = (x: number, y: number) => {
    if (actions.busy()) return;
    editor.adapter.assertEditable(editor.selection.focus); selectedPicture(editor.adapter, editor.selection);
    for (const menu of doc.querySelectorAll<HTMLDetailsElement>("#main-menu details[open]")) menu.open = false;
    captured = editor.capture(); sync(); if (!captured) return;
    popup.hidden = false; popup.style.left = popup.style.top = "8px";
    const b = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(x, win.innerWidth - b.width - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(y, win.innerHeight - b.height - 8))}px`;
    [...buttons.values()].find(b => !b.disabled)?.focus();
  };
  const cellHit = (page: HTMLElement, x: number, y: number) => {
    if(!page.querySelector(":scope > svg"))return; // Existing IME/resize surface restores SVG before hit testing.
    const point=controlPoint(page,x,y), controls=editor.adapter.call("getPageControlLayout",Number(page.dataset.page)).controls??[];
    const contains=(c:any)=>[c.x,c.y,c.w,c.h].every(Number.isFinite)&&point.x>=c.x&&point.x<=c.x+c.w&&point.y>=c.y&&point.y<=c.y+c.h;
    const hits=controls.filter((c:any)=>c.type==="image"&&c.stableIndex?.length===6&&(contains(c)||onControlOutline(page,c,x,y)));
    if(hits.length!==1)return;
    const box=hits[0],s=box.stableIndex;
    const focus=editor.adapter.fromPath(s[0],s[1],[{controlIndex:s[2],cellIndex:s[3],cellParaIndex:s[4]}],0);
    const selection:Selection={kind:"object",focus,control:s[5]};
    let row;try{row=selectedPicture(editor.adapter,selection);}catch{return;}
    const p=row.props;
    if(!row.cellPath||p.rotationAngle||p.horzFlip||p.vertFlip||p.cropLeft||p.cropTop||p.cropRight||p.cropBottom||
      Math.abs(box.w-p.width/75)>.11||Math.abs(box.h-p.height/75)>.11)return;
    // Only the validated owning table may enclose this picture. Other overlap
    // has no inferred z-order. Nested/mixed/multiple owners are not admitted.
    if(controls.some((c:any)=>c!==box&&contains(c)&&!(c.type==="table"&&Array.isArray(c.stableIndex)&&c.stableIndex.length<s.length&&c.stableIndex.every((v:number,i:number)=>v===s[i]))))return;
    return {box,selection,outline:onControlOutline(page,box,x,y)};
  };
  const context = (e: MouseEvent, properties = false) => {
    const page = (e.target as Element).closest<HTMLElement>(".page"); if (!page || !pages.contains(page)) return;
    try {
      const client=controlClientPoint(page,e,lastPointer,editor.adapter.documentId,editor.adapter.revision);
      const cell=cellHit(page,client.x,client.y);
      const point = pagePoint(page, e.clientX, e.clientY), hit = cell?undefined:pictureCanvasHit(editor, Number(page.dataset.page), point.x, point.y);
      if (!hit&&!cell) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (actions.busy()) return;
      const next = cell?.selection ?? { kind: "object" as const, focus: { kind: "body" as const, sec: hit!.sec, para: hit!.para, offset: 0 }, control: hit!.control };
      selectedPicture(editor.adapter, next); editor.adapter.assertEditable(next.focus);
      if (JSON.stringify(next) !== JSON.stringify(editor.selection)) { editor.selection = next; (cell?actions.selectionChanged??actions.changed:actions.changed)(); }
      // Native's eight stream units are not eight Unicode scalar characters.
      // Reuse the accepted whole-cell-picture object block at the exact edge.
      if(properties&&cell?.outline)actions.focus();
      else if (properties) actions.properties();
      else open(e.clientX, e.clientY);
    } catch (error) { e.preventDefault(); e.stopImmediatePropagation(); close(); actions.error(error); }
  };
  const doubleClick = (e: MouseEvent) => { if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) context(e, true); };
  const pointer=(e:PointerEvent)=>{
    if(e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
    const page=(e.target as Element).closest<HTMLElement>(".page");if(!page||!pages.contains(page))return;
    lastPointer={page,documentId:editor.adapter.documentId,revision:editor.adapter.revision,x:e.clientX,y:e.clientY,time:e.timeStamp};
    try{const hit=cellHit(page,e.clientX,e.clientY);if(!hit||hit.outline)return;
      e.preventDefault();e.stopImmediatePropagation();if(actions.busy())return;
      editor.adapter.assertEditable(hit.selection.focus);editor.selection=hit.selection;(actions.selectionChanged??actions.changed)();actions.focus();
    }catch(error){e.preventDefault();e.stopImmediatePropagation();actions.error(error);}
  };
  const key = (e: KeyboardEvent) => {
    // The native picture menu advertises Ctrl+E. Keep normal text alignment and
    // other object policies outside this exact, typed picture selection.
    if(e.target===input&&editor.selection.kind==="object"&&editor.selection.focus.kind==="body"&&e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="e") {
      try {selectedPicture(editor.adapter,editor.selection);}catch{return;}
      e.preventDefault();e.stopImmediatePropagation();if(e.isComposing||e.keyCode===229||e.repeat||actions.busy())return;
      try{removeSelected(editor.capture());}catch(error){actions.error(error);}return;
    }
    if (e.target === input && editor.selection.kind === "object" && tableContextKey(e)) {
      try { selectedPicture(editor.adapter,editor.selection); } catch { return; }
      e.preventDefault(); e.stopImmediatePropagation(); if (actions.busy()) return;
      try {
        const s = editor.selection;
        const boxes = s.focus.kind==='cell' ? inlineCellPictureBoxes(editor.adapter,s).flatMap(b=>{
          const page=pages.querySelector<HTMLElement>(`[data-page="${b.pageIndex}"]`);
          return page?[{page,box:{x:b.x,y:b.y,w:b.width,h:b.height}}]:[];
        }) : Array.from(pages.querySelectorAll<HTMLElement>(".page")).flatMap(page =>
          pictureCanvasBoxes(editor, Number(page.dataset.page)).map(box => ({ page, box })))
          .filter(({ box }) => box.sec === s.focus.sec && box.para === s.focus.para && box.control === s.control);
        if (boxes.length !== 1) throw Error("이 그림의 바로 가기 메뉴 좌표는 확인되지 않았습니다. 기존 그림 목록/속성을 사용하세요.");
        const { page, box } = boxes[0], rect = page.getBoundingClientRect(), scale = pageScale(page);
        open(rect.left + box.x * scale, rect.top + (box.y + box.h) * scale);
      } catch (error) { close(true); actions.error(error); }
      return;
    }
    if (popup.hidden || !popup.contains(e.target as Node)) return;
    e.stopImmediatePropagation();
    if (e.isComposing || e.keyCode === 229 || e.repeat) { e.preventDefault(); return; }
    if (bodyContextAppShortcut(e) || (e.altKey && e.key.toLowerCase() === "c")) { e.preventDefault(); return; }
    if(e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="e"){e.preventDefault();activate("delete");return;}
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase()==="p") {e.preventDefault();activate("properties");return;}
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(true); return; }
    const enabled = [...buttons.values()].filter(b => !b.disabled), at = enabled.indexOf(doc.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault(); const n = e.key === "Home" ? 0 : e.key === "End" ? enabled.length - 1 : (at + (e.key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length;
      enabled[n]?.focus();
    } else if (e.key !== "Enter" && e.key !== " ") e.preventDefault();
  };
  const disposeLifetime=registerPopupLifetime(doc,{root:popup,close:()=>close(),focus:actions.focus});
  const relocated = () => close();
  win.addEventListener("contextmenu", context, true); win.addEventListener("keydown", key, true);
  win.addEventListener("dblclick", doubleClick, true);
  win.addEventListener("pointerdown",pointer,true);
  win.addEventListener("resize", relocated);
  doc.getElementById("viewport")?.addEventListener("scroll", relocated);
  return { sync, openAt:open, dispose() { disposeLifetime(); close(); popup.remove(); win.removeEventListener("pointerdown",pointer,true); win.removeEventListener("dblclick", doubleClick, true); win.removeEventListener("contextmenu", context, true); win.removeEventListener("keydown", key, true); win.removeEventListener("resize", relocated); doc.getElementById("viewport")?.removeEventListener("scroll", relocated); } };
}
