import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import type { Interaction } from './interaction.js';
import { textboxView } from './textbox-edit.js';
import { copy, type Selection } from './model.js';
import { formatInputGuard, sameFormatTarget } from './integration/a-format-input-guard.js';
import { visibleManagerControls } from './manager-layout.js';

export function mountTextboxEditor(doc:Document,editor:Interaction,actions:{busy:()=>boolean;changed:()=>void;focus:()=>void;error:(e:unknown)=>void}){
  const launch=doc.createElement('button');launch.type='button';launch.id='textbox-edit-open';launch.textContent='글상자 내용 편집…  Enter';
  const host=doc.querySelector<HTMLElement>('#main-menu [data-edit-panel]');if(!host)return;
  launch.setAttribute('role','menuitem');
  host.append(launch);
  const dialog=doc.createElement('dialog');dialog.id='textbox-edit-dialog';dialog.className='manager-dialog';dialog.setAttribute('aria-label','글상자 내용 편집');
  const form=doc.createElement('form'),title=doc.createElement('h2');title.textContent='글상자 내용 편집';
  const fields=doc.createElement('section');fields.className='textbox-edit-fields';
  const paragraph=doc.createElement('select');paragraph.setAttribute('aria-label','글상자 문단');
  const text=doc.createElement('textarea');text.setAttribute('aria-label','글상자 문단 내용');text.rows=5;text.spellcheck=false;
  const notice=doc.createElement('p');notice.textContent='문단 내용을 수정한 뒤 적용하세요. Enter는 입력한 내용을 적용하고 그 위치에서 문단을 나눕니다. Esc·닫기는 적용 전 내용을 취소합니다.';
  const status=doc.createElement('p');status.setAttribute('role','status');
  const footer=doc.createElement('div');footer.className='manager-footer';
  const apply=doc.createElement('button');apply.type='submit';apply.textContent='적용';apply.id='textbox-edit-apply';
  const undo=doc.createElement('button');undo.type='button';undo.textContent='실행 취소';undo.id='textbox-edit-undo';
  const redo=doc.createElement('button');redo.type='button';redo.textContent='다시 실행';redo.id='textbox-edit-redo';
  const closeButton=doc.createElement('button');closeButton.type='button';closeButton.textContent='닫기';closeButton.id='textbox-edit-close';
  fields.append(paragraph,text,notice,status);footer.append(undo,redo,apply,closeButton);form.append(title,fields,footer);dialog.append(form);doc.body.append(dialog);
  const guard=formatInputGuard(form);let captured:ReturnType<Interaction['capture']>|undefined,view:ReturnType<typeof textboxView>|undefined,entry:Selection|undefined,entryRevision=0,composing=false;
  const busy=()=>actions.busy()||!!doc.querySelector('dialog[open]:not(#textbox-edit-dialog)');
  const stale=()=>!captured||!sameFormatTarget(captured,editor.capture());
  const scalar=(offset:number)=>[...text.value.slice(0,offset)].length;
  const draft=()=>!!view&&text.value!==view.text;
  function sync(){
    let reason='';try{if(busy())reason='입력·저장 중에는 사용할 수 없습니다.';else if(dialog.open&&stale())reason='문서·선택이 변경되었습니다. 닫고 다시 선택하세요.';else textboxView(editor.adapter,editor.selection);}catch(e){reason=String(e).replace(/^Error: /,'');}
    // Launch remains visible with an exact reason, never guesses a table/body owner.
    launch.disabled=!!reason;launch.title=reason||'선택한 일반 글상자의 문단 내용을 편집합니다.';
    if(!dialog.open)return;
    if(reason)status.textContent=reason;
    apply.disabled=!!reason||composing;paragraph.disabled=!!reason||draft()||composing;text.disabled=!!reason;
    undo.disabled=!!reason||draft()||composing||!editor.history.undoStack.length;redo.disabled=!!reason||draft()||composing||!editor.history.redoStack.length;
    paragraph.title=draft()?'수정 내용을 적용하거나 닫아 취소한 뒤 문단을 바꾸세요.':'';
  }
  function read(){
    view=textboxView(editor.adapter,editor.selection);editor.selection=view.selection;captured=editor.capture();
    paragraph.replaceChildren();for(let n=0;n<view.count;n++){const o=doc.createElement('option');o.value=String(n);o.textContent=`${n+1}번째 문단`;paragraph.append(o);}paragraph.value=String(view.index);
    text.dataset.documentId=captured.documentId;text.dataset.paragraphTarget=view.marker.target.targetId;
    text.value=view.text;const marker=view.marker;const units=(n:number)=>[...view!.text].slice(0,n).join('').length;text.setSelectionRange(units(marker.anchor),units(marker.offset));status.textContent=`${view.count}개 문단 · ${view.index+1}번째 편집`;sync();
  }
  const open=()=>{if(dialog.open||busy())return;try{entry=copy(editor.selection);entryRevision=editor.adapter.revision;view=textboxView(editor.adapter,editor.selection);editor.selection=view.selection;captured=editor.capture();doc.querySelectorAll('#main-menu details[open],#shape-menu[open]').forEach(e=>e.removeAttribute('open'));guard.open();read();showEditorDialog(dialog);text.focus();sync();}catch(e){entry=undefined;actions.error(e);}};
  launch.onclick=open;
  const event=(e:Event)=>{if((e as CustomEvent<string>).detail==='textbox-edit')open();};doc.addEventListener('rhwp:shortcut-ui',event);
  function applyEdit(split=false){if(!guard.ready()||composing)return;try{
    if(busy()||stale()||!view||!captured)throw Error('문서·선택이 변경되었습니다. 다시 여세요.');
    let value=text.value,caret=scalar(text.selectionEnd);
    if(split){const from=text.selectionStart,to=text.selectionEnd;value=value.slice(0,from)+value.slice(to);caret=[...value.slice(0,from)].length;}
    if(!split&&value===view.text){status.textContent='변경된 내용이 없습니다.';return;}
    editor.execute({type:'textbox-edit',change:{expected:view.text,text:value,caret,...(split?{splitAt:caret}:{})}},captured);
    actions.changed();read();text.focus();
  }catch(e){status.textContent=String(e).replace(/^Error: /,'');}}
  form.onsubmit=e=>{e.preventDefault();applyEdit();};text.oninput=()=>sync();
  // Native textarea IME is a local draft, not a cloned Core document. Its final
  // text is lowered once through the same captured Command/History transaction.
  form.addEventListener('compositionstart',()=>{composing=true;sync();});form.addEventListener('compositionend',()=>{composing=false;setTimeout(sync,0);});
  text.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.defaultPrevented&&!e.isComposing&&e.keyCode!==229&&!e.repeat&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.getModifierState('AltGraph')){e.preventDefault();applyEdit(true);}});
  text.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&!e.getModifierState('AltGraph')&&!e.altKey&&(e.ctrlKey!==e.metaKey)&&!draft()&&guard.ready()&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();(e.key.toLowerCase()==='y'||e.shiftKey?redo:undo).click();}});
  paragraph.onchange=()=>{try{if(stale()||draft()||busy())throw Error('수정 중인 내용을 먼저 적용하거나 취소하세요.');const next=textboxView(editor.adapter,editor.selection,Number(paragraph.value));editor.selection=next.selection;read();text.focus();}catch(e){status.textContent=String(e);}};
  for(const [button,again]of[[undo,false],[redo,true]]as const)button.onclick=()=>{try{if(stale()||draft()||busy()||!guard.ready())return;editor.undo(again);actions.changed();const s=editor.selection;if(s.kind==='object'&&s.textbox&&s.textbox.instanceId===view?.marker.instanceId&&s.textbox.scInstId===view.marker.scInstId){read();text.focus();}else close();}catch(e){status.textContent=String(e);}};
  const close=()=>{guard.close();if(entry&&editor.adapter.revision===entryRevision)editor.selection=entry;closeEditorDialog(dialog);captured=undefined;view=undefined;entry=undefined;};
  closeButton.onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();if(!composing)close();});dialog.addEventListener('close',()=>{if(!dialog.open)guard.close();});
  form.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Tab'&&!e.isComposing&&e.keyCode!==229){const all=visibleManagerControls(form),at=all.indexOf(doc.activeElement as HTMLElement);if(all.length&&(at<0||(e.shiftKey?at===0:at===all.length-1))){e.preventDefault();all[e.shiftKey?all.length-1:0].focus();}}});
  host.closest("details")?.addEventListener("rhwp:menu-opening",sync);host.closest("details")?.addEventListener("toggle",sync);sync();
  return{sync};
}
