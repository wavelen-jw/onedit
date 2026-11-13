import { activeWorkset } from "./active-workset.js";
import type { Interaction } from "./interaction.js";
import type { EditAction } from "./integration/a-edit-menu.js";

// A view of the existing menu buttons, including owner-specific disabled reasons.
// Never infer clipboard permissions or mutate a document here.
export const editToolActions = ["cut", "copy", "paste", "delete", "all", "find", "replace", "format-copy"] as const;
export function mountEditTools(doc: Document, sources: Map<EditAction, HTMLButtonElement>,
  capture: () => ReturnType<Interaction["capture"]>,
  invoke: (id: EditAction, target: ReturnType<Interaction["capture"]>) => void,
  blocked: () => boolean) {
  const demand = activeWorkset(doc);
  const observers: MutationObserver[] = [];
  // Presentation may rehost a mirror in another Home group. Keep its original
  // source/guard alive independently of its current DOM parent.
  const mirrors: HTMLButtonElement[] = [];
  const root=doc.createElement("div");root.id="edit-tools";root.className="edit-tools";
  root.setAttribute("role","group");root.setAttribute("aria-label","클립보드·선택·찾기");
  for (const id of editToolActions) {
    const source=sources.get(id)!;const b=doc.createElement("button");b.type="button";b.dataset.editTool=id;
    // Keep the existing menu label/shortcut as the one source of truth.
    b.textContent=source.textContent;
    let target: ReturnType<Interaction["capture"]> | undefined;
    const sync=()=>{if(demand){b.disabled=false;b.title=b.dataset.commandTitle??=source.textContent??"";b.setAttribute("aria-disabled","false");return;}b.disabled=source.disabled||blocked();b.title=source.disabled?source.title:blocked()?"입력·저장·열린 대화상자를 마친 후 사용하세요.":source.title;b.setAttribute("aria-disabled",String(b.disabled));};
    const arm=()=>{if(demand)return;sync();target=b.disabled?undefined:capture();};
    if(!demand){b.addEventListener("pointerdown",arm);b.addEventListener("focus",arm);}
    b.addEventListener("keydown",e=>{
      if((e.key==="Enter"||e.key===" ")&&(e.isComposing||e.keyCode===229||e.repeat)){e.preventDefault();e.stopPropagation();return;}
      if(e.key==="Escape"&&!e.isComposing&&e.keyCode!==229){target=undefined;doc.getElementById("input")?.focus();e.preventDefault();e.stopPropagation();}
    });
    b.onclick=()=>{if(demand){try{invoke(id,capture());}catch(error){const note=doc.getElementById("error");if(note){note.textContent=String(error);note.hidden=false;}}return;}sync();if(!b.disabled&&target){const once=target;target=undefined;invoke(id,once);}};
    const observer=new MutationObserver(sync);if(!demand)observer.observe(source,{attributes:true,attributeFilter:["disabled","title"]});observers.push(observer);
    mirrors.push(b);root.append(b);sync();
  }
  // A newly opened modal must disable the visible mirrors even without repaint.
  const modalObserver=new MutationObserver(()=>mirrors.forEach(b=>{
    const source=sources.get(b.dataset.editTool as EditAction)!;
    b.disabled=source.disabled||blocked();b.title=source.disabled?source.title:blocked()?"입력·저장·열린 대화상자를 마친 후 사용하세요.":source.title;b.setAttribute("aria-disabled",String(b.disabled));
  }));if(!demand)modalObserver.observe(doc.body,{subtree:true,attributes:true,attributeFilter:["open"]});observers.push(modalObserver);
  doc.getElementById("toolbar")?.append(root);
  return Object.assign(root,{dispose:()=>{for(const observer of observers)observer.disconnect();for(const mirror of mirrors)mirror.remove();root.remove();}});
}
