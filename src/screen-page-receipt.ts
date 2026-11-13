import { isB338OwnerTrialDigest } from "./b338-focused-owner-trial.js";
import type { HwpDocument } from "../development/core/rhwp.js";
import { coreRuntimeIdentity } from "./core-runtime.js";

/** The view key is supplied from authoritative browser font registration,
 * DPI/DPR/zoom and SVG presentation policy. Never use model revision here. */
export type ScreenPageView = Readonly<{ key:string; composing:boolean }>;
declare const brand:unique symbol;
export type ScreenPageReceipt = Readonly<{ [brand]:true }>;
type Token = { doc:HwpDocument;page:number;view:string;token:string };
const tokens=new WeakMap<ScreenPageReceipt,Token>();
export type ScreenPageDecision =
  | Readonly<{status:"reuse";receipt:ScreenPageReceipt;pageCount:number;comparison:"sameTree"|"equalPaintInput";witnessBytes:number}>
  | Readonly<{status:"render";receipt:ScreenPageReceipt;pageCount:number;reason:"paintInputChanged"|"noCurrentReceipt";witnessBytes:number}>
  | Readonly<{status:"fallback";reason:string}>;
const fallback=(reason:string):ScreenPageDecision=>({status:"fallback",reason});
const reasons=new Set(["invalidRequest","layoutPending","missingPage","unsupportedOutput","portableMetrics",
  "pageTree","witnessBudget","treeBudget","invalidVariants","supplementalMetrics","unsupportedPaint","serialExhausted"]);
const uint=(n:unknown):n is number=>Number.isSafeInteger(n)&&(n as number)>=0;

/** Screen SVG reuse only. Do not use this result as geometry, selection or
 * command evidence. Process one page at a time in the synchronous render.
 * Adopt a render receipt only after the existing SVG is successfully mounted. */
export function prepareScreenPageReceipt(
  doc:HwpDocument,page:number,view:ScreenPageView,previous?:ScreenPageReceipt,
):ScreenPageDecision {
  if (view.composing) return fallback("composition");
  if (!isB338OwnerTrialDigest(coreRuntimeIdentity(doc)?.sha256))
    return fallback("unsupportedRuntime");
  if (!uint(page)||page>0xffff_ffff||typeof view.key!=="string"||!view.key||view.key.length>256)
    return fallback("invalidRequest");
  const old=previous&&tokens.get(previous);
  const oldToken=old&&old.doc===doc&&old.page===page&&old.view===view.key?old.token:"";
  const native=(doc as HwpDocument & {oneditPrepareScreenPageReceiptV1?:(page:number,old:string,view:string)=>string}).oneditPrepareScreenPageReceiptV1;
  if (typeof native!=="function") return fallback("invalidResponse");
  let reply:any;
  try {
    const raw=native.call(doc,page,oldToken,view.key);
    if (typeof raw!=="string"||raw.length>1024) return fallback("invalidResponse");
    reply=JSON.parse(raw);
  } catch {return fallback("invalidResponse");}
  if (!reply||typeof reply!=="object"||Array.isArray(reply)) return fallback("invalidResponse");
  if (reply.status==="fallback"&&reasons.has(reply.reason)) return fallback(reply.reason);
  if (reply.page!==page||!uint(reply.pageCount)||reply.pageCount<=page||
      !uint(reply.witnessBytes)||!reply.witnessBytes||reply.witnessBytes>262144||
      typeof reply.receipt!=="string"||!/^\d{1,10}:\d{1,20}:\d{1,20}$/.test(reply.receipt))
    return fallback("invalidResponse");
  if (reply.status==="reuse"&&previous&&oldToken&&reply.receipt===oldToken&&
      (reply.comparison==="sameTree"||reply.comparison==="equalPaintInput"))
    return {status:"reuse",receipt:previous,pageCount:reply.pageCount,comparison:reply.comparison,witnessBytes:reply.witnessBytes};
  if (reply.status==="render"&&(reply.reason==="paintInputChanged"||reply.reason==="noCurrentReceipt")) {
    const receipt=Object.freeze({}) as ScreenPageReceipt;
    tokens.set(receipt,{doc,page,view:view.key,token:reply.receipt});
    return {status:"render",receipt,pageCount:reply.pageCount,reason:reply.reason,witnessBytes:reply.witnessBytes};
  }
  return fallback("invalidResponse");
}
