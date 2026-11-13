import { cellPaddingKeys } from "./cell-layout.js";
import { normalizeUnderlineChange } from "./line-position.js";
import { summarizeFormatValues } from "./format-value-state.js";
import type { Props } from "./model.js";
export type FormatKind = "char" | "paragraph" | "cell";
export type FormatState = Record<string, Props[string] | string[] | undefined>;
export const keepWithNextHold =
  "다음 문단과 함께 새 활성화 보류: 저장 속성은 보존되지만 설치 Core 쪽 배치 실패 · B 계약 검토 중";
export const lineProtectionBodyUnsupported = (
  name: "keepLines" | "widowOrphan",
) =>
  `NOT_SUPPORTED: ${name === "keepLines" ? "줄 함께" : "외톨이줄 보호"}의 일반 본문 배치는 미지원입니다. 새 활성화는 보류하며 기존 값 유지·명시적 해제는 가능합니다.`;
export const sides = ["Left", "Right", "Top", "Bottom"] as const;
export const metricKeys = [
  "ratios",
  "spacings",
  "relativeSizes",
  "charOffsets",
] as const;
export const languages = [
  "한글",
  "영문",
  "한자",
  "일어",
  "외국어",
  "기호",
  "사용자",
] as const;
export const charKeys = [
  "underlineType",
  "emboss",
  "engrave",
  "underlineShape",
  "strikeShape",
  "outlineType",
  "shadowType",
  "shadowColor",
  "shadowOffsetX",
  "shadowOffsetY",
  "emphasisDot",
  "kerning",
  "fontFamily",
  "fontSize",
  "bold",
  "italic",
  "underline",
  "underlineColor",
  "strikeColor",
  "strikethrough",
  "superscript",
  "subscript",
  "textColor",
  "shadeColor",
];
export const paraKeys = [
  "headType", "numberingId", "paraLevel",
  "singleLine",
  "verticalAlign",
  "englishBreakUnit",
  "koreanBreakUnit",
  "borderConnect",
  "borderIgnoreMargin",
  "tabAutoLeft",
  "tabAutoRight",
  "tabStops",
  "widowOrphan",
  "keepWithNext",
  "keepLines",
  "pageBreakBefore",
  "fontLineHeight",
  "autoSpaceKrEn",
  "autoSpaceKrNum",
  "alignment",
  "indent",
  "marginLeft",
  "marginRight",
  "lineSpacing",
  "lineSpacingType",
  "spacingBefore",
  "spacingAfter",
];
export const bodyBorderHold =
  "NOT_SUPPORTED: 일반 본문 여백 무시·좌우 테두리 간격은 저장만 지원하고 화면에는 반영되지 않습니다. 기존 값은 보존됩니다.";
