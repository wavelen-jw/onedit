import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import type { Interaction } from './interaction.js';
import { formatInputGuard, sameFormatTarget } from './integration/a-format-input-guard.js';
import { visibleManagerControls } from './manager-layout.js';
import { headerFooterCatalog, headerFooterView, headerFooterEditReason, headerFooterPages, headerFooterLimit, type HeaderFooterView } from './header-footer.js';

export function mountHeaderFooter(doc:Document,editor:Interaction,actions:{busy:()=>boolean;page:()=>number;changed:()=>void;focus:()=>void;error:(e:unknown)=>void}){
  const launch=doc.getElementById('header-footer-open') as HTMLButtonElement;
  const dialog=doc.createElement('dialog');dialog.id='header-footer-dialog';dialog.className='manager-dialog';dialog.setAttribute('aria-label','머리말·꼬리말');
  const form=doc.createElement('form');form.id='header-footer-form';const title=doc.createElement('h2');title.textContent='머리말·꼬리말';
  const fields=doc.createElement('section');fields.className='header-footer-fields';
  const section=doc.createElement('select'),kind=doc.createElement('select'),applyTo=doc.createElement('select'),list=doc.createElement('select');
  section.name='hfSection';kind.name='hfKind';applyTo.name='hfApplyTo';list.name='hfDefinition';
  for(const[value,label]of [['header','머리말'],['footer','꼬리말']]){const o=doc.createElement('option');o.value=value;o.textContent=label;kind.append(o);}
  for(const[value,label]of headerFooterPages){const o=doc.createElement('option');o.value=String(value);o.textContent=label;applyTo.append(o);}
  const content=doc.createElement('textarea');content.name='hfExisting';content.readOnly=true;content.rows=4;
  const text=doc.createElement('input');text.name='hfText';text.maxLength=2000;
  const label=(name:string,field:HTMLElement)=>{const l=doc.createElement('label');l.append(doc.createTextNode(name),field);fields.append(l);};
  label('기존 정의 선택',list);label('소유 구역',section);label('종류',kind);label('적용 쪽',applyTo);label('저장된 내용 (조회)',content);label('마지막 문단에 덧붙일 평문',text);
  const status=doc.createElement('p');status.className='manager-status';status.setAttribute('role','status');
  const note=doc.createElement('p');note.className='manager-note';note.textContent=headerFooterLimit+' 대상을 바꾸면 입력 초안을 초기화합니다. 기존 본문 선택은 유지하며 닫으면 본문으로 복귀합니다.';
  const footer=doc.createElement('div');footer.className='manager-footer';
  const ok=doc.createElement('button');ok.type='submit';ok.id='header-footer-apply';
  const cancel=doc.createElement('button');cancel.type='button';cancel.id='header-footer-cancel';cancel.textContent='본문으로 / 취소';footer.append(ok,cancel);
  form.append(title,fields,status,note,footer);dialog.append(form);doc.body.append(dialog);const guard=formatInputGuard(form);
  let captured:ReturnType<Interaction['capture']>|undefined,view:HeaderFooterView|undefined,rows:HeaderFooterView[]=[];
  const target=()=>{if(!/^(0|[1-9]\d*)$/.test(section.value)||!['header','footer'].includes(kind.value)||!['0','1','2'].includes(applyTo.value))throw Error('소유 구역·종류·적용 쪽을 다시 선택하세요.');return{section:Number(section.value),isHeader:kind.value==='header',applyTo:Number(applyTo.value)};};
  const blocked=()=>actions.busy()||!!doc.querySelector('dialog[open]:not(#header-footer-dialog)');
  const stale=()=>!captured||!sameFormatTarget(captured,editor.capture());
  const sync=()=>{
    launch.disabled=blocked();launch.title=launch.disabled?'입력·저장·열린 대화상자를 먼저 마치세요.':headerFooterLimit;
    if(!dialog.open)return;
    const reason=stale()?'문서·리비전·선택이 변경되었습니다. 취소 후 다시 여세요.':blocked()?'현재 작업을 먼저 마치세요.':view?headerFooterEditReason(editor.adapter,editor.selection,view):'정의를 다시 선택하세요.';
    ok.disabled=!!reason;ok.title=reason;for(const f of [section,kind,applyTo,list])f.disabled=stale()||blocked();text.disabled=!!reason;
    status.textContent=reason||(view?.exists?`기존 ${view.paragraphs.length}문단 · 마지막 문단 끝에만 추가합니다.`:'해당 정의가 없습니다.');
  };
  const read=()=>{if(stale()||blocked()){sync();return;}try{view=headerFooterView(editor.adapter,target());content.value=view.paragraphs.map(p=>p.text).join('\n');text.value='';ok.textContent=view.exists?'평문 덧붙이기':'정의 만들기 (보류)';list.value=String(rows.findIndex(v=>JSON.stringify(v.target)===JSON.stringify(view!.target)));sync();}catch(error){view=undefined;ok.disabled=true;status.textContent=String(error);}};
  for(const field of [section,kind,applyTo])field.onchange=read;
  list.onchange=()=>{const v=rows[Number(list.value)];if(!v||stale()||blocked())return;section.value=String(v.target.section);kind.value=v.target.isHeader?'header':'footer';applyTo.value=String(v.target.applyTo);read();};
  const open=()=>{if(dialog.open||blocked())return;try{
    captured=editor.capture();const a=editor.adapter;rows=headerFooterCatalog(a);
    section.replaceChildren();for(let n=0;n<a.doc.getSectionCount();n++){const o=doc.createElement('option');o.value=String(n);o.textContent=`${n+1}구역`;section.append(o);}
    list.replaceChildren();const blank=doc.createElement('option');blank.value='-1';blank.textContent='구역·종류·적용 쪽으로 선택';list.append(blank);
    rows.forEach((v,n)=>{const o=doc.createElement('option');o.value=String(n);o.textContent=`${v.target.section+1}구역 · ${v.target.isHeader?'머리말':'꼬리말'} · ${headerFooterPages.find(([code])=>code===v.target.applyTo)![1]}`;list.append(o);});
    const page=actions.page();if(!Number.isSafeInteger(page)||page<0||page>=a.pageCount)throw Error('현재 쪽을 확인할 수 없습니다.');
    const current=a.call('getHeaderFooterEditTarget',page,true);headerFooterView(a,{section:current.sectionIndex,isHeader:true,applyTo:current.applyTo});section.value=String(current.sectionIndex);kind.value='header';applyTo.value=String(current.applyTo);
    doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));guard.open();read();showEditorDialog(dialog);sync();list.focus();
  }catch(error){captured=undefined;actions.error(error);}};
  launch.onclick=open;
  const close=()=>{guard.close();captured=undefined;view=undefined;closeEditorDialog(dialog);};
  form.onsubmit=e=>{e.preventDefault();if(!guard.ready())return;try{
    if(blocked()||stale()||!view)throw Error('문서·선택 또는 처리 상태가 변경되었습니다. 다시 여세요.');
    editor.execute({type:'header-footer',change:{action:view.exists?'append':'create',target:view.target,expected:view,text:text.value}},captured);
    guard.consume();close();actions.changed();
  }catch(error){status.textContent=String(error).replace(/^Error: /,'');}};
  cancel.onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{if(dialog.open)return;guard.close();captured=undefined;view=undefined;sync();});
  form.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.isComposing&&e.keyCode!==229){const all=visibleManagerControls(form),at=all.indexOf(doc.activeElement as HTMLElement);if(all.length&&(at<0||(e.shiftKey?at===0:at===all.length-1))){e.preventDefault();all[e.shiftKey?all.length-1:0].focus();}}e.stopPropagation();});
  const observer=new MutationObserver(sync);observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open']});sync();return{sync,open};
}
