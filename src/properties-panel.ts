import {activeWorkset} from './active-workset.js';
import { sidebarActionFor } from "./integration/a-view-menu.js";
import { mountShapePropertiesPanel } from "./shape-properties-panel.js";
import type { mountShapes } from "./shape-ui.js";
import { mountParagraphListPropertiesPanel } from "./paragraph-list-properties-panel.js";
import { mountPicturePropertiesPanel } from "./picture-properties-panel.js";
import { cellDialogFor } from "./cell-dialog-command.js";
import { mountCellPropertiesPanel } from "./cell-properties-panel.js";
import type { Interaction } from "./interaction.js";
import type { Props } from "./model.js";
import { toCoreParagraph, type FormatState } from "./formatting.js";
import { formatMenuState } from "./integration/a-format-menu.js";
import { bindQuickDraft, quickSpacingTypes } from "./quick-format.js";
import { mountContextProperties } from "./context-properties.js";
import type { Command } from "./model.js";
import { mountPropertiesPresentation } from "./properties-presentation.js";
import { formatValueState, formatValueHint, markFormatValue } from "./format-value-state.js";
import {paragraphFieldText} from './paragraph-spacing-display.js';

export const panelParagraphFields = [
  ["marginLeft", "왼쪽 여백"], ["marginRight", "오른쪽 여백"],
  ["indent", "첫 줄 들여쓰기 (+) / 내어쓰기 (−)"],
  ["spacingBefore", "문단 앞 간격"], ["spacingAfter", "문단 뒤 간격"],
] as const;
const panelFormatItems = new Set(["character", "paragraph"]);
const alignments = [["left","왼쪽"],["center","가운데"],["right","오른쪽"],["justify","양쪽"],["distribute","배분"],["split","나눔"]] as const;
export function panelParagraphDelta(initial: Record<string,string>, draft: Record<string,string>): Props {
  const delta: Props = {};
  for (const key of ["alignment", ...panelParagraphFields.map(([name]) => name)]) {
    const value = draft[key]; if (!value || value === initial[key]) continue;
    if (key === "alignment") { if (!alignments.some(([v]) => v === value)) throw Error("지원하는 정렬을 선택하세요."); delta[key] = value; }
    else { const n = Number(value); if (!Number.isFinite(n) || n < (key === "indent" ? -200 : 0) || n > 1000) throw Error("여백·간격 범위를 확인하세요. 단위는 pt입니다."); delta[key] = n; }
  }
  return toCoreParagraph(delta);
}

