import type { RhwpAdapter } from "./adapter.js";
const NS = "http://www.w3.org/2000/svg";
type Box = {x:number;y:number;w:number;h:number};
const round = (n:number) => Math.round(n*10)/10;
const intersects = (a:Box,b:Box) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
// Fixed existing ShapeMarker producer labels; empty-field guides are not these.
const marker = /^\[(직선|사각형|타원|호|다각형|곡선|묶음|그림\(묶음내\)|차트|OLE|그림|표|감추기|쪽 번호 위치|각주|미주|새 번호|머리말\((양 쪽|짝수 쪽|홀수 쪽)\)|꼬리말\((양 쪽|짝수 쪽|홀수 쪽)\)|책갈피:[^\]]+)\]$/;

/** Move only identifiable, source-less editor labels into free page margins.
 * Core runs publish coordinates at one decimal; SVG retains full precision.
 * Never identify user text by brackets/red color alone. Ambiguity stays intact.
 */
export function projectControlLabels(svg:SVGSVGElement, a:RhwpAdapter, page:number) {
  if(!a.presentationFlag('getShowControlCodes'))return;
  const runs=a.runs(page) as (Box & {text:string;charStart?:number;fontSize?:number;textColor?:string})[];
  const labels=runs.filter(r=>!Object.hasOwn(r,"charStart") && r.textColor?.toLowerCase()==="#ff0000" &&
    marker.test(r.text) && r.fontSize!>0 && [r.x,r.y,r.w,r.h,r.fontSize].every(Number.isFinite));
  if(!labels.length)return;
  const info=a.call("getPageInfo",page),obstacles:Box[]=runs.filter(r=>Object.hasOwn(r,"charStart"));
  for(const c of a.call("getPageControlLayout",page).controls??[])if([c.x,c.y,c.w,c.h].every(Number.isFinite))obstacles.push(c);
  const bands=[
    {x:info.bodyLeft,w:info.bodyRight-info.bodyLeft,top:4,bottom:info.headerArea.y-4},
    {x:info.bodyLeft,w:info.bodyRight-info.bodyLeft,top:info.footerArea.y+info.footerArea.height+4,bottom:info.height-4},
    {x:4,w:info.bodyLeft-12,top:4,bottom:info.height-4},
    {x:info.bodyRight+8,w:info.width-info.bodyRight-12,top:4,bottom:info.height-4},
  ].filter(b=>[b.x,b.w,b.top,b.bottom].every(Number.isFinite)&&b.w>=24&&b.bottom>b.top);
  // All candidates belong to this SVG invocation. Moving an accepted label
  // only reparents its existing nodes; no new text nodes are introduced.
  // Keep the per-label ancestry/geometry checks after each move, but do not
  // query/read every body glyph again for each separate control label.
  const starts=[...svg.querySelectorAll<SVGTextElement>('text')].filter(first=>
    first.textContent==="["&&first.getAttribute('fill')?.toLowerCase()==="#ff0000");
  let moved=0,unresolved=0;
  for(const run of labels){
    const candidates:{nodes:SVGElement[];x:number;y:number}[]=[];
    for(const first of starts){
      if(first.closest('[data-control-label]') || first.textContent!=="[" || first.getAttribute('fill')?.toLowerCase()!=="#ff0000")continue;
      const x=Number(first.getAttribute('x')),y=Number(first.getAttribute('y')),size=Number(first.getAttribute('font-size'));
      // A zero-height ShapeMarker publishes its rounded baseline, not a box.
      // Match that same public coordinate axis, as for x and font size; a raw
      // SVG baseline cannot be required to equal a zero-width f64 interval.
      const matchesY=run.h===0?round(y)===run.y:y>=run.y&&y<=run.y+run.h;
      if(!first.hasAttribute('x')||!first.hasAttribute('y')||round(x)!==run.x||round(size)!==run.fontSize||!matchesY)continue;
      const nodes:SVGElement[]=[];let text='',next:Element|null=first;
      while(next?.localName==='text'&&run.text.startsWith(text+(next.textContent??''))){
        if(next.getAttribute('y')!==first.getAttribute('y')||Number(next.getAttribute('font-size'))!==size)break;
        const value=next.textContent??'';
        if(value.trim()&&next.getAttribute('fill')?.toLowerCase()!=="#ff0000")break;
        nodes.push(next as SVGElement);text+=value;next=next.nextElementSibling;if(text===run.text)break;
      }
      if(text!==run.text)continue;
      // The renderer emits the marker's decorations immediately after its
      // glyphs. Retain them with that label, never a following source text run.
      while(next?.localName==='line'&&Number(next.getAttribute('x1'))===x&&
        round(Number(next.getAttribute('x2'))-x)===run.w){nodes.push(next as SVGElement);next=next.nextElementSibling;}
      candidates.push({nodes,x,y:run.y});
    }
    if(candidates.length!==1){unresolved++;continue;}
    const {nodes,x,y}=candidates[0];let placed:Box|undefined,scale=1;
    for(const band of bands){
      const s=Math.min(1,12/run.fontSize!,band.w/(run.w+4)),w=(run.w+4)*s,h=(run.h+4)*s;
      const start=Math.max(band.top,Math.min(band.bottom-h,run.y));
      for(let i=0;i<Math.ceil((band.bottom-band.top)/(h+4));i++){
        for(const yy of i?[start+i*(h+4),start-i*(h+4)]:[start]){
          if(yy<band.top||yy+h>band.bottom)continue;
          for(let column=0;column<Math.floor((band.w+4)/(w+4));column++){
            const b={x:band.x+column*(w+4),y:yy,w,h};
            if(obstacles.some(o=>intersects(b,o)))continue;
            placed=b;scale=s;break;
          }
          if(placed)break;
        }
        if(placed)break;
      }
      if(placed)break;
    }
    if(!placed){unresolved++;continue;}
    const g=svg.ownerDocument.createElementNS(NS,'g');g.dataset.controlLabel=run.text;
    g.dataset.controlOrigin=JSON.stringify({x:run.x,y:run.y,w:run.w,h:run.h});
    g.setAttribute('role','img');g.setAttribute('aria-label','조판 부호 '+run.text);
    g.setAttribute('pointer-events','none');
    g.setAttribute('transform',`translate(${placed.x-scale*x+2*scale},${placed.y-scale*y+2*scale}) scale(${scale})`);
    const title=svg.ownerDocument.createElementNS(NS,'title');title.textContent=run.text;g.append(title,...nodes);svg.append(g);
    obstacles.push(placed);moved++;
  }
  svg.dataset.controlLabelsMoved=String(moved);svg.dataset.controlLabelsUnresolved=String(unresolved);
}
