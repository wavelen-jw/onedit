// Screen chrome is not part of Core's validated SVG. Recognize only exact
// elements made by the owning UI, never a class-name lookalike or a hidden SVG.
const owners=new WeakMap<Element,HTMLElement>();
export function registerPageChrome(page:HTMLElement,element:HTMLElement){owners.set(element,page);}
export function isPageChrome(page:Element,element:Element):boolean{return owners.get(element)===page;}
export function hasPageLayers(page:HTMLElement,svg:SVGSVGElement):boolean{
  if(page.firstElementChild!==svg||!page.children[1]?.classList.contains('overlay'))return false;
  for(let i=2;i<page.children.length;i++)if(owners.get(page.children[i])!==page)return false;
  return true;
}
