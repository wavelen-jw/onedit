import type { Interaction } from './interaction.js';
import {copy, sameContainer, samePosition, type Position} from './model.js';
import {pagePoint,viewportPoint} from './integration/a-view-menu.js';

/** Screen-only handles. Dragging the page itself always remains native pan. */
export function mountTouchSelectionHandles(document:Document,editor:Interaction,viewport:HTMLElement,pages:HTMLElement,
  options:{active:()=>boolean;blocked:()=>boolean;changed:()=>void;error:(e:unknown)=>void}) {
  const win=document.defaultView!,root=document.createElement('div');root.id='touch-selection-handles';root.hidden=true;viewport.append(root);
  const buttons=(['anchor','focus']as const).map((end,i)=>{const b=document.createElement('button');b.type='button';b.dataset.touchHandle=end;b.setAttribute('aria-label',i?'선택 끝점 조절':'선택 시작점 조절');root.append(b);return b;});
  const stamp=()=>JSON.stringify([editor.adapter.documentId,editor.adapter.revision,editor.selection]);
  let applying=false,drag:{id:number;end:'anchor'|'focus';fixed:Position;stamp:string}|undefined;
  function refresh(){
    if(applying)return;
    if(drag&&drag.stamp!==stamp())drag=undefined;
    const s=editor.selection;
    root.hidden=!options.active()||options.blocked()||s.kind!=='text'||samePosition(s.anchor,s.focus);
    if(root.hidden)return;
    try {if(s.kind!=='text')return;
      for(const[i,p]of[s.anchor,s.focus].entries()) {
        const r=i===1?editor.cursorRect():editor.adapter.rect(p),page=pages.querySelector<HTMLElement>(`[data-page="${r.pageIndex}"]`);
        if(!page||page.hasAttribute('data-render-pending')){root.hidden=true;return;}
        const at=viewportPoint(page,viewport,r.x,i===0?r.y:r.y+r.height);
        buttons[i].style.left=`${at.x}px`;buttons[i].style.top=`${at.y-(i===0?buttons[i].offsetHeight:0)}px`;
      }
    }catch{root.hidden=true;drag=undefined;}
  }
  const publish=()=>{options.changed();refresh();document.dispatchEvent(new Event('rhwp:touch-selection'));};
  function move(end:'anchor'|'focus',action:(fixed:Position)=>void) {
    const before=copy(editor.selection),typing={...editor.typing},block=editor.block,preferred=editor.preferredX;
    if(before.kind!=='text')return;
    const fixed=copy(end==='anchor'?before.focus:before.anchor);
    applying=true;
    try {
      action(fixed);
      const next=editor.selection;
      if(next.kind!=='text')throw Error('선택 끝점을 확인할 수 없습니다.');
      if(end==='anchor')editor.selection={kind:'text',anchor:copy(next.focus),focus:copy(next.anchor)};
      editor.block=false;if(drag)drag.stamp=stamp();
    }catch(error){editor.selection=before;editor.typing=typing;editor.block=block;editor.preferredX=preferred;drag=undefined;options.error(error);}
    finally{applying=false;publish();}
  }
  buttons.forEach((button,i)=>{
    const end=i?'focus':'anchor';
    button.addEventListener('pointerdown',e=>{
      if(e.button!==0||!e.isPrimary||options.blocked()||root.hidden||editor.selection.kind!=='text')return;
      e.preventDefault();e.stopImmediatePropagation();
      drag={id:e.pointerId,end,fixed:copy(end==='anchor'?editor.selection.focus:editor.selection.anchor),stamp:stamp()};
      button.setPointerCapture(e.pointerId);
    });
    button.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      if(options.blocked()||drag.stamp!==stamp()){drag=undefined;return;}
      e.preventDefault();e.stopImmediatePropagation();
      const page=[...pages.querySelectorAll<HTMLElement>('.page')].find(n=>{const r=n.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom;});
      if(!page||page.hasAttribute('data-render-pending'))return;
      const at=pagePoint(page,e.clientX,e.clientY),index=Number(page.dataset.page),hit=editor.adapter.hit(index,at.x,at.y);
      if(!sameContainer(drag.fixed,hit))return;
      move(drag.end,fixed=>{editor.point(fixed);editor.pointer(index,at.x,at.y,true);});
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,e=>{
      if(drag?.id===(e as PointerEvent).pointerId){drag=undefined;e.stopPropagation();refresh();}
    });
    button.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||options.blocked())return;
      e.preventDefault();e.stopPropagation();
      move(end,fixed=>{const s=editor.selection;if(s.kind!=='text')return;const moving=copy(end==='anchor'?s.anchor:s.focus);editor.selection={kind:'text',anchor:fixed,focus:moving};editor.move(e.key,true,viewport.clientHeight);});
    });
  });
  document.addEventListener('rhwp:editor-state',refresh);
  viewport.addEventListener('scroll',refresh,{passive:true});win.addEventListener('resize',refresh);win.visualViewport?.addEventListener('resize',refresh);
  return{refresh};
}
