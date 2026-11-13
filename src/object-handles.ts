import {bodyVisualLines,type BodyVisualLine} from "./body-visual-lines.js";
import type {Interaction} from './interaction.js';
import {cellPath,copy,nested,type Position,type Selection} from './model.js';
import {fragmentClipboardObjects,selectedCutObject} from './object-clipboard.js';
import {captureParentTableCut} from './parent-table-cut.js';
import {sameFormatTarget} from './integration/a-format-input-guard.js';
import {pagePoint,pageScale} from './integration/a-view-menu.js';
import {prepareControlOffset} from './control-shortcuts.js';
import {RhwpAdapter} from './adapter.js';
import {siblingDocument} from './core-runtime.js';
import type {ClipboardData} from './clipboard.js';
import {registerPageChrome} from './page-layers.js';

type Box={page:number;x:number;y:number;w:number;h:number};
type Item={id:string;name:string;selection:Selection;inline:boolean;boxes:Box[]};
const tableKey=(p:Extract<Position,{kind:'cell'}>)=>JSON.stringify([p.sec,p.para,...cellPath(p).flatMap((v,i,all)=>[v.controlIndex,i===all.length-1?0:v.cellIndex,i===all.length-1?0:v.cellParaIndex])]);
const key=(s:Selection)=>s.kind==='table'?tableKey(s.focus):s.kind==='object'?JSON.stringify([s.focus.sec,s.focus.para,...(s.focus.kind==='cell'?cellPath(s.focus).flatMap(v=>[v.controlIndex,v.cellIndex,v.cellParaIndex]):[]),s.control]):'';

// Geometry comes from existing owner-bound cell boxes and exact layout indices.
// A page fragment never becomes an independent table or a truncated selection.
export function handleObjects(editor:Interaction):Item[]{
  const a=editor.adapter,model=a.call<any>('getCursorModel'),items:Item[]=[],seen=new Set<string>();
  for(const l of model.lists.filter((l:any)=>l.isCell&&l.row!==undefined&&l.cellIndex===0)){
    try{
      const p=a.listPosition(l,model.lists);if(p.kind!=='cell')continue;
      const id=tableKey(p);if(seen.has(id))continue;seen.add(id);
      const item=tableHandleObject(a,p);if(item)items.push(item);
    }catch(error){console.debug('rhwp:object-handle-owner',error);}
  }
  return items.concat(pictureHandleObjects(editor));
}

