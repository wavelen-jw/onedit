import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import { bindPanelDraft } from "./panel-draft.js";

export function mountPanelObjectSize(root:HTMLElement, editor:Interaction, kind:"picture"|"shape", options:{
  read:()=>{width:number;height:number;command:(width:number,height:number)=>Command};
  reason:()=>string; execute:(command:Command,target:ReturnType<Interaction["capture"]>)=>void; focus:()=>void;
}) {
  const doc=root.ownerDocument,form=doc.createElement("form");form.id=`ui2-${kind}-size`;form.className="ui2-panel-form";
  const width=doc.createElement("input"),height=doc.createElement("input"),ratio=doc.createElement("input");
  for(const [input,name,label]of [[width,"Width","너비 (pt)"],[height,"Height","높이 (pt)"]] as const){input.name=kind+name;input.type="number";input.min=kind==="shape"?"2":"1";input.max="720";input.step="0.01";const l=doc.createElement("label");l.append(label,input);form.append(l);}
  ratio.type="checkbox";ratio.checked=kind==="picture";const l=doc.createElement("label");l.className="ui2-check";l.append(ratio,"비율 유지");form.append(l);
  const apply=doc.createElement("button"),cancel=doc.createElement("button"),note=doc.createElement("output");apply.type="submit";apply.textContent="크기 설정";cancel.type="button";cancel.textContent="취소";note.setAttribute("aria-live","polite");form.append(apply,cancel,note);root.append(form);
  let initialWidth="",initialHeight="",factor=1;
  const draft=bindPanelDraft(form,editor,{...options,note,cancel,
    reset:s=>{initialWidth=String(s.width/100);initialHeight=String(s.height/100);width.value=initialWidth;height.value=initialHeight;factor=s.width/s.height;},
    command:s=>{
      const w=width.value&&width.value!==initialWidth?Math.round(Number(width.value)*100):s.width;
      const h=height.value&&height.value!==initialHeight?Math.round(Number(height.value)*100):s.height;
      if(w===s.width&&h===s.height)return;
      if(![w,h].every(n=>Number.isFinite(n)&&n>=(kind==="shape"?200:100)&&n<=72000))throw Error(`크기는 ${kind==="shape"?2:1}~720pt 범위로 입력하세요. 기존 값은 변경 전 유지됩니다.`);
      return s.command(w,h);
    }});
  width.addEventListener("input",()=>{if(ratio.checked&&width.value&&Number(width.value)>0)height.value=String(Math.round(Number(width.value)*100/factor)/100);});
  height.addEventListener("input",()=>{if(ratio.checked&&height.value&&Number(height.value)>0)width.value=String(Math.round(Number(height.value)*100*factor)/100);});
  return {sync(){if(!root.hidden)draft.sync();},dispose(){draft.dispose();form.remove();}};
}
