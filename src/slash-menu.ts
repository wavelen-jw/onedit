import { closeEditorDialog } from "./editor-popup-focus.js";
import { activeWorkset } from "./active-workset.js";
import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import type { SearchCommand } from "./command-search-catalog.js";
import { formatInputGuard, sameFormatTarget } from "./integration/a-format-input-guard.js";
import { assertSlashStart, refreshSlashCatalog, matchesSlash, slashRange, executeSlash, executeSlashBlock } from "./slash-commands.js";
import { slashInput } from "./slash-input.js";

/** Categorized presentation of existing supported commands; owner/atomic gates shared. */
export function mountSlashMenu(doc: Document, editor: Interaction, actions: SlashActions) {
  if (!activeWorkset(doc)) return createSlashMenu(doc,editor,actions);
  const life=new AbortController(), input=doc.getElementById("input")!;
  let current:ReturnType<typeof createSlashMenu>|undefined;
  const release=()=>{const old=current;current=undefined;old?.dispose();};
  const begin=(event:Event)=>{
    if(current||event.defaultPrevented||!event.cancelable||actions.busy()||doc.querySelector("dialog[open]"))return;
    try{assertSlashStart(editor);}catch{return;} // Leave the literal slash to the editor.
    current=createSlashMenu(doc,editor,actions,release);
    current.begin(event,true);
    if(current&&!current.open)release();
  };
  input.addEventListener("keydown",e=>{
    if(e.key!=="/"||e.ctrlKey||e.altKey||e.metaKey||e.repeat||e.isComposing||e.keyCode===229||e.getModifierState("AltGraph"))return;
    const pending=new Event("rhwp:editor-sequence-pending",{cancelable:true});
    if(input.dispatchEvent(pending))begin(e);
  },{capture:true,signal:life.signal});
  input.addEventListener("beforeinput",e=>{if(e.inputType==="insertText"&&e.data==="/"&&!e.isComposing)begin(e);},{capture:true,signal:life.signal});
  return {execute(_command:Command,_captured:ReturnType<Interaction["capture"]>){return false;},
    sync(){/* Live instance owns its subscription; no catalog before slash. */},
    dispose(){life.abort();release();}};
}
type SlashActions = {
  busy: () => boolean; changed: () => void; focus: () => void; refresh: () => void;
  reasons: (rows?: SearchCommand[]) => Map<string, string>;
  invoke: (row: SearchCommand, target: ReturnType<Interaction["capture"]>) => void;
};
function createSlashMenu(doc:Document,editor:Interaction,actions:SlashActions,release?:()=>void) {
  // Inline slash owns its preset rows; the global finder catalog has no consumer here.
  if(!activeWorkset(doc))refreshSlashCatalog();
  const dialog=doc.createElement("dialog"),form=doc.createElement("form");
  dialog.id="slash-menu";dialog.className="ui2-slash-menu ui2-slash-inline";dialog.setAttribute("aria-label","빠른 삽입");
  form.innerHTML='<label class="slash-query-label">/<input id="slash-query" type="search" autocomplete="off" placeholder="제목, 표, 가져오기 검색" aria-label="빠른 삽입 검색" role="combobox" aria-controls="slash-results" aria-expanded="true" aria-autocomplete="list"></label><p class="slash-preview" aria-hidden="true"></p><div id="slash-results" role="listbox" aria-label="빠른 삽입 명령"></div><output role="status"></output><footer><button type="button" data-slash-close>닫기 <kbd>Esc</kbd></button></footer>';
  form.dataset.ui2Search="";dialog.append(form);doc.body.append(dialog);
  const query=form.querySelector<HTMLInputElement>("input")!,list=form.querySelector<HTMLElement>("#slash-results")!,status=form.querySelector("output")!,preview=form.querySelector<HTMLElement>(".slash-preview")!,guard=formatInputGuard(form),input=doc.getElementById("input") as HTMLTextAreaElement,viewport=doc.getElementById("viewport")!;
  // The visible field mirrors a native draft on #input. Search and following
  // typing keep the very same focused textarea/IME context throughout.
  query.readOnly=true;query.tabIndex=-1;query.setAttribute('aria-hidden','true');query.onpointerdown=e=>e.preventDefault();
  query.parentElement!.onpointerdown=e=>e.preventDefault();query.parentElement!.onclick=e=>e.preventDefault();
  const life=new AbortController(),signal=life.signal;
  const preset=(id:string,icon:string,name:string,aliases:string,description:string,category="기본블록")=>({id,icon,name,aliases,description,category});
  const rows=[
    preset("text","T","텍스트","텍스트 text normal","일반 본문 서식을 적용합니다."),
    preset("literal-5","H1","제목","제목 heading title","가운데 정렬한 제목 서식을 적용합니다."),
    preset("literal-0","□","소제목","ㅁ 소제목 미음 square","□ 기호가 있는 소제목을 넣습니다."),
    preset("literal-1","○","본문1","○ ㅇ 본문1 이응 body","○ 기호가 있는 본문을 넣습니다."),
    preset("literal-2","-","본문2","- 본문2 hyphen dash","- 기호가 있는 본문을 넣습니다."),
    preset("literal-3","*","참고1","* 참고1 별표 reference","* 기호가 있는 참고 문단을 넣습니다."),
    preset("literal-4","※","참고2","※ 참고2 당구장 reference","※ 기호가 있는 참고 문단을 넣습니다."),
    preset("character-map","Ω","문자표","문자표 특수문자 기호 특수문자·기호 symbol symbols character map","특수문자를 고르는 창을 엽니다."),
    preset("table","▦","표","표 table","본문에 3줄 × 3칸 표를 넣습니다."),
    preset("inline-box","▭","글상자","글상자 상자 textbox box","본문에 한 칸짜리 글상자를 넣습니다."),
    preset("markdown-import","MD","Markdown 가져오기","Markdown 마크다운 가져오기 import md","Markdown을 새 문서로 가져옵니다.","가져오기"),
  ];
  const hotkeys:Record<string,string>={"literal-5":"#","literal-0":"a","literal-1":"d","literal-2":"-","literal-3":"*","literal-4":"%",table:"T","character-map":";","inline-box":"b"};
  const characterMap:SearchCommand={id:"character-map",label:"문자표",group:"입력",entrance:'[data-remaining-entry="character-map"]'};
  let running=false;
  let target:ReturnType<Interaction["capture"]>|undefined,active=0,choices=rows,access="",frame=0;
  const oldAria=new Map(['aria-label','aria-controls','aria-haspopup','aria-activedescendant','aria-autocomplete'].map(n=>[n,input.getAttribute(n)]));
  const restoreAria=()=>{for(const[n,v]of oldAria)if(v===null)input.removeAttribute(n);else input.setAttribute(n,v);};
  const current=()=>!!target&&access===`${editor.adapter.scope}:${editor.adapter.documentLocked}`&&sameFormatTarget(target,editor.capture());
  const close=(focus=true)=>{guard.close();closeEditorDialog(dialog, false);target=undefined;draft.close();restoreAria();if(focus&&doc.activeElement!==input)actions.focus();if(!running)release?.();};
  const show=()=>{
    // An inline suggestion list must not run dialog.show()'s focusing steps.
    // open is non-modal; existing dialog[open] admission remains intact.
    dialog.open=true;input.setAttribute('aria-label','빠른 삽입 검색');input.setAttribute('aria-controls','slash-results');input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-autocomplete','list');position();
  };
  const position=()=>{if(!dialog.open||!target)return;try{
    const r=editor.adapter.rect(target.selection.focus),svg=doc.querySelector<SVGSVGElement>(`#pages [data-page="${r.pageIndex}"]>svg`),matrix=svg?.getScreenCTM();if(!matrix)return;
    const point=new DOMPoint(r.x,r.y+r.height).matrixTransform(matrix),v=viewport.getBoundingClientRect(),win=doc.defaultView!;
    const left=Math.max(8,v.left),right=Math.min(win.innerWidth-8,v.right),top=point.y+4;
    dialog.style.width=`${Math.max(0,Math.min(300,right-left))}px`;dialog.style.left=`${Math.max(left,Math.min(point.x,right-dialog.getBoundingClientRect().width))}px`;dialog.style.top=`${top}px`;
    dialog.style.maxHeight=`${Math.max(0,Math.min(390,win.innerHeight-top-8))}px`;
    dialog.style.visibility=point.y<v.top||point.y>v.bottom?"hidden":"visible";
  }catch{close(false);}};
  const schedule=()=>{if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;position();});};
  const reason=(id:string)=>target&&editor.adapter.text(target.selection.focus)!==""&&!id.startsWith("literal-")&&id!=="text"?"기존 기본블록에는 서식만 다시 적용할 수 있습니다.":(id==="table"||id==="inline-box")&&target?.selection.focus.kind!=="body"?"새 표는 본문에서 만들 수 있습니다.":"";
  const options=()=>[...list.querySelectorAll<HTMLElement>('[role="option"]')];
  const mark=()=>{options().forEach((b,i)=>b.setAttribute("aria-selected",String(i===active)));const selected=options()[active];if(selected)input.setAttribute("aria-activedescendant",selected.id);else input.removeAttribute("aria-activedescendant");const row=choices[active];preview.textContent=row?(reason(row.id)||row.description):"";preview.hidden=!row;};
  const render=()=>{const normalized=query.value.trim().normalize("NFKC").toLowerCase(),exact=normalized?rows.filter(r=>r.aliases.split(/\s+/).some(word=>word.normalize("NFKC").toLowerCase()===normalized)):[];choices=exact.length?exact:rows.filter(r=>matchesSlash(r.aliases,query.value));active=Math.min(active,Math.max(0,choices.length-1));list.replaceChildren();
    const groups=new Map<string,HTMLElement>();
    for(const[r,i]of choices.map((r,i)=>[r,i] as const)){let group=groups.get(r.category);if(!group){group=doc.createElement("div");group.setAttribute("role","group");group.setAttribute("aria-label",r.category);const heading=doc.createElement("div");heading.className="slash-category";heading.textContent=r.category;heading.setAttribute("aria-hidden","true");group.append(heading);groups.set(r.category,group);list.append(group);}const b=doc.createElement("button"),icon=doc.createElement("span"),name=doc.createElement("span");b.type="button";b.id=`slash-result-${i}`;b.dataset.slashCommand=r.id;b.setAttribute("role","option");b.setAttribute("aria-disabled",String(!!reason(r.id)));b.tabIndex=-1;icon.className="slash-icon";icon.textContent=r.icon;icon.setAttribute("aria-hidden","true");name.textContent=r.name;b.append(icon,name);const key=hotkeys[r.id];if(key){const hint=doc.createElement('kbd');hint.className='slash-key';hint.textContent=key;b.append(hint);}b.title=r.description;b.setAttribute("aria-description",r.description);b.onpointerdown=e=>e.preventDefault();b.onclick=()=>{active=i;run();};group.append(b);}
    status.textContent=choices.length?"":"찾는 블록이 없습니다. “제목”이나 “표”로 검색하거나 Esc로 닫으세요.";mark();schedule();};
  async function run(){if(!draft.ready()||!guard.ready()||!current()||actions.busy())return;const row=choices[active];if(!row)return;running=true;
    try{const why=reason(row.id);if(why)throw Error(why);slashRange(editor,target!,"/"+query.value);
      if(row.id==="markdown-import"){
        const captured=target!;guard.consume();close(false);
        doc.dispatchEvent(new CustomEvent("rhwp:markdown-import",{detail:captured}));return;
      }
      if(row.id==="character-map"){
        const captured=target!,capturedAccess=access;
        // Like command search, release our dialog before refreshing the existing
        // entrance. The query stays UI-only; opening/cancelling adds no History.
        guard.consume();close(false);await Promise.resolve();if(signal.aborted)return;
        try{
          actions.refresh();
          if(actions.busy()||capturedAccess!==`${editor.adapter.scope}:${editor.adapter.documentLocked}`||!sameFormatTarget(captured,editor.capture()))throw Error("문서·선택이 바뀌었습니다. 다시 여세요.");
          const why=actions.reasons([characterMap]).get(characterMap.id);if(why)throw Error(why);
          actions.invoke(characterMap,captured);
          if(!doc.getElementById("remaining-character-map")?.hasAttribute("open"))throw Error("현재 문자표를 열 수 없습니다.");
        }catch(error){
          // Preserve the draft for retry; the usual current-target check still
          // rejects changes made while handing off to the existing entrance.
          target=captured;access=capturedAccess;if(!draft.open())throw error;guard.open();render();show();throw error;
        }
        return;
      }
      if(row.id.startsWith("literal-")||row.id==="text")executeSlashBlock(editor,target!,"/"+query.value,row.id);
      else if(row.id==="table"||row.id==="inline-box")executeSlash(editor,target!,"/"+query.value,{type:"insert-table",rows:row.id==="inline-box"?1:3,cols:row.id==="inline-box"?1:3,inline:true});
      // Text shares the explicit default preset with Markdown report import.
      guard.consume();close();actions.changed();
    }catch(e){status.textContent=String(e);}finally{running=false;if(!dialog.open)release?.();}}
  const begin=(ev:Event, admitted=false)=>{if(ev.defaultPrevented||!ev.cancelable||dialog.open||actions.busy()||doc.querySelector("dialog[open]"))return;
    try{if(!admitted)assertSlashStart(editor);if(!draft.open())return;target=editor.capture();access=`${editor.adapter.scope}:${editor.adapter.documentLocked}`;ev.preventDefault();query.value="";active=0;guard.open();render();show();}catch{draft.close();/* Ordinary slash in unsupported/nonempty owners. */}};
  if(!release)input.addEventListener("keydown",e=>{if(e.key!=="/"||e.ctrlKey||e.altKey||e.metaKey||e.repeat||e.isComposing||e.keyCode===229||e.getModifierState("AltGraph"))return;const pending=new Event("rhwp:editor-sequence-pending",{cancelable:true});if(!input.dispatchEvent(pending))return;begin(e);},{capture:true,signal});
  if(!release)input.addEventListener("beforeinput",e=>{if(e.inputType==="insertText"&&e.data==="/"&&!e.isComposing)begin(e);},{capture:true,signal});
  const draft=slashInput(input,{
    change:text=>{if(!dialog.open)return;if(!current()){close(false);return;}query.value=text;active=0;render();},
    blur:()=>{if(dialog.open)close(false);},
    commitSpace:()=>{if(dialog.open)void run();},
    key:e=>{
      if(!dialog.open)return;
      if(e.key==='Escape'){e.preventDefault();close();}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey)void run();}
      else if(!query.value&&!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&Object.values(hotkeys).includes(e.key)){e.preventDefault();active=choices.findIndex(r=>hotkeys[r.id]===e.key);if(active>=0)void run();}
      else if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+choices.length)%Math.max(1,choices.length);mark();options()[active]?.scrollIntoView({block:'nearest'});}
      else if(e.key==='Tab')close(false);
    },
  });
  form.onsubmit=e=>{e.preventDefault();run();};form.querySelector<HTMLButtonElement>("[data-slash-close]")!.onclick=()=>close();
  form.querySelector<HTMLButtonElement>('[data-slash-close]')!.onpointerdown=e=>e.preventDefault();
  form.addEventListener("keydown",e=>{e.stopPropagation();if(draft.composing()||e.isComposing||e.keyCode===229)return;
    if(e.key==="Escape"){e.preventDefault();close();}else if(e.key==="Enter"){e.preventDefault();if(!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey)run();}
  },{signal});
  dialog.addEventListener("cancel",e=>{e.preventDefault();if(!draft.composing())close();},{signal});
  doc.addEventListener("pointerdown",e=>{if(dialog.open&&!dialog.contains(e.target as Node)){if(draft.composing()){e.preventDefault();e.stopImmediatePropagation();return;}close(false);}},{capture:true,signal});
  doc.addEventListener("scroll",schedule,{capture:true,passive:true,signal});doc.defaultView?.addEventListener("resize",schedule,{signal});const size=new ResizeObserver(schedule);size.observe(viewport);
  const sync=()=>{if(dialog.open){if(!current())close(false);else schedule();}};
  if(release)doc.addEventListener("rhwp:editor-state",sync,{signal});
  return{begin,get open(){return dialog.open;},execute(_command:Command,_captured:ReturnType<Interaction["capture"]>){return false;},sync,dispose(){life.abort();guard.close();draft.dispose();restoreAria();size.disconnect();if(frame)cancelAnimationFrame(frame);dialog.remove();}};
}
