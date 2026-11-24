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

// Only these transient marks are replaced when a selection moves. Page
// corners and document artwork have their own lifetimes.
const paintedSelectionLayers = new WeakMap<HTMLElement, Set<Element>>();

export function appendSelectionMark(pages: HTMLElement, layer: Element | null, mark: Element) {
  if (!layer) return;
  layer.append(mark);
  let layers = paintedSelectionLayers.get(pages);
  if (!layers) {
    layers = new Set<Element>();
    paintedSelectionLayers.set(pages, layers);
  }
  layers.add(layer);
}

export function clearSelectionMarks(pages: HTMLElement) {
  const layers = paintedSelectionLayers.get(pages);
  if (!layers) return;
  for (const layer of layers) {
    if (!pages.contains(layer)) continue;
    let mark = layer.lastElementChild;
    while (mark && !mark.classList.contains("body-corner-guides")) {
      mark.remove();
      mark = layer.lastElementChild;
    }
  }
  layers.clear();
}
