import {activeWorkset, withMenuDemand} from "./active-workset.js";
import { cellDialogFor, cellDialogMode } from "./cell-dialog-command.js";
import {readFormatPresentation} from './typing-format-presentation.js';
import { contextRow } from "./context-row.js";
import {registerPopupLifetime} from './menu-lifetime.js';
import type { EditAction } from "./integration/a-edit-menu.js";
import type { Interaction } from "./interaction.js";
import { sameContainer, sameTable, type Position, type Selection } from "./model.js";
import { pagePoint, pageScale } from "./integration/a-view-menu.js";
import { tableItems, tableMenuState } from "./integration/a-table-menu.js";
import { formatMenuState } from "./integration/a-format-menu.js";

export function keepTableContextSelection(selection: Selection, hit: Position, selectedCells: number[]) {
  if (hit.kind !== "cell") return false;
  if (selection.kind === "cells" || selection.kind === "table")
    return sameTable(selection.focus, hit) && selectedCells.includes(hit.cell);
  if (selection.kind === "text" && sameContainer(selection.anchor, hit) && sameContainer(selection.focus, hit)) {
    const compare = (a: Position, b: Position) =>
      (a.kind === "cell" && b.kind === "cell" ? a.cellPara - b.cellPara : a.para - b.para) || a.offset - b.offset;
    const [a, b] = compare(selection.anchor, selection.focus) <= 0 ? [selection.anchor, selection.focus] : [selection.focus, selection.anchor];
    return compare(a, hit) <= 0 && compare(hit, b) <= 0;
  }
  return false;
}
export function sameTableContextTarget(a: ReturnType<Interaction["capture"]>, b: typeof a) {
  return a.documentId === b.documentId && a.revision === b.revision && JSON.stringify(a.selection) === JSON.stringify(b.selection);
}
export function tableContextKey(e: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "isComposing" | "keyCode" | "repeat">) {
  return !e.isComposing && e.keyCode !== 229 && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey &&
    (e.key === "ContextMenu" && !e.shiftKey || e.key === "F10" && e.shiftKey);
}

