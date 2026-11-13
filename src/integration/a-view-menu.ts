import {mountEditorFullscreen} from '../fullscreen-view.js';
import {mountAutoPageLayout} from '../auto-page-layout.js';
import { tableGuideModes,type TableGuideMode } from "../table-guides.js";
import { mountViewMenuPresentation } from "../view-menu-presentation.js";
import { viewMarkerItems, type ViewMarker } from "../view-markers.js";
import { viewNumber } from "../status-navigation.js";
import { viewSequenceItems } from "../view-sequence.js";
// View-only geometry. Never mutates Core, selection, history or saved revision.
function checkedPageScale(width: number, displayed: number) {
  if (!(width > 0 && displayed > 0)) throw Error("페이지 배율을 확인할 수 없습니다");
  return displayed / width;
}
export function pageScale(page: HTMLElement, rect?: Pick<DOMRectReadOnly, "width">) {
  const width = parseFloat(page.style.width), displayed = (rect ?? page.getBoundingClientRect()).width;
  return checkedPageScale(width, displayed);
}
export function pagePoint(page: HTMLElement, clientX: number, clientY: number) {
  const r = page.getBoundingClientRect(), scale = checkedPageScale(parseFloat(page.style.width), r.width);
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
}
export function viewportPoint(page: HTMLElement, viewport: HTMLElement, x: number, y: number) {
  const r = page.getBoundingClientRect(), v = viewport.getBoundingClientRect(),
    scale = checkedPageScale(parseFloat(page.style.width), r.width);
  return { x: r.left - v.left - viewport.clientLeft + viewport.scrollLeft + x * scale,
    y: r.top - v.top - viewport.clientTop + viewport.scrollTop + y * scale, scale };
}
export function viewShortcut(e: Pick<KeyboardEvent, "code" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "isComposing" | "keyCode">) {
  if (e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey || e.altKey || !e.shiftKey) return undefined;
  return e.code === "NumpadAdd" ? "in" : e.code === "NumpadSubtract" ? "out" : undefined;
}
const sidebarActions = new WeakMap<Document, (show: boolean) => boolean>();
export const sidebarActionFor = (doc: Document) => sidebarActions.get(doc);