/** Selection-aware panel. Existing draft admission and Command/History own all edits. */
export function mountPropertiesPanel(doc: Document, editor: Interaction, busy: () => boolean,
  execute: (props: Props, target: ReturnType<Interaction["capture"]>) => void, restoreFocus: () => void, stateReason: () => string = () => "", openLists?: () => void, readShape?: ReturnType<typeof mountShapes>["readSelected"], runCommand?: (command:Command,target:ReturnType<Interaction["capture"]>)=>void) {
  const aside = doc.querySelector<HTMLElement>("aside")!, bar = doc.getElementById("format-bar")!;
  const oldId=aside.getAttribute("id"), oldLabel=aside.getAttribute("aria-label");
  aside.id = "selection-properties"; aside.setAttribute("aria-label", "선택 속성");
  const details = (name: string, id: string) => { const d=doc.createElement("details"), s=doc.createElement("summary");d.id=id;d.open=true;s.textContent=name;d.append(s);return d; };
  const char = details("글자 속성", "properties-character"), paragraph = details("문단 속성", "properties-paragraph");
  const original = doc.getElementById("selection-font")!.closest("section")!; original.before(char);char.append(original);
  const color = doc.createElement("output"); color.id="properties-color";char.append(color);
  const charButtons: {button:HTMLButtonElement;source:HTMLButtonElement;property?:string}[]=[];
  for(const [name,id,property]of [["진하게","bold","bold"],["기울임","italic","italic"],["밑줄","underline","underline"],["글자 모양… · Alt+L","character",undefined]] as const){
    const b=doc.createElement("button");b.type="button";b.textContent=name;b.dataset.propertyProxy=id;const source=doc.getElementById(id) as HTMLButtonElement;
    b.onclick=()=>{sync();if(!b.disabled&&!busy()&&!doc.querySelector("dialog[open]")) {source.click();if(property)restoreFocus();}};char.append(b);charButtons.push({button:b,source,property});
  }
  const form=doc.createElement("form");form.id="properties-paragraph-form";form.noValidate=true;form.setAttribute("aria-label","선택 문단 속성");
  const fields=new Map<string,HTMLInputElement|HTMLSelectElement>();const align=doc.createElement("select");align.name="panelAlignment";align.add(new Option("혼합 / 유지",""));for(const[v,label]of alignments)align.add(new Option(label,v));fields.set("alignment",align);
  const label=(text:string,control:HTMLElement)=>{const l=doc.createElement("label");l.append(text,control);form.append(l);};label("정렬",align);
  for(const[name,text]of panelParagraphFields){const input=doc.createElement("input");input.name="panel"+name[0].toUpperCase()+name.slice(1);input.type="number";input.min=name==="indent"?"-200":"0";input.max="1000";input.step="0.5";input.placeholder="혼합 / 유지";fields.set(name,input);label(text+" (pt)",input);}
  const apply=doc.createElement("button");apply.type="submit";apply.textContent="문단 적용";const cancel=doc.createElement("button");cancel.type="button";cancel.textContent="초안 취소";
  const note=doc.createElement("output");note.id="properties-note";note.setAttribute("aria-live","polite");const spacing=doc.createElement("output");spacing.id="properties-spacing";
  form.append(apply,cancel,note);paragraph.append(form,spacing);char.after(paragraph);
  const more=doc.createElement("button");more.type="button";more.textContent="문단 모양… · Alt+T";more.onclick=()=>{sync();if(!more.disabled)doc.getElementById("paragraph")!.click();};paragraph.append(more);
  let initial: Record<string,string>={};
  const draft=bindQuickDraft(form,editor,busy,"paragraph",[...fields.values(),apply,cancel],state=>{
    initial={};for(const[key,field]of fields){const v=state[key];initial[key]=typeof v==="number"||typeof v==="string"?paragraphFieldText(key,v):"";field.value=initial[key];markFormatValue(field,formatValueState(state,key));}
    const type=quickSpacingTypes.find(([v])=>v===state.lineSpacingType)?.[1];spacing.textContent=type&&state.lineSpacing!==undefined?`줄 간격: ${type} · ${state.lineSpacing}${state.lineSpacingType==="Percent"?"%":"pt (근사 조회)"}`:`줄 간격: ${formatValueHint(["lineSpacing","lineSpacingType"].some(k=>formatValueState(state,k)==="unavailable")?"unavailable":"mixed")}`;note.textContent="빈칸·혼합·미조회는 유지 · 변경한 필드만 적용 · 첫 줄 음수는 내어쓰기";note.title=note.textContent;
  },()=>panelParagraphDelta(initial,Object.fromEntries([...fields].map(([k,e])=>[k,e.value]))),execute,restoreFocus,note);
  // Use the same Escape cancellation path as every other quick draft.
  cancel.onclick=()=>form.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
  form.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.ctrlKey||e.altKey||e.metaKey||e.shiftKey)){e.preventDefault();e.stopPropagation();}});
  const view=()=>sidebarActionFor(doc);
  const toggle=doc.createElement("button");toggle.type="button";toggle.id="properties-toggle";toggle.textContent="속성 패널";toggle.setAttribute("aria-controls",aside.id);bar.append(toggle);
  const close=doc.createElement("button");close.type="button";close.textContent="패널 닫기";aside.prepend(close);
  const modern=doc.body.classList.contains("workspace-modern");
  const narrow=doc.defaultView!.matchMedia("(max-width: 1000px)");if(modern||narrow.matches)aside.hidden=true;
  // UI2 starts closed, then keeps the user's current choice across viewport
  // and document changes. Narrow screens use the same panel as an overlay.
  const changed=()=>{if(!modern&&narrow.matches){const hadFocus=aside.contains(doc.activeElement);aside.hidden=true;if(hadFocus)restoreFocus();}sync();};narrow.addEventListener("change",changed);
  toggle.onclick=()=>{if(busy()||doc.querySelector("dialog[open]"))return;if(!view()?.(Boolean(aside.hidden)))return;sync();if(!aside.hidden)(doc.getElementById("ui2-context-title")??char.querySelector<HTMLElement>("summary")!).focus();else restoreFocus();};
  close.onclick=()=>{if(!busy()&&!doc.querySelector("dialog[open]")&&!aside.hidden){if(!view()?.(false))return;sync();restoreFocus();}};
  let presentation:ReturnType<typeof mountPropertiesPresentation>|undefined;
  function sync(){
    toggle.disabled=busy()||!!doc.querySelector("dialog[open]")||!view();toggle.setAttribute("aria-expanded",String(!aside.hidden));close.disabled=toggle.disabled;
    presentation?.sync();
    // Hidden UI2 controls have no pending owner or visible projection to update.
    // Opening always performs a fresh sync before they can be used.
    if(modern&&aside.hidden)return;
    shape?.sync();picture.sync();cell.sync();lists?.sync();draft.sync();const states=formatMenuState(editor,busy()||!!doc.querySelector("dialog[open]"),undefined,undefined,undefined,panelFormatItems);
    // The shared admission boolean includes saving/modal as well as composition.
    // Keep admission unchanged; show the precise D lifecycle reason in this panel.
    const specificReason=stateReason(),charWhy=specificReason||(states.get("character")?.reason??""),paraWhy=specificReason||(states.get("paragraph")?.reason??"");
    if(specificReason){for(const control of form.querySelectorAll<HTMLElement>("input,select,button"))control.title=specificReason;note.textContent=specificReason;note.title=specificReason;}
    let state:FormatState={};try{state=editor.formatState("char");}catch{/* Show unverified rather than inventing a value. */}
    color.textContent="글자색: "+(typeof state.textColor==="string"?state.textColor:"혼합 / 조회 불가");
    for(const{button,source,property}of charButtons){button.disabled=!!charWhy||source.disabled;button.title=charWhy||source.title||"기존 글자 명령";if(property)button.setAttribute("aria-pressed",state[property]===undefined?"mixed":String(state[property]));}
    more.disabled=!!paraWhy;more.title=paraWhy||"기존 문단 모양 열기";
    context?.sync();
  }
  const cell=mountCellPropertiesPanel(doc,editor,busy,restoreFocus,stateReason);char.before(cell.root);
  const picture=mountPicturePropertiesPanel(doc,editor,busy,stateReason);cell.root.before(picture.root);
  const shape = readShape ? mountShapePropertiesPanel(doc, readShape, busy, stateReason) : undefined;
  if (shape) picture.root.before(shape.root);
  const lists = openLists ? mountParagraphListPropertiesPanel(doc,editor,busy,stateReason,openLists) : undefined;
  if (lists) paragraph.append(lists.root);
  const context=modern&&runCommand?mountContextProperties(doc,editor,{character:char,paragraph,cell:cell.root,picture:picture.root,shape:shape?.root},
    {busy,reason:stateReason,focus:restoreFocus,execute:runCommand,readShape}):undefined;
  presentation=context?mountPropertiesPresentation(doc,editor,aside,toggle,close,{busy,focus:restoreFocus,sync}):undefined;
  const modalObserver=new MutationObserver(()=>sync());
  const attachModal=()=>{modalObserver.disconnect();if(activeWorkset(doc)&&!aside.hidden)
    modalObserver.observe(doc.body,{subtree:true,attributes:true,attributeFilter:["open"]});};
  const observer=new MutationObserver(records=>{
    attachModal();sync();
    if (!aside.hidden && records.some(record => record.target === aside)) cellDialogFor(doc)?.publish(aside);
  });observer.observe(aside,{attributes:true,attributeFilter:["hidden"]});
  if(!activeWorkset(doc))observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:["open"]});
  attachModal();sync();
  return{sync,dispose(){presentation?.dispose();context?.dispose();shape?.dispose();picture.dispose();cell.dispose();lists?.dispose();observer.disconnect();modalObserver.disconnect();narrow.removeEventListener("change",changed);draft.close();toggle.remove();close.remove();char.before(original);char.remove();paragraph.remove();for(const[name,value]of[["id",oldId],["aria-label",oldLabel]]){if(value===null)aside.removeAttribute(name!);else aside.setAttribute(name!,value!);}}};
}
