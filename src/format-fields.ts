import { borderLineOptions, borderWidthOptions, sides } from "./formatting.js";

export type FormatField = {
  name: string;
  label: string;
  type?: "number";
  options?: ReadonlyArray<readonly [string, string]>;
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  numeric?: boolean;
};

export function readFormatScalar(field: FormatField, value: string, toggle: boolean) {
  if (toggle) return value === "true";
  if (field.numeric || field.type === "number" || /\.(type|width)$/.test(field.name)) return Number(value);
  return value.startsWith("#") ? value.toLowerCase() : value;
}

export const toggleOptions: [string, string][] = [["true", "켜기"], ["false", "끄기"]];
export const shadeOptions: [string, string][] = [
  ["none", "없음"], ["#ffffff", "흰색"], ["#fff2a8", "노랑"], ["#cceedd", "연두"],
];
const sideLabels = { Left: "왼쪽", Right: "오른쪽", Top: "위", Bottom: "아래" };

export function borderFields(): FormatField[] {
  return sides.flatMap(side => [
    { name: `border${side}.type`, label: `${sideLabels[side]} 테두리`, options: borderLineOptions },
    { name: `border${side}.width`, label: "선 굵기", options: borderWidthOptions },
    { name: `border${side}.color`, label: "선 색 (#RRGGBB)" },
  ]);
}

export function cellAppearanceFields(): FormatField[] {
  return [{ name: "background", label: "셀 배경", options: shadeOptions }, ...borderFields()];
}

export function cellFields(layoutGroup?: string): FormatField[] {
  const group = layoutGroup ? { group: layoutGroup } : {};
  return [
    { name: "verticalAlign", label: "셀 세로 정렬", ...group, numeric: true,
      options: [["0", "위"], ["1", "가운데"], ["2", "아래"]] },
    { name: "applyInnerMargin", label: "셀 안 여백 사용", ...group, options: toggleOptions },
    ...sides.map(side => ({
      name: `padding${side}`, label: `${sideLabels[side]} 안 여백 (pt)`, ...group,
      type: "number" as const, min: 0, max: 327.67, step: 0.01,
    })),
    ...cellAppearanceFields(),
  ];
}
