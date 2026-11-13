import { checkedOpenCoreSha256 } from "./ai-checked-open-binding.js";
// Fixed Rev10 evaluation ON arm. The URL cannot select another Core.
export const rev10WebCoreSha256 = "719e974a3bc5af80f89443cc98f847829467d15de654d9af569d6ab0deb9d448";
export function isB338OwnerTrialDigest(digest: string | undefined) {
  return digest === rev10WebCoreSha256 || digest === checkedOpenCoreSha256;
}
export const perf4TableReasonOwnerEnabled = (win: Window | null, digest: string | undefined) =>
  !!win && win.parent === win && isB338OwnerTrialDigest(digest);
export const perf4QuickFormatEnabled = perf4TableReasonOwnerEnabled;
export const studioS6DormantToolsEnabled = perf4TableReasonOwnerEnabled;
export const studioTableClickScopedEnabled = (_win: Window | null, _digest: string | undefined) => false;
export const isMergedValignCoreDigest = isB338OwnerTrialDigest;
