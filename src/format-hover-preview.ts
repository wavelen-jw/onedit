import {Interaction} from './interaction.js';
import {copy,type Command} from './model.js';
import {sameFormatTarget} from './integration/a-format-input-guard.js';
import {createPageSvg} from './svg-page.js';

/** Render an existing Command, then restore Core BEFORE returning to the event
 * loop. Only sanitized screen SVG survives; History/dirty/save see the original. */
export function mountFormatHoverPreview(doc:Document,editor:Interaction){
  const pages=doc.getElementById('pages')!;
  const clear=()=>{pages.querySelectorAll('.format-hover-preview').forEach(n=>n.remove());pages.querySelectorAll('[data-format-hover]').forEach(n=>n.removeAttribute('data-format-hover'));};
  return{clear,show(command:Command,target:ReturnType<Interaction['capture']>){
    clear();const a=editor.adapter;if(a.transientEdit||!sameFormatTarget(target,editor.capture()))return;
    const viewport=doc.getElementById('viewport')!.getBoundingClientRect();
    const visible=[...pages.querySelectorAll<HTMLElement>('.page')].filter(p=>{const r=p.getBoundingClientRect();return r.bottom>viewport.top&&r.top<viewport.bottom&&r.width>0;});
    const revision=a.revision,before=a.doc.saveSnapshot(),pending=new Interaction(a),markup:{page:HTMLElement;svg:SVGSVGElement}[]=[];
    try{
      pending.selection=copy(target.selection);pending.typing=copy(editor.typing);pending.execute(command);
      for(const page of visible){const index=Number(page.dataset.page);if(index>=a.pageCount)continue;markup.push({page,svg:createPageSvg(a.doc.renderPageSvg(index),index,doc)});}
    }finally{
      pending.history.clear();try{a.call('restoreSnapshot',before);}finally{a.doc.discardSnapshot(before);a.revision=revision;}
    }
    if(!sameFormatTarget(target,editor.capture()))throw Error('미리보기 후 선택 대상을 복원할 수 없습니다.');
    for(const {page,svg}of markup){const layer=doc.createElement('div');layer.className='format-hover-preview';layer.setAttribute('aria-hidden','true');layer.append(svg);page.dataset.formatHover='';page.append(layer);}
  }};
}
