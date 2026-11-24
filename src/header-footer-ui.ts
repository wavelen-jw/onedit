import { setViewAttribute } from "./view-menu-presentation.js";
import { hasOpenDialog } from "./dialog-support.js";
import { editorFeedbackText } from "./editor-feedback-text.js";
import { bindModalNavigation, closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import type { Interaction } from './interaction.js';
import { formatInputGuard, sameFormatTarget } from './integration/a-format-input-guard.js';
import { headerFooterCatalog, headerFooterView, headerFooterEditReason, headerFooterCreationHold, headerFooterPages, type HeaderFooterView } from './header-footer.js';

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
  const label=(name:string,field:HTMLElement)=>{const l=doc.createElement('label');l.append(doc.createTextNode(name),field);fields.append(l);return l;};
  label('기존 머리말·꼬리말',list);label('구역',section);label('종류',kind);label('적용 쪽',applyTo);
  label('현재 내용',content);
  const appendLabel=label('추가할 텍스트',text);
  const status=doc.createElement('p');status.className='manager-status';status.setAttribute('role','status');
  const note=doc.createElement('p');note.className='manager-note';note.textContent='대상을 바꾸면 입력 중인 내용이 지워집니다.';
  const footer=doc.createElement('div');footer.className='manager-footer';
  const ok=doc.createElement('button');ok.type='submit';ok.id='header-footer-apply';ok.textContent='추가';
  const cancel=doc.createElement('button');cancel.type='button';cancel.id='header-footer-cancel';cancel.textContent='취소';footer.append(ok,cancel);
  form.append(title,fields,status,note,footer);dialog.append(form);doc.body.append(dialog);const guard=formatInputGuard(form);
  let captured:ReturnType<Interaction['capture']>|undefined,view:HeaderFooterView|undefined,rows:HeaderFooterView[]=[];
  const target=()=>{if(!/^(0|[1-9]\d*)$/.test(section.value)||!['header','footer'].includes(kind.value)||!['0','1','2'].includes(applyTo.value))throw Error('구역, 종류, 적용할 쪽을 다시 선택하세요.');return{section:Number(section.value),isHeader:kind.value==='header',applyTo:Number(applyTo.value)};};
  const blocked=()=>actions.busy()||hasOpenDialog(doc, "header-footer-dialog");
  const stale=()=>!captured||!sameFormatTarget(captured,editor.capture());
  const sync=()=>{
    const disabled = blocked();
    launch.toggleAttribute('disabled', disabled);
    setViewAttribute(launch, 'title', disabled ? '입력·저장·열린 대화상자를 먼저 마치세요.' : '기존 머리말·꼬리말을 보고 내용을 추가합니다.');
    if(!dialog.open)return;
    const detail=stale()?'문서나 선택이 바뀌었습니다. 닫고 다시 여세요.':blocked()?'현재 작업을 먼저 마치세요.':view?headerFooterEditReason(editor.adapter,editor.selection,view):'정의를 다시 선택하세요.';
    const reason=detail===headerFooterCreationHold?'기존 머리말·꼬리말에만 내용을 추가할 수 있습니다.':detail;
    ok.disabled=!!reason;ok.title=reason;for(const f of [section,kind,applyTo,list])f.disabled=stale()||blocked();text.disabled=!!reason;
    const canAppend=!!view?.exists;
    appendLabel.hidden=ok.hidden=!canAppend;
    note.hidden=!canAppend;
    status.textContent=reason||(canAppend?'기존 내용 끝에 추가합니다.':'');
  };
  const read=()=>{if(stale()||blocked()){sync();return;}try{view=headerFooterView(editor.adapter,target());content.value=view.paragraphs.map(p=>p.text).join('\n');text.value='';list.value=String(rows.findIndex(v=>JSON.stringify(v.target)===JSON.stringify(view!.target)));sync();}catch(error){view=undefined;ok.disabled=true;status.textContent=editorFeedbackText(error);}};
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
  }catch(error){status.textContent=editorFeedbackText(error);}};
  guard.bindCancel(cancel, close);
  dialog.addEventListener('close',()=>{if(dialog.open)return;guard.close();captured=undefined;view=undefined;sync();});
  bindModalNavigation(form, dialog);
  const observer=new MutationObserver(sync);observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open']});sync();return{sync,open};
}
