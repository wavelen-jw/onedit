import {selectNumericDraftOnClick} from "../numeric-draft-selection.js";
import { bindSpacingDraft } from "../spacing-draft.js";
import {paragraphFieldText} from '../paragraph-spacing-display.js';
import { cellLayoutInput, cellLayoutKeys, cellLayoutHold } from "../cell-layout.js";
import { formatValueState, formatValueHint, markFormatValue } from "../format-value-state.js";
import { formatTab, mountFormatTabs } from "../workspace-ui.js";
import { dialogGroup, scriptValue, scriptDelta, assertLanguageDraft, mountDialogLayout } from "../format-dialog-layout.js";
import { mountParagraphAdjustments, paragraphAdjustmentGroup } from "../paragraph-adjustments.js";
import { linePositions, connectUnderlineDraft } from "../line-position.js";
import { mountFontField, refreshFontFields } from "./a-font-availability.js";
import { mountHancomCharacterDialog, resetHancomCharacterDialog } from "../hancom-character-dialog.js";
import {
  type FormatKind,
  type FormatState,
  sides,
  languages,
  toCoreCharacter,
  toCoreParagraph,
  bodyBorderHold,
} from "../formatting.js";
import { mountTabs } from "./a-tab-stops.js";
import type { Props } from "../model.js";
type Field = {
  disabled?: boolean;
  name: string;
  label: string;
  type?: "number";
  options?: [string, string][];
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  numeric?: boolean;
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
      { name: "fontFamily", label: "공통 글꼴 (모든 언어)" },
      ...languages.map((label, i) => ({
        name: `fontLanguage${i}`,
        label: `${label} 글꼴`,
        group: "언어별 글꼴",
      })),
      ...languages.flatMap((lang, i) =>
        ["ratios", "spacings", "relativeSizes", "charOffsets"].map(
          (name, n) => ({
            name: `${name}Language${i}`,
            label: `${lang} ${["장평", "자간", "상대 크기", "글자 위치"][n]} (%)`,
            group: "언어별 폭·간격",
            type: "number" as const,
            min: n === 0 || n === 2 ? 1 : -100,
            max: n === 0 || n === 2 ? 200 : 100,
          }),
        ),
      ),
      {
        name: "fontSize",
        label: "크기 (pt)",
        type: "number",
        min: 1,
        max: 200,
        step: 0.5,
      },
      { name: "scriptMode", label: "첨자", options: [["normal", "보통 (첨자 해제)"], ["super", "위 첨자"], ["sub", "아래 첨자"]] },
      ...["bold", "italic", "underline", "strikethrough"].map((name, n) => ({
        name,
        label: ["굵게", "기울임", "밑줄", "취소선"][n],
        options: boolean,
      })),
      { name: "underlineColor", label: "밑줄 색 (#RRGGBB)" },
      { name: "strikeColor", label: "취소선 색 (#RRGGBB)" },
      { name: "textColor", label: "글자색 (#RRGGBB)" },
      { name: "shadeColor", label: "글자 음영", options: shade },
      {
        name: "outlineType",
        label: "외곽선",
        group: "장식 효과",
        numeric: true,
        options: [
          ["0", "없음"],
          ["1", "실선"],
          ["2", "파선"],
          ["3", "점선"],
        ],
      },
      {
        name: "shadowType",
        label: "그림자",
        group: "장식 효과",
        numeric: true,
        options: [
          ["0", "없음"],
          ["1", "비연속"],
          ["2", "연속"],
        ],
      },
      { name: "shadowColor", label: "그림자 색 (#RRGGBB)", group: "장식 효과" },
      ...["shadowOffsetX", "shadowOffsetY"].map((name, n) => ({
        name,
        label: `그림자 ${n ? "세로" : "가로"} 위치 (%)`,
        group: "장식 효과",
        type: "number" as const,
        min: -100,
        max: 100,
        step: 1,
      })),
      {
        name: "emphasisDot",
        label: "강조점",
        group: "장식 효과",
        numeric: true,
        options: [
          ["0", "없음"],
          ["1", "검은 점"],
          ["2", "빈 원"],
        ],
      },
      ...["emboss", "engrave"].map((name, n) => ({
        name,
        label: n ? "음각" : "양각",
        group: "장식 효과",
        options: boolean,
      })),
      { name: "underlineType", label: "선 위치", group: "선 모양", options: linePositions.map(([value, label]) => [value, label]) },
      ...["underlineShape"].map((name, n) => ({
        name,
        label: n ? "취소선 모양" : "밑줄 모양",
        group: "선 모양",
        numeric: true,
        options: [
          ["0", "기본"],
          ["1", "실선"],
          ["2", "파선"],
          ["3", "점선"],
          ["8", "이중선"],
          ["12", "물결선"],
        ] as [string, string][],
      })),
      ...["ratios", "spacings", "relativeSizes", "charOffsets"].map(
        (name, n) => ({
          name,
          label:
            ["장평 (%)", "자간 (%)", "상대 크기 (%)", "글자 위치 (%)"][n] +
            " · 모든 언어",
          group: "폭·간격",
          type: "number" as const,
          min: n === 0 || n === 2 ? 1 : -100,
          max: n === 0 || n === 2 ? 200 : 100,
          step: 1,
        }),
      ),
      { name: "kerning", label: "커닝", group: "장식 효과", options: boolean },
      { name: "characterBackground", label: "글자 배경", options: shade, group: "테두리·배경" },
      ...fields("cell").filter(f => /^border(Left|Right|Top|Bottom)\.(type|width|color)$/.test(f.name))
        .map(f => ({ ...f, name: "charB" + f.name.slice(1), group: "테두리·배경" })),
    ];
  if (kind === "paragraph")
    return [
      {
        name: "paragraphBackground",
        label: "문단 배경",
        options: shade,
        group: "테두리·배경",
      },
      ...fields("cell")
        // Only side borders are shared. Cell padding/alignment use a
        // different target/API; paragraph verticalAlign is defined below.
        .filter((f) => /^border(Left|Right|Top|Bottom)\.(type|width|color)$/.test(f.name))
        .map((f) => ({ ...f, group: "테두리·배경" })),
      ...["왼쪽", "오른쪽", "위", "아래"].map((side, i) => ({
        name: `borderGap${i}`,
        label: `${side} 테두리 간격 (pt)`,
        type: "number" as const,
        min: 0,
        max: 100,
        group: "테두리·배경",
      })),
      ...["borderConnect", "borderIgnoreMargin"].map((name, i) => ({
        name,
        label: i ? "문단 여백 무시" : "이웃 문단 테두리 연결",
        options: boolean,
        group: "테두리·배경",
      })),
      {
        name: "singleLine",
        label: "한 줄로 입력",
        options: boolean,
        group: "줄 나눔",
      },
      {
        name: "verticalAlign",
        label: "줄 안 세로 정렬",
        numeric: true,
        options: [
          ["0", "글꼴 기준"],
          ["1", "위"],
          ["2", "가운데"],
          ["3", "아래"],
        ],
        group: "줄 나눔",
      },
      {
        disabled: true,
        name: "englishBreakUnit",
        label: "영문 줄 나눔",
        numeric: true,
        options: [
          ["0", "단어"],
          ["1", "하이픈"],
          ["2", "글자"],
        ],
        group: "줄 나눔",
      },
      {
        name: "koreanBreakUnit",
        label: "한글 줄 나눔",
        numeric: true,
        options: [
          ["0", "어절"],
          ["1", "글자"],
        ],
        group: "줄 나눔",
      },
      ...["widowOrphan", "keepWithNext", "keepLines", "pageBreakBefore"].map(
        (name, n) => ({
          name,
          label: [
            "외톨이줄 보호",
            "다음 문단과 함께",
            "문단 보호",
            "문단 앞에서 항상 쪽 나눔",
          ][n],
          group: "문단 보호",
          options: boolean,
        }),
      ),
      ...["fontLineHeight", "autoSpaceKrEn", "autoSpaceKrNum"].map(
        (name, n) => ({
          name,
          label: [
            "글꼴에 어울리는 줄 높이",
            "한글·영문 자동 간격",
            "한글·숫자 자동 간격",
          ][n],
          group: "자동 간격",
          options: boolean,
        }),
      ),
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
          "첫 줄 모양·길이 (pt)",
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
        name: "lineSpacingType",
        label: "줄 간격 방식",
        options: [
          ["Percent", "글자에 따라 (%)"],
          ["Fixed", "고정값 (pt)"],
          ["Minimum", "최소 (pt)"],
          ["SpaceOnly", "여백만 (pt)"],
        ],
      },
      ...["tabAutoLeft", "tabAutoRight"].map((name, i) => ({
        name,
        label: i ? "문단 오른쪽 끝 자동 탭" : "문단 왼쪽 끝 자동 탭",
        group: "탭",
        options: boolean,
      })),
      {
        name: "lineSpacing",
        label: "줄 간격 (비율 %, 나머지 pt)",
        type: "number",
        min: 1,
        max: 1000,
        step: 1,
      },
    ];
  return [
    { name: "verticalAlign", label: "셀 세로 정렬", group: "셀", numeric: true,
      options: [["0", "위"], ["1", "가운데"], ["2", "아래"]] },
    { name: "applyInnerMargin", label: "셀 안 여백 사용", group: "셀", options: boolean },
    ...["Left", "Right", "Top", "Bottom"].map((side, n) => ({
      name: `padding${side}`, label: `${["왼쪽", "오른쪽", "위", "아래"][n]} 안 여백 (pt)`,
      group: "셀", type: "number" as const, min: 0, max: 327.67, step: 0.01,
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
  initialGroup = "기본",
  mergedAlignment?: Readonly<{ready:boolean; reason?:string}>,
) {
  initialGroup = dialogGroup(kind, initialGroup);
  resetHancomCharacterDialog(container);
  container.replaceChildren();
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const initial = new Map<string, string>();
  const groups = [
    "기본",
    ...new Set(fields(kind).map(f => dialogGroup(kind, f.group, f.name)).filter(g => g !== "기본")),
    ...(kind === "paragraph" ? [paragraphAdjustmentGroup] : []),
  ];
  const labels: { element: HTMLElement; group: string }[] = [];
  const buttons: HTMLButtonElement[] = [];
  // Basic is one page of related fieldsets, not another mutually exclusive
  // sub-dialog. Group buttons still select the existing group/tab and drafts.
  const visibleGroup = (group: string, selected: string) => group === selected ||
    kind !== "cell" && formatTab(kind, selected) === "기본" && formatTab(kind, group) === "기본";
  if (groups.length > 1) {
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "서식 기능군");
    for (const group of groups) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = group;
      button.dataset.formatGroup = group;
      button.setAttribute("aria-pressed", String(group === initialGroup));
      button.onclick = () => {
        for (const item of labels) item.element.hidden = !visibleGroup(item.group, group);
        for (const b of buttons)
          b.setAttribute("aria-pressed", String(b === button));
      };
      buttons.push(button);
      nav.append(button);
    }
    container.append(nav);
    mountFormatTabs(nav, kind, initialGroup);
  }
  for (const field of fields(kind).sort(
    (a, b) => Number(!!a.group) - Number(!!b.group),
  )) {
    const label = document.createElement("label");
    const group = dialogGroup(kind, field.group, field.name);
    label.dataset.field = field.name;
    label.dataset.fieldGroup = group;
    label.hidden = !visibleGroup(group, initialGroup);
    labels.push({ element: label, group });
    const caption = document.createElement("span");
    caption.textContent = field.label;
    label.append(caption);
    let value = field.name === "scriptMode" ? scriptValue(state) || undefined : state[field.name];
    if(kind==='paragraph'&&value!==undefined&&['spacingBefore','spacingAfter'].includes(field.name))value=paragraphFieldText(field.name,value);

    let control: HTMLInputElement | HTMLSelectElement;
    if (field.options) {
      control = document.createElement("select");
      control.add(new Option("유지", ""));
      for (const [v, text] of field.options) {
        const option = new Option(text, v);
        if (
          v === "true" &&
          [
            "borderIgnoreMargin",
            "fontLineHeight",
            "autoSpaceKrEn",
            "autoSpaceKrNum",
          ].includes(field.name) &&
          state.__bodyLineProtectionHold === true
        )
          option.disabled = true;
        control.add(option);
      }
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
    const bodyLayoutUnsupported =
      kind === "paragraph" &&
      state.__bodyLineProtectionHold === true &&
      ["singleLine", "verticalAlign"].includes(field.name);
    const bodyOffsetUnsupported =
      kind === "char" &&
      state.__bodyCharacterOffsetsHold === true &&
      [
        "charOffsets", // All-language changes also include the already-held body slots.
        "charOffsetsLanguage0",
        "charOffsetsLanguage1",
        "charOffsetsLanguage2",
        "charOffsetsLanguage3",
        "charOffsetsLanguage5",
        "charOffsetsLanguage6",
      ].includes(field.name);
    const bodyGapUnsupported =
      kind === "paragraph" &&
      state.__bodyLineProtectionHold === true &&
      ["borderGap0", "borderGap1"].includes(field.name);
    const bodyOutlineUnsupported =
      kind === "char" &&
      state.__bodyCharacterOffsetsHold === true &&
      field.name === "outlineType";
    const cellLayoutUnsupported = kind === "cell" && state.__cellLayoutHold === true &&
      (cellLayoutKeys as readonly string[]).includes(field.name) &&
      !(field.name === "verticalAlign" && mergedAlignment?.ready === true);
    control.disabled =
      !!field.disabled ||
      bodyLayoutUnsupported ||
      bodyOffsetUnsupported ||
      bodyGapUnsupported ||
      bodyOutlineUnsupported || cellLayoutUnsupported;
    if (field.disabled) control.title = "NOT_SUPPORTED: 저장·재열기 보존 실패";
    if (bodyLayoutUnsupported)
      control.title =
        "NOT_SUPPORTED: 본문 화면 배치 미지원 · 저장된 원본 값 유지";
    if (cellLayoutUnsupported)
      control.title = field.name === "verticalAlign"
        ? mergedAlignment?.reason ?? cellLayoutHold
        : mergedAlignment?.ready ? "병합 셀 안 여백 변경은 아직 지원하지 않습니다." : cellLayoutHold;
    control.name = field.name;
    control.value = value === undefined ? "" : String(value);
    const valueState=field.name==="scriptMode"?(value!==undefined?"common":
      ["superscript","subscript"].some(k=>formatValueState(state,k)==="unavailable")?"unavailable":"mixed"):formatValueState(state,field.name);
    markFormatValue(control,valueState);

    const hint = document.createElement("small");
    hint.textContent =
      valueState !== "common"
        ? `${formatValueHint(valueState)} · 미변경 시 원본 유지`
        : `현재: ${field.options?.find(([v]) => v === String(value))?.[1] ?? value}`;
    if (field.name === "background" && value === "none")
      hint.textContent = "단색 없음 · 그림/그라데이션은 조회 불가";
    if (bodyLayoutUnsupported)
      hint.textContent +=
        " · 본문 화면 배치 미지원(NOT_SUPPORTED), 저장된 값 유지";
    if (bodyOffsetUnsupported) {
      control.title = field.name === "charOffsets"
        ? "NOT_SUPPORTED: 모든 언어 변경에는 본문에서 지원하지 않는 글자 위치가 포함됩니다. 저장된 값은 유지합니다."
        : "NOT_SUPPORTED: 본문 확인된 문자군의 글자 위치는 저장만 지원, 설치 Core 렌더 소비 없음 · 기존 값 보존";
      hint.textContent += " · " + control.title;
    }
    if (bodyOutlineUnsupported) {
      control.title =
        "NOT_SUPPORTED: 본문 외곽선은 저장만 지원하고 설치 Core SVG 화면에는 반영되지 않습니다. 기존 값은 보존됩니다.";
      hint.textContent += " · " + control.title;
    }
    if (
      kind === "paragraph" &&
      state.__bodyLineProtectionHold === true &&
      ["fontLineHeight", "autoSpaceKrEn", "autoSpaceKrNum"].includes(field.name)
    ) {
      control.title =
        "NOT_SUPPORTED: 본문 자동 간격은 저장만 지원하고 화면에는 반영되지 않습니다. 기존 값 유지·명시적 해제는 가능합니다.";
      hint.textContent += " · " + control.title;
    }
    if (
      bodyGapUnsupported ||
      (field.name === "borderIgnoreMargin" &&
        state.__bodyLineProtectionHold === true)
    ) {
      control.title =
        bodyBorderHold +
        (field.name === "borderIgnoreMargin"
          ? " 여백 무시의 명시적 해제는 가능합니다."
          : "");
      hint.textContent += " · " + control.title;
    }
    if (field.name === "lineSpacing" && state.lineSpacingType !== "Percent")
      hint.textContent += " · Core 반올림 조회값(근사 pt), 미변경 시 원본 유지";
    caption.append(hint);
    initial.set(field.name, control.value);
    controls.set(field.name, control);
    label.append(control);
    container.append(label);
    if (kind === "char" && /^font(Family|Language[0-6])$/.test(field.name))
      mountFontField(label, control, state);
    if (
      field.name === "shadeColor" || field.name === "characterBackground" ||
      ["background", "paragraphBackground"].includes(field.name)
    ) {
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
      // The selected palette is now authoritative, not a previous custom
      // input whose invalid pattern could still block this valid selection.
      control.addEventListener("change", () => { custom.value = ""; });
      label.append(custom);
    }
  }
  connectUnderlineDraft(controls);
  controls
    .get("fontSize")
    ?.addEventListener("input", () => refreshFontFields(container));
  for (const name of ["bold", "italic"])
    controls.get(name)?.addEventListener("change", () => refreshFontFields(container));
  if (kind === "char") refreshFontFields(container);
  let readTabs: ReturnType<typeof mountTabs> | undefined;
  if (kind === "paragraph") {
    const tabPanel = document.createElement("div");
    tabPanel.dataset.tabStopsDraft = "true";
    tabPanel.hidden = true;
    container.append(tabPanel);
    labels.push({ element: tabPanel, group: "탭" });
    readTabs = mountTabs(tabPanel, state.tabStops);
  }
  const spacingType = controls.get("lineSpacingType");
  if (spacingType)
    bindSpacingDraft(spacingType as HTMLSelectElement, controls.get("lineSpacing") as HTMLInputElement);
  if (kind !== "cell") {
    const unavailable = document.createElement("p");
    unavailable.textContent = "이번 UI에서 미지원: ";
    const names =
      kind === "char"
        ? ["취소선 모양 (저장 보존 제한)", "자동·테마 색"]
        : ["기본 탭 간격", "기존 번호 정의 직접 편집·삭제", "그림·그라데이션 문단 배경"];
    for (const name of names) {
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = true;
      button.textContent = name;
      button.title = "현재 Edit UI 연결 미지원 · 원본 속성은 유지합니다";
      unavailable.append(button);
    }
    container.append(unavailable);
  }
  const adjustments = kind === "paragraph" ? mountParagraphAdjustments(container, state) : undefined;
  if (adjustments) {
    adjustments.panel.hidden = initialGroup !== paragraphAdjustmentGroup;
    labels.push({element: adjustments.panel, group: paragraphAdjustmentGroup});
  }
  const validateLayout = kind === "cell" ? () => {} : mountDialogLayout(container, kind, controls);
  if (kind === "char") {
    const note = document.createElement("p"); note.dataset.characterBorderScope = "true";
    note.textContent = "선택한 글자의 테두리·단색 배경만 적용합니다. 글자 음영·문단/셀 테두리와는 별개이며 미변경 속성은 유지합니다.";
    const unsupported = document.createElement("button"); unsupported.type = "button"; unsupported.disabled = true;
    unsupported.textContent = "그림·그라데이션 배경 · 미지원"; unsupported.title = "기존 조회·적용 계약으로 원본 세부 값을 안전하게 편집할 수 없어 보존합니다. 전용 계약 확인 후 연결할 후속 항목입니다.";
    note.append(unsupported); note.hidden = initialGroup !== "테두리·배경";
    container.append(note); labels.push({ element: note, group: "테두리·배경" });
  }
  // Native form validation runs before submit. Reveal its first invalid field,
  // even when another tab/language currently hides it. Keep the invalid value
  // and every other draft; invalid.preventDefault does not permit submission.
  for (const control of container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")) {
    if (control.hidden || !control.closest("label[data-field]")) continue;
    control.addEventListener("invalid", event => {
      event.preventDefault();
      const first = [...container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")]
        .find(field => field.willValidate && !field.validity.valid);
      if (first !== control) return;
      const label = control.closest<HTMLElement>("label[data-field]"), group = label?.dataset.fieldGroup;
      if (group) buttons.find(button => button.dataset.formatGroup === group)?.click();
      if (kind === "char" && group === "언어별 설정") {
        const language = container.querySelector<HTMLSelectElement>("[name=dialogLanguage]");
        if (language) {
          language.value = /Language([0-6])$/.exec(label?.dataset.field ?? "")?.[1] ?? "all";
          language.dispatchEvent(new Event("change", {bubbles: true}));
        }
      }
      const note = container.closest("form")?.querySelector<HTMLElement>("#format-note");
      if (note) note.textContent = `${fields(kind).find(field => field.name === label?.dataset.field)?.label ?? "입력값"}: 입력값을 확인하세요. ${control.validationMessage}`;
      control.focus();
    });
  }
  if (kind === "char") mountHancomCharacterDialog(container);
  const read = (): Props => {
    validateLayout();
    const props: Props = {};
    for (const f of fields(kind)) {
      if (f.disabled) continue;
      const v = controls.get(f.name)!.value;
      if (!v || v === initial.get(f.name)) continue;
      if (controls.get(f.name)!.disabled)
        throw Error(`${f.label}: NOT_SUPPORTED · 본문 화면 배치 미지원`);
      if (
        f.options &&
        !f.options.some(([value]) => value === v) &&
        !(
          ["shadeColor", "background", "paragraphBackground", "characterBackground"].includes(
            f.name,
          ) && /^#[\da-f]{6}$/i.test(v)
        )
      )
        throw Error(`${f.label}: 지원하지 않는 값`);
      if (
        f.type === "number" &&
        (!Number.isFinite(Number(v)) ||
          Number(v) < f.min! ||
          Number(v) > f.max! ||
          (["장식 효과", "폭·간격", "언어별 폭·간격"].includes(f.group ?? "") &&
            !Number.isInteger(Number(v))))
      )
        throw Error(`${f.label}: 허용 범위를 확인하세요`);
      if (
        /Color$|\.color$/.test(f.name) &&
        v !== "none" &&
        !/^#[\da-f]{6}$/i.test(v)
      )
        throw Error(`${f.label}: #RRGGBB 형식이 필요합니다`);
      if (
        /^font(Language[0-6]|Family)$/.test(f.name) &&
        (!v.trim() || v.length > 200 || /[\x00-\x1f]/.test(v))
      )
        throw Error("글꼴 이름을 확인하세요");
      if (f.name === "scriptMode") { Object.assign(props, scriptDelta(v)); continue; }
      props[f.name] =
        f.options === boolean
          ? v === "true"
          : f.numeric || f.type === "number" || /\.(type|width)$/.test(f.name)
            ? Number(v)
            : v.startsWith("#")
              ? v.toLowerCase()
              : v;
    }
    if (kind === "paragraph") {
      if ("lineSpacingType" in props && !("lineSpacing" in props)) {
        const value = controls.get("lineSpacing")!.value;
        if (!value) throw Error("줄 간격 방식을 바꾼 후 값을 입력하세요");
        props.lineSpacing = Number(value);
      }
      if ("lineSpacing" in props) {
        const type = controls.get("lineSpacingType")!.value;
        if (!["Percent", "Fixed", "Minimum", "SpaceOnly"].includes(type))
          throw Error("줄 간격 방식을 선택하세요");
        props.lineSpacingType = type;
      }
      const tabs = readTabs?.();
      if (tabs !== undefined) props.tabStops = tabs;
    }
    if (kind === "char") assertLanguageDraft(props);
    return kind === "char"
      ? toCoreCharacter(props)
      : kind === "paragraph"
        ? toCoreParagraph(props)
        : cellLayoutInput(props);
  };
  return Object.assign(read, { paragraphAdjustmentChange: () => adjustments?.read() });
}
