import {dialogGap} from './dialog-support.js';
import { objectLinePalette } from './object-line-palette.js';
import { appendDialogShortcutHelp } from './dialog-shortcut-help.js';
// UI1-PARA-INITIAL/EXTENDED/TABS/BORDER. Presentation of existing drafts only.
const lifetimes=new WeakMap<HTMLElement,AbortController>();
export function resetHancomParagraphDialog(root:HTMLElement){lifetimes.get(root)?.abort();lifetimes.delete(root);root.closest("dialog")?.querySelector(".paragraph-close")?.remove();}
/** UI navigation only; both paragraph drafts use the same existing field. */
export function focusParagraphBeforeShortcut(
  e: KeyboardEvent, dialog: HTMLDialogElement, field?: HTMLInputElement | null, reveal?: () => void,
): boolean {
  if (!dialog.open || e.defaultPrevented || !e.cancelable || e.repeat || e.isComposing || e.keyCode === 229 ||
      !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.getModifierState("AltGraph") ||
      (e.key.toLowerCase() !== "u" && e.code !== "KeyU") ||
      !field || field.name !== "spacingBefore" || !dialog.contains(field) || field.disabled || field.readOnly) return false;
  reveal?.();
  if (!field.getClientRects().length) return false;
  e.preventDefault(); e.stopPropagation();
  field.focus({preventScroll: true});
  field.select();
  return true;
}
export function mountHancomParagraphDialog(root: HTMLElement) {
  const lifetime=new AbortController();lifetimes.set(root,lifetime);
  const dialog=root.closest<HTMLDialogElement>("dialog")!, nav=root.querySelector<HTMLElement>(":scope > nav")!;
  if(!nav)return; // Nested paragraphs retain their separately supported basic dialog.
  const rows=new Map([...root.querySelectorAll<HTMLElement>("label[data-field]")].map(r=>[r.dataset.field!,r]));
  const fields=new Map([...rows].map(([name,r])=>[name,r.querySelector<HTMLInputElement|HTMLSelectElement>(`[name="${name}"]`)!]));
  const tabs=[...nav.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const panels=[0,1,2,3].map(i=>{
    const tab=tabs[i===3?1:0];
    const p=document.createElement("section");p.className="paragraph-tab-panel";p.id=`paragraph-panel-${i}`;
    p.setAttribute("role","tabpanel");if(i===0||i===3){tab.id=`paragraph-tab-${i}`;tab.setAttribute("aria-controls",p.id);}p.setAttribute("aria-labelledby",tab.id);return p;
  });
  const pageByField=new Map<string,number>();
  function group(page:number,title:string){const f=document.createElement("fieldset"),l=document.createElement("legend");l.textContent=title;f.dataset.paragraphGroup=title;f.append(l);panels[page].append(f);return f;}
  function move(names:string[],target:HTMLElement,page:number){for(const name of names){const row=rows.get(name);if(row){target.append(row);pageByField.set(name,page);}}}
  function caption(name:string,text:string){const span=rows.get(name)?.querySelector("span");if(span?.firstChild){fields.get(name)!.setAttribute("aria-label",span.firstChild.textContent??text);span.firstChild.textContent=text;}}
  const alignment=group(0,"정렬 방식");move(["alignment"],alignment,0);
  const alignControl=fields.get("alignment") as HTMLSelectElement;rows.get("alignment")!.dataset.paragraphBacking="true";
  const alignButtons:HTMLButtonElement[]=[];
  for(const [value,text]of [["justify","양쪽 정렬"],["left","왼쪽 정렬"],["center","가운데 정렬"],["right","오른쪽 정렬"],["distribute","배분 정렬"],["split","나눔 정렬"]]){
    const b=document.createElement("button");b.type="button";b.dataset.paragraphAlign=value;b.setAttribute("aria-label",text);b.title=text;
    const icon=document.createElement("span");icon.className=`paragraph-align-icon align-${value}`;icon.setAttribute("aria-hidden","true");for(let n=0;n<6;n++)icon.append(document.createElement("i"));b.append(icon);
    b.onclick=()=>{alignControl.value=value;alignControl.dispatchEvent(new Event("change",{bubbles:true}));};alignment.append(b);alignButtons.push(b);
  }
  const margin=group(0,"여백");move(["marginLeft","marginRight"],margin,0);caption("marginLeft","왼쪽 (pt)");caption("marginRight","오른쪽 (pt)");
  const first=group(0,"첫 줄");move(["indent"],first,0);const indentRow=rows.get("indent")!;
  const mode=indentRow.querySelector<HTMLSelectElement>("[name=firstLineKind]")!,amount=indentRow.querySelector<HTMLInputElement>("[name=firstLineAmount]")!;
  indentRow.dataset.paragraphBacking="true";
  // Commit proxy input to the existing draft before panel-level input sync.
  // Waiting for change lets sync restore the old draft during input bubbling.
  const firstRadios:HTMLInputElement[]=[];
  for(const [value,text]of [["normal","보통"],["indent","들여쓰기"],["hanging","내어쓰기"]]){
    const label=document.createElement("label"),input=document.createElement("input");input.type="radio";input.name="paragraphFirstLine";input.value=value;
    input.oninput=()=>{mode.value=value;mode.dispatchEvent(new Event("change",{bubbles:true}));};label.append(input,document.createTextNode(text));first.append(label);firstRadios.push(input);
  }
  const amountLabel=document.createElement("label");amountLabel.className="paragraph-first-amount";amountLabel.append(document.createTextNode("길이 (pt)"),amount);first.append(amountLabel);
  const spacing=group(0,"간격");move(["lineSpacingType","spacingBefore","lineSpacing","spacingAfter"],spacing,0);
  caption("lineSpacingType","줄 간격");caption("lineSpacing","값");caption("spacingBefore","문단 위 (pt)");caption("spacingAfter","문단 아래 (pt)");
  const breaking=group(0,"줄 나눔 기준");move(["koreanBreakUnit","englishBreakUnit"],breaking,0);caption("koreanBreakUnit","한글 단위");caption("englishBreakUnit","영문 단위");
  dialogGap(breaking,"최소 공백 (%)","기존 문단 조회·적용 계약에 최소 공백 비율 없음; 원본 유지","number");
  dialogGap(spacing,"편집 용지의 줄 격자 사용","줄 격자와 글꼴 줄 높이는 서로 다른 속성; 현재 계약 조회·적용 미지원","checkbox");
  const lists=root.querySelector<HTMLElement>("[data-paragraph-lists]");const listMode=lists?.querySelector<HTMLSelectElement>("[name=listMode]");
  const listRadios:HTMLInputElement[]=[];const listGroup=group(1,"문단 종류");
  if(lists&&listMode){
    const originalLabel=listMode.closest<HTMLElement>("label")!;originalLabel.dataset.paragraphBacking="true";
    for(const [value,text]of [["None","없음"],["Outline","개요 문단"],["Number","번호 문단"],["Bullet","글머리표 문단"]]){
      const label=document.createElement("label"),radio=document.createElement("input");radio.type="radio";radio.name="paragraphListMode";radio.value=value;radio.disabled=listMode.disabled;
      radio.oninput=()=>{listMode.value=value;listMode.dispatchEvent(new Event("change",{bubbles:true}));};label.append(radio,document.createTextNode(text));listGroup.append(label);listRadios.push(radio);
    }
    listGroup.append(lists);
  }
  const other=group(1,"기타");
  const boolNames=["widowOrphan","keepWithNext","keepLines","pageBreakBefore","fontLineHeight","singleLine","autoSpaceKrEn","autoSpaceKrNum"];
  move([...boolNames,"verticalAlign"],other,1);
  const toggles:{proxy:HTMLInputElement;source:HTMLSelectElement}[]=[];
  for(const name of boolNames){
    const source=fields.get(name) as HTMLSelectElement,row=rows.get(name)!,text=row.querySelector("span")!.firstChild?.textContent??name;
    row.dataset.paragraphBacking="true";const label=document.createElement("label"),proxy=document.createElement("input");proxy.type="checkbox";proxy.setAttribute("aria-label",text);proxy.title=source.title;
    proxy.oninput=()=>{source.value=String(proxy.checked);source.dispatchEvent(new Event("change",{bubbles:true}));};label.append(proxy,document.createTextNode(text));other.append(label);toggles.push({proxy,source});
  }
  // The captured Extended tab places vertical alignment after its checkboxes.
  // Move the existing control, keeping DOM/keyboard order and its draft intact.
  other.append(rows.get('verticalAlign')!);
  const extra=root.querySelector<HTMLSelectElement>("[name=paragraphAdjustment]")?.closest<HTMLElement>("div");
  const extraDetails=document.createElement("details");const extraSummary=document.createElement("summary");extraSummary.textContent="기존 지원 · 여백/들여쓰기 증감";extraDetails.append(extraSummary);if(extra){extra.hidden=false;extraDetails.append(extra);panels[1].append(extraDetails);}
  const tabEditor=root.querySelector<HTMLElement>("[data-tab-stops-draft]");
  if(tabEditor){tabEditor.hidden=false;panels[2].append(tabEditor);}
  const autoTabs=group(2,"자동 탭");move(["tabAutoLeft","tabAutoRight"],autoTabs,2);
  const hold=document.createElement("p");hold.className="paragraph-scope-note";hold.textContent="기본 탭 간격은 조회·변경 미지원이며 원본을 유지합니다.";panels[2].append(hold);
  const palettes=new Map<string,ReturnType<typeof objectLinePalette>>();
  function colorProxy(name:string,target:HTMLElement,label:string,accessible:string){
    move([name],target,3);caption(name,label);
    const source=fields.get(name)!,row=rows.get(name)!;row.dataset.paragraphBacking='true';
    const palette=objectLinePalette(source.value,lifetime.signal,{
      id:'paragraph-color-'+name.replace('.','-')+'-popup',label:accessible,caption:label,
      keep:true,allowNone:name==='paragraphBackground',onChange:value=>{
        if(source instanceof HTMLSelectElement&&![...source.options].some(o=>o.value===value))source.add(new Option(value,value));
        source.value=value;source.dispatchEvent(new Event('change',{bubbles:true}));
      }
    });
    palette.row.classList.add('paragraph-color-palette');palette.row.dataset.paragraphColorRow=name;
    const trigger=palette.row.querySelector<HTMLButtonElement>('[data-object-line-color]')!;
    delete trigger.dataset.objectLineColor;trigger.dataset.paragraphColor=name;trigger.disabled=source.disabled;
    trigger.title=source.disabled?source.title:accessible;
    target.append(palette.row);palettes.set(name,palette);
  }
  const borders=group(3,"테두리"),edges=document.createElement("div");edges.className="paragraph-edge-picker";let edge="Left";const edgeButtons:HTMLButtonElement[]=[];
  for(const [side,text]of [["Left","왼쪽"],["Right","오른쪽"],["Top","위"],["Bottom","아래"]]){
    const b=document.createElement("button");b.type="button";b.textContent=text;b.dataset.paragraphEdge=side;b.onclick=()=>{edge=side;sync();};edges.append(b);edgeButtons.push(b);
    move(["type","width"].map(k=>`border${side}.${k}`),borders,3);for(const [k,label]of [["type","종류"],["width","굵기"]])caption(`border${side}.${k}`,label);
    colorProxy(`border${side}.color`,borders,'색',`${text} 문단 테두리 색`);
  }
  move(["borderConnect"],borders,3);borders.append(edges);
  const connectSource=fields.get("borderConnect") as HTMLSelectElement,connectRow=rows.get("borderConnect")!;connectRow.dataset.paragraphBacking="true";const connectLabel=document.createElement("label"),connectProxy=document.createElement("input");connectProxy.type="checkbox";connectProxy.name="paragraphBorderConnect";connectProxy.oninput=()=>{connectSource.value=String(connectProxy.checked);connectSource.dispatchEvent(new Event("change",{bubbles:true}));};connectLabel.append(connectProxy,document.createTextNode("문단 테두리 연결"));borders.append(connectLabel);toggles.push({proxy:connectProxy,source:connectSource});
  const background=group(3,"배경");colorProxy("paragraphBackground",background,"면 색","문단 배경 면 색");dialogGap(background,"무늬 색","문단 무늬 배경 조회·적용 계약 미지원; 원본 유지");dialogGap(background,"무늬 모양","문단 무늬 배경 조회·적용 계약 미지원; 원본 유지");
  const gaps=group(3,"간격");move(["borderGap0","borderGap2","borderGap1","borderGap3","borderIgnoreMargin"],gaps,3);
  for(let i=0;i<4;i++)caption(`borderGap${i}`,["왼쪽 (pt)","오른쪽 (pt)","위쪽 (pt)","아래쪽 (pt)"][i]);
  const spacingBefore=fields.get("spacingBefore") as HTMLInputElement;
  const sample=document.createElement("div");sample.className="paragraph-layout-preview";sample.setAttribute("aria-label","문단 모양 배치 예시 · 문서 원문 미리보기 아님");
  for(const text of ["이전 문단 이전 문단 이전 문단 이전 문단", "가나다라AaBbCc12345 가나다라AaBbCc12345 가나다라AaBbCc12345 가나다라AaBbCc12345 가나다라AaBbCc12345", "이후 문단 이후 문단 이후 문단 이후 문단"]){const p=document.createElement("p");p.textContent=text;sample.append(p);}panels[0].append(sample);
  const preset=document.createElement("button");preset.type="button";preset.disabled=true;preset.className="paragraph-presets";preset.textContent="대화 상자 설정 · 사용자 지정";preset.title="프리셋 구성 명령은 연결되어 있지 않습니다. 변경한 서식은 설정으로 적용합니다.";
  const more=document.createElement("details"),moreTitle=document.createElement("summary");more.className="dialog-supported-more";moreTitle.textContent="추가 문단 속성·번호·탭";more.append(moreTitle,panels[1],panels[2]);panels[0].append(more);
  root.replaceChildren(nav,panels[0],panels[3]);
  appendDialogShortcutHelp(root, [["문단모양", [
    ["u", "문단 위 간격 선택"], ["l", "왼쪽 정렬"], ["c", "가운데 정렬"],
    ["r", "오른쪽 정렬"], ["d", "적용"],
  ]]]);
  dialog.querySelector(".paragraph-close")?.remove();const close=document.createElement("button");close.type="button";close.className="paragraph-close";close.setAttribute("aria-label","문단 모양 닫기");close.textContent="×";close.onclick=()=>dialog.querySelector<HTMLButtonElement>("#cancel")!.click();dialog.querySelector("form")!.append(close);
  const activeNeedsMore=(name:string)=>[1,2].includes(pageByField.get(name)??-1);
  function sync(){
    const active=tabs[1]?.getAttribute("aria-selected")==="true"?3:0;panels.forEach((p,i)=>p.hidden=i===3?active!==3:i===0?active!==0:false);
    for(const [name,row]of rows){const side=/^border(Left|Right|Top|Bottom)\./.exec(name)?.[1];row.hidden=(active===3?pageByField.get(name)!==3:pageByField.get(name)===3)||!!side&&side!==edge;}
    for(const [name,palette]of palettes){palette.row.hidden=rows.get(name)!.hidden;palette.setValue(fields.get(name)!.value);if(palette.row.hidden)palette.close(false);}
    if(tabEditor)tabEditor.hidden=false;if(extra)extra.hidden=false;if(lists)lists.hidden=false;
    for(const b of alignButtons){b.dataset.valueState=alignControl.dataset.valueState;
      if(alignControl.value===""&&alignControl.dataset.valueState==="unavailable")b.removeAttribute("aria-pressed");else b.setAttribute("aria-pressed",alignControl.value===""?"mixed":String(alignControl.value===b.dataset.paragraphAlign));}
    for(const r of firstRadios)r.checked=r.value===mode.value;
    for(const r of listRadios)r.checked=r.value===listMode?.value;
    for(const {proxy,source}of toggles){proxy.checked=source.value==="true";proxy.indeterminate=source.value==="";proxy.disabled=source.disabled||(!proxy.checked&&!!source.querySelector<HTMLOptionElement>('option[value="true"]')?.disabled);proxy.title=source.title;}
    for(const b of edgeButtons)b.setAttribute("aria-pressed",String(b.dataset.paragraphEdge===edge));
    const requestedGroup=[...nav.querySelectorAll<HTMLElement>("[data-format-group]")].find(b=>b.getAttribute("aria-pressed")==="true")?.dataset.formatGroup;
    if(["문단 번호·글머리표","문단 보호","자동 간격","여백·들여쓰기 증감","탭"].includes(requestedGroup??""))more.open=true;
    if(requestedGroup==="여백·들여쓰기 증감")extraDetails.open=true;
    const text=sample.children[1] as HTMLElement;text.style.textAlign=alignControl.value==="justify"?"justify":["left","right","center"].includes(alignControl.value)?alignControl.value:"left";
    // Show the draft immediately without committing a document change.
    const above=spacingBefore.valueAsNumber;
    text.style.marginBlockStart=Number.isFinite(above)&&above>=0?`${Math.min(above,12)}pt`:"";
  }
  nav.addEventListener("click",sync);for(const panel of panels){panel.addEventListener("change",sync);panel.addEventListener("input",sync);
    panel.addEventListener("invalid",event=>{const name=(event.target as HTMLInputElement).name,side=/^border(Left|Right|Top|Bottom)\./.exec(name)?.[1];if(side)edge=side;if(name==="firstLineAmount")tabs[0].click();if(activeNeedsMore(name))more.open=true;sync();},true);
  }
  const localKey=(e:KeyboardEvent)=>{
    if(!dialog.open||e.defaultPrevented||e.isComposing||e.keyCode===229||e.getModifierState("AltGraph")||
        e.ctrlKey||e.metaKey||e.shiftKey||e.repeat||!e.cancelable)return;
    const key=e.key.toLowerCase();
    if(e.altKey&&key==="d"){e.preventDefault();dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();return;}
    if(focusParagraphBeforeShortcut(e,dialog,spacingBefore,()=>tabs[0].click()))return;
    // Plain letters only in the dialog chrome, never in a local text field.
    if(!e.altKey&&(e.target as Element)?.closest("input,textarea,select,[contenteditable]"))return;
    const direction:Record<string,string>={c:"center",l:"left",r:"right"};
    const value=direction[key];
    if(!value||alignControl.disabled||!Array.from(alignControl.options).some(o=>o.value===value&&!o.disabled))return;
    const button=alignButtons.find(b=>b.dataset.paragraphAlign===value&&!b.disabled);
    if(!button)return;
    e.preventDefault();e.stopPropagation();tabs[0].click();button.click();button.focus({preventScroll:true});
  };
  dialog.addEventListener("keydown",localKey,{signal:lifetime.signal});sync();
}
