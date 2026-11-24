export const fontSizeBounds = { min: 1, max: 200 } as const;
export const trackingBounds = { min: -100, max: 100 } as const;

export function readFontSize(draft: string) {
  const value = Number(draft);
  const { min, max } = fontSizeBounds;
  if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(draft.trim()) ||
      !Number.isFinite(value) || value < min || value > max)
    throw Error(`글자 크기는 ${min}~${max}pt 사이의 숫자로 입력하세요.`);
  return value;
}

export function readTracking(draft: string) {
  const value = Number(draft);
  const { min, max } = trackingBounds;
  if (!/^[+-]?[0-9]+$/.test(draft.trim()) ||
      !Number.isSafeInteger(value) || value < min || value > max)
    throw Error(`자간은 ${min}~${max}%의 정수로 입력하세요.`);
  return value;
}
