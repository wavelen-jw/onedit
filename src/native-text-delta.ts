/** Native textarea edits are UTF-16; Core positions are Unicode scalars. No
 * normalization or jamo joining: preserve the exact browser-produced string. */
export function nativeTextDelta(before: string, after: string) {
  if (before.length > 8192 || after.length > 8192) throw Error('입력 범위가 너무 깁니다.');
  const a = [...before], b = [...after];
  let from = 0, tail = 0;
  while (from < a.length && from < b.length && a[from] === b[from]) from++;
  while (tail < a.length - from && tail < b.length - from && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return { from, to: a.length - tail, text: b.slice(from, b.length - tail).join('') };
}

// Retire committed receiver context well BEFORE the delta bound, after the
// browser's completed input only. A long ordinary typing run must not hit that
// bound on its next key. Active composition is never truncated/reset here.
export function retainNativeText(value: string) {
  return value.length > 0 && value.length < 4096 && !/[\r\n]/u.test(value);
}
