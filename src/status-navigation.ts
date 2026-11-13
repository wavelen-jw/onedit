import {activeWorkset} from "./active-workset.js";
import { formatInputGuard } from './integration/a-format-input-guard.js';

export function viewNumber(text:string,min:number,max:number,label:string){const value=Number(text);if(!text.trim()||!Number.isInteger(value)||value<min||value>max)throw Error(`${label}: ${min}~${max} 사이 정수를 입력하세요.`);return value;}

/** Projection of the existing View controller. No document/Selection writes. */
export function mountStatusNavigation(doc:Document,focusEditor:()=>void,busy:()=>boolean){
  const bar=doc.getElementById('page-navigation')!,state=doc.getElementById('view-status')!,pages=doc.getElementById('pages')!;
  const sourcePage=doc.querySelector<HTMLInputElement>('[aria-label="이동할 쪽 번호"]'),sourceZoom=doc.querySelector<HTMLInputElement>('[aria-label="문서 배율 (%)"]');
  const source=(action:string)=>doc.querySelector<HTMLButtonElement>(`[data-view-action="${action}"]`);
  const token=()=>pages.dataset.documentId??doc.documentElement.dataset.rhwpViewState??'';
  const reason=()=>!sourcePage||!sourceZoom||!source('go')||!source('zoom-go')||!token()||!Number(state.dataset.viewPages)?'보기 상태를 확인할 수 없습니다.':busy()||!!doc.querySelector('dialog[open]')||state.dataset.viewBusy==='true'||sourcePage.disabled||sourceZoom.disabled?'입력·저장·대화상자를 마친 뒤 사용하세요.':'';
  const button=(id:string,name:string,text:string)=>{const b=doc.createElement('button');b.id=id;b.type='button';b.title=name;b.setAttribute('aria-label',name);b.textContent=text;return b;};
  const pageButton=button('status-page','쪽 번호 입력·이동',''),zoomButton=button('status-zoom','확대율 입력','');
  const minus=button('status-zoom-out','축소 (5%p)','−'),plus=button('status-zoom-in','확대 (5%p)','+');
  const fitPage=button('status-fit-page','쪽 맞춤',''),fitWidth=button('status-fit-width','폭 맞춤','');
  for(const [b,path]of [[fitPage,'M6 3h12v18H6z M9 6h6 M9 18h6'],[fitWidth,'M4 4v16 M20 4v16 M5 12h14 M8 9l-3 3 3 3 M16 9l3 3-3 3']]as const){
    const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=doc.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.5');svg.append(p);b.append(svg);
  }
  const slider=doc.createElement('input');slider.id='status-zoom-slider';slider.type='range';slider.min='25';slider.max='300';slider.step='1';slider.setAttribute('aria-label','문서 배율');
  const zoomGroup=doc.createElement('div');zoomGroup.id='status-zoom-group';zoomGroup.setAttribute('role','group');zoomGroup.setAttribute('aria-label','확대·축소');zoomGroup.append(minus,slider,plus,zoomButton,fitPage,fitWidth);bar.append(zoomGroup);
  const form=doc.createElement('form');form.id='status-navigation-form';form.hidden=true;form.noValidate=true;form.setAttribute('aria-label','쪽·배율 입력');
  const label=doc.createElement('label'),input=doc.createElement('input'),apply=doc.createElement('button'),note=doc.createElement('output');
  input.type='number';input.step='1';input.setAttribute('aria-describedby','status-view-note');apply.type='submit';apply.textContent='이동';note.id='status-view-note';note.setAttribute('role','status');label.append(input);form.append(label,apply,note);bar.append(form);
  const guard=formatInputGuard(form);let draft:'page'|'zoom'|undefined,captured='',capturedPage:Element|null=null;
  const close=(restore=false)=>{draft=undefined;form.hidden=true;guard.close();note.textContent='';pageButton.setAttribute('aria-expanded','false');zoomButton.setAttribute('aria-expanded','false');if(restore)focusEditor();};
  for(const b of [pageButton,zoomButton]){b.setAttribute('aria-controls',form.id);b.setAttribute('aria-expanded','false');}
  const sync=()=>{
    const line=doc.getElementById('workspace-status-line');if(line&&!line.contains(pageButton))line.prepend(pageButton);
    if(draft&&(captured!==token()||capturedPage!==pages.querySelector('.page')||reason()))close();
    const page=Number(state.dataset.viewPage)||0,count=Number(state.dataset.viewPages)||0,zoom=Number(state.dataset.viewZoom)||100,why=reason();
    pageButton.textContent=`${page}/${count}쪽`;pageButton.setAttribute('aria-label',`${page}/${count}쪽 · 쪽 번호 입력·이동`);zoomButton.textContent=`${zoom}%`;slider.value=String(zoom);slider.setAttribute('aria-valuetext',`${zoom}%`);
    for(const b of [pageButton,zoomButton,slider,minus,plus,fitPage,fitWidth])b.disabled=!!why;
    minus.disabled ||= !!source('out')?.disabled;plus.disabled ||= !!source('in')?.disabled;
    for(const [b,action]of [[fitPage,'page'],[fitWidth,'width']]as const){b.disabled ||= !source(action)||!!source(action)?.disabled;b.setAttribute('aria-pressed',String(state.dataset.viewMode===action));}
  };
  const open=(kind:'page'|'zoom')=>{sync();if(reason())return;draft=kind;captured=token();capturedPage=pages.querySelector('.page');guard.open();form.hidden=false;note.textContent='';
    input.min=kind==='page'?'1':'25';input.max=kind==='page'?state.dataset.viewPages!:'300';input.value=(kind==='page'?state.dataset.viewPage:state.dataset.viewZoom)??'';
    input.setAttribute('aria-label',kind==='page'?'상태표시줄 쪽 번호':'상태표시줄 확대율 (%)');label.firstChild?.nodeType===Node.TEXT_NODE&&label.firstChild.remove();label.prepend(kind==='page'?'쪽 번호 ':'확대율 (%) ');apply.textContent=kind==='page'?'이동':'적용';
    (kind==='page'?pageButton:zoomButton).setAttribute('aria-expanded','true');input.focus();input.select();
  };
  pageButton.onclick=()=>draft==='page'?close(true):open('page');zoomButton.onclick=()=>draft==='zoom'?close(true):open('zoom');
  form.onsubmit=e=>{e.preventDefault();try{if(!draft||!guard.ready()||captured!==token()||capturedPage!==pages.querySelector('.page')||reason())throw Error('문서·입력 상태가 바뀌었습니다. 닫고 다시 선택하세요.');
    const kind=draft,n=viewNumber(input.value,Number(input.min),Number(input.max),kind==='page'?'쪽 번호':'확대율');
    const target=kind==='page'?sourcePage!:sourceZoom!;target.value=String(n);source(kind==='page'?'go':'zoom-go')!.click();close(true);
  }catch(error){note.textContent=String(error);}};
  form.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();close(true);}if(e.key==='Enter'&&(e.isComposing||e.keyCode===229||e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey)){e.preventDefault();}});
  for(const [b,action]of [[minus,'out'],[plus,'in'],[fitPage,'page'],[fitWidth,'width']]as const){b.onpointerdown=e=>e.preventDefault();b.onclick=()=>{if(reason())return;source(action)?.click();focusEditor();};}
  let sliderToken='';slider.addEventListener('focus',()=>{sliderToken=token();});slider.addEventListener('pointerdown',()=>{sliderToken=token();});
  slider.addEventListener('input',()=>{if(reason()||sliderToken!==token()){sync();return;}sourceZoom!.value=slider.value;source('zoom-go')!.click();});
  slider.addEventListener('pointerup',()=>focusEditor());slider.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();focusEditor();}
    // Fit/manual zoom need not be a multiple of5. Keep the thumb's real value,
    // while keyboard arrows reuse the existing5%p step, just like −/+.
    if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();if(!reason()&&sliderToken===token())source(e.key==='ArrowRight'||e.key==='ArrowUp'?'in':'out')?.click();
    }
  });
  const outside=(e:PointerEvent)=>{if(draft&&e.target instanceof Node&&!form.contains(e.target)&&!pageButton.contains(e.target)&&!zoomButton.contains(e.target))close();};doc.addEventListener('pointerdown',outside);
  const observer=new MutationObserver(sync);
  observer.observe(state,{childList:true,attributes:true,attributeFilter:['data-view-page','data-view-pages','data-view-zoom','data-view-mode','data-view-busy']});
  observer.observe(pages,{childList:true,attributes:true,attributeFilter:['data-document-id']});
  if(!activeWorkset(doc)){
    observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open']});
    doc.addEventListener('rhwp:editor-state',sync);
  }else{
    // The existing view controller publishes these attributes, including
    // modality/busy and zoom bounds. Command handlers still call reason().
    for(const control of [sourcePage,sourceZoom,source('out'),source('in'),source('page'),source('width')])
      if(control)observer.observe(control,{attributes:true,attributeFilter:['disabled']});
  }
  state.hidden=true;queueMicrotask(sync);
  return{sync,dispose(){observer.disconnect();doc.removeEventListener('pointerdown',outside);doc.removeEventListener('rhwp:editor-state',sync);close();pageButton.remove();form.remove();zoomGroup.remove();state.hidden=false;}};
}
