import { formatSnapshotCoreSha256, isRev14WebTestHost } from "./format-snapshot-binding.js";
import { cursorModelMemoEnabled, cursorModelFenceEnrolled, cursorModelDispatchEpoch, objectClipboardDispatchEpoch, tableTrackDragDispatchEpoch, screenInputDispatchEpoch as observedScreenEpoch, installCursorMemoFence } from "./cursor-model-memo.js";
import type {Port as FocusedCellPort} from './focused-cell-wire.js';
import type {PassiveOwnerBatchPort} from './passive-owner-batch.js';
import { screenPageReceiptRuntimeSha256 } from "./screen-page-receipt-binding.js";
import {tablePropertyProjectionRuntimeSha256} from "./table-property-projection-binding.js";
import { HwpDocument, HwpBodyClipboard } from '../development/core/rhwp.js';
import { verifiedAssetBytes } from './verified-asset-cache.js';
import {startupNow,startupStage} from './startup-timing.js';

import { isB338OwnerTrialDigest } from "./b338-focused-owner-trial.js";
import { checkedOpenCoreSha256 } from "./ai-checked-open-binding.js";
export const coreRuntimeSha256 = checkedOpenCoreSha256;
type Identity = Readonly<{ sha256: string }>;
type ExternalConstructor = (bytes: Uint8Array, format: 'hwp' | 'hwpx') => HwpDocument;
type Binding = { identity: Identity; create: (bytes?: Uint8Array) => HwpDocument; fragment: (bytes:Uint8Array)=>HwpBodyClipboard; openExternal?: ExternalConstructor };
const documents = new WeakMap<HwpDocument, Binding>();
const checkedDocuments = new WeakSet<HwpDocument>();
// Only this verified factory can grant admission. Installing a fence on a
// prototype already exposed to callers cannot make earlier aliases observable.
const memoOwnedDocuments = new WeakSet<HwpDocument>();
const dispatchOwnedDocuments = new WeakSet<HwpDocument>();
const tableTrackDragOwnedDocuments = new WeakSet<HwpDocument>();
export function tableTrackResizeOptIn(win: Window | undefined = typeof window === "undefined" ? undefined : window): boolean {
  if (!win || win.parent !== win) return false;
  if (isRev14WebTestHost(win)) return true;
  const entry = new URL(win.location.href);
  return entry.protocol === "http:" && entry.hostname === "127.0.0.1" &&
    entry.searchParams.getAll("oneditQaCoreScope").join("/") === "1" &&
    entry.searchParams.getAll("oneditQaTableTrackResize").join("/") === "1";
}
export const coreRuntimeOwnsDispatchFence = (doc:HwpDocument) => dispatchOwnedDocuments.has(doc);
export const coreRuntimeDispatchEpoch = (doc:HwpDocument) =>
  dispatchOwnedDocuments.has(doc) ? cursorModelDispatchEpoch(doc) : undefined;
export const coreRuntimeObjectClipboardEpoch = (doc:HwpDocument) =>
  dispatchOwnedDocuments.has(doc) ? objectClipboardDispatchEpoch(doc) : undefined;
export const coreRuntimeTableTrackDragEpoch = (doc:HwpDocument) =>
  tableTrackDragOwnedDocuments.has(doc) ? tableTrackDragDispatchEpoch(doc) : undefined;
export const coreRuntimeScreenInputEpoch = (doc:HwpDocument) =>
  dispatchOwnedDocuments.has(doc) ? observedScreenEpoch(doc) : undefined;
export const coreRuntimeOwnsCursorMemo = (doc:HwpDocument) => memoOwnedDocuments.has(doc);
/** The web build does not admit the private cursor-model memo. */
export const coreRuntimeRequestsCursorMemo = () => false;

// Internal UI capability provenance is distinct from the selected byte pin.
// This cumulative candidate preserves the inherited implementations/guards;
// evidence and the five transitive layout deltas are mapped in the QA handoff.
// No owner, geometry or operation scope is granted by this identity alone.
export type CoreRuntimeCapability = 'cell-height' | 'width-content-frame' |
  'quantized-height' | 'natural-height' | 'whole-height' | 'merged-grid' |
  'page-number' | 'page-break' | 'columns' | 'textbox' | 'structural-table-frame' | 'local-body-text' | 'proportional-float-height';
