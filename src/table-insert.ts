import { closeEditorDialog, keepDialogFieldFocus, showDocumentEditingDialog } from "./editor-popup-focus.js";
import {activeWorkset,displayedControl} from './active-workset.js';
import {coreRuntimeSupportsNestedTableCreation} from './core-runtime.js';
import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import { formatInputGuard, sameFormatTarget } from "./integration/a-format-input-guard.js";

// A bounded UI draft, not a new Core limit or a new table/geometry command.
export function tableInsertCommand(rows: string, cols: string, inline: boolean): Extract<Command,{type:"insert-table"}> {
  if(!inline)throw Error("이 창에서는 글자처럼 취급하는 표를 만들 수 있습니다.");
  if (!/^\d+$/.test(rows) || !/^\d+$/.test(cols)) throw Error("줄 수와 칸 수에 양의 정수를 입력하세요.");
  const r=Number(rows),c=Number(cols);
  if (!Number.isSafeInteger(r)||!Number.isSafeInteger(c)||r<1||c<1||r>20||c>20||r*c>100)
    throw Error("현재 표 만들기 화면은 줄·칸 각각 1~20, 합계 100셀까지 지원합니다.");
  return {type:"insert-table",rows:r,cols:c,...(inline?{inline:true}:{})};
}

export function assertTableInsertTarget(editor: Interaction, target: ReturnType<Interaction["capture"]>, busy=false) {
  if(busy)throw Error("입력·저장·다른 대화상자를 마친 후 사용하세요.");
  if(!sameFormatTarget(target,editor.capture()))throw Error("문서·리비전·선택이 변경되었습니다. 취소 후 다시 여세요.");
  const s=target.selection;
  if(!["body","cell"].includes(s.focus.kind)||!["caret","text"].includes(s.kind))throw Error("본문이나 셀 안의 글자 위치에 커서를 두세요.");
  if(s.focus.kind==='cell'&&!coreRuntimeSupportsNestedTableCreation(editor.adapter.doc))throw Error("이 위치에는 표를 넣을 수 없습니다.");
  editor.adapter.validate(s.focus);for(const t of editor.targets(s))editor.adapter.assertEditable(t.p);editor.adapter.assertEditable(s.focus);
  return target;
}

