import { activeWorkset } from "./active-workset.js";
import type { Interaction } from "./interaction.js";
import { assertSlashStart } from "./slash-commands.js";

/** Screen chrome only; never a page descendant or a document/clipboard node. */
export function mountEmptyParagraphHint(doc:Document,editor:Interaction,busy:()=>boolean){
  if(activeWorkset(doc)) {
    const input=doc.getElementById("input")!;
    const previous=input.getAttribute("aria-description");
    input.setAttribute("aria-description",[previous,"빈 문단에서 /를 입력하면 빠른 삽입 메뉴를 엽니다."].filter(Boolean).join(" "));
    return {sync(){},dispose(){if(previous===null)input.removeAttribute("aria-description");else input.setAttribute("aria-description",previous);}};
  }
  const viewport=doc.getElementById("viewport")!,host=viewport.parentElement!,input=doc.getElementById("input")!;
  const hint=doc.createElement("div");hint.id="empty-paragraph-hint";hint.textContent="/를 입력해 제목·표 등을 넣어보세요.";hint.setAttribute("aria-hidden","true");hint.hidden=true;host.append(hint);
  const life=new AbortController(),signal=life.signal;let composing=false,frame=0;
  const hide=()=>{hint.hidden=true;};
  const sync=()=>{
    hide();if(editor.selection.focus.kind==='cell'||composing||busy()||doc.activeElement!==input||doc.querySelector('dialog[open],#selection-tools:not([hidden])'))return;
    try{if(editor.adapter.text(editor.selection.focus)!=="")return;assertSlashStart(editor);const r=editor.cursorRect(),svg=doc.querySelector<SVGSVGElement>(`#pages [data-page="${r.pageIndex}"]>svg`);if(!svg)return;
      const matrix=svg.getScreenCTM();if(!matrix)return;const p=new DOMPoint(r.x,r.y+r.height/2).matrixTransform(matrix),v=viewport.getBoundingClientRect(),h=host.getBoundingClientRect();
      if(p.x<v.left||p.x>v.right||p.y<v.top||p.y>v.bottom)return;
      hint.style.maxWidth=`${Math.max(0,v.right-p.x-20)}px`;hint.style.left=`${p.x+8-h.left}px`;hint.style.top=`${p.y-h.top}px`;hint.hidden=false;
    }catch{/* Only truly editable empty owners receive the hint. */}
  };
  const schedule=()=>{if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;sync();});};
  for(const name of ['focusin','focusout','rhwp:editor-state','rhwp:reveal-selection'])doc.addEventListener(name,schedule,{signal});
  doc.addEventListener('compositionstart',()=>{composing=true;hide();},{capture:true,signal});doc.addEventListener('compositionend',()=>{composing=false;schedule();},{signal});
  input.addEventListener('beforeinput',hide,{signal});doc.addEventListener('pointerdown',hide,{capture:true,signal});doc.addEventListener('scroll',schedule,{capture:true,passive:true,signal});
  const observer=new MutationObserver(schedule);observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open']});const size=new ResizeObserver(schedule);size.observe(viewport);schedule();
  return{sync:schedule,dispose(){life.abort();observer.disconnect();size.disconnect();if(frame)cancelAnimationFrame(frame);hint.remove();}};
}
