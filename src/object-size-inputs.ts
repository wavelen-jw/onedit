export function objectPointsToHu(value: string | number): number {
  return Math.round(Number(value) * 100);
}

/** Link the two point inputs using the current object's width-to-height ratio. */
export function bindObjectSizeRatio(
  width: HTMLInputElement,
  height: HTMLInputElement,
  lock: HTMLInputElement,
  getRatio: () => number,
) {
  width.addEventListener("input", () => {
    const points = Number(width.value);
    if (lock.checked && points > 0) {
      height.value = String(Math.round(points * 100 / getRatio()) / 100);
    }
  });
  height.addEventListener("input", () => {
    const points = Number(height.value);
    if (lock.checked && points > 0) {
      width.value = String(Math.round(points * 100 * getRatio()) / 100);
    }
  });
}
