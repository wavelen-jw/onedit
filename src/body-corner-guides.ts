import type {Interaction} from './interaction.js';

const states=new WeakMap<HTMLElement,{key:string;svg:SVGSVGElement}>();
/** Screen-only marks derived from the same physical page areas as Core paint. */
export function paintBodyCorners(editor:Interaction,pages:HTMLElement){
  const a=editor.adapter,key=JSON.stringify([a.documentId,a.revision]);
  for(const page of pages.querySelectorAll<HTMLElement>('.page')){
    const overlay=page.querySelector<HTMLElement>(':scope>.overlay');if(!overlay)continue;
    const cached=states.get(page);if(cached?.key===key){overlay.append(cached.svg);continue;}
    const info=a.call('getPageInfo',Number(page.dataset.page));
    // header/footer areas include Core's effective page/binding/fallback geometry.
    const left=info.bodyLeft,right=info.bodyRight,top=info.headerArea.y+info.headerArea.height,bottom=info.footerArea.y;
    overlay.querySelector('.body-corner-guides')?.remove();
    if(![left,right,top,bottom].every(Number.isFinite)||left<0||top<0||right<=left||bottom<=top||right>info.width||bottom>info.height)continue;
    const svg=pages.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','body-corner-guides');svg.setAttribute('aria-hidden','true');svg.dataset.editorOnly='body-corners';
    svg.setAttribute('viewBox',`0 0 ${info.width} ${info.height}`);svg.dataset.bounds=JSON.stringify({left,right,top,bottom});
    const line=pages.ownerDocument.createElementNS(svg.namespaceURI,'path');
    line.setAttribute('d',`M${left-10} ${top}H${left}V${top-10}M${right+10} ${top}H${right}V${top-10}M${left-10} ${bottom}H${left}V${bottom+10}M${right+10} ${bottom}H${right}V${bottom+10}`);
    svg.append(line);overlay.append(svg);states.set(page,{key,svg});
  }
}
