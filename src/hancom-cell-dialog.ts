import { sides } from './formatting.js';
import type { Props } from './model.js';
import { mountCellBorderPreview, type CellBorderPreview } from './cell-border-preview.js';
import { objectLinePalette } from './object-line-palette.js';
// UI1-TABLE-PROPERTIES-{EXISTING,MARGIN-CAPTION,TABLE,CELL} and
// UI1-CELL-BORDER-{EACH,BACKGROUND,DIAGONAL}. Presentation of existing cell drafts.
const lifetimes = new WeakMap<HTMLElement, AbortController>();
export function resetHancomCellDialog(root: HTMLElement) {
  lifetimes.get(root)?.abort(); lifetimes.delete(root);
  root.closest("dialog")?.querySelector(".cell-close")?.remove();
  root.closest("dialog")?.querySelector(".cell-scope-note")?.remove();
}
export type TablePaginationDisplay = {treatAsChar:boolean; pageBreak:0|1|2};

export function mountHancomCellDialog(root: HTMLElement, borderFirst = false, nestedOwner = false, blockScope = false, nestedValign = false, pagination?: TablePaginationDisplay, inspectOnly = false, preview?: CellBorderPreview) {
  const lifetime = new AbortController(); lifetimes.set(root, lifetime);
  const dialog = root.closest<HTMLDialogElement>("dialog")!;
  const rows = new Map([...root.querySelectorAll<HTMLElement>("label[data-field]")].map(r => [r.dataset.field!, r]));
  const controls = new Map([...rows].map(([name, row]) => [name, row.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!]));
  if(blockScope)for(const [name,control]of controls)if(name!=='background'&&!/^border(Left|Right|Top|Bottom)\./.test(name)){
    control.disabled=true;control.title='선택 범위의 바깥선과 단색 배경을 바꿀 수 있습니다.';
  }
  for (const [name, control] of controls) {
    if (inspectOnly || nestedValign && name !== "verticalAlign") {
      control.disabled = true;
      control.title = "이 중첩 셀의 속성은 조회할 수 있습니다.";
    }
  }
  const panels: HTMLElement[] = [];
  const borderOnly = borderFirst || blockScope;
  const outerAvailable = blockScope || preview?.length === 1 && !inspectOnly && !nestedValign;
  let page = 0, edge = blockScope ? "All" : "Left";
  const pageOf = new Map<string, number>();
  const nav = document.createElement("nav"), tabs = document.createElement("div");
  tabs.className = "cell-dialog-tabs"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "표/셀 속성 탭"); nav.append(tabs);
  function panel() { const p = document.createElement("section"); p.className = "cell-tab-panel"; p.setAttribute("role", "tabpanel"); return p; }
  for (let i = 0; i < (borderOnly ? 1 : 2); i++) panels.push(panel());
  const layout = panels[1] ?? panel();
  function group(p: HTMLElement, title: string, cls = "") {
    const f = document.createElement("fieldset"), l = document.createElement("legend");
    f.className = cls; l.textContent = title; f.append(l); p.append(f); return f;
  }
  function move(name: string, target: HTMLElement, at: number, caption?: string) {
    const row = rows.get(name); if (!row) return;
    target.append(row); pageOf.set(name, at);
    if (caption) { const span = row.querySelector("span"); if (span?.firstChild) span.firstChild.textContent = caption; }
  }
  function marginProxy(name: string, target: HTMLElement, caption: string) {
    move(name, target, 1); const source = controls.get(name) as HTMLInputElement;
    const row = rows.get(name)!; row.dataset.cellBacking = "true";
    const label = document.createElement("label"), text = document.createElement("span"), input = document.createElement("input");
    text.textContent = caption; input.type = "number"; input.min = "0"; input.max = String(327.67 * 25.4 / 72); input.step = "any";
    input.dataset.cellMargin = name; input.setAttribute("aria-label", `${caption} 안 여백 (mm)`);
    input.placeholder = source.placeholder || "혼합 / 유지"; input.disabled = source.disabled;
    input.dataset.valueState=source.dataset.valueState;input.dataset.mixed=source.dataset.mixed;
    input.title = source.title || "안 여백 (mm)";
    input.value = source.value === "" ? "" : (Number(source.value) * 25.4 / 72).toFixed(2);
    input.oninput = () => {
      source.value = input.value === "" ? "" : String(Math.round(Number(input.value) * 72 / 25.4 * 100) / 100);
      source.dispatchEvent(new Event("input", { bubbles: true }));
    };
    input.addEventListener("invalid", () => { page = 1; marginDetails.open = true; sync(); }, true);
    label.append(text, input, document.createTextNode("mm")); target.append(label);
  }
  const breaks = group(layout, "표 배치와 쪽 나누기", "cell-placement-controls");
  const inline = document.createElement("input");
  const pageBreak = document.createElement("select");
  if (!borderOnly && pagination) {
    const placement = document.createElement("label");
    inline.type = "checkbox";
    inline.checked = pagination.treatAsChar;
    inline.dataset.tablePagination = "inline";
    inline.disabled = nestedOwner;
    placement.append(inline, document.createTextNode("글자처럼 취급"));
    const boundary = document.createElement("label");
    pageBreak.dataset.tablePagination = "mode";
    pageBreak.setAttribute("aria-label", "쪽 경계에서");
    for (const [value, text] of ["나누지 않음", "셀 단위로 나눔", "행 단위로 나눔"].entries())
      pageBreak.add(new Option(text, String(value)));
    pageBreak.value = String(pagination.pageBreak);
    boundary.append(document.createTextNode("쪽 경계에서"), pageBreak);
    const detail = document.createElement("p");
    const syncPlacement = () => {
      pageBreak.disabled = nestedOwner || inline.checked;
      detail.textContent = nestedOwner ? "중첩 표의 배치를 조회할 수 있습니다."
        : inline.checked ? "표를 글자처럼 배치할 때는 쪽 나누기를 설정할 수 없습니다." : "";
      detail.hidden = !detail.textContent;
    };
    inline.onchange = syncPlacement;
    syncPlacement();
    breaks.append(placement, boundary, detail);
    detail.className = "cell-placement-note";
  }
  const marginDetails = document.createElement("details");
  marginDetails.className = "cell-margin-details";
  const marginSummary = document.createElement("summary");
  marginSummary.textContent = "안쪽 여백";
  marginDetails.append(marginSummary);
  const margins = group(marginDetails, "", "cell-margins");
  margins.querySelector("legend")!.remove();
  move("applyInnerMargin", margins, 1, "안 여백 지정");
  const apply = controls.get("applyInnerMargin") as HTMLSelectElement;
  rows.get("applyInnerMargin")!.dataset.cellBacking = "true";
  const applyLabel = document.createElement("label"), applyProxy = document.createElement("input"); applyProxy.type = "checkbox"; applyProxy.dataset.cellInnerMargin = "true";
  applyProxy.onchange = () => { apply.value = String(applyProxy.checked); apply.dispatchEvent(new Event("change", { bubbles: true })); };
  applyLabel.className = "cell-inner-toggle"; applyLabel.append(applyProxy, document.createTextNode("안 여백 지정")); margins.append(applyLabel);
  for (const [side, label] of [["Left", "왼쪽"], ["Top", "위쪽"], ["Right", "오른쪽"], ["Bottom", "아래쪽"]]) marginProxy("padding" + side, margins, label);
  const properties = group(layout, "셀 속성", "cell-properties");
  layout.append(marginDetails);
  move("verticalAlign", properties, 1); rows.get("verticalAlign")!.dataset.cellBacking = "true";
  const align = controls.get("verticalAlign") as HTMLSelectElement, aligns = document.createElement("div"); aligns.className = "cell-aligns";
  const alignTitle = document.createElement("span"); alignTitle.textContent = "세로 정렬"; aligns.append(alignTitle);
  const alignButtons: HTMLButtonElement[] = [];
  for (const [value, label] of [["0", "위"], ["1", "가운데"], ["2", "아래"]]) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.cellAlign = value; b.setAttribute("aria-label", `세로 ${label} 정렬`); b.title = `세로 ${label} 정렬`;
    const icon = document.createElement("span"); icon.className = `cell-align-icon cell-align-${value}`; icon.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) icon.append(document.createElement("i")); b.append(icon); b.onclick = () => { align.value = value; align.dispatchEvent(new Event("change", { bubbles: true })); }; aligns.append(b); alignButtons.push(b);
  }
  properties.append(aligns);
  // The actual visible proxies, rather than their hidden backing inputs, own
  // the adjacent admission explanation. No setter/default value is changed.
  const marginReason=document.createElement("small"),alignReason=document.createElement("small");
  marginReason.id="cell-margin-reason";alignReason.id="cell-align-reason";
  for(const note of [marginReason,alignReason])note.className="ui2-field-reason";
  margins.append(marginReason);aligns.append(alignReason);
  applyProxy.setAttribute("aria-describedby",marginReason.id);
  for(const input of margins.querySelectorAll<HTMLInputElement>("[data-cell-margin]"))input.setAttribute("aria-describedby",marginReason.id);
  for(const b of alignButtons)b.setAttribute("aria-describedby",alignReason.id);
  const palettes = new Map<string, ReturnType<typeof objectLinePalette>>();
  function setDraft(control: HTMLInputElement | HTMLSelectElement, value: string) {
    if (control instanceof HTMLSelectElement && ![...control.options].some(option => option.value === value))
      control.add(new Option(value, value));
    control.value = value;
  }
  function colorProxy(name: string, parent: HTMLElement, caption: string, label: string, at: number) {
    move(name, parent, at, caption);
    const backing = controls.get(name)!, row = rows.get(name)!;
    row.dataset.cellBacking = 'true';
    const palette = objectLinePalette(backing.value, lifetime.signal, {
      id: 'cell-color-' + name.replace('.', '-') + '-popup', label, caption,
      keep: true, allowNone: name === 'background', boundary: root,
      onChange: value => {
        setDraft(backing, value);
        backing.dispatchEvent(new Event('change', {bubbles: true}));
      }
    });
    palette.row.classList.add('cell-color-palette'); palette.row.dataset.cellColorRow = name;
    const trigger = palette.row.querySelector<HTMLButtonElement>('[data-object-line-color]')!;
    delete trigger.dataset.objectLineColor; trigger.dataset.cellColor = name;
    trigger.disabled = backing.disabled; trigger.title = backing.disabled ? backing.title : label;
    parent.append(palette.row); palettes.set(name, palette);
  }
  const border = group(panels[0], "테두리", "cell-border-controls");
  const editor = document.createElement("div");
  editor.className = "cell-border-editor";
  const lineSamples: Record<string, string> = {"1":"━━━━━", "2":"━ ━ ━", "3":"·······"};
  const borderInitial = new Map<string, string>();
  for (const [name, control] of controls) {
    if (name === "background" || name.startsWith("border")) borderInitial.set(name, control.value);
    if (name.endsWith(".type") && control instanceof HTMLSelectElement)
      for (const option of control.options)
        if (lineSamples[option.value]) option.text += "  " + lineSamples[option.value];
  }
  const edges = document.createElement("div"); edges.className = "cell-edge-picker"; const edgeButtons: HTMLButtonElement[] = [];
  for (const [side, label] of [["Left", "왼쪽"], ["Right", "오른쪽"], ["Top", "위쪽"], ["Bottom", "아래쪽"]]) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.cellEdge = side; b.textContent = label;
    b.onclick = () => { edge = side; sync(); }; edges.append(b); edgeButtons.push(b);
    for (const [key, text] of [["type", "선 모양"], ["width", "굵기"]]) move(`border${side}.${key}`, editor, 0, text);
    colorProxy(`border${side}.color`, editor, '색', `${label} 테두리 색`, 0);
  }
  const allBorders = outerAvailable ? document.createElement("div") : undefined;
  const allSelectors = new Map<string, HTMLSelectElement>();
  const sideFields = (key: string) => sides.map(side => controls.get(`border${side}.${key}`)!);
  const commonValue = (key: string) => {
    const fields = sideFields(key);
    return fields.every(field => field.value === fields[0].value) ? fields[0].value : "";
  };
  const setOuterDraft = (key: string, value: string) => {
    const fields = sideFields(key);
    if (!value || fields.some(field => field.disabled)) return;
    for (const field of fields) setDraft(field, value);
    // These fields are read together by the existing block-scope apply command.
  };
  if (allBorders) {
    const button = document.createElement("button");
    button.type = "button"; button.dataset.cellEdge = "All"; button.textContent = "바깥 전체";
    button.onclick = () => { edge = "All"; sync(); };
    edges.prepend(button); edgeButtons.push(button);
    allBorders.className = "cell-border-all-controls";
    for (const [key, caption] of [["type", "선 모양"], ["width", "굵기"]]) {
      const row = document.createElement("label"), label = document.createElement("span"), select = document.createElement("select");
      label.textContent = caption; select.dataset.cellOuter = key;
      select.setAttribute("aria-label", caption);
      const mixed = new Option("혼합 / 유지", ""); mixed.disabled = true;
      select.add(mixed);
      for (const option of (sideFields(key)[0] as HTMLSelectElement).options)
        if (option.value && !option.text.startsWith("현재:")) select.add(new Option(option.text, option.value));
      select.onchange = () => setOuterDraft(key, select.value);
      row.append(label, select); allBorders.append(row); allSelectors.set(key, select);
    }
    editor.append(allBorders);
  }
  const allPalette = allBorders && objectLinePalette(commonValue("color"), lifetime.signal, {
    id: "cell-color-outer-popup", label: "바깥 전체 테두리 색", caption: "색", boundary: root,
    onChange: value => { setOuterDraft("color", value); sync(); },
  });
  if (allPalette && allBorders) {
    allPalette.row.classList.add("cell-color-palette");
    const trigger = allPalette.row.querySelector<HTMLButtonElement>("[data-object-line-color]")!;
    delete trigger.dataset.objectLineColor;
    trigger.dataset.cellColor = "outer";
    allBorders.append(allPalette.row);
  }
  const sample = document.createElement("figure");
  sample.className = "cell-border-sample";
  const caption = document.createElement("figcaption");
  caption.textContent = "적용 미리보기";
  sample.append(caption);
  const renderPreview = mountCellBorderPreview(sample, preview);
  border.append(edges, editor, sample);
  const background = group(panels[0], "배경");
  colorProxy("background", background, "배경색", "셀 배경 면 색", 0);
  const note = document.createElement("p"); note.className = "cell-scope-note"; note.textContent = "선택한 셀에 바꾼 항목만 적용합니다.";
  note.hidden = !blockScope && !inspectOnly;
  if (inspectOnly) note.textContent = "중첩 표에서 선택한 셀의 속성을 보고 있습니다.";
  if(blockScope)note.textContent='선택 범위의 안쪽 선은 유지됩니다. 이웃 셀과 맞닿은 선은 양쪽에서 함께 바뀝니다.';
  for(const p of panels)for(const f of p.querySelectorAll<HTMLFieldSetElement>('fieldset'))
    if(!f.querySelector('input,select,button,output,[data-table-pagination]'))f.hidden=true;
  root.replaceChildren(nav, ...panels);
  // Keep admission/preservation guidance visible beside the action buttons,
  // without adding another footer row to the captured native window height.
  dialog.querySelector("form")!.append(note);
  const close = document.createElement("button"); close.type = "button"; close.className = "cell-close"; close.setAttribute("aria-label", "표/셀 대화상자 닫기"); close.textContent = "×"; close.onclick = () => dialog.querySelector<HTMLButtonElement>("#cancel")!.click(); root.before(close);
  const tabButtons = panels.length === 1 ? [] : ["테두리·배경", "표·셀 배치"].map((label, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.textContent = label;
    tab.setAttribute("role", "tab");
    tab.id = index === 0 ? "cell-border-tab-0" : "cell-properties-tab-1";
    tab.onclick = () => { page = index; sync(); };
    tab.onkeydown = event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
          event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      event.preventDefault();
      const next = tabButtons[event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index];
      next.click();
      next.focus();
    };
    panels[index].id = tab.id + "-panel";
    tab.setAttribute("aria-controls", panels[index].id);
    panels[index].setAttribute("aria-labelledby", tab.id);
    tabs.append(tab);
    return tab;
  });
  nav.hidden = !tabButtons.length;
  if (!tabButtons.length) panels[0].removeAttribute("role");
  dialog.querySelector("#format-title")!.textContent = borderOnly
    ? blockScope ? "셀 테두리/배경 · 하나의 셀처럼" : "셀 테두리/배경"
    : "표/셀 속성";
  function sync() {
    dialog.dataset.cellPage = borderOnly ? "border" : "properties";
    dialog.dataset.cellScope = blockScope ? "block" : "each";
    tabButtons.forEach((tab, index) => {
      const active = index === page;
      tab.setAttribute("aria-selected", String(active));
      (tab as HTMLElement).tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel, i) => panel.hidden = page !== i);
    for (const [name, row] of rows) {
      const side = /^border(Left|Right|Top|Bottom)\./.exec(name)?.[1];
      row.hidden = pageOf.get(name) !== page || !!side && side !== edge;
    }
    for (const [name, palette] of palettes) {
      palette.row.hidden = rows.get(name)!.hidden; palette.setValue(controls.get(name)!.value);
      if (palette.row.hidden) palette.close(false);
    }
    if (allBorders && allPalette) {
      allBorders.hidden = page !== 0 || edge !== "All";
      for (const [key, select] of allSelectors) {
        const value = commonValue(key);
        select.value = [...select.options].some(option => option.value === value) ? value : "";
        select.disabled = sideFields(key).some(field => field.disabled);
      }
      allPalette.setValue(commonValue("color"));
      allPalette.row.querySelector<HTMLButtonElement>('[data-cell-color="outer"]')!.disabled =
        sideFields("color").some(field => field.disabled);
      if (allBorders.hidden) allPalette.close(false);
    }
    applyProxy.checked = apply.value === "true"; applyProxy.indeterminate = apply.value === ""; applyProxy.disabled = apply.disabled; applyProxy.title = apply.title;
    applyProxy.dataset.valueState=apply.dataset.valueState;applyProxy.dataset.mixed=apply.dataset.mixed;
    const marginWhy=apply.disabled?(apply.title):
      apply.value!=="true"?`${apply.value===""?(apply.dataset.valueState==="mixed"?"셀마다 안 여백 설정이 다릅니다.":"안 여백 설정을 읽을 수 없습니다."):"안 여백 지정이 꺼져 있습니다."} 안 여백을 바꾸려면 지정을 켜세요.`:"";
    const alignWhy=align.disabled?(align.title):align.value===""?`세로 정렬이 ${align.dataset.valueState==="mixed"?"혼합":"미조회"}입니다. 명시적으로 선택하기 전에는 유지됩니다.`:"";
    for(const [note,text]of [[marginReason,marginWhy],[alignReason,alignWhy]] as const){if(note.textContent!==text)note.textContent=text;note.hidden=!text;}
    for (const input of root.querySelectorAll<HTMLInputElement>("[data-cell-margin]")) input.disabled = controls.get(input.dataset.cellMargin!)!.disabled || apply.value !== "true";
    for (const b of alignButtons) { b.disabled = align.disabled; b.title = align.title || b.getAttribute("aria-label")!;b.dataset.valueState=align.dataset.valueState;
      if(align.value===""&&align.dataset.valueState==="unavailable")b.removeAttribute("aria-pressed");else b.setAttribute("aria-pressed", align.value === "" ? "mixed" : String(b.dataset.cellAlign === align.value)); }
    for (const b of edgeButtons) b.setAttribute("aria-pressed", String(b.dataset.cellEdge === edge));
    if (page === 0) {
      const delta: Props = {};
      for (const [name, initial] of borderInitial) {
        const control = controls.get(name)!;
        if (!control.disabled && control.value && control.value !== initial)
          delta[name] = /\.(type|width)$/.test(name) ? Number(control.value) : control.value;
      }
      renderPreview(delta);
    }
  }
  root.addEventListener("change", sync, { signal: lifetime.signal });
  root.addEventListener("invalid", event => { const name = (event.target as HTMLInputElement).name, at = pageOf.get(name); if (at !== undefined) { page = at; if (name.startsWith("padding")) marginDetails.open = true; const side = /^border(Left|Right|Top|Bottom)\./.exec(name)?.[1]; if (side) edge = side; sync(); } }, { capture: true, signal: lifetime.signal });
  dialog.addEventListener("keydown", e => { if (e.isComposing || e.keyCode === 229 || e.getModifierState("AltGraph") || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return; if (e.key.toLowerCase() === "d") { e.preventDefault(); dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); } }, { signal: lifetime.signal });
  sync();
  return {
    readPlacement() {
      if (borderOnly || nestedOwner || !pagination) return;
      const treatAsChar = inline.checked;
      const next = Number(pageBreak.value);
      if (next !== 0 && next !== 1 && next !== 2) throw Error("표의 쪽 나누기 방식을 선택하세요.");
      if (treatAsChar !== pagination.treatAsChar || !treatAsChar && next !== pagination.pageBreak)
        return {treatAsChar, pageBreak: next};
    },
  };
}
