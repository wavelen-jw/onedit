import type { Interaction } from './interaction.js';
import { selectedPicture, pictureLayoutBoxes, type PictureLayoutBox } from './pictures.js';
import { sameFormatTarget } from './integration/a-format-input-guard.js';
import { pagePoint } from './integration/a-view-menu.js';
import type { Selection } from './model.js';
type Box = PictureLayoutBox;
export function pictureCanvasBoxes(editor:Interaction,page:number):Box[] {
  return pictureLayoutBoxes(editor.adapter,page);
}
export function pictureCanvasHit(editor:Interaction,page:number,x:number,y:number):Box|undefined {
  const contains=(c:{x:number;y:number;w:number;h:number})=>x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h;
  const candidates=pictureCanvasBoxes(editor,page).filter(b=>b.click&&contains(b));
  if(candidates.length!==1)return;
  const b=candidates[0];
  // Do not steal a table/other object's hit where Core boxes overlap. No inferred z-order.
  const others=(editor.adapter.call('getPageControlLayout',page).controls??[]).filter((c:any)=>!(c.type==='image'&&c.secIdx===b.sec&&c.paraIdx===b.para&&c.controlIdx===b.control));
  if(others.some((c:any)=>[c.x,c.y,c.w,c.h].every(Number.isFinite)&&contains(c)))return;
  return b;
}
export function proportionalPictureSize(width:number,height:number,dx:number,dy:number,handle:string){
  const w=width/75,h=height/75;
  const scale=handle==='east'?1+dx/w:handle==='south'?1+dy/h:1+(dx*w+dy*h)/(w*w+h*h);
  const next={width:Math.round(width*scale),height:Math.round(height*scale)};
  if(!Number.isFinite(scale)||scale<=0||Object.values(next).some(n=>!Number.isInteger(n)||n<100||n>72000))throw Error('그림 크기는 1~720pt 범위입니다. 원래 크기를 유지합니다.');
  return next;
}
export function mountPictureCanvas(pages:HTMLElement,editor:Interaction,actions:{busy:()=>boolean;changed:()=>void;selectionChanged?:()=>void;focus:()=>void;error:(e:unknown)=>void;selected?:(selecting:boolean)=>void}){
  type Drag={id:number;page:HTMLElement;box:Box;target:ReturnType<Interaction['capture']>;width:number;height:number;start:{x:number;y:number};handle:string;next:{width:number;height:number};invalid?:boolean};
  let drag:Drag|undefined;
  const selection=(b:Box):Selection=>({kind:'object',focus:{kind:'body',sec:b.sec,para:b.para,offset:0},control:b.control});
  const clear=()=>pages.querySelectorAll('.picture-selection').forEach(e=>e.remove());
  const draw=(b:Box,w=b.w,h=b.h)=>{clear();const page=pages.querySelector<HTMLElement>(`[data-page="${b.page}"]`);if(!page)return;
    const frame=document.createElement('div');frame.className='picture-selection';frame.setAttribute('aria-label','선택한 본문 그림');Object.assign(frame.style,{position:'absolute',left:b.x+'px',top:b.y+'px',width:w+'px',height:h+'px',border:'1px solid #087bbf',boxSizing:'border-box',pointerEvents:'none',zIndex:'3'});
    for(const [name,x,y] of [['east','100%','50%'],['south','50%','100%'],['corner','100%','100%']]){const handle=document.createElement('button');handle.type='button';handle.dataset.pictureHandle=name;handle.setAttribute('aria-label',name==='east'?'그림 오른쪽 크기 조절':name==='south'?'그림 아래 크기 조절':'그림 비율 크기 조절');handle.title='드래그하여 비율 유지 크기 변경 · Esc 취소';Object.assign(handle.style,{position:'absolute',left:x,top:y,transform:'translate(-50%,-50%)',width:'12px',height:'12px',padding:'0',border:'1px solid #087bbf',background:'white',pointerEvents:'auto',touchAction:'none',cursor:name==='east'?'ew-resize':name==='south'?'ns-resize':'nwse-resize'});frame.append(handle);}page.append(frame);
  };
  const currentBox=()=>{const s=editor.selection;if(s.kind!=='object'||s.focus.kind!=='body')return;selectedPicture(editor.adapter,s);editor.adapter.assertEditable(s.focus);
    const matches=Array.from(pages.querySelectorAll<HTMLElement>('.page')).flatMap(p=>pictureCanvasBoxes(editor,Number(p.dataset.page))).filter(b=>b.sec===s.focus.sec&&b.para===s.focus.para&&b.control===s.control);return matches.length===1?matches[0]:undefined;};
  const sync=()=>{clear();if(drag){drag=undefined;}if(actions.busy())return;try{const b=currentBox();if(b&&!selectedPicture(editor.adapter,editor.selection).props.sizeProtect)draw(b);}catch{/* unavailable selection has no handles */}};
  const stop=(error?:unknown)=>{drag=undefined;sync();if(error)actions.error(error);actions.focus();};
  const valid=(d:Drag)=>{if(actions.busy()||!d.page.isConnected||!sameFormatTarget(d.target,editor.capture()))throw Error('문서·선택 또는 작업 상태가 변경되어 그림 크기 조절을 취소했습니다.');const b=currentBox();if(!b||JSON.stringify(b)!==JSON.stringify(d.box))throw Error('그림 위치가 변경되었습니다. 다시 선택하세요.');};
  window.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
    const target=e.target as Element;if(target.closest('.object-grip'))return;
    const handle=target.closest<HTMLElement>('[data-picture-handle]'),page=target.closest<HTMLElement>('.page');if(!page||!pages.contains(page))return;
    let b:Box|undefined;
    if(handle){try{b=currentBox();}catch(error){e.preventDefault();e.stopImmediatePropagation();stop(error);return;}}
    else {const p=pagePoint(page,e.clientX,e.clientY);b=pictureCanvasHit(editor,Number(page.dataset.page),p.x,p.y);}
    if(!b)return;e.preventDefault();e.stopImmediatePropagation();
    try{if(actions.busy())throw Error('대화상자·입력 작업을 마친 후 그림을 선택하세요.');const s=selection(b);selectedPicture(editor.adapter,s);editor.adapter.assertEditable(s.focus);
      actions.selected?.(!handle);
      if(!handle){editor.selection=s;(actions.selectionChanged??actions.changed)();actions.focus();return;}
      const p=selectedPicture(editor.adapter,editor.selection).props;if(p.sizeProtect)throw Error('크기가 보호된 그림입니다.');
      drag={id:e.pointerId,page,box:b,target:editor.capture(),width:p.width,height:p.height,start:pagePoint(page,e.clientX,e.clientY),handle:handle.dataset.pictureHandle!,next:{width:p.width,height:p.height}};
    }catch(error){stop(error);}
  },true);
  window.addEventListener('pointermove',e=>{const d=drag;if(!d||e.pointerId!==d.id)return;e.preventDefault();e.stopImmediatePropagation();try{valid(d);const p=pagePoint(d.page,e.clientX,e.clientY);d.next=proportionalPictureSize(d.width,d.height,p.x-d.start.x,p.y-d.start.y,d.handle);d.invalid=false;draw(d.box,d.next.width/75,d.next.height/75);}catch(error){d.invalid=true;actions.error(error);}},true);
  window.addEventListener('pointerup',e=>{const d=drag;if(!d||e.pointerId!==d.id)return;e.preventDefault();e.stopImmediatePropagation();try{valid(d);if(d.invalid)throw Error('유효하지 않은 크기 조절은 적용하지 않았습니다.');drag=undefined;editor.execute({type:'picture',change:{action:'properties',...d.next}},d.target);actions.changed();actions.focus();}catch(error){stop(error);}},true);
  window.addEventListener('pointercancel',()=>{if(drag)stop();},true);
  window.addEventListener('blur',()=>{if(drag)stop();});
  window.addEventListener('keydown',e=>{if(!drag)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();stop();}else if(e.key!=='Shift'){stop();}},true);
  return {sync};
}
