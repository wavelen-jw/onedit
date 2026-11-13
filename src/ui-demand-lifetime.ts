import {menuControlDemanded} from "./menu-lifetime.js";

/** A closed auxiliary surface has no editor-state subscription. No native reads here. */
export function subscribeWhileOpen(doc:Document, root:HTMLElement, update:()=>void, refreshOnAttach=true,
  demandControl?:HTMLElement) {
  let listening=false;
  const ancestors=(node:HTMLElement)=>{const nodes:HTMLElement[]=[];for(let p:HTMLElement|null=node;p;p=p.parentElement)nodes.push(p);return nodes;};
  const open=()=>root.isConnected && ancestors(root).every(p=>!p.hidden &&
    (!(p instanceof HTMLDetailsElement||p instanceof HTMLDialogElement)||p.open)) &&
    (!demandControl || (root.contains(demandControl) && menuControlDemanded(demandControl)));
  const deliver=()=>{if(open())update();};
  const reconcile=()=>{
    const next=open();if(next===listening)return;
    listening=next;
    if(next){doc.addEventListener("rhwp:editor-state",deliver);if(refreshOnAttach)update();}
    else doc.removeEventListener("rhwp:editor-state",deliver);
  };
  const observer=new MutationObserver(reconcile);
  const observe=()=>{
    observer.disconnect();
    // A demand-gated control must not attach until the popup's independently
    // reflected aria-hidden state is ready. Observe the same gates as its read.
    const attributes=demandControl?["open","hidden","aria-hidden"]:["open","hidden"];
    for(const p of ancestors(demandControl??root))observer.observe(p,{attributes:true,attributeFilter:attributes});
    reconcile();
  };
  root.addEventListener("toggle",observe);root.addEventListener("close",reconcile);
  observe();
  return ()=>{observer.disconnect();doc.removeEventListener("rhwp:editor-state",deliver);
    root.removeEventListener("toggle",observe);root.removeEventListener("close",reconcile);};
}
