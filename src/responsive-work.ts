export function yieldToBrowser() {
  const scheduler = (globalThis as typeof globalThis & {scheduler?:{yield?:() => Promise<void>}}).scheduler;
  return scheduler?.yield?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0));
}

/** Run read-only work in short browser tasks while preserving its original order. */
export async function finishResponsiveWork<T>(work: Generator<void, T, unknown>, current?: () => boolean): Promise<T> {
  const sliceMs = 12;
  let deadline = performance.now() + sliceMs;
  let part = work.next();
  while (!part.done) {
    if (performance.now() >= deadline) {
      await yieldToBrowser();
      if (current && !current()) {
        throw Error("문서 작업 대상이 변경되었습니다. 다시 시도하세요.");
      }
      deadline = performance.now() + sliceMs;
    }
    part = work.next();
  }
  return part.value;
}
