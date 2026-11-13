// Use the rendered SVG coordinates, including CSS zoom and page borders.
// A control box is not a guessed paragraph/caret address.
export function controlPoint(page: HTMLElement, x: number, y: number) {
  const matrix = page.querySelector<SVGSVGElement>(":scope > svg")?.getScreenCTM();
  if (!matrix) throw Error("현재 개체 화면 좌표를 확인할 수 없습니다.");
  const p = new DOMPoint(x, y).matrixTransform(matrix.inverse());
  return { x: p.x, y: p.y };
}

export type ControlPointer = {page:HTMLElement;documentId:string;revision:number;x:number;y:number;time:number};
// MouseEvent may truncate the matching PointerEvent's fractional coordinates.
// Use the actual preceding left pointer only for this double click, same live
// page/document/revision and matching integer coordinates. No address repair.
export function controlClientPoint(page:HTMLElement,e:MouseEvent,last:ControlPointer|undefined,documentId:string,revision:number){
  if(e.type==='dblclick'&&last?.page===page&&page.isConnected&&last.documentId===documentId&&last.revision===revision&&
    e.timeStamp>=last.time&&Math.trunc(last.x)===e.clientX&&Math.trunc(last.y)===e.clientY)return{x:last.x,y:last.y};
  return{x:e.clientX,y:e.clientY};
}

// Match the rendered outline's physical pixel, not a broad content strip.
export function onControlOutline(page: HTMLElement, box: {x:number;y:number;w:number;h:number}, x: number, y: number) {
  const matrix = page.querySelector<SVGSVGElement>(":scope > svg")?.getScreenCTM();
  if (!matrix) return false;
  const a = new DOMPoint(box.x, box.y).matrixTransform(matrix);
  const b = new DOMPoint(box.x + box.w, box.y + box.h).matrixTransform(matrix);
  const dpr = page.ownerDocument.defaultView!.devicePixelRatio;
  const px = (v: number) => Math.round(v * dpr);
  const left = px(a.x), right = px(b.x), top = px(a.y), bottom = px(b.y), cx = px(x), cy = px(y);
  return ((cx === left || cx === right) && cy >= top && cy <= bottom) ||
    ((cy === top || cy === bottom) && cx >= left && cx <= right);
}
