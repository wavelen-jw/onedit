/** Presentation-only tabs. Moving existing fields never changes their values/disabled state. */
export function managerTabs(root: HTMLElement, groups: readonly (readonly [string,string])[], group: (child: HTMLElement) => string) {
  const children=[...root.children] as HTMLElement[], nav=document.createElement("nav");nav.className="manager-tabs";nav.setAttribute("role","tablist");
  const panels=new Map<string,HTMLElement>(),buttons=new Map<string,HTMLButtonElement>();
  const activate=(id:string)=>{root.dataset.managerTab=id;for(const[key,panel]of panels)panel.hidden=key!==id;for(const[key,b]of buttons){b.setAttribute("aria-selected",String(key===id));b.tabIndex=key===id?0:-1;}};
  groups.forEach(([id,label],index)=>{const b=document.createElement("button"),panel=document.createElement("section");b.type="button";b.textContent=label;b.dataset.managerTab=id;b.id=root.id+"-tab-"+id;b.setAttribute("role","tab");panel.id=root.id+"-panel-"+id;panel.setAttribute("role","tabpanel");panel.setAttribute("aria-labelledby",b.id);b.setAttribute("aria-controls",panel.id);panels.set(id,panel);buttons.set(id,b);nav.append(b);b.onclick=()=>activate(id);b.addEventListener("keydown",e=>{if(e.isComposing||e.keyCode===229||e.altKey||e.ctrlKey||e.metaKey||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();e.stopPropagation();const n=e.key==="Home"?0:e.key==="End"?groups.length-1:(index+(e.key==="ArrowRight"?1:-1)+groups.length)%groups.length;activate(groups[n][0]);buttons.get(groups[n][0])!.focus();});});
  for(const child of children)(panels.get(group(child))??panels.get(groups[0][0])!).append(child);
  root.append(nav,...panels.values());activate(panels.has(root.dataset.managerTab??"")?root.dataset.managerTab!:groups[0][0]);
  return{activate};
}
export function visibleManagerControls(form: HTMLElement) {
  return [...form.querySelectorAll<HTMLElement>('button,input,select')].filter(n=>n.tabIndex>=0&&!(n as HTMLInputElement).disabled&&!n.closest('[hidden]'));
}