/** A second presentation of the existing menu buttons, not another mutation route. */
export function mountTableContext(doc: Document, editor: Interaction, busy: () => boolean,
  select: (p: Position) => void, restoreFocus: () => void, feedback: (reason: string) => void,
  edit: {
    state: () => Map<string, string>;
    invoke: (id: EditAction, target: ReturnType<Interaction["capture"]>) => void;
  }, tableCommands?: {invoke:(id:string,target:ReturnType<Interaction["capture"]>)=>void; formatInvoke:(id:string,target:ReturnType<Interaction["capture"]>)=>void}) {
  const pages = doc.getElementById("pages")!, input = doc.getElementById("input")!, win = doc.defaultView!;
  const popup = doc.createElement("div"); popup.id = "table-context-menu"; popup.hidden = true;
  popup.setAttribute("role", "menu"); popup.setAttribute("aria-label", "표 바로 가기 메뉴"); doc.body.append(popup);
  type Item={button:HTMLButtonElement;source:()=>HTMLButtonElement|null;table?:string;edit?:EditAction;format?:string;held?:string};
  const cellCommand = cellDialogFor(doc);
  const items=new Map<string,Item>(),submenus=new Map<HTMLButtonElement,HTMLElement>();
  let captured:ReturnType<Interaction["capture"]>|undefined;
  const closeSubmenus=()=>{for(const [button,panel]of submenus){panel.hidden=true;button.setAttribute("aria-expanded","false");}};
  const close=(focus=false)=>{closeSubmenus();popup.hidden=true;captured=undefined;if(focus)restoreFocus();};
  const current=()=>{try{return !!captured&&sameTableContextTarget(captured,editor.capture());}catch{return false;}};
  const item=(parent:HTMLElement,id:string,label:string,options:Omit<Item,"button">,key="")=>{
    const button=doc.createElement("button"),text=doc.createElement("span"),shortcut=doc.createElement("kbd");
    button.type="button";button.setAttribute("role","menuitem");text.textContent=label;shortcut.textContent=key;button.append(text,shortcut);
    if(options.table)button.dataset.tableContextAction=options.table;
    else if(options.edit)button.dataset.tableContextClipboard=options.edit;
    else button.dataset.tableContextFormat=id;
    contextRow(button,id,label,key);parent.append(button);items.set(id,{button,...options});
    const mode = options.table && cellDialogMode(options.table);
    if (mode) cellCommand?.bind(button, mode, label, true);
    button.onclick=()=>{
      if (mode && cellCommand) {
        if (captured) cellCommand.open(mode, captured, () => close());
        return;
      }
      if(!current()){close(true);feedback("문서·리비전·선택이 바뀌었습니다. 표 메뉴를 다시 여세요.");return;}
      sync();const entry=items.get(id)!,source=entry.source();
      if(!captured||busy()||button.disabled||!source||(!activeWorkset(doc)&&source.disabled))return;
      if(activeWorkset(doc)&&(entry.edit||entry.table&&tableCommands||entry.format&&source.dataset.formatAction&&tableCommands)){
        const target=captured;close();
        if(entry.edit)edit.invoke(entry.edit,target);
        else if(entry.table)tableCommands!.invoke(entry.table,target);
        else tableCommands!.formatInvoke(entry.format!,target);
        return;
      }
      if(activeWorkset(doc)){
        // Table commands belong to the table root, not the nested disclosure.
        // Its synchronous opening listener refreshes the separate saved capture.
        const owner=source.closest<HTMLElement>(entry.table?'#table-menu':'details');
        if(!owner)return;
        withMenuDemand(owner,()=>owner.dispatchEvent(new Event('rhwp:menu-opening')));
      }
      if(source.disabled)return;
      const target=captured;close();
      if(entry.edit)edit.invoke(entry.edit,target);else source.click();
    };return button;
  };
  const separator=(parent=popup)=>{const hr=doc.createElement("hr");hr.setAttribute("role","separator");parent.append(hr);};
  const submenu=(label:string)=>{
    const button=doc.createElement("button"),panel=doc.createElement("div"),name=doc.createElement("span"),arrow=doc.createElement("span");
    button.type="button";button.setAttribute("role","menuitem");button.setAttribute("aria-haspopup","menu");button.setAttribute("aria-expanded","false");name.textContent=label;arrow.textContent="›";arrow.setAttribute("aria-hidden","true");button.append(name,arrow);
    panel.className="table-context-submenu";panel.id=`table-context-submenu-${submenus.size}`;panel.hidden=true;panel.setAttribute("role","menu");panel.setAttribute("aria-label",label);button.setAttribute("aria-controls",panel.id);popup.append(button,panel);submenus.set(button,panel);return panel;
  };
  const table=(parent:HTMLElement,id:string,label:string,key="")=>item(parent,id,label,{table:id,source:()=>doc.querySelector(`#table-menu [data-table-action="${id}"]`)},key);
  const editItem=(parent:HTMLElement,id:EditAction,label:string,key="")=>item(parent,"edit-"+id,label,{edit:id,source:()=>doc.querySelector(`#edit-menu [data-edit-action="${id}"]`)},key);
  editItem(popup,"cut","오려 두기","Ctrl+X");editItem(popup,"copy","복사하기","Ctrl+C");editItem(popup,"clear","셀 내용 지우기");editItem(popup,"delete","선택 내용 지우기","Delete");editItem(popup,"paste","붙이기","Ctrl+V");
  const paste=submenu("선택하여 붙이기");editItem(paste,"paste-special","텍스트만 붙이기","Ctrl+Shift+V");
  separator();
  for(const [id,label,key]of [["character","글자 모양…","Alt+L"],["paragraph","문단 모양…","Alt+T"],["paragraph-lists","글머리표 및 문단 번호…",""]])
    item(popup,"format-"+id,label,{format:id,source:()=>doc.querySelector(`#format-menu [data-format-action="${id}"]`)},key);
  item(popup,'character-map','문자표…',{source:()=>{const root=doc.querySelector('#insert-menu');root?.dispatchEvent(new Event('rhwp:menu-opening'));return root?.querySelector<HTMLButtonElement>('[data-remaining-entry=character-map]')??null;}},'Ctrl+F10');

  separator();const properties=table(popup,"properties","표/셀 속성…");
  const border=submenu("셀 테두리/배경");table(border,"border-properties","셀 테두리/배경…");
  table(border,'block-border','하나의 셀처럼 · 테두리…','B');
  table(border,'block-background','하나의 셀처럼 · 배경…','F');
  separator();table(popup,"merge","셀 합치기","M · F5 블록");const split=table(popup,"split-dialog","셀 나누기…","S");
  const add=submenu("줄/칸 추가하기");table(add,'add-dialog','줄/칸 추가하기…','Alt+Insert');table(add,"row-add","아래 행 추가");table(add,"col-add","오른쪽 열 추가");
  const remove=submenu("줄/칸 지우기");table(remove,'delete-dialog','줄/칸 지우기…','Alt+Delete · 셀 블록 Ctrl+E');table(remove,"row-delete","현재 행 삭제 · 내용 포함");table(remove,"col-delete","현재 열 삭제 · 내용 포함");
  separator();const more=submenu("선택·이동·크기 도구");
  for(const id of ["select","text","object","previous","next","width-plus","width-minus","height-plus","height-minus","select-columns","leave","control-front","control-back","control-inFrontOfText","control-behindText"]){const entry=tableItems.find(x=>x.id===id)!;table(more,id,entry.label,entry.key);}

  table(popup,'table-transpose','표 뒤집기 · 줄/칸 전치…','T');table(popup,'table-object-line','표 개체 테두리…','L');table(popup,'table-object-background','표 개체 채우기…','C');
  item(popup,'caption','캡션 넣기·내용 추가…',{source:()=>doc.querySelector<HTMLButtonElement>('#insert-menu [data-remaining-entry=caption]'),format:'caption'},'Ctrl+N,C');
  const propertySlot=doc.createComment("cell-properties-position");properties.before(propertySlot);
  const extraButton=[...submenus].find(([,panel])=>panel===more)![0];
  const sync=()=>{
    if(activeWorkset(doc)&&!captured)return;
    if(captured&&(busy()||!current()))close();
    if(captured)doc.getElementById('insert-menu')?.dispatchEvent(new Event('rhwp:menu-opening'));
    // A closed popup has no visible format projection. Opening/captured-owner
    // checks above and every action retain their fresh source validation.
    const opener=doc.querySelector<HTMLButtonElement>("[data-table-context-launch]");
    if(opener){opener.disabled=busy()||editor.selection.focus.kind!=="cell";opener.title=opener.disabled?"표 셀에 커서를 놓고 입력·대화상자를 마친 후 사용하세요":"Shift+F10 · 표 바로 가기 메뉴";}
    if (!captured) return;
    const tableStates=tableMenuState(editor,busy(),true,!!cellCommand),editStates=edit.state(),formatStates=formatMenuState(editor,busy(),undefined,kind=>readFormatPresentation(editor,kind));
    for(const entry of items.values()){
      if (entry.table && cellDialogMode(entry.table) && cellCommand) { entry.button.hidden = false; continue; }
      const source=entry.source();let why=entry.held|| (entry.table?tableStates.get(entry.table):entry.edit?editStates.get(entry.edit):entry.format?formatStates.get(entry.format)?.reason:"")||"";
      if(!why)why=!source?"기존 메뉴 연결이 없습니다":
        activeWorkset(doc)&&(entry.table||entry.edit||entry.format)?"":source.disabled?source.title||"현재 선택에서는 사용할 수 없습니다":"";
      entry.button.disabled=!!why;entry.button.title=why||(activeWorkset(doc)&&(entry.table||entry.edit||entry.format)?entry.button.textContent:source?.title)||entry.button.textContent||"";entry.button.setAttribute("aria-disabled",String(!!why));entry.button.setAttribute("aria-description",why);
      // Caret has nothing to cut/copy/delete. Block and object keep their own
      // real clipboard/edit verdicts rather than pretending to be cell text.
      entry.button.hidden=(!source||!!entry.held)|| (entry.edit?["cut","copy","delete"].includes(entry.edit)&&editor.selection.kind==="caret"||entry.edit==="delete"&&editor.selection.kind==="cells"||entry.edit==="clear"&&editor.selection.kind!=="cells":false);
    }
    const object=editor.selection.kind==="table";
    for(const entry of items.values())if(object&&entry.button.parentElement===popup&&!["properties","table-transpose","table-object-line","table-object-background"].includes(entry.table??"")&&!["cut","copy","delete"].includes(entry.edit??"")&&entry.format!=="caption")entry.button.hidden=true;
    for(const [button,panel]of submenus){button.hidden=object&&panel!==more;if(button.hidden){panel.hidden=true;button.setAttribute("aria-expanded","false");}}
    for(const hr of popup.querySelectorAll<HTMLElement>(":scope>hr"))hr.hidden=object;
    if(object){if(popup.firstElementChild!==properties)popup.prepend(properties);}
    else if(properties.previousSibling!==propertySlot)propertySlot.after(properties);
    extraButton.querySelector("span")!.textContent=object?"표 선택·이동·크기 도구":"선택·이동·크기 도구";
    properties.querySelector(".context-label")!.textContent=editor.selection.kind==="table"?"개체 속성 · 표/셀…":"표/셀 속성…";
    split.querySelector(".context-label")!.textContent="셀 나누기…";
    popup.dataset.selectionKind=editor.selection.kind;
    cellCommand?.publish(popup);
  };
  const enabled=(menu:HTMLElement)=>Array.from(menu.children).filter((n):n is HTMLButtonElement=>n instanceof HTMLButtonElement&&!n.hidden&&!n.disabled);
  const focus=(button?:HTMLButtonElement)=>{button?.focus({preventScroll:true});button?.scrollIntoView({block:"nearest"});};
  const position=(button:HTMLButtonElement,panel:HTMLElement)=>{
    const a=button.getBoundingClientRect(),root=popup.getBoundingClientRect(),box=panel.getBoundingClientRect();
    panel.style.left=`${Math.max(8,Math.min(root.right+box.width<win.innerWidth-8?root.right+1:root.left-box.width-1,win.innerWidth-box.width-8))}px`;
    panel.style.top=`${Math.max(8,Math.min(a.top,win.innerHeight-box.height-8))}px`;
  };
  const openSubmenu=(button:HTMLButtonElement,keyboard=false)=>{if(busy()||!current())return;closeSubmenus();const panel=submenus.get(button)!;panel.hidden=false;button.setAttribute("aria-expanded","true");position(button,panel);if(keyboard)focus(enabled(panel)[0]);};
  for(const [button]of submenus){button.onclick=()=>openSubmenu(button,true);button.onpointerenter=e=>{if(e.pointerType!=="touch")openSubmenu(button);};}
  popup.addEventListener("scroll",()=>{for(const [button,panel]of submenus)if(!panel.hidden)position(button,panel);},{passive:true});
  const open=(x:number,y:number)=>{
    if(busy()||editor.selection.focus.kind!=="cell")return;
    for(const menu of doc.querySelectorAll<HTMLDetailsElement>("#main-menu details[open], #table-tools"))menu.open=false;
    captured=editor.capture();sync();popup.hidden=false;popup.style.left=popup.style.top="8px";
    const box=popup.getBoundingClientRect();popup.style.left=`${Math.max(8,Math.min(x,win.innerWidth-box.width-8))}px`;popup.style.top=`${Math.max(8,Math.min(y,win.innerHeight-box.height-8))}px`;
    doc.dispatchEvent(new Event("rhwp:table-context"));focus(enabled(popup)[0]);
  };
  const openKeyboard=()=>{
    if(busy()||editor.selection.focus.kind!=="cell")return;
    try{const rect=editor.adapter.rect(editor.selection.focus),page=pages.querySelector<HTMLElement>(`[data-page="${rect.pageIndex}"]`);if(!page)return;const box=page.getBoundingClientRect(),scale=pageScale(page);open(box.left+rect.x*scale,box.top+(rect.y+rect.height)*scale);}catch(error){close(true);feedback(String(error));}
  };
  const pointer=(e:PointerEvent)=>{if(e.button===2){e.preventDefault();e.stopPropagation();}};
  const context=(e:MouseEvent)=>{
    if(busy()){e.preventDefault();return;}
    try{
      const page=(e.target as Element).closest<HTMLElement>(".page");if(!page)return;
      const point=pagePoint(page,e.clientX,e.clientY),pageIndex=Number(page.dataset.page),hit=editor.adapter.hit(pageIndex,point.x,point.y);
      if(hit.kind!=="cell"||!editor.adapter.cells(hit).some(b=>b.cellIdx===hit.cell&&b.pageIndex===pageIndex&&point.x>=b.x&&point.x<=b.x+b.w&&point.y>=b.y&&point.y<=b.y+b.h))return;
      e.preventDefault();e.stopImmediatePropagation();if(!keepTableContextSelection(editor.selection,hit,editor.cells().map(c=>c.cellIdx)))select(hit);open(e.clientX,e.clientY);
    }catch(error){e.preventDefault();close();feedback(String(error));}
  };
  const key=(e:KeyboardEvent)=>{
    if(e.target===input&&tableContextKey(e)&&editor.selection.focus.kind==="cell"){e.preventDefault();e.stopImmediatePropagation();if(!busy())openKeyboard();return;}
    if(popup.hidden||!popup.contains(e.target as Node))return;
    if(e.repeat&&["Enter"," "].includes(e.key)||e.isComposing||e.keyCode===229){e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.ctrlKey||e.metaKey||e.altKey){e.stopImmediatePropagation();return;}
    const target=e.target as HTMLButtonElement,menu=target.closest<HTMLElement>('[role="menu"]')??popup;
    if(["ArrowDown","ArrowUp","Home","End","ArrowRight","ArrowLeft","Escape","Tab"].includes(e.key)){
      e.preventDefault();e.stopImmediatePropagation();
      if(e.key==="Tab"){close(true);return;}
      if(["ArrowLeft","Escape"].includes(e.key)){
        const open=[...submenus].find(([,panel])=>!panel.hidden);
        if(open){closeSubmenus();focus(open[0]);}else if(e.key==="Escape")close(true);return;
      }
      if(e.key==="ArrowRight"){if(submenus.has(target))openSubmenu(target,true);return;}
      const list=enabled(menu),at=list.indexOf(target),n=e.key==="Home"?0:e.key==="End"?list.length-1:(at+(e.key==="ArrowUp"?-1:1)+list.length)%list.length;focus(list[n]);
    }else if(e.key!=="Enter"&&e.key!==" "){e.preventDefault();e.stopImmediatePropagation();}
  };
  const doubleClick = (e: MouseEvent) => {
    const page = (e.target as Element).closest<HTMLElement>(".page");
    if (!page || !pages.contains(page) || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || busy()) return;
    try {
      const xy = pagePoint(page, e.clientX, e.clientY), index = Number(page.dataset.page);
      // An image/shape inside this cell is not the cell background. Its exact
      // owner handler opens properties, or preserves an unsupported target.
      // Never fall back to editing the enclosing cell's properties.
      if((editor.adapter.call("getPageControlLayout",index).controls??[]).some((c:any)=>c.type!=="table"&&
        [c.x,c.y,c.w,c.h].every(Number.isFinite)&&xy.x>=c.x&&xy.x<=c.x+c.w&&xy.y>=c.y&&xy.y<=c.y+c.h))return;
      // Text double clicks keep their current text/cell editing route. Only
      // table lines or cell background are an object-properties entrance.
      if (editor.adapter.runs(index).some(r => r.text.trim() && xy.x >= r.x && xy.x < r.x+r.w && xy.y >= r.y && xy.y < r.y+r.h)) return;
      const hit = editor.adapter.hit(index, xy.x, xy.y);
      if (hit.kind !== "cell" || !editor.adapter.cells(hit).some(b => b.pageIndex === index && b.cellIdx === hit.cell && xy.x >= b.x && xy.x <= b.x+b.w && xy.y >= b.y && xy.y <= b.y+b.h)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      select(hit); close();
      cellCommand?.open("properties");
    } catch (error) { e.preventDefault(); feedback(String(error)); }
  };
  const disposeLifetime=registerPopupLifetime(doc,{root:popup,close:()=>close(),focus:restoreFocus});
  const resized = () => close();
  doc.addEventListener("keydown", key, true);
  pages.addEventListener("pointerdown", pointer, true); pages.addEventListener("contextmenu", context);
  pages.addEventListener("dblclick", doubleClick);
  win.addEventListener("resize", resized);
  const opener = doc.createElement("button"); opener.type = "button"; opener.dataset.tableContextLaunch = "true"; opener.textContent = "셀 바로 가기 메뉴 · Shift+F10"; opener.onclick = openKeyboard;
  doc.querySelector("#table-tools .workspace-menu-panel")?.prepend(opener);
  sync();
  return { sync, openAt:open, dispose() { disposeLifetime(); close(); popup.remove(); opener.remove(); doc.removeEventListener("keydown", key, true); pages.removeEventListener("dblclick", doubleClick); pages.removeEventListener("pointerdown", pointer, true); pages.removeEventListener("contextmenu", context); win.removeEventListener("resize", resized); } };
}
