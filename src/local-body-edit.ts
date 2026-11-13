import type { RhwpAdapter } from "./adapter.js";
import type { Position } from "./model.js";

// Existing Core API's scalar domain, not UTF-16 or logical control slots.
// This is a private trial gate. No public Core capability is inferred from a name.
export function localBodyRequest(a: RhwpAdapter, from: Position, to: Position, text: string) {
  if (!a.localBodyTextIdentified || from.kind !== "body" || to.kind !== "body" ||
      from.sec !== to.sec || from.para !== to.para || from.offset > to.offset ||
      text.length > 16 || /[\r\n\t]/u.test(text)) return;
  const count = Array.from(text).length;
  if (count > 8) return;
  a.validate(from); a.validate(to); a.assertEditable(from); a.assertTextOnly(from);
  // Fields, controls and layout objects retain their established edit route.
  // A nearby table in another paragraph does not grant or remove ownership.
  // The existing Core query returns one raw position for EVERY control in
  // this validated paragraph, including structural markers. Its empty array
  // is equivalent to the former document-wide ROOT control-membership test.
  // Keep fail-closed behavior for a non-array reply and all existing guards.
  const controls = a.call<number[]>("getControlTextPositions", from.sec, from.para);
  if (!Array.isArray(controls) || controls.length) return;
  const start = a.textOffset(from), end = a.textOffset(to);
  if (end < start || end - start > 8 || to.offset - from.offset !== end - start ||
      a.logical(from, start) !== from.offset || a.logical(to, end) !== to.offset) return;
  return { start, count, deleted: end - start };
}
