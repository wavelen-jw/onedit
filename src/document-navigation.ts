import type { Interaction } from "./interaction.js";
import { sameFormatTarget,formatInputGuard } from "./integration/a-format-input-guard.js";
import { TextSearch } from "./integration/a-search.js";


/** View/selection navigation only. Reuses existing page handlers and TextSearch. */
export function mountDocumentNavigation(doc:Document,editor:Interaction,options:{busy:()=>boolean;focus:()=>void;changed:()=>void;find:()=>void}) {
  const host=doc.querySelector<HTMLElement>(".layout")!,viewport=doc.getElementById("viewport")!,life=new AbortController(),signal=life.signal;
  const panel=doc.createElement("section");panel.id="document-navigation";panel.hidden=true;panel.setAttribute("aria-label","문서 탐색");
  const heading=doc.createElement("header"),title=doc.createElement("h2"),close=doc.createElement("button");title.textContent="문서 탐색";close.type="button";close.textContent="닫기";heading.append(title,close);panel.append(heading);
  const tabs=doc.createElement("div");tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","탐색 종류");panel.append(tabs);
  const bodies=new Map<string,HTMLElement>(),buttons=new Map<string,HTMLButtonElement>();
  for(const [id,name]of [["pages","쪽"],["search","검색"]]){const b=doc.createElement("button"),body=doc.createElement("div");b.type="button";b.textContent=name;b.id=`navigation-${id}-tab`;b.setAttribute("role","tab");body.id=`navigation-${id}`;body.setAttribute("role","tabpanel");body.setAttribute("aria-labelledby",b.id);b.setAttribute("aria-controls",body.id);b.onclick=()=>activate(id);tabs.append(b);panel.append(body);bodies.set(id,body);buttons.set(id,b);}
  const pages=doc.createElement("ol");pages.setAttribute("aria-label","문서 쪽 목록");bodies.get("pages")!.append(pages);
  const form=doc.createElement("form");form.noValidate=true;form.dataset.ui2Draft="";
  const query=doc.createElement("input");query.name="navigationQuery";query.autocomplete="off";
  const caseMatch=doc.createElement("input"),cells=doc.createElement("input");caseMatch.type=cells.type="checkbox";cells.checked=true;
  for(const [text,input]of [["찾을 내용",query],["대소문자 구분",caseMatch],["일반 표 셀 포함",cells]] as const){const l=doc.createElement("label");l.append(text,input);form.append(l);}
  const previous=doc.createElement("button"),next=doc.createElement("button"),detail=doc.createElement("button"),note=doc.createElement("output");
  previous.type=detail.type="button";next.type="submit";previous.textContent="이전";next.textContent="다음 찾기";detail.textContent="찾기·바꾸기 자세히…";note.setAttribute("aria-live","polite");form.append(previous,next,detail,note);bodies.get("search")!.append(form);
  const help=doc.createElement("p");help.textContent="본문·일반 셀 검색. 중첩·머리말은 기존 미지원 범위입니다. Esc/닫기는 원래 선택·스크롤로 돌아갑니다.";bodies.get("search")!.append(help);
  host.insertBefore(panel,viewport);
  const toggle=doc.createElement("button");toggle.type="button";toggle.id="navigation-toggle";toggle.textContent="탐색";toggle.setAttribute("aria-controls",panel.id);doc.getElementById("properties-toggle")!.before(toggle);
  const guard=formatInputGuard(form),search=new TextSearch(editor);
  let frame=0;
  function reveal(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;if(panel.hidden||doc.body.dataset.editorLayout==="wide")return;const v=viewport.getBoundingClientRect(),b=panel.getBoundingClientRect(),r=[...doc.querySelectorAll<HTMLElement>("#pages .overlay .highlight,#pages .overlay .caret")].map(n=>n.getBoundingClientRect()).filter(r=>r.bottom>v.top&&r.top<v.bottom).at(-1);if(!r)return;const left=b.right+12,right=v.right-12;if(r.width<=right-left&&r.left<left)viewport.scrollLeft-=left-r.left;else if(r.right>right)viewport.scrollLeft+=r.right-right;});}
  let active="pages",origin:ReturnType<Interaction["capture"]>|undefined,owned:typeof origin,scroll:{left:number;top:number}|undefined,searchKey="",pageKey="";
  const allowed=()=>!options.busy()&&!doc.querySelector("dialog[open]");
  function hide(restore=true,focus=true){
    if(panel.hidden)return;if(frame)cancelAnimationFrame(frame);frame=0;panel.hidden=true;toggle.setAttribute("aria-expanded","false");guard.close();
    if(restore&&origin&&owned&&sameFormatTarget(owned,editor.capture())){editor.adapter.captureSelection(origin.selection);editor.selection=structuredClone(origin.selection);options.changed();if(scroll){viewport.scrollLeft=scroll.left;viewport.scrollTop=scroll.top;}}
    origin=owned=undefined;searchKey="";if(focus)options.focus();
  }
  function activate(id:string){
    active=id;for(const [key,body]of bodies){body.hidden=key!==id;const b=buttons.get(key)!;b.setAttribute("aria-selected",String(key===id));b.tabIndex=key===id?0:-1;}
    if(id==="search"&&!panel.hidden){guard.open();query.focus({preventScroll:true});}sync();
  }
  toggle.onclick=()=>{
    if(!allowed())return;if(!panel.hidden){hide();return;}
    // Explicitly leaving properties follows its original cancel/close contract.
    doc.getElementById("properties-close")?.click();
    origin=owned=editor.capture();scroll={left:viewport.scrollLeft,top:viewport.scrollTop};
    panel.hidden=false;toggle.setAttribute("aria-expanded","true");searchKey="";pageKey="";note.textContent="";guard.open();activate(active);reveal();
    (active==="search"?query:buttons.get(active)!).focus({preventScroll:true});
  };
  close.onclick=()=>{if(allowed())hide();};
  const current=()=>!!origin&&origin.documentId===editor.adapter.documentId&&origin.revision===editor.adapter.revision;
  function find(backward=false){
    if(!allowed()||!guard.ready()||!current())return;
    try{
      if(!owned||!sameFormatTarget(owned,editor.capture()))throw Error("선택이 바뀌었습니다. 탐색을 닫고 다시 여세요.");
      const key=JSON.stringify([query.value,caseMatch.checked,cells.checked]);
      if(key!==searchKey){search.setScope("document");search.refresh(query.value,caseMatch.checked,cells.checked);searchKey=key;}
      note.textContent=search.move(backward);owned=editor.capture();options.changed();doc.dispatchEvent(new CustomEvent("rhwp:reveal-selection"));reveal();query.focus({preventScroll:true});
    }catch(error){note.textContent=String(error);}
  }
  form.onsubmit=e=>{e.preventDefault();find();};previous.onclick=()=>find(true);
  detail.onclick=()=>{if(!allowed())return;hide(false,false);options.find();};
  function sync(){
    toggle.disabled=!allowed();toggle.title=toggle.disabled?"입력·저장·대화상자를 먼저 마치세요.":"쪽/검색 탐색 · 속성 창을 닫고 열기 · Esc/닫기로 원위치";
    if(panel.hidden)return;
    if(!current()){hide(false,false);return;}
    const count=editor.adapter.pageCount,key=`${origin!.documentId}:${origin!.revision}:${count}`;
    if(pageKey!==key){pageKey=key;pages.replaceChildren();for(let n=1;n<=count;n++){const li=doc.createElement("li"),b=doc.createElement("button");b.type="button";b.textContent=`${n}쪽`;b.dataset.navigationPage=String(n);b.onclick=()=>{
      if(!allowed()||!current())return;const field=doc.querySelector<HTMLInputElement>('[aria-label="이동할 쪽 번호"]'),go=doc.querySelector<HTMLButtonElement>('[data-view-action="go"]');if(!field||!go||field.disabled||go.disabled)return;
      field.value=String(n);go.click();owned=editor.capture();sync();
    };li.append(b);pages.append(li);}}
    const page=doc.getElementById("view-status")?.dataset.viewPage;
    for(const b of pages.querySelectorAll<HTMLButtonElement>("button")){b.disabled=!allowed();b.setAttribute("aria-current",String(b.dataset.navigationPage===page));}
    for(const c of [query,caseMatch,cells,previous,next,detail,close])c.disabled=!allowed();
  }
  panel.addEventListener("keydown",e=>{
    if(e.isComposing||e.keyCode===229)return;
    if(!e.ctrlKey&&!e.altKey&&!e.metaKey)e.stopPropagation();
    if(e.ctrlKey||e.altKey||e.metaKey)return;
    if(e.key==="Escape"){e.preventDefault();if(allowed())hide();return;}
    if(e.key==="Enter"&&e.target===query){e.preventDefault();if(!e.repeat)form.requestSubmit();return;}
    const tab=[...buttons.values()].indexOf(e.target as HTMLButtonElement);
    if(tab>=0&&["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const list=[...buttons.keys()],at=e.key==="Home"?0:e.key==="End"?list.length-1:(tab+(e.key==="ArrowRight"?1:-1)+list.length)%list.length;activate(list[at]);buttons.get(list[at])!.focus();}
    if(active==="pages"&&["ArrowDown","ArrowUp","Home","End"].includes(e.key)){const list=[...pages.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")],at=list.indexOf(doc.activeElement as HTMLButtonElement);if(at>=0){e.preventDefault();list[e.key==="Home"?0:e.key==="End"?list.length-1:Math.max(0,Math.min(list.length-1,at+(e.key==="ArrowDown"?1:-1)))]?.focus();}}
  },{signal});
  doc.addEventListener("pointerdown",e=>{if(panel.hidden||!(e.target instanceof Node)||panel.contains(e.target)||toggle.contains(e.target))return;hide(false,false);},{capture:true,signal});
  // Properties may also be opened through an existing menu/keyboard entrance.
  const observer=new MutationObserver(()=>{if(!doc.getElementById("selection-properties")!.hidden)hide(false,false);sync();});
  observer.observe(doc.getElementById("selection-properties")!,{attributes:true,attributeFilter:["hidden"]});
  const viewState=doc.getElementById("view-status");if(viewState)observer.observe(viewState,{attributes:true,attributeFilter:["data-view-page","data-view-pages","data-view-busy"]});
  activate(active);
  const resize=new ResizeObserver(()=>{if(!panel.hidden)reveal();});resize.observe(host);
  return{sync,dispose(){if(frame)cancelAnimationFrame(frame);resize.disconnect();life.abort();observer.disconnect();guard.close();panel.remove();toggle.remove();}};
}
