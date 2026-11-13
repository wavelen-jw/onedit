/** Passive menu preparation only. Real commands always revalidate current state.
 * Walk from the control, so a closed submenu below an open parent stays absent. */
const menuDemandViews=new WeakMap<Element,Set<Element>>();
export function registerMenuDemand(source:Element,view:Element){const rows=menuDemandViews.get(source)??new Set<Element>();rows.add(view);menuDemandViews.set(source,rows); }
export function menuControlDemanded(control: Element | null): boolean {
  if(!control?.isConnected)return false;
  const views=menuDemandViews.get(control);if(views&&[...views].some(view=>menuControlDemanded(view)))return true;
  for(let p:Element|null=control;p;p=p.parentElement){
    if(p.hasAttribute('hidden')||p.getAttribute('aria-hidden')==='true')return false;
    if(p.tagName==='DETAILS'&&!p.hasAttribute('open'))return false;
    if(p.tagName==='DIALOG'&&!p.hasAttribute('open'))return false;
  }
  return true;
}

import {activeWorkset} from './active-workset.js';
import {presentMenuLabels} from './menu-labels.js';
import {focusEditorAfterPopup} from './editor-popup-focus.js';
// Pointer travel is presentation, never an intentional context transition.
// Owners still apply/cancel their own drafts; this manager stores no edit state.
type Popup={root:HTMLElement;close:()=>void;focus:()=>void};
const managers=new WeakMap<Document,ReturnType<typeof createLifetime>>();
function createLifetime(doc:Document){
 const active=activeWorkset(doc),win=doc.defaultView!,popups=new Map<HTMLElement,Popup>();let documentId:string|undefined;
 const roots=()=>[...doc.querySelectorAll<HTMLDetailsElement>('#main-menu>details[open],details.ui2-toolbar-overflow[open]'),...[...popups.keys()].filter(p=>p.isConnected&&!p.hidden&&(!(p instanceof win.HTMLDetailsElement)||p.open))];
 const opened=(root:HTMLElement)=>root instanceof win.HTMLDetailsElement?root.open:!root.hidden&&root.isConnected;
 const close=(root:HTMLElement,restore:boolean)=>{const inside=root.contains(doc.activeElement),popup=popups.get(root);if(popup)popup.close();else{for(const d of root.querySelectorAll<HTMLDetailsElement>('details[open]'))d.open=false;(root as HTMLDetailsElement).open=false;}for(const s of root.querySelectorAll<HTMLElement>('summary[aria-expanded]'))s.setAttribute('aria-expanded','false');root.querySelector<HTMLElement>(':scope>summary')?.setAttribute('aria-expanded','false');if(restore&&inside){if(popup)popup.focus();else focusEditorAfterPopup(doc);}};
 const outside=(event:Event)=>{if(doc.querySelector('dialog[open]'))return;const target=event.target;if(!(target instanceof win.Node))return;for(const root of roots())if(!root.contains(target))close(root,false);};
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey&&!e.defaultPrevented&&!e.isComposing&&e.keyCode!==229&&!doc.querySelector('dialog[open]')){const current=roots();for(const root of current)close(root,true);if(current.length){e.preventDefault();e.stopPropagation();}}};
 const dismissSummary=(event:MouseEvent)=>{
  if(event.defaultPrevented||!event.isTrusted||event.button!==0||doc.querySelector('dialog[open]')||!(event.target instanceof win.Element))return;
  const summary=event.target.closest('summary'),root=summary?.parentElement;
  if(!(root instanceof win.HTMLDetailsElement)||!root.open||!root.matches('#main-menu>details,details.ui2-toolbar-overflow')||
     summary!==root.querySelector(':scope>summary'))return;
  event.preventDefault();close(root,true);
 };
 const blur=()=>{const active=doc.activeElement;if(active instanceof win.HTMLInputElement&&active.type==='color')return;for(const root of roots())close(root,false);};
 const reflect=(root:HTMLElement)=>{const hidden=String(!opened(root));if(root.getAttribute('aria-hidden')!==hidden)root.setAttribute('aria-hidden',hidden);};
 if(!active){const observer=new MutationObserver(()=>{for(const root of popups.keys())reflect(root);});observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});}
 doc.addEventListener('pointerdown',outside,true);doc.addEventListener('focusin',outside);doc.addEventListener('keydown',key);doc.addEventListener('click',dismissSummary);win.addEventListener('blur',blur);
 return{documentChanged(id:string){if(documentId!==undefined&&documentId!==id)for(const root of roots())close(root,false);documentId=id;},register(p:Popup){const stopLabels=presentMenuLabels(p.root,active);popups.set(p.root,p);reflect(p.root);
 const local=active?new MutationObserver(()=>reflect(p.root)):undefined;
 local?.observe(p.root,{attributes:true,attributeFilter:['open','hidden']});
 return()=>{local?.disconnect();stopLabels?.();popups.delete(p.root);};}};
}
export function mountMenuLifetime(doc:Document){let manager=managers.get(doc);if(!manager){manager=createLifetime(doc);managers.set(doc,manager);}return manager;}
export function registerPopupLifetime(doc:Document,popup:Popup){return mountMenuLifetime(doc).register(popup);}
