import {mountEditableCombo, type ChoiceGroup} from '../editable-combo.js';
import { fontSupply, allFontSupply, availableFontSupply, configuredFontFamilies, ensureFont, displayFont, fontDisplayDescription, retryFailedFontSupply } from "../font-provider.js";
import type { FormatState } from "../formatting.js";
import { languages } from "../formatting.js";
import {localFontNames} from '../local-font-access.js';
import {offeredFontFamily} from '../font-offerings.js';
export type FontStatus = {
  status: "loaded" | "loading" | "unavailable" | "unknown";
  label: string;
};
const unquote = (name: string) => name.trim().replace(/^(['"])(.*)\1$/, "$2");
// FontFaceSet is the document's registered web fonts, never an OS inventory.
// fonts.check() alone can return true for a nonexistent family, so is NOT proof.
export function registeredFonts(
  fonts:
    | Iterable<{ family: string; status: string }>
    | undefined = document.fonts,
) {
  return fonts
    ? Array.from(fonts).map((f) => ({
        family: unquote(f.family),
        status: f.status,
      }))
    : [];
}
export function fontStatus(
  family: string,
  fonts = registeredFonts(),
): FontStatus {
  const supply = fontSupply(family);
  if (supply) return {status:supply.status,label:supply.label};
  if (typeof document !== "undefined") void ensureFont(family);
  const found = fonts.filter(
    (f) => f.family.toLowerCase() === unquote(family).toLowerCase(),
  );
  if (found.some((f) => f.status === "loaded"))
    return {
      status: "loaded",
      label: "등록 웹폰트 로드됨 · 글리프 전체 보장 아님",
    };
  if (found.some((f) => f.status === "loading"))
    return { status: "loading", label: "등록 웹폰트 로딩 중 · 대체 표시 가능" };
  if (found.length && found.every((f) => f.status === "error"))
    return {
      status: "unavailable",
      label: "등록 웹폰트 로드 실패 · 브라우저 대체 가능",
    };
  return {
    status: "unknown",
    label: found.length
      ? "등록 웹폰트 아직 미로드 · 가용성 미확인"
      : "브라우저 가용성 미확인 · OS 설치 여부 미조회",
  };
}
export function fontSuggestions(
  state: FormatState,
  fonts = registeredFonts(),
): string[] {
  return [
    ...new Set(
      [
        ...languages.map((_, i) => state[`fontLanguage${i}`]),
        state.fontFamily,
        ...configuredFontFamilies,
        ...localFontNames(),
        ...availableFontSupply().map(f => f.family),
        ...(Array.isArray(state.__fontChoices) ? state.__fontChoices : []),
        ...fonts.filter((f) => f.status === "loaded").map((f) => f.family),
      ].filter((v): v is string => typeof v === "string" && !!v.trim() && offeredFontFamily(v)),
    ),
  ].sort((a,b)=>a.localeCompare(b,'ko'));
}
// Priority names are product UI order, not substitutes for authored source names.
export const preferredFontNames=['함초롬바탕','함초롬돋움','맑은 고딕','굴림','바탕'];
// Compact default list only. Authored document names remain visible, while
// other supplied/registered names stay discoverable through explicit search.
export const minimalLatinFontNames=['Noto Sans KR','Noto Serif KR','D2Coding'];
export function fontChoiceGroups(documentNames: readonly string[], state:FormatState):ChoiceGroup[]{
  const seen=new Set<string>();
  const key=(name:string)=>unquote(name).normalize('NFC').toLocaleLowerCase('ko');
  const unique=(names:readonly string[])=>names.filter(n=>{const k=key(n);if(!k||!offeredFontFamily(n)||seen.has(k))return false;seen.add(k);return true;});
  const preferred=unique(preferredFontNames);
  const documentValues=unique([...documentNames,...(Array.isArray(state.__fontChoices)?state.__fontChoices.filter((n):n is string=>typeof n==='string'):[])]);
  const supplied=unique(fontSuggestions(state));
  return [{label:'자주 사용하는 글꼴',values:preferred},
    {label:'문서에서 사용된 글꼴',values:documentValues},
    {label:'기본 제공 글꼴',values:supplied.filter(name=>/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(name)||minimalLatinFontNames.some(n=>key(n)===key(name))),searchValues:supplied}];
}
export function fontPreview(
  container: HTMLElement,
  family: string | undefined,
  size = 12,
  style: { bold?: boolean; italic?: boolean } = {},
) {
  if (family) void ensureFont(family);
  const label = document.createElement("small"),
    sample = document.createElement("p");
  label.dataset.fontAvailability = "true";
  sample.dataset.fontPreview = "true";
  label.textContent = family ?? "혼합";
  // A mixed/keep draft is not an explicit request to turn a property off.
  const mixed = [style.bold === undefined ? "굵게" : "", style.italic === undefined ? "기울임" : ""].filter(Boolean);
  sample.textContent = "가나다 한글 ABC abc 123 漢字 □ ○ ☆";
  if (sample.style) {
    sample.style.fontFamily = family
      ? `"${(displayFont(family) ?? family).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
      : "inherit";
    sample.style.fontWeight = style.bold === true ? "700" : "400";
    sample.style.fontStyle = style.italic === true ? "italic" : "normal";
    sample.style.fontSize = `${Number.isFinite(size) ? Math.max(6, Math.min(48, size)) : 12}pt`;
  }
  container.replaceChildren(label, sample);
  if(family&&fontSupply(family)?.status==='unavailable')container.append(fontRetryButton(container.ownerDocument));
}
function fontRetryButton(doc:Document){
  const retry=doc.createElement('button');retry.type='button';retry.textContent='글꼴 다시 불러오기';
  retry.title='실패한 기본 공급·설치 이름만 다시 확인합니다. 원본 글꼴·서식을 바꾸지 않습니다.';
  retry.onclick=()=>{retry.disabled=true;void retryFailedFontSupply().catch(()=>{retry.disabled=false;});};return retry;
}
const updates = new WeakMap<Element, () => void>();
export function refreshFontFields(root: HTMLElement) {
  for (const control of root.querySelectorAll("[data-font-input]"))
    updates.get(control)?.();
}
export function mountFontField(
  label: HTMLElement,
  control: HTMLInputElement | HTMLSelectElement,
  state: FormatState,
) {
  // Empty is still an unchanged draft, but no selectable “keep” font exists.
  control.dataset.fontInput='';
  if(!(control instanceof HTMLInputElement))throw Error('글꼴 입력 필드가 필요합니다.');
  control.placeholder='혼합';
  const combo=mountEditableCombo(control,()=>fontChoiceGroups(Array.isArray(state.__documentFonts)?state.__documentFonts.filter((n):n is string=>typeof n==='string'):[],state),undefined,{search:true});
  combo.wrap.classList.add('font-field-control');
  const preview = document.createElement("div");preview.dataset.fontField = control.name;label.append(preview);
  const sync = () => {
    // Blur emits change for a typed search fragment too. It must not start a
    // font request or move the dialog/Cancel target by replacing its preview.
    const family=control.value, key=(name:string)=>unquote(name).normalize('NFC').toLocaleLowerCase('ko');
    if(family&&!fontSuggestions(state).some(name=>key(name)===key(family)))return;
    const form = control.closest("form");
    const draft = (name: "bold" | "italic") => {
      const value = form?.querySelector<HTMLSelectElement>(`[name="${name}"]`)?.value;
      return value === "true" ? true : value === "false" ? false
        : typeof state[name] === "boolean" ? state[name] : undefined;
    };
    fontPreview(
      preview,
      control.value || undefined,
      Number(
        control
          .closest?.("form")
          ?.querySelector<HTMLInputElement>('[name="fontSize"]')?.value ||
          state.fontSize ||
          12,
      ),
      {bold: draft("bold"), italic: draft("italic")},
    );
  };
  updates.set(control, sync);
  // Search fragments are drafts, not font requests. Preview only a committed
  // list/manual change (or reset), rather than loading every partial name.
  control.addEventListener("change", sync);
  sync();
}
export function renderFontStatus(container: HTMLElement, state: FormatState) {
  const note = document.createElement("p");
  note.textContent =
    "언어별 글꼴";
  const rows = document.createElement("dl");
  for (const [i, lang] of languages.entries()) {
    const term = document.createElement("dt"),
      value = document.createElement("dd");
    term.textContent = lang;
    const family = state[`fontLanguage${i}`];
    value.textContent =
      typeof family === "string"
        ? family
        : "혼합 / 조회 불가";
    rows.append(term, value);
  }
  const preview = document.createElement("div");
  fontPreview(
    preview,
    typeof state.fontFamily === "string" ? state.fontFamily : undefined,
    Number(state.fontSize ?? 12),
    {bold: typeof state.bold === "boolean" ? state.bold : undefined,
     italic: typeof state.italic === "boolean" ? state.italic : undefined},
  );
  container.replaceChildren(note, rows, preview);
  if(allFontSupply().some(f=>f.status==='unavailable')&&!preview.querySelector('button'))container.append(fontRetryButton(container.ownerDocument));
}