// Read-only projection for UI/comparison. Core remains the document authority.
export function displayed(kind: FormatKind, raw: any): Props {
  const p: Props = {};
  if (kind === "char") {
    for (const k of charKeys) p[k] = raw[k];
    p.fontSize = Number(raw.fontSize) / 100;
    p.characterBackground = raw.fillType === "solid" ? raw.fillColor : raw.fillType === "none" ? "none" : undefined;
    for (const side of sides) for (const key of ["type", "width", "color"])
      p[`charBorder${side}.${key}`] = raw[`border${side}`]?.[key];
    languages.forEach(
      (_, i) =>
        (p[`fontLanguage${i}`] =
          raw[`fontLanguage${i}`] ?? raw.fontFamilies?.[i]),
    );
    // A1fd: per-character getter is not an all-language common family.
    const families = languages.map((_, i) => p[`fontLanguage${i}`]);
    if (typeof families[0] === "string" && families.every(f => f === families[0]))
      p.fontFamily = families[0];
    else delete p.fontFamily;
    for (const key of metricKeys)
      languages.forEach((_, i) => (p[`${key}Language${i}`] = raw[key]?.[i]));
    for (const key of metricKeys)
      p[key] =
        Array.isArray(raw[key]) && raw[key].every((v: any) => v === raw[key][0])
          ? raw[key][0]
          : undefined;
  } else if (kind === "paragraph") {
    for (const k of paraKeys) p[k] = raw[k];
    p.paragraphBackground =
      raw.fillType === "solid"
        ? raw.fillColor
        : raw.fillType === "none"
          ? "none"
          : undefined!;
    sides.forEach((side, i) => {
      for (const key of ["type", "width", "color"])
        p[`border${side}.${key}`] = raw[`border${side}`]?.[key];
      p[`borderGap${i}`] = Number(raw.borderSpacing?.[i]) / 100;
    });
    if (raw.lineSpacingType !== "Percent")
      p.lineSpacing = rounded(Number(raw.lineSpacing) * 0.75);
    for (const k of ["indent", "marginLeft", "marginRight"])
      p[k] = rounded(Number(raw[k]) * 0.75);
    for (const k of ["spacingBefore", "spacingAfter"])
      p[k] = rounded(
        (Number(raw[k]) * 0.75) / Number(raw.spacingUnitScale ?? 1),
      );
  } else {
    p.verticalAlign = raw.verticalAlign;
    p.applyInnerMargin = raw.applyInnerMargin;
    for (const k of cellPaddingKeys) p[k] = Number(raw[k]) / 100;
    // Core exposes only solid/no-fill; exotic fill details are not editable here.
    p.background = raw.fillType === "solid" ? raw.fillColor : "none";
    for (const side of sides)
      for (const key of ["type", "width", "color"])
        p[`border${side}.${key}`] = raw[`border${side}`][key];
  }
  return p;
}
const rounded = (v: number) => Math.round(v * 100) / 100;
export function mixed(rows: Props[]): FormatState {
  return summarizeFormatValues(rows);
}
export function toCoreParagraph(p: Props): Props {
  const out = { ...p };
  for (let i = 0; i < 4; i++)
    if (`borderGap${i}` in out)
      out[`borderGap${i}`] = Math.round(Number(out[`borderGap${i}`]) * 100);
  // Core paragraph IR is 2x HWPUNIT; serializer writes pt * 100.
  if (
    "lineSpacing" in out &&
    ["Fixed", "Minimum", "SpaceOnly"].includes(String(out.lineSpacingType))
  )
    out.lineSpacing = Math.round(Number(out.lineSpacing) * 200);
  for (const k of ["indent", "marginLeft", "marginRight"])
    if (k in out) out[k] = Math.round(Number(out[k]) * 200);
  for (const k of ["spacingBefore", "spacingAfter"])
    if (k in out) {
      out[k] = Math.round(Number(out[k]) * 100);
      out.spacingUnitScale = 1;
    }
  return out;
}
export function toCoreCharacter(p: Props): Props {
  const out = { ...p };
  if ("fontSize" in out) out.fontSize = Math.round(Number(out.fontSize) * 100);
  for (const k of metricKeys)
    if (k in out) out[k] = Array(7).fill(Number(out[k]));
  if (out.emboss === true && out.engrave === true)
    throw Error("양각과 음각을 동시에 켤 수 없습니다.");
  if (out.emboss === true) out.engrave = false;
  if (out.engrave === true) out.emboss = false;
  return normalizeUnderlineChange(out);
}
// Compare command values in Core input units with Core getter values.
export function matches(
  kind: FormatKind,
  raw: any,
  key: string,
  value: any,
  props: Props,
): boolean {
  if (kind === "char" && (key === "characterBackground" || /^charBorder(Left|Right|Top|Bottom)\./.test(key))) {
    const current = displayed(kind, raw)[key];
    return typeof current === "string" && typeof value === "string" ? current.toLowerCase() === value.toLowerCase() : current === value;
  }
  const metric =
    /^(ratios|spacings|relativeSizes|charOffsets)Language([0-6])$/.exec(key);
  if (kind === "char" && metric)
    return (
      !(metric[1] in props) && raw[metric[1]]?.[Number(metric[2])] === value
    );
  if (kind === "char" && /^fontLanguage[0-6]$/.test(key))
    return (
      !("fontFamily" in props) &&
      raw.fontFamilies?.[Number(key.at(-1))] === value
    );
  if (kind === "paragraph" && key === "tabStops")
    return JSON.stringify(raw[key]) === JSON.stringify(value);
  if (kind === "char" && metricKeys.includes(key as any))
    return (
      Array.isArray(raw[key]) &&
      Array.isArray(value) &&
      raw[key].length === 7 &&
      value.length === 7 &&
      raw[key].every((v: any, i: number) => v === value[i])
    );
  if (
    kind === "char" &&
    key === "fontFamily" &&
    Array.isArray(raw.fontFamilies)
  )
    return raw.fontFamilies.every((f: string) => f === value);
  if (kind === "paragraph") {
    if (key === "borderSpacing")
      return (
        Array.isArray(raw[key]) &&
        Array.isArray(value) &&
        value.length === 4 &&
        raw[key].length === 4 &&
        raw[key].every((v: number, i: number) => v === value[i])
      );
    if (/^borderGap[0-3]$/.test(key))
      return raw.borderSpacing?.[Number(key.at(-1))] === value;
    if (
      key === "paragraphBackground" ||
      /^border(Left|Right|Top|Bottom)\./.test(key)
    )
      return displayed(kind, raw)[key] === value;
    if (
      key === "lineSpacing" &&
      props.lineSpacingType &&
      props.lineSpacingType !== raw.lineSpacingType
    )
      return false;
    if (
      key === "lineSpacing" &&
      (props.lineSpacingType ?? raw.lineSpacingType) !== "Percent"
    )
      return Math.abs(Number(raw[key]) * 150 - Number(value)) < 2;
    if (key === "spacingUnitScale") return true; // input-unit hint, not a document attribute
    if (["spacingBefore", "spacingAfter"].includes(key))
      return (
        Math.abs(
          (Number(raw[key]) * 75) / Number(raw.spacingUnitScale ?? 1) -
            Number(value) /
              Number(props.spacingUnitScale ?? raw.spacingUnitScale ?? 1),
        ) < 4
      );
    if (["indent", "marginLeft", "marginRight"].includes(key))
      return Math.abs(Number(raw[key]) * 150 - Number(value)) < 8;
  }
  if (kind === "cell" && (cellPaddingKeys as readonly string[]).includes(key)) return raw[key] === value;
  return (kind === "cell" ? displayed(kind, raw)[key] : raw[key]) === value;
}

