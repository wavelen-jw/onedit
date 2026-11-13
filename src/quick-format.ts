import {selectNumericDraftOnClick} from "./numeric-draft-selection.js";
import { activeWorkset } from "./active-workset.js";
import { publishEditorDisplay, readEditorDisplay } from "./editor-state-coordinator.js";
import {mountEditableCombo} from './editable-combo.js';
import {toolbarFormContains} from './toolbar-form-view.js';
import {documentFontNames} from './font-provider.js';
import {fontChoiceGroups} from './integration/a-font-availability.js';
import {readFormatPresentation, readPassiveFormatPresentation} from './typing-format-presentation.js';
import { mountTextColorSplit } from "./text-color-split.js";
import { fontActionFailure, fontSupply, ensureFont, allFontSupply, retryFailedFontSupply } from "./font-provider.js";
import type { Interaction } from "./interaction.js";
import type { Props } from "./model.js";
import { languages, toCoreCharacter, toCoreParagraph, type FormatState } from "./formatting.js";
import { formatMenuItems, formatMenuState, type CatalogCommand } from "./integration/a-format-menu.js";
import { fontSuggestions, fontStatus } from "./integration/a-font-availability.js";
import { formatInputGuard, sameFormatTarget } from "./integration/a-format-input-guard.js";
import { formatValueState, formatValueHint, markFormatValue, formatToggleState, markFormatToggle } from "./format-value-state.js";

