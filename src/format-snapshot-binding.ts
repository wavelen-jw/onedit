// Exact Core pair for the Rev14 web test and the opt-in local QA arm.
import { checkedOpenCoreSha256 } from "./ai-checked-open-binding.js";
export const formatSnapshotCoreSha256 = checkedOpenCoreSha256;
export function isRev14WebTestHost(win: Window | undefined): boolean {
  return !!win && win.parent === win && win.location.origin === "https://edit.govpress.cloud";
}
export function formatSnapshotOptIn(win: Window | undefined = typeof window === "undefined" ? undefined : window): boolean {
  if (!win || win.parent !== win) return false;
  if (isRev14WebTestHost(win)) return true;
  const entry = new URL(win.location.href);
  const flags = entry.searchParams.getAll("oneditQaFormatSnapshot");
  return entry.protocol === "http:" && entry.hostname === "127.0.0.1" &&
    flags.length === 1 && flags[0] === "1";
}