const retainedCapabilities: ReadonlySet<CoreRuntimeCapability> = new Set([
  'cell-height', 'width-content-frame', 'quantized-height', 'natural-height',
  'whole-height', 'merged-grid', 'page-number', 'page-break', 'columns', 'textbox',
]);
const inlineTableCapabilities: ReadonlySet<CoreRuntimeCapability> = new Set([
  'cell-height', 'width-content-frame', 'quantized-height', 'natural-height',
  'whole-height', 'merged-grid', 'page-number', 'page-break', 'columns', 'textbox',
]);
// Source-bound cumulative nine-file Core: existing ten guarded operations plus
// the reviewed path-transaction table subset. See private integration provenance.
const structuralTableCapabilities: ReadonlySet<CoreRuntimeCapability> = new Set([
  'cell-height', 'width-content-frame', 'quantized-height', 'natural-height',
  'whole-height', 'merged-grid', 'page-number', 'page-break', 'columns', 'textbox',
  'structural-table-frame',
  // R private2743 compatibility: mutation/owner/flow guards remain mandatory.
  'local-body-text',
]);
const capabilityProvenance = new Map<string, ReadonlySet<CoreRuntimeCapability>>([
  ['f8f90afb88b97ca3c5b9eaadc67c05c244a4c7b6fae20704ed18f057ca6354fa', retainedCapabilities],
  ['eedc3442b2271fbcacd7bfacc4fca6b4e61b961e992042a1f07635d0ff7dd84f', inlineTableCapabilities],
  ['2743c63061f7082ba331b45ce708d41bd29c7329f4c827cabbd8c3993e0c172d', structuralTableCapabilities],
  // Exact W2743 source + reviewed derived inline host/suffix resize correction.
  ['b4bdc0b4d1fa9096e45b87854a3a2561d6da704c2bf7eb0ee4e4a7b54692ad6a', structuralTableCapabilities],
  // Accepted row-flow source unchanged; only paired header unit decoding/encoding.
  // Source/ABI/declared-case and fresh proofs: rhw-hwpunitchar-uniform-fix-20261103.
  ['619b6c478911e9fb2569c35f0a691281afbf32acb61fa16e31684d888af31b13', structuralTableCapabilities],
  // Current paired writer/numeric paths unchanged; one header selector delta.
  // Exact source/ABI/current-vs-candidate proofs: current-reconciliation20261103.
  ['99f4e1d08fa58c870aaf1ed57ece9dd6d66267bd28eef58f501e244ce2bd0a2b', structuralTableCapabilities],
  // Exact current headers/table_ops/query/security code; reviewed cumulative
  // HTML owner-width and typed native-origin empty-host construction contract.
  // Scope/actual acceptance: rhw41-html-object-host-acceptance-20261103.
  ['3c233485edfba95b1af703ee58ecdd6cb8f4786508449e9ee36d044f1249f164', structuralTableCapabilities],
  // User-adopted cumulative dependency/font cohort; exact source/ABI and
  // actual bound/unbound owner12cap proofs: font-stack-acceptance-20261104.
  ['bb0acab7594707e9df6fc89510be2b9c46d4f076af912c4f8b01a711b2ba2991', structuralTableCapabilities],
  // Source-reviewed five-file nested-flow/no-op cohort; all12 inherited guards
  // remain. See qa/rhw64-b-integration-20261105/source-contract.json.
  ['2f63cfaf3bd413d73e270ba88351c28f3cc91366332b78f4c4f665e07fac8f17', structuralTableCapabilities],
  // Reviewed four-file derived pagination/carrier delta;268 unchanged boundaries.
  // Actual source/ABI/guard adjudication: following-pagination-acceptance20261105.
  ['457f8474c587ab63d873409df5b680331ce417eec14737a2758c52de771af374', structuralTableCapabilities],
  // Reviewed empty-body no-op, exact authored carrier and scoped raw-parameter
  // namespace closure;148 inherited boundaries exact. No owner guard weakened.
  ['b0b2dc0fb7ddc977d08eef41b9a7719d0d791c83c21c73bf54760b8ec048d068', structuralTableCapabilities],
  // Exact inherited source plus reviewed empty-bottom-caption stored-band proof.
  // No geometry/owner/command guard changed; qa/rhw64-120dpi-caret-acceptance-20261105.
  ['e4ae3b8210dfa2d14945a806edf63725ce6b78046296f2c8bb5975fa871818e5', structuralTableCapabilities],
  // Source-reviewed SVG bold-paint-only user trial. All1172 other inputs and
  // owner/command/layout/font/resource guards exact; rhw57-browser-bold-trial-20261105.
  ['b971e9361469541edceeb18c063dd6cd6dc0f02daa5295b19d130cb695bfc846', structuralTableCapabilities],
  // Exact current-bold source plus reviewed query-local first-match index only.
  // Source/ABI/private owner contracts: rhw56-query-cumulative-acceptance-20261105.
  ['0431b1fe8e54aa254b5fb775ef008683ee5bb142a65ba4fbbb7bd76275645d89', structuralTableCapabilities],
  // A source-reviewed screen-only immutable generation trial; review.json retains12 contracts.
  ['79b12c4d186841afe7a8c8bcf020d5e1afd6a608a5dfb331e5ed328e4917a115', structuralTableCapabilities],
  // Independently pinned two-path RHW-64 Core trial. Existing capabilities
  // retain their exact source guards; the new inverse is checked in Command.
  ['a4007f45967ef0132f9ccd9573f115ec4e004514db5980eab4fda2e8b69dff33', new Set([...structuralTableCapabilities, 'proportional-float-height'])],
  // Exact A400 command/renderer/source with only an additive read-only projection.
  [tablePropertyProjectionRuntimeSha256, new Set([...structuralTableCapabilities, 'proportional-float-height'])],
  [screenPageReceiptRuntimeSha256, new Set([...structuralTableCapabilities, 'proportional-float-height'])],
]);
// Private synchronous-read contract, independently reviewed from operation flags.
// Both exact bundles retain the query/layout/font/invalidation implementation;
// the only new native delta is an invalidated table resize transaction. Unknown
// or copied identities cannot obtain this certificate from a manifest/byte pin.
const updateReadProvenance = new Set([
  '2743c63061f7082ba331b45ce708d41bd29c7329f4c827cabbd8c3993e0c172d',
  'b4bdc0b4d1fa9096e45b87854a3a2561d6da704c2bf7eb0ee4e4a7b54692ad6a',
  // Header pair preserves synchronous query, ownership and invalidation code.
  '619b6c478911e9fb2569c35f0a691281afbf32acb61fa16e31684d888af31b13',
  // Synchronous query/layout/font/invalidation implementation remains exact.
  '99f4e1d08fa58c870aaf1ed57ece9dd6d66267bd28eef58f501e244ce2bd0a2b',
  // Same synchronous owner/layout/font/resource invalidation implementation.
  '3c233485edfba95b1af703ee58ecdd6cb8f4786508449e9ee36d044f1249f164',
  // Same synchronous owner/layout/font/resource invalidation contract.
  'bb0acab7594707e9df6fc89510be2b9c46d4f076af912c4f8b01a711b2ba2991',
  // Existing synchronous epoch/barriers retained; no-op preserves pending work.
  '2f63cfaf3bd413d73e270ba88351c28f3cc91366332b78f4c4f665e07fac8f17',
  // Existing synchronous query/font/owner invalidation retained; no new cache.
  '457f8474c587ab63d873409df5b680331ce417eec14737a2758c52de771af374',
  'b0b2dc0fb7ddc977d08eef41b9a7719d0d791c83c21c73bf54760b8ec048d068',
  'e4ae3b8210dfa2d14945a806edf63725ce6b78046296f2c8bb5975fa871818e5',
  'b971e9361469541edceeb18c063dd6cd6dc0f02daa5295b19d130cb695bfc846',
  '0431b1fe8e54aa254b5fb775ef008683ee5bb142a65ba4fbbb7bd76275645d89',
  '79b12c4d186841afe7a8c8bcf020d5e1afd6a608a5dfb331e5ed328e4917a115',
  'a4007f45967ef0132f9ccd9573f115ec4e004514db5980eab4fda2e8b69dff33',
  tablePropertyProjectionRuntimeSha256,
  screenPageReceiptRuntimeSha256,
]);
// Additional PRIVATE operation certificate; old/unbound/lookalike documents
// cannot acquire nested creation merely from the existing12 capabilities.
const nestedTableCreationProvenance = new Set(['2f63cfaf3bd413d73e270ba88351c28f3cc91366332b78f4c4f665e07fac8f17', '457f8474c587ab63d873409df5b680331ce417eec14737a2758c52de771af374', 'b0b2dc0fb7ddc977d08eef41b9a7719d0d791c83c21c73bf54760b8ec048d068', 'e4ae3b8210dfa2d14945a806edf63725ce6b78046296f2c8bb5975fa871818e5', 'b971e9361469541edceeb18c063dd6cd6dc0f02daa5295b19d130cb695bfc846', '0431b1fe8e54aa254b5fb775ef008683ee5bb142a65ba4fbbb7bd76275645d89', '79b12c4d186841afe7a8c8bcf020d5e1afd6a608a5dfb331e5ed328e4917a115', 'a4007f45967ef0132f9ccd9573f115ec4e004514db5980eab4fda2e8b69dff33', tablePropertyProjectionRuntimeSha256, screenPageReceiptRuntimeSha256]);
export function coreRuntimeSupportsNestedTableCreation(doc: HwpDocument | undefined): boolean {
  const digest = doc && coreRuntimeIdentity(doc)?.sha256;
  return !!digest && (nestedTableCreationProvenance.has(digest)||isB338OwnerTrialDigest(digest));
}

