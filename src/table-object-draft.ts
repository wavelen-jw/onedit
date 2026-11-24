import { editorFeedbackText } from "./editor-feedback-text.js";
import { bindModalNavigation, bindEditorDialogFormSubmit, closeEditorDialog, showDocumentEditingDialog } from "./editor-popup-focus.js";
import type {Interaction} from './interaction.js';
import {selectedTableObject} from './table-object-command.js';
import {cellAppearanceFields} from './format-fields.js';
import type {Props} from './model.js';
import {formatInputGuard,sameFormatTarget} from './integration/a-format-input-guard.js';
// The form is a draft of the existing table-object setter, never cell L/C or B/F.
export function mountTableObjectDraft(doc:Document,editor:Interaction,actions:{blocked:()=>boolean;inFlight:()=>boolean;changed:()=>void}){
 const dialog=doc.createElement('dialog');dialog.id='table-object-draft';dialog.className='manager-dialog';
 const form=doc.createElement('form'),title=doc.createElement('h2'),note=doc.createElement('p'),tabs=doc.createElement('nav'),body=doc.createElement('div'),status=doc.createElement('p');form.dataset.ui2Draft='';status.setAttribute('role','status');
 const ok=doc.createElement('button');ok.type='submit';ok.textContent='적용';ok.dataset.tableObjectApply='';const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='취소';
 const footer=doc.createElement('footer');footer.className='manager-footer';footer.append(cancel,ok);form.append(title,note,tabs,body,status,footer);dialog.append(form);doc.body.append(dialog);const guard=formatInputGuard(form);
 bindEditorDialogFormSubmit(form);
 let target:ReturnType<Interaction['capture']>|undefined,mode:'transpose'|'line'|'background'|'pagination'='line';const values=new Map<string,HTMLInputElement|HTMLSelectElement>(),pages=new Map<string,HTMLElement>();
 const tab=(next:'line'|'background')=>{mode=next;for(const [k,p]of pages)p.hidden=k!==next;for(const b of tabs.querySelectorAll<HTMLButtonElement>('button'))b.setAttribute('aria-pressed',String(b.dataset.tableObjectTab===next));};
 form.onsubmit=e=>{e.preventDefault();try{if(!guard.ready())return;if(actions.inFlight())throw Error('입력·저장 작업을 마친 뒤 적용하세요.');if(!target||!sameFormatTarget(target,editor.capture()))throw Error('문서·선택이 변경되었습니다. 취소 후 다시 여세요.');
  const props:Props={};for(const [key,c]of values)if(c.value)props[key]=/\.(type|width)$/.test(key)?Number(c.value):c.value;
  if (mode === 'pagination') {
    props.treatAsChar = props.treatAsChar === 'true';
    if (!props.treatAsChar) props.pageBreak = Number(props.pageBreak);
    else delete props.pageBreak;
  }
  editor.execute({type:'table-object',action:mode==='transpose' || mode==='pagination' ? mode : 'format',props},target);guard.consume();closeEditorDialog(dialog);actions.changed();
 }catch(e){status.textContent=editorFeedbackText(e);}};
 dialog.addEventListener('close',()=>{if(dialog.open)return;guard.close();target=undefined;});

  guard.bindCancel(cancel, () => closeEditorDialog(dialog));
  bindModalNavigation(form, dialog);
 return {show(next:typeof mode){if(actions.blocked()||dialog.open)return;const {raw} = selectedTableObject(editor.adapter,editor.selection,next==='transpose',undefined,next==='pagination');target=editor.capture();mode=next;values.clear();pages.clear();tabs.replaceChildren();body.replaceChildren();status.textContent='';title.textContent=next==='transpose'?'표의 줄·칸 바꾸기':next==='pagination'?'표 쪽 나누기':'표 전체의 테두리·배경';dialog.setAttribute('aria-label',title.textContent);
  if(next==='transpose'){note.textContent='표 전체의 줄과 칸을 바꾸고 너비를 다시 나눕니다. 병합 셀이 있는 표에는 사용할 수 없습니다.';}
  else if (next === 'pagination') {
    note.textContent = '여러 쪽에 걸쳐 표시하려면 글자처럼 취급을 끄고 쪽 나누기를 선택하세요.';
    const addSelect = (key: string, caption: string, choices: string[][], value: string) => {
      const label = doc.createElement('label'), select = doc.createElement('select');
      select.name = key;
      for (const [choice, text] of choices) select.add(new Option(text, choice));
      select.value = value;
      label.append(caption, select);
      values.set(key, select);
      body.append(label);
      return select;
    };
    const placement = addSelect('treatAsChar', '글자처럼 취급', [['true', '켜짐'], ['false', '꺼짐']], String(raw.treatAsChar));
    const breaks = addSelect('pageBreak', '쪽 경계에서', [['0', '나누지 않음'], ['1', '셀 단위로 나눔'], ['2', '행 단위로 나눔']], String(raw.pageBreak));
    const sync = () => { breaks.disabled = placement.value === 'true'; };
    placement.onchange = sync;
    sync();
  }
  else{note.textContent='선택한 표 전체에 적용합니다. 단색 배경을 선택하면 기존 무늬가 바뀝니다.';
   for(const [k,label]of [['line','테두리'],['background','채우기']]as const){const b=doc.createElement('button');b.type='button';b.textContent=label;b.dataset.tableObjectTab=k;b.onclick=()=>tab(k);tabs.append(b);const page=doc.createElement('section');pages.set(k,page);body.append(page);}
   for(const f of cellAppearanceFields()){const label=doc.createElement('label'),span=doc.createElement('span');span.textContent=f.label.replace(/^셀 /,'');label.append(span);let control:HTMLInputElement|HTMLSelectElement;
    if(f.options){const c=doc.createElement('select');c.add(new Option('변경 안 함',''));for(const [v,t]of f.options)c.add(new Option(t,v));control=c;}
    else{const c=doc.createElement('input');c.type='text';c.placeholder='변경 안 함';c.pattern='#[0-9a-fA-F]{6}';control=c;}
    control.name=f.name;values.set(f.name,control);label.append(control);
    if(f.name==='background'){const custom=doc.createElement('input');custom.type='text';custom.pattern='#[0-9a-fA-F]{6}';custom.placeholder='직접 입력 #RRGGBB';custom.setAttribute('aria-label','표 개체 배경 사용자 색');custom.oninput=()=>{if(/^#[\da-f]{6}$/i.test(custom.value)){const c=control as HTMLSelectElement;if(![...c.options].some(o=>o.value===custom.value))c.add(new Option(custom.value,custom.value));c.value=custom.value;}};control.onchange=()=>custom.value='';label.append(custom);}
    pages.get(f.name==='background'?'background':'line')!.append(label);
   }tab(next);
  }
  doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));guard.open();showDocumentEditingDialog(dialog);(next==='transpose'?ok:next==='pagination'?values.get('treatAsChar'):tabs.querySelector<HTMLButtonElement>(`[data-table-object-tab="${next}"]`))?.focus();
 },dispose(){guard.close();dialog.remove();}};
}
