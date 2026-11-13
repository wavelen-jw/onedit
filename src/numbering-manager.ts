import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import { managerTabs, visibleManagerControls } from "./manager-layout.js";
import { numberRestartReason } from './numbering-restart.js';
import type { Interaction } from './interaction.js';
import type { Command } from './model.js';
import type { ListCatalog, ParagraphListChange } from './paragraph-lists.js';
import { defaultNumberDefinition, numberCodes, numberRestartHold, validateNumberDefinition } from './numbering-definitions.js';
import { formatInputGuard, sameFormatTarget } from './integration/a-format-input-guard.js';

// Draft-only manager. The common paragraph-list Command owns the single
// create+apply transaction; closing or editing a draft never changes Core.
export function mountNumberManager(host:HTMLElement,editor:Interaction,actions:{
  busy:()=>boolean; execute:(command:Command,captured:ReturnType<Interaction['capture']>)=>void;
  changed:()=>void; focus:()=>void;
}) {
  const dialog=document.createElement('dialog'),form=document.createElement('form');
  dialog.id='number-manager';dialog.setAttribute('aria-label','사용자 번호·개요 관리');form.id='number-manager-form';form.noValidate=true;dialog.classList.add('manager-dialog');
  const title=document.createElement('h2');title.textContent='사용자 번호·개요 관리';
  const status=document.createElement('p');status.setAttribute('aria-live','polite');
  const note=document.createElement('p');note.textContent='기존 정의는 조회·선택 적용합니다. 정의 편집은 새 정의의 초안에서 지원하며 원본은 변경하지 않습니다. 기존 정의의 수준별 문자 종류를 조회하거나 직접 수정·삭제하는 API는 없습니다. 시작값은 새 정의 전체의 값이며 문단별 새 시작과 다릅니다. 편집 영역의 Alt+Shift+Insert는 지원 본문 번호 문단을 1부터 다시 시작합니다. 이 창에서는 시작값 초안을 선택한 뒤 적용합니다.';
  const mode=document.createElement('select');mode.name='numberMode';for(const[v,t]of [['','혼합 / 유지'],['Number','문단 번호'],['Outline','개요 번호']])mode.add(new Option(t,v));
  const list=document.createElement('select');list.name='managedNumber';const level=document.createElement('select');level.name='numberLevel';level.add(new Option('혼합 / 유지',''));for(let i=0;i<7;i++)level.add(new Option(`${i+1}수준`,String(i)));
  const fields=document.createElement('div');fields.dataset.numberDefinition='true';fields.id='number-definition-fields';
  const bar=document.createElement('div'),footer=document.createElement('div');
  const button=(id:string,text:string,parent=bar)=>{const b=document.createElement('button');b.id=id;b.type='button';b.textContent=text;parent.append(b);return b;};
  const add=button('number-new','새 정의 / 초안 편집'),existing=button('number-existing','기존 정의 보기');
  const ok=button('number-manager-apply','선택 문단에 적용',footer);ok.type='submit';const cancel=button('number-manager-cancel','닫기 / 취소',footer);
  const restartButton=button('number-restart','이 문단부터 새 시작'),continueButton=button('number-continue','이전 번호 이어가기');
  for(const[id,text,reason]of [['number-edit-original','기존 정의 직접 수정','Core 수정 API가 없습니다. 새 정의 초안을 사용하세요.'],['number-delete','기존 정의 삭제','Core 삭제 API가 없습니다.']]){const b=button(id,text);b.disabled=true;b.title=reason;}
  const restart=document.createElement('select');restart.name='restartMode';for(const[v,t]of [['','번호 연결 유지'],['0','앞 번호 이어'],['1','이전 번호 목록 이어'],['2','새 번호로 시작']])restart.add(new Option(t,v));
  const start=document.createElement('input');start.name='restartStart';start.type='number';start.min='1';start.max='65535';
  const label=(text:string,c:HTMLElement,parent:HTMLElement)=>{const l=document.createElement('label');l.append(document.createTextNode(text),c);parent.append(l);};
  const tabs=document.createElement('div'),selection=document.createElement('section'),connection=document.createElement('section');tabs.id='number-manager-tabs';selection.dataset.managerGroup='selection';fields.dataset.managerGroup='definition';connection.dataset.managerGroup='connection';label('번호 종류',mode,selection);label('문서 정의',list,selection);label('선택 문단 수준 (1~7)',level,selection);label('문단 번호 연결',restart,connection);label('이 문단 시작값 (1~65535)',start,connection);connection.append(restartButton,continueButton);selection.append(bar);tabs.append(selection,fields,connection);const tabState=managerTabs(tabs,[['selection','번호·개요'],['definition','사용자 정의 (7수준)'],['connection','새 시작·이어가기']],row=>row.dataset.managerGroup!);footer.className='manager-footer';status.className='manager-status';note.className='manager-note';form.append(title,tabs,status,note,footer);dialog.append(form);host.append(dialog);
  const guard=formatInputGuard(form);let captured:ReturnType<Interaction['capture']>|undefined,catalog:ListCatalog,creating=false;
  let focusPending=false;
  let initialMode='',initialLevel='',initialId='',controls=new Map<string,HTMLInputElement|HTMLSelectElement>();
  const current=()=>{if(!captured||!sameFormatTarget(captured,editor.capture()))throw Error('문서·리비전·선택이 변경되었습니다. 취소 후 다시 여세요.');if(actions.busy())throw Error('입력·저장을 마친 후 사용하세요.');editor.adapter.assertEditable(captured.selection.focus);return captured;};
  const paint=()=>{
    controls=new Map();fields.replaceChildren();list.disabled=creating;
    const row=catalog.numbers.find(d=>d.id===Number(list.value)),draft=defaultNumberDefinition();
    const input=(name:string,text:string,value:string,options?:readonly(readonly[number,string])[])=>{const c=options?document.createElement('select'):document.createElement('input');c.name=name;if(options)for(const[v,t]of options)(c as HTMLSelectElement).add(new Option(t,String(v)));c.value=value;c.disabled=!creating;if(name==='numberStart'){const n=c as HTMLInputElement;n.type='number';n.min='1';n.max='65535';n.step='1';}else if(name.startsWith('numberFormat'))(c as HTMLInputElement).maxLength=32;controls.set(name,c);label(text,c,fields);return c;};
    input('numberStart','정의 시작값 (1~65535)',String(creating?draft.startNumber:row?.startNumber??''));
    for(let i=0;i<7;i++){input('numberFormat'+i,`${i+1}수준 모양 (^${i+1})`,creating?draft.levelFormats[i]:row?.levelFormats[i]??'');if(creating)input('numberCode'+i,`${i+1}수준 문자 종류`,String(draft.numberFormats[i]),numberCodes);}
    add.disabled=typeof editor.adapter.doc.createNumbering!=='function';existing.disabled=!creating;
    const reason=creating?'새 정의를 먼저 적용한 뒤 문단 번호 연결을 변경하세요.':numberRestartReason(editor);
    restart.disabled=restartButton.disabled=continueButton.disabled=!!reason;
    restart.title=restartButton.title=continueButton.title=reason;
    start.disabled=!!reason||restart.value!=='2';
    const observed=reason?undefined:editor.adapter.paraProps(editor.selection.focus);
    const connection=observed?`현재 연결: ${observed.numberingRestartMode===2?'새 번호 시작 '+observed.numberingStartNum:observed.numberingRestartMode===1?'이전 번호 목록 이어':'앞 번호 이어'}. `:'';

    status.textContent=creating?'7수준의 새 정의 초안입니다. 적용 시에만 생성하며 선택 밖 문단은 기존 정의를 유지합니다.':`현재 선택: ${initialMode||'혼합 / 번호 없음'} · 정의 ${initialId||'혼합 / 없음'} · 수준 ${initialLevel===''?'혼합':Number(initialLevel)+1}. 기존 수준별 문자 종류는 조회 미지원입니다. ${connection}${reason||'선택한 한 문단의 목록 연결만 바뀌고 다른 문단의 연결은 유지됩니다. 앞 목록과 이미 같으면 이어가기는 같은 연결로 정규화됩니다.'}`;
  };
  // close events are queued by the browser. Restore the input synchronously
  // so a following Undo cannot be routed to a now-hidden modal field.
  const restoreFocus=()=>{if(dialog.open||!focusPending)return;focusPending=false;actions.focus();};
  const close=()=>{guard.close();captured=undefined;closeEditorDialog(dialog);restoreFocus();};
  restart.addEventListener('change',()=>{start.disabled=restart.disabled||restart.value!=='2';});
  restartButton.onclick=()=>{if(restartButton.disabled)return;restart.value='2';start.disabled=false;tabState.activate('connection');start.focus();};
  continueButton.onclick=()=>{if(continueButton.disabled)return;restart.value='1';start.disabled=true;};
  add.onclick=()=>{try{current();if(add.disabled)return;creating=true;if(!mode.value)mode.value='Number';paint();tabState.activate('definition');controls.get('numberFormat0')?.focus();}catch(e){status.textContent=String(e);}};
  existing.onclick=()=>{try{current();creating=false;paint();tabState.activate('selection');}catch(e){status.textContent=String(e);}};
  list.addEventListener('change',()=>{try{current();paint();}catch(e){status.textContent=String(e);}});
  const touched = new Set<string>();
  for (const [field, control] of [['mode',mode],['definition',list],['level',level]] as const)
    control.addEventListener('change',()=>touched.add(field));
  form.addEventListener('submit',e=>{e.preventDefault();try{
    if(!guard.ready())return;const target=current(),change:ParagraphListChange={};
    if(mode.value && !['Number','Outline'].includes(mode.value))throw Error('지원하지 않는 번호 종류입니다.');
    if(mode.value&&(mode.value!==initialMode||touched.has('mode')))change.mode=mode.value as 'Number'|'Outline';
    if(level.value!==''&&(level.value!==initialLevel||touched.has('level')))change.level=Number(level.value);
    if(creating){const read=(n:string)=>controls.get(n)!.value;change.custom={levelFormats:Array.from({length:7},(_,i)=>read('numberFormat'+i)),numberFormats:Array.from({length:7},(_,i)=>Number(read('numberCode'+i))),startNumber:Number(read('numberStart'))};validateNumberDefinition(change.custom);}
    else if(list.value&&(list.value!==initialId||touched.has('definition')))change.definition=Number(list.value);
    if((change.custom||change.definition!==undefined||change.level!==undefined)&&!mode.value)throw Error('혼합 선택에서는 번호 종류를 명시적으로 선택하세요.');
    if(restart.value!==''){
      if(creating||Object.keys(change).length)throw Error('번호 정의·종류·수준을 먼저 적용한 뒤 연결 방식을 바꾸세요.');
      if(restart.disabled)throw Error(numberRestartReason(editor)||numberRestartHold);
      const mode=Number(restart.value);if(![0,1,2].includes(mode))throw Error('지원하지 않는 번호 연결 방식입니다.');
      guard.consume();actions.execute({type:'numbering-restart',change:{mode:mode as 0|1|2,...(mode===2?{start:Number(start.value)}:{})}},target);close();actions.changed();return;
    }
    if(Object.keys(change).length&&touched.size)change.explicit=true;
    guard.consume();if(Object.keys(change).length)actions.execute({type:'paragraph-list',list:change},target);close();actions.changed();
  }catch(error){status.textContent=String(error);guard.open();}});
  cancel.onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{if(dialog.open)return;guard.close();captured=undefined;restoreFocus();});
  form.addEventListener('keydown',e=>{if(e.key==='Tab'){const active=visibleManagerControls(form),at=active.indexOf(document.activeElement as HTMLElement);if(active.length&&(at<0||(e.shiftKey?at===0:at===active.length-1))){e.preventDefault();active[e.shiftKey?active.length-1:0].focus();}}e.stopPropagation();});
  return {get open(){return dialog.open;},show(){if(dialog.open)return;if(actions.busy())throw Error('입력·저장을 마친 후 사용하세요.');touched.clear();captured=editor.capture();editor.adapter.assertEditable(captured.selection.focus);catalog=editor.adapter.paragraphListCatalog();const state=editor.formatState('paragraph');initialMode=['Number','Outline'].includes(String(state.headType))?String(state.headType):'';initialLevel=state.paraLevel===undefined?'':String(state.paraLevel);initialId=initialMode&&catalog.numbers.some(r=>r.id===state.numberingId)?String(state.numberingId):'';mode.value=initialMode;level.value=initialLevel;list.replaceChildren(new Option('혼합 / 유지',''));for(const row of catalog.numbers)list.add(new Option(`정의 ${row.id}: ${row.levelFormats.join(' / ')} · 시작 ${row.startNumber??'조회 미지원'}`,String(row.id)));list.value=initialId;creating=false;restart.value='';start.value=String(editor.adapter.paraProps(editor.selection.focus).numberingStartNum??1);paint();tabState.activate('selection');guard.open();focusPending=true;showEditorDialog(dialog);mode.focus();},sync(){if(dialog.open&&captured&&!sameFormatTarget(captured,editor.capture())){guard.consume();for(const b of [add,existing,ok,restartButton,continueButton,restart,start])b.disabled=true;status.textContent='문서·리비전·선택이 변경되었습니다. 취소 후 다시 여세요.';}}};
}
