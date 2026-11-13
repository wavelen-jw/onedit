import {bindToolbarFormView} from './toolbar-form-view.js';
/** Move the original controls, never command proxies or copies.
 * A resize is presentation only; focus and uncommitted drafts stay with nodes. */
export function mountToolbarOverflow(doc:Document) {
  const win=doc.defaultView!,life=new AbortController(),signal=life.signal;
  const rows:ReturnType<typeof mount>[]=[];
  function mount(root:HTMLElement, id:string, candidates:()=>HTMLElement[]) {
    const more=doc.createElement("details"),summary=doc.createElement("summary"),panel=doc.createElement("div");
    more.id=id;more.className="ui2-toolbar-overflow";summary.dataset.uiRead="";summary.textContent="⋯";summary.setAttribute("aria-label",id==="file-tools-overflow"?"문서 도구 더 보기":"서식 도구 더 보기");summary.setAttribute("aria-haspopup","true");summary.setAttribute("aria-controls",id+"-panel");panel.id=id+"-panel";panel.className="ui2-overflow-panel";panel.setAttribute("role","group");panel.setAttribute("aria-label",summary.getAttribute("aria-label")!);more.append(summary,panel);root.append(more);root.dataset.overflowRow="";
    const entries:{node:HTMLElement;slot:Comment;width:number;form:HTMLFormElement|null;unbind?:()=>void;independent:string|null}[]=[];
    const formViews=new Map<HTMLFormElement,HTMLElement>();let frame=0,moving=false;
    const destination=(form:HTMLFormElement|null)=>{
      if(!form)return panel;
      let view=formViews.get(form);if(!view){view=doc.createElement('div');view.dataset.quickForm=form.id;view.dataset.ui2Draft='';panel.append(view);formViews.set(form,view);}
      return view;
    };
    function move(node:HTMLElement,parent:Node,before:Node|null){
      if(node===before||node.parentNode===parent&&node.nextSibling===before)return;
      const active=doc.activeElement as HTMLInputElement|null,inside=!!active&&node.contains(active);let selection:[number|null,number|null]|undefined;
      if(inside)try{selection=[active!.selectionStart,active!.selectionEnd];}catch{/* number inputs have no text range */}
      node.dataset.uiRelocating="";
      const host=parent as Element&{moveBefore?:(node:Node,before:Node|null)=>void};
      // Preserve live input state only where needed. Ordinary rehosting of
      // inactive controls also refreshes their layout across a closed details
      // boundary (a whole inactive form can otherwise retain no render box).
      if(inside&&host.moveBefore&&node.isConnected)host.moveBefore(node,before);else parent.insertBefore(node,before);
      if(inside&&doc.activeElement!==active){active!.focus({preventScroll:true});if(selection&&selection[0]!==null)try{active!.setSelectionRange(selection[0],selection[1]);}catch{}}
      delete node.dataset.uiRelocating;
    }
    function fit(){if(!more.open)return;const r=summary.getBoundingClientRect(),h=doc.body.getBoundingClientRect(),width=Math.max(160,Math.min(380,h.width-16,win.innerWidth-16));panel.style.width=`${width}px`;panel.style.maxHeight=`${Math.max(120,win.innerHeight-16)}px`;panel.style.left=`${Math.max(8,Math.min(r.right-width,h.right-width-8,win.innerWidth-width-8))}px`;panel.style.top=`${Math.max(8,Math.min(r.bottom+5,win.innerHeight-panel.getBoundingClientRect().height-8))}px`;}
    function layout(){
      frame=0;if(moving||!root.getClientRects().length)return;moving=true;
      for(const node of candidates())if(node!==more&&!entries.some(e=>e.node===node)){
        const slot=doc.createComment("original toolbar position"),form=node.closest<HTMLFormElement>('#quick-format'),independent=node.getAttribute('data-quick-independent');
        node.before(slot);if(form&&node.closest('[data-quick-independent]'))node.dataset.quickIndependent='';
        entries.push({node,slot,width:node.getBoundingClientRect().width,form,unbind:form?bindToolbarFormView(node,form):undefined,independent});sizes.observe(node);
      }
      const style=getComputedStyle(root),budget=root.clientWidth-parseFloat(style.paddingLeft||"0")-parseFloat(style.paddingRight||"0"),gap=parseFloat(style.columnGap)||5;
      const visible=entries.filter(e=>!e.node.hidden&&getComputedStyle(e.node).display!=="none");
      for(const e of visible)if(e.node.parentNode===e.slot.parentNode)e.width=e.node.getBoundingClientRect().width;
      const total=visible.reduce((n,e)=>n+e.width+gap,0)-gap;
      let used=0,overflow=false,popped=0;const reserved=34+gap,orderedViews=new Set<HTMLElement>();
      for(const e of entries){
        if(!visible.includes(e))continue;
        const remaining=total>budget?budget-reserved:budget;
        if(overflow||used+e.width>remaining+1){
          overflow=true;popped++;const focused=e.node.contains(doc.activeElement);
          const parent=destination(e.form);if(parent!==panel&&!orderedViews.has(parent)){move(parent,panel,null);orderedViews.add(parent);}
          // Reveal the host before moving a focused field into it. Moving into
          // a still-hidden details element otherwise drops native input focus.
          if(focused){more.hidden=false;more.open=true;}move(e.node,parent,null);
        }else{used+=e.width+gap;move(e.node,e.slot.parentNode!,e.slot.nextSibling);}
      }
      more.hidden=!popped;if(!popped)more.open=false;
      root.dataset.overflowCount=String(popped);moving=false;fit();doc.dispatchEvent(new Event("rhwp:chrome-layout"));
    }
    function schedule(){if(!frame)frame=win.requestAnimationFrame(layout);}
    const sizes=new ResizeObserver(entriesChanged=>{if(moving)return;let needs=false;for(const entry of entriesChanged){const item=entries.find(e=>e.node===entry.target);if(!item){needs=true;continue;}if(item.node.parentNode===item.slot.parentNode&&Math.abs(item.width-item.node.getBoundingClientRect().width)>.5)needs=true;}if(needs)schedule();});sizes.observe(root);
    const mutation=new MutationObserver(()=>{if(!moving)schedule();});mutation.observe(root,{childList:true});for(const nav of root.querySelectorAll(":scope>nav"))mutation.observe(nav,{childList:true});
    more.addEventListener("toggle",()=>{summary.setAttribute("aria-expanded",String(more.open));if(more.open){for(const row of rows)if(row.more!==more)row.more.open=false;fit();}},{signal});
    more.addEventListener("keydown",e=>{
      if(e.isComposing||e.keyCode===229||e.ctrlKey||e.altKey||e.metaKey)return;
      if(e.key==="Escape"&&!e.defaultPrevented){e.preventDefault();e.stopPropagation();more.open=false;summary.focus({preventScroll:true});}
      else if(e.target===summary&&e.key==="ArrowDown"){e.preventDefault();more.open=true;fit();panel.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),summary")?.focus({preventScroll:true});}
    },{signal});
    // Shared menu lifetime owns outside pointer, leave delay and window blur.
    win.addEventListener("resize",()=>{schedule();fit();},{signal});doc.fonts?.addEventListener("loadingdone",schedule,{signal});
    layout();return{more,schedule,dispose(){sizes.disconnect();mutation.disconnect();if(frame)win.cancelAnimationFrame(frame);for(const e of entries){if(e.slot.parentNode)move(e.node,e.slot.parentNode,e.slot.nextSibling);e.unbind?.();if(e.independent===null)e.node.removeAttribute('data-quick-independent');else e.node.setAttribute('data-quick-independent',e.independent);e.slot.remove();}more.remove();}};
  }
  const format=doc.getElementById("format-bar")!,file=doc.getElementById("workspace-quickbar")!;
  format.dataset.progressiveOverflow='';
  const atoms=(node:HTMLElement):HTMLElement[]=>{
    if(node.matches('.home-toolbar-group,#quick-format,.quick-format-icons'))return [...node.children].flatMap(n=>n instanceof HTMLElement?atoms(n):[]);
    if(node.matches('datalist,output,[type=submit]'))return [];
    return [node];
  };
  rows.push(mount(format,"format-tools-overflow",()=>[...format.children].flatMap(n=>n instanceof HTMLElement&&n.id!=='format-tools-overflow'?atoms(n):[])));
  rows.push(mount(file,"file-tools-overflow",()=>[...file.children].flatMap(n=>n.tagName==="NAV"?[...n.children]:[n]).filter(n=>n instanceof HTMLElement) as HTMLElement[]));
  return{dispose(){life.abort();for(const row of rows)row.dispose();delete format.dataset.progressiveOverflow;}};
}