export function quickFormatDelta(scope: string, initial: {font: string; size: string; color?: string; tracking?: string}, draft: typeof initial): Props {
  if (scope !== "all" && !/^[0-6]$/.test(scope)) throw Error("지원하는 언어를 선택하세요.");
  const out: Props = {};
  if (draft.font && draft.font !== initial.font) {
    if (!draft.font.trim() || draft.font.length > 200 || /[\x00-\x1f]/.test(draft.font)) throw Error("글꼴 이름을 확인하세요.");
    out[scope === "all" ? "fontFamily" : `fontLanguage${scope}`] = draft.font;
  }
  if (draft.size && draft.size !== initial.size) {
    const value = Number(draft.size);
    if (!Number.isFinite(value) || value < 1 || value > 200) throw Error("글자 크기는 1~200pt로 입력하세요.");
    out.fontSize = value;
  }
  if (draft.tracking && draft.tracking !== initial.tracking) {
    const value = Number(draft.tracking);
    if (!/^[+-]?\d+$/.test(draft.tracking) || !Number.isSafeInteger(value) || value < -100 || value > 100)
      throw Error("자간은 -100~100%의 정수로 입력하세요.");
    if (!initial.tracking || value !== Number(initial.tracking)) out.spacings = value;
  }
  if (draft.color && draft.color.toLowerCase() !== initial.color?.toLowerCase()) {
    if (!/^#[\da-f]{6}$/i.test(draft.color)) throw Error("글자색은 #RRGGBB로 입력하세요.");
    out.textColor = draft.color.toLowerCase();
  }
  return toCoreCharacter(out);
}

export const quickSpacingTypes = [
  ["Percent", "글자에 따라 (%)"], ["Fixed", "고정값 (pt)"],
  ["Minimum", "최소 (pt)"], ["SpaceOnly", "여백만 (pt)"],
] as const;
export function quickSpacingDelta(initial: {type: string; value: string}, draft: typeof initial): Props {
  if (draft.type === initial.type && draft.value === initial.value) return {};
  if (draft.type === initial.type && !draft.value) return {};
  if (!draft.type && !draft.value) return {};
  if (!quickSpacingTypes.some(([type]) => type === draft.type)) throw Error("줄 간격 방식을 선택하세요.");
  if (!draft.value || !Number.isFinite(Number(draft.value)) || Number(draft.value) < 1 || Number(draft.value) > 1000)
    throw Error("줄 간격은 1~1000으로 입력하세요. 방식 변경 후 값을 다시 입력하세요.");
  return toCoreParagraph({lineSpacingType: draft.type, lineSpacing: Number(draft.value)});
}

/** Only the non-live spacing suffix can omit a repeat write. Titles,
 * controls and live-region notifications retain their original sinks. */
export function qaSpacingSuffixFlag(url:string) {
  try {
    const u=new URL(url), flags=u.searchParams.getAll("oneditQaSpacingSuffix");
    return u.protocol==="http:" && u.hostname==="127.0.0.1" && flags.length===1 && flags[0]==="1";
  } catch { return false; }
}
export function spacingSuffixPublisher(unit:HTMLElement, form:HTMLFormElement, enabled:boolean) {
  let edges: Node[] = [], settled=false;
  const attachmentChanges = (records:MutationRecord[]) => {
    for (const row of records) {
      const child=edges[edges.indexOf(row.target)-1];
      if (child && (Array.from(row.addedNodes).includes(child) || Array.from(row.removedNodes).includes(child))) {
        settled=false;
        return;
      }
    }
  };
  const Observer=form.ownerDocument.defaultView?.MutationObserver;
  let watcher=enabled && Observer ? new Observer(attachmentChanges) : undefined;
  // Only the owned plain span, never a live/semantic/ID-referenced sink.
  const currentEdges = () => {
    if (!unit.isConnected || unit.parentNode!==form || unit.tagName!=="SPAN" ||
        unit.attributes.length!==1 || !unit.hasAttribute("data-spacing-unit")) return [];
    const chain:Node[]=[unit];
    for (let e:Node|null=form; e; e=e.parentNode) {
      if (e.nodeType===1 && (e as Element).matches(
        "[aria-live],output,[role~='alert'],[role~='status'],[role~='log'],[role~='marquee'],[role~='timer']")) return [];
      chain.push(e);
    }
    return chain.at(-1)===form.ownerDocument ? chain : [];
  };
  const unbind=()=>{watcher?.disconnect();edges=[];settled=false;};
  return {
    write(value:string) {
      if (!watcher) { unit.textContent=value; return; }
      attachmentChanges(watcher.takeRecords());
      const chain=currentEdges(), same=chain.length===edges.length && chain.every((node,i)=>node===edges[i]);
      const text=unit.firstChild;
      if (settled && same && text?.nodeType===3 && text===unit.lastChild && text.nodeValue===value) return;
      // First publication, reattachment (even in the same microtask), changed
      // value, foreign text tree, or unknown context takes the original write.
      unit.textContent=value;
      if (!chain.length) { unbind(); return; }
      if (!same || !settled) {
        unbind();
        edges=chain;
        for (const parent of edges.slice(1)) watcher.observe(parent,{childList:true});
      }
      settled=true;
    },
    dispose() { unbind(); watcher=undefined; },
  };
}

/** Shared draft admission for both quick forms; no document mutation until submit. */
export function bindQuickDraft(form: HTMLFormElement, editor: Interaction, busy: () => boolean,
  kind: "char" | "paragraph", controls: (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[],
  reset: (state: FormatState) => void, read: () => Props,
  execute: (props: Props, target: ReturnType<Interaction["capture"]>) => void, restoreFocus: () => void,
  note: HTMLOutputElement, blockedReason: () => string = () => "", readBusy = busy) {
  const root = form.ownerDocument.getElementById('format-bar')!, life = new AbortController();
  const owns = (target: EventTarget | null) => toolbarFormContains(form, target);
  const guard = formatInputGuard(form, {root, owns});
  const on = <K extends keyof HTMLElementEventMap>(type: K, action: (event: HTMLElementEventMap[K]) => void, capture = false) => {
    root.addEventListener(type, event => { if (owns(event.target)) action(event); }, {capture, signal: life.signal});
  };
  let captured: ReturnType<Interaction["capture"]> | undefined, invalidated = false;
  const project = (admission: () => string, passive = false) => {
    let state: FormatState = {}, why = "";
    try {
      state = passive ? readPassiveFormatPresentation(editor,kind)
        : readFormatPresentation(editor,kind);
      why = admission();
    }
    catch (error) { why = String(error); }
    if (captured) {
      let current = false;
      try { current = sameFormatTarget(captured, editor.capture()); } catch { /* Invalid target refuses. */ }
      if (!current || why) { captured = undefined; invalidated = true; guard.close(); reset(state); note.textContent = "대상이 바뀌어 초안을 취소했습니다. 다시 선택하세요."; }
    }
    if (!captured && !invalidated) reset(state);
    // Admission's busy flag also covers file/modal work. Do not diagnose IME
    // from that aggregate flag; only the displayed reason changes here.
    const displayWhy = why ? blockedReason() || why : "";
    for (const control of controls) { control.disabled = !!why; control.title = displayWhy || control.dataset.hint || "Enter 적용 / Esc 취소"; }
    if (why) { note.textContent = displayWhy; note.title = displayWhy; }
  };
  const sync = () => editor.withViewQueries(owners=>project(() => formatMenuState(editor, readBusy(), readBusy() ? blockedReason() : "",undefined,owners).get(kind === "char" ? "character" : "paragraph")?.reason ?? ""));
  const independent = (node: EventTarget | null) => node instanceof Element && !!node.closest("[data-quick-independent]");
  on("focusin", event => {
    if (event.target instanceof Element && event.target.closest("[data-ui-relocating]")) return;
    if (independent(event.target)) return;
    if (owns(event.relatedTarget) && !independent(event.relatedTarget)) return;
    form.dataset.uiDraftActive = '';
    sync(); if (busy() || controls[0].disabled) return;
    try { captured = editor.capture(); invalidated = false; guard.open(); } catch (error) { invalidated = true; note.textContent = String(error); }
  });
  on("focusout", event => {
    if (event.target instanceof Element && event.target.closest("[data-ui-relocating]")) return;
    if (owns(event.relatedTarget) && !independent(event.relatedTarget)) return;
    delete form.dataset.uiDraftActive;
    captured = undefined; invalidated = false; guard.close(); sync();
  });
  form.addEventListener("rhwp:cancel-panel-draft",()=>{captured=undefined;invalidated=false;guard.close();sync();});
  on("keydown", e => {
    if (e.defaultPrevented) return;
    // Only plain Enter applies a quick draft, as in the properties panel.
    // Native implicit submission otherwise also accepts Shift+Enter.
    if (e.key === "Enter" && (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey)) {
      e.preventDefault(); e.stopPropagation(); return;
    }
    // An open combo owns its first Escape; only the next Escape cancels the
    // draft. The IME guard above still owns Escape during active composition.
    if (e.key === "Escape" && e.target instanceof HTMLInputElement &&
        e.target.getAttribute('aria-expanded') === 'true') return;
    if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); e.stopPropagation(); captured = undefined; invalidated = false; guard.close(); sync(); restoreFocus(); }
  }, true);
  form.onsubmit = event => {
    event.preventDefault();
    if (!guard.ready() || busy()) return;
    try {
      if (invalidated || !captured || !sameFormatTarget(captured, editor.capture())) throw Error("문서·리비전·선택이 바뀌었습니다. 편집기에서 다시 선택하세요.");
      const reason = formatMenuState(editor, busy(), blockedReason()).get(kind === "char" ? "character" : "paragraph")?.reason;
      if (reason) throw Error(reason);
      // Number inputs expose incomplete text (e.g. "1e") as an empty value.
      // Reject that draft before blank/mixed preservation can discard the error
      // and apply its other fields. Intentional empty inputs remain unchanged.
      const malformed = controls.find(control => control instanceof HTMLInputElement && control.validity.badInput);
      if (malformed) { malformed.focus(); throw Error("숫자를 끝까지 입력하세요. 빈칸은 기존 값 유지에만 사용합니다."); }
      const props = read();
      if (Object.keys(props).length) execute(props, captured);
      guard.consume(); captured = undefined; invalidated = false; sync(); restoreFocus();
    } catch (error) { note.textContent = String(error); note.title = String(error); }
  };
  return {sync, project, close: () => { guard.close(); guard.dispose(); life.abort(); delete form.dataset.uiDraftActive; }};
}

