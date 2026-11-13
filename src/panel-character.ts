import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import type { FormatState } from "./formatting.js";
import { languages } from "./formatting.js";
import { bindQuickDraft, quickFormatDelta } from "./quick-format.js";
import { fontActionFailure, ensureFont } from "./font-provider.js";
import { formatValueState, formatValueHint, markFormatValue } from "./format-value-state.js";

export function mountPanelCharacter(root:HTMLElement,editor:Interaction, busy:()=>boolean,
  execute:(command:Command,target:ReturnType<Interaction["capture"]>)=>void,focus:()=>void,reason:()=>string) {
  const doc=root.ownerDocument,form=doc.createElement("form");form.id="ui2-character-form";form.dataset.ui2Draft="";form.className="ui2-panel-form";form.noValidate=true;
  const scope=doc.createElement("select"),font=doc.createElement("input"),size=doc.createElement("input"),color=doc.createElement("input");
  scope.name="panelLanguage";scope.add(new Option("모든 언어","all"));languages.forEach((name,n)=>scope.add(new Option(name,String(n))));
  font.name="panelFont";font.setAttribute("list","quick-fonts");font.autocomplete="off";
  size.name="panelSize";size.type="number";size.step="0.5";size.min="1";size.max="200";
  color.name="panelColor";color.setAttribute("list","quick-colors");
  for(const[text,input]of [["언어",scope],["원본 지정 글꼴",font],["크기 (pt)",size],["글자색 (#RRGGBB)",color]] as const){const l=doc.createElement("label");l.append(text,input);form.append(l);}
  const apply=doc.createElement("button"),cancel=doc.createElement("button"),note=doc.createElement("output");apply.type="submit";apply.textContent="글자 설정";cancel.type="button";cancel.textContent="취소";note.setAttribute("aria-live","polite");form.append(apply,cancel,note);root.append(form);
  let state:FormatState={},initial={font:"",size:"",color:""};
  const resetFont=()=>{const key=scope.value==="all"?"fontFamily":`fontLanguage${scope.value}`,v=state[key];initial.font=typeof v==="string"?v:"";font.value=initial.font;markFormatValue(font,formatValueState(state,key));note.textContent=initial.font?fontActionFailure(initial.font):'';};
  const draft=bindQuickDraft(form,editor,busy,"char",[scope,font,size,color,apply,cancel],s=>{
    state=s;initial={font:"",size:typeof s.fontSize==="number"?String(s.fontSize):"",color:typeof s.textColor==="string"?s.textColor:""};
    size.value=initial.size;color.value=initial.color;resetFont();
    markFormatValue(size,formatValueState(s,"fontSize"));markFormatValue(color,formatValueState(s,"textColor"));
  },()=>quickFormatDelta(scope.value,initial,{font:font.value,size:size.value,color:color.value}),
  (props,target)=>execute({type:"char",props},target),focus,note,reason);
  scope.onchange=resetFont;font.oninput=()=>{if(font.value)void ensureFont(font.value);};
  cancel.onclick=()=>form.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
  return{sync:draft.sync,dispose(){draft.close();form.remove();}};
}
