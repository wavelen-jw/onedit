/** Presentation only: native receiver, window and composition own eligibility. */
export function mountCaretVisibility(input:HTMLTextAreaElement,pages:HTMLElement){
  const doc=input.ownerDocument,win=doc.defaultView!,life=new AbortController(),signal=life.signal;
  let active=doc.hasFocus(),composing=false;
  const sync=()=>{pages.toggleAttribute('data-caret-composing',composing);pages.toggleAttribute('data-caret-active',active&&!doc.hidden&&doc.activeElement===input&&!doc.querySelector('dialog[open]'));};
  win.addEventListener('blur',()=>{active=false;sync();},{signal});
  win.addEventListener('focus',()=>{active=true;sync();},{signal});
  doc.addEventListener('visibilitychange',sync,{signal});
  doc.addEventListener('focusin',sync,{signal});doc.addEventListener('focusout',()=>{pages.removeAttribute('data-caret-active');},{signal});
  // Capture at document level also observes the UI-only slash composition.
  doc.addEventListener('compositionstart',e=>{if(e.target===input){composing=true;sync();}},{capture:true,signal});
  doc.addEventListener('compositionend',e=>{if(e.target===input){composing=false;sync();}},{capture:true,signal});
  const observer=new MutationObserver(records=>{if(records.some(r=>r.target instanceof HTMLDialogElement))sync();});
  observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open']});sync();
  return()=>{life.abort();observer.disconnect();pages.removeAttribute('data-caret-active');};
}