/** A display-demand decision, independent of transient owner memoization.
 * Both paths still run the original reader and protection checks. */
export function quickFormatDisplayDemand(ids: readonly string[]) {
  return new Set(["character", "paragraph", ...ids]);
}
export function qaQuickFormatDemandFlag(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && u.hostname === "127.0.0.1" &&
      u.searchParams.getAll("oneditQaQuickFormatDemand").length === 1 &&
      u.searchParams.get("oneditQaQuickFormatDemand") === "1";
  } catch { return false; }
}

/** Existing formatting Commands; all local state below is an uncommitted draft. */
export function mountQuickFormat(doc: Document, editor: Interaction, busy: () => boolean,
  execute: (command: CatalogCommand, target: ReturnType<Interaction["capture"]>) => void,
  restoreFocus: () => void, blockedReason: () => string = () => "", readBusy = busy, limitPassiveDemand = false) {
  const bar = doc.getElementById("format-bar")!;
  const form = doc.createElement("form"); form.id = "quick-format"; form.noValidate = true; form.setAttribute("aria-label", "빠른 글자 모양");
  const scope = doc.createElement("select"), font = doc.createElement("input"), size = doc.createElement("input"), tracking = doc.createElement("input"), color = doc.createElement("input");
  scope.name = "quickLanguage"; scope.add(new Option("모든 언어", "all")); languages.forEach((name, n) => scope.add(new Option(name, String(n))));
  font.type="text";font.autocomplete="off";font.name = "quickFont"; font.setAttribute("aria-label", "글꼴");
  size.name = "quickSize"; size.setAttribute("aria-label", "글자 크기 (pt)");
  const sizes = [6,7,8,9,10,11,12,13,14,15,16,20,24];
  // An editable combo keeps native text selection and its preset list. Validate
  // its numeric draft on submit, before the existing captured-target command.
  size.type = "text"; size.pattern = "(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)";
  size.inputMode = "decimal"; size.autocomplete = "off";
  selectNumericDraftOnClick(size);selectNumericDraftOnClick(tracking);
  tracking.name = "quickTracking"; tracking.type = "text"; tracking.autocomplete = "off"; tracking.pattern = "[+-]?[0-9]+";
  tracking.setAttribute("aria-label", "자간 (%)"); tracking.dataset.hint = "자간 -100~100% · Enter 적용 / Esc 취소";
  size.dataset.hint = "글자 크기 1~200pt · 직접 입력 또는 목록 선택 · Enter 적용 / Esc 취소";
  const sizeList = doc.createElement("datalist"); sizeList.id = "quick-font-sizes";
  sizeList.append(...sizes.map(n => new Option(String(n), String(n))));
  size.setAttribute("list", sizeList.id); form.append(sizeList);
  color.name = "quickColor"; color.type = "text"; color.autocomplete = "off"; color.setAttribute("list", "quick-colors"); color.dataset.hint = "글자색 #RRGGBB / 빈칸은 혼합·유지 / Enter 적용 / Esc 취소";
  const palette = doc.createElement("datalist"); palette.id = "quick-colors";
  for (const value of ["#000000", "#ff0000", "#0000ff", "#008000", "#ffffff"]) palette.append(new Option(value, value));
  form.append(palette);
  for (const [label, control] of [["언어", scope], ["글꼴", font], ["크기 (pt)", size], ["자간", tracking], ["글자색", color]] as const) {
    const row = doc.createElement("label"), text = doc.createElement("span"); text.textContent = label; row.append(text, control);
    if (control === tracking) {
      row.className = "quick-tracking-label";
      text.className = "quick-tracking-icon"; text.title = "자간";
      text.setAttribute("role", "img"); text.setAttribute("aria-label", "자간");
      text.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><text x="1" y="13" font-size="11" font-family="sans-serif" fill="currentColor" stroke="none">가나</text><path d="M3 19h18M6 16l-3 3 3 3M18 16l3 3-3 3"/></svg>';
      row.append(doc.createTextNode("%"));
    }
    form.append(row);
  }
  const apply = doc.createElement("button"); apply.type = "submit"; apply.hidden = true; apply.textContent = "적용"; apply.dataset.hint = "입력한 글꼴·크기·자간·글자색만 한 번 적용 · Enter"; form.append(apply);
  const note = doc.createElement("output"); note.setAttribute("aria-live", "polite"); form.append(note);
  const retry=doc.createElement('button');retry.type='button';retry.textContent='글꼴 다시 불러오기';retry.hidden=true;
  retry.title='실패한 글꼴만 다시 확인합니다. 문서의 글꼴이나 서식을 바꾸지 않습니다.';
  retry.dataset.fontRecovery='';
  (doc.querySelector('#format-menu [data-format-panel]') ?? form).append(retry);
  const originals = [...bar.querySelectorAll<HTMLElement>(".current-format")]; originals.forEach(b => b.hidden = true);
  bar.insertBefore(form, originals[0] ?? null);
  let initial = { font: "", size: "", color: "", tracking: "" }, state: FormatState = {};
  let colorSplit: ReturnType<typeof mountTextColorSplit> | undefined;
  const fontChoices=()=>{}; // Choices are acquired only when the user opens the list.
  const fontCombo=mountEditableCombo(font,()=>fontChoiceGroups(documentFontNames(editor.adapter),state),undefined,{search:true});
  const sizeCombo=mountEditableCombo(size,()=>[{label:'글자 크기',values:sizes.map(String)}]);
  const trackingCombo=mountEditableCombo(tracking,()=>[{label:'자간 (%)',values:[-10,-5,-3,-2,-1,0,1,2,3,5,10].map(String)}]);
  size.removeAttribute('list');sizeList.remove();
  const resetFont = () => {
    fontCombo.close();
    const family = state[scope.value === "all" ? "fontFamily" : `fontLanguage${scope.value}`];
    initial.font = typeof family === "string" ? family : "";
    fontChoices();font.value = initial.font;markFormatValue(font,formatValueState(state,scope.value==="all"?"fontFamily":`fontLanguage${scope.value}`));font.placeholder="혼합";
    fontChoices();
    note.textContent = ''; note.removeAttribute('title');
  };
  const reset = (next = state) => {
    state = next;
    initial = { font: "", size: typeof state.fontSize === "number" ? String(state.fontSize) : "", color: typeof state.textColor === "string" ? state.textColor : "", tracking: typeof state.spacings === "number" ? String(state.spacings) : "" };
    size.value = initial.size; color.value = initial.color; tracking.value = initial.tracking; tracking.placeholder = "혼합";
    markFormatValue(size,formatValueState(state,"fontSize"));markFormatValue(color,formatValueState(state,"textColor"));markFormatValue(tracking,formatValueState(state,"spacings"));
    color.style.borderBottomColor = /^#[\da-f]{6}$/i.test(initial.color) ? initial.color : "";
    resetFont();
  };
  font.dataset.hint = "글꼴 이름 일부로 검색 · 목록 선택 또는 Enter 적용 / Esc 취소";
  const character = bindQuickDraft(form, editor, busy, "char", [scope, font, size, tracking, color, apply], reset,
    () => {
      if (size.validity.patternMismatch) throw Error("글자 크기는 1~200pt의 숫자로 입력하세요.");
      if (tracking.validity.patternMismatch) throw Error("자간은 -100~100%의 정수로 입력하세요.");
      return quickFormatDelta(scope.value, initial, {font: font.value, size: size.value, color: color.value, tracking: tracking.value});
    },
    (props, target) => execute({ type: "char", props }, target), restoreFocus, note, blockedReason, readBusy);
  // Native change commits a chosen font/size. Typing remains a draft until
  // change or Enter; composing text and invalid targets still use the guard.
  size.addEventListener("change", () => { if (!size.closest('[data-ui-relocating]')) form.requestSubmit(); });
  tracking.addEventListener("change", () => { if (!tracking.closest('[data-ui-relocating]')) form.requestSubmit(); });
  font.addEventListener("change", () => {const chosen=font.value; if(!chosen||font.closest('[data-ui-relocating]'))return;
    void ensureFont(chosen).then(()=>{if(font.value!==chosen||!toolbarFormContains(form,doc.activeElement))return;
      if(fontStatus(chosen).status!=='loaded'){note.textContent=fontActionFailure(chosen);return;}form.requestSubmit();});
  });
  const colorLabel = color.closest("label")!;
  colorSplit = mountTextColorSplit(doc, editor, color, {busy,readBusy,focus:restoreFocus,
    apply:(props,target)=>execute({type:"char",props},target)});
  colorLabel.replaceWith(colorSplit.row);
  scope.addEventListener("change", () => {
    // A scope switch is view-only; never apply the previous scope's font draft.
    // Do not rewrite the numeric input: value==="" can represent an incomplete
    // native number (e.g. "1e"), not an intentionally empty mixed/keep field.
    resetFont(); note.textContent = "언어 전환 시 글꼴 초안만 취소됩니다. Enter로 적용하세요.";
  });
  const spacing = doc.createElement("form"); spacing.id = "quick-paragraph"; spacing.noValidate = true; spacing.setAttribute("aria-label", "빠른 문단 줄 간격");
  const type = doc.createElement("select"), value = doc.createElement("input"), unit = doc.createElement("span");
  type.name = "quickSpacingType"; type.add(new Option("혼합 / 유지", ""));
  for (const [v, label] of quickSpacingTypes) type.add(new Option(label, v));
  value.name = "quickSpacing";value.type="text";value.inputMode="decimal";value.autocomplete="off";value.pattern="(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)";
  selectNumericDraftOnClick(value);
  const percentages = [100,110,120,130,140,150,160,170,180];
  for (const [name, control] of [["줄 간격", type], ["값", value]] as const) { const label = doc.createElement("label"); label.append(name, control); spacing.append(label); }
  type.closest('label')!.hidden=true;
  const spacingIcon=doc.createElement('span');spacingIcon.className='quick-spacing-icon';spacingIcon.title='줄 간격';spacingIcon.setAttribute('aria-label','줄 간격');
  spacingIcon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v18M2 6l3-3 3 3M2 18l3 3 3-3M11 5h11M11 12h11M11 19h11"/></svg>';
  value.setAttribute('aria-label','줄 간격');spacing.prepend(spacingIcon);
  unit.dataset.spacingUnit = ""; spacing.append(unit);
  const spacingApply = doc.createElement("button"); spacingApply.type = "submit"; spacingApply.hidden = true; spacingApply.textContent = "적용"; spacingApply.dataset.hint = "줄 간격만 한 번 적용 · Enter";
  const spacingNote = doc.createElement("output"); spacingNote.setAttribute("aria-live", "polite"); spacing.append(spacingApply, spacingNote);
  let spacingInitial = {type: "", value: ""};
  let spacingState:FormatState={};
  const suffix = spacingSuffixPublisher(unit,spacing,!!doc.defaultView && doc.defaultView.parent===doc.defaultView &&
    qaSpacingSuffixFlag(doc.defaultView.location.href));
  const spacingHint = () => {
    suffix.write(type.value === "Percent" ? "%" : type.value ? "pt" : "% / pt");
    spacingNote.textContent = type.value === "Percent" ? "문단 전체 · 백분율" : type.value ? "문단 전체 · 근사 pt 조회 · 미변경 시 원본 유지" : formatValueHint(formatValueState(spacingState,"lineSpacingType"))+" · 방식과 값을 함께 지정";
    spacingNote.title = spacingNote.textContent;
  };
  const paragraph = bindQuickDraft(spacing, editor, busy, "paragraph", [type, value, spacingApply], s => {
    spacingState=s;
    spacingInitial = {type: typeof s.lineSpacingType === "string" ? s.lineSpacingType : "", value: typeof s.lineSpacing === "number" ? String(s.lineSpacing) : ""};
    type.value = spacingInitial.type;
    value.value=spacingInitial.value;
    markFormatValue(type,formatValueState(s,"lineSpacingType"));markFormatValue(value,formatValueState(s,"lineSpacing"));spacingHint();
  }, () => {if(value.validity.patternMismatch)throw Error("줄 간격은 숫자로 입력하세요.");return quickSpacingDelta(spacingInitial, {type: type.value||'Percent', value: value.value});},
  (props, target) => execute({ type: "paragraph", props }, target), restoreFocus, spacingNote, blockedReason, readBusy);
  const spacingCombo=mountEditableCombo(value,()=>[{label:"줄 간격 (%)",values:percentages.map(String)}],()=>{type.value="Percent";});
  type.addEventListener("change", spacingHint);
  value.addEventListener("change", () => {if(value.value&&!type.value)type.value='Percent';spacingHint();spacing.requestSubmit();});
  const catalogButtons: {button: HTMLButtonElement; id: string}[] = [];
  const mountedButtons: HTMLButtonElement[] = [];
  // Rehost the real original buttons: menu/shortcut/toolbar share one handler.
  const icons = doc.createElement("span"); icons.className = "quick-format-icons"; icons.setAttribute("role", "group"); icons.setAttribute("aria-label", "기본 글자·문단 서식");
  const moved: {button: HTMLElement; parent: Node; next: Node | null; children: Node[]}[] = [];
  for (const selector of ["#bold", "#italic", "#underline", "#strike", '[data-align="justify"]', '[data-align="left"]', '[data-align="center"]', '[data-align="right"]', '[data-align="distribute"]', '[data-align="split"]']) {
    let button = doc.querySelector<HTMLButtonElement>(selector);
    if (!button && (selector === "#strike" || selector.startsWith("[data-align="))) {
      // Reuse the menu catalog when no original toolbar button exists.
      const id = selector === "#strike" ? "strike" : selector.match(/"([a-z]+)"/)![1];
      const item = formatMenuItems.find(item => item.id === id)!;
      button = doc.createElement("button"); button.type = "button"; button.dataset.quickFormat = id;
      if (id !== "strike") button.dataset.align = id;
      button.dataset.commandTitle = item.label; button.setAttribute("aria-label", item.label);
      button.onclick = () => {
        try {
          const state = formatMenuState(editor, busy(), blockedReason()).get(id)!;
          if (state.disabled) throw Error(state.reason);
          const target = editor.capture();
          execute(item.command!, target); restoreFocus();
        } catch (error) { note.textContent = String(error); note.title = String(error); }
      };
      catalogButtons.push({button, id});
    } else if (button) {
      moved.push({button, parent: button.parentNode!, next: button.nextSibling, children: [...button.childNodes]});
    }
    if (!button) continue;
    mountedButtons.push(button);
    icons.append(button);
    if (button.id === "bold") button.setAttribute("aria-label", "진하게");
    const align = button.dataset.align;
    if (align) {
      const names: Record<string,string> = {left:"왼쪽 정렬",center:"가운데 정렬",right:"오른쪽 정렬",justify:"양쪽 정렬",distribute:"배분 정렬",split:"나눔 정렬"};
      if (!button.dataset.commandTitle) button.dataset.commandTitle = names[align];
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"), path = doc.createElementNS(svg.namespaceURI, "path");
      svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
      path.setAttribute("d", align === "distribute" ? "M3 5h18M3 10h18M3 15h18M3 20h18M3 8v4M12 8v4M21 8v4" : align === "split" ? "M3 5h18M3 10h5M16 10h5M3 15h18M3 20h5M16 20h5" : align === "center" ? "M3 5h18M6 10h12M3 15h18M6 20h12" : align === "right" ? "M3 5h18M9 10h12M3 15h18M9 20h12" : align === "left" ? "M3 5h18M3 10h12M3 15h18M3 20h12" : "M3 5h18M3 10h18M3 15h18M3 20h18");
      svg.append(path); button.replaceChildren(svg); button.setAttribute("aria-label", names[align]);
    } else if (button.dataset.quickFormat === "strike") {
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"), path = doc.createElementNS(svg.namespaceURI, "path");
      svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
      path.setAttribute("d", "M18 5C16 2 6 2 6 7c0 3 12 4 12 8 0 6-12 6-13 1M2 11h20");
      svg.append(path); button.replaceChildren(svg);
    }
  }
  form.after(icons); icons.after(spacing);
  // Only this mounted subscriber consumes this set. Draft focus/submit,
  // menu opening and all command admission keep their own original reads.
  const passiveDemand = limitPassiveDemand ? quickFormatDisplayDemand(catalogButtons.map(row => row.id)) : undefined;
  const readKey = (reading=readBusy(),reason=reading?blockedReason():"") => JSON.stringify([
    editor.adapter.documentId, editor.adapter.revision,editor.adapter.scope, editor.adapter.documentLocked,
    editor.selection, editor.typing, reading, reason, busy(), doc.fonts?.status]);
  // This map is private to the mounted quick controls. The menu has its own
  // full projection and never sees these missing rows.
  const withoutUnusedRelative = () => {
    const consumed = quickFormatDisplayDemand(catalogButtons.map(row => row.id));
    return new Set(formatMenuItems.filter(item =>
      item.command?.type !== "paragraph-relative" || consumed.has(item.id)).map(item => item.id));
  };
  const projectStates = (reading:boolean, reason:string, owners:Parameters<typeof formatMenuState>[4], demand = passiveDemand) =>
    readEditorDisplay(editor,"quick-format",(display,retry)=>formatMenuState(editor,reading,reason,
      retry?kind=>editor.freshDisplayFormat(kind):undefined,display,demand,
      display?editor.adapter.assertEditableForPresentation.bind(editor.adapter):undefined,undefined,!!display),
      ()=>formatMenuState(editor,reading,reason,
        editor.clickedTableDisplay()?kind=>readFormatPresentation(editor,kind):undefined,owners,demand,
        editor.clickedTableDisplayChecks()?.check));
  const canOmitUnusedRelative = (reading: boolean) => {
    const s = editor.selection, a = editor.adapter;
    if (reading || busy() || a.transientEdit || a.hasPendingLocalBodyFlow() || a.scope !== "edit" ||
        a.documentLocked || a.viewerOnlyReason || s.kind !== "caret" || s.focus.kind !== "cell" ||
        s.focus.ancestors?.length || doc.fonts.status !== "loaded") return false;
    const menu = doc.getElementById("format-menu");
    return menu instanceof HTMLDetailsElement && !menu.open;
  };
  // Each observer owns a synchronous read scope. No plan survives its
  // publisher or supplies format/admission state to a later callback.
  let staticActionsPrepared=false;
  const alignmentButtons = mountedButtons.filter(button => !!button.dataset.align);
  const projectAlignment = (paragraph: FormatState) => {
    for (const button of alignmentButtons)
      markFormatToggle(button,formatToggleState(paragraph,"alignment",button.dataset.align));
  };
  const projectCurrentAlignment = () => publishEditorDisplay(editor,() => {
    let paragraph: FormatState = {};
    try {
      paragraph = readPassiveFormatPresentation(editor,"paragraph");
    } catch { /* Display unknown instead of preserving an obsolete selection. */ }
    projectAlignment(paragraph);
  });
  const sync = (passiveWidth = false) => publishEditorDisplay(editor,()=>editor.withViewQueries(owners => {
    if(activeWorkset(doc)) {
      // Only displayed values. No menu capability/relative-step plan is computed.
      // Focus/submit/click below still uses fresh command admission and capture.
      character.project(()=>"",true);paragraph.project(()=>"",true);
      fontChoices();retry.hidden=!allFontSupply().some(f=>f.status==='unavailable');
      colorSplit?.sync(state,"");
      // The home layout moves the alignment buttons out of icons.
      for(const button of mountedButtons) {
        const id=button.dataset.quickFormat??button.dataset.align??button.id;
        const item=formatMenuItems.find(row=>row.id===id);
        if(!staticActionsPrepared){button.disabled=false;button.title=button.dataset.commandTitle??item?.label??button.getAttribute("aria-label")??"서식";}
        if(item?.property&&!button.dataset.align){const toggle=formatToggleState(item.kind==="char"?state:spacingState,item.property,item.value);
          if(toggle.pressed!==undefined&&button.getAttribute("aria-pressed")!==toggle.pressed)button.setAttribute("aria-pressed",toggle.pressed);}
      }
      projectAlignment(spacingState);
      staticActionsPrepared=true;
      return;
    }
    let key: string | undefined, lastOmission = false, demand: Set<string> | undefined, states: ReturnType<typeof formatMenuState>;
    const readStates = () => {
      const reading = readBusy(), reason = reading ? blockedReason() : "";
      const current = readKey(reading,reason);
      const omit = passiveWidth && canOmitUnusedRelative(reading);
      if (key !== current || lastOmission !== omit) {
        states = projectStates(reading,reason,owners,omit ? (demand ??= withoutUnusedRelative()) : passiveDemand);
        key = current; lastOmission = omit;
      }
      return states;
    };
    character.project(() => readStates().get("character")?.reason ?? "",true);
    paragraph.project(() => readStates().get("paragraph")?.reason ?? "",true);
    fontChoices();retry.hidden=!allFontSupply().some(f=>f.status==='unavailable');retry.disabled=readBusy()||!!doc.querySelector('dialog[open]');
    const projected = readStates();
    colorSplit?.sync(state,projected.get("character")?.reason);
    for (const {button, id} of catalogButtons) {
      const state = projected.get(id)!;
      button.disabled = state.disabled;
      button.title = state.reason || button.dataset.commandTitle || "문단 정렬";
      if (state.pressed !== undefined) button.setAttribute("aria-pressed", state.pressed);
    }
  }));
  retry.onclick=()=>{if(readBusy()||doc.querySelector('dialog[open]'))return;retry.disabled=true;
    void retryFailedFontSupply().catch(error=>{note.textContent=String(error);}).finally(sync);};
  let mounted = true;
  const modalObserver = new MutationObserver(records => {
    if (records.some(record => record.target instanceof HTMLDialogElement)) sync();
  });
  if(!activeWorkset(doc))modalObserver.observe(doc.body, {subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["open"]});
  // Only replace this observer's own single known close delivery. A mixed
  // batch, a reopened dialog, or a failed sync still gets the legacy work.
  const projectOwnedClose = (dialog:HTMLDialogElement) => {
    if (!mounted || dialog.open || readBusy()) return false;
    const records=modalObserver.takeRecords().filter(r=>r.target instanceof HTMLDialogElement);
    if (!records.length) return false;
    const legacy=()=>queueMicrotask(()=>{if(mounted)sync();});
    if(records.length!==1||records[0].target!==dialog||records[0].oldValue===null){legacy();return false;}
    try{sync();return true;}
    catch(error){legacy();throw error;}
  };
  sync();
  return { sync, projectCurrentAlignment, projectOwnedClose, dispose() { mounted=false;modalObserver.disconnect(); suffix.dispose(); character.close(); paragraph.close();fontCombo.close();sizeCombo.close();trackingCombo.close();spacingCombo.close(); colorSplit?.close(false); retry.remove(); form.remove(); spacing.remove(); icons.remove(); originals.forEach(b => b.hidden = false); for (const {button,parent,next,children} of moved.reverse()) { button.replaceChildren(...children); parent.insertBefore(button, next?.parentNode === parent ? next : null); } } };
}
