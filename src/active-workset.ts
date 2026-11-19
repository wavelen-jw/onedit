/** Rev10 web UI lifetime policy; never a document/command permission. */
export function activeWorkset(doc: Document): boolean {
  const w=doc.defaultView;
  return !!w && w.parent===w;
}
// Page tops in the wrapping layout are ordered. The first page intersecting Y
// can be an earlier sibling of a shorter page in the same mixed-size row.
export function* pageRectsFromY(pages: HTMLElement, top: number, bottom = Infinity) {
  const nodes = pages.children;
  const css = nodes.length > 16 ? pages.ownerDocument.defaultView?.getComputedStyle(pages) : undefined;
  const ordered = css?.display === 'flex' && css.flexDirection === 'row' &&
    css.flexWrap === 'wrap' && css.alignItems === 'flex-start' && css.writingMode === 'horizontal-tb';
  let start = 0;
  if (ordered) {
    let lo = 0, hi = nodes.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (nodes[mid].getBoundingClientRect().top <= top) lo = mid + 1;
      else hi = mid;
    }
    if (lo) {
      start = lo - 1;
      const rowTop = nodes[start].getBoundingClientRect().top;
      while (start > 0 && nodes[start - 1].getBoundingClientRect().top === rowTop) start--;
    }
  }
  for (let i = start; i < nodes.length; i++) {
    const page = nodes[i] as HTMLElement, rect = page.getBoundingClientRect();
    if (ordered && rect.top >= bottom) break;
    if (rect.bottom > top && rect.top < bottom) yield {page, rect, index: i};
  }
}
export function firstPageBelow(pages: HTMLElement, top: number) {
  for (const match of pageRectsFromY(pages, top)) return match;
  const page = pages.lastElementChild as HTMLElement | null;
  if (page) return {page, rect: page.getBoundingClientRect(), index: pages.children.length - 1};
}
export function activePageRange(pages:HTMLElement,viewport:HTMLElement,focus:number, bounds=viewport.getBoundingClientRect(), buffer=1):Set<number>|undefined {
  if(bounds.width<=0||bounds.height<=0||!Number.isSafeInteger(focus)||focus<0)return;
  const nodes=pages.children,visible:number[]=[];
  for (const {index,rect} of pageRectsFromY(pages,bounds.top,bounds.bottom)) {
    if (rect.right > bounds.left && rect.left < bounds.right) visible.push(index);
  }
  if(!visible.length)return;
  const result=new Set<number>([focus]);
  for(const n of visible)for(let p=Math.max(0,n-buffer);p<=Math.min(nodes.length-1,n+buffer);p++)result.add(p);
  const focused=pages.ownerDocument.activeElement?.closest<HTMLElement>('.page');
  if(focused&&pages.contains(focused))result.add(Number(focused.dataset.page));
  return result;
}
export function activeMenuDemand(root:HTMLDetailsElement):boolean {
  return !activeWorkset(root.ownerDocument)||root.open||root.dataset.activeWorksetDemand==='true';
}
/** A synchronous source-command demand, never a long-lived target receipt. */
export function withMenuDemand<T>(root:HTMLElement|undefined|null,read:()=>T):T {
  if(!root)return read();const old=root.dataset.activeWorksetDemand;
  root.dataset.activeWorksetDemand='true';
  try{return read();}finally{if(old===undefined)delete root.dataset.activeWorksetDemand;else root.dataset.activeWorksetDemand=old;}
}

export function displayedControl(node:HTMLElement):boolean {
  const doc=node.ownerDocument;
  if(!node.isConnected)return false;
  for(let p:HTMLElement|null=node;p;p=p.parentElement){
    if(p.hidden)return false;
    if(p instanceof HTMLDetailsElement&&!p.open&&
      !p.querySelector(':scope > summary')?.contains(node)&&p.dataset.activeWorksetDemand!=='true')return false;
    const style=doc.defaultView?.getComputedStyle(p);
    if(style?.display==='none'||style?.visibility==='hidden')return false;
  }
  return true;
}
