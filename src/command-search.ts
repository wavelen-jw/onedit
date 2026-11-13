import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import { activeWorkset } from "./active-workset.js";
import type { Interaction } from "./interaction.js";
import { sameFormatTarget, formatInputGuard } from "./integration/a-format-input-guard.js";
import { releaseSearchCatalog, searchCommands, matchesSearch, type SearchCommand } from "./command-search-catalog.js";
import { dialogShortcutPrefix } from "./browser-shortcut-scope.js";

/** Search is a view of the existing catalog, never a second document editor. */
export function mountCommandSearch(doc:Document,editor:Interaction,actions:{
  busy:()=>boolean; refresh:()=>void; focus:()=>void;
  reasons:()=>Map<string,string>;
  direct?: (row: SearchCommand, target: ReturnType<Interaction["capture"]>) => boolean;
  invoke:(row:SearchCommand,target:ReturnType<Interaction["capture"]>)=>void;
}){
  const life=new AbortController(),signal=life.signal;
  const button=doc.createElement("button");button.type="button";button.id="command-search-open";button.textContent="명령 찾기";button.title="기존 명령·동의어·현재 단축키 찾기";
  doc.getElementById("properties-toggle")!.before(button);
  const dialog=doc.createElement("dialog"),form=doc.createElement("form"),heading=doc.createElement("h2"),query=doc.createElement("input"),list=doc.createElement("div"),status=doc.createElement("output"),cancel=doc.createElement("button"),help=doc.createElement("p");
  dialog.id="command-search";dialog.className="ui2-command-search";dialog.setAttribute("aria-labelledby","command-search-title");heading.id="command-search-title";heading.textContent="명령 찾기";
  form.dataset.ui2Search="";form.noValidate=true;query.id="command-query";query.type="search";query.autocomplete="off";query.setAttribute("aria-label","명령·동의어 검색");query.placeholder="중앙 정렬, 셀 색, 사진…";query.setAttribute("role","combobox");query.setAttribute("aria-controls","command-results");query.setAttribute("aria-autocomplete","list");query.setAttribute("aria-expanded","true");
  list.id="command-results";list.setAttribute("role","listbox");list.setAttribute("aria-label","명령 검색 결과");status.setAttribute("role","status");cancel.type="button";cancel.textContent="취소";cancel.dataset.commandCancel="";form.append(heading,query,list,status,help,cancel);dialog.append(form);doc.body.append(dialog);
  const guard=formatInputGuard(form);let captured:ReturnType<Interaction["capture"]>|undefined,composing=false,running=false,active=0;
  let rows:{row:SearchCommand;reason:string;keys:string;recent:boolean}[]=[];const recent:string[]=[];let admission=new Map<string,string>();let access="";
  const accessKey=()=>`${editor.adapter.scope}:${editor.adapter.documentLocked}`;
  const current=()=>!!captured&&access===accessKey()&&sameFormatTarget(captured,editor.capture());
  const keyText=(row:SearchCommand)=>{const source=row.selector?doc.querySelector<HTMLElement>(row.selector):null;const keys=[...source?.querySelectorAll("kbd")??[]].map(n=>{const d=(n as HTMLElement).dataset;return d.browserShortcutScope?`${d.dialogShortcut?`${dialogShortcutPrefix} → ${d.dialogShortcut} · `:""}${d.nativeSequence} · 브라우저 제한`:n.textContent?.trim();}).filter(Boolean);return keys.join(" · ")||source?.getAttribute("aria-keyshortcuts")||"메뉴로 실행";};
  const mark=()=>{const options=[...list.querySelectorAll<HTMLElement>('[role=option]')];options.forEach((n,i)=>n.setAttribute("aria-selected",String(i===active)));const selected=options[active];if(selected){query.setAttribute("aria-activedescendant",selected.id);selected.scrollIntoView({block:"nearest"});}else query.removeAttribute("aria-activedescendant");};
  const render=()=>{
    const stale=!current()?"문서·선택·편집권한이 바뀌었습니다. 취소 후 다시 여세요.":actions.busy()?"입력·문서 작업을 먼저 마치세요.":"";
    rows=[];
    const order=searchCommands.filter(r=>matchesSearch(r,query.value)).sort((a,b)=>{if(query.value)return 0;return (recent.includes(b.id)?1:0)-(recent.includes(a.id)?1:0)||recent.indexOf(a.id)-recent.indexOf(b.id);});
    for(const row of order)rows.push({row,reason:stale||row.unavailable||admission.get(row.id)||"",keys:keyText(row),recent:recent.includes(row.id)});
    list.replaceChildren();active=Math.min(active,Math.max(0,rows.length-1));
    rows.forEach((r,i)=>{const option=doc.createElement("button");option.type="button";option.id=`command-result-${i}`;option.tabIndex=-1;option.setAttribute("role","option");option.setAttribute("aria-disabled",String(!!r.reason));option.dataset.commandId=r.row.id;const label=doc.createElement("span"),meta=doc.createElement("small"),why=doc.createElement("small");label.textContent=r.row.label;meta.textContent=`${r.recent?"최근 · ":""}${r.row!.group} · ${r.keys}`;why.textContent=r.reason;option.append(label,meta,why);option.onpointerdown=e=>e.preventDefault();option.onclick=()=>{active=i;run();};list.append(option);});
    status.textContent=`${rows.length}개 · 현재 선택에 적용`;mark();
  };
  const disposeRows=()=>{if(activeWorkset(doc)){releaseSearchCatalog(doc);rows=[];admission.clear();list.replaceChildren();}};
  const close=(focus=true)=>{guard.close();captured=undefined;closeEditorDialog(dialog, focus);if(focus){disposeRows();actions.focus();}};
  async function run(){
    if(!guard.ready()||composing||running)return;
    const original=captured;running=true;
    try{
      if(!current())throw Error("문서·선택이 바뀌었습니다. 취소 후 다시 여세요.");if(actions.busy())throw Error("입력·문서 작업을 먼저 마치세요.");
      const choice=rows[active];if(!choice)return;if(choice.reason){status.textContent=choice.reason;return;}
      const target=captured!;guard.consume();close(false);
      if (actions.direct?.(choice.row, target)) {
        recent.splice(0,recent.length,choice.row.id,...recent.filter(id=>id!==choice.row.id).slice(0,2));
        disposeRows();return;
      }
      // Settings and some existing entrances publish disabled state from their
      // dialog MutationObserver. Let close finish, then validate fresh state in
      // this same user activation; never click a stale-disabled source button.
      await Promise.resolve();
      if(signal.aborted)return;
      actions.refresh();
      // Closing our modal restores the existing entrance's own admission.
      if(!sameFormatTarget(target,editor.capture()))throw Error("실행 직전 선택이 바뀌었습니다.");
      {const row=choice.row,why=row.unavailable||actions.reasons().get(row.id)||"";if(why)throw Error(why);actions.invoke(row,target);recent.splice(0,recent.length,row.id,...recent.filter(id=>id!==row.id).slice(0,2));}
      disposeRows();if(!doc.querySelector("dialog[open]"))actions.focus();
    }catch(error){captured=original;status.textContent=String(error);if(!dialog.open){if(activeWorkset(doc)){admission=actions.reasons();render();}showEditorDialog(dialog);query.focus();}guard.open();}
    finally{running=false;}
  }
  function show(){
    if(dialog.open||actions.busy()||doc.querySelector("dialog[open]"))return false;
    captured=editor.capture();access=accessKey();admission=actions.reasons();query.value="";active=0;composing=false;
    for(const n of doc.querySelectorAll("#main-menu details[open]"))n.removeAttribute("open");
    heading.textContent="명령 찾기";
    help.textContent="↑↓ 탐색 · Enter 실행 · Esc 취소 · 표시 키는 현재 메뉴 기준이며 브라우저 예약키 제한은 유지됩니다.";
    render();guard.open();showEditorDialog(dialog);query.focus();return true;
  }
  button.onclick=()=>show();query.addEventListener("input",()=>{active=0;render();},{signal});
  form.addEventListener("compositionstart",()=>{composing=true;},{signal});form.addEventListener("compositionend",()=>{composing=false;},{signal});
  form.onsubmit=e=>{e.preventDefault();run();};cancel.onclick=()=>close();
  form.addEventListener("keydown",e=>{
    if(composing||e.isComposing||e.keyCode===229)return;
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close();return;}
    if(e.key==="Enter"){e.preventDefault();e.stopPropagation();if(!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey)run();return;}
    if(e.target===query&&["ArrowDown","ArrowUp"].includes(e.key)){e.preventDefault();e.stopPropagation();active=(active+(e.key==="ArrowDown"?1:-1)+rows.length)%Math.max(rows.length,1);mark();return;}
    if(e.key==="Tab"){e.preventDefault();(doc.activeElement===query?cancel:query).focus();}e.stopPropagation();
  },{signal});
  dialog.addEventListener("cancel",e=>{e.preventDefault();if(!composing)close();},{signal});
  return{sync(){if(!activeWorkset(doc))button.disabled=actions.busy()||!!doc.querySelector("dialog[open]");if(dialog.open&&activeWorkset(doc)&&captured&&captured.documentId!==editor.adapter.documentId){close(false);disposeRows();return;}if(dialog.open&&!current()){status.textContent="문서·선택이 바뀌었습니다. 취소 후 다시 여세요.";for(const b of list.querySelectorAll("button"))b.setAttribute("aria-disabled","true");}},dispose(){life.abort();guard.close();disposeRows();button.remove();dialog.remove();}};
}
