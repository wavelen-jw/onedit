import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import { nested } from "./model.js";
import type { mountShapes } from "./shape-ui.js";
import { selectedPicture } from "./pictures.js";
import { mountPanelCharacter } from "./panel-character.js";
import { mountPanelObjectSize } from "./panel-object-size.js";
import { mountPanelCellBorders } from "./panel-cell-borders.js";

type RootSet={character:HTMLDetailsElement;paragraph:HTMLDetailsElement;cell:HTMLDetailsElement;picture:HTMLDetailsElement;shape?:HTMLDetailsElement};
export function mountContextProperties(doc:Document,editor:Interaction,roots:RootSet,options:{
  busy:()=>boolean;reason:()=>string;focus:()=>void;
  execute:(command:Command,target:ReturnType<Interaction["capture"]>)=>void;
  readShape?:ReturnType<typeof mountShapes>["readSelected"];
}) {
  const panel=doc.getElementById("selection-properties")!,heading=doc.createElement("header"),title=doc.createElement("h2"),scope=doc.createElement("p");
  heading.className="ui2-panel-heading";title.id="ui2-context-title";title.tabIndex=-1;scope.id="ui2-context-scope";scope.setAttribute("role","status");heading.append(title,scope);panel.prepend(heading);
  const close=panel.querySelector<HTMLButtonElement>(":scope > button");if(close){close.id="properties-close";heading.append(close);}
  panel.setAttribute("aria-labelledby",title.id);
  for(const root of Object.values(roots))if(root)root.classList.add("ui2-property-section");
  // The original static embedding/developer guide is not a selection property.
  // Keep its DOM for compatibility, without interleaving it with editable cards.
  const owned=new Set<Element>([heading,...Object.values(roots).filter((n):n is HTMLDetailsElement=>!!n)]);
  for(const node of panel.children)if(!owned.has(node)&&node.tagName!=="BUTTON")(node as HTMLElement).hidden=true;
  const original=doc.getElementById("selection-font")?.closest("section");if(original)(original as HTMLElement).hidden=true;
  const actions=doc.createElement("div");actions.className="ui2-format-toggles";for(const b of roots.character.querySelectorAll("[data-property-proxy]"))actions.append(b);roots.character.append(actions);
  const paragraphForm=doc.getElementById("properties-paragraph-form")!;paragraphForm.classList.add("ui2-panel-form");
  const table=doc.createElement("details"),ts=doc.createElement("summary"),tableInfo=doc.createElement("p"),all=doc.createElement("button");table.id="ui2-properties-table";table.className="ui2-property-section";table.open=true;ts.textContent="표와 적용 범위";tableInfo.className="ui2-scope-note";all.type="button";all.textContent="표 전체 선택";all.dataset.ui2SelectTable="";table.append(ts,tableInfo,all);roots.cell.before(table);
  all.onclick=()=>{const source=doc.getElementById("table-object") as HTMLButtonElement|null;if(!options.busy()&&!doc.querySelector("dialog[open]")&&source&&!source.disabled)source.click();};
  const values=roots.cell.querySelector("dl")!,details=doc.createElement("details"),ds=doc.createElement("summary");ds.textContent="현재 값 · 방향별 테두리";details.className="ui2-current-values";values.before(details);details.append(ds,values);
  const character=mountPanelCharacter(roots.character,editor,options.busy,options.execute,options.focus,options.reason);
  const borders=mountPanelCellBorders(roots.cell,editor,options.busy,options.reason,options.execute,options.focus);
  const sourceReason=(id:string)=>options.reason()||(options.busy()||doc.querySelector("dialog[open]")?"입력·저장·대화상자를 먼저 마치세요.":"")||
    (!doc.getElementById(id)?"기존 크기 명령이 연결되지 않았습니다.":(doc.getElementById(id) as HTMLButtonElement).disabled?(doc.getElementById(id)!.title||"현재 개체의 변경은 지원하지 않습니다."):"");
  const picture=mountPanelObjectSize(roots.picture,editor,"picture",{...options,
    reason:()=>sourceReason("picture-properties"),read:()=>{const p=selectedPicture(editor.adapter,editor.selection).props;return{width:p.width,height:p.height,command:(width,height)=>({type:"picture",change:{action:"properties",width,height}})};}});
  const shape=roots.shape&&options.readShape?mountPanelObjectSize(roots.shape,editor,"shape",{...options,
    reason:()=>sourceReason("shape-properties")||options.readShape?.()?.reason||"",
    read:()=>{const row=options.readShape!();if(!row)throw Error("글상자 선택이 바뀌었습니다.");return{width:row.props.width,height:row.props.height,command:(width,height)=>({type:"shape-size",change:{target:row.target,width,height}})};}}):undefined;
  const setText=(element:HTMLElement,text:string)=>{if(element.textContent!==text)element.textContent=text;};
  function sync(){
    const s=editor.selection,p=s.focus,object=s.kind==="object",shapeActive=!!roots.shape&&!roots.shape.hidden;
    let label="본문 문단",description=`${p.sec+1}구역 · ${p.para+1}문단`,cellCount=0;
    if(shapeActive){label="선택한 개체 1개";description=roots.shape!.querySelector('[data-shape-property="kind"]')?.textContent+" · "+description;}
    else if(object){label="그림 1개";description+=p.kind==="cell"?` · 셀 ${p.cell+1}`:" · 본문";}
    else if(p.kind==="cell"){
      cellCount=s.kind==="cells"||s.kind==="table"?editor.cells().length:1;
      label=s.kind==="table"?`표의 ${cellCount}개 셀`:s.kind==="cells"?`선택한 ${cellCount}개 셀`:"셀의 문단";
      description+=` · 표 ${p.control+1} · 셀 ${p.cell+1} · 문단 ${p.cellPara+1}`+(nested(p)?" · 중첩 소유 경로":"");
    }
    if(s.kind==="text"){
      try{const targets=editor.targets(s);const count=targets.reduce((n,t)=>n+Math.max(0,editor.adapter.textOffset(t.p,t.end)-editor.adapter.textOffset(t.p)),0);label=`선택한 ${count}글자 · ${targets.length}문단`+(p.kind==="cell"?" (셀)":"");}catch{label="선택 범위 확인 필요";}
    }
    setText(title,label);setText(scope,description);panel.dataset.context=shapeActive?"shape":object?"picture":s.kind==="table"||s.kind==="cells"?"cells":p.kind;
    panel.dataset.owner=JSON.stringify(s);
    roots.character.hidden=roots.paragraph.hidden=shapeActive||object||s.kind==="table"||s.kind==="cells";
    roots.picture.hidden=!object||shapeActive;roots.cell.hidden=table.hidden=p.kind!=="cell"||object||shapeActive;
    if(!table.hidden){
      try{const boxes=editor.adapter.cells(p as Extract<typeof p,{kind:"cell"}>);setText(tableInfo,`${Math.max(...boxes.map(c=>c.row+c.rowSpan))}행 × ${Math.max(...boxes.map(c=>c.col+c.colSpan))}열 · 현재 ${cellCount}개 셀에 적용`);}catch{setText(tableInfo,"표 범위 조회 불가 · 원본 유지");}
      const source=doc.getElementById("table-object") as HTMLButtonElement|null;all.disabled=options.busy()||!source||source.disabled;all.title=source?.title||"기존 표 전체 선택 명령";
    }
    for(const [root,text]of [[roots.cell,"현재 선택에만 적용합니다. 빈칸·혼합은 유지하며 공유 경계의 비대상 변경은 거절합니다."],[roots.picture,"크기는 아래에서 설정합니다. 배치·파일 교체는 기존 그림 속성을 사용합니다."]] as const){
      const note=root.querySelector<HTMLOutputElement>(":scope > output");
      if(note&&!root.hidden&&!options.busy()&&!doc.querySelector("dialog[open]")&&!(root.querySelector(":scope > button") as HTMLButtonElement)?.disabled)setText(note,text);
    }
    if(!roots.character.hidden)character.sync();borders.sync();picture.sync();shape?.sync();
  }
  return{sync,dispose(){character.dispose();borders.dispose();picture.dispose();shape?.dispose();heading.remove();table.remove();}};
}
