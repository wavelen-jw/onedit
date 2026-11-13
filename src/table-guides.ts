import type { Interaction } from "./interaction.js";
import { nested, type CellBox, type Position } from "./model.js";

export type TableGuideMode="all"|"selected"|"hidden";
export const tableGuideModes=[{id:"all",label:"항상 표시"},{id:"selected",label:"선택한 표만"},{id:"hidden",label:"숨김"}] as const;
// Session view preference, not document/History/serialized state or a geometry cache.
const modes=new WeakMap<Interaction,TableGuideMode>(),failures=new WeakMap<Interaction,string>();
export const tableGuideState=(editor:Interaction)=>({mode:modes.get(editor)??"selected",reason:failures.get(editor)??""});
export function setTableGuideMode(editor:Interaction,mode:TableGuideMode){
  if(!tableGuideModes.some(m=>m.id===mode))throw Error("지원하지 않는 표 보조선 표시입니다.");
  modes.set(editor,mode);
}
type Edge={axis:"x"|"y";line:number;start:number;end:number;visible:boolean};
// Core page cell boxes are rounded to 0.1 CSSpx. Only the overlay joins those
// adjacent paint edges; this tolerance never feeds document geometry or hits.
const sameLine=(a:Pick<Edge,"axis"|"line">,b:Pick<Edge,"axis"|"line">)=>a.axis===b.axis&&Math.abs(a.line-b.line)<.11;
export function missingTableEdges(cells:{box:Pick<CellBox,"x"|"y"|"w"|"h">;borders:Record<string,{type:number}>;top?:boolean;bottom?:boolean}[]):Omit<Edge,"visible">[]{
  const edges:Edge[]=[];
  for(const {box:c,borders,top,bottom}of cells){
    if(![c.x,c.y,c.w,c.h].every(Number.isFinite)||c.w<=0||c.h<=0)throw Error("표 보조선 경계를 확인할 수 없습니다.");
    for(const [side,axis,line,start,end]of [
      ["Left","x",c.x,c.y,c.y+c.h],["Right","x",c.x+c.w,c.y,c.y+c.h],
      ["Top","y",c.y,c.x,c.x+c.w],["Bottom","y",c.y+c.h,c.x,c.x+c.w],
    ] as const){
      if(side==="Top"&&top===false||side==="Bottom"&&bottom===false)continue;
      const type=borders["border"+side]?.type;
      if(!Number.isInteger(type)||type<0)throw Error("현재 셀의 실제 테두리 조회 미지원");
      edges.push({axis,line,start,end,visible:type!==0});
    }
  }
  const result:Omit<Edge,"visible">[]=[];
  for(const edge of edges.filter(e=>!e.visible)){
    let spans=[[edge.start,edge.end]];
    // The opposite cell's real border wins, including a partial shared edge
    // beside a merged cell. Never draw a helper over that real line.
    for(const real of edges.filter(e=>e.visible&&sameLine(e,edge)))
      spans=spans.flatMap(([a,b])=>real.end<=a||real.start>=b?[[a,b]]:
        [[a,Math.min(b,real.start)],[Math.max(a,real.end),b]].filter(([x,y])=>y-x>.11));
    for(const [start,end]of spans)result.push({axis:edge.axis,line:edge.line,start,end});
  }
  const unique:Omit<Edge,"visible">[]=[];
  for(const edge of result.sort((a,b)=>a.axis.localeCompare(b.axis)||a.line-b.line||a.start-b.start)){
    const last=unique.at(-1);
    if(last&&sameLine(last,edge)&&last.end>=edge.start-.11)last.end=Math.max(last.end,edge.end);
    else unique.push({...edge});
  }
  return unique;
}
/** Screen overlay only, inside the SAME cleared/repainted selection layer. */
export function paintTableGuides(editor:Interaction,pages:HTMLElement){
  failures.delete(editor);const mode=tableGuideState(editor).mode;if(mode==="hidden")return;
  const a=editor.adapter,focus=editor.selection.focus;
  if(mode==="selected"&&focus.kind!=="cell")return;
  try{
    // Paint-node paraIdx is local inside nested tables and is not a body
    // address. Resolve the existing cursor model's full table owner/path first.
    const warnings:string[]=[];
    const owners:Position[]=mode==="selected"?[focus]:a.call("getCursorModel").lists
      .filter((l:any)=>l.isCell&&l.row!==undefined&&l.cellIndex===0).flatMap((l:any)=>{
        try{return[a.listPosition(l,a.call("getCursorModel").lists)];}
        catch(error){warnings.push(String(error));return[];}
      });
    const tables=owners.flatMap(owner=>{
      try{
        if(owner.kind!=="cell")throw Error("표 보조선 소유권을 확인할 수 없습니다.");
        const scoped=mode==="selected"?editor.clickedTableDisplayGrid(owner,"guides"):undefined;
        const click=scoped&&editor.clickedTableDisplay();
        const boxes=scoped??a.cells(owner),props=new Map<number,Record<string,{type:number}>>();
        for(const box of boxes)if(!props.has(box.cellIdx))props.set(box.cellIdx,click&&editor.clickedTableDisplay()===click?
          a.readClickedTableGuideBorders(click.position,box.cellIdx):nested(owner)?
          a.call("getCellPropertiesByPath",owner.sec,owner.para,a.path(owner),box.cellIdx):
          a.call("getCellProperties",owner.sec,owner.para,owner.control,box.cellIdx));
        return[{boxes,props}];
      }catch(error){warnings.push(String(error));return[];}
    });
    const layouts:{page:HTMLElement;edges:Omit<Edge,"visible">[]}[]=[];
    for(const page of pages.querySelectorAll<HTMLElement>(":scope > .page")){
      if(page.hasAttribute("data-render-pending")||!page.firstElementChild?.matches("svg,canvas"))continue;
      const index=Number(page.dataset.page);if(!Number.isSafeInteger(index)||index<0)throw Error("표 보조선 쪽을 확인할 수 없습니다.");
      const cells=tables.flatMap(({boxes,props})=>boxes.filter(box=>box.pageIndex===index).map(box=>{
        const fragments=boxes.filter(c=>c.cellIdx===box.cellIdx).map(c=>c.pageIndex);
        return{box,borders:props.get(box.cellIdx)!,top:index===Math.min(...fragments),bottom:index===Math.max(...fragments)};
      }));
      layouts.push({page,edges:missingTableEdges(cells)});
    }
    if(warnings.length)failures.set(editor,`표 보조선 ${warnings.length}개 소유권 조회 미지원: ${[...new Set(warnings)].join(" / ")}`);
    // Publish only after all requested owner/border queries succeed.
    for(const {page,edges}of layouts){if(!edges.length)continue;
      const group=pages.ownerDocument.createElementNS("http://www.w3.org/2000/svg","svg");
      group.classList.add("table-edit-guides");group.setAttribute("aria-hidden","true");
      group.setAttribute("width",page.style.width);group.setAttribute("height",page.style.height);
      for(const e of edges){const line=pages.ownerDocument.createElementNS(group.namespaceURI,"line");
        line.setAttribute("x1",String(e.axis==="x"?e.line:e.start));line.setAttribute("y1",String(e.axis==="x"?e.start:e.line));
        line.setAttribute("x2",String(e.axis==="x"?e.line:e.end));line.setAttribute("y2",String(e.axis==="x"?e.end:e.line));
        line.setAttribute("vector-effect","non-scaling-stroke");group.append(line);
      }
      page.querySelector(".overlay")?.append(group);
    }
  }catch(error){failures.set(editor,"표 보조선 조회 불가: "+String(error));}
}
