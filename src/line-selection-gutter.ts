import {activeWorkset} from './active-workset.js';
import type {Interaction} from './interaction.js';
import {bodyVisualLines,type BodyVisualLine} from './body-visual-lines.js';
import {pagePoint} from './integration/a-view-menu.js';
import {registerPageChrome} from './page-layers.js';

/** Screen-only navigation targets are produced on explicit navigation demand. */
export function mountLineSelectionGutter(doc:Document,editor:Interaction,actions:{busy:()=>boolean;changed:()=>void;focus:()=>void;error:(e:unknown)=>void}){
  const pages=doc.getElementById('pages')!,life=new AbortController(),signal=life.signal;
  let identity='',selectionRefresh=false,rows=new Map<HTMLElement,{svg:Element;lines:BodyVisualLine[]}>();
  let drag:{pointer:number;origin:BodyVisualLine;identity:string;selection:string;last:BodyVisualLine}|undefined;
  const key=()=>JSON.stringify([editor.adapter.documentId,editor.adapter.revision]);
  function retire(){
    const next=key();if(next!==identity){drag=undefined;identity=next;}
    rows.clear();pages.querySelectorAll('.line-selection-gutter').forEach(e=>e.remove());
  }
  function prepare(page:HTMLElement,force=false){
    if(key()!==identity)retire();
    if(actions.busy()||editor.adapter.transientEdit||!page.isConnected||!pages.contains(page))return;
    const svg=page.querySelector(':scope>svg');
    if(!svg||page.hasAttribute('data-render-pending'))return;
    if(!force&&rows.get(page)?.svg===svg)return;
    rows.delete(page);page.querySelectorAll('.line-selection-gutter').forEach(e=>e.remove());
    try{editor.withViewQueries(()=>{
      const lines=bodyVisualLines(editor,Number(page.dataset.page));
      const columns=editor.adapter.call('getPageInfo',Number(page.dataset.page)).columns??[];
      if(key()!==identity||svg!==page.querySelector(':scope>svg')||page.hasAttribute('data-render-pending'))throw Error('현재 줄 선택 대상을 다시 확인해야 합니다.');
      rows.set(page,{svg,lines});
      for(const[i,line]of lines.entries()){
        if(line.start.position.offset===line.end.position.offset)continue;
        const column=columns.find((c:{x:number;width:number})=>Number.isFinite(c.x)&&c.width>0&&line.left>=c.x&&line.left<c.x+c.width);
        const b=doc.createElement('button');b.type='button';b.className='line-selection-gutter';b.dataset.visualLine=String(i);b.title='이 화면 줄 선택';b.setAttribute('aria-label','이 화면 줄 선택');
        Object.assign(b.style,{left:Math.max(0,(column?.x??line.left)-30)+'px',top:line.top+'px',width:'24px',height:Math.max(8,line.bottom-line.top)+'px'});
        registerPageChrome(page,b);page.append(b);
      }
    });}catch(e){rows.delete(page);page.querySelectorAll('.line-selection-gutter').forEach(e=>e.remove());console.debug('rhwp:line-gutter-geometry',e);}
  }
  const activate=(button:HTMLElement)=>{
    if(actions.busy()||editor.adapter.transientEdit)return;
    const page=button.closest<HTMLElement>('.page'),entry=page&&rows.get(page),line=entry?.lines[Number(button.dataset.visualLine)];
    if(!page||!line||identity!==key()||entry!.svg!==page.querySelector(':scope>svg')||page.hasAttribute('data-render-pending'))return;
    try{editor.selectVisualLine(line.position,line.line.lineIndex);selectionRefresh=true;try{actions.changed();actions.focus();}finally{selectionRefresh=false;}return line;}catch(e){actions.error(e);}
  };
  // A real pointer move requests only its page. Passive touch movement remains
  // native scrolling; no focus, selection, layout mutation or all-page query.
  doc.addEventListener('pointermove',e=>{
    if(drag||e.pointerType==='touch'||e.buttons)return;
    const page=(e.target instanceof Element?e.target.closest<HTMLElement>('.page'):null);if(page&&pages.contains(page))prepare(page);
  },{capture:true,passive:true,signal});
  doc.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.pointerType==='touch'||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey)return;
    const target=e.target as Element,page=(target instanceof Element?target.closest<HTMLElement>('.page'):null);
    // HTML object handles/controls keep their own targeting. SVG/page or an
    // actual gutter button can request fresh hit targets in this same gesture.
    if(page&&pages.contains(page)&&(target===page||target instanceof SVGElement||target.closest('.line-selection-gutter')))prepare(page,true);
    const b=(doc.elementFromPoint(e.clientX,e.clientY) as Element|null)?.closest<HTMLElement>('.line-selection-gutter');
    if(!b||!pages.contains(b))return;
    e.preventDefault();e.stopImmediatePropagation();const line=activate(b);
    if(line)drag={pointer:e.pointerId,origin:line,last:line,identity,selection:JSON.stringify(editor.selection)};
  },{capture:true,signal});
  doc.addEventListener('pointermove',e=>{
    if(!drag||drag.pointer!==e.pointerId)return;
    if(!(e.buttons&1)||actions.busy()||editor.adapter.transientEdit||drag.identity!==key()||drag.selection!==JSON.stringify(editor.selection)){drag=undefined;return;}
    e.preventDefault();e.stopImmediatePropagation();
    const page=(doc.elementFromPoint(e.clientX,e.clientY) as Element|null)?.closest<HTMLElement>('.page');if(!page)return;prepare(page);
    const entry=rows.get(page);if(!entry||entry.svg!==page.querySelector(':scope>svg'))return;
    const point=pagePoint(page,e.clientX,e.clientY),columns=editor.adapter.call('getPageInfo',Number(page.dataset.page)).columns??[];
    const column=columns.find((c:{x:number;width:number})=>point.x>=c.x-30&&point.x<c.x+c.width);
    const candidates=entry.lines.filter(l=>!column||l.left>=column.x&&l.left<column.x+column.width);
    const line=candidates.reduce<BodyVisualLine|undefined>((best,l)=>!best||Math.abs((l.top+l.bottom)/2-point.y)<Math.abs((best.top+best.bottom)/2-point.y)?l:best,undefined);
    if(!line||line===drag.last)return;
    try{editor.selectVisualLine(line.position,line.line.lineIndex,{position:drag.origin.position,lineIndex:drag.origin.line.lineIndex});drag.last=line;drag.selection=JSON.stringify(editor.selection);selectionRefresh=true;try{actions.changed();actions.focus();}finally{selectionRefresh=false;}}catch(error){drag=undefined;actions.error(error);}
  },{capture:true,signal});
  const stop=()=>{drag=undefined;};
  doc.addEventListener('pointerup',stop,{capture:true,signal});doc.addEventListener('pointercancel',stop,{capture:true,signal});doc.defaultView?.addEventListener('blur',stop,{signal});
  pages.addEventListener('click',e=>{const b=(e.target as Element)?.closest<HTMLElement>('.line-selection-gutter');if(!b)return;e.preventDefault();e.stopPropagation();if(e.detail===0)activate(b);},{signal});
  // UI refresh retires prior navigation geometry without requerying it. Actual
  // mouse/pen intent or keyboard focus traversal produces fresh targets.
  const sync=()=>{if(selectionRefresh&&key()===identity)return;retire();};
  doc.addEventListener('scroll',sync,{capture:true,passive:true,signal});doc.defaultView?.addEventListener('resize',sync,{passive:true,signal});
  doc.addEventListener('rhwp:reveal-selection',sync,{signal});
  doc.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.isComposing&&e.target!==doc.getElementById('input')){if(key()!==identity)retire();for(const page of pages.querySelectorAll<HTMLElement>(activeWorkset(doc)?'.page:not([data-render-pending])':'.page'))prepare(page);}},{capture:true,signal});
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.target===pages||r.type==='attributes'||r.target instanceof Element&&r.target.classList.contains('page')&&[...r.addedNodes,...r.removedNodes].some(n=>n instanceof SVGElement&&!n.classList.contains('body-corner-guides'))))retire();
  });
  observer.observe(pages,{childList:true,subtree:true,attributes:true,attributeFilter:['data-render-pending']});
  return{sync,dispose(){life.abort();observer.disconnect();retire();drag=undefined;}};
}
