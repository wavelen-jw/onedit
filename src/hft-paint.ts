import type { RhwpAdapter } from "./adapter.js";
import { pageFontSources, hftPaintFamilies } from "./font-provider.js";

type Glyph = { x:number; top:number; bottom:number; width:number; size:number; font:string; bold:boolean; alias?:string };
type TextRun = {
  x:number; y:number; h:number; text:string; charX:number[]; fontFamily:string; fontSize:number;
  bold:boolean; italic:boolean; ratio:number; charShapeId:number; charStart:number; secIdx:number; paraIdx:number;
};
const plainGlyph=/^[!-~가-힣·○□「」→]$/u;
const number=(node:Element,name:string)=>Number(node.getAttribute(name)??NaN);
const primary=(family:string)=>family.split(',')[0]?.trim().replace(/^(['"])(.*)\1$/,'$2')??'';
const supported=(face:string,text:string)=>face==='휴먼명조'?/^[가-힣]$/u.test(text):/^[!-~]$/u.test(text);

/** Apply an alternate glyph outline to an already measured plain SVG glyph.
 * Correlate the source slot, the native text run and the paint position.
 * Ambiguous, transformed or missing glyphs keep the native fallback.
 */
export function renderHftSvg(a:RhwpAdapter,page:number,markup:string,families=hftPaintFamilies(a)):string {
  if(!families.size)return markup;
  try{
    const records=pageFontSources(a,page,true)??[];
    if(!records.some(r=>r.document?.altType===2&&families.has(r.document.face)))return markup;
    const {runs}:{runs:TextRun[]}=JSON.parse(a.doc.getPageTextLayout(page));
    const indexed=new Map<string,Glyph[]>();
    for(const run of runs){
      // Stay within plain one-code-point glyphs. Any matching non-HFT run also
      // enters the index so it can veto a geometrically ambiguous replacement.
      let i=0;
      for(const text of Array.from(run.text)){
        const at=i++;
        if(!plainGlyph.test(text))continue;
        const glyphs=indexed.get(text)??[];
        glyphs.push({x:run.x+run.charX[at],top:run.y,bottom:run.y+run.h,width:run.charX[at+1]-run.charX[at],
          size:run.fontSize,font:primary(run.fontFamily),bold:run.bold});
        indexed.set(text,glyphs);
      }
    }
    // Associate source evidence only for a unique run glyph. runIndex is the
    // native text-run traversal ordinal and is checked against the authored
    // character, section, paragraph, offset and shape before it can authorize paint.
    for(const {source,document:face} of records){
      const alias=families.get(face?.face);
      if(!alias||source?.status!=='complete'||face.altType!==2||face.embedded!==false)continue;
      if(!supported(face.face,source.character))continue;
      const run=runs[source.runIndex];
      if(!run||run.italic||run.ratio!==1||run.charShapeId!==source.charShapeId
        ||run.secIdx!==source.sectionIndex||run.paraIdx!==source.paragraphIndex)continue;
      const at=source.charOffset-run.charStart;
      if(!Number.isInteger(at)||at<0||Array.from(run.text)[at]!==source.character)continue;
      const glyphs=indexed.get(source.character);
      const x=run.x+run.charX[at],width=run.charX[at+1]-run.charX[at];
      const matches=glyphs?.filter(g=>g.x===x&&g.top===run.y&&g.bottom===run.y+run.h&&g.size===run.fontSize
        &&g.width===width&&g.bold===run.bold&&g.font===primary(run.fontFamily));
      if(matches?.length===1)matches[0].alias=alias;
    }
    const svg=new DOMParser().parseFromString(markup,'image/svg+xml');
    if(svg.documentElement.localName!=='svg'||svg.getElementsByTagName('parsererror').length)return markup;
    let changed=false;
    for(const node of svg.getElementsByTagName('text')){
      if(node.childElementCount||node.closest('[transform]')||node.closest('defs')||node.hasAttribute('font-style'))continue;
      const text=node.textContent??'',family=node.getAttribute('font-family');
      const glyphs=indexed.get(text);
      if(!family||!glyphs?.some(g=>g.alias))continue;
      const x=number(node,'x'),y=number(node,'y'),width=number(node,'textLength'),size=number(node,'font-size');
      const hasWidth=node.hasAttribute('textLength');
      const bold=node.getAttribute('font-weight')==='bold',font=primary(family);
      const matches=glyphs.filter(g=>g.font===font&&g.bold===bold&&y>=g.top&&y<=g.bottom&&
        Math.abs(x-g.x)<=0.11&&(!hasWidth||Math.abs(width-g.width)<=0.11)&&Math.abs(size-g.size)<=0.05);
      if(matches.length!==1||!matches[0].alias)continue;
      node.setAttribute('font-family', `'${matches[0].alias}',${family}`);
      changed=true;
    }
    return changed?new XMLSerializer().serializeToString(svg):markup;
  }catch{
    return markup;
  }
}
