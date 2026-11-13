/** Rev10 web UI lifetime policy; never a document/command permission. */
export function activeWorkset(doc: Document): boolean {
  const w=doc.defaultView;
  return !!w && w.parent===w;
}
export function activePageRange(pages:HTMLElement,viewport:HTMLElement,focus:number):Set<number>|undefined {
  const bounds=viewport.getBoundingClientRect();
  if(bounds.width<=0||bounds.height<=0||!Number.isSafeInteger(focus)||focus<0)return;
  const nodes=Array.from(pages.children) as HTMLElement[],visible:number[]=[];
  for(let i=0;i<nodes.length;i++){const r=nodes[i].getBoundingClientRect();
    if(r.bottom>bounds.top&&r.top<bounds.bottom&&r.right>bounds.left&&r.left<bounds.right)visible.push(i);}
  if(!visible.length)return;
  const result=new Set<number>([focus]);
  for(const n of visible)for(let p=Math.max(0,n-1);p<=Math.min(nodes.length-1,n+1);p++)result.add(p);
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
