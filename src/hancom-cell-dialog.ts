import { objectLinePalette } from './object-line-palette.js';
// UI1-TABLE-PROPERTIES-{EXISTING,MARGIN-CAPTION,TABLE,CELL} and
// UI1-CELL-BORDER-{EACH,BACKGROUND,DIAGONAL}. Presentation of existing cell drafts.
const lifetimes = new WeakMap<HTMLElement, AbortController>();
export function resetHancomCellDialog(root: HTMLElement) {
  lifetimes.get(root)?.abort(); lifetimes.delete(root);
  root.closest("dialog")?.querySelector(".cell-close")?.remove();
  root.closest("dialog")?.querySelector(".cell-scope-note")?.remove();
}
export function mountHancomCellDialog(root: HTMLElement, borderFirst = false, nestedOwner = false, blockScope = false, nestedValign = false) {
  const lifetime = new AbortController(); lifetimes.set(root, lifetime);
  const dialog = root.closest<HTMLDialogElement>("dialog")!;
  const rows = new Map([...root.querySelectorAll<HTMLElement>("label[data-field]")].map(r => [r.dataset.field!, r]));
  const controls = new Map([...rows].map(([name, row]) => [name, row.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!]));
  if(blockScope)for(const [name,control]of controls)if(name!=='background'&&!/^border(Left|Right|Top|Bottom)\./.test(name)){
    control.disabled=true;control.title='선택 범위의 바깥선과 단색 배경을 바꿀 수 있습니다.';
  }
  // Existing Command rejects layout changes for nested owners. Reflect that
  // admission here, while keeping supported border/background drafts available.
  if (nestedValign) for (const [name,control] of controls) if (name!=="verticalAlign") {
    control.disabled=true;control.title="중첩 셀에서는 세로 정렬만 바꿀 수 있습니다.";
  }
  if (nestedOwner && !nestedValign) for (const name of ["verticalAlign", "applyInnerMargin", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom"]) {
    controls.get(name)!.disabled = true;
    controls.get(name)!.title = "표 안의 표에서는 안 여백과 세로 정렬을 바꿀 수 없습니다.";
  }
  const pages: HTMLElement[] = [], borderPages: HTMLElement[] = [];
  let mode = borderFirst, page = 3, borderPage = 0, edge = "Left";
  const pageOf = new Map<string, number>();
  const nav = document.createElement("nav"), tabs = document.createElement("div");
  tabs.className = "cell-dialog-tabs"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "표/셀 속성 탭"); nav.append(tabs);
  function panel() { const p = document.createElement("section"); p.className = "cell-tab-panel"; p.setAttribute("role", "tabpanel"); return p; }
  for (let i = 0; i < 4; i++) pages.push(panel());
  for (let i = 0; i < 3; i++) borderPages.push(panel());
  function group(p: HTMLElement, title: string, cls = "") {
    const f = document.createElement("fieldset"), l = document.createElement("legend");
    f.className = cls; l.textContent = title; f.append(l); p.append(f); return f;
  }
  function unsupported(target: HTMLElement, text: string, type = "checkbox") {
    // Studio's wider dialog is a reference, not an Edit capability. Do not
    // present disconnected controls as if they could be enabled here.
    target.dataset.omittedUnsupported = [target.dataset.omittedUnsupported, text].filter(Boolean).join(' / ');
  }
  function move(name: string, target: HTMLElement, at: number, caption?: string) {
    const row = rows.get(name); if (!row) return;
    target.append(row); pageOf.set(name, at);
    if (caption) { const span = row.querySelector("span"); if (span?.firstChild) span.firstChild.textContent = caption; }
  }
  function marginProxy(name: string, target: HTMLElement, caption: string) {
    move(name, target, 3); const source = controls.get(name) as HTMLInputElement;
    const row = rows.get(name)!; row.dataset.cellBacking = "true";
    const label = document.createElement("label"), text = document.createElement("span"), input = document.createElement("input");
    text.textContent = caption; input.type = "number"; input.min = "0"; input.max = String(327.67 * 25.4 / 72); input.step = "any";
    input.dataset.cellMargin = name; input.setAttribute("aria-label", `${caption} 안 여백 (mm)`);
    input.placeholder = source.placeholder || "혼합 / 유지"; input.disabled = source.disabled;
    input.dataset.valueState=source.dataset.valueState;input.dataset.mixed=source.dataset.mixed;
    input.title = source.title || "mm 표시 · 변경할 때 기존 0.01pt 정밀도로 적용 · 미변경 값 유지";
    input.value = source.value === "" ? "" : (Number(source.value) * 25.4 / 72).toFixed(2);
    if (!source.disabled && source.value !== "") input.title += ` · 원래 값 ${source.value}pt`;
    input.oninput = () => {
      source.value = input.value === "" ? "" : String(Math.round(Number(input.value) * 72 / 25.4 * 100) / 100);
      source.dispatchEvent(new Event("input", { bubbles: true }));
    };
    input.addEventListener("invalid", () => { mode = false; page = 3; sync(); }, true);
    label.append(text, input, document.createTextNode("mm")); target.append(label);
  }
  const size = group(pages[0], "크기", "cell-table-size"); unsupported(size, "너비 (mm)", "number"); unsupported(size, "높이 (mm)", "number"); unsupported(size, "크기 고정");
  const position = group(pages[0], "위치"); unsupported(position, "글자처럼 취급");
  for (const name of ["본문과의 배치", "가로 위치", "세로 위치", "쪽 영역 안으로 제한", "서로 겹침 허용", "개체와 조판부호를 항상 같은 쪽에 놓기"]) unsupported(position, name);
  const rotation = group(pages[0], "개체 회전 · 기울이기"); unsupported(rotation, "회전각", "number"); unsupported(rotation, "가로/세로", "number");
  const other = group(pages[0], "기타"); unsupported(other, "번호 종류", "text"); unsupported(other, "개체 보호하기");
  const outer = group(pages[1], "바깥 여백"); for (const n of ["왼쪽", "위쪽", "오른쪽", "아래쪽"]) unsupported(outer, n + " (mm)", "number");
  const caption = group(pages[1], "캡션"); for (const n of ["위치", "크기 (mm)", "개체와의 간격 (mm)"]) unsupported(caption, n, "text"); unsupported(caption, "여백 부분까지 너비 확대"); unsupported(caption, "한 줄로 입력");
  const breaks = group(pages[2], "여러 쪽 지원");
  for (const n of ["나눔", "셀 단위로 나눔", "나누지 않음", "제목 줄 자동 반복", "자동으로 나뉜 표의 경계선 설정"]) unsupported(breaks, n);
  const common = group(pages[2], "모든 셀의 안 여백"); for (const n of ["왼쪽", "위쪽", "오른쪽", "아래쪽"]) unsupported(common, n + " (mm)", "number");
  const cellSize = group(pages[3], "셀 크기", "cell-size"); unsupported(cellSize, "셀 크기 적용"); unsupported(cellSize, "너비 (mm)", "number"); unsupported(cellSize, "높이 (mm)", "number");
  const margins = group(pages[3], "안 여백 지정", "cell-margins"); move("applyInnerMargin", margins, 3, "안 여백 지정");
  const apply = controls.get("applyInnerMargin") as HTMLSelectElement;
  rows.get("applyInnerMargin")!.dataset.cellBacking = "true";
  const applyLabel = document.createElement("label"), applyProxy = document.createElement("input"); applyProxy.type = "checkbox"; applyProxy.dataset.cellInnerMargin = "true";
  applyProxy.onchange = () => { apply.value = String(applyProxy.checked); apply.dispatchEvent(new Event("change", { bubbles: true })); };
  applyLabel.className = "cell-inner-toggle"; applyLabel.append(applyProxy, document.createTextNode("안 여백 지정")); margins.append(applyLabel);
  for (const [side, label] of [["Left", "왼쪽"], ["Top", "위쪽"], ["Right", "오른쪽"], ["Bottom", "아래쪽"]]) marginProxy("padding" + side, margins, label);
  const properties = group(pages[3], "속성", "cell-properties");
  for (const n of ["한 줄로 입력", "셀 보호", "제목 셀", "세로쓰기"]) unsupported(properties, n);
  move("verticalAlign", properties, 3); rows.get("verticalAlign")!.dataset.cellBacking = "true";
  const align = controls.get("verticalAlign") as HTMLSelectElement, aligns = document.createElement("div"); aligns.className = "cell-aligns";
  const alignTitle = document.createElement("span"); alignTitle.textContent = "세로 정렬"; aligns.append(alignTitle);
  const alignButtons: HTMLButtonElement[] = [];
  for (const [value, label] of [["0", "위"], ["1", "가운데"], ["2", "아래"]]) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.cellAlign = value; b.setAttribute("aria-label", `세로 ${label} 정렬`); b.title = `세로 ${label} 정렬`;
    const icon = document.createElement("span"); icon.className = `cell-align-icon cell-align-${value}`; icon.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) icon.append(document.createElement("i")); b.append(icon); b.onclick = () => { align.value = value; align.dispatchEvent(new Event("change", { bubbles: true })); }; aligns.append(b); alignButtons.push(b);
  }
  properties.append(aligns); const field = group(pages[3], "필드"); unsupported(field, "필드 이름", "text"); unsupported(field, "양식 모드에서 편집 가능");
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
  function colorProxy(name: string, parent: HTMLElement, caption: string, label: string, at: number) {
    move(name, parent, at, caption);
    const backing = controls.get(name)!, row = rows.get(name)!;
    row.dataset.cellBacking = 'true';
    const palette = objectLinePalette(backing.value, lifetime.signal, {
      id: 'cell-color-' + name.replace('.', '-') + '-popup', label, caption,
      keep: true, allowNone: name === 'background',
      onChange: value => {
        if (backing instanceof HTMLSelectElement && ![...backing.options].some(o => o.value === value))
          backing.add(new Option(value, value));
        backing.value = value;
        backing.dispatchEvent(new Event('change', {bubbles: true}));
      }
    });
    palette.row.classList.add('cell-color-palette'); palette.row.dataset.cellColorRow = name;
    const trigger = palette.row.querySelector<HTMLButtonElement>('[data-object-line-color]')!;
    delete trigger.dataset.objectLineColor; trigger.dataset.cellColor = name;
    trigger.disabled = backing.disabled; trigger.title = backing.disabled ? backing.title : label;
    parent.append(palette.row); palettes.set(name, palette);
  }
  const border = group(borderPages[0], "테두리", "cell-border-controls");
  const edges = document.createElement("div"); edges.className = "cell-edge-picker"; const edgeButtons: HTMLButtonElement[] = [];
  for (const [side, label] of [["Left", "왼쪽"], ["Right", "오른쪽"], ["Top", "위쪽"], ["Bottom", "아래쪽"]]) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.cellEdge = side; b.textContent = label;
    b.onclick = () => { edge = side; sync(); }; edges.append(b); edgeButtons.push(b);
    for (const [key, text] of [["type", "종류"], ["width", "굵기"]]) move(`border${side}.${key}`, border, 4, text);
    colorProxy(`border${side}.color`, border, '색', `${label} 테두리 색`, 4);
  }
  border.append(edges);
  const sample = document.createElement("div"); sample.className = "cell-border-sample"; sample.setAttribute("aria-label", "셀 테두리·단색 배치 예시 · 실제 문서 미리보기 아님"); border.append(sample);
  const background = group(borderPages[1], "채우기"); colorProxy("background", background, "면 색", "셀 배경 면 색", 5);
  for (const n of ["무늬 색", "무늬 모양", "그라데이션", "그림", "워터마크 효과"]) unsupported(background, n);
  const diagonal = group(borderPages[2], "대각선"); for (const n of ["종류", "굵기", "색", "\\ 대각선", "/ 대각선", "+ 중심선"]) unsupported(diagonal, n);
  const switcher = document.createElement("button"); switcher.type = "button"; switcher.className = "cell-dialog-switch";
  switcher.onclick = () => { mode = !mode; sync(); tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(); };
  if(blockScope){switcher.disabled=true;switcher.title='여러 셀의 바깥선과 배경을 바꾸는 화면입니다.';}
  const note = document.createElement("p"); note.className = "cell-scope-note"; note.textContent = "선택한 셀에 바꾼 항목만 적용합니다.";
  if(blockScope)note.textContent='선택한 범위의 바깥선과 단색 배경을 바꿉니다. 안쪽 선은 유지됩니다.';
  for(const p of [...pages,...borderPages])for(const f of p.querySelectorAll<HTMLFieldSetElement>('fieldset'))
    if(!f.querySelector('input,select,button,output'))f.hidden=true;
  root.replaceChildren(nav, ...pages, ...borderPages, switcher);
  // Keep admission/preservation guidance visible beside the action buttons,
  // without adding another footer row to the captured native window height.
  dialog.querySelector("form")!.append(note);
  const close = document.createElement("button"); close.type = "button"; close.className = "cell-close"; close.setAttribute("aria-label", "표/셀 대화상자 닫기"); close.textContent = "×"; close.onclick = () => dialog.querySelector<HTMLButtonElement>("#cancel")!.click(); dialog.querySelector("form")!.append(close);
  function sync() {
    dialog.dataset.cellPage = mode ? "border" : "properties";
    dialog.dataset.cellScope=blockScope?'block':'each';
    dialog.querySelector("#format-title")!.textContent = mode ? (blockScope?'셀 테두리/배경 · 하나의 셀처럼':'셀 테두리/배경') : "표/셀 속성";
    const indices = mode ? [0, 1] : [3];
    const labels = mode ? ["테두리", "배경"] : ["셀"];
    if (tabs.dataset.mode !== String(mode)) {
      tabs.replaceChildren(); tabs.dataset.mode = String(mode);
      labels.forEach((text, ordinal) => {
        const i = indices[ordinal];
        const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.setAttribute("role", "tab"); b.id = `cell-${mode ? "border" : "properties"}-tab-${i}`;
        b.onclick = () => { if (mode) borderPage = i; else page = i; sync(); };
        b.onkeydown = e => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
          e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? labels.length - 1 : (ordinal + (e.key === "ArrowLeft" ? -1 : 1) + labels.length) % labels.length;
          (tabs.children[next] as HTMLButtonElement).click(); (tabs.children[next] as HTMLElement).focus();
        }; tabs.append(b);
      });
    }
    [...tabs.children].forEach((b, ordinal) => { const i=indices[ordinal], active = i === (mode ? borderPage : page), p = (mode ? borderPages : pages)[i]; b.setAttribute("aria-selected", String(active)); (b as HTMLElement).tabIndex = active ? 0 : -1; p.id = b.id + "-panel"; b.setAttribute("aria-controls", p.id); p.setAttribute("aria-labelledby", b.id); });
    pages.forEach((p, i) => p.hidden = mode || page !== i); borderPages.forEach((p, i) => p.hidden = !mode || borderPage !== i);
    for (const [name, row] of rows) { const side = /^border(Left|Right|Top|Bottom)\./.exec(name)?.[1]; row.hidden = pageOf.get(name) !== (mode ? borderPage + 4 : page) || !!side && side !== edge; }
    for (const [name, palette] of palettes) {
      palette.row.hidden = rows.get(name)!.hidden; palette.setValue(controls.get(name)!.value);
      if (palette.row.hidden) palette.close(false);
    }
    applyProxy.checked = apply.value === "true"; applyProxy.indeterminate = apply.value === ""; applyProxy.disabled = apply.disabled; applyProxy.title = apply.title;
    applyProxy.dataset.valueState=apply.dataset.valueState;applyProxy.dataset.mixed=apply.dataset.mixed;
    const marginWhy=apply.disabled?(apply.title):
      apply.value!=="true"?`${apply.value===""?(apply.dataset.valueState==="mixed"?"안 여백 지정이 혼합입니다.":"안 여백 지정이 미조회입니다."):"안 여백 지정이 꺼져 있습니다."} 여백을 바꾸려면 안 여백 지정을 켜세요. 미변경 값은 유지됩니다.`:"";
    const alignWhy=align.disabled?(align.title):align.value===""?`세로 정렬이 ${align.dataset.valueState==="mixed"?"혼합":"미조회"}입니다. 명시적으로 선택하기 전에는 유지됩니다.`:"";
    for(const [note,text]of [[marginReason,marginWhy],[alignReason,alignWhy]] as const){if(note.textContent!==text)note.textContent=text;note.hidden=!text;}
    for (const input of root.querySelectorAll<HTMLInputElement>("[data-cell-margin]")) input.disabled = controls.get(input.dataset.cellMargin!)!.disabled || apply.value !== "true";
    for (const b of alignButtons) { b.disabled = align.disabled; b.title = align.title || b.getAttribute("aria-label")!;b.dataset.valueState=align.dataset.valueState;
      if(align.value===""&&align.dataset.valueState==="unavailable")b.removeAttribute("aria-pressed");else b.setAttribute("aria-pressed", align.value === "" ? "mixed" : String(b.dataset.cellAlign === align.value)); }
    for (const b of edgeButtons) b.setAttribute("aria-pressed", String(b.dataset.cellEdge === edge));
    for (const side of ["Left", "Right", "Top", "Bottom"]) {
      const type = controls.get(`border${side}.type`)!.value, color = controls.get(`border${side}.color`)!.value;
      const widths = [.1, .12, .15, .2, .25, .3, .4, .5, .6, .7, 1, 1.5, 2, 3, 4, 5];
      const width = controls.get(`border${side}.width`)!.value;
      sample.style.setProperty(`border-${side.toLowerCase()}`, type === "0" ? "none" : `${width === "" ? .1 : widths[Number(width)]}mm ${{"1":"solid","2":"dotted","3":"dashed"}[type] || "solid"} ${/^#[\da-f]{6}$/i.test(color) ? color : "#aaa"}`);
    }
    const bg = controls.get("background")!.value; sample.style.background = /^#[\da-f]{6}$/i.test(bg) ? bg : "white";
    switcher.textContent = mode ? "표/셀 속성…" : "셀 테두리/배경…";
  }
  root.addEventListener("change", sync, { signal: lifetime.signal });
  root.addEventListener("invalid", event => { const name = (event.target as HTMLInputElement).name, at = pageOf.get(name); if (at !== undefined) { mode = at > 3; if (mode) borderPage = at - 4; else page = at; const side = /^border(Left|Right|Top|Bottom)\./.exec(name)?.[1]; if (side) edge = side; sync(); } }, { capture: true, signal: lifetime.signal });
  dialog.addEventListener("keydown", e => { if (e.isComposing || e.keyCode === 229 || e.getModifierState("AltGraph") || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return; if (e.key.toLowerCase() === "d") { e.preventDefault(); dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); } }, { signal: lifetime.signal });
  sync();
}