export function coreRuntimeHasUpdateReadProvenance(doc: HwpDocument | undefined): boolean {
  const digest = doc && coreRuntimeIdentity(doc)?.sha256;
  return !!digest && (updateReadProvenance.has(digest)||isB338OwnerTrialDigest(digest));
}

export function coreRuntimeHasCapability(doc: HwpDocument | undefined, capability: CoreRuntimeCapability): boolean {
  // Only a document born from the verified private module has a binding.
  // A manifest, copied identity, unknown object or unbound native doc cannot grant it.
  const binding = doc && documents.get(doc);
  return !!binding && capabilityProvenance.get(isB338OwnerTrialDigest(binding.identity.sha256)?screenPageReceiptRuntimeSha256:binding.identity.sha256)?.has(capability) === true;
}


function blank(doc: HwpDocument) {
  try {
    const result = JSON.parse(doc.createBlankDocument());
    if (result.error || result.ok === false) throw Error(result.error || '빈 문서 초기화 실패');
    return doc;
  } catch (error) { doc.free(); throw error; }
}

// One checked byte source, one compiled module. Cache metadata, a manifest or
// a version/user claim never supplies the runtime identity.
export async function loadCoreRuntime() {
  let stage=startupNow();
  const asset = new URL('./'+coreRuntimeSha256+'-rhwp_bg.wasm', import.meta.url);
  const bytes = await verifiedAssetBytes(asset, coreRuntimeSha256, 'wasm');
  const sha256 = coreRuntimeSha256; // verifiedAssetBytes checks the actual bytes, including cache hits.
  startupStage('core-verified-bytes',stage);stage=startupNow();
  const module = await WebAssembly.compile(bytes);
  startupStage('core-compile',stage);stage=startupNow();
  // wasm-bindgen init/initSync may return a previously initialized instance.
  // A private, fresh glue module has no previous instance to substitute. Pass
  // the exact compiled module; its initialization cannot fetch another WASM.
  const glue = new URL('../development/core/rhwp.js', import.meta.url);
  glue.searchParams.set('ui-runtime', crypto.randomUUID());
  const api = await import(glue.href) as typeof import('../development/core/rhwp.js');
  await api.default({ module_or_path: module });
  startupStage('core-private-init',stage);
  // Active Workset observes native dispatch without enabling the M cache.
  const observeTableTrackCaret = sha256 === formatSnapshotCoreSha256 && tableTrackResizeOptIn(window) &&
    (isRev14WebTestHost(window) ||
      new URL(window.location.href).searchParams.getAll("perf40ActiveWorkset").join("/") === "1");
  const enrollFence = window.parent === window
    ? installCursorMemoFence(api.HwpDocument.prototype, 'observe', observeTableTrackCaret) : undefined;
  const ctor = api.HwpDocument;
  const openExternal = sha256 === checkedOpenCoreSha256 && typeof ctor.openExternalDocument === 'function'
    ? ctor.openExternalDocument.bind(ctor) : undefined;
  const bind = (doc: HwpDocument) => {
    try {
      documents.set(doc, binding);
      if (enrollFence) {
        enrollFence(doc);
        if (cursorModelFenceEnrolled(doc)) {
          dispatchOwnedDocuments.add(doc);
          if (observeTableTrackCaret) tableTrackDragOwnedDocuments.add(doc);
        }
        if (cursorModelMemoEnabled(doc)) memoOwnedDocuments.add(doc);
      }
      return doc;
    } catch (error) {
      documents.delete(doc);
      doc.free();
      throw error;
    }
  };
  const binding: Binding = {
    ...(openExternal ? {openExternal: (bytes, format) => bind(openExternal(bytes, format))} : {}),
    identity: Object.freeze({ sha256 }),
    fragment: bytes => api.HwpBodyClipboard.fromFragmentBytes(bytes),
    create: input => bind(input === undefined ? blank(api.HwpDocument.createEmpty()) : new api.HwpDocument(input)),
  };
  Object.freeze(binding);
  return Object.freeze({
    createDocument: binding.create,
    ownerBatchPortFor: undefined as ((doc: HwpDocument) => PassiveOwnerBatchPort | undefined) | undefined,
    focusedCellPortFor: undefined as ((doc: HwpDocument) => FocusedCellPort | undefined) | undefined,
  });
}

