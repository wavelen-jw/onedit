import {activeWorkset} from './active-workset.js';
import type {EditAction} from './integration/a-edit-menu.js';
import {screenSelection} from './screen-selection-projection.js';
import {mountSelectionFormatControls} from "./selection-format-controls.js";
import {samePosition,sameContainer,paraIndex,nested} from "./model.js";
import type { Interaction } from "./interaction.js";
import type { CatalogCommand } from "./integration/a-format-menu.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";

/** Selection-state presentation of the SAME fixed contextual command entrances. */
export function mountSelectionTools(doc:Document,editor:Interaction,options:{busy:()=>boolean;focus:()=>void;shapeTarget:()=>unknown;touchClipboard?:{state:()=>ReadonlyMap<EditAction,string>;invoke:(id:EditAction,target:ReturnType<Interaction["capture"]>)=>void};execute:(command:CatalogCommand,target:ReturnType<Interaction["capture"]>)=>void}) {
  const viewport=doc.getElementById("viewport")!,host=viewport.parentElement!,life=new AbortController(),signal=life.signal;
  const popup=doc.createElement("div");popup.id="selection-tools";popup.hidden=true;popup.setAttribute("role","toolbar");popup.setAttribute("aria-label","선택 서식 도구");host.append(popup);
  const toggle=doc.createElement("button");toggle.type="button";toggle.id="selection-tools-toggle";toggle.textContent="선택 도구";toggle.setAttribute("aria-pressed","true");toggle.title="마우스·키보드 글자 선택 뒤 작은 도구 표시/숨김";doc.querySelector("#view-menu [data-view-panel]")!.append(toggle);
  const chrome=doc.getElementById("format-bar")!;
  let chromeStyle:Map<string,string>|undefined;
  const releaseChrome=()=>{if(!chromeStyle)return;for(const [key,value]of chromeStyle){if(value)chrome.style.setProperty(key,value);else chrome.style.removeProperty(key);}chromeStyle=undefined;};
  const holdChrome=()=>{const height=chrome.getBoundingClientRect().height;chromeStyle=new Map(["height","min-height","max-height","overflow","box-sizing"].map(key=>[key,chrome.style.getPropertyValue(key)]));for(const key of ["height","min-height","max-height"])chrome.style.setProperty(key,`${height}px`);chrome.style.overflow="hidden";chrome.style.boxSizing="border-box";};
  const active=activeWorkset(doc);
  let capturedShape="null";const shapeKey=()=>JSON.stringify(options.shapeTarget()??null);
  let applying=false,composing=false,cancelled=false,observed="";
  let enabled=true,dragging=false,frame=0,forcePlacement=false,dismissed=false,captured:ReturnType<Interaction["capture"]>|undefined;
  let anchorLine="",anchorOrigin="",idle=0,pointerPending=false,documentId=editor.adapter.documentId;
  let pointerX=NaN,pointerY=NaN,pointerObserved="";
  let releasedPreview:{card:DOMRect;viewport:DOMRect}|undefined;
  const sameBox=(a:DOMRect,b:DOMRect)=>['left','top','width','height'].every(key=>{
    const k=key as 'left'|'top'|'width'|'height';
    return Math.abs(a[k]-b[k])<1;
  });
  const cancelIdle=()=>{if(idle)doc.defaultView!.clearTimeout(idle);idle=0;pointerPending=false;};
  doc.body.dataset.selectionToolsEnabled="true";
  const hide=()=>{cancelIdle();controls?.clear();popup.hidden=true;captured=undefined;releasedPreview=undefined;anchorLine=anchorOrigin="";delete popup.dataset.pointerSelecting;delete doc.body.dataset.selectionToolsActive;if(frame)cancelAnimationFrame(frame);frame=0;forcePlacement=false;};
  const valid=()=>{try{return !!captured&&sameFormatTarget(captured,editor.capture())&&capturedShape===shapeKey();}catch{return false;}};
  const blocked=()=>composing||editor.adapter.transientEdit||options.busy()||!!doc.querySelector("dialog[open]")||!doc.getElementById("selection-properties")!.hidden||!!doc.querySelector('#document-navigation:not([hidden])');
  function show(force=false){return editor.withViewQueries(owners=>{
    if(!enabled||dismissed||blocked())return;const shape=shapeKey();if(!["text","cells","table","object"].includes(editor.selection.kind)&&shape==="null"){hide();return;}
    releasedPreview=undefined;
    const text=editor.selection.kind==="text"&&shape==="null";
    if(text&&editor.selection.kind==="text"&&samePosition(editor.selection.anchor,editor.selection.focus)){hide();return;}
    if(dragging&&!text)return;
    const sources=[...doc.querySelectorAll<HTMLButtonElement>("#adaptive-context-tools > button")].filter(b=>!b.hidden&&!b.disabled&&b.getClientRects().length);
    if(!text&&!sources.length)return;
    const bounds=viewport.getBoundingClientRect(),v={left:Math.max(0,bounds.left),right:Math.min(doc.defaultView!.innerWidth,bounds.right),top:Math.max(0,bounds.top),bottom:Math.min(doc.defaultView!.innerHeight,bounds.bottom),get width(){return this.right-this.left;}},h=host.getBoundingClientRect();
    const marks=[...doc.querySelectorAll<HTMLElement>("#pages .overlay .highlight,#pages .picture-selection")].map(n=>n.getBoundingClientRect()).filter(r=>r.bottom>v.top&&r.top<v.bottom&&r.right>v.left&&r.left<v.right);
    const selectedGeometry=text?screenSelection(editor,doc.getElementById("pages")!,viewport,owners):undefined;
    if(text){
      // Highlight SVGs are one union per page. Anchor to the last actual text
      // band, not its potentially page-sized bounding rectangle.
      marks.length=0;
      for(const r of selectedGeometry!.rectangles){
        const svg=doc.querySelector<SVGSVGElement>(`#pages [data-page="${r.pageIndex}"]>svg`),matrix=svg?.getScreenCTM();if(!matrix)continue;
        const a=new DOMPoint(r.x,r.y).matrixTransform(matrix),b=new DOMPoint(r.x+r.width,r.y+r.height).matrixTransform(matrix);
        const box=new DOMRect(a.x,a.y,b.x-a.x,b.y-a.y);if(box.bottom>v.top&&box.top<v.bottom&&box.right>v.left&&box.left<v.right)marks.push(box);
      }
    }
    if(!marks.length){hide();return;}let mark=marks.at(-1)!,line="",origin="";
    if(text&&editor.selection.kind==='text'){
      // The active endpoint, including Core's wrap affinity, owns the screen
      // line. A paragraph may have many displayed lines; offsets alone do not
      // identify one. Never change a logical selection to position this UI.
      const r=editor.cursorRect(),svg=doc.querySelector<SVGSVGElement>(`#pages [data-page="${r.pageIndex}"]>svg`),matrix=svg?.getScreenCTM();
      if(!matrix)return;
      const a=new DOMPoint(r.x,r.y).matrixTransform(matrix),b=new DOMPoint(r.x,r.y+r.height).matrixTransform(matrix);
      const p=editor.selection.focus,{offset,...owner}=p,adapter=editor.adapter;
      // Native vertical navigation and the ordinary caret getter can differ
      // in their rectangle origin on the SAME line. Resolve the painted run
      // first, then reuse its existing line information, including the chosen
      // side of a shared wrap offset. No caret/selection coordinates change.
      const runs=(selectedGeometry?.runs(r.pageIndex)??adapter.runs(r.pageIndex)).filter(run=>{
        if(!run.text||run.secIdx!==p.sec||Math.min(run.y+run.h,r.y+r.height)<=Math.max(run.y,r.y))return false;
        if(p.kind==='body')return run.cellIdx===undefined&&run.paraIdx===p.para;
        if(run.cellIdx===undefined||run.parentParaIdx!==p.para)return false;
        const at=adapter.position(run,run.charStart);return sameContainer(at,p)&&paraIndex(at)===paraIndex(p);
      }).sort((a,b)=>Math.abs(a.y+a.h/2-r.y-r.height/2)-Math.abs(b.y+b.h/2-r.y-r.height/2));
      const painted=runs[0];let row:unknown=painted?.y??r.y;
      if(painted&&p.kind==='body'&&!adapter.hasBodyLayoutObject(p))row=['body',adapter.bodyLine(adapter.position(painted,painted.charStart)).lineIndex];
      else if(painted&&p.kind==='cell'&&!nested(p))row=['cell',adapter.call('getLineInfoInCell',p.sec,p.para,p.control,p.cell,p.cellPara,painted.charStart).lineIndex];
      line=JSON.stringify([adapter.documentId,owner,r.pageIndex,row]);
      origin=JSON.stringify([editor.adapter.documentId,editor.selection.anchor]);
      if(a.x>=v.left&&a.x<=v.right&&b.y>v.top&&a.y<v.bottom)mark=new DOMRect(a.x,a.y,0,b.y-a.y);
    }
    const old=popup.getBoundingClientRect(),keep=text&&!popup.hidden&&!force&&anchorLine===line&&anchorOrigin===origin&&
      old.left>=v.left&&old.right<=v.right&&old.top>=v.top&&old.bottom<=v.bottom&&
      // CSS rounds the initial 8px gap to layout units. Test actual visibility
      // and non-overlap here, not that serialized gap a second time.
      (old.top>=mark.bottom||old.bottom<=mark.top);
    captured=editor.capture();capturedShape=shape;
    // Preserve the mounted controls and draft focus across range changes.
    // Fresh captures still bind every command to the latest exact selection.
    if(!text||!popup.contains(character)){
      popup.replaceChildren();
      if(text)popup.append(character,paragraph);
      else for(const source of sources){const b=doc.createElement('button');b.type='button';b.textContent=source.textContent;b.title=source.title;b.onclick=()=>{if(!valid()||blocked()||source.disabled){hide();return;}hide();source.click();};popup.append(b);}
      const dismiss=doc.createElement('button');dismiss.type='button';dismiss.className='selection-dismiss';dismiss.textContent='×';dismiss.setAttribute('aria-label','선택 도구 닫기');dismiss.onclick=()=>{cancelled=true;dismissed=true;hide();options.focus();};popup.append(dismiss);
    }
    if(text)controls.sync();
    const touch=text&&doc.getElementById('pages')?.hasAttribute('data-touch-selection');
    if(touch){
      if(!popup.contains(touchActions))popup.prepend(touchActions);
      const touchStates=active?options.touchClipboard?.state():undefined;
      for(const b of touchActions.querySelectorAll<HTMLButtonElement>('button')){
        if(touchStates){b.disabled=!!touchStates.get(b.dataset.touchEditAction as EditAction);continue;}
        const source=doc.querySelector<HTMLButtonElement>(`#edit-menu [data-edit-action="${b.dataset.touchEditAction}"]`);
        b.disabled=!source||source.disabled;
      }
    }else touchActions.remove();
    popup.toggleAttribute('data-pointer-selecting',dragging);
    if(keep)return;
    popup.hidden=false;popup.style.maxWidth=`${Math.max(0,v.width-16)}px`;
    // Prefer below/above the active line. A short viewport scrolls the card
    // inside its visible bounds; logical selection and hit testing stay intact.
    popup.style.maxHeight=`${Math.max(32,v.bottom-v.top-16)}px`;
    const box=popup.getBoundingClientRect(),bottom=Math.min(mark.bottom,v.bottom),top=Math.max(v.top+8,Math.min(v.bottom-box.height-8,bottom+8+box.height<=v.bottom-8?bottom+8:mark.top-box.height-8));
    // If there is no free band, retain the fixed keyboard-accessible tools.
    if(top<v.top+8||top+box.height>v.bottom-8){hide();return;}
    popup.style.left=`${Math.max(v.left+8,Math.min(v.right-box.width-8,mark.right+8))-h.left}px`;
    popup.style.top=`${top-h.top}px`;doc.body.dataset.selectionToolsActive="true";anchorLine=line;anchorOrigin=origin;
  });}
  const character=doc.createElement("div"),paragraph=doc.createElement("div");character.dataset.selectionSection="char";paragraph.dataset.selectionSection="paragraph";
  const touchActions=doc.createElement('div');touchActions.dataset.touchSelectionActions='';
  for(const [id,label]of [['copy','복사'],['cut','오려 두기']]as const){
    const b=doc.createElement('button');b.type='button';b.textContent=label;b.dataset.touchEditAction=id;
    b.onclick=()=>{const source=doc.querySelector<HTMLButtonElement>(`#edit-menu [data-edit-action="${id}"]`);
      if(!valid()||blocked())return;
      if(active&&options.touchClipboard){const target=captured!;hide();options.touchClipboard.invoke(id,target);return;}
      if(!source||source.disabled)return;source.click();};touchActions.append(b);
  }
  doc.addEventListener('rhwp:touch-selection',()=>{
    if(!doc.getElementById('pages')?.hasAttribute('data-touch-selection'))return;
    cancelled=false;dismissed=false;drag(false);releaseChrome();cancelIdle();schedule(true);
  },{signal});
  const controls=mountSelectionFormatControls(doc,editor,character,paragraph,{valid,blocked,target:()=>captured,focus:options.focus,execute:command=>{
    if(!valid()||blocked())throw Error("문서·선택이 바뀌었습니다. 다시 선택하세요.");
    applying=true;try{options.execute(command,captured!);captured=editor.capture();capturedShape=shapeKey();}finally{applying=false;}
  }});
  const deferPointer=()=>{
    hide();
    if(dismissed||!enabled||blocked()||editor.selection.kind!=="text"||samePosition(editor.selection.anchor,editor.selection.focus))return;
    pointerPending=true;const owner=editor.adapter.documentId;
    idle=doc.defaultView!.setTimeout(()=>{idle=0;pointerPending=false;if(owner===editor.adapter.documentId&&!dismissed)show(true);},300);
  };
  const schedule=(force=false)=>{forcePlacement||=force;if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const placement=forcePlacement;forcePlacement=false;show(placement);});};
  toggle.onclick=()=>{enabled=!enabled;doc.body.dataset.selectionToolsEnabled=String(enabled);toggle.setAttribute('aria-pressed',String(enabled));dismissed=!enabled;hide();};
  const dragUpdate=()=>{if(!dragging)return;const stamp=JSON.stringify([editor.adapter.documentId,editor.adapter.revision,editor.selection]);if(stamp!==pointerObserved){pointerObserved=stamp;deferPointer();}};
  function drag(next:boolean){
    if(next===dragging)return;
    dragging=next;
    if(!active)return;
    if(next)doc.addEventListener('rhwp:editor-state',dragUpdate,{signal});
    else doc.removeEventListener('rhwp:editor-state',dragUpdate);
  }
  doc.addEventListener('pointerdown',e=>{if(e.target instanceof Node&&popup.contains(e.target))return;cancelled=false;hide();releaseChrome();drag(e.button===0&&e.target instanceof Element&&!!e.target.closest('#pages'));dismissed=!dragging;if(dragging)holdChrome();},{capture:true,signal});
  doc.addEventListener('pointermove',e=>{if(!dragging||(e.clientX===pointerX&&e.clientY===pointerY))return;pointerX=e.clientX;pointerY=e.clientY;deferPointer();},{capture:true,passive:true,signal});
  // Main menu projection deliberately waits for drag release. Observe the
  // existing selection publication here, including edge scroll, without that
  // expensive projection. Repeated unchanged publications do not postpone idle.
  if(!active)doc.addEventListener('rhwp:editor-state',dragUpdate,{signal});
  doc.defaultView!.addEventListener('pointerup',e=>{
    if(!dragging||e.button!==0)return;
    // An idle preview already gave the user a screen position. If it still
    // represents this exact range, enable that very card on release instead
    // of hiding it and picking a new position after another idle interval.
    const preview=!popup.hidden&&!blocked()&&valid()?popup.getBoundingClientRect():undefined;
    drag(false);releaseChrome();
    if(preview){
      const current=popup.getBoundingClientRect(),bounds=viewport.getBoundingClientRect(),win=doc.defaultView!;
      const left=parseFloat(popup.style.left),top=parseFloat(popup.style.top);
      // Releasing the fixed toolbar height may translate the containing box.
      // Preserve the painted client position only if the whole card still fits.
      if(Number.isFinite(left)&&Number.isFinite(top)&&preview.width>0&&preview.height>0&&
          Math.abs(preview.width-current.width)<1&&Math.abs(preview.height-current.height)<1&&
          preview.left>=Math.max(0,bounds.left)&&preview.right<=Math.min(win.innerWidth,bounds.right)&&
          preview.top>=Math.max(0,bounds.top)&&preview.bottom<=Math.min(win.innerHeight,bounds.bottom)){
        popup.style.left=`${left+preview.left-current.left}px`;
        popup.style.top=`${top+preview.top-current.top}px`;
        const ready=popup.getBoundingClientRect();
        if(sameBox(ready,preview)){
          releasedPreview={card:ready,viewport:bounds};
          delete popup.dataset.pointerSelecting;
          return;
        }
      }
    }
    // No eligible preview: retain the release delay for a fresh exact target.
    deferPointer();
  },{signal});
  doc.defaultView!.addEventListener('pointercancel',()=>{drag(false);cancelled=true;dismissed=true;releaseChrome();hide();},{signal});
  doc.defaultView!.addEventListener('blur',()=>{drag(false);cancelled=true;dismissed=true;releaseChrome();hide();},{signal});
  doc.addEventListener('scroll',e=>{if(!popup.contains(e.target as Node)&&!dismissed&&editor.selection.kind==='text'){if(dragging||pointerPending)deferPointer();else schedule(true);}},{capture:true,passive:true,signal});
  doc.addEventListener('compositionstart',e=>{if(!popup.contains(e.target as Node)){composing=true;hide();}},{capture:true,signal});
  doc.addEventListener('compositionend',()=>{composing=false;},{capture:true,signal});
  doc.addEventListener('keydown',e=>{
    if(popup.contains(e.target as Node)){if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();e.stopPropagation();cancelled=true;dismissed=true;hide();options.focus();}return;}
    if(e.target===doc.getElementById('input')&&!e.isComposing&&e.keyCode!==229&&!e.altKey&&!e.metaKey){
      if(e.ctrlKey&&!e.shiftKey&&e.key.toLowerCase()==='a')cancelled=false;
      if(e.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)){cancelled=false;dismissed=false;return;}
      if(['Shift','Control'].includes(e.key))return;
    }
    if(e.key==='Escape')cancelled=true;dismissed=true;hide();
  },{capture:true,signal});
  popup.addEventListener("keydown",e=>{
    if(!e.ctrlKey&&!e.altKey&&!e.metaKey)e.stopPropagation();
    if(!(e.target instanceof HTMLButtonElement)||e.isComposing||e.ctrlKey||e.altKey||e.metaKey||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
    const buttons=[...popup.querySelectorAll<HTMLButtonElement>("button")].filter(b=>!b.disabled&&b.getClientRects().length),at=buttons.indexOf(doc.activeElement as HTMLButtonElement);e.preventDefault();buttons[e.key==="Home"?0:e.key==="End"?buttons.length-1:(at+(e.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length]?.focus();
  },{signal});
  // Expanding a control changes the card's intrinsic width in this click task.
  // Clamp before its first paint, rather than waiting for ResizeObserver's RAF
  // or a later Tab. This also covers keyboard-generated button activation.
  popup.addEventListener('click',()=>{if(!popup.hidden&&valid()&&!blocked())show(true);},{signal});
  const resize=new ResizeObserver(()=>{
    if(dismissed||pointerPending||dragging||popup.hidden||editor.selection.kind!=='text')return;
    // The observer also reports the drag hold's release. That notification
    // must not move a now-clickable preview when neither client box changed.
    if(releasedPreview&&sameBox(releasedPreview.card,popup.getBoundingClientRect())&&
        sameBox(releasedPreview.viewport,viewport.getBoundingClientRect()))return;
    schedule(true);
  });resize.observe(host);resize.observe(popup);
  return{pointerSelectionStarted(selecting=true){cancelled=false;hide();releaseChrome();drag(selecting);dismissed=!selecting;if(selecting)holdChrome();},sync(){
    if(applying)return;
    if(documentId!==editor.adapter.documentId){documentId=editor.adapter.documentId;drag(false);cancelled=true;dismissed=true;releaseChrome();hide();observed='';return;}
    // A queued pre-cancel selection publication must not resurrect the card.
    // Only a new pointer/Shift-selection intent releases this UI-only latch.
    if(cancelled){hide();return;}
    const stamp=JSON.stringify([editor.adapter.documentId,editor.adapter.revision,editor.selection,shapeKey()]),changed=stamp!==observed;observed=stamp;
    if(blocked()){hide();return;}
    const text=editor.selection.kind==='text'&&!samePosition(editor.selection.anchor,editor.selection.focus);
    if(!text){if(idle||!popup.hidden&&!valid())hide();return;}
    if(changed&&(dragging||doc.activeElement===doc.getElementById('input'))){
      dismissed=false;
      // The existing flush-before-action can run in the same pointer task as
      // a format click. Refresh its exact target now; only placement waits for
      // the frame, so the first click never consumes an older range.
      if(!popup.hidden){controls.clear();captured=editor.capture();capturedShape=shapeKey();controls.sync();}
      if(dragging||pointerPending)deferPointer();else schedule();
    }
    else if(!popup.hidden){if(!valid())hide();else controls.sync();}
  },dispose(){releaseChrome();hide();controls.dispose();resize.disconnect();life.abort();popup.remove();toggle.remove();delete doc.body.dataset.selectionToolsEnabled;}};
}