export function mountViewMenu(root: HTMLDetailsElement, pages: HTMLElement, viewport: HTMLElement, sidebar: HTMLElement,
  busy: () => boolean, changed: () => void, revealSelection?: () => void,
  markers?: {read: (id: ViewMarker) => boolean | undefined; toggle: (id: ViewMarker) => void; error: (error: unknown) => void},
  ruler?: {refresh: () => void; state: () => {shown: boolean; reason: string}; toggle: () => void},
  guides?:{read:()=>{mode:TableGuideMode;reason:string};set:(mode:TableGuideMode)=>void}) {
  const panel = root.querySelector<HTMLElement>("[data-view-panel]")!;
  let scale = 1, mode = "custom";
  let beforeTouchWidth: { scale: number; mode: string } | undefined;
  const layout=mountAutoPageLayout(pages,viewport);
  const pageList = () => Array.from(pages.getElementsByClassName("page")) as HTMLElement[];
  const current = () => {
    const list = pageList(), top = viewport.getBoundingClientRect().top + viewport.clientTop + 24;
    const found = list.findIndex(p => p.getBoundingClientRect().bottom > top);
    return found < 0 ? Math.max(0, list.length - 1) : found;
  };
  const button = (text: string, action: string, callback: () => void) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.dataset.viewAction = action;
    b.onclick = () => { if (!busy()) { callback(); refresh(); changed(); } }; panel.append(b); return b;
  };
  const go = (index: number) => {
    const list = pageList(); if (!Number.isInteger(index) || index < 0 || index >= list.length) return false;
    viewport.scrollTop = Math.max(0, viewport.scrollTop + list[index].getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientTop - 20);
    return true;
  };
  const fit = () => {
    const list = pageList(); if (!list.length) return;
    const width = Math.max(...list.map(p => parseFloat(p.style.width)));
    const height = parseFloat(list[current()].style.height);
    const ratio = mode === "page" ? Math.min((viewport.clientWidth - 60) / width, (viewport.clientHeight - 40) / height)
      : (viewport.clientWidth - 60) / width;
    if (Number.isFinite(ratio) && ratio > 0) scale = Math.min(3, Math.max(.25, ratio));
    pages.style.setProperty("zoom", String(scale));
  };
  const zoom = (value: number, newMode = "custom") => {
    beforeTouchWidth = undefined;
    const keep=layout.anchor(),index = current(); mode = newMode; scale = Math.min(3, Math.max(.25, value));
    if (mode !== "custom") fit(); else pages.style.setProperty("zoom", String(scale));
    layout.refresh(keep);if(!keep)go(index);
  };
  // Han/word 2024 View: buttons and Shift+Num +/- change by five percent.
  const stepZoom = (direction: -1 | 1) => zoom(scale + direction * .05);
  const nav = [button("첫 쪽", "first", () => go(0)), button("이전 쪽", "previous", () => go(current() - 1)),
    button("다음 쪽", "next", () => go(current() + 1)), button("마지막 쪽", "last", () => go(pageList().length - 1))];
  const label = document.createElement("label"); label.textContent = "쪽 번호 ";
  const number = document.createElement("input"); number.type = "number"; number.min = "1"; number.step = "1";
  number.setAttribute("aria-label", "이동할 쪽 번호"); label.append(number); panel.append(label);
  const submitPage = () => { try { go(viewNumber(number.value,1,pageList().length,"쪽 번호") - 1); number.setCustomValidity(""); } catch(error) { number.setCustomValidity(String(error)); } number.reportValidity(); };
  const goButton = button("지정 쪽으로 이동", "go", submitPage);
  const enter = (field: HTMLInputElement, action: () => void) => field.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.isComposing || e.keyCode === 229 || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    e.preventDefault(); e.stopPropagation();
    if (!busy() && pageList().length) { action(); refresh(); changed(); }
  });
  enter(number, submitPage);
  number.addEventListener("blur", e => { if (e.relatedTarget !== goButton) refresh(); });
  const percentLabel = document.createElement("label"); percentLabel.textContent = "배율 (%) ";
  const percent = document.createElement("input"); percent.type = "number"; percent.min = "25"; percent.max = "300"; percent.step = "1";
  percent.setAttribute("aria-label", "문서 배율 (%)"); percentLabel.append(percent); panel.append(percentLabel);
  const submitZoom = () => {
    try { zoom(viewNumber(percent.value,25,300,"확대율") / 100); percent.setCustomValidity(""); }
    catch(error) { percent.setCustomValidity(String(error)); }
    percent.reportValidity();
  };
  const zoomButton = button("배율 적용", "zoom-go", submitZoom); enter(percent, submitZoom);
  percent.addEventListener("input", () => percent.setCustomValidity("")); percent.addEventListener("blur", e => { if (e.relatedTarget !== zoomButton) refresh(); });
  if (revealSelection) button("선택 위치로 이동", "selection", revealSelection);
  number.addEventListener("input", () => number.setCustomValidity(""));
  const zoomOut = button("축소 · Shift+숫자패드 −", "out", () => stepZoom(-1));
  const zoomIn = button("확대 · Shift+숫자패드 +", "in", () => stepZoom(1));
  zoomOut.setAttribute("aria-keyshortcuts", "Shift+Subtract"); zoomIn.setAttribute("aria-keyshortcuts", "Shift+Add");
  const presets = [button("100%", "actual", () => zoom(1)), button("폭 맞춤", "width", () => zoom(scale, "width")), button("쪽 맞춤", "page", () => zoom(scale, "page"))];
  const showSidebar = (show: boolean) => {
    if (busy()) return false;
    sidebar.hidden = !show;
    refresh();
    changed();
    return true;
  };
  const side = button("선택 속성 패널 표시", "sidebar", () => {});
  side.onclick = () => { showSidebar(Boolean(sidebar.hidden)); };
  sidebarActions.set(root.ownerDocument, showSidebar);
  const marks = document.createElement("details"), marksTitle = document.createElement("summary");
  marksTitle.textContent = "표시/숨기기"; marks.append(marksTitle); panel.append(marks);
  const markerButtons = viewMarkerItems.map(item => {
    const b = button(item.label, item.id, () => {
      try { markers?.toggle(item.id); } catch (error) { markers?.error(error); }
    });
    marks.append(b); return {item, button: b};
  });
  const guideButtons:HTMLButtonElement[]=[];
  if(guides){const all=markerButtons.find(x=>x.item.id==="transparent-borders")!.button;all.textContent="표 보조선: 항상 표시";all.dataset.tableGuideMode="all";guideButtons.push(all);
    for(const item of tableGuideModes.filter(x=>x.id!=="all")){const b=button(item.label,"table-guides-"+item.id,()=>guides.set(item.id));b.dataset.tableGuideMode=item.id;marks.append(b);guideButtons.push(b);}
  }
  const guideNote=document.createElement("small");guideNote.id="table-guides-note";guideNote.textContent="붉은 점선은 선 없음 구간의 편집 보조선입니다. 실제 출력 테두리는 유지합니다. ‘선택한 표’는 커서·셀 블록·표 개체가 속한 표입니다.";if(guides)marks.append(guideNote);
  const hint = document.createElement("small");
  hint.textContent = "화면 표시만 변경합니다. 공백 표시는 조판 부호에서만 켭니다. 조판 부호는 기존 문단·줄바꿈 부호도 포함합니다. 저장·인쇄에는 포함하지 않습니다."; marks.append(hint);
  const windowGroup = document.createElement("details"), windowTitle = document.createElement("summary");
  windowTitle.textContent = "문서 창"; windowGroup.append(windowTitle); panel.append(windowGroup);
  const rulerButton = button("가로 눈금자", "horizontal-ruler", () => ruler?.toggle()); windowGroup.append(rulerButton);
  // Retain the internal presentation source for compatible menu consumers,
  // without refreshing an unavailable feature on the product editing path.
  if (!ruler) {
    rulerButton.disabled = true;
    rulerButton.title = "현재 제공하지 않는 보기 기능입니다.";
    rulerButton.setAttribute("aria-pressed", "false");
    rulerButton.setAttribute("aria-disabled", "true");
  }
  const rulerNote = document.createElement("small"); rulerNote.textContent = "쪽 본문 폭 · mm · 조회 전용. 여백·탭 끌기 편집과 세로 눈금자는 미지원입니다."; windowGroup.append(rulerNote);
  const fullscreen=mountEditorFullscreen(root,busy,e=>markers?.error(e));windowGroup.append(fullscreen.button);
  const status = document.getElementById("view-status")!;
  for (const [, action, key] of viewSequenceItems) {
    const b = panel.querySelector<HTMLButtonElement>(`[data-view-action="${action}"]`)!;
    const hint = document.createElement("kbd"); hint.textContent = `Ctrl+G,${key}`;
    b.append(hint); b.title = `본문 편집기에서 Ctrl+G를 누른 뒤 ${key}`;
  }
  const presentation = mountViewMenuPresentation(root, busy);
  function refresh() {
    const list = pageList();
    let index = current();
    if (mode !== "custom") {
      const before = scale,keep=layout.anchor();
      fit();
      // Sidebar/window resize must not leave a long document at the old
      // pixel offset on a different page after fit-mode scaling.
      if (scale !== before) {layout.refresh(keep);if(!keep)go(index);}
      index = current();
    }
    layout.refresh();
    number.max = String(list.length);
    number.disabled = percent.disabled = busy() || !list.length;
    // A discarded draft's error must not describe the restored current value.
    // Keep both value and validation feedback while its input still has focus.
    if (document.activeElement !== percent) { percent.value = String(Math.round(scale * 100)); percent.setCustomValidity(""); }
    if (document.activeElement !== number) { number.value = list.length ? String(index + 1) : ""; number.setCustomValidity(""); }
    const label = `${list.length ? index + 1 : 0} / ${list.length}쪽 · ${Math.round(scale * 100)}%${mode === "width" ? " · 폭 맞춤" : mode === "page" ? " · 쪽 맞춤" : ""}`;
    if (status.textContent !== label) status.textContent = label;
    for (const [key,value] of Object.entries({viewPage:list.length ? index+1 : 0,viewPages:list.length,viewZoom:Math.round(scale*100),viewMode:mode,viewBusy:busy()||!list.length}))
      if (status.dataset[key] !== String(value)) status.dataset[key] = String(value);
    for (const b of panel.querySelectorAll<HTMLButtonElement>("[data-view-action]")) b.disabled = busy() || !list.length;
    for (const {item, button} of markerButtons) {
      let value: boolean | undefined, error = "";
      try { value = markers?.read(item.id); } catch (e) { error = String(e); }
      const reason = error || (value === undefined ? "현재 Core/SVG 표시 연결 미지원" : busy() ? "입력·저장 또는 열린 대화상자를 먼저 마치세요." : !list.length ? "문서를 먼저 여세요." : "");
      button.disabled = !!reason; button.title = reason || (item.id === "transparent-borders" ? "선 없음 표·셀 경계를 화면에 점선으로 표시 · 저장/인쇄 제외" : item.id === "paragraph-marks" ? "문단 끝·기존 줄바꿈 표시 · 공백 표시는 조판 부호로 제어합니다." : "공백·조판 부호와 기존 문단 부호를 화면에 표시 · 저장/인쇄 제외");
      const shortcut = viewSequenceItems.find(([, action]) => action === item.id);
      if (!reason && shortcut) button.title += ` · 본문에서 Ctrl+G를 누른 뒤 ${shortcut[2]}`;
      button.setAttribute("aria-pressed", String(value === true));
      button.setAttribute("aria-disabled", String(!!reason));
    }
    if(guides){const state=guides.read();for(const b of guideButtons){b.setAttribute("role","menuitemradio");b.setAttribute("aria-pressed",String(b.dataset.tableGuideMode===state.mode));b.setAttribute("aria-checked",String(b.dataset.tableGuideMode===state.mode));b.title="화면 보조선 · 저장/인쇄 제외 · 출력 테두리 불변";}guideNote.textContent=state.reason||"붉은 점선은 선 없음 구간의 편집 보조선 · 실제 출력 테두리 불변 · 저장/인쇄 제외. ‘선택한 표’는 커서·셀 블록·표 개체가 속한 표입니다.";}
    if (ruler) {
      ruler.refresh();
      const rulerState = ruler.state(), rulerReason = rulerState?.reason || (!rulerState ? "현재 Core 쪽 눈금 조회 미지원" : busy() ? "입력·저장 또는 열린 대화상자를 먼저 마치세요." : "");
      rulerButton.disabled = !!rulerReason; rulerButton.title = rulerReason || "가로 눈금자 표시/숨기기 · mm · 조회 전용 · 저장/인쇄 제외";
      rulerButton.setAttribute("aria-pressed", String(rulerState?.shown === true));
      rulerButton.setAttribute("aria-disabled", String(!!rulerReason));
    }
    nav[0].disabled ||= index === 0; nav[1].disabled ||= index === 0;
    nav[2].disabled ||= index === list.length - 1; nav[3].disabled ||= index === list.length - 1;
    zoomOut.disabled ||= scale <= .25; zoomIn.disabled ||= scale >= 3;
    presets.forEach((b, n) => b.setAttribute("aria-pressed", String(n === 0 ? mode === "custom" && Math.abs(scale - 1) < .001 : mode === (n === 1 ? "width" : "page"))));
    side.setAttribute("aria-pressed", String(!sidebar.hidden));
    presentation.refresh(!!list.length);fullscreen.refresh();
  }
  viewport.addEventListener("scroll", refresh, { passive: true });
  root.addEventListener("toggle", refresh);
  root.addEventListener("keydown", e => {
    // Nested menus use the workspace's existing closest-owner Escape handler.
    if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing && e.keyCode !== 229 &&
        !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.target instanceof Element && e.target.closest("details") === root) {
      e.preventDefault(); e.stopPropagation(); root.open = false; document.getElementById("input")?.focus({preventScroll:true});
    }
  });
  root.addEventListener("pointerdown", e => { if (busy()) e.preventDefault(); });
  const resize = new ResizeObserver(() => { refresh(); changed(); }); resize.observe(viewport);
  refresh();
  const setZoom = (value: number) => { if (!Number.isFinite(value) || value <= 0 || busy() || !pageList().length) return; zoom(value); refresh(); changed(); };
  const toggleTouchWidth = () => {
    if (busy() || !pageList().length) return;
    if (mode === 'width') {
      const previous = beforeTouchWidth ?? {scale:1,mode:'custom'};
      zoom(previous.scale,previous.mode);
    } else {
      const previous = {scale,mode}; zoom(scale,'width'); beforeTouchWidth = previous;
    }
    refresh(); changed();
  };
  return { refresh, dispose:()=>{if(sidebarActionFor(root.ownerDocument)===showSidebar)sidebarActions.delete(root.ownerDocument);fullscreen.dispose();layout.dispose();}, zoom: () => scale, setZoom, toggleTouchWidth, key(e: KeyboardEvent) {
    // Original Hancom numbering depth owns exact Ctrl+numpad +/-; retain
    // main-row Ctrl+=/- and Meta zoom. Do not let the earlier view consumer
    // swallow an already-supported editing Command.
    if(e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&['NumpadAdd','NumpadSubtract'].includes(e.code))return false;
    // Existing native SHY uses the main Minus key, including layouts reporting '-'.
    if(e.ctrlKey&&!e.metaKey&&!e.altKey&&e.shiftKey&&(e.code==='Minus'||!e.code&&['-','_'].includes(e.key)))return false;
    // Only document focus owns browser-style zoom keys. Local form fields,
    // chrome and user-configured shortcuts keep their existing routers.
    if (!e.defaultPrevented && !e.isComposing && e.keyCode !== 229 && !e.altKey &&
        (e.ctrlKey !== e.metaKey) && e.target instanceof Node && viewport.contains(e.target)) {
      const direction = ["+", "="].includes(e.key) ? 1 : e.key === "-" ? -1 : 0;
      if (direction || e.key === "0" && !e.shiftKey) {
        if (!busy() && pageList().length) setZoom(direction ? scale + direction * .05 : 1);
        return true;
      }
    }
    const action = viewShortcut(e); if (!action || busy() || !pageList().length) return false;
    stepZoom(action === "in" ? 1 : -1); refresh(); changed(); return true;
  } };
}
