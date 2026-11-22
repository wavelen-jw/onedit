type Anchor={page:number;x:number;y:number;screenX:number;screenY:number};

/** Layout only: actual page boxes and editor width decide each wrapping row. */
export function mountAutoPageLayout(pages:HTMLElement,viewport:HTMLElement){
  let signature='',remembered:Anchor|undefined;
  let boxInputs='', pageGeometryChanged=true;
  const pageStyles=new WeakMap<HTMLElement,{inline:string|null;pending:boolean;layout:string}>();
  // Pending fixed-size ink changes visibility, not page packing. Compare inline
  // layout inputs before asking the browser for computed style/geometry.
  // Keep every other property (including unknown future properties) so their
  // changes still take the existing full refresh and anchor-preservation path.
  const layoutStyle=(page:HTMLElement)=>JSON.stringify(Array.from(page.style)
    .filter(name=>name!=='visibility'&&!(name==='content-visibility'&&
      page.dataset.renderPending&&page.style.contentVisibility==='hidden'&&
      /^\d+(?:\.\d+)?px$/.test(page.style.width)&&/^\d+(?:\.\d+)?px$/.test(page.style.height)))
    .map(name=>[name,page.style.getPropertyValue(name),page.style.getPropertyPriority(name)]));
  function updatePageStyle(page:HTMLElement) {
    const inline = page.getAttribute('style');
    const pending = Boolean(page.dataset.renderPending);
    const previous = pageStyles.get(page);
    if (previous && previous.inline === inline && previous.pending === pending) return false;
    const layout = layoutStyle(page);
    pageStyles.set(page, {inline, pending, layout});
    return previous?.layout !== layout;
  }
  const list=()=>Array.from(pages.querySelectorAll<HTMLElement>(':scope>.page'));
  const scale=()=>Number.parseFloat(pages.style.getPropertyValue('zoom'))||1;
  const anchor=():Anchor|undefined=>{
    const v=viewport.getBoundingClientRect(),all=list(),s=scale();
    const visible=(r:DOMRect)=>r.bottom>v.top+viewport.clientTop&&r.top<v.bottom&&r.right>v.left&&r.left<v.right;
    const caret=pages.querySelector<HTMLElement>('.caret'),cr=caret?.getBoundingClientRect();
    const page=cr&&visible(cr)?caret!.closest<HTMLElement>('.page'):all.find(p=>visible(p.getBoundingClientRect()));
    if(!page)return;
    const r=page.getBoundingClientRect(),x=cr&&caret?.closest('.page')===page&&visible(cr)?cr.left:Math.max(r.left,v.left+viewport.clientLeft+16),y=cr&&caret?.closest('.page')===page&&visible(cr)?cr.top:Math.max(r.top,v.top+viewport.clientTop+16);
    return{page:Number(page.dataset.page),x:(x-r.left)/s,y:(y-r.top)/s,screenX:x-v.left,screenY:y-v.top};
  };
  const refresh=(keep?:Anchor)=>{
    readPageChanges(observer.takeRecords());
    const s=scale(),vp=getComputedStyle(viewport),box=getComputedStyle(pages);
    const n=(v:string)=>parseFloat(v)||0;
    const available=(viewport.clientWidth-n(vp.paddingLeft)-n(vp.paddingRight))/s-n(box.paddingLeft)-n(box.paddingRight);
    const inputs=JSON.stringify([available,s,box.paddingLeft,box.paddingRight]);
    if(!pageGeometryChanged && boxInputs===inputs)return false;
    const all=list();for(const page of all)updatePageStyle(page);
    const widths=all.map(p=>n(p.style.width)),heights=all.map(p=>n(p.style.height));
    boxInputs=inputs;pageGeometryChanged=false;
    const key=JSON.stringify([available,s,widths,heights,box.paddingLeft,box.paddingRight]);if(key===signature)return false;
    const before=keep??remembered??anchor();signature=key;
    // An oversized page may overflow by itself; it must not enlarge the
    // wrapping width used by the other, smaller pages in this document.
    const limit=Math.max(available,1),gap=24;
    let row=0,packed=0;
    for(const width of widths){if(row&&row+gap+width>limit+.01){packed=Math.max(packed,row);row=0;}row=row?row+gap+width:width;}
    packed=Math.max(packed,row,1);const width=(Math.min(packed,limit)+n(box.paddingLeft)+n(box.paddingRight))+'px';if(pages.style.width!==width)pages.style.width=width;
    if(before){const page=all.find(p=>Number(p.dataset.page)===before.page);if(page){const r=page.getBoundingClientRect(),v=viewport.getBoundingClientRect();viewport.scrollLeft+=r.left+before.x*s-v.left-before.screenX;viewport.scrollTop+=r.top+before.y*s-v.top-before.screenY;}}
    remembered=anchor();return true;
  };
  const note=()=>{remembered=anchor();};viewport.addEventListener('scroll',note,{passive:true});
  // Page/SVG production is owned by render. Geometry is laid out before the
  // next viewport refresh; highlight/caret mutations are not layout inputs.
  function readPageChanges(records: MutationRecord[]) {
    for(const {target,type,attributeName,addedNodes,removedNodes} of records){
      if(target===pages){
        if(type!=='childList'){pageGeometryChanged=true;continue;}
        const [added]=addedNodes, [removed]=removedNodes;
        const old=removed instanceof HTMLElement ? pageStyles.get(removed) : undefined;
        // SVG publication can replace the page at the same slot. Its last
        // observed box is sufficient only for a one-for-one equal replacement.
        if(addedNodes.length===1&&removedNodes.length===1&&added instanceof HTMLElement&&
          added.matches('.page')&&old&&old.layout===layoutStyle(added))updatePageStyle(added);
        else pageGeometryChanged=true;
      }
      if(type!=='attributes'||!(target instanceof HTMLElement)||target.parentElement!==pages)continue;
      if(target.matches('.page')){
        if(updatePageStyle(target))pageGeometryChanged=true;
      }else if(attributeName==='class'&&pageStyles.delete(target))pageGeometryChanged=true;
    }
  }
  const observer=new MutationObserver(records=>{readPageChanges(records);if(pageGeometryChanged)refresh();});
  observer.observe(pages,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','data-render-pending']});
  return{anchor,refresh,dispose(){observer.disconnect();viewport.removeEventListener('scroll',note);}};
}