// D2 nested-paragraph contract retained independently of expanded ordinary UI.
export function validateParagraphDelta(props: Props) {
  for (const [key, value] of Object.entries(props)) {
    if (
      ![
        "alignment",
        "indent",
        "marginLeft",
        "marginRight",
        "lineSpacing",
        "lineSpacingType",
        "spacingBefore",
        "spacingAfter",
        "spacingUnitScale",
      ].includes(key)
    ) {
      const labels: Record<string, string> = {
        widowOrphan: "외톨이줄 보호",
        keepWithNext: "다음 문단과 함께",
        keepLines: "줄 함께",
      };
      throw Error(
        `NOT_SUPPORTED: 중첩 문단에서는 ${labels[key] ?? key} 변경을 지원하지 않습니다. 지원되는 정렬·간격만 변경해 주세요. (미지원 문단 서식 속성: ${key})`,
      );
    }
    if (key === "alignment") {
      if (
        ![
          "left",
          "right",
          "center",
          "justify",
          "distribute",
          "split",
          "division",
        ].includes(String(value))
      )
        throw Error("잘못된 문단 정렬입니다.");
    } else if (key === "lineSpacingType") {
      if (value !== "Percent")
        throw Error("줄 간격 변경은 비율(%)만 지원합니다.");
    } else if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (key !== "indent" && value < 0) ||
      (["lineSpacing", "spacingUnitScale"].includes(key) && value <= 0)
    )
      throw Error("잘못된 문단 서식 수치입니다.");
  }
}
