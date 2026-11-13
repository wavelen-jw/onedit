import type {Interaction} from './interaction.js';
import type {Run} from './model.js';
import type {SelectionBox} from './selection-display.js';
import type {OwnerProjection} from './owner-projection.js';

// Display only. Logical selection/owner validation and command admission are
// never viewport-scoped. Unknown/pending surfaces retain authoritative reads.
export function visibleSelectionPages(pages:HTMLElement,viewport:HTMLElement):Set<number>|undefined {
  const bounds=viewport.getBoundingClientRect(),win=pages.ownerDocument.defaultView!;
  const top=Math.max(0,bounds.top),bottom=Math.min(win.innerHeight,bounds.bottom);
  const elements=pages.querySelectorAll<HTMLElement>('[data-page]');
  if(!elements.length||!Number.isFinite(top+bottom)||bottom<=top)return;
  const visible=new Set<number>();
  for(const element of elements){
    const page=Number(element.dataset.page),rect=element.getBoundingClientRect();
    if(!Number.isInteger(page)||!Number.isFinite(rect.top+rect.bottom)||rect.height<=0)return;
    if(rect.bottom>top&&rect.top<bottom)visible.add(page);
  }
  return visible;
}
type Entry={pages:HTMLElement;viewport:HTMLElement;key:string;surfaces:Element[];
  runs:Map<number,readonly Run[]>;boxes:readonly SelectionBox[]};
const entries=new WeakMap<OwnerProjection,Entry>();
/** @internal Lifetime ends at the existing synchronous Interaction read fence.
 * One selected-box projection, not a cross-event/document geometry cache. */
export function screenSelection(editor:Interaction,pages:HTMLElement,viewport:HTMLElement,
    owners?:OwnerProjection,sourceRuns:(page:number)=>readonly Run[]=(page)=>editor.adapter.runs(page)) {
  // A caret has no selected boxes and no second screen-run consumer. Keep the
  // authoritative getter/error path, without enumerating every page surface or
  // preparing a sharing entry that this publication cannot reuse. Current-page
  // preparation/caret/hit checks still belong to the enclosing painter.
  if(editor.selection.kind==='caret')return{visible:undefined,
    rectangles:editor.rectangles(sourceRuns,owners),runs:sourceRuns};
  if(editor.selection.kind==='cells'||editor.selection.kind==='table')return{visible:undefined,
    rectangles:editor.presentationRectangles(sourceRuns,owners),runs:sourceRuns};
  const visible=editor.selection.kind==='text'?visibleSelectionPages(pages,viewport):undefined;
  const surfaces=Array.from(pages.querySelectorAll<HTMLElement>(':scope > .page'))
    .filter(page=>!visible||visible.has(Number(page.dataset.page)));
  const key=JSON.stringify([editor.selection,visible?[...visible]:null]);
  const current=()=>owners?.isCurrent(editor.adapter)===true&&
    pages.ownerDocument.fonts?.status!=='loading'&&surfaces.every(page=>
      page.isConnected&&!page.hasAttribute('data-render-pending')&&page.querySelector(':scope > svg'));
  const old=owners&&current()?entries.get(owners):undefined;
  const same=old&&old.pages===pages&&old.viewport===viewport&&old.key===key&&
    old.surfaces.length===surfaces.length&&old.surfaces.every((svg,i)=>svg===surfaces[i].querySelector(':scope > svg'));
  if(same)return{visible,rectangles:structuredClone(old.boxes) as SelectionBox[],
    runs:(page:number)=>current()&&old.runs.has(page)?structuredClone(old.runs.get(page)!):sourceRuns(page)};
  const runs=new Map<number,readonly Run[]>();
  const read=(page:number)=>{
    if(visible&&!visible.has(page))return [];
    if(current()&&runs.has(page))return structuredClone(runs.get(page)!);
    const value=sourceRuns(page);if(current())runs.set(page,structuredClone(value));return value;
  };
  const rectangles=editor.rectangles(read,owners);
  if(owners&&current()&&key===JSON.stringify([editor.selection,visible?[...visible]:null])){
    const boxes=Object.freeze(rectangles.map(box=>Object.freeze({...box})));
    entries.set(owners,{pages,viewport,key,surfaces:surfaces.map(page=>page.querySelector(':scope > svg')!),runs,boxes});
  }
  return{visible,rectangles,runs:(page:number)=>visible&&!visible.has(page)?sourceRuns(page):read(page)};
}
export function releaseScreenSelection(owners?:OwnerProjection){if(owners)entries.delete(owners);}
