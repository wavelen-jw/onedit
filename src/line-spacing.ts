export const lineSpacingModes = [
  ["Percent", "글자에 따라 (%)", "%"],
  ["Fixed", "고정값 (pt)", "pt"],
  ["Minimum", "최소 (pt)", "pt"],
  ["SpaceOnly", "여백만 (pt)", "pt"],
] as const;

export const lineSpacingBounds = { min: 1, max: 1000 } as const;

export function lineSpacingMode(value: unknown) {
  return lineSpacingModes.find(([type]) => type === value);
}

export function readLineSpacing(type: string, draft: string) {
  const mode = lineSpacingMode(type);
  if (!mode) throw Error("줄 간격 방식을 선택하세요.");
  const value = Number(draft);
  const { min, max } = lineSpacingBounds;
  const unit = mode[2];
  if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(draft) ||
      !Number.isFinite(value) || value < min || value > max ||
      (unit === "%" && !Number.isInteger(value))) {
    throw Error(unit === "%"
      ? `줄 간격은 ${min}~${max}% 정수로 입력하세요.`
      : `줄 간격은 ${min}~${max}pt 사이의 숫자로 입력하세요.`);
  }
  return { lineSpacingType: mode[0], lineSpacing: value };
}
