import type { FormatKind, FormatState } from "./formatting.js";
import { languages } from "./formatting.js";
import type { Props } from "./model.js";

export function dialogGroup(kind: FormatKind, group = "기본", name = "") {
  return kind === "char" && (["언어별 글꼴", "언어별 폭·간격", "폭·간격"].includes(group) || name === "fontFamily")
    ? "언어별 설정" : group;
}
export function scriptValue(state: FormatState): string {
  if (typeof state.superscript !== "boolean" || typeof state.subscript !== "boolean" || (state.superscript && state.subscript)) return "";
  return state.superscript ? "super" : state.subscript ? "sub" : "normal";
}
export function scriptDelta(mode: string): Props {
  if (!["normal", "super", "sub"].includes(mode)) throw Error("지원하지 않는 첨자 모양입니다.");
  return { superscript: mode === "super", subscript: mode === "sub" };
}
export function firstLineValue(mode: string, value: string): string {
  if (mode === "normal") return "0";
  if (!["indent", "hanging"].includes(mode) || !value.trim() || !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > (mode === "hanging" ? 200 : 1000))
    throw Error("첫 줄 모양의 양수 길이를 입력하세요. 들여쓰기 1000pt, 내어쓰기 200pt 이내입니다.");
  return String(Number(value) * (mode === "hanging" ? -1 : 1));
}
export function assertLanguageDraft(props: Props) {
  for (const [global, slot] of [["fontFamily", "font"], ["ratios", "ratios"], ["spacings", "spacings"], ["relativeSizes", "relativeSizes"], ["charOffsets", "charOffsets"]])
    if (global in props && Object.keys(props).some(k => new RegExp(`^${slot}Language[0-6]$`).test(k)))
      throw Error("모든 언어와 개별 언어의 같은 속성은 따로 적용하세요. 초안은 유지됩니다.");
}

// Presentation and drafts only. The existing dialog reader/Command owns mutations.
export function mountDialogLayout(root: HTMLElement, kind: FormatKind, controls: Map<string, HTMLInputElement | HTMLSelectElement>) {
  const sections = new Map<string, HTMLFieldSetElement>();
  for (const label of root.querySelectorAll<HTMLElement>(":scope > label[data-field]")) {
    const name = label.dataset.field!, group = label.dataset.fieldGroup!;
    const title = kind === "paragraph" && group === "테두리·배경"
      ? name === "paragraphBackground" ? "배경"
        : name.startsWith("borderGap") || name === "borderIgnoreMargin" ? "간격" : "테두리"
      : group !== "기본" ? group : kind === "char"
      ? name === "fontSize" ? "기준 크기" : ["textColor", "shadeColor"].includes(name) ? "글자 색·음영" : "글자 속성"
      : name === "alignment" ? "일반" : name.startsWith("margin") ? "여백" : name === "indent" ? "첫 줄" : "간격";
    const key = `${group}:${title}`;
    let section = sections.get(key);
    if (!section) {
      section = document.createElement("fieldset"); section.dataset.dialogSection = title;
      const legend = document.createElement("legend"); legend.textContent = title; section.append(legend);
      root.insertBefore(section, label); sections.set(key, section);
    }
    section.append(label);
  }
  // Official Basic and Border/Background group order. Move existing nodes, preserving their
  // values/listeners; no new fields, defaults, unit conversion or Core writes.
  const order = kind === "char"
    ? ["기본:기준 크기", "언어별 설정:언어별 설정", "기본:글자 속성", "기본:글자 색·음영"]
    : ["기본:일반", "기본:여백", "기본:첫 줄", "기본:간격", "줄 나눔:줄 나눔",
      "테두리·배경:테두리", "테두리·배경:배경", "테두리·배경:간격"];
  const basic = document.createDocumentFragment();
  for (const key of order) { const section = sections.get(key); if (section) basic.append(section); }
  const nav = root.querySelector(":scope > nav");
  root.insertBefore(basic, nav ? nav.nextSibling : root.firstChild);
  const sync = () => { for (const section of sections.values()) section.hidden = [...section.querySelectorAll<HTMLElement>("[data-field]")].every(label => label.hidden); };
  root.querySelector("nav")?.addEventListener("click", sync); sync();
  if (kind === "char") {
    const section = [...sections.values()].find(s => s.dataset.dialogSection === "언어별 설정")!;
    const label = document.createElement("label"), selector = document.createElement("select"), note = document.createElement("p");
    label.textContent = "언어"; selector.name = "dialogLanguage"; selector.add(new Option("모든 언어 · 공통값", "all"));
    languages.forEach((lang, i) => selector.add(new Option(lang, String(i)))); label.append(selector);
    note.textContent = "언어를 바꾸어도 초안은 유지됩니다. 모든 언어는 같은 값을 전체 슬롯에 적용하며 한컴 대표 글꼴 묶음과는 다릅니다.";
    note.className = "dialog-draft-note"; section.insertBefore(note, section.children[1]); section.insertBefore(label, note);
    const choose = () => { for (const row of section.querySelectorAll<HTMLElement>("[data-field]")) {
      const slot = /Language([0-6])$/.exec(row.dataset.field!);
      row.dataset.languageHidden = String(selector.value === "all" ? !!slot : slot?.[1] !== selector.value);
    }};
    selector.addEventListener("change", choose); choose();
  }
  let validate = () => {};
  if (kind === "paragraph") {
    const raw = controls.get("indent")!, row = raw.closest("label")!, original = raw.value;
    raw.hidden = true;
    const mode = document.createElement("select"), amount = document.createElement("input");
    mode.name = "firstLineKind"; mode.setAttribute("aria-label", "첫 줄 모양");
    for (const [v, text] of [["", "혼합 / 유지"], ["normal", "보통"], ["indent", "들여쓰기"], ["hanging", "내어쓰기"]]) mode.add(new Option(text, v));
    mode.value = raw.value === "" ? "" : Number(raw.value) === 0 ? "normal" : Number(raw.value) < 0 ? "hanging" : "indent";
    amount.type = "number"; amount.name = "firstLineAmount"; amount.min = "0"; amount.step = "any"; amount.setAttribute("aria-label", "첫 줄 길이 (pt)");
    amount.value = raw.value === "" ? "" : String(Math.abs(Number(raw.value)));
    const update = () => { amount.disabled = !mode.value || mode.value === "normal"; amount.max = mode.value === "hanging" ? "200" : "1000"; };
    let changed = false;
    const write = () => { changed = true; if (!mode.value) raw.value = original; else { try { raw.value = firstLineValue(mode.value, amount.value); } catch { raw.value = ""; } } update(); };
    mode.addEventListener("change", write); amount.addEventListener("input", write); row.append(mode, amount); update();
    validate = () => { if (changed && mode.value) raw.value = firstLineValue(mode.value, amount.value); };
    const spacing = controls.get("lineSpacing")!, type = controls.get("lineSpacingType")!;
    const unit = document.createElement("output"); unit.dataset.spacingUnit = "true"; unit.setAttribute("aria-live", "polite"); spacing.after(unit);
    const unitSync = () => { unit.textContent = type.value === "Percent" ? "%" : ["Fixed", "Minimum", "SpaceOnly"].includes(type.value) ? "pt" : "방식 선택 필요"; };
    type.addEventListener("change", unitSync); unitSync();
  }
  return validate;
}
