import { sharedPrintFonts } from "./font-provider.js";
import { createPageSvg } from "./svg-page.js";

type PrintPage = {page:number;width:number;height:number;svg:string};

// Font faces have document scope, unlike selectors and fragment IDs. Only
// identical page-local face declarations may share this output document.
// Preserve different page fonts by refusing the ambiguous composition instead
// of allowing a later page's definition to silently restyle an earlier page.
function pageFontRules(svg:SVGSVGElement):string {
  const rules=(items:CSSRuleList):string=>[...items].map(rule=>{
    if(rule instanceof CSSFontFaceRule)return rule.cssText;
    if(rule instanceof CSSMediaRule||rule instanceof CSSSupportsRule){
      const nested=rules(rule.cssRules);
      return nested?`${rule.constructor.name}:${rule.conditionText}{${nested}}`:"";
    }
    return "";
  }).join("");
  return [...svg.querySelectorAll("style")].map(style=>{
    const sheet=new CSSStyleSheet();sheet.replaceSync(style.textContent??"");
    return rules(sheet.cssRules);
  }).join("");
}

/** A single, scriptless output document. This never owns an editing model. */
export function createPrintSurface(target:HTMLElement, pages:readonly PrintPage[]) {
  const frame = document.createElement("iframe");
  frame.title = "인쇄용 문서";
  frame.tabIndex = -1;
  frame.dataset.printDocument = "";
  // Parent code supplies validated nodes. Content scripts/forms/navigation
  // remain unavailable; allow-modals permits only the existing print action.
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.style.cssText = `display:block;border:0;pointer-events:none;width:${Math.max(...pages.map(p=>p.width))+24}px;height:${pages.reduce((n,p)=>n+p.height+24,0)}px;`;
  let disposed = false, rejectPending: (reason:Error)=>void = ()=>{};
  let doc: Document | undefined;
  const releases:(()=>void)[]=[];
  const disposedError=()=>new Error("인쇄 준비가 취소되었습니다.");
  const alive=()=>{if(disposed||!frame.isConnected)throw disposedError();};
  const ready = new Promise<void>((resolve,reject)=>{
    rejectPending=reject;
    const loaded=async()=>{
      try {
        alive();
        doc=frame.contentDocument??undefined;
        if(!doc||!frame.contentWindow)throw Error("인쇄 문서에 접근할 수 없습니다.");
        const supplied=sharedPrintFonts(pages.map(p=>p.svg));
        const layout=doc.createElement("style");
        layout.textContent=`*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#ddd} .print-page{display:block;position:relative;overflow:hidden;background:white;margin:12px auto;break-after:page;page-break-after:always} .print-page:last-child{break-after:auto;page-break-after:auto} .print-page>svg{display:block;width:100%;height:100%} @page{size:${pages[0].width}px ${pages[0].height}px;margin:0} @media print{body{background:white}.print-page{margin:0}}`;
        doc.head.append(layout);
        const images=new Set<string>();let embeddedFonts:string|undefined;
        for(let i=0;i<pages.length;i++){
          const p=pages[i],wrapper=doc.createElement("div");
          wrapper.className="print-page";wrapper.setAttribute("aria-label",`${p.page+1}쪽`);
          wrapper.style.width=p.width+"px";wrapper.style.height=p.height+"px";
          // Reuse the established parser, executable/external resource filter,
          // CSS scope and per-page/instance ID+reference validation unchanged.
          const svg=createPageSvg(supplied.pages[i],p.page,doc);
          const pageFonts=pageFontRules(svg);
          if(embeddedFonts!==undefined&&embeddedFonts!==pageFonts)
            throw Error("쪽마다 다른 내장 글꼴 정의는 단일 인쇄 문서에서 격리할 수 없습니다.");
          embeddedFonts=pageFonts;
          for(const image of svg.querySelectorAll("image")){
            const href=image.getAttribute("href")??image.getAttributeNS("http://www.w3.org/1999/xlink","href");
            if(href?.startsWith("data:image/"))images.add(href);
          }
          wrapper.append(svg);doc.body.append(wrapper);
        }
        if(embeddedFonts){
          // CSS-connected faces precede manual faces in font matching. Keep
          // the established provider-before-page CSS order when the page has
          // embedded declarations; do not change its font resolution policy.
          const fonts=doc.createElement("style");fonts.textContent=supplied.css;
          doc.head.insertBefore(fonts,layout);
        }else{
          // The verified loaded font objects may belong to more than one set.
          // This explicit registration avoids encoding/decoding the same
          // bytes again; deleting from this set never removes editor faces.
          const outputFonts=doc.fonts;
          for(const face of supplied.faces){
            outputFonts.add(face);
            releases.push(()=>outputFonts.delete(face));
          }
        }
        // Decode actual raster resources, not screenshots of the SVG pages.
        const imageReady=[...images].map(src=>{
          const image=doc!.createElement("img");image.src=src;
          releases.push(()=>image.removeAttribute("src"));
          return image.decode();
        });
        // Trigger font discovery in this document before awaiting its own set.
        doc.body.getBoundingClientRect();
        await Promise.all([doc.fonts.ready,...imageReady]);
        alive();
        if([...doc.fonts].some(face=>face.status==="error"))
          throw Error("인쇄 글꼴 준비에 실패했습니다.");
        await new Promise<void>(ok=>requestAnimationFrame(()=>requestAnimationFrame(()=>ok())));
        alive();resolve();
      }catch(error){reject(error);}
    };
    frame.addEventListener("load",loaded,{once:true});
    releases.push(()=>frame.removeEventListener("load",loaded));
    frame.addEventListener("error",()=>reject(Error("인쇄 문서 준비 실패")),{once:true});
  });
  // Static shell only. Untrusted Core markup never enters srcdoc/innerHTML.
  // The inherited host CSP remains in force; this policy only narrows it.
  // Do not impose the editor UI language on SVG text. A standalone SVG image
  // did not inherit it; doing so changes platform fallback glyph selection.
  frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; font-src data:; img-src data:; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'"></head><body></body></html>';
  target.append(frame);
  return {
    frame,ready,
    print(){alive();if(!doc||!frame.contentWindow)throw Error("인쇄 문서가 준비되지 않았습니다.");frame.contentWindow.print();},
    dispose(){
      if(disposed)return;
      disposed=true;rejectPending(disposedError());
      releases.forEach(release=>release());
      frame.remove();doc=undefined;
    },
  };
}