function tableHandleObject(a:RhwpAdapter,p:Extract<Position,{kind:'cell'}>,scoped?:ReadonlyArray<Readonly<ReturnType<RhwpAdapter["cells"]>[number]>>):Item|undefined{
  const cells=scoped??a.cells(p),boxes:Box[]=[];
  for(const page of new Set(cells.map(c=>c.pageIndex))){const cs=cells.filter(c=>c.pageIndex===page);
    const x=Math.min(...cs.map(c=>c.x)),y=Math.min(...cs.map(c=>c.y));
    boxes.push({page,x,y,w:Math.max(...cs.map(c=>c.x+c.w))-x,h:Math.max(...cs.map(c=>c.y+c.h))-y});}
  const inline=!nested(p)&&a.inline(p).some(t=>t.controlIndex===p.control);
  if(boxes.length&&boxes.every(b=>[b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>0&&b.h>0))
    return{id:tableKey(p),name:nested(p)?'중첩 표':'표',selection:{kind:'table',focus:p},inline,boxes};
}

function pictureHandleObjects(editor:Interaction,selected?:string):Item[]{
  const a=editor.adapter,items:Item[]=[];
  let pictures:ReturnType<typeof fragmentClipboardObjects>=[];
  try{pictures=fragmentClipboardObjects(a).filter(r=>r.kind==='그림'&&
    (selected===undefined||key({kind:'object',focus:r.focus,control:r.control})===selected));}catch(error){console.debug('rhwp:picture-handle-owner',error);}
  const layouts=pictures.length?Array.from({length:a.pageCount},(_,page)=>({page,controls:a.call('getPageControlLayout',page).controls??[]})):[];
  for(const r of pictures){
    const s:Selection={kind:'object',focus:r.focus,control:r.control},id=key(s),boxes:Box[]=[];
    for(const {page,controls}of layouts)for(const c of controls){
      if(c.type==='image'&&JSON.stringify(c.stableIndex)===id&&[c.x,c.y,c.w,c.h].every(Number.isFinite)&&c.w>0&&c.h>0)
        boxes.push({page,x:c.x,y:c.y,w:c.w,h:c.h});
    }
    if(boxes.length===1)items.push({id,name:'그림',selection:s,inline:!!r.props.treatAsChar,boxes});
  }
  return items;
}

function handleTarget(selection:Selection):Selection|undefined{
  if(selection.kind==='object')return copy(selection);
  const p=selection.focus;if(p.kind!=='cell')return;
  // Normalize only the last cell of this exact current path. Ancestor cell and
  // paragraph identities stay intact; the native owner check still runs below.
  return{kind:'table',focus:{...copy(p),cell:0,cellPara:0,offset:0}};
}

/** Presentation demand only. Body typing has no table/image handle demand.
 * A cell cursor materializes its one actual table; object selection its image.
 * Commands/drag continue using the complete authoritative handleObjects path. */
export function activeHandleObjects(editor:Interaction):Item[]{
  const target=handleTarget(editor.selection);if(!target)return[];
  if(target.kind==='table'&&target.focus.kind==='cell'){
    const item=tableHandleObject(editor.adapter,target.focus,editor.clickedTableDisplayGrid(target.focus,"grip"));return item?[item]:[];
  }
  return pictureHandleObjects(editor,key(target));
}

function sourceReason(editor:Interaction,item:Item){
  const p=item.selection.focus;
  if(item.selection.kind==='table'&&p.kind==='cell'&&nested(p))return '중첩 표는 전체 선택만 지원합니다. 이동은 기존 소유 경로의 원자 이동 계약이 필요합니다.';
  if(item.selection.kind==='object'&&p.kind==='cell'&&!item.inline)return '셀 안의 떠 있는 그림은 전체 선택만 지원합니다. 기존 셀 배치 위치 이동 계약이 필요합니다.';
  try{editor.adapter.assertEditable(p);if(item.selection.kind==='object'&&p.kind==='cell')selectedCutObject(editor.adapter,item.selection);if(!item.inline)prepareControlOffset(editor.adapter,item.selection,0,0);return '';}
  catch(error){return String(error).replace(/^Error: /,'');}
}
type Destination={position:Extract<Position,{kind:'body'}>;rect:ReturnType<Interaction['adapter']['rect']>};
function insertion(editor:Interaction,item:Item,page:number,x:number,y:number,lines:BodyVisualLine[]):Destination{
  const a=editor.adapter;
  // Admit the nearest actual text band across its whole horizontal extent,
  // including surrounding white space. The target is that visual line's start,
  // never a guessed paragraph zero or an offset inferred from pixel division.
  const distance=(l:BodyVisualLine)=>Math.max(l.top-y,0,y-l.bottom);
  const line=lines.filter(l=>x>=l.left-40&&x<=Math.max(l.right,l.left+24)+80&&distance(l)<=Math.max(12,(l.bottom-l.top)/2))
    .sort((a,b)=>distance(a)-distance(b)||Math.abs((a.top+a.bottom)/2-y)-Math.abs((b.top+b.bottom)/2-y))[0];
  if(!line)throw Error('지원되는 본문 글줄 가까이에 놓으세요.');
  const p=line.start.position;
  a.validate(p);a.assertEditable(p);
  if(p.kind!=='body'||p.sec!==item.selection.focus.sec||p.para===item.selection.focus.para)
    throw Error('같은 구역의 다른 본문 글줄에 놓으세요. 셀·원래 문단에는 놓을 수 없습니다.');
  a.assertTextOnly(p);
  if(a.hasBodyLayoutObject(p))throw Error('다른 개체가 있는 문단에는 놓을 수 없습니다.');
  return{position:p,rect:line.start.rect};
}

// Reuse immutable capture, exact existing Cut/Delete and Paste Commands. Nothing
// writes the OS clipboard. The outer existing History owns one rollback/Undo.
function relocate(editor:Interaction,item:Item,to:Destination['position'],wire:ClipboardData){
  const original=copy(editor.selection),typing=copy(editor.typing),block=editor.block,x=editor.preferredX;
  try{
    editor.selection=copy(item.selection);
    const captured=editor.capture();
    if(!wire.structured)throw Error('자체 완결 개체 캡처를 확인할 수 없습니다.');
    const source=item.selection.kind==='object'?selectedCutObject(editor.adapter,item.selection):undefined;
    const parent=item.selection.kind==='table'?captureParentTableCut(editor.adapter,item.selection):undefined;
    const toRef=editor.adapter.captureSelection({kind:'caret',focus:to});
    editor.selection=editor.history.atomic('move-inline-object',original,()=>{
      editor.execute(source?{type:'cut-object',source}:{type:'delete',backward:false},parent?{...captured,parentTableCut:parent}:captured);
      const resolved=editor.adapter.resolveSelection(toRef);
      if(resolved.kind!=='caret'||resolved.focus.kind!=='body')throw Error('이동할 본문 위치가 변경되었습니다.');
      editor.selection=resolved;
      const nestedWire=editor.clipboard.isNested(wire.html??'',wire.structured);
      if(nestedWire&&resolved.focus.offset!==0&&resolved.focus.offset!==editor.adapter.length(resolved.focus))
        editor.execute({type:'break'},editor.capture());
      editor.execute({type:'paste',...wire},editor.capture());
      // The target was text-only. Reidentify the single inserted root by its
      // actual returned paragraph range, never by a recycled ID or geometry.
      const end=editor.selection.focus;
      if(end.kind!=='body')throw Error('이동한 개체의 본문 소유 경로가 다릅니다.');
      const inserted=handleObjects(editor).filter(i=>i.selection.focus.sec===end.sec&&i.selection.focus.para>=resolved.focus.para&&i.selection.focus.para<=end.para&&
        (item.selection.kind==='table'?i.selection.kind==='table'&&!nested(i.selection.focus):i.selection.kind==='object'&&i.selection.focus.kind==='body'));
      if(inserted.length!==1||inserted[0].inline!==item.inline)throw Error('이동한 개체 한 개와 기존 배치를 재식별할 수 없어 원문을 복원합니다.');
      editor.selection=copy(inserted[0].selection);
      editor.adapter.exportChecked();return editor.selection;
    });
  }catch(error){editor.selection=original;editor.typing=typing;editor.block=block;editor.preferredX=x;throw error;}
}

export function mountObjectHandles(pages:HTMLElement,editor:Interaction,actions:{busy:()=>boolean;changed:()=>void;selectionChanged:()=>void;focus:()=>void;properties:()=>void|string;context:(x:number,y:number)=>void;error:(e:unknown)=>void}){
  const doc=pages.ownerDocument,win=doc.defaultView!,viewport=doc.getElementById('viewport')!;
  const status=doc.createElement('div');status.className='object-move-status';status.setAttribute('role','status');status.hidden=true;viewport.append(status);
  let items:Item[]=[],catalog:Item[]=[],catalogKey='',signature='',frame=0,task=0;
  let catalogDoc:RhwpAdapter['doc']|undefined;
  let mountedPages:{page:Element;surface:Element|null;pending:string|undefined}[]=[];
  type Drag={id:number;item:Item;box:Box;target:ReturnType<Interaction['capture']>;start:{x:number;y:number};moved:boolean;dx:number;dy:number;to?:Destination;reason:string;button:HTMLButtonElement;scale:number;wire?:ClipboardData;nestedWire?:boolean;fits:Map<string,string>;lines:Map<number,BodyVisualLine[]>};
  let drag:Drag|undefined,revealed:string|undefined;
  const outlines=()=>pages.querySelectorAll<HTMLElement>('.object-handle-outline');
  const emphasize=(id?:string)=>{for(const e of outlines())e.classList.toggle('is-active',e.dataset.objectId===id);};
  const reveal=(id?:string)=>{if(revealed===id)return;revealed=id;for(const e of pages.querySelectorAll<HTMLElement>('.object-grip,.object-handle-outline'))e.classList.toggle('is-revealed',e.dataset.objectId===id);};
  const clearPreview=()=>{pages.querySelectorAll('.object-move-preview').forEach(e=>e.remove());status.hidden=true;};
  const cancel=()=>{reveal();if(!drag)return;const d=drag;drag=undefined;d.button.style.cursor='';if(d.button.hasPointerCapture(d.id))d.button.releasePointerCapture(d.id);clearPreview();emphasize();actions.focus();};
  const pageElement=(n:number)=>pages.querySelector<HTMLElement>(`.page[data-page="${n}"]`);
  const selected=(item:Item)=>key(editor.selection)===item.id;
  function sync(){
    if(drag){if(!sameFormatTarget(drag.target,editor.capture())||actions.busy())cancel();else return;}
    const target=handleTarget(editor.selection);
    if(!target||actions.busy()){
      if(items.length||catalog.length){pages.querySelectorAll('.object-grip,.object-handle-outline').forEach(e=>e.remove());}
      items=[];catalog=[];catalogKey=signature='';catalogDoc=undefined;mountedPages=[];revealed=undefined;status.hidden=true;
      return;
    }
    // The existing presentation catalog is now restricted to the current owner.
    // Keep its previous revision lifetime and additionally invalidate on native
    // document replacement and font/DPR/DPI changes. Unknown environments stay fresh.
    const a=editor.adapter,environment=a.localBodyEnvironmentToken(),targetKey=key(target);
    const stamp=JSON.stringify([a.documentId,a.revision,a.scope,targetKey,environment]);
    const present=pages.querySelector('.object-grip');
    const surfaces=Array.from(pages.children,page=>({page,surface:page.firstElementChild,pending:(page as HTMLElement).dataset.renderPending}));
    const samePages=surfaces.length===mountedPages.length&&surfaces.every((row,i)=>
      row.page===mountedPages[i].page&&row.surface===mountedPages[i].surface&&row.pending===mountedPages[i].pending);
    if(environment!==undefined&&catalogDoc===a.doc&&stamp===signature&&present&&samePages){
      // A selection-only click must keep the same native button for its second
      // click/dblclick sequence. Geometry still invalidates on document/revision.
      const id=key(editor.selection);
      for(const button of pages.querySelectorAll<HTMLElement>('.object-grip')){const pressed=String(button.dataset.objectId===id);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);}
      for(const outline of outlines())outline.classList.toggle('is-selected',outline.dataset.objectId===id);
      return;
    }
    signature=stamp;mountedPages=surfaces;
    pages.querySelectorAll('.object-grip,.object-handle-outline').forEach(e=>e.remove());items=[];revealed=undefined;
    const identity=JSON.stringify([a.documentId,a.revision,targetKey,environment]);
    try{if(environment===undefined||catalogDoc!==a.doc||identity!==catalogKey){catalog=activeHandleObjects(editor);catalogKey=identity;catalogDoc=a.doc;}items=catalog;}catch(error){catalog=[];catalogKey='';catalogDoc=undefined;console.debug('rhwp:object-handles',error);return;}
    const occupied:{page:number;x:number;y:number}[]=[];
    // Inner objects get first choice; outer handles find a free position.
    for(const item of [...items].sort((a,b)=>a.boxes[0].w*a.boxes[0].h-b.boxes[0].w*b.boxes[0].h))for(const b of item.boxes){
      const page=pageElement(b.page);if(!page||page.hasAttribute('data-render-pending'))continue;
      const line=doc.createElement('div');line.className='object-handle-outline';line.dataset.objectId=item.id;line.dataset.selectionLabel=`${item.name} 전체`;
      line.classList.toggle('is-selected',selected(item));line.setAttribute('aria-hidden','true');
      Object.assign(line.style,{left:b.x+'px',top:b.y+'px',width:b.w+'px',height:b.h+'px'});registerPageChrome(page,line);page.append(line);
      const width=parseFloat(page.style.width),height=parseFloat(page.style.height);
      const clampX=(x:number)=>Math.max(1,Math.min(width-29,x)),clampY=(y:number)=>Math.max(1,Math.min(height-31,y));
      const candidates=Array.from({length:Math.ceil(height/34)},(_,slot)=>[clampY(b.y+slot*34),clampY(b.y-slot*34)])
        .flat().flatMap(y=>[clampX(b.x-40),clampX(b.x+b.w+16)].map(x=>({x,y})));
      const place=candidates.find(({x,y})=>!occupied.some(p=>p.page===b.page&&Math.abs(p.x-x)<29&&Math.abs(p.y-y)<31));
      if(!place){console.debug('rhwp:object-handle-space',item.id);continue;}
      const {x,y}=place;
      occupied.push({page:b.page,x,y});
      const button=doc.createElement('button');button.type='button';button.className='object-grip';button.textContent='⋮⋮';button.dataset.objectId=item.id;
      button.dataset.objectKind=item.name;button.dataset.objectPage=String(b.page);
      button.setAttribute('aria-label',`${item.name} 전체 선택 · 선택하거나 끌어서 이동`);button.title=`${item.name} 전체 선택 · 선택하거나 끌어서 이동${item.boxes.length>1?' · 여러 쪽에 걸친 같은 표 전체':''}`;
      button.setAttribute('aria-pressed',String(selected(item)));
      Object.assign(button.style,{left:x+'px',top:y+'px'});
      const hint=()=>{emphasize(item.id);if(!drag){status.hidden=false;status.textContent=`${item.name} · 선택하거나 끌어서 이동`;}};
      const leave=()=>{if(!drag){emphasize();status.hidden=true;}};
      button.addEventListener('pointerenter',hint);button.addEventListener('pointerleave',leave);
      button.addEventListener('focus',hint);button.addEventListener('blur',leave);
      // Keyboard/assistive click has no pointer sequence and never initiates a move.
      button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(e.detail!==0||drag||actions.busy())return;choose(item);});
      registerPageChrome(page,button);page.append(button);
    }
  }
  function choose(item:Item){editor.adapter.validate(item.selection.focus);editor.selection=copy(item.selection);editor.block=false;editor.preferredX=undefined;actions.selectionChanged();sync();actions.focus();}
  const valid=(d:Drag)=>{
    if(actions.busy()||!d.button.isConnected||!sameFormatTarget(d.target,editor.capture()))throw Error('문서·선택이 변경되어 이동을 취소했습니다.');
    const current=handleObjects(editor).find(i=>i.id===d.item.id);
    if(!current||JSON.stringify(current)!==JSON.stringify(d.item))throw Error('개체 소유권·위치가 변경되어 이동을 취소했습니다.');
  };
  function preview(e:PointerEvent,d:Drag){
    clearPreview();d.to=undefined;d.reason=sourceReason(editor,d.item);
    const origin=pageElement(d.box.page)!;if(pageScale(origin)!==d.scale)d.reason='배율이 변경되어 이동을 취소합니다.';
    const page=doc.elementsFromPoint(e.clientX,e.clientY).map(e=>e.closest<HTMLElement>('.page')).find(p=>p&&pages.contains(p));
    const overlay=doc.createElement('div');overlay.className='object-move-preview';
    if(!d.reason)try{
      if(!page)throw Error('문서 페이지 안에 놓으세요.');
      const point=pagePoint(page,e.clientX,e.clientY);
      if(d.item.inline){const index=Number(page.dataset.page);if(!d.lines.has(index))d.lines.set(index,bodyVisualLines(editor,index));
        d.to=insertion(editor,d.item,index,point.x,point.y,d.lines.get(index)!);const r=d.to.rect;
        // Capture once without changing the live selection. For the existing
        // table-profile importer, ask its actual admission checks on a detached
        // sibling. Width/height refusal is shown before drop, without deleting
        // anything or rewriting the imported table's dimensions.
        if(!d.wire){d.wire=editor.copyClipboard(d.item.selection);d.nestedWire=editor.clipboard.isNested(d.wire.html,d.wire.structured);}
        if(d.nestedWire){
          const targetKey=JSON.stringify(d.to.position);
          if(!d.fits.has(targetKey)){
            const probe=new RhwpAdapter(siblingDocument(editor.adapter.doc,editor.adapter.exportChecked().bytes));
            try{let target=d.to.position;
              if(target.offset!==0&&target.offset!==probe.length(target))target=probe.split(target) as Destination['position'];
              editor.clipboard.pasteNested(probe,target,d.wire.html,d.wire.structured);d.fits.set(targetKey,'');}
            catch(error){d.fits.set(targetKey,String(error).replace(/^(?:UnsupportedTableOperation|Error): /,''));console.debug('rhwp:object-drop-preflight',error);}
            finally{probe.doc.free();}
          }
          if(d.fits.get(targetKey))throw Error(d.fits.get(targetKey));
        }
        Object.assign(overlay.style,{left:r.x+'px',top:r.y+'px',width:'2px',height:r.height+'px'});pageElement(r.pageIndex)?.append(overlay);
      }else{
        if(page!==origin)throw Error('떠 있는 개체는 현재 쪽의 배치 위치로만 옮길 수 있습니다.');
        const start=pagePoint(origin,d.start.x,d.start.y);d.dx=Math.round((point.x-start.x)*75);d.dy=Math.round((point.y-start.y)*75);
        prepareControlOffset(editor.adapter,d.item.selection,d.dx,d.dy);
        const nx=d.box.x+d.dx/75,ny=d.box.y+d.dy/75;
        if(nx<0||ny<0||nx+d.box.w>parseFloat(origin.style.width)||ny+d.box.h>parseFloat(origin.style.height))throw Error('개체가 현재 쪽 밖으로 나가는 위치에는 놓을 수 없습니다.');
        Object.assign(overlay.style,{left:nx+'px',top:ny+'px',width:d.box.w+'px',height:d.box.h+'px'});origin.append(overlay);
      }
    }catch(error){d.reason=String(error).replace(/^Error: /,'');}
    d.button.style.cursor=d.reason?'not-allowed':'grabbing';
    status.hidden=false;status.textContent=d.reason||`${d.item.inline?'본문 삽입 위치':'기존 배치 위치'}로 이동 · 놓아 확정 · Esc 취소`;
  }
  const down=(e:PointerEvent)=>{
    const button=(e.target as Element).closest<HTMLButtonElement>('.object-grip');if(!button||!pages.contains(button)||e.button!==0)return;
    e.preventDefault();e.stopImmediatePropagation();if(actions.busy()||editor.adapter.transientEdit||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
    const item=items.find(i=>i.id===button.dataset.objectId),box=item?.boxes.find(b=>b.page===Number(button.dataset.objectPage));if(!item||!box)return;
    drag={id:e.pointerId,item,box,target:editor.capture(),start:{x:e.clientX,y:e.clientY},moved:false,dx:0,dy:0,reason:'',button,scale:pageScale(pageElement(box.page)!),fits:new Map(),lines:new Map()};
    button.setPointerCapture(e.pointerId);emphasize(item.id);
  };
  const move=(e:PointerEvent)=>{const d=drag;
    if(!d){
      // Presentation only: use the already resolved object boxes, never query
      // Core or change selection during hover. The smallest box owns overlaps.
      const target=e.target instanceof Element?e.target:undefined,grip=target?.closest<HTMLElement>('.object-grip'),page=target?.closest<HTMLElement>('.page');
      if(e.buttons||!page||!pages.contains(page)){reveal();return;}
      if(grip){reveal(grip.dataset.objectId);return;}
      // A fresh-render placeholder or print-hidden page has no interactive
      // geometry yet. Hover never admits an edit; leave drag validation intact.
      if(!(parseFloat(page.style.width)>0&&page.getBoundingClientRect().width>0)){reveal();return;}
      const point=pagePoint(page,e.clientX,e.clientY),index=Number(page.dataset.page);
      let near:Item|undefined,area=Infinity;
      for(const item of items)for(const b of item.boxes)if(b.page===index&&b.w*b.h<area&&point.x>=b.x-40&&point.x<=b.x+b.w+16&&point.y>=b.y-4&&point.y<=b.y+b.h+4){near=item;area=b.w*b.h;}
      reveal(near?.id);return;
    }
    if(e.pointerId!==d.id)return;e.preventDefault();e.stopImmediatePropagation();
    if(Math.hypot(e.clientX-d.start.x,e.clientY-d.start.y)<6&&!d.moved)return;d.moved=true;
    if(!sameFormatTarget(d.target,editor.capture())||actions.busy()){cancel();return;}preview(e,d);};
  const up=(e:PointerEvent)=>{const d=drag;if(!d||e.pointerId!==d.id)return;e.preventDefault();e.stopImmediatePropagation();
    try{valid(d);if(!d.moved){drag=undefined;choose(d.item);return;}
      preview(e,d);if(d.reason){drag=undefined;clearPreview();status.hidden=false;status.textContent=d.reason;return;}
      drag=undefined;clearPreview();const original=copy(editor.selection);
      if(d.item.inline){if(!d.to||!d.wire)throw Error('본문 삽입 위치·개체 캡처를 확인할 수 없습니다.');relocate(editor,d.item,d.to.position,d.wire);}
      else {editor.selection=copy(d.item.selection);try{editor.execute({type:'control-offset',dx:d.dx,dy:d.dy},editor.capture());}catch(error){editor.selection=original;throw error;}}
      signature='';actions.changed();sync();actions.focus();
    }catch(error){drag=undefined;clearPreview();actions.error(error);actions.focus();}
    finally{d.button.style.cursor='';emphasize();}
  };
  const keydown=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(drag){e.preventDefault();e.stopImmediatePropagation();cancel();}else if((e.target as Element)?.closest?.('.object-grip')){e.preventDefault();e.stopImmediatePropagation();emphasize();actions.focus();}};
  // Resolve the grip's owner, never the neighboring ink under its screen box.
  // The existing properties/context entrances capture this fresh selection.
  const ownGrip=(e:MouseEvent)=>{
    const button=(e.target as Element)?.closest?.<HTMLButtonElement>('.object-grip');if(!button||!pages.contains(button))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(drag||actions.busy()||editor.adapter.transientEdit||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey)return;
    try{
      const item=items.find(i=>i.id===button.dataset.objectId),current=item&&handleObjects(editor).find(i=>i.id===item.id);
      if(!item||!current||JSON.stringify(item)!==JSON.stringify(current))throw Error('개체 소유권·위치가 변경되었습니다. 다시 선택하세요.');
      choose(current);status.hidden=true;
      if(e.type==='dblclick'){const reason=actions.properties();if(reason){status.hidden=false;status.textContent=reason;}}
      else actions.context(e.clientX,e.clientY);
    }catch(error){actions.error(error);actions.focus();}
  };
  win.addEventListener('pointerdown',down,true);win.addEventListener('pointermove',move,true);win.addEventListener('pointerup',up,true);
  win.addEventListener('dblclick',ownGrip,true);win.addEventListener('contextmenu',ownGrip,true);
  win.addEventListener('pointercancel',cancel,true);win.addEventListener('blur',cancel);win.addEventListener('keydown',keydown,true);
  // These passive handles are not the document ink/caret. Their all-table
  // geometry must not occupy the input's next animation frame. Use the same
  // after-frame task boundary as menu projection; commands still revalidate
  // their live owner synchronously. A menu refresh may already have rebuilt
  // these exact page elements, so sync's surface check avoids a second rebuild.
  const schedule=()=>{if(frame||task)return;frame=win.requestAnimationFrame(()=>{frame=0;task=win.setTimeout(()=>{task=0;sync();},0);});};
  // An applied Core font environment is a layout boundary even when a supply
  // token repeats. Never retain a drag or current-owner geometry across it.
  const fontLayout=()=>{cancel();catalogKey=signature='';catalogDoc=undefined;sync();};
  doc.addEventListener('rhwp:font-layout',fontLayout);
  // Caret/cell-guide SVGs repaint inside .overlay. They do not replace a page
  // and must not tear down a focused or hovered handle on every paint.
  const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'||Array.from(r.addedNodes).some(n=>n instanceof Element&&
    (r.target===pages&&n.matches('.page')||r.target instanceof Element&&r.target.matches('.page')&&n.matches('svg,canvas')))))schedule();});
  observer.observe(pages,{childList:true,subtree:true,attributes:true,attributeFilter:['data-render-pending']});
  sync();
  return{sync,dispose(){cancel();observer.disconnect();doc.removeEventListener('rhwp:font-layout',fontLayout);win.cancelAnimationFrame(frame);win.clearTimeout(task);status.remove();pages.querySelectorAll('.object-grip,.object-handle-outline').forEach(e=>e.remove());win.removeEventListener('pointerdown',down,true);win.removeEventListener('pointermove',move,true);win.removeEventListener('pointerup',up,true);win.removeEventListener('pointercancel',cancel,true);win.removeEventListener('blur',cancel);win.removeEventListener('keydown',keydown,true);win.removeEventListener('dblclick',ownGrip,true);win.removeEventListener('contextmenu',ownGrip,true);}};
}
