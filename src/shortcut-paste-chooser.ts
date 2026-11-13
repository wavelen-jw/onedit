import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import type {Interaction} from './interaction.js';
import {sameFormatTarget} from './integration/a-format-input-guard.js';
import {pastePolicyHelp} from './paste-result-ui.js';
export function mountPasteChooser(doc:Document,editor:Interaction,actions:{blocked:()=>boolean;focus:()=>void;paste:(plain:boolean)=>void}) {
  const dialog=doc.createElement('dialog');dialog.id='paste-chooser';dialog.className='manager-dialog';dialog.setAttribute('aria-label','골라 붙이기');
  const title=doc.createElement('h2');title.textContent='골라 붙이기';dialog.append(title);
  let captured:ReturnType<Interaction['capture']>|undefined;
  const status=doc.createElement('p');status.setAttribute('role','status');
  const buttons:HTMLButtonElement[]=[];
  for(const [label,plain,note]of [['원본 서식 포함 (지원 범위)',false,pastePolicyHelp.source],['텍스트만 붙이기',true,pastePolicyHelp.text]] as const){
    const b=doc.createElement('button');b.type='button';b.textContent=label;b.title=note;b.dataset.pastePolicy=plain?'text':'source';buttons.push(b);dialog.append(b);
    b.onclick=()=>{try{if(!captured||!sameFormatTarget(captured,editor.capture()))throw Error('문서·선택이 변경되었습니다. 취소 후 다시 여세요.');
      // blocked() includes this dialog; close only after validating its exact target.
      const before=captured;closeEditorDialog(dialog);actions.focus();
      if(actions.blocked()||!sameFormatTarget(before,editor.capture()))throw Error('현재 붙여넣기 대상을 사용할 수 없습니다.');
      actions.paste(plain);
    }catch(error){status.textContent=String(error);}};
  }
  const target=doc.createElement('button');target.type='button';target.disabled=true;target.textContent='대상 서식 맞춤 · 미지원';target.title=pastePolicyHelp.target;dialog.append(target);
  const note=doc.createElement('p');note.textContent=pastePolicyHelp.target+' Ctrl+Alt+V는 기존 두 붙여넣기 경로를 선택하는 입구입니다. 서식 손실을 숨기는 자동 전환은 하지 않습니다.';
  const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.dataset.pasteCancel='';cancel.onclick=()=>closeEditorDialog(dialog);buttons.push(cancel);dialog.append(note,status,cancel);doc.body.append(dialog);
  dialog.addEventListener('close',()=>{if(dialog.open)return;captured=undefined;});
  dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();closeEditorDialog(dialog);}if(e.key==='Tab'){const at=buttons.indexOf(doc.activeElement as HTMLButtonElement);if(e.shiftKey&&at<=0||!e.shiftKey&&at===buttons.length-1){e.preventDefault();buttons[e.shiftKey?buttons.length-1:0].focus();}}});
  return {show(){if(actions.blocked()||dialog.open)return;captured=editor.capture();status.textContent='';doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));showEditorDialog(dialog);buttons[0].focus();},dispose(){dialog.remove();}};
}
