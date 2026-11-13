// Display controls wrap the existing verified print iframe. No print-document
// CSS, SVG, font resource, page size or native print setting is changed.
export function previewNavigation(form:HTMLFormElement,content:HTMLElement,enterPage?:(page:number)=>void){
  const doc=form.ownerDocument,bar=doc.createElement('div'),position=doc.createElement('output');bar.dataset.previewNavigation='';bar.setAttribute('role','group');bar.setAttribute('aria-label','미리보기 화면 이동');
  const stage=doc.createElement('div');stage.style.cssText='position:relative;transform-origin:top left;overflow:hidden';content.append(stage);content.tabIndex=0;content.setAttribute('aria-label','미리보기 문서 · PageUp/Down, 숫자패드 +/−');content.style.overflow='auto';content.style.maxHeight='60vh';
  let frame:HTMLIFrameElement|undefined,pages:readonly{page:number;width:number;height:number;margins?:{left:number;right:number;top:number;bottom:number}}[]=[],scale=1,showMargins=false,showPaper=false;
  const guides=doc.createElement('div');guides.dataset.previewGuides='';guides.setAttribute('aria-hidden','true');guides.style.cssText='position:absolute;inset:0;pointer-events:none;transform-origin:top left';
  const draw=()=>{guides.replaceChildren();if(!frame||!pages.length)return;guides.style.transform=`scale(${scale})`;let top=12;const max=Math.max(...pages.map(p=>p.width))+24;for(const p of pages){const left=(max-p.width)/2;for(const mode of ['paper','margin']as const){if(mode==='paper'&&!showPaper||mode==='margin'&&!showMargins)continue;const m=mode==='margin'?p.margins:undefined;if(mode==='margin'&&(!m||Object.values(m).some(n=>!Number.isFinite(n))))continue;const r=doc.createElement('div');r.dataset.previewGuide=mode;r.style.cssText=`position:absolute;box-sizing:border-box;left:${left+(m?.left??0)}px;top:${top+(m?.top??0)}px;width:${p.width-(m?.left??0)-(m?.right??0)}px;height:${p.height-(m?.top??0)-(m?.bottom??0)}px;border:1px ${mode==='margin'?'dashed #b42318':'solid #15803d'}`;guides.append(r);}top+=p.height+24;}stage.append(guides);};
  const current=()=>{const y=content.scrollTop/scale;let n=0,top=0;for(let i=0;i<pages.length;i++){if(y>=top)n=i;top+=pages[i].height+24;}return n;};
  const update=()=>{position.value=pages.length?`${pages[current()].page+1}쪽 · ${Math.round(scale*100)}%`:'미리보기 준비 전';bar.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=!frame||!pages.length||b.hasAttribute('data-preview-edit')&&!enterPage);};
  // The final page must be able to reach the viewport top even when it is
  // shorter than the screen. This space belongs only to the display wrapper.
  const extent=()=>{const total=pages.reduce((n,p)=>n+p.height+24,0)*scale,last=pages.slice(0,-1).reduce((n,p)=>n+p.height+24,0)*scale;stage.style.height=Math.max(total,last+content.clientHeight)+'px';};
  const go=(i:number)=>{if(!frame||!pages.length)return;extent();const n=Math.max(0,Math.min(pages.length-1,i));content.scrollTop=pages.slice(0,n).reduce((n,p)=>n+p.height+24,0)*scale;update();};
  const zoom=(direction:number)=>{if(!frame)return;const i=current();scale=Math.max(.1,Math.min(5,Math.round((scale+direction*.25)*100)/100));apply();go(i);};
  const apply=()=>{if(!frame)return;frame.style.position='absolute';frame.style.left=frame.style.top='0';frame.style.transform=`scale(${scale})`;frame.style.transformOrigin='top left';stage.style.width=(Math.max(...pages.map(p=>p.width))+24)*scale+'px';stage.style.height=pages.reduce((n,p)=>n+p.height+24,0)*scale+'px';extent();draw();};
  for(const[label,action]of [['앞 쪽 · PageUp',()=>go(current()-1)],['다음 쪽 · PageDown',()=>go(current()+1)],['현재 쪽 편집 · Ctrl+Enter',()=>enterPage?.(pages[current()].page)],['축소 · Num−',()=>zoom(-1)],['확대 · Num+',()=>zoom(1)]] as const){const b=doc.createElement('button');b.type='button';b.textContent=label;if(label.startsWith('현재 쪽 편집'))b.dataset.previewEdit='';b.onclick=action;bar.append(b);}
  const toggles=([['여백 보기 · .',()=>showMargins= !showMargins,()=>showMargins],['편집 용지 보기 · ,',()=>showPaper= !showPaper,()=>showPaper]]as const).map(([label,toggle,read])=>{const b=doc.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(read()));b.onclick=()=>{if(!frame)return;toggle();b.setAttribute('aria-pressed',String(read()));draw();};bar.append(b);return{b,read};});
  bar.append(position);content.before(bar);content.addEventListener('scroll',update,{passive:true});update();
  return {stage,bind(next:HTMLIFrameElement|undefined,value:typeof pages=[]){frame=next;pages=value;if(frame){if(frame.parentNode!==stage)throw Error('검증된 인쇄 문서의 표시 컨테이너가 다릅니다.');apply();}else stage.replaceChildren();update();},key(e:KeyboardEvent){
    if(e.defaultPrevented||!e.cancelable||e.isComposing||e.keyCode===229||e.getModifierState('AltGraph')||e.altKey||e.metaKey||e.shiftKey||!frame)return false;
    if(e.target instanceof Element&&e.target.closest('input,select,textarea,[contenteditable=true]'))return false;
    let action:(()=>void)|undefined;
    if(!e.ctrlKey&&e.key==='PageUp')action=()=>go(current()-1);if(!e.ctrlKey&&e.key==='PageDown')action=()=>go(current()+1);
    if(e.ctrlKey&&e.key==='PageUp')action=()=>go(0);if(e.ctrlKey&&e.key==='PageDown')action=()=>go(pages.length-1);
    if(e.ctrlKey&&e.key==='Enter'&&enterPage)action=()=>enterPage(pages[current()].page);if(!e.ctrlKey&&e.code==='NumpadAdd')action=()=>zoom(1);if(!e.ctrlKey&&e.code==='NumpadSubtract')action=()=>zoom(-1);
    if(!e.ctrlKey&&e.key==='.')action=()=>toggles[0].b.click();if(!e.ctrlKey&&e.key===',')action=()=>toggles[1].b.click();
    if(!action)return false;e.preventDefault();e.stopPropagation();action();return true;
  }};
}
