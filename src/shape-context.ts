import {captionTarget} from './captions.js';
import {registerPopupLifetime} from './menu-lifetime.js';
import {prepareControlKey} from './control-shortcuts.js';
import type {Interaction} from "./interaction.js";
import {shapeCatalog} from "./shapes.js";
import {clipboardSupport} from "./clipboard-ui-state.js";
import {sameFormatTarget} from "./integration/a-format-input-guard.js";
import {pageScale} from "./integration/a-view-menu.js";
import {tableContextKey} from "./table-context.js";
import {bodyContextAppShortcut} from "./body-context.js";
import {objectContextItems,renderObjectContextItems} from "./object-context-menu.js";
import {controlPoint,onControlOutline,controlClientPoint,type ControlPointer} from "./object-hit-point.js";

// Only exact existing body plain textboxes with a validated Core layout box.
// Exact supported-body hits share the existing object selection/property target.
// No drag/resize or cell/group addressing policy is added.
export function mountShapeContext(doc:Document,editor:Interaction,actions:{busy:()=>boolean;changed:()=>void;focus:()=>void;properties:()=>void;error:(e:unknown)=>void}) {
  const win=doc.defaultView!,pages=doc.getElementById("pages")!,input=doc.getElementById("input")!;
  const popup=doc.createElement("div");popup.id="shape-context-menu";popup.hidden=true;popup.setAttribute("role","menu");popup.setAttribute("aria-label","글상자 바로 가기 메뉴");doc.body.append(popup);
  let captured:ReturnType<Interaction["capture"]>|undefined;
  let lastPointer:ControlPointer|undefined;
  function selected(){const s=editor.selection;if(s.kind!=="object"||s.focus.kind!=="body")return;return shapeCatalog(editor.adapter).find(r=>r.name==="글상자"&&r.target.sec===s.focus.sec&&r.target.para===s.focus.para&&r.target.control===s.control);}
  const close=(focus=false)=>{popup.hidden=true;captured=undefined;if(focus)actions.focus();};
  const valid=()=>!!captured&&sameFormatTarget(captured,editor.capture())&&!!selected();
  const reason=(id:string)=>{
    if(id==='caption'){try{if(actions.busy())throw Error('현재 작업을 마친 후 사용하세요.');captionTarget(editor.adapter,editor.selection);return '';}catch(error){return String(error);}}
    if(['front','back','inFrontOfText','behindText'].includes(id)){try{if(actions.busy())throw Error('현재 작업을 마친 후 사용하세요.');prepareControlKey(editor.adapter,editor.selection,id as 'front'|'back'|'inFrontOfText'|'behindText');return '';}catch(error){return String(error);}}
    if(id==='line')return actions.busy()?'현재 작업을 마친 후 사용하세요.':selected()?.reason??'';
    if(actions.busy())return "입력·저장·열린 대화상자를 먼저 마치세요.";
    if(id==="copy"||id==="cut")return clipboardSupport(editor,id).reason??"";
    if(id==="properties")return selected()?.reason??"";
    return "이 글상자 명령의 UI 연결은 미지원입니다. 원본과 내부 내용을 유지합니다.";
  };
  const sync=()=>{if(!captured)return;try{if(!valid()||actions.busy()){close();return;}for(const [id,label]of objectContextItems("textbox")){const b=buttons.get(id)!,why=reason(id);b.disabled=!!why;b.title=why||label;b.setAttribute("aria-disabled",String(b.disabled));}}catch{close();}};
  const activate=(id:string)=>{try{if(!valid())throw Error("문서·선택한 글상자가 바뀌었습니다. 메뉴를 다시 여세요.");const why=reason(id);if(why)throw Error(why);const target=captured!;close();if(id==='caption')doc.dispatchEvent(new CustomEvent('rhwp:remaining-open',{detail:'caption'}));else if(['front','back','inFrontOfText','behindText'].includes(id)){editor.execute({type:'control-key',action:id as 'front'|'back'|'inFrontOfText'|'behindText'},target);actions.changed();actions.focus();}else if(id==='line'){actions.properties();doc.querySelector<HTMLButtonElement>('#shape-dialog [data-object-tab="2"]')?.click();}else if(id==="properties")actions.properties();else{actions.focus();input.dispatchEvent(new ClipboardEvent(id,{bubbles:true,cancelable:true}));}}catch(e){close(true);actions.error(e);}};
  const buttons=renderObjectContextItems(popup,"textbox",activate,"shapeContextAction");
  function boxes(page:number){
    const rows=shapeCatalog(editor.adapter).filter(r=>r.name==="글상자"),layout=editor.adapter.call("getPageControlLayout",page).controls??[];
    return layout.flatMap((b:any)=>{const r=rows.find(r=>r.target.sec===b.secIdx&&r.target.para===b.paraIdx&&r.target.control===b.controlIdx),p=r?.props;
      if(!p||b.type!=="shape"||JSON.stringify(b.stableIndex)!==JSON.stringify([b.secIdx,b.paraIdx,b.controlIdx])||b.cellPath?.length||b.path?.length||p.rotationAngle||p.horzFlip||p.vertFlip||![b.x,b.y,b.w,b.h].every(Number.isFinite)||b.w<=0||b.h<=0||Math.abs(b.w-p.width/75)>.11||Math.abs(b.h-p.height/75)>.11)return [];
      return [{...b,target:r!.target,page}];});
  }
  function open(x:number,y:number){captured=editor.capture();sync();if(!captured)return;for(const m of doc.querySelectorAll<HTMLDetailsElement>("#main-menu details[open]"))m.open=false;popup.hidden=false;popup.style.left=popup.style.top="8px";const b=popup.getBoundingClientRect();popup.style.left=`${Math.max(8,Math.min(x,win.innerWidth-b.width-8))}px`;popup.style.top=`${Math.max(8,Math.min(y,win.innerHeight-b.height-8))}px`;[...buttons.values()].find(b=>!b.disabled)?.focus();}
  const context=(e:MouseEvent,properties=false,selectionOnly=false)=>{const page=(e.target as Element).closest<HTMLElement>(".page");if(!page||!pages.contains(page))return;
    if(!page.querySelector(":scope > svg"))return;
    if(e.type==='pointerdown')lastPointer={page,documentId:editor.adapter.documentId,revision:editor.adapter.revision,x:e.clientX,y:e.clientY,time:e.timeStamp};
    try{const client=controlClientPoint(page,e,lastPointer,editor.adapter.documentId,editor.adapter.revision),xy=controlPoint(page,client.x,client.y),pageIndex=Number(page.dataset.page),inside=(b:any)=>xy.x>=b.x&&xy.x<=b.x+b.w&&xy.y>=b.y&&xy.y<=b.y+b.h,hit=boxes(pageIndex).filter((b:any)=>inside(b)||onControlOutline(page,b,client.x,client.y));if(hit.length!==1)return;const b=hit[0];
      const others=(editor.adapter.call("getPageControlLayout",pageIndex).controls??[]).filter((c:any)=>!(c.type==="shape"&&c.secIdx===b.secIdx&&c.paraIdx===b.paraIdx&&c.controlIdx===b.controlIdx));if(others.some(inside))return;
      e.preventDefault();e.stopImmediatePropagation();if(actions.busy())return;const t=b.target;editor.adapter.assertEditable({kind:"body",sec:t.sec,para:t.para,offset:0});
      const next={kind:"object"as const,focus:{kind:"body"as const,sec:t.sec,para:t.para,offset:0},control:t.control};if(JSON.stringify(next)!==JSON.stringify(editor.selection)){editor.selection=next;actions.changed();}if(selectionOnly)actions.focus();else if(properties){if(onControlOutline(page,b,client.x,client.y))actions.properties();else actions.focus();}else open(e.clientX,e.clientY);
    }catch(e2){e.preventDefault();e.stopImmediatePropagation();close();actions.error(e2);}};
  const pointer=(e:PointerEvent)=>{if(e.button===0&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey)context(e,false,true);};
  const doubleClick=(e:MouseEvent)=>{if(e.button===0&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey)context(e,true);};
  const key=(e:KeyboardEvent)=>{if(e.target===input&&tableContextKey(e)&&selected()){
    e.preventDefault();e.stopImmediatePropagation();if(actions.busy())return;try{const s=editor.selection;if(s.kind!=="object")return;const matches=[...pages.querySelectorAll<HTMLElement>(".page")].flatMap(p=>boxes(Number(p.dataset.page)).map((b:any)=>({p,b}))).filter(({b})=>b.target.sec===s.focus.sec&&b.target.para===s.focus.para&&b.target.control===s.control);if(matches.length!==1)throw Error("정확한 글상자의 메뉴 좌표를 확인하지 못했습니다. 기존 속성 목록을 사용하세요.");const {p,b}=matches[0],r=p.getBoundingClientRect(),scale=pageScale(p);open(r.left+b.x*scale,r.top+(b.y+b.h)*scale);}catch(e2){close(true);actions.error(e2);}return;}
    if(popup.hidden||!popup.contains(e.target as Node))return;e.stopImmediatePropagation();if(e.isComposing||e.keyCode===229||e.repeat){e.preventDefault();return;}if(e.key==="Escape"||e.key==="Tab"){e.preventDefault();close(true);return;}if(bodyContextAppShortcut(e)){e.preventDefault();return;}if(e.ctrlKey||e.altKey||e.metaKey)return;
    if(e.key.toLowerCase()==="p"){e.preventDefault();activate("properties");return;}const enabled=[...buttons.values()].filter(b=>!b.disabled),at=enabled.indexOf(doc.activeElement as HTMLButtonElement);if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){e.preventDefault();enabled[e.key==="Home"?0:e.key==="End"?enabled.length-1:(at+(e.key==="ArrowUp"?-1:1)+enabled.length)%enabled.length]?.focus();}else if(!["Enter"," "].includes(e.key))e.preventDefault();};
  const disposeLifetime=registerPopupLifetime(doc,{root:popup,close:()=>close(),focus:actions.focus}),relocated=()=>close();
  win.addEventListener("pointerdown",pointer,true);win.addEventListener("contextmenu",context,true);win.addEventListener("dblclick",doubleClick,true);win.addEventListener("keydown",key,true);win.addEventListener("resize",relocated);doc.getElementById("viewport")?.addEventListener("scroll",relocated);
  return {sync,dispose(){disposeLifetime();close();popup.remove();win.removeEventListener("pointerdown",pointer,true);win.removeEventListener("contextmenu",context,true);win.removeEventListener("dblclick",doubleClick,true);win.removeEventListener("keydown",key,true);win.removeEventListener("resize",relocated);doc.getElementById("viewport")?.removeEventListener("scroll",relocated);}};
}
