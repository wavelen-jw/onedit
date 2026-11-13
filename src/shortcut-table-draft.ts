import { closeEditorDialog, showDocumentEditingDialog } from "./editor-popup-focus.js";
import type {Interaction} from './interaction.js';
import {nested} from './model.js';
import {sameFormatTarget,formatInputGuard} from './integration/a-format-input-guard.js';
export function mountTableKeyDraft(doc:Document,editor:Interaction,actions:{blocked:()=>boolean;inFlight:()=>boolean;changed:()=>void;error:(e:unknown)=>void}) {
  const dialog=doc.createElement('dialog');dialog.id='table-key-draft';dialog.className='manager-dialog';
  const form=doc.createElement('form'),title=doc.createElement('h2'),fields=doc.createElement('div'),status=doc.createElement('p');status.setAttribute('role','status');
  const axis=doc.createElement('select');axis.name='axis';axis.add(new Option('줄','row'));axis.add(new Option('칸','col'));
  const after=doc.createElement('select');after.name='after';after.add(new Option('아래/오른쪽','true'));after.add(new Option('위/왼쪽','false'));
  const number=(name:string,initial:string)=>{const n=doc.createElement('input');n.type='number';n.name=name;n.min='1';n.max='16';n.step='1';n.value=initial;return n;};
  const count=number('count','1'),rows=number('rows','1'),cols=number('cols','2'),equal=doc.createElement('input');equal.type='checkbox';equal.name='equal';equal.checked=true;
  const label=(text:string,el:HTMLElement)=>{const l=doc.createElement('label');l.append(text,el);return l;};
  const ok=doc.createElement('button');ok.type='submit';ok.textContent='설정';ok.dataset.tableKeyApply='';
  const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.dataset.tableKeyCancel='';cancel.onclick=()=>closeEditorDialog(dialog);
  form.dataset.ui2Draft='';form.append(title,fields,status,ok,cancel);dialog.append(form);doc.body.append(dialog);const guard=formatInputGuard(form);
  let target:ReturnType<Interaction['capture']>|undefined,mode:'table-add'|'table-delete'|'cell-split'='table-add';
  form.onsubmit=e=>{e.preventDefault();try{
    if(!guard.ready())return;
    if(actions.inFlight())throw Error('입력·저장·클립보드 작업을 마친 뒤 설정하세요.');
    if(!target||!sameFormatTarget(target,editor.capture()))throw Error('문서·선택이 변경되었습니다. 취소 후 다시 여세요.');
    if(mode==='cell-split')editor.execute({type:'table-split',rows:Number(rows.value),cols:Number(cols.value),equalHeight:equal.checked},target);
    else editor.execute({type:'table-edit',operation:axis.value==='row'?(mode==='table-add'?'row-add':'row-delete'):(mode==='table-add'?'col-add':'col-delete'),count:Number(count.value),...(mode==='table-add'?{after:after.value==='true'}:{})},target);
    guard.consume();closeEditorDialog(dialog);actions.changed();
  }catch(error){status.textContent=String(error);}};
  dialog.addEventListener('close',()=>{if(dialog.open)return;guard.close();target=undefined;});
  form.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();closeEditorDialog(dialog);}if(e.key==='Tab'){const all=[...form.querySelectorAll<HTMLElement>('button,select,input')].filter(e=>e.getClientRects().length&&!(e as HTMLInputElement).disabled),at=all.indexOf(doc.activeElement as HTMLElement);if(e.shiftKey&&at<=0||!e.shiftKey&&at===all.length-1){e.preventDefault();all[e.shiftKey?all.length-1:0]?.focus();}}});
  return {show(next:typeof mode){if(actions.blocked()||dialog.open)return;const p=editor.selection.focus;
    if(p.kind!=='cell'||nested(p))throw Error('이 줄/칸·임의 나누기 창은 일반 표에서만 지원합니다. 중첩 셀의 기존 명령은 유지합니다.');
    if(next==='cell-split'&&editor.selection.kind!=='cells')throw Error('F5로 나눌 셀 블록을 먼저 선택하세요.');
    target=editor.capture();mode=next;title.textContent=next==='cell-split'?'셀 나누기':next==='table-add'?'줄/칸 추가하기':'줄/칸 지우기';dialog.setAttribute('aria-label',title.textContent);status.textContent='현재 선택의 첫 셀을 기준으로 변경합니다. 병합 없는 일반 표만 지원하며 취소하면 초안은 적용하지 않습니다.';
    count.value=rows.value='1';cols.value='2';axis.value='row';after.value='true';equal.checked=true;
    fields.replaceChildren(...(next==='cell-split'?[label('줄 수',rows),label('칸 수',cols),label('줄 높이를 같게',equal)]:[label('줄/칸',axis),label('개수',count),...(next==='table-add'?[label('위치',after)]:[])]));
    doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));guard.open();showDocumentEditingDialog(dialog);(next==='cell-split'?rows:axis).focus();},dispose(){guard.close();dialog.remove();}};
}
