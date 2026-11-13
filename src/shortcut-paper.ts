import { bindEditorDialogFormSubmit, closeEditorDialog, keepDialogFieldFocus, showEditorDialog } from "./editor-popup-focus.js";
import type {Interaction} from './interaction.js';
import {sameFormatTarget,formatInputGuard} from './integration/a-format-input-guard.js';
import type {PaperChange} from './shortcut-supported2.js';
import {paperNewSectionReason} from './shortcut-supported2.js';
export const paperPresets=[['A4',59528,84188],['A3',84188,119055],['B4',72850,103040],['B5',51502,72850],['Letter',62208,80496],['Legal',62208,102816]] as const;
const mm=(hu:number)=>(hu*25.4/7200).toFixed(1),hu=(mm:number)=>Math.round(mm*7200/25.4);
export function mountPaper(doc:Document,editor:Interaction,actions:{blocked:()=>boolean;inFlight:()=>boolean;changed:()=>void;focus:()=>void;error:(e:unknown)=>void}){
  const dialog=doc.createElement('dialog');dialog.id='paper-dialog';dialog.className='manager-dialog ui2-common-dialog web-paper-dialog';dialog.setAttribute('aria-label','편집 용지');
  const form=doc.createElement('form');form.dataset.ui2Draft='';form.innerHTML='<h2>편집 용지</h2><div class="paper-content"></div><output role="status"></output><footer class="dialog-actions"><button type="button" data-paper-cancel>취소</button><button type="submit" class="primary" data-paper-apply>확인</button></footer>';
  const content=form.querySelector<HTMLElement>('.paper-content')!,status=form.querySelector('output')!,fields=new Map<string,HTMLInputElement>();
  const group=(name:string)=>{const f=doc.createElement('fieldset'),l=doc.createElement('legend');l.textContent=name;f.append(l);content.append(f);return f;};
  const label=(name:string,control:HTMLElement,unit='')=>{const l=doc.createElement('label'),span=doc.createElement('span');span.textContent=name;l.append(span,control);if(unit){const u=doc.createElement('span');u.textContent=unit;u.className='paper-unit';l.append(u);}return l;};
  const paper=group('용지 종류'),preset=doc.createElement('select');preset.name='paperPreset';preset.setAttribute('aria-label','용지 종류');for(const[n]of paperPresets)preset.add(new Option(n,n));preset.add(new Option('사용자 정의','custom'));paper.append(label('종류',preset));
  const add=(parent:HTMLElement,key:string,title:string)=>{const input=doc.createElement('input');input.name=key;input.type='number';input.min=['width','height'].includes(key)?'10':'0';input.max='2000';input.step='any';input.setAttribute('aria-label',title+' (mm)');fields.set(key,input);parent.append(label(title,input,'mm'));return input;};
  add(paper,'width','폭');add(paper,'height','길이');
  const orient=group('용지 방향'),bindingGroup=group('제본');
  function radios(parent:HTMLElement,name:string,options:readonly(readonly[string,string])[]){const controls:HTMLInputElement[]=[];for(const[value,text]of options){const l=doc.createElement('label'),i=doc.createElement('input');i.type='radio';i.name=name;i.value=value;l.className='paper-choice';if(name==='landscape')l.dataset.direction=value==='true'?'landscape':'portrait';l.append(i,doc.createTextNode(text));parent.append(l);controls.push(i);}return controls;}
  const direction=radios(orient,'landscape',[['false','세로'],['true','가로']]),bindings=radios(bindingGroup,'binding',[['0','한쪽'],['1','맞쪽'],['2','위로']]);
  const margins=group('용지 여백');margins.className='paper-margins';for(const[key,text]of Object.entries({marginTop:'위쪽',marginBottom:'아래쪽',marginLeft:'왼쪽',marginRight:'오른쪽',marginHeader:'머리말',marginFooter:'꼬리말',marginGutter:'제본'}))add(margins,key,text);
  const scope=doc.createElement('select');scope.name='paperScope';scope.setAttribute('aria-label','적용 범위');scope.add(new Option('현재 구역','current'));scope.add(new Option('문서 전체','all'));const future=new Option('새 구역부터','new-section');scope.add(future);content.append(label('적용 범위',scope));
  const note=doc.createElement('p');note.className='paper-note';content.append(note);
  const x=doc.createElement('button');x.type='button';x.className='paper-close';x.textContent='×';x.setAttribute('aria-label','편집 용지 닫기');x.onclick=()=>closeEditorDialog(dialog);form.append(x);
  dialog.append(form);doc.body.append(dialog);const guard=formatInputGuard(form);let target:ReturnType<Interaction['capture']>|undefined,original:Record<string,any>={},landscape=false;
  bindEditorDialogFormSubmit(form);
  const setDimensions=(w:number,h:number)=>{fields.get('width')!.value=mm(landscape?h:w);fields.get('height')!.value=mm(landscape?w:h);};
  preset.onchange=()=>{const chosen=paperPresets.find(([n])=>n===preset.value);if(chosen)setDimensions(chosen[1],chosen[2]);};
  for(const i of direction)i.onchange=()=>{if(!i.checked||landscape===(i.value==='true'))return;landscape=i.value==='true';const width=fields.get('width')!,height=fields.get('height')!;[width.value,height.value]=[height.value,width.value];};
  const normalizeNumber=(input:HTMLInputElement)=>{
    if(input.value.trim()&&input.checkValidity())input.value=Number(input.value).toFixed(1);
  };
  for(const[key,input]of fields){input.addEventListener('input',()=>{if(['width','height'].includes(key))preset.value='custom';});input.addEventListener('blur',()=>normalizeNumber(input));}
  // In Chromium a mouse press can leave the native editing selection on the
  // dialog button after close restores #input. Prevent only the mouse focus
  // default, leaving normal click/submit, keyboard, touch and IME alone.
  const url=new URL(doc.URL);
  const focusRepair=doc.defaultView?.parent===doc.defaultView&&url.protocol==="http:"&&url.hostname==="127.0.0.1"&&
    url.searchParams.getAll("oneditQaPaperKeyFocus").length===1&&url.searchParams.get("oneditQaPaperKeyFocus")==="1";
  if(focusRepair)form.addEventListener("mousedown",e=>{
    if(!e.isTrusted||e.button!==0||!e.cancelable||!(e.target instanceof Element)||
        (e as MouseEvent & {sourceCapabilities?:{firesTouchEvents?:boolean}}).sourceCapabilities?.firesTouchEvents)return;
    const button=e.target.closest<HTMLButtonElement>("[data-paper-cancel],[data-paper-apply]");
    if(button?.form===form&&!button.disabled)e.preventDefault();
  });
  // Preserve the editing target for a trusted mouse submit; the active
  // number field is normalized at the trusted click before native submission.
  const apply=form.querySelector<HTMLButtonElement>('[data-paper-apply]')!;
  const disposePaperApplyFocus=focusRepair ? undefined : keepDialogFieldFocus(dialog, apply, () => {
    const focused=doc.activeElement;
    return (focused===preset||focused===scope||[...fields.values()].some(input=>input===focused))&&guard.ready()&&!actions.inFlight();
  });
  const cancel=form.querySelector<HTMLButtonElement>('[data-paper-cancel]')!;
  // Keep the dialog's field as the native editing target until Cancel closes.
  // A queued blur/focus after close can run only after the next key is lost.
  const disposePaperCancelFocus=focusRepair ? undefined : keepDialogFieldFocus(dialog, cancel, () =>
    form.contains(doc.activeElement)&&guard.ready()&&!actions.inFlight());
  apply.addEventListener('click',e=>{
    if(!e.isTrusted||e.button!==0||e.detail===0||(e as PointerEvent).pointerType!=='mouse')return;
    const input=[...fields.values()].find(input=>doc.activeElement===input);
    if(input)normalizeNumber(input);
  });
  const close=()=>closeEditorDialog(dialog);
  cancel.onclick=close;
  form.onsubmit=e=>{e.preventDefault();try{if(!guard.ready())return;if(actions.inFlight()||!target||!sameFormatTarget(target,editor.capture()))throw Error('문서·선택이 변경되었습니다. 다시 여세요.');
    const change:PaperChange={scope:scope.value as PaperChange['scope']};
    // Compare displayed dimensions to the original physical orientation. Merely
    // rounding for display never rewrites the original HU precision.
    const displayOriginal:Record<string,number>={...original,width:landscape?original.height:original.width,height:landscape?original.width:original.height};
    for(const[key,input]of fields){if(!input.value.trim()||!input.checkValidity())throw Error('유효한 용지·여백 값을 입력하세요.');const initial=mm(displayOriginal[key]);if(Number(input.value)===Number(initial))continue;
      const storedKey=landscape&&['width','height'].includes(key)?key==='width'?'height':'width':key;const chosen=paperPresets.find(([n])=>n===preset.value);(change as any)[storedKey]=chosen&&['width','height'].includes(storedKey)?chosen[storedKey==='width'?1:2]:hu(Number(input.value));}
    if(landscape!==original.landscape)change.landscape=landscape;const binding=Number(bindings.find(i=>i.checked)!.value) as 0|1|2;if(binding!==original.binding)change.binding=binding;
    const a=editor.adapter,revision=a.revision;
    editor.execute({type:'paper',change},target);guard.consume();
    // Publish an actual paper edit while the dialog still owns keyboard input.
    // Then the common close path hands off once, even for a no-op Apply.
    try { if(a.revision!==revision)actions.changed(); }
    finally { close(); }
  }catch(error){status.textContent=String(error);}};
  form.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();close();}});
  dialog.addEventListener('close',()=>{
    if (dialog.open) return; // An old queued close does not own the reopened draft.
    guard.close();target=undefined;
  });
  return{show(){if(actions.blocked()||dialog.open)return;target=editor.capture();original=editor.adapter.call('getPageDef',target.selection.focus.sec);for(const key of fields.keys())if(!Number.isSafeInteger(original[key]))throw Error('용지 원값 미조회');landscape=original.landscape;setDimensions(original.width,original.height);for(const[key,input]of fields){if(!['width','height'].includes(key))input.value=mm(original[key]);input.title=`원값 ${original[key]}HU · 미변경 시 정확히 보존`;}
    const reason=paperNewSectionReason(editor.adapter,target.selection);future.disabled=!!reason;note.textContent=reason||'새 구역부터: 커서 위치에서 나누고 다음 기존 구역 전까지 바꾼 항목만 적용합니다.';
    preset.value=paperPresets.find(([,w,h])=>Math.abs(w-original.width)<=3&&Math.abs(h-original.height)<=3)?.[0]??'custom';direction.forEach(i=>i.checked=(i.value==='true')===landscape);bindings.forEach(i=>i.checked=Number(i.value)===original.binding);scope.value='current';status.textContent='바꾼 항목만 한 번 적용합니다.';doc.querySelectorAll('#main-menu details[open]').forEach(e=>e.removeAttribute('open'));guard.open();showEditorDialog(dialog);preset.focus();},dispose(){disposePaperApplyFocus?.();disposePaperCancelFocus?.();guard.close();dialog.remove();}};
}