export function mountTableInsert(doc: Document, editor: Interaction, actions: {
  busy:()=>boolean;
  execute:(command:Extract<Command,{type:"insert-table"}>,target:ReturnType<Interaction["capture"]>)=>void;
  changed:()=>void;
}) {
  const dialog=doc.createElement("dialog"),form=doc.createElement("form");
  dialog.id="table-insert-dialog";dialog.setAttribute("aria-label","표 만들기");form.id="table-insert-form";form.noValidate=true;
  form.innerHTML='<h2>표 만들기</h2><fieldset><legend>표 크기</legend><label>줄 수 <input name="rows" type="number" min="1" max="20" step="1" value="2"></label><label>칸 수 <input name="cols" type="number" min="1" max="20" step="1" value="2"></label></fieldset><p data-table-location></p><output aria-live="polite"></output><div class="table-insert-footer"><button type="submit">만들기</button><button type="button" data-cancel>취소</button></div>';
  dialog.append(form);doc.body.append(dialog);
  const rows=form.querySelector<HTMLInputElement>('[name="rows"]')!,cols=form.querySelector<HTMLInputElement>('[name="cols"]')!,location=form.querySelector<HTMLElement>("[data-table-location]")!,note=form.querySelector("output")!,ok=form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const guard=formatInputGuard(form);let captured:ReturnType<Interaction["capture"]>|undefined;
  const reason=()=>{
    try{assertTableInsertTarget(editor,editor.capture(),actions.busy());return "";}catch(e){return e instanceof Error?e.message:"이 위치에는 표를 넣을 수 없습니다.";}
  };
  const entries:HTMLButtonElement[]=[];
  const sync=()=>{if(activeWorkset(doc)&&!dialog.open&&!entries.some(displayedControl))return;const why=reason();for(const b of entries){b.disabled=!!why||dialog.open;b.title=why||"줄·칸 수를 지정해 표 만들기";}if(dialog.open){const stale=!captured||!sameFormatTarget(captured,editor.capture());ok.disabled=!!why||stale;if(stale){guard.consume();note.textContent="문서·리비전·선택이 변경되었습니다. 취소 후 다시 여세요.";}else if(why)note.textContent=why;}};
  const close=()=>{guard.close();captured=undefined;closeEditorDialog(dialog);sync();};
  const show=()=>{if(dialog.open)return;const why=reason();if(why){note.textContent=why;sync();return;}captured=editor.capture();for(const menu of doc.querySelectorAll<HTMLDetailsElement>("#main-menu > details[open]"))menu.open=false;rows.value=cols.value="2";location.textContent=captured.selection.focus.kind==="cell"?"삽입 위치: 현재 셀 안 · 셀 너비에 맞춤":"삽입 위치: 본문 커서 · 글자처럼 취급";note.textContent="";guard.open();showDocumentEditingDialog(dialog);sync();rows.focus();rows.select();};
  doc.addEventListener('rhwp:table-insert',show);
  const enter=(parent:Element|undefined|null,where:"prepend"|"append")=>{if(!parent)return;const b=doc.createElement("button");b.type="button";b.textContent="표 만들기…";const key=doc.createElement("kbd");key.textContent="Alt+N,T";key.title="Alt+N을 뗀 뒤 T. Ctrl+N,T는 브라우저 예약키이므로 표 만들기 실행 키로 제공하지 않습니다.";b.append(key);b.dataset.tableInsertEntry="true";b.onclick=show;parent[where](b);entries.push(b);};
  enter(doc.querySelector('#table-menu > [data-table-panel]'),"prepend");
  enter(doc.querySelector('#insert-menu > div'),"prepend");enter(doc.querySelector('.tool-group[aria-label="표·그림 입력"]'),"prepend");
  // Preserve the existing immediate 2x2 controls and handlers, but name their scope.
  for(const [selector,text]of [["#table","빠른 표 (2×2)"],["#inline-table","빠른 글자처럼 표 (2×2)"],["[data-command-proxy=\"#table\"]","빠른 표 (2×2)"],["[data-command-proxy=\"#inline-table\"]","빠른 글자처럼 표 (2×2)"]])for(const e of doc.querySelectorAll(selector))e.textContent=text;
  form.addEventListener("submit",e=>{e.preventDefault();if(!guard.ready())return;try{if(!captured)throw Error("대상 문서를 다시 선택하세요.");const target=assertTableInsertTarget(editor,captured,actions.busy()),command=tableInsertCommand(rows.value,cols.value,true);guard.consume();actions.execute(command,target);close();actions.changed();}catch(error){note.textContent=error instanceof Error?error.message:"표를 만들지 못했습니다.";guard.open();sync();}});
  const cancel=form.querySelector<HTMLButtonElement>("[data-cancel]")!;
  cancel.onclick=close;
  const mouseFocus = [ok, cancel].map(button => keepDialogFieldFocus(dialog, button, () => !actions.busy()));
  dialog.addEventListener("cancel",e=>{if(e.defaultPrevented)return;e.preventDefault();close();});
  dialog.addEventListener("close",()=>{if(dialog.open)return;guard.close();captured=undefined;sync();});
  form.addEventListener("keydown",e=>{if(e.key==="Tab"){const active=[...form.querySelectorAll<HTMLElement>("input:enabled,button:enabled")],at=active.indexOf(doc.activeElement as HTMLElement);if(active.length&&(at<0||(e.shiftKey?at===0:at===active.length-1))){e.preventDefault();active[e.shiftKey?active.length-1:0].focus();}}e.stopPropagation();});
  const observer=new MutationObserver(sync);
  if(!activeWorkset(doc))observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:["open"]});
  else observer.observe(dialog,{attributes:true,attributeFilter:["open"]});
  const demand=(event:Event)=>{const root=event.target instanceof Element?event.target.closest<HTMLDetailsElement>('details'):null;
    if(root&&['table-menu','insert-menu'].includes(root.id)){
      const old=root.dataset.activeWorksetDemand;root.dataset.activeWorksetDemand='true';
      try{sync();}finally{if(old===undefined)delete root.dataset.activeWorksetDemand;else root.dataset.activeWorksetDemand=old;}
    }};
  if(activeWorkset(doc)){doc.addEventListener('rhwp:menu-opening',demand,true);
    for(const root of doc.querySelectorAll('#table-menu > summary,#insert-menu > summary'))root.addEventListener('click',demand,true);}
  sync();
  return {sync,show,get open(){return dialog.open;},dispose(){doc.removeEventListener('rhwp:menu-opening',demand,true);for(const root of doc.querySelectorAll('#table-menu > summary,#insert-menu > summary'))root.removeEventListener('click',demand,true);doc.removeEventListener('rhwp:table-insert',show);guard.close();mouseFocus.forEach(dispose=>dispose());observer.disconnect();dialog.remove();for(const b of entries)b.remove();}};
}
