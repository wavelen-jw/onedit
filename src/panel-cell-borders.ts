import type { Interaction } from "./interaction.js";
import { nested, type Command, type Props } from "./model.js";
import { cellBorderPlan, type CellBorderDraft } from "./cell-border-plan.js";
import { bindPanelDraft } from "./panel-draft.js";
import { objectLinePalette } from "./object-line-palette.js";
import { fields } from "./integration/a-format-dialog.js";
import { formatValueState, formatValueGroup, markFormatValue } from "./format-value-state.js";

const edgeNames = [["top","위"],["left","왼쪽"],["insideH","안쪽 가로"],["insideV","안쪽 세로"],["right","오른쪽"],["bottom","아래"]] as const;
const presets = [["outer","바깥 테두리"],["inner","안쪽 선"],["all","모든 선"],["none","테두리 없음"],["weighted","바깥 굵게 · 안쪽 얇게"]] as const;
const widths=[.1,.12,.15,.2,.25,.3,.4,.5,.6,.7,1,1.5,2,3,4,5];
export function mountPanelCellBorders(root:HTMLElement,editor:Interaction,busy:()=>boolean,stateReason:()=>string,
  execute:(command:Command,target:ReturnType<Interaction["capture"]>)=>void,focus:()=>void) {
  const doc=root.ownerDocument,life=new AbortController(),form=doc.createElement("form");form.id="ui2-cell-borders";form.className="ui2-panel-form";
  const scope=doc.createElement("output");scope.className="ui2-scope-note";form.append(scope);
  const type=doc.createElement("select"),width=doc.createElement("select"),color=doc.createElement("input"),background=doc.createElement("input");
  type.name="panelBorderType";width.name="panelBorderWidth";color.name="panelBorderColor";background.name="panelCellBackground";
  for(const[control,key,label]of [[type,"type","선 모양"],[width,"width","선 굵기 (mm)"]] as const){control.add(new Option("방향별 / 유지",""));for(const[value,name]of fields("cell").find(f=>f.name===`borderTop.${key}`)!.options!)control.add(new Option(name,value));const l=doc.createElement("label");l.append(label,control);form.append(l);}
  const palettes:ReturnType<typeof objectLinePalette>[]=[];
  for(const[input,label,none]of [[color,"선 색 (#RRGGBB)",false],[background,"배경 (#RRGGBB / none)",true]] as const){
    input.type="text";input.autocomplete="off";input.placeholder="혼합 / 유지";
    const l=doc.createElement("label");l.append(label,input);form.append(l);
    const palette=objectLinePalette("",life.signal,{id:input.name+"-palette",label,caption:none?"셀 배경":"선 색",keep:true,allowNone:none,boundary:doc.getElementById("selection-properties")!,onChange:value=>{input.value=value;input.dispatchEvent(new Event("input",{bubbles:true}));}});form.append(palette.row);palettes.push(palette);
  }
  const quick=doc.createElement("div"),edges=doc.createElement("div");quick.className="ui2-border-presets";quick.setAttribute("role","group");quick.setAttribute("aria-label","테두리 빠른 설정");edges.className="ui2-border-edges";edges.setAttribute("role","group");edges.setAttribute("aria-label","적용할 선 위치");
  const chosen=new Set<CellBorderDraft["edges"][number]>();let preset:CellBorderDraft["preset"];
  for(const[value,label]of presets){const b=doc.createElement("button");b.type="button";b.dataset.borderPreset=value;b.textContent=label;b.title=value==="weighted"?"바깥0.3mm·안쪽0.12mm 실선 · 색은 변경한 값만 적용":"이 빠른 설정을 초안으로 선택 · 설정 전 원문 유지";b.onclick=()=>{preset=value;chosen.clear();for(const e of (value==="outer"?["top","bottom","left","right"]:value==="inner"?["insideH","insideV"]:edgeNames.map(([e])=>e)) as CellBorderDraft["edges"])chosen.add(e);paint();preview();};quick.append(b);}
  for(const[value,label]of edgeNames){const b=doc.createElement("button");b.type="button";b.dataset.borderEdge=value;b.textContent=label;b.onclick=()=>{preset=undefined;chosen.has(value)?chosen.delete(value):chosen.add(value);paint();preview();};edges.append(b);}
  form.append(quick,edges);
  const previewToggle=doc.createElement("input"),pl=doc.createElement("label");previewToggle.type="checkbox";previewToggle.name="panelBorderPreview";pl.className="ui2-check";pl.append(previewToggle,"문서에서 미리보기");form.append(pl);
  const apply=doc.createElement("button"),cancel=doc.createElement("button"),note=doc.createElement("output");apply.type="submit";apply.textContent="셀 설정";cancel.type="button";cancel.textContent="취소";note.setAttribute("aria-live","polite");form.append(apply,cancel,note);root.append(form);
  const overlays:HTMLElement[]=[];
  let initialStyle={type:"",width:"",color:""},initialBackground="";
  const remove=()=>{for(const n of overlays)n.remove();overlays.length=0;};
  const paint=()=>{for(const b of quick.querySelectorAll<HTMLButtonElement>("button"))b.setAttribute("aria-pressed",String(b.dataset.borderPreset===preset));for(const b of edges.querySelectorAll<HTMLButtonElement>("button"))b.setAttribute("aria-pressed",String(chosen.has(b.dataset.borderEdge as any)));};
  const read=()=>{
    try{
    const p=editor.selection.focus;if(p.kind!=="cell")throw Error("일반 셀을 선택하세요.");
    const all=editor.adapter.cells(p),ids=editor.selection.kind==="cells"||editor.selection.kind==="table"?editor.cells().map(c=>c.cellIdx):[p.cell];
    return {state:editor.formatState("cell"),all,ids};
    }catch(error){
      for(const input of [type,width,color,background]){input.value="";markFormatValue(input,"unavailable");}
      for(const palette of palettes)palette.setValue("");chosen.clear();preset=undefined;previewToggle.checked=false;
      scope.textContent="셀 속성 미조회 · 원본 값 유지";paint();throw error;
    }
  };
  const intent=():CellBorderDraft=>{
    const style:CellBorderDraft["style"]={};
    if(type.value&&type.value!==initialStyle.type)style.type=Number(type.value);
    if(width.value&&width.value!==initialStyle.width)style.width=Number(width.value);
    if(color.value&&color.value.toLowerCase()!==initialStyle.color.toLowerCase())style.color=color.value;
    return {edges:[...chosen],style,preset};
  };
  const draft=bindPanelDraft(form,editor,{read,reason:()=>{
    if(root.hidden)return "";
    const why=stateReason()||(busy()||doc.querySelector("dialog[open]")?"입력·저장·대화상자를 먼저 마치세요.":"");if(why)return why;
    const p=editor.selection.focus;if(p.kind!=="cell"||nested(p))return "빠른 테두리는 일반 셀만 지원합니다. 중첩 소유권·원본은 유지합니다.";
    const reason=editor.tableCommandReason({type:"cell",props:{}});if(reason)return reason;
    const value=read();cellBorderPlan(value.all,value.ids,{edges:[],style:{}});return "";
  },reset:value=>{
    const common=(key:string)=>{const vals=["Left","Right","Top","Bottom"].map(s=>value.state[`border${s}.${key}`]);return vals.every(v=>v!==undefined&&v===vals[0])?String(vals[0]):"";};
    initialStyle={type:common("type"),width:common("width"),color:common("color")};initialBackground=typeof value.state.background==="string"?value.state.background:"";
    type.value=initialStyle.type;width.value=initialStyle.width;color.value=initialStyle.color;background.value=initialBackground;
    for(const [input,key]of [[type,"type"],[width,"width"],[color,"color"]] as const)
      markFormatValue(input,formatValueGroup(value.state,["Left","Right","Top","Bottom"].map(s=>`border${s}.${key}`)));
    markFormatValue(background,formatValueState(value.state,"background"));
    palettes[0].setValue(color.value);palettes[1].setValue(background.value);
    chosen.clear();preset=undefined;previewToggle.checked=false;scope.textContent=`선택한 ${value.ids.length}개 셀 · 현재 범위에만 적용`;paint();
  },command:value=>{
    const props:Props={};if(background.value&&background.value.toLowerCase()!==initialBackground.toLowerCase()){
      if(background.value!=="none"&&!/^#[\da-f]{6}$/i.test(background.value))throw Error("배경은 #RRGGBB 또는 none으로 입력하세요.");props.background=background.value;
    }
    const borders=intent();if(!borders.edges.length&&Object.keys(borders.style).length)throw Error("선 모양을 적용할 위치를 선택하세요.");
    if(!borders.edges.length&&!Object.keys(props).length)return;
    cellBorderPlan(value.all,value.ids,borders);
    return {type:"cell",props,borders:borders.edges.length?borders:undefined};
  },execute,focus,note,cancel,clear:()=>{remove();for(const p of palettes)p.close(false);}});
  function preview(){
    remove();if(!previewToggle.checked)return;
    try{
      draft.target();const p=editor.selection.focus;if(p.kind!=="cell")return;const value=read(),plan=cellBorderPlan(value.all,value.ids,intent());
      if(value.ids.some(id=>value.all.filter(c=>c.cellIdx===id).length>1))throw Error("여러 쪽에 나뉜 셀의 미리보기는 아직 지원하지 않습니다. 원본은 유지됩니다.");
      for(const c of value.all){const props=plan.get(c.cellIdx);if(!props)continue;
        const page=doc.querySelector<HTMLElement>(`#pages>.page[data-page="${c.pageIndex}"]`);if(!page)continue;
        const overlay=doc.createElement("div");overlay.className="ui2-border-preview";overlay.setAttribute("aria-hidden","true");overlay.dataset.previewPage=String(c.pageIndex);
        const svg=doc.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("width","100%");svg.setAttribute("height","100%");const current=editor.adapter.cellProps({...p,cell:c.cellIdx});
        for(const side of ["Top","Bottom","Left","Right"]){if(!Object.keys(props).some(k=>k.startsWith(`border${side}.`)))continue;
          const line=doc.createElementNS(svg.namespaceURI,"line"),horizontal=side==="Top"||side==="Bottom",x=side==="Right"?c.x+c.w:c.x,y=side==="Bottom"?c.y+c.h:c.y;
          const next={...(current[`border${side}`] as any),...Object.fromEntries(Object.entries(props).filter(([k])=>k.startsWith(`border${side}.`)).map(([k,v])=>[k.split(".")[1],v]))};
          line.setAttribute("x1",String(x));line.setAttribute("y1",String(y));line.setAttribute("x2",String(horizontal?x+c.w:x));line.setAttribute("y2",String(horizontal?y:y+c.h));line.setAttribute("stroke",next.type===0?"#245ddd":next.color);line.setAttribute("stroke-width",String(next.type===0?2:(widths[next.width]??.12)*96/25.4));
          if(next.type===0||next.type===2||next.type===3)line.setAttribute("stroke-dasharray",next.type===2?"1 3":"5 3");
          if(next.type===0)line.setAttribute("opacity",".55");svg.append(line);
        }
        overlay.append(svg);page.append(overlay);overlays.push(overlay);
      }
      note.textContent="문서 위 적용 예정 표시 · 파란 점선은 제거 예정 · 아직 원문 변경 없음";
    }catch(error){note.textContent=String(error);}
  }
  form.addEventListener("input",()=>{palettes[0].setValue(color.value);palettes[1].setValue(background.value);preview();});form.addEventListener("change",preview);
  return{sync(){if(root.hidden){remove();return;}draft.sync();if(previewToggle.checked)preview();},dispose(){remove();draft.dispose();life.abort();form.remove();}};
}
