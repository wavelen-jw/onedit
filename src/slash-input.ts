/** A UI-only search draft on the existing editor receiver. Never focus another
 * text control, synthesize text/IME, or publish the draft to Command/History. */
export function slashInput(input:HTMLTextAreaElement, hooks:{
  commitSpace:()=>void; change:(text:string)=>void; key:(event:KeyboardEvent)=>void; blur:()=>void;
}) {
  const life=new AbortController(),signal=life.signal,win=input.ownerDocument.defaultView!;
  let owned=false,composing=false,processDown=false,committed=false,retired=false,disposed=false,orphanEnter=false,spaceDown=false,tail:string|undefined;
  const clear=()=>{owned=composing=processDown=committed=retired=spaceDown=false;input.value="";};
  const compositionKey=(e:KeyboardEvent)=>e.key==='Process'||e.keyCode===229;
  input.addEventListener('keydown',e=>{
    tail=undefined;
    if(!owned){
      if(orphanEnter&&e.key==='Enter'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey&&e.cancelable){e.preventDefault();e.stopImmediatePropagation();return;}
      orphanEnter=false;if(disposed)life.abort();return;
    }
    if(retired&&!composing){clear();if(disposed)life.abort();return;}
    // Process belongs to the browser IME. Only contain propagation to editor
    // commands; its default behavior still edits this same native receiver.
    if(compositionKey(e)||composing||e.isComposing){processDown=true;spaceDown=!e.repeat&&(e.code==='Space'||e.key===' ')&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey;e.stopImmediatePropagation();return;}
    // A completed search composition may expose a non-composing Space
    // before Process keyup. Route that explicit key once now: waiting for
    // Space keyup loses it when Process keyup clears the commit token first.
    // Do not infer a command from compositionend or consume candidate keys.
    if(e.key===' '&&processDown&&committed){
      processDown=committed=spaceDown=false;
      e.stopImmediatePropagation();hooks.key(e);return;
    }
    if(e.key==='Enter'&&processDown&&committed){e.preventDefault();e.stopImmediatePropagation();return;}
    e.stopImmediatePropagation();hooks.key(e);
  },{capture:true,signal});
  input.addEventListener('beforeinput',e=>{if(owned)e.stopImmediatePropagation();},{capture:true,signal});
  for(const type of ['copy','cut','paste'])input.addEventListener(type,e=>{if(owned)e.stopImmediatePropagation();},{capture:true,signal});
  input.addEventListener('input',e=>{
    if(!owned){
      // An invalidated search may finish its native composition after the
      // document changed. A new key/composition clears this exact tail token.
      if(tail!==undefined&&e.data===tail&&e.inputType.toLowerCase().includes('composition')){
        e.stopImmediatePropagation();input.value='';tail=undefined;if(disposed)life.abort();
      }
      return;
    }
    e.stopImmediatePropagation();if(!retired)hooks.change(input.value);
  },{capture:true,signal});
  input.addEventListener('compositionstart',e=>{
    tail=undefined;if(!owned){if(disposed)life.abort();return;}
    e.stopImmediatePropagation();composing=true;committed=false;
  },{capture:true,signal});
  input.addEventListener('compositionupdate',e=>{if(owned)e.stopImmediatePropagation();},{capture:true,signal});
  input.addEventListener('compositionend',e=>{
    if(!owned)return;e.stopImmediatePropagation();composing=false;committed=processDown;
    if(retired){tail=e.data;orphanEnter=processDown;clear();if(disposed&&!tail&&!orphanEnter)life.abort();}
    else hooks.change(input.value);
  },{capture:true,signal});
  win.addEventListener('keyup',e=>{
    if(compositionKey(e)||e.key==='Enter'||e.key===' '||e.code==='Space'){
      const execute=owned&&!retired&&!composing&&committed&&spaceDown&&(e.code==='Space'||e.key===' ')&&input.ownerDocument.activeElement===input;
      processDown=false;committed=false;spaceDown=false;orphanEnter=false;if(retired&&!composing)clear();
      if(execute)hooks.commitSpace();
    }
  },{capture:true,signal});
  input.addEventListener('blur',()=>{if(owned)hooks.blur();},{signal});
  return {
    open(){if(owned||input.value||input.ownerDocument.activeElement!==input)return false;owned=true;retired=false;tail=undefined;return true;},
    ready(){return owned&&!retired&&!composing&&!(processDown&&committed);},
    composing(){return composing;},
    close(){if(composing)retired=true;else clear();},
    dispose(){disposed=true;if(composing)retired=true;else{clear();life.abort();}},
  };
}
