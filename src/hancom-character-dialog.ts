// User-provided Hancom Web UI specification, 2026-11-01.
// UI-only reorganisation; no reference document content or defaults. Move existing drafts only: the original reader and Command remain
// authoritative, including mixed values, held properties and language slots.
import {dialogGap,dialogUnit} from './dialog-support.js';
import { objectLinePalette } from './object-line-palette.js';
import { appendDialogShortcutHelp } from './dialog-shortcut-help.js';
const basicFields = {
  z: ["fontSize", "크기"], l: ["dialogLanguage", "언어"], t: ["fontFamily", "글꼴"],
  r: ["relativeSizes", "상대 크기"], w: ["ratios", "장평"], p: ["spacings", "자간"],
  c: ["textColor", "글자색"], g: ["shadeColor", "음영색"],
} as const;
const basicToggles = { b:"진하게", i:"기울임", u:"밑줄", e:"취소선",
  j:"양각", k:"음각", h:"위 첨자", y:"아래 첨자" } as const;
const extendedFields = {
  c: ["shadowColor", "그림자 색"], l: ["underlineType", "밑줄 위치"],
  m: ["underlineShape", "밑줄 모양"], r: ["underlineColor", "밑줄 색"],
  h: ["strikeColor", "취소선 색"], k: ["kerning", "커닝"],
  y: ["type", "선택한 쪽 테두리 종류"], t: ["width", "선택한 쪽 테두리 굵기"],
  f: ["color", "선택한 쪽 테두리 색"], o: ["characterBackground", "배경 면 색"],
} as const;
function fieldBinding<T>(fields: Record<string,T>, key:string): T | undefined {
  return Object.hasOwn(fields,key) ? fields[key] : undefined;
}
const lifetimes = new WeakMap<HTMLElement, AbortController>();
export function resetHancomCharacterDialog(root: HTMLElement) {
  lifetimes.get(root)?.abort();lifetimes.delete(root);
  root.closest("dialog")?.querySelector(".character-close")?.remove();
}
export function mountHancomCharacterDialog(root: HTMLElement) {
  const lifetime = new AbortController();lifetimes.set(root,lifetime);
  const options={signal:lifetime.signal};
  const dialog = root.closest<HTMLDialogElement>("dialog")!;
  const nav = root.querySelector<HTMLElement>(":scope > nav")!;
  const rows = new Map([...root.querySelectorAll<HTMLElement>("label[data-field]")]
    .map(row => [row.dataset.field!, row]));
  const controls = new Map([...rows].map(([name, row]) =>
    [name, row.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!]));
  const language = root.querySelector<HTMLSelectElement>("[name=dialogLanguage]")!;
  const languageRow = language.closest<HTMLElement>("label")!;
  const languageNote = root.querySelector<HTMLElement>(".dialog-draft-note")!;
  const tabs = [...nav.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const panels = tabs.map((tab, index) => {
    const panel = document.createElement("section");
    panel.className = "character-tab-panel";
    panel.id = `character-panel-${index}`;
    tab.id = `character-tab-${index}`;
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    return panel;
  });
  function group(panel: number, title: string, key = title) {
    const fieldset = document.createElement("fieldset"), legend = document.createElement("legend");
    fieldset.dataset.characterGroup = key; legend.textContent = title;
    fieldset.append(legend); panels[panel].append(fieldset);
    return fieldset;
  }
  const pageForField = new Map<string, number>();
  function move(names: string[], target: HTMLElement, page: number) {
    for (const name of names) {
      const row = rows.get(name); if (!row) continue;
      row.hidden = false; target.append(row); pageForField.set(name, page);
    }
  }
  function caption(name: string, text: string) {
    const span = rows.get(name)?.querySelector("span");
    if (!span) return;
    controls.get(name)!.setAttribute("aria-label", span.firstChild?.textContent ?? text);
    if (span.firstChild) span.firstChild.textContent = text;
  }
  const size = document.createElement("div");size.className = "character-size";
  panels[0].append(size);move(["fontSize"], size, 0);caption("fontSize", "기준 크기");
  const lang = group(0, "언어별 설정");lang.append(languageRow);
  // The existing all-language contract is deliberately not relabelled as
  // Hancom's representative-font mode. No implicit source-slot rewrite.
  languageRow.className = "character-language";
  move(["fontFamily", ...Array.from({length:7}, (_, i) => `fontLanguage${i}`),
    "relativeSizes", "ratios", "charOffsets", "spacings",
    ...Array.from({length:7}, (_, i) => ["relativeSizes", "ratios", "charOffsets", "spacings"].map(k => `${k}Language${i}`)).flat()], lang, 0);
  for (const name of rows.keys()) {
    if (/^font(Family|Language)/.test(name)) caption(name, "글꼴");
    for (const [prefix, text] of [["relativeSizes", "상대크기"], ["ratios", "장평"], ["charOffsets", "글자 위치"], ["spacings", "자간"]])
      if (name.startsWith(prefix)) caption(name, text);
  }
  const attributes = group(0, "속성");
  const buttons = document.createElement("div");buttons.className = "character-attributes";attributes.append(buttons);
  const proxies: {button: HTMLButtonElement; source: HTMLSelectElement; on: string; off: string}[] = [];
  const proxy = (name: string, label: string, sample: string, on = "true", off = "false") => {
    const source = controls.get(name) as HTMLSelectElement;
    const button = document.createElement("button");button.type = "button";
    button.textContent = sample;button.setAttribute("aria-label", label);button.dataset.characterToggle = label;
    button.disabled = source.disabled;button.title = source.disabled ? source.title : label;
    button.onclick = () => {
      source.value = (name === "outlineType" || name === "shadowType"
        ? source.value !== "" && source.value !== "0" : source.value === on) ? off : on;
      source.dispatchEvent(new Event("change", {bubbles:true}));
    };
    buttons.append(button);proxies.push({button, source, on, off});
    // The named select remains a draft, including its empty/mixed sentinel.
    // It is not a second focus stop or an independent Command.
    if (["bold", "italic", "underline", "strikethrough", "emboss", "engrave", "scriptMode"].includes(name)) {
      const row=rows.get(name)!;attributes.append(row);row.dataset.characterBacking = "true";pageForField.set(name, 0);
    }
  };
  proxy("bold", "진하게", "가");proxy("italic", "기울임", "가");
  proxy("underline", "밑줄", "가");proxy("strikethrough", "취소선", "가");
  proxy("outlineType", "외곽선", "가", "1", "0");proxy("shadowType", "그림자", "가", "1", "0");
  proxy("emboss", "양각", "가");proxy("engrave", "음각", "가");
  proxy("scriptMode", "위 첨자", "가¹", "super", "normal");
  proxy("scriptMode", "아래 첨자", "가₁", "sub", "normal");
  move(["textColor", "shadeColor"], attributes, 0);caption("textColor", "글자 색");caption("shadeColor", "음영 색");
  // Palette proxies retain the original named drafts/initial comparisons.
  // Unknown/mixed is keep; explicit none exists only for shade/fill fields.
  const colorPalettes=new Map<string,ReturnType<typeof objectLinePalette>>();
  function colorProxy(name:string,label:string,text:string,allowNone=false){
    const source=controls.get(name)!,row=rows.get(name)!;row.dataset.characterBacking='true';
    const palette=objectLinePalette(source.value,lifetime.signal,{
      id:name==='textColor'?'character-text-color-popup':'character-color-'+name.replace('.','-')+'-popup',
      label,caption:text,keep:true,allowNone,boundary:row.closest<HTMLElement>('.character-tab-panel')!,onChange:value=>{
        if(source instanceof HTMLSelectElement&&![...source.options].some(o=>o.value===value))source.add(new Option(value,value));
        source.value=value;source.dispatchEvent(new Event('change',{bubbles:true}));
      }
    });
    palette.row.classList.add('character-color-palette');palette.row.dataset.characterColorRow=name;
    const trigger=palette.row.querySelector<HTMLButtonElement>('[data-object-line-color]')!;
    delete trigger.dataset.objectLineColor;trigger.dataset.characterColor=name;
    trigger.disabled=source.disabled||(source instanceof HTMLInputElement&&source.readOnly);
    trigger.title=trigger.disabled?source.title:label;row.after(palette.row);colorPalettes.set(name,palette);
  }
  colorProxy('textColor','글자 색','글자 색');
  colorProxy('shadeColor','글자 음영 색','음영 색',true);
  const shadow = group(1, "그림자");move(["shadowType", "shadowOffsetX", "shadowColor", "shadowOffsetY"], shadow, 1);
  colorProxy('shadowColor','그림자 색','색');
  caption("shadowType", "종류");caption("shadowOffsetX", "X 방향 (%)");caption("shadowOffsetY", "Y 방향 (%)");caption("shadowColor", "색");
  // The captured Extended tab uses three radio choices. Keep the original
  // named select as the only draft read by the existing Command contract.
  const shadowSource = controls.get("shadowType") as HTMLSelectElement;
  rows.get("shadowType")!.dataset.characterBacking = "true";
  const shadowChoices = document.createElement("div");
  shadowChoices.className = "character-shadow-choices";
  shadowChoices.setAttribute("role", "group");shadowChoices.setAttribute("aria-label", "그림자 종류");
  const shadowRadios: HTMLInputElement[] = [];
  for (const value of ["0", "1", "2"]) {
    const option = [...shadowSource.options].find(option => option.value === value);
    if (!option) continue; // Never invent a type outside the existing draft contract.
    const label = document.createElement("label"), radio = document.createElement("input");
    radio.type = "radio";radio.name = "ui1ShadowChoice";radio.value = value;
    radio.addEventListener("change", () => {
      if (!radio.checked || shadowSource.disabled) return;
      shadowSource.value = value;
      shadowSource.dispatchEvent(new Event("change", {bubbles:true}));
    }, options);
    label.append(radio, document.createTextNode(option.text));shadowChoices.append(label);shadowRadios.push(radio);
  }
  const shadowKeep = document.createElement("button"), shadowState = document.createElement("span");
  shadowKeep.type = "button";shadowKeep.textContent = "유지";shadowKeep.setAttribute("aria-label", "그림자 종류 유지");
  shadowKeep.title = "그림자 종류 변경을 취소하고 선택한 글자의 기존 값을 유지합니다.";
  shadowKeep.addEventListener("click", () => {
    if (shadowSource.disabled) return;
    shadowSource.value = ""; // Existing empty/keep sentinel; no default applied.
    shadowSource.dispatchEvent(new Event("change", {bubbles:true}));
  }, options);
  shadowState.className = "character-shadow-state";shadowState.id = "character-shadow-state";
  shadowChoices.setAttribute("aria-describedby", shadowState.id);
  shadowChoices.append(shadowKeep, shadowState);shadow.append(shadowChoices);
  const underline = group(1, "밑줄");move(["underlineType", "underlineShape", "underlineColor"], underline, 1);
  colorProxy('underlineColor','밑줄 색','색');
  caption("underlineType", "위치");caption("underlineShape", "모양");caption("underlineColor", "색");
  const strike = group(1, "취소선");move(["strikeColor"], strike, 1);caption("strikeColor", "색");
  colorProxy('strikeColor','취소선 색','색');
  const unsupported = (target: HTMLElement, text: string, reason: string) => {
    const button = document.createElement("button");button.type = "button";button.disabled = true;
    button.textContent = text;button.title = reason;target.append(button);
  };
  dialogGap(strike,"모양","취소선 모양의 저장·재열기 계약 미지원; 원본 유지");
  const other = group(1, "기타");move(["outlineType", "emphasisDot", "kerning"], other, 1);
  const border = group(1, "테두리"), edgePicker=document.createElement("div");edgePicker.className="character-edge-picker";
  const edgeButtons: HTMLButtonElement[] = [];let edge="Left";
  for (const [side, text] of [["Left", "왼쪽"], ["Right", "오른쪽"], ["Top", "위"], ["Bottom", "아래"]]) {
    const b=document.createElement("button");b.type="button";b.textContent=text;b.dataset.characterEdge=side;
    b.onclick=()=>{edge=side;sync();};edgePicker.append(b);edgeButtons.push(b);
    move(["type", "width", "color"].map(k=>`charBorder${side}.${k}`), border, 1);
    for (const [key,text] of [["type","종류"],["width","굵기"],["color","색"]]) caption(`charBorder${side}.${key}`,text);
    colorProxy(`charBorder${side}.color`,`${text} 글자 테두리 색`,'색');
  }
  border.append(edgePicker);
  const background=group(1, "배경");move(["characterBackground"], background, 1);caption("characterBackground", "면 색");
  colorProxy('characterBackground','글자 배경 면 색','면 색',true);
  dialogGap(background,"무늬 색","글자 무늬 배경 조회·적용 계약 미지원; 원본 유지");
  dialogGap(background,"무늬 모양","글자 무늬 배경 조회·적용 계약 미지원; 원본 유지");
  const supplemental=document.createElement("details"),supplementTitle=document.createElement("summary");supplemental.className="dialog-supported-more";supplementTitle.textContent="추가 글자 속성";supplemental.append(supplementTitle,shadow,other);panels[1].append(supplemental);
  // Four primary groups retain the real named drafts and are ordered as the
  // Web reference. The extra existing shadow/kerning controls remain reachable.
  panels[1].prepend(underline,strike,border,background);
  dialogUnit(controls.get("fontSize"),"pt");
  for(const [name,control]of controls)if(/^(relativeSizes|ratios|charOffsets|spacings)(Language[0-6])?$/.test(name))dialogUnit(control,"%");
  const scope=root.querySelector<HTMLElement>("[data-character-border-scope]");if(scope){scope.hidden=false;background.append(scope);}
  const preview=document.createElement("div");preview.className="character-preview";preview.setAttribute("aria-label","글자 모양 미리보기");
  const fontPreviews=[...rows.values()].flatMap(row=>[...row.querySelectorAll<HTMLElement>("[data-font-field]")]);
  // One preview well rather than eight full previews inside the language grid.
  // Their existing source/display and late-loading listeners remain attached.
  preview.append(...fontPreviews);panels[0].append(preview);
  languageNote.className="character-language-note";languageNote.textContent="언어별 초안은 탭을 바꾸어도 유지됩니다. 모든 언어를 선택하면 같은 글꼴을 각 언어에 적용합니다.";
  const preset=document.createElement("div");preset.className="character-presets";
  unsupported(preset,"대화 상자 설정 · 사용자 지정", "대화 상자 프리셋 저장·구성 명령은 연결되어 있지 않습니다. 문서 서식은 기존 설정 버튼으로 적용합니다.");
  // Detach only old presentation wrappers. Every existing field/control and
  // its listener has already moved into the new panels.
  root.replaceChildren(nav,...panels,languageNote);
  appendDialogShortcutHelp(root, [
    ["기본", [...Object.entries(basicFields).map(([key, [,label]])=>[key,label] as const),
      ...Object.entries(basicToggles)]],
    ["확장", Object.entries(extendedFields).map(([key, [,label]])=>[key,label] as const)],
    ["공통", [["d","적용"]]],
  ]);
  const close=document.createElement("button");close.type="button";close.className="character-close";close.setAttribute("aria-label","글자 모양 닫기");close.textContent="×";
  close.onclick=()=>dialog.querySelector<HTMLButtonElement>("#cancel")!.click();
  dialog.querySelector(".character-close")?.remove();dialog.querySelector("form")!.append(close);
  function sync() {
    const active=tabs.findIndex(tab=>tab.getAttribute("aria-selected")==="true");
    panels.forEach((panel,index)=>panel.hidden=index!==active);
    // All three reference tabs share the same preview. Move the existing well
    // rather than cloning font state or refreshing the document renderer.
    if(active>=0 && preview.parentElement!==panels[active])panels[active].append(preview);
    for(const [name,row] of rows) {
      const side=/^charBorder(Left|Right|Top|Bottom)\./.exec(name)?.[1];
      row.hidden=pageForField.get(name)!==active || !!side&&side!==edge;
      if (row.parentElement===lang) {
        const slot=/Language([0-6])$/.exec(name);
        const languageHidden=language.value==="all"?!!slot:slot?.[1]!==language.value;
        row.dataset.languageHidden=String(languageHidden);
        row.hidden ||= languageHidden;
      }
    }
    for(const panel of panels)for(const section of panel.querySelectorAll<HTMLElement>("fieldset"))section.hidden=false;
    for(const [name,palette]of colorPalettes){palette.row.hidden=rows.get(name)!.hidden;palette.setValue(controls.get(name)!.value);if(palette.row.hidden)palette.close(false);}
    for (const radio of shadowRadios) {
      radio.checked = shadowSource.value === radio.value;
      radio.disabled = shadowSource.disabled;
    }
    shadowKeep.disabled = shadowSource.disabled;
    shadowState.textContent = shadowSource.value === "" ? "기존 값 유지 · 혼합/미조회 포함"
      : shadowRadios.some(radio => radio.checked) ? ""
      : `현재 값 ${shadowSource.value} · 원본 유지`;
    for(const b of edgeButtons)b.setAttribute("aria-pressed",String(b.dataset.characterEdge===edge));
    const fontName=language.value==="all"?"fontFamily":`fontLanguage${language.value}`;
    for(const box of fontPreviews)box.hidden=box.dataset.fontField!==fontName;
    for(const {button,source,on,off} of proxies){button.dataset.valueState=source.dataset.valueState;
      if(source.value===""&&source.dataset.valueState==="unavailable")button.removeAttribute("aria-pressed");else button.setAttribute("aria-pressed",source.value===""?"mixed":String(off==="0"?source.value!=="0":source.value===on));}
  }
  // Run after the pre-existing group/tab listeners, including invalid-field
  // reveal. This changes presentation, never the captured target or drafts.
  nav.addEventListener("click",sync,options);language.addEventListener("change",sync,options);
  root.addEventListener("change",sync,options);sync();
  root.addEventListener("invalid", event=>{
    const name=(event.target as HTMLInputElement).name;
    const side=/^charBorder(Left|Right|Top|Bottom)\./.exec(name)?.[1];
    if(side){edge=side;sync();}
  },{...options,capture:true});
  root.addEventListener("keydown",event=>{
    if(event.defaultPrevented || !event.cancelable || event.isComposing || event.keyCode===229 || event.getModifierState("AltGraph") || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat)return;
    const active=tabs.findIndex(tab=>tab.getAttribute("aria-selected")==="true"),key=event.key.toLowerCase();
    if(key==="d") {event.preventDefault();dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();return;}
    if(active!==0&&active!==1)return;
    let name=(active===0?fieldBinding(basicFields,key):fieldBinding(extendedFields,key))?.[0] as string | undefined;
    if(active===0&&language.value!=="all"){
      if(name==="fontFamily")name=`fontLanguage${language.value}`;
      else if(name==="relativeSizes"||name==="ratios"||name==="spacings")name+=`Language${language.value}`;
    }
    if(active===1&&(name==="type"||name==="width"||name==="color"))name=`charBorder${edge}.${name}`;
    const palette=name?colorPalettes.get(name):undefined;
    const colorButton=palette?.row.querySelector<HTMLButtonElement>('[data-character-color]');
    const toggle=active===0 ? fieldBinding(basicToggles,key) : undefined;
    const target=toggle?proxies.find(p=>p.button.dataset.characterToggle===toggle)?.button:name==="dialogLanguage"?language:name?controls.get(name):undefined;
    const control=colorButton??target;
    if(active===1&&(name==="shadowColor"||name==="kerning")&&control&&!control.disabled)
      supplemental.open=true;
    if(palette&&colorButton&&!colorButton.disabled&&colorButton.getClientRects().length){event.preventDefault();event.stopPropagation();palette.open();return;}
    if(target&&!target.disabled&&target.getClientRects().length){event.preventDefault();if(toggle)(target as HTMLButtonElement).click();else target.focus();}
  },options);
}
