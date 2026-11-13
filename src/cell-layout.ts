import type { Props } from './model.js';

export const cellPaddingKeys = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'] as const;
export const cellLayoutKeys = ['verticalAlign', 'applyInnerMargin', ...cellPaddingKeys] as const;
export const hasCellLayout = (props: Props) => cellLayoutKeys.some(k => k in props);
export const cellLayoutHold = '병합 셀 안 여백·세로 정렬의 새 연결은 검증 전 보류합니다.';

// setCellProperties consumes signed i16 HWPUNIT for padding, not paragraph IR units.
export function cellLayoutInput(props: Props): Props {
  const patch = { ...props };
  for (const k of cellPaddingKeys) if (k in patch) {
    const hu = Number(patch[k]) * 100;
    if (!Number.isFinite(hu) || Math.abs(hu - Math.round(hu)) > 1e-7)
      throw Error('셀 안 여백은 0.01pt 단위로 입력하세요.');
    patch[k] = Math.round(hu);
  }
  return patch;
}

export function validateCellLayout(current: Record<string, any>, props: Props) {
  if ('verticalAlign' in props && ![0, 1, 2].includes(props.verticalAlign as number))
    throw Error('셀 세로 정렬은 위·가운데·아래만 지원합니다.');
  if ('applyInnerMargin' in props && typeof props.applyInnerMargin !== 'boolean')
    throw Error('셀 안 여백 사용 여부를 확인하세요.');
  for (const k of cellPaddingKeys) if (k in props &&
      (!Number.isInteger(props[k]) || Number(props[k]) < 0 || Number(props[k]) > 32767))
    throw Error('셀 안 여백은 0~327.67pt 범위입니다.');
  const next = { ...current, ...props };
  if (next.applyInnerMargin === true) {
    const values = [next.width, next.height, ...cellPaddingKeys.map(k => next[k])];
    if (!values.every(Number.isFinite) || next.paddingLeft + next.paddingRight >= next.width ||
        next.paddingTop + next.paddingBottom >= next.height)
      throw Error('셀 안 여백이 셀 너비·높이 안에 들어가야 합니다. 크기를 자동 보정하지 않습니다.');
  }
}
