import {activeWorkset} from "./active-workset.js";
import { hancomShortcutLabel } from "./hancom-web-shortcuts.js";
// Presentation only. Keep command IDs, menu-letter handlers and real <kbd>
// shortcuts intact; remove only the conventional one-character access suffix.
const clean=(text:string)=>text.replace(/\([A-Za-z0-9]\)/g,'');
const watched=new WeakSet<HTMLElement>();
export function presentMenuLabels(root:HTMLElement,demand=false){
  const update=(node:Node)=>{
    if(node.nodeType===Node.TEXT_NODE){
      if(node.parentElement?.closest('input,textarea,select,option'))return;
      if(node.parentElement?.closest('kbd')){const before=node.textContent??'',after=hancomShortcutLabel(before);if(after!==before)node.textContent=after;return;}
      const before=node.textContent??'',after=hancomShortcutLabel(clean(before));if(after!==before)node.textContent=after;
      return;
    }
    if(!(node instanceof HTMLElement)||node.matches('input,textarea,select,option'))return;
    for(const name of ['title','aria-label','aria-keyshortcuts']){const before=node.getAttribute(name);if(before!==null){const label=hancomShortcutLabel(clean(name==='aria-keyshortcuts'?before.replace(/\bControl\+/g,'Ctrl+'):before));const after=name==='aria-keyshortcuts'?label.replace(/\bCtrl\+/g,'Control+').replace(/\bCommand\+/g,'Meta+').replace(/\bOption\+/g,'Alt+'):label;if(after!==before)node.setAttribute(name,after);}}
    for(const child of node.childNodes)update(child);
  };
  update(root);if(watched.has(root))return;watched.add(root);
  const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')update(r.target);else if(r.type==='characterData')update(r.target);else for(const n of r.addedNodes)update(n);}});
  const watch=()=>observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','aria-keyshortcuts']});
  if(!demand){watch();return;}
  const disclosure=()=>{
    if(root.hidden||root instanceof HTMLDetailsElement&&!root.open){observer.disconnect();return;}
    update(root);watch();
  };
  const lifecycle=new MutationObserver(disclosure);
  lifecycle.observe(root,{attributes:true,attributeFilter:['hidden','open']});
  disclosure();
  return()=>{observer.disconnect();lifecycle.disconnect();watched.delete(root);};
}
export function mountMenuLabels(doc:Document){
  const selector=activeWorkset(doc)?'#main-menu>details':'#main-menu,[role="menu"],[id$="-context-menu"]';
  for(const root of doc.querySelectorAll<HTMLElement>(selector))presentMenuLabels(root,activeWorkset(doc));
}
