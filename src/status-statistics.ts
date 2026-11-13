import type { Interaction } from './interaction.js';
import { characterStatistics,characterCountPolicy,countCharacters } from './document-statistics.js';
export function specialEditingStatus(doc:Document,editor:Interaction){
  const a=editor.adapter;if(a.viewerOnlyReason||a.scope==='readonly'||a.documentLocked)return '읽기 전용';
  const kind=doc.querySelector<HTMLSelectElement>('#header-footer-dialog[open] [name=hfKind]')?.value;
  return kind==='header'?'머리말 설정':kind==='footer'?'꼬리말 설정':'';
}
export function mountStatusStatistics(doc:Document,editor:Interaction,actions:{blocked:()=>boolean;show:(launcher:HTMLButtonElement)=>void}){
  const count=doc.createElement('button');count.id='status-character-count';count.type='button';count.title=`문서 통계 열기 · ${characterCountPolicy}`;
  const stats=characterStatistics(editor);
  const projectSelection=()=>{const node=doc.getElementById('selection');if(!node)return;try{node.textContent=stats.selection();}catch(error){node.textContent='선택정보 확인 불가';console.warn('선택 글자수 조회 실패',error);}};
  const attach=()=>{const line=doc.getElementById('workspace-status-line');if(line&&!line.contains(count))doc.getElementById('selection')?.before(count);};
  const sync=()=>{attach();const value=stats.sync();count.textContent=value?`${value.total.toLocaleString()}자`:stats.error?'글자수 확인 불가':'집계 중…';count.setAttribute('aria-label',value?`문서 ${value.total.toLocaleString()}자 · 통계 열기`:count.textContent);count.disabled=actions.blocked();const state=doc.getElementById('status');if(state)state.textContent=specialEditingStatus(doc,editor);};
  count.onpointerdown=e=>e.preventDefault();count.onclick=()=>{if(!actions.blocked())actions.show(count);};
  stats.onchange=()=>{sync();if(!doc.querySelector('#textbox-edit-dialog[open]'))projectSelection();doc.dispatchEvent(new CustomEvent('rhwp:statistics'));};
  doc.addEventListener('rhwp:editor-state',sync);
  doc.addEventListener('change',event=>{if(event.target instanceof Element&&event.target.matches('#header-footer-dialog [name=hfKind]'))sync();});
  const admission=new MutationObserver(sync);admission.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open']});
  // Native textbox drafts keep their real textarea selection. They are not body
  // or fake-cell selections and are never committed to document counts here.
  stats.selectionOverride=()=>{const field=doc.querySelector<HTMLTextAreaElement>('#textbox-edit-dialog[open] textarea');
    const s=editor.selection;
    if(field&&field.dataset.documentId===editor.adapter.documentId&&s.kind==='object'&&s.textbox?.target.targetId===field.dataset.paragraphTarget&&!field.disabled){const selected=field.value.slice(field.selectionStart,field.selectionEnd),n=countCharacters(selected).total;return field.selectionEnd>field.selectionStart?`글상자 초안 선택 ${n}자`:'';}
    return undefined;
  };
  const textbox=()=>{if(doc.querySelector('#textbox-edit-dialog[open]'))projectSelection();};
  for(const event of ['select','keyup','pointerup','input','compositionend'])doc.addEventListener(event,textbox,true);
  doc.addEventListener('selectionchange',textbox);
  doc.addEventListener('close',()=>{if(!doc.querySelector('#textbox-edit-dialog[open]'))projectSelection();},true);
  // Workspace shell is mounted after this existing dialog owner.
  queueMicrotask(sync);
}
