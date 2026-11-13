import type { Interaction } from './interaction.js';
import {bodyWordAtPoint} from './body-word-selection.js';
import {copy, sameContainer, samePosition, type Position} from './model.js';
import {pagePoint,viewportPoint} from './integration/a-view-menu.js';

/** Exact existing glyph/list/word queries, not a guessed character width. */
export function touchTextRange(editor:Interaction,page:number,x:number,y:number):[Position,Position]|undefined {
  const a=editor.adapter,hit=a.hit(page,x,y);
  if(hit.kind==='body')return bodyWordAtPoint(a,page,x,y);
  const glyphs:Position[]=[];
  for(const run of a.runs(page)) {
    const chars=[...run.text];
    if(y<run.y||y>=run.y+run.h||x<run.x||x>=run.x+run.w||run.charX.length!==chars.length+1)continue;
    for(let i=0;i<chars.length;i++)if(x>=run.x+run.charX[i]&&x<run.x+run.charX[i+1]&&!/\s/u.test(chars[i])) {
      const p=a.position(run,run.charStart+i);
      if(p.kind==='cell'&&sameContainer(p,hit)&&p.cellPara===hit.cellPara&&hit.offset>=p.offset&&hit.offset<=p.offset+1)glyphs.push(p);
    }
  }
  if(glyphs.length!==1)return;
  const p=glyphs[0];if(p.kind!=='cell')return;
  a.validate(p);const list=a.list(p).listId,para=p.cellPara,chars=[...a.text(p)];
  if(a.call<any[]>('getControls').some(c=>c.list===list&&c.para===para))return;
  const stops=a.call<number[]>('getCaretStops',list,para),starts=a.call<number[]>('getWordStarts',list,para);
  const valid=(ns:number[])=>Array.isArray(ns)&&ns.length>0&&ns.every((n,i)=>Number.isSafeInteger(n)&&n>=0&&(!i||n>ns[i-1]));
  if(!valid(stops)||!valid(starts)||stops.length!==chars.length+1||starts.some(n=>!stops.includes(n)))throw Error('셀 선택 경계를 확인할 수 없습니다.');
  const scalar=(stream:number)=>{const n=a.call<{charIndex:number}>('getCharIndexAtStreamPos',list,para,stream).charIndex;
    if(!Number.isSafeInteger(n)||n<0||n>chars.length||stops[n]!==stream)throw Error('셀 선택 위치가 변경되었습니다.');return n;};
  const origin=stops[p.offset],begin=starts.findLast(n=>n<=origin),end=a.call<number|null>('getWordEnd',list,para,origin);
  if(begin===undefined||!Number.isSafeInteger(end)||!stops.includes(end!))return;
  const from=scalar(begin),to=scalar(end!);
  if(scalar(origin)!==p.offset||from>p.offset||to<=p.offset||chars.slice(from,to).some(c=>/\s/u.test(c)))return;
  const range:[Position,Position]=[{...p,offset:from},{...p,offset:to}];range.forEach(q=>a.validate(q));return range;
}

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
        buttons[i].style.left=`${at.x}px`;buttons[i].style.top=`${at.y-(i===0?24:0)}px`;
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
