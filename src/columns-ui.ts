import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import {menuControlDemanded} from './menu-lifetime.js';
import type { Interaction } from './interaction.js';
import { formatInputGuard, sameFormatTarget } from './integration/a-format-input-guard.js';
import { visibleManagerControls } from './manager-layout.js';
import { columnView, columnEditReason, columnLimit, columnSpacingHu, type ColumnView } from './columns.js';

export function mountColumns(doc:Document,editor:Interaction,actions:{busy:()=>boolean;changed:()=>void;focus:()=>void;error:(e:unknown)=>void}) {
  const launch=doc.getElementById('columns-open') as HTMLButtonElement;
  const presets=[...doc.querySelectorAll<HTMLButtonElement>('[data-column-preset]')];
  const dialog=doc.createElement('dialog');dialog.id='columns-dialog';dialog.className='manager-dialog';dialog.setAttribute('aria-label','다단');
  const form=doc.createElement('form');form.id='columns-form';const title=doc.createElement('h2');title.textContent='다단';
  const target=doc.createElement('p'),fields=doc.createElement('section');fields.className='header-footer-fields';
  const count=doc.createElement('select');count.name='columnCount';for(const n of [1,2]){const o=doc.createElement('option');o.value=String(n);o.textContent=n+'단';count.append(o);}
  const spacing=doc.createElement('input');spacing.name='columnSpacing';spacing.type='number';spacing.min='0';spacing.step='0.01';
  for(const [name,input]of [['단 수',count],['단 사이 간격 (pt)',spacing]] as const){const l=doc.createElement('label');l.append(doc.createTextNode(name),input);fields.append(l);}
  const note=doc.createElement('p');note.className='manager-note';note.textContent=columnLimit+' 현재 본문 구역 전체에 적용합니다. 1pt = 100 HWP 단위이며 1단에서는 간격을 저장해도 단 사이 공간은 생기지 않습니다.';
  const status=doc.createElement('p');status.className='manager-status';status.setAttribute('role','status');
  const footer=doc.createElement('div');footer.className='manager-footer';const ok=doc.createElement('button');ok.type='submit';ok.id='columns-apply';ok.textContent='설정';
  const cancel=doc.createElement('button');cancel.type='button';cancel.id='columns-cancel';cancel.textContent='취소';footer.append(ok,cancel);
  form.append(title,target,fields,status,note,footer);dialog.append(form);doc.body.append(dialog);const guard=formatInputGuard(form);
  let captured:ReturnType<Interaction['capture']>|undefined,view:ColumnView|undefined;
  const busy=()=>actions.busy()||!!doc.querySelector('dialog[open]:not(#columns-dialog)');
  const stale=()=>!captured||!sameFormatTarget(captured,editor.capture());
  const reason=()=>stale()?'문서·선택이 변경되었습니다. 취소 후 다시 여세요.':busy()?'입력·저장·열린 대화상자를 먼저 마치세요.':view?columnEditReason(editor.adapter,editor.selection,view):'기존 단 정의를 확인할 수 없습니다.';
  const sync=()=>{launch.disabled=busy();launch.title=launch.disabled?'입력·저장·열린 대화상자를 먼저 마치세요.':columnLimit;
    if(!dialog.open&&!presets.some(menuControlDemanded)&&!menuControlDemanded(launch))return;
    let why='';try{why=busy()?'열린 작업을 마친 뒤 사용하세요.':columnEditReason(editor.adapter,editor.selection,columnView(editor.adapter,editor.selection.focus.sec));}catch(e){why=String(e);}
    for(const b of presets){b.disabled=!!why;b.setAttribute('aria-disabled',String(!!why));b.title=why;}
    if(!dialog.open)return;const r=reason();ok.disabled=count.disabled=spacing.disabled=!!r;status.textContent=r||'설정 전까지 문서는 바뀌지 않습니다.';ok.title=r;};
  for(const b of presets)b.onclick=()=>{try{if(busy())return;const target=editor.capture(),current=columnView(editor.adapter,target.selection.focus.sec),why=columnEditReason(editor.adapter,target.selection,current);if(why)throw Error(why);
    const count=Number(b.dataset.columnPreset);if(count!==1&&count!==2)throw Error('지원하지 않는 단 수입니다.');
    editor.execute({type:'columns',change:{expected:current,count,spacing:current.spacing}},target);actions.changed();
  }catch(error){actions.error(error);}finally{actions.focus();}};
  launch.onclick=()=>{if(busy()||dialog.open)return;try{
    captured=editor.capture();view=columnView(editor.adapter,captured.selection.focus.sec);
    target.textContent=`적용 범위: 현재 ${view.section+1}구역 전체 · 현재 ${view.columnCount}단 / ${['일반','배분','평행'][view.columnType]} / ${view.sameWidth?'같은 너비':'다른 너비'}`;
    count.value=String(view.columnCount);spacing.value=String(view.spacing/100);
    doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));guard.open();showEditorDialog(dialog);sync();(count.disabled?cancel:count).focus();
  }catch(error){captured=undefined;actions.error(error);}};
  const close=()=>{guard.close();captured=undefined;view=undefined;closeEditorDialog(dialog);};cancel.onclick=close;
  form.onsubmit=e=>{e.preventDefault();if(!guard.ready())return;try{
    const r=reason();if(r||!view)throw Error(r);
    const n=Number(count.value);if(n!==1&&n!==2)throw Error('지원하는 단 수를 선택하세요.');
    editor.execute({type:'columns',change:{expected:view,count:n,spacing:columnSpacingHu(spacing.value)}},captured);
    guard.consume();close();actions.changed();
  }catch(error){status.textContent=String(error).replace(/^Error: /,'');}};
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{if(dialog.open)return;guard.close();captured=undefined;view=undefined;sync();});
  form.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.isComposing&&e.keyCode!==229){const controls=visibleManagerControls(form),at=controls.indexOf(doc.activeElement as HTMLElement);if(controls.length&&(at<0||(e.shiftKey?at===0:at===controls.length-1))){e.preventDefault();controls[e.shiftKey?controls.length-1:0].focus();}}e.stopPropagation();});
  const observer=new MutationObserver(sync);observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open']});sync();return{sync};
}
