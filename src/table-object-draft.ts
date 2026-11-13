import { bindEditorDialogFormSubmit, closeEditorDialog, showDocumentEditingDialog } from "./editor-popup-focus.js";
import type {Interaction} from './interaction.js';
import {selectedTableObject} from './table-object-command.js';
import {fields} from './format-dialog.js';
import type {Props} from './model.js';
import {formatInputGuard,sameFormatTarget} from './integration/a-format-input-guard.js';
// The form is a draft of the existing table-object setter, never cell L/C or B/F.
export function mountTableObjectDraft(doc:Document,editor:Interaction,actions:{blocked:()=>boolean;inFlight:()=>boolean;changed:()=>void}){
 const dialog=doc.createElement('dialog');dialog.id='table-object-draft';dialog.className='manager-dialog';
 const form=doc.createElement('form'),title=doc.createElement('h2'),note=doc.createElement('p'),tabs=doc.createElement('nav'),body=doc.createElement('div'),status=doc.createElement('p');form.dataset.ui2Draft='';status.setAttribute('role','status');
 const ok=doc.createElement('button');ok.type='submit';ok.textContent='적용';ok.dataset.tableObjectApply='';const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.onclick=()=>closeEditorDialog(dialog);
 form.append(title,note,tabs,body,status,ok,cancel);dialog.append(form);doc.body.append(dialog);const guard=formatInputGuard(form);
 bindEditorDialogFormSubmit(form);
 let target:ReturnType<Interaction['capture']>|undefined,mode:'transpose'|'line'|'background'='line';const values=new Map<string,HTMLInputElement|HTMLSelectElement>(),pages=new Map<string,HTMLElement>();
 const tab=(next:'line'|'background')=>{mode=next;for(const [k,p]of pages)p.hidden=k!==next;for(const b of tabs.querySelectorAll<HTMLButtonElement>('button'))b.setAttribute('aria-pressed',String(b.dataset.tableObjectTab===next));};
 form.onsubmit=e=>{e.preventDefault();try{if(!guard.ready())return;if(actions.inFlight())throw Error('입력·저장 작업을 마친 뒤 적용하세요.');if(!target||!sameFormatTarget(target,editor.capture()))throw Error('문서·선택이 변경되었습니다. 취소 후 다시 여세요.');
  const props:Props={};for(const [key,c]of values)if(c.value)props[key]=/\.(type|width)$/.test(key)?Number(c.value):c.value;
  editor.execute({type:'table-object',action:mode==='transpose'?'transpose':'format',props},target);guard.consume();closeEditorDialog(dialog);actions.changed();
 }catch(e){status.textContent=String(e);}};
 dialog.addEventListener('close',()=>{if(dialog.open)return;guard.close();target=undefined;});
 form.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();closeEditorDialog(dialog);}if(e.key==='Tab'){const a=[...form.querySelectorAll<HTMLElement>('input,select,button')].filter(c=>c.getClientRects().length&&!(c as HTMLInputElement).disabled),i=a.indexOf(doc.activeElement as HTMLElement);if(e.shiftKey&&i<=0||!e.shiftKey&&i===a.length-1){e.preventDefault();a[e.shiftKey?a.length-1:0]?.focus();}}});
 return {show(next:typeof mode){if(actions.blocked()||dialog.open)return;selectedTableObject(editor.adapter,editor.selection,next==='transpose');target=editor.capture();mode=next;values.clear();pages.clear();tabs.replaceChildren();body.replaceChildren();status.textContent='';title.textContent=next==='transpose'?'표 뒤집기 · 줄/칸 전치':'표 개체 테두리/배경';dialog.setAttribute('aria-label',title.textContent);
  if(next==='transpose'){note.textContent='지원: 줄/칸 바꾸기(대각선 기준 전치). 전체 폭은 유지하고 칸 너비를 재분배하며 줄 높이는 기존 최대값으로 맞춥니다. 안 여백은 함께 뒤집지 않습니다. 줄·칸 거울 대칭, 90/180/270도 회전은 미지원입니다.';const text=doc.createElement('p');text.textContent='선택한 표 전체의 줄과 칸을 바꿉니다. 병합 셀은 변경하지 않습니다.';body.append(text);}
  else{note.textContent='표 개체 전체(모든 셀·기존 셀 영역)에 적용합니다. 셀별/블록 B·F와 다릅니다. 변경할 방향의 종류·굵기·색을 모두 명시하세요. 빈 항목은 유지합니다. 배경은 단색/없음만 지원하며 명시하면 기존 무늬를 대체합니다.';
   for(const [k,label]of [['line','테두리'],['background','채우기']]as const){const b=doc.createElement('button');b.type='button';b.textContent=label;b.dataset.tableObjectTab=k;b.onclick=()=>tab(k);tabs.append(b);const page=doc.createElement('section');pages.set(k,page);body.append(page);}
   for(const f of fields('cell').filter(f=>f.name==='background'||/^border/.test(f.name))){const label=doc.createElement('label'),span=doc.createElement('span');span.textContent=f.label.replace(/^셀 /,'');label.append(span);let control:HTMLInputElement|HTMLSelectElement;
    if(f.options){const c=doc.createElement('select');c.add(new Option('변경 안 함',''));for(const [v,t]of f.options)c.add(new Option(t,v));control=c;}
    else{const c=doc.createElement('input');c.type='text';c.placeholder='변경 안 함';c.pattern='#[0-9a-fA-F]{6}';control=c;}
    control.name=f.name;values.set(f.name,control);label.append(control);
    if(f.name==='background'){const custom=doc.createElement('input');custom.type='text';custom.pattern='#[0-9a-fA-F]{6}';custom.placeholder='직접 입력 #RRGGBB';custom.setAttribute('aria-label','표 개체 배경 사용자 색');custom.oninput=()=>{if(/^#[\da-f]{6}$/i.test(custom.value)){const c=control as HTMLSelectElement;if(![...c.options].some(o=>o.value===custom.value))c.add(new Option(custom.value,custom.value));c.value=custom.value;}};control.onchange=()=>custom.value='';label.append(custom);}
    pages.get(f.name==='background'?'background':'line')!.append(label);
   }tab(next);
  }
  doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));guard.open();showDocumentEditingDialog(dialog);(next==='transpose'?ok:tabs.querySelector<HTMLButtonElement>(`[data-table-object-tab="${next}"]`))?.focus();
 },dispose(){guard.close();dialog.remove();}};
}