export function coreRuntimeIdentity(doc: HwpDocument): Identity | undefined {
  return documents.get(doc)?.identity;
}

export function hasCheckedExternalOpen(source: HwpDocument): boolean {
  return !!documents.get(source)?.openExternal;
}
export function isCheckedExternalSibling(source: HwpDocument, detached: HwpDocument): boolean {
  return source !== detached && checkedDocuments.has(detached) && documents.get(source) === documents.get(detached);
}
export function checkedExternalSibling(source: HwpDocument, bytes: Uint8Array, format: 'hwp' | 'hwpx') {
  const binding = documents.get(source);
  if (!binding?.openExternal) throw Error('OPEN_CAPABILITY_UNAVAILABLE');
  const next = binding.openExternal(bytes, format);
  try {
    const dpi = source.getDpi();
    if (next.getDpi() !== dpi) next.setDpi(dpi);
    checkedDocuments.add(next);
    return next;
  } catch (error) {
    documents.delete(next);
    next.free();
    throw error;
  }
}

// wasm-bindgen clipboard handles must be allocated by the document's own
// private glue instance. A same-version class from another import is not enough.
export function fragmentForDocument(doc:HwpDocument,bytes:Uint8Array):HwpBodyClipboard {
  return documents.get(doc)?.fragment(bytes) ?? HwpBodyClipboard.fromFragmentBytes(bytes);
}

// Document replacement/export probes retain the same Core instance. Legacy
// callers remain unverified; constructing a lookalike object grants nothing.
export function siblingDocument(source: HwpDocument, bytes?: Uint8Array): HwpDocument {
  const binding = documents.get(source);
  const sibling = binding ? binding.create(bytes) :
    bytes === undefined ? blank(HwpDocument.createEmpty()) : new HwpDocument(bytes);
  try {
    // DPI is this document's rendering context, not a saved document property.
    // Compare the complete reopened semantic in the source's units; retain the
    // same private runtime and all existing loss/meaning checks.
    const dpi = source.getDpi();
    if (sibling.getDpi() !== dpi) sibling.setDpi(dpi);
    return sibling;
  } catch (error) { sibling.free(); throw error; }
}
