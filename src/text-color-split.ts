import { editorFeedbackText } from "./editor-feedback-text.js";
import { dismissPaletteOnEscape, fitPaletteAxis, paletteGridIndex } from "./palette-navigation.js";
import type { Interaction } from "./interaction.js";
import type { FormatState } from "./formatting.js";
import { toCoreCharacter } from "./formatting.js";
import { formatValueState } from "./format-value-state.js";
import { sameFormatTarget, formatInputGuard } from "./integration/a-format-input-guard.js";

// One RGB palette trigger; the actual color is applied only from the palette.
export function mountTextColorSplit(doc:Document, editor:Interaction, hex:HTMLInputElement, options:{
  busy:()=>boolean; readBusy:()=>boolean; focus:()=>void;
  idPrefix?:string;
  apply:(props:ReturnType<typeof toCoreCharacter>,target:ReturnType<Interaction["capture"]>)=>void;
}) {
  const life=new AbortController(),signal=life.signal,prefix=options.idPrefix??"text-color";
  const row=doc.createElement("span"),trigger=doc.createElement("button"),popup=doc.createElement("div");
  row.className="text-color-split";row.id=prefix+"-split";row.setAttribute("role","group");row.setAttribute("aria-label","글자색");
  trigger.type="button";trigger.id=prefix+"-apply";trigger.className="text-color-apply";trigger.textContent="A";
  trigger.dataset.uiRead="";trigger.setAttribute("aria-haspopup","dialog");trigger.setAttribute("aria-expanded","false");trigger.setAttribute("aria-controls",prefix+"-palette");
  popup.id=prefix+"-palette";popup.className="text-color-popup";popup.hidden=true;popup.dataset.uiRead="";popup.dataset.ui2Draft="";popup.setAttribute("role","dialog");popup.setAttribute("aria-label","글자색 팔레트");
  const status=doc.createElement("output");status.setAttribute("role","status");
  const guard=formatInputGuard(popup);let target:ReturnType<Interaction["capture"]>|undefined,state:FormatState={},reason="",recent:string[]=[];
  const valid=(s:unknown):s is string=>typeof s==="string"&&/^#[\da-f]{6}$/i.test(s);
  const current=()=>formatValueState(state,"textColor");
  const close=(restore=true)=>{popup.hidden=true;trigger.setAttribute("aria-expanded","false");guard.close();target=undefined;if(restore)trigger.focus({preventScroll:true});};
  function commit(value:string){
    if(!guard.ready()||options.busy())return;
    try{
      if(reason)throw Error(reason);
      if(!valid(value))throw Error("글자색은 #RRGGBB로 입력하세요.");
      if(!target||!sameFormatTarget(target,editor.capture()))throw Error("문서·선택이 바뀌었습니다. 팔레트를 다시 여세요.");
      const next=value.toLowerCase();
      if(current()!=="common"||String(state.textColor).toLowerCase()!==next)
        options.apply(toCoreCharacter({textColor:next}),target);
      recent=[next,...recent.filter(c=>c!==next)].slice(0,10);project();
      guard.consume();close(false);options.focus();
    }catch(error){status.textContent=editorFeedbackText(error);}
  }
  const button=(text:string)=>{const b=doc.createElement("button");b.type="button";b.textContent=text;return b;};
  const automatic=button("검정");automatic.dataset.color="#000000";automatic.title="검정";automatic.onclick=()=>commit("#000000");popup.append(automatic);
  const bases=["#ffffff","#000000","#e7e6e6","#44546a","#4472c4","#ed7d31","#a5a5a5","#ffc000","#5b9bd5","#70ad47"];
  const shades=(color:string,factor:number)=>"#"+[1,3,5].map(i=>{const v=parseInt(color.slice(i,i+2),16);return Math.round(factor>=0?v+(255-v)*factor:v*(1+factor)).toString(16).padStart(2,"0");}).join("");
  const toneColors=[...bases,...[.8,.6,.4,-.25,-.5].flatMap(f=>bases.map(c=>shades(c,f)))];
  const standard=["#c00000","#ff0000","#ffc000","#ffff00","#92d050","#00b050","#00b0f0","#0070c0","#002060","#7030a0"];
  const grids:HTMLElement[]=[];
  function grid(label:string,colors:string[],id?:string){
    const heading=doc.createElement("strong"),g=doc.createElement("div");heading.textContent=label;g.className="text-color-grid";g.setAttribute("role","listbox");g.setAttribute("aria-label",label);if(id)g.id=id;
    for(const c of colors){const b=button("");b.dataset.color=c;b.style.backgroundColor=c;b.title=c;b.setAttribute("role","option");b.setAttribute("aria-label",c);b.tabIndex=-1;b.onclick=()=>commit(c);g.append(b);}
    popup.append(heading,g);grids.push(g);return g;
  }
  grid("색상 계열·명암 (고정 RGB · 테마 연동 없음)",toneColors);
  grid("표준색",standard);const recents=grid("최근 사용한 색",[],prefix+"-recents");
  const custom=doc.createElement("label"),choose=button("다른 색 적용"),cancel=button("취소");custom.textContent="다른 색 ";hex.removeAttribute("list");hex.setAttribute("aria-label","다른 글자색 #RRGGBB");hex.maxLength=7;hex.placeholder="#RRGGBB";custom.append(hex);choose.id=prefix+"-custom";choose.onclick=()=>commit(hex.value);cancel.onclick=()=>{close(false);options.focus();};popup.append(custom,choose,cancel,status);row.append(trigger,popup);
  const focusColor=(b:HTMLElement)=>{for(const g of grids)for(const n of g.querySelectorAll<HTMLElement>("button"))n.tabIndex=n===b?0:-1;b.focus({preventScroll:true});b.scrollIntoView({block:"nearest"});};
  popup.addEventListener("keydown",e=>{
    if(e.isComposing||e.keyCode===229||e.altKey||e.ctrlKey||e.metaKey)return;
    if(dismissPaletteOnEscape(e, close))return;
    if(e.key==="Enter"&&e.target===hex){e.preventDefault();e.stopPropagation();if(!e.repeat)commit(hex.value);return;}
    const b=(e.target as Element).closest<HTMLElement>("[role=option]"),g=b?.parentElement;
    if(!b||!g)return;
    const items=[...g.querySelectorAll<HTMLElement>("button")];
    const next=paletteGridIndex(e.key,items.indexOf(b),items.length,10);
    if(next===undefined)return;
    e.preventDefault();e.stopPropagation();focusColor(items[next]);
  });
  function fit(){
    if(popup.hidden)return;
    const anchor=trigger.getBoundingClientRect(), host=doc.body.getBoundingClientRect(), viewport=doc.defaultView!;
    const right=Math.min(host.right,viewport.innerWidth)-8;
    const width=Math.max(0,Math.min(300,right-8));
    popup.style.width=`${width}px`;
    popup.style.maxHeight=`${Math.max(0,viewport.innerHeight-16)}px`;
    popup.style.left=`${fitPaletteAxis(anchor.left,8,right,width)}px`;
    popup.style.top=`${fitPaletteAxis(anchor.bottom+5,8,viewport.innerHeight-8,popup.getBoundingClientRect().height)}px`;
  }
  function open(){
    if(options.readBusy()||reason)return;
    target=editor.capture();status.textContent="";popup.hidden=false;trigger.setAttribute("aria-expanded","true");hex.value=valid(state.textColor)?state.textColor:"";
    recents.replaceChildren(...recent.map(c=>{const b=button("");b.dataset.color=c;b.style.backgroundColor=c;b.title=c;b.setAttribute("role","option");b.setAttribute("aria-label",c);b.onclick=()=>commit(c);return b;}));
    for(const g of grids)for(const b of g.querySelectorAll<HTMLElement>("button"))b.setAttribute("aria-selected",String(current()==="common"&&b.dataset.color===String(state.textColor).toLowerCase()));
    guard.open();fit();focusColor(popup.querySelector<HTMLElement>('[aria-selected="true"]')??popup.querySelector<HTMLElement>('[role=option]')!);
  }
  trigger.onclick=()=>popup.hidden?open():close();trigger.onkeydown=e=>{if(e.key==="ArrowDown"&&!e.isComposing&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();open();}};
  doc.addEventListener("pointerdown",e=>{if(!popup.hidden&&!row.contains(e.target as Node))close(false);},{capture:true,signal});
  row.addEventListener("focusout",e=>{if(row.closest("[data-ui-relocating]"))return;if(e.relatedTarget instanceof Node&&!row.contains(e.relatedTarget))close(false);});
  doc.defaultView!.addEventListener("resize",fit,{signal});doc.addEventListener("rhwp:chrome-layout",fit,{signal});
  function project(){
    const kind=current();row.dataset.valueState=kind;trigger.dataset.valueState=kind;
    trigger.style.borderBottomColor=kind==="common"&&valid(state.textColor)?state.textColor:"transparent";
    trigger.textContent=kind==="mixed"?"A ±":kind==="unavailable"?"A ?":"A";
    trigger.setAttribute("aria-label",`글자색 팔레트 · ${kind==="mixed"?"혼합":kind==="unavailable"?"미조회":state.textColor}`);
    trigger.title=reason||trigger.getAttribute("aria-label")!;
    trigger.disabled=options.readBusy()||!!reason;fit();
  }
  return{row,sync(next:FormatState,why=""){state=next;reason=why;project();},close,dispose(){close(false);life.abort();}};
}
