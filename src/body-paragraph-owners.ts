import type { RhwpAdapter } from "./adapter.js";

/** @internal Pure synchronous body-index enumeration for read-only catalogs.
 * The original native section/paragraph counts still establish the range.
 * Reuse existing update-scoped receipts when available; otherwise read each
 * bound once locally. No callbacks/writes/yields occur while enumerating.
 * A fresh array is returned on EVERY call: no cross-event owner/geometry cache.
 * Typed object/anchor/lock/resource validation remains with each caller. */
export function bodyParagraphOwners(a: RhwpAdapter): {sec:number;para:number}[] {
  const body: {sec:number;para:number}[] = [];
  const sections = a.readStructural('getSectionCount');
  for (let sec = 0; sec < sections; sec++) {
    const paragraphs = a.readStructural('getParagraphCount', sec);
    for (let para = 0; para < paragraphs; para++) body.push({sec, para});
  }
  return body;
}
