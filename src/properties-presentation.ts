import {activeWorkset} from "./active-workset.js";
import {subscribeWhileOpen} from "./ui-demand-lifetime.js";
import { sidebarActionFor } from "./integration/a-view-menu.js";
import type { Interaction } from "./interaction.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";

// These are content budgets, not device breakpoints: 344px property form,
// 736px document workspace +32px separation; two 344px regions +32px for a sheet.
const panelWidth=344, wideMinimum=panelWidth+736+32, sheetMinimum=panelWidth*2+32;
type Mode="wide"|"overlay"|"sheet";

/** Presentation only. The original aside/forms/owner-bound drafts never move. */
export function mountPropertiesPresentation(doc:Document,editor:Interaction,panel:HTMLElement,
  toggle:HTMLButtonElement,close:HTMLButtonElement,options:{busy:()=>boolean;focus:()=>void;sync:()=>void}) {
  const host=panel.parentElement!,viewport=doc.getElementById("viewport")!,life=new AbortController(),signal=life.signal;
  const pin=doc.createElement("button");pin.type="button";pin.id="properties-pin";pin.textContent="고정";
  panel.querySelector(".ui2-panel-heading")!.append(pin);
  const hint=doc.createElement("p");hint.className="ui2-panel-presentation-note";hint.id="properties-presentation-note";
  panel.querySelector(".ui2-panel-heading")!.append(hint);
  const tools=doc.createElement("div");tools.id="adaptive-context-tools";if(activeWorkset(doc))tools.hidden=true;tools.setAttribute("role","group");tools.setAttribute("aria-label","현재 선택 빠른 조작");
  doc.getElementById("format-bar")!.append(tools);
  const nearby=doc.createElement("div");nearby.id="adaptive-selection-tools";nearby.setAttribute("role","group");nearby.setAttribute("aria-label","선택 대상 빠른 조작");host.append(nearby);
  const entries:{button:HTMLButtonElement;source:()=>HTMLButtonElement|null;when:()=>boolean}[]=[];
  const shape=()=>{const s=doc.getElementById("shape-properties") as HTMLButtonElement|null;return !!s&&!s.disabled;};
  const text=()=>editor.selection.kind==="text"&&!shape(),cell=()=>editor.selection.focus.kind==="cell"&&editor.selection.kind!=="object"&&!shape(),object=()=>editor.selection.kind==="object"||shape();
  function action(label:string,when:()=>boolean,run:()=>void,source:()=>HTMLButtonElement|null=()=>toggle){
    const b=doc.createElement("button");b.type="button";b.textContent=label;b.onclick=()=>{if(allowed()&&!b.disabled)run();};tools.append(b);entries.push({button:b,source,when});return b;
  }
  const showField=(selector:string)=>{
    if(!allowed())return;
    if(panel.hidden){if(!view()?.(true))return;sync();}
    const field=panel.querySelector<HTMLElement>(selector);if(!field)return;
    for(let n:HTMLElement|null=field.parentElement;n&&n!==panel;n=n.parentElement)if(n instanceof HTMLDetailsElement)n.open=true;
    field.focus({preventScroll:true});field.scrollIntoView({block:"nearest",inline:"nearest"});schedule();
  };


  action("개체 크기",object,()=>showField(shape()?'#ui2-shape-size input':'#ui2-picture-size input'));
  action("상세 속성…",object,()=>doc.getElementById(shape()?"shape-properties":"picture-properties")!.click(),()=>doc.getElementById(shape()?"shape-properties":"picture-properties") as HTMLButtonElement);
  // One explicitly named launcher near an object, with the same keyboard
  // reachable action in the fixed bar. It does not contain another edit form.
  const near=doc.createElement("button");near.type="button";near.textContent="개체 크기";nearby.append(near);near.onclick=()=>showField(shape()?'#ui2-shape-size input':'#ui2-picture-size input');
  let mode:Mode="wide",pinned=true,frame=0,disposed=false,lastOpen=false;
  let anchor:ReturnType<Interaction["capture"]>|undefined,scroll:{left:number;top:number}|undefined;
  const temporary=()=>mode!=="wide"||!pinned;
  const focusNode=()=>doc.getElementById("ui2-context-title")!;
  const allowed=()=>!options.busy()&&!doc.querySelector("dialog[open]");
  const view=()=>sidebarActionFor(doc);
  const cancelDrafts=()=>{for(const form of panel.querySelectorAll("form"))form.dispatchEvent(new Event("rhwp:cancel-panel-draft"));};
  function restore(){
    let current=false;try{current=!!anchor&&sameFormatTarget(anchor,editor.capture());}catch{/* No stale view restoration. */}
    options.focus();
    if(current&&scroll){viewport.scrollLeft=scroll.left;viewport.scrollTop=scroll.top;}
  }
  function hide(restoreView=true){
    if(!allowed()||panel.hidden)return;
    cancelDrafts();if(!view()?.(false))return;sync();if(restoreView)restore();
  }
  function expose(){
    if(panel.hidden||!temporary()||!anchor)return;
    let current=false;try{current=sameFormatTarget(anchor,editor.capture());}catch{}if(!current)return;
    // Only rendered selection geometry; no new Core query, scaling or layout policy.
    const candidates=[...doc.querySelectorAll<HTMLElement>("#pages .overlay .caret,#pages .overlay .highlight")];
    const target=candidates.find(n=>n.classList.contains("caret"))??candidates.at(-1);if(!target)return;
    const v=viewport.getBoundingClientRect(),box=panel.getBoundingClientRect();let r=target.getBoundingClientRect();
    if(r.right>v.right-12)viewport.scrollLeft+=r.right-(v.right-12);
    if(r.left<v.left+12)viewport.scrollLeft-=v.left+12-r.left;
    r=target.getBoundingClientRect();
    if(mode==="sheet"){
      if(r.bottom>box.top-12)viewport.scrollTop+=r.bottom-(box.top-12);
      if(r.top<v.top+8)viewport.scrollTop-=v.top+8-r.top;
    }else{
      const h=host.getBoundingClientRect(),leftSpace=r.left-h.left,rightSpace=h.right-r.right;
      panel.dataset.edge=rightSpace>=leftSpace?"right":"left";
      const b=panel.getBoundingClientRect();
      if(panel.dataset.edge==="right"&&r.right>b.left-12)viewport.scrollLeft+=r.right-b.left+12;
      if(panel.dataset.edge==="left"&&r.left<b.right+12)viewport.scrollLeft-=b.right+12-r.left;
    }
  }
  function syncTools(){
    for(const {button,when,source}of entries){button.hidden=!when();const s=source();button.disabled=!allowed()||!s||s.disabled;button.title=button.disabled?(s?.title||"현재 선택에서 사용할 수 없습니다."):"기존 명령 · 정확한 현재 선택에 적용";}
    tools.hidden=entries.every(e=>e.button.hidden);
    const mark=doc.querySelector<HTMLElement>("#pages .overlay .highlight");
    nearby.hidden=!object()||!mark||!panel.hidden||!allowed();
    if(!nearby.hidden&&mark){const b=mark.getBoundingClientRect(),h=host.getBoundingClientRect();nearby.style.left=`${Math.max(8,Math.min(h.width-122,b.left-h.left))}px`;nearby.style.top=`${Math.max(8,Math.min(h.height-40,b.top-h.top-36))}px`;}
  }
  function schedule(){if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;expose();});}
  function clearance(height=panel.getBoundingClientRect().height){
    doc.body.style.setProperty("--property-bottom-clearance",!panel.hidden&&temporary()&&mode==="sheet"?`${height+16}px`:"0px");
    doc.body.style.setProperty("--property-side-clearance",!panel.hidden&&temporary()&&mode!=="sheet"?`${panelWidth+16}px`:"0px");
  }
  function sync(){
    const open=!panel.hidden;
    panel.dataset.presentation=open?(temporary()?mode==="sheet"?"sheet":"overlay":"docked"):"closed";
    pin.hidden=mode!=="wide";pin.setAttribute("aria-pressed",String(pinned));pin.title=pinned?"문서 옆 고정 해제":"문서 옆에 고정";
    toggle.setAttribute("aria-expanded",String(open));close.disabled=pin.disabled=!allowed();
    hint.textContent=temporary()?"임시 속성 · Esc로 닫기 · 설정 전에는 문서가 바뀌지 않습니다.":"고정 속성 · 변경한 값만 설정합니다.";
    if(open&&!lastOpen){
      // The launcher may live in the toolbar overflow. Retire only that
      // popover before focusing the panel so it cannot cover its close/fields.
      const launcher=doc.activeElement?.closest<HTMLDetailsElement>(".ui2-toolbar-overflow");
      if(launcher?.open)launcher.open=false;
      anchor=editor.capture();scroll={left:viewport.scrollLeft,top:viewport.scrollTop};
      options.sync();focusNode().focus({preventScroll:true});panel.scrollTop=0;schedule();
    }
    if(!open&&lastOpen)cancelDrafts();
    lastOpen=open;clearance();syncTools();
  }
  toggle.onclick=()=>{if(!allowed())return;if(!panel.hidden)hide();else if(view()?.(true))sync();};
  close.onclick=()=>hide();
  // Pointer pinning is a presentation change, not a focus-out/cancel of a draft.
  pin.addEventListener("pointerdown",e=>e.preventDefault(),{signal});
  pin.onclick=()=>{if(!allowed())return;pinned=!pinned;sync();schedule();};
  panel.addEventListener("keydown",e=>{
    if(e.key!=="Escape"||e.isComposing||e.keyCode===229||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey)return;
    // The existing palette owns its first Escape and focus return.
    if(panel.querySelector('.object-color-popup:not([hidden])'))return;
    if(!allowed())return;e.preventDefault();e.stopPropagation();hide();
  },{capture:true,signal});
  // A focused heading/region is not the document input. Let the actual local
  // input, palette and disclosure handlers run, then keep plain navigation out
  // of the window's editing router (notably Tab -> document text insertion).
  panel.addEventListener("keydown",e=>{if(!e.ctrlKey&&!e.altKey&&!e.metaKey)e.stopPropagation();},{signal});
  doc.addEventListener("pointerdown",e=>{
    if(panel.hidden||!temporary()||!(e.target instanceof Node)||panel.contains(e.target)||toggle.contains(e.target))return;
    // Existing modal/palette menus must complete through their own admission.
    if(e.target instanceof Element&&e.target.closest("dialog,.object-color-popup"))return;
    hide(false);
  },{capture:true,signal});
  const mutation=new MutationObserver(sync);mutation.observe(panel,{attributes:true,attributeFilter:["hidden"]});
  const panelResize=new ResizeObserver(entries=>{
    for(const e of entries){
      if(e.target===panel)clearance(e.borderBoxSize[0]?.blockSize??panel.getBoundingClientRect().height);
      else panel.style.scrollPaddingTop=`${e.borderBoxSize[0]?.blockSize+8||80}px`;
    }schedule();
  });panelResize.observe(panel);panelResize.observe(panel.querySelector(".ui2-panel-heading")!);
  // Base selection publication still discovers an object selection. Only
  // displayed adaptive controls need repeated projection between those changes.
  const stopTools=activeWorkset(doc)?subscribeWhileOpen(doc,tools,syncTools,false):undefined;
  if(!activeWorkset(doc))doc.addEventListener("rhwp:editor-state",syncTools,{signal});
  viewport.addEventListener("scroll",()=>{nearby.hidden=true;},{passive:true,signal});
  viewport.addEventListener("pointerdown",()=>{nearby.hidden=true;},{signal});
  const resize=new ResizeObserver(entries=>{
    const width=entries[0].contentRect.width;const next:Mode=width>=wideMinimum?"wide":width>=sheetMinimum?"overlay":"sheet";
    // Observe the containing layout, never the panel-reduced viewport. Docking
    // therefore cannot feed its own width back into the responsive decision.
    doc.body.style.setProperty("--editor-width",`${width}px`);
    doc.body.style.setProperty("--ui2-chrome-height",`${host.offsetTop}px`);
    if(next!==mode){mode=next;doc.body.dataset.editorLayout=mode;sync();}
    doc.body.dataset.editorWidth=String(Math.round(width*100)/100);schedule();
  });
  doc.body.dataset.editorLayout=mode;panel.hidden=true;resize.observe(host);sync();
  return{sync:syncTools,dispose(){disposed=true;stopTools?.();life.abort();resize.disconnect();panelResize.disconnect();mutation.disconnect();if(frame)cancelAnimationFrame(frame);pin.remove();hint.remove();tools.remove();nearby.remove();delete doc.body.dataset.editorLayout;delete doc.body.dataset.editorWidth;}};
}
