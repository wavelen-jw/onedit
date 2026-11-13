import {selectNumericDraftOnClick} from "./numeric-draft-selection.js";
import { cellLayoutInput, cellLayoutKeys, cellLayoutHold } from "./cell-layout.js";
import {
  type FormatKind,
  type FormatState,
  sides,
  toCoreCharacter,
  toCoreParagraph,
} from "./formatting.js";
import { linePositions, connectUnderlineDraft } from "./line-position.js";
import { mountParagraphLists, type ListCatalog } from "./paragraph-lists.js";
import type { Props } from "./model.js";
import { resetHancomCharacterDialog } from "./hancom-character-dialog.js";
import {paragraphFieldText} from './paragraph-spacing-display.js';
type Field = {
  name: string;
  label: string;
  type?: "number";
  numeric?: boolean;
  options?: [string, string][];
  min?: number;
  max?: number;
  step?: number;
};
const boolean = [
  ["true", "켜기"],
  ["false", "끄기"],
] as [string, string][];
const shade = [
  ["none", "없음"],
  ["#ffffff", "흰색"],
  ["#fff2a8", "노랑"],
  ["#cceedd", "연두"],
] as [string, string][];
export function fields(kind: FormatKind): Field[] {
  if (kind === "char")
    return [
      { name: "fontFamily", label: "글꼴" },
      {
        name: "fontSize",
        label: "크기 (pt)",
        type: "number",
        min: 1,
        max: 200,
        step: 0.5,
      },
      ...["bold", "italic", "underline"].map((name, n) => ({
        name,
        label: ["굵게", "기울임", "밑줄"][n],
        options: boolean,
      })),
      { name: "underlineType", label: "선 위치", options: linePositions.map(([value, label]) => [value, label]) },
      { name: "textColor", label: "글자색 (#RRGGBB)" },
      { name: "shadeColor", label: "글자 음영", options: shade },
    ];
  if (kind === "paragraph")
    return [
      {
        name: "alignment",
        label: "정렬",
        options: [
          ["left", "왼쪽"],
          ["center", "가운데"],
          ["right", "오른쪽"],
          ["justify", "양쪽"],
          ["distribute", "배분"],
          ["split", "나눔"],
        ],
      },
      ...[
        "indent",
        "marginLeft",
        "marginRight",
        "spacingBefore",
        "spacingAfter",
      ].map((name, n) => ({
        name,
        label: [
          "첫 줄 (pt, −는 내어쓰기)",
          "왼쪽 여백 (pt)",
          "오른쪽 여백 (pt)",
          "문단 앞 (pt)",
          "문단 뒤 (pt)",
        ][n],
        type: "number" as const,
        min: name === "indent" ? -200 : 0,
        max: 1000,
        step: 0.5,
      })),
      {
        name: "lineSpacing",
        label: "줄 간격 (%)",
        type: "number",
        min: 1,
        max: 1000,
        step: 1,
      },
    ];
  return [
    { name: "verticalAlign", label: "셀 세로 정렬", numeric: true,
      options: [["0", "위"], ["1", "가운데"], ["2", "아래"]] },
    { name: "applyInnerMargin", label: "셀 안 여백 사용", options: boolean },
    ...["Left", "Right", "Top", "Bottom"].map((side, n) => ({
      name: `padding${side}`, label: `${["왼쪽", "오른쪽", "위", "아래"][n]} 안 여백 (pt)`,
      type: "number" as const, min: 0, max: 327.67, step: 0.01,
    })),
    { name: "background", label: "셀 배경", options: shade },
    ...sides.flatMap((side, n) => [
      {
        name: `border${side}.type`,
        label: `${["왼쪽", "오른쪽", "위", "아래"][n]} 테두리`,
        options: [
          ["0", "없음"],
          ["1", "실선"],
          ["2", "점선"],
          ["3", "파선"],
        ] as [string, string][],
      },
      {
        name: `border${side}.width`,
        label: "선 굵기",
        options: [
          ["0", "0.1 mm"],
          ["1", "0.12 mm"],
          ["2", "0.15 mm"],
          ["3", "0.2 mm"],
          ["4", "0.25 mm"],
          ["5", "0.3 mm"],
          ["6", "0.4 mm"],
          ["7", "0.5 mm"],
          ["8", "0.6 mm"],
          ["9", "0.7 mm"],
          ["10", "1.0 mm"],
          ["11", "1.5 mm"],
          ["12", "2.0 mm"],
          ["13", "3.0 mm"],
          ["14", "4.0 mm"],
          ["15", "5.0 mm"],
        ] as [string, string][],
      },
      { name: `border${side}.color`, label: "선 색 (#RRGGBB)" },
    ]),
  ];
}
// Controls hold drafts only. A single Command receives explicitly edited fields.
export function mountFields(
  container: HTMLElement,
  kind: FormatKind,
  state: FormatState,
  listCatalog?: ListCatalog,
) {
  resetHancomCharacterDialog(container);
  container.replaceChildren();
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const initial = new Map<string, string>();
  for (const field of fields(kind)) {
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = field.label;
    label.append(caption);
    let value = state[field.name];
    if(kind==='paragraph'&&value!==undefined&&['spacingBefore','spacingAfter'].includes(field.name))value=paragraphFieldText(field.name,value);
    if (field.name === "lineSpacing" && state.lineSpacingType !== "Percent")
      value = undefined;
    let control: HTMLInputElement | HTMLSelectElement;
    if (field.options) {
      control = document.createElement("select");
      control.add(new Option(value === undefined ? "혼합 / 유지" : "유지", ""));
      for (const [v, text] of field.options) control.add(new Option(text, v));
      if (
        value !== undefined &&
        !field.options.some(([v]) => v === String(value))
      )
        control.add(new Option(`현재: ${value}`, String(value)));
    } else {
      control = document.createElement("input");
      control.type = field.type ?? "text";
      control.placeholder = value === undefined ? "혼합 / 유지" : "유지";
      if (field.type === "number") {
        control.min = String(field.min);
        control.max = String(field.max);
        control.step = "any"; // Imported Core values need not be multiples of the UI increment.
        selectNumericDraftOnClick(control);
      }
      if (/Color$|\.color$/.test(field.name)) {
        control.pattern = "#[0-9a-fA-F]{6}";
        control.title = "#RRGGBB 형식";
      }
    }
    if (kind === "cell" && state.__cellLayoutHold === true && (cellLayoutKeys as readonly string[]).includes(field.name)) { control.disabled = true; control.title = cellLayoutHold; }
    control.name = field.name;
    control.value = value === undefined ? "" : String(value);
    control.dataset.mixed = String(value === undefined);
    if (field.name === "lineSpacing" && state.lineSpacingType !== "Percent")
      control.title =
        "현재 고정/최소/혼합 간격: 값을 입력하면 비율(%)로 변경합니다.";
    const hint = document.createElement("small");
    hint.textContent =
      value === undefined
        ? "혼합 또는 조회 불가 · 미변경 시 유지"
        : `현재: ${value}`;
    if (field.name === "background" && value === "none")
      hint.textContent = "단색 없음 · 그림/그라데이션은 조회 불가";
    caption.append(hint);
    initial.set(field.name, control.value);
    controls.set(field.name, control);
    label.append(control);
    container.append(label);
    if (field.name === "shadeColor" || field.name === "background") {
      const custom = document.createElement("input");
      custom.type = "text";
      custom.pattern = "#[0-9a-fA-F]{6}";
      custom.placeholder = "직접 입력 #RRGGBB";
      custom.setAttribute("aria-label", `${field.label} 사용자 색`);
      custom.addEventListener("input", () => {
        if (/^#[\da-f]{6}$/i.test(custom.value)) {
          const select = control as HTMLSelectElement;
          const color = custom.value.toLowerCase();
          if (![...select.options].some((o) => o.value === color))
            select.add(new Option(color, color));
          select.value = color;
        }
      });
      // A palette choice replaces the custom draft, including invalid text
      // that would otherwise keep native form validation from submitting it.
      control.addEventListener("change", () => { custom.value = ""; });
      label.append(custom);
    }
  }
  connectUnderlineDraft(controls);
  const lists = kind === "paragraph" && listCatalog ? mountParagraphLists(container, state, listCatalog) : undefined;
  const read = (): Props => {
    const props: Props = {};
    for (const f of fields(kind)) {
      const v = controls.get(f.name)!.value;
      if (!v || v === initial.get(f.name)) continue;
      props[f.name] = ["bold", "italic", "underline", "applyInnerMargin"].includes(f.name)
        ? v === "true"
        : f.numeric || f.type === "number" || /\.(type|width)$/.test(f.name)
          ? Number(v)
          : v.startsWith("#")
            ? v.toLowerCase()
            : v;
    }
    if (kind === "paragraph" && "lineSpacing" in props)
      props.lineSpacingType = "Percent";
    return kind === "char"
      ? toCoreCharacter(props)
      : kind === "paragraph"
        ? toCoreParagraph(props)
        : cellLayoutInput(props);
  };
  return Object.assign(read, { paragraphListChange: () => lists?.read() });
}
