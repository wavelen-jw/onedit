import { bindEditorDialogFormSubmit, bindEditorPopupFocus, closeEditorDialog, showDocumentEditingDialog, showEditorDialog } from "./editor-popup-focus.js";
import {coreRuntimeScreenInputEpoch as screenInputDispatchEpoch} from "./core-runtime.js";
import {activeWorkset, activePageRange} from "./active-workset.js";
import { withQaReadPhase, qaReadPhaseSnapshot } from "./cursor-model-memo.js";
import { studioTableClickScopedEnabled } from "./b338-focused-owner-trial.js";
import { configureEditorDisplay, publishEditorDisplay, readEditorDisplay } from "./editor-state-coordinator.js";
import { f5Render, f5SliceEnabled, ordinaryF5Grid, type F5Epoch } from "./f5-render-transaction.js";
import { cellDialogFor } from "./cell-dialog-command.js";
import { editMenuState } from "./integration/a-edit-menu.js";
import {screenSelection,visibleSelectionPages as readVisibleSelectionPages} from './screen-selection-projection.js';
import type {OwnerProjection} from './owner-projection.js';
import {configureReporting,declareReportingRuntime} from './diagnostics/report-ui.js';
import {freezeDiagnostic,knownDiagnosticError} from './diagnostics/runtime.js';
import {documentFontNames} from './font-provider.js';
import {mountTypingFormatPresentation,keepTypingFormatPresentation,checkpointFormatPresentation,withFormatPresentationRead,readFormatPresentation} from './typing-format-presentation.js';
import { connectConfiguredAIHost } from "./ai-integration/channel.js";
import { installMarkdownImport } from './markdown-import-ui.js';
import {mountMenuLabels} from './menu-labels.js';
import { initializeBlankDocument } from './blank-document-defaults.js';
import { createPagePresenter, type ScreenReceiptView } from "./page-presenter.js";
import {mountCaretVisibility} from './caret-visibility.js';
import {compositionCursorBoxes,paintCompositionCursor} from './composition-cursor.js';
import {mountExternalFileDrop} from './external-file-drop.js';
import {compositionCommitKey} from './composition-commit-key.js';
import { characterStatistics } from "./document-statistics.js";
import { specialEditingStatus } from "./status-statistics.js";
import {startupMark} from './startup-timing.js';
import { applyUserMenuDecisions } from './user-menu-decisions.js';
import {bodyWordAtPoint} from "./body-word-selection.js";
import {paintBodyCorners} from './body-corner-guides.js';
import {captureParentTableCut} from './parent-table-cut.js';
import {captureCellBlockObjectCut} from './cell-block-cut.js';
import {UnsupportedTableOperation,recordTableRefusal,tableOperationNotice} from './table-capability.js';
import {authorizeLocalResize,localResizeCommand} from './cell-local-resize.js';
import { mountTextboxEditor } from "./textbox-edit-ui.js";
import { clipboardPictureSize } from "./clipboard-image.js";
import { pasteCompletion } from "./external-text-format.js";
import { mountPasteResult } from "./paste-result-ui.js";
import { offerPlainPaste, PasteFormatUnavailable } from "./paste-format-fallback.js";
import { clipboardMarkdownTable } from "./clipboard-markdown-table.js";
import { selectionPaintBoxes } from "./selection-display.js";
import { viewportPoint,pagePoint } from "./integration/a-view-menu.js";
import { paintTableGuides } from "./table-guides.js";
import { applyViewMarkers } from "./view-markers.js";
import { mountFormatAdditions } from "./format-additions-menu.js";
import { formatUIBlockReason } from "./format-ui-state.js";
import { formatToggleState, markFormatToggle } from "./format-value-state.js";
import { cellToolbarContext, rememberCellToolbar, projectToolbarAdmission, syncCommandToolbar, runHistory, revealCommandSelection } from "./command-state-integration.js";
import {
  clipboardSupport,
  mayRestoreClipboardFocus,
} from "./clipboard-ui-state.js";
import { nativeSavePicker } from "./native-save-picker.js";
import { FileLifecycle, downloadHwpx } from "./file-lifecycle.js";
import { type FormatKind, type FormatState } from "./formatting.js";
import { mountFields } from "./format-dialog.js";
import { NextHostAdapter } from "./host.js";
import { mountCompositionInput } from "./composition-input.js";
import { mountQaInputBoundary } from "./qa-input-boundary.js";
import { mountKeyboardInput } from "./keyboard-input.js";
import { mountNativeClipboardInput } from "./native-clipboard-input.js";
import { readClipboard, readNativePaste, writeClipboard, type ClipboardRead, type NativePastePayload } from "./clipboard-transport.js";
import { selectedCutObject } from './object-clipboard.js';
import { loadCoreRuntime,coreRuntimeSha256,coreRuntimeIdentity } from "./core-runtime.js";
import type { LiveComposition } from "./live-composition.js";
import { RhwpAdapter } from "./adapter.js";
import { Interaction } from "./interaction.js";
import { mountShortcutResults } from "./shortcut-results.js";
import { mountMenuSettings } from "./menu-settings.js";
import {mountLocalFontSettings} from './local-font-settings.js';
import { mountHeaderFooter } from "./header-footer-ui.js";
import { mountPageNumber } from "./page-number-ui.js";
import { mountColumns } from "./columns-ui.js";
import { formatMenuState as settingsCommandState } from "./integration/a-format-menu.js";
import { type Props, type Run, copy, nested, samePosition } from "./model.js";
import { startFontSupply, requestPageFonts, applyFontEnvironment, requestedFontDescriptions, requestedFontFailures, fontSupplyRevision } from "./font-provider.js";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>("input"),
  pages = $("pages"),
  viewport = $("viewport"),
  dialog = $<HTMLDialogElement>("format");
mountCaretVisibility(input,pages);
startupMark('ui-start');
startFontSupply();
declareReportingRuntime(coreRuntimeSha256);
const core = await loadCoreRuntime();
// Private local-edit/IME trial only; adoption depends on the fixed Core proof.
const adapter = new RhwpAdapter(core.createDocument(), {localBodyText: true, passiveOwnerBatchFor:core.ownerBatchPortFor, focusedCellPortFor:core.focusedCellPortFor,
  localBodyEnvironment: () => `${fontSupplyRevision()}:${devicePixelRatio}`});
initializeBlankDocument(adapter);
const editor = new Interaction(adapter);
let tableNoticeOwner:{id:string;revision:number}|undefined;
function clearStaleTableNotice() {
  if(tableNoticeOwner&&(tableNoticeOwner.id!==adapter.documentId||tableNoticeOwner.revision!==adapter.revision)){
    $("table-operation-status").textContent="";
    tableNoticeOwner=undefined;
  }
}
function showTableNotice(error:unknown) {
  if(!(error instanceof UnsupportedTableOperation))return false;
  const message=tableOperationNotice(error);if(!message)return false;
  clearStaleTableNotice();
  const notice=$("table-operation-status");
  if(notice.textContent!==message){
    recordTableRefusal(document,error,editor.selection);
    notice.textContent=message;
  }
  tableNoticeOwner={id:adapter.documentId,revision:adapter.revision};
  $("error").hidden=true;
  return true;
}
const pasteResult = mountPasteResult(document, () => ({ documentId: adapter.documentId, revision: adapter.revision }), () => requestedFontDescriptions(adapter));
const files = new FileLifecycle(adapter, editor, {
  standalone: window.parent === window,
  confirm: (message) => confirm(message),
  prompt: (message, name) => prompt(message, name),
  pickSaveTarget: nativeSavePicker(window),
  download: downloadHwpx,
  prepareDisplay: (candidate) => { applyFontEnvironment(candidate); },
  clickTableScope: (page,run) => withStudioTableClick(page,run),
  paintedCellFormats: () => {
    const painted = paintedCellSelection;
    if (!painted?.formats || painted.native !== adapter.doc || files.busy || clipboardBusy ||
        composing || adapter.transientEdit || deferredCompositionPages ||
        pages.querySelector("[data-ime-canvas],[data-resize-canvas]") || painted.stamp !== selectionPaintStamp()) return;
    return painted.formats;
  },
  change: (replaced, changedCellClose, committedCellApply) => {
    clearStaleTableNotice();
    return replaced ? render(false, bodyPastePresentation, resizePresentation, changedCellClose, undefined, committedCellApply) : paint();
  },
  error: (error) => {
    if(showTableNotice(error))return;
    knownDiagnosticError(error);
    $("error").textContent = String(error);
    $("error").hidden = false;
  },
});
let menuSettings: ReturnType<typeof mountMenuSettings> | undefined;
let headerFooter: ReturnType<typeof mountHeaderFooter> | undefined;
let pageNumber: ReturnType<typeof mountPageNumber> | undefined;
let columns: ReturnType<typeof mountColumns> | undefined;
let clipboardBusy = false;
let syncFormatAdditions = () => {};
let renderedDocument: string | undefined;
let composing = false;
let qaInputBoundary: ReturnType<typeof mountQaInputBoundary>;
bindEditorPopupFocus(document, () => composing || clipboardBusy || files.busy || adapter.transientEdit, () => {
  const native = adapter.doc, docId = adapter.documentId, revision = adapter.revision,
    selection = editor.currentSelectionGeneration;
  return () => editor.adapter === adapter && adapter.doc === native && adapter.documentId === docId &&
    adapter.revision === revision && editor.currentSelectionGeneration === selection;
});
bindEditorDialogFormSubmit(document.getElementById("format-form") as HTMLFormElement);
let saveNoticeToken: string | undefined;
let saveNoticeTimer: number | undefined;
let saveNoticeExpired = false;
function saveSuccessToken() {
  const message = files.notice;
  if (!message.endsWith(" 저장 완료") && !message.endsWith(" 다운로드 파일 저장 확인됨")) return;
  const request = files.state().request;
  const name = request?.confirmedFilename;
  if (request?.status === "completed" && request.documentId === adapter.documentId && name &&
      (message === `${name} 저장 완료` || message === `${name} 다운로드 파일 저장 확인됨`))
    return request.requestId;
}
function projectSaveNotice() {
  const panel = $("file-notice");
  const token = saveSuccessToken();
  if (token !== saveNoticeToken) {
    if (saveNoticeTimer !== undefined) window.clearTimeout(saveNoticeTimer);
    saveNoticeTimer = undefined;
    saveNoticeToken = token;
    saveNoticeExpired = false;
    if (token) saveNoticeTimer = window.setTimeout(() => {
      if (saveNoticeToken !== token || saveSuccessToken() !== token) return;
      saveNoticeExpired = true;
      panel.hidden = true;
    }, 3500);
  }
  projectText("file-status", files.notice);
  panel.toggleAttribute("data-save-success", token !== undefined);
  // Persistent viewer restrictions are displayed outside this panel.
  const viewerRestriction = !!adapter.viewerOnlyReason && files.notice.startsWith("읽기 전용 표시 · ");
  panel.hidden = !files.notice || viewerRestriction || saveNoticeExpired;
}
configureReporting({wasmDeclared:coreRuntimeSha256,wasmObserved:()=>coreRuntimeIdentity(adapter.doc)?.sha256??null,state:()=>({
 revision:adapter.revision,undoCount:editor.history.undoStack.length,redoCount:editor.history.redoStack.length,dirty:files.dirty,
 selection:editor.selection.kind==='caret'?'caret':editor.selection.kind==='text'?'range':editor.selection.kind==='object'?'object':'cell',
 // Exact selection geometry/count would require new Core reads. Only the known
 // single caret/object count is recorded; compound cell/range count is unknown0.
 selectionCount:editor.selection.kind==='caret'||editor.selection.kind==='object'?1:0,composing,
})});
mountTypingFormatPresentation(editor,input,
  () => `${fontSupplyRevision()}:${devicePixelRatio}:${adapter.presentationDpi()}`,
  () => files.busy || clipboardBusy || !!document.querySelector('dialog[open]'));
let dragging = false;
// IME edits the current document inside a pending transaction. Only commit
// publishes its single History entry; cancellation restores the original state.
let composition: LiveComposition | undefined;
const compositionKeys = compositionCommitKey(input, () => JSON.stringify([
  adapter.documentId, adapter.revision, editor.selection,
]), () => { if (!composing && !files.busy && !clipboardBusy && !document.querySelector("dialog[open]")) safe(() => editor.execute({type:"break"}), true); });
let bodyPastePresentation = false;
let resizePresentation = false;
let resizeCompletion: number | undefined;
function publishBodyPaste(before: ReturnType<Interaction["capture"]>, eligible: boolean) {
  // Only a completed body edit may defer offscreen presentation. Admission,
  // Core mutation, rollback and History have already run synchronously.
  bodyPastePresentation = eligible && before.documentId === adapter.documentId &&
    before.revision !== adapter.revision && before.selection.focus.kind === "body" &&
    (before.selection.kind === "caret" || before.selection.kind === "text") &&
    editor.selection.kind === "caret" && editor.selection.focus.kind === "body";
  try { files.ui.change(true); }
  finally { bodyPastePresentation = false; }
}
function cancelComposition() {
  compositionKeys.cancel();
  composition?.cancel();
  composition = undefined;
  delete input.dataset.imePreview;
}
function safe(action: () => void, visibleBodyEdit = false, resizing = false) {
  try {
    $("error").hidden = true;
    const before = editor.capture();
    action();
    if (adapter.revision !== before.revision) qaInputBoundary?.("native-command-committed");
    // A resize at its content floor restored the entire snapshot/selection.
    // There is no new document, History, format or ink to publish or rebuild.
    if (resizing && before.documentId === adapter.documentId && before.revision === adapter.revision) return;
    qaRenderCause?.("edit-dispatch");
    if (visibleBodyEdit) publishBodyPaste(before, true);
    else {
      resizePresentation = resizing;
      try { files.ui.change(true); }
      finally { resizePresentation = false; }
    }
    revealCommandSelection(document, before, editor.capture());
  } catch (e) {
    if(showTableNotice(e))return;
    if(e instanceof UnsupportedTableOperation){recordTableRefusal(document,e,editor.selection);$("error").hidden=true;$("clipboard-status").textContent=e.message;return;}
    knownDiagnosticError(e);
    $("error").textContent = String(e);
    $("error").hidden = false;
    files.ui.change(false);
  }
}
document.addEventListener('rhwp:shortcut-ui',event=>{
 const action=(event as CustomEvent).detail;
 if(typeof action!=='string'||!action.startsWith('local-'))return;
 const command=localResizeCommand(action.slice(6));if(!command||files.busy||clipboardBusy||composing||document.querySelector('dialog[open]'))return;
 $("error").hidden=true;focus();const origin=document.activeElement;
 void authorizeLocalResize(editor,command).then(captured=>{if(files.busy||clipboardBusy||composing||document.querySelector('dialog[open]')||document.activeElement!==origin&&document.activeElement!==input){console.debug('현재 셀 조절 대기 중 입력 문맥 변경: 취소');return;}safe(()=>editor.execute(command,captured),false,true);focus();},error=>{files.ui.error(error);if(document.activeElement===origin||document.activeElement===input)focus();});
});
function focus() {
  input.focus({ preventScroll: true });
}
mountExternalFileDrop(document,pages,files,editor,{
  blocked:()=>files.busy||clipboardBusy||composing||adapter.transientEdit||!!document.querySelector('dialog[open]'),
  imageBusy:value=>{clipboardBusy=value;files.ui.change(false);},focus,
});
// Optional loopback QA attribution only: no new getter, timer or decision.
type FontRefreshSource = "font-event" | "composition-end" | "dialog-close" |
  "render-tail" | "selection-surfaces" | "deferred-drain";
type RenderCause = "edit-dispatch" | "render-entry" | "font-render-entry" |
  "font-queued" | "font-coalesced" | "font-run" | "font-blocked" | "font-result";
const qaRenderCause = (() => {
  const u = new URL(location.href);
  if (window.parent !== window || u.protocol !== "http:" || u.hostname !== "127.0.0.1" ||
      u.searchParams.getAll("oneditQaRenderCause").join("/") !== "1") return;
  type Row = {cause: RenderCause; source?: FontRefreshSource; changed?: boolean;
    revision: number; selectionGeneration: number; fontEpoch: number; renderGeneration: number};
  let rows: Row[] = [], dropped = 0;
  Object.defineProperty(window, "__oneditQaRenderCause", {value: (reset = false) => {
    const result = {rows: rows.map(row => ({...row})), dropped};
    if (reset) { rows = []; dropped = 0; }
    return result;
  }});
  return (cause: RenderCause, source?: FontRefreshSource, changed?: boolean) => {
    if (rows.length === 256) { dropped++; return; }
    rows.push({cause, source, changed, revision: adapter.revision,
      selectionGeneration: editor.currentSelectionGeneration,
      fontEpoch: fontSupplyRevision(), renderGeneration});
  };
})();
let fontRefreshTask: number | undefined;
// Presentation policy, not a retained layout/geometry receipt. Every render
// still completes Core layout and reads current dimensions. A new document
// starts with the original full font discovery/render path.
let fontViewportDocument: {doc: RhwpAdapter['doc']; id: string} | undefined;
function fontViewportActive() {
  const owner = fontViewportDocument;
  return owner !== undefined && owner.doc === adapter.doc && owner.id === adapter.documentId;
}
function scheduleFontRefresh(source: FontRefreshSource) {
  if (fontRefreshTask !== undefined) { qaRenderCause?.("font-coalesced", source); return; }
  qaRenderCause?.("font-queued", source);
  fontRefreshTask = window.setTimeout(() => {
    fontRefreshTask = undefined;
    qaRenderCause?.("font-run", source);
    // Do not recompose underneath a command, IME preview or open modal draft.
    if (files.busy || composing || document.querySelector("dialog[open]")) {
      qaRenderCause?.("font-blocked", source);
      return;
    }
    try {
      const changed = applyFontEnvironment(adapter);
      qaRenderCause?.("font-result", source, changed);
      if (changed) {
        editor.refreshFontGeometry(); formatViewKey = "";
        fontViewportDocument = {doc: adapter.doc, id: adapter.documentId};
        render(false, false, false, undefined, source);
        document.dispatchEvent(new CustomEvent("rhwp:font-layout"));
      }
    }
    catch (e) { console.error('글꼴 표시 갱신 실패',e); files.ui.error('글꼴 표시를 갱신하지 못했습니다. 문서를 다시 열어 주세요.'); }
  }, 0);
}
document.addEventListener("rhwp:fonts-updated", () => scheduleFontRefresh("font-event"));
document.addEventListener("compositionend", () => scheduleFontRefresh("composition-end"));
document.addEventListener("close", () => scheduleFontRefresh("dialog-close"), true);
let deferredCompositionPages = false;
let renderGeneration = 0;
// Current committed screen policy only: no document/layout/output cache.
let bodyPresentation: {doc:RhwpAdapter["doc"];id:string;revision:number;generation:number;
  environment:string;epoch:string;fonts:number;dpr:number;dimensions:{width:number;height:number}[]}|undefined;
let deferredFrame: number | undefined, deferredTask: number | undefined;
function stopDeferredPages() {
  if (deferredFrame !== undefined) cancelAnimationFrame(deferredFrame);
  if (deferredTask !== undefined) clearTimeout(deferredTask);
  deferredFrame = deferredTask = undefined;
}
function prepareBodySelectionSurfaces():boolean {
  const owner=bodyPresentation,selection=editor.selection;
  if(!owner||composing||adapter.transientEdit||files.busy||document.fonts.status==='loading'||
      !adapter.localBodyTextIdentified||owner.doc!==adapter.doc||owner.id!==adapter.documentId||
      owner.revision!==adapter.revision||owner.generation!==renderGeneration||
      owner.fonts!==fontSupplyRevision()||owner.dpr!==devicePixelRatio||
      !['caret','text'].includes(selection.kind)||selection.focus.kind!=='body'||
      selection.kind==='text'&&(selection.anchor.kind!=='body'||selection.anchor.sec!==selection.focus.sec||selection.anchor.para!==selection.focus.para)||
      pages.querySelector('[data-render-pending]:not([data-render-pending="body-edit"])'))return false;
  // Native layout remains synchronous/current. A restored/pending generation
  // must be completed before any page metadata or selected geometry is read.
  adapter.completeLocalBodyFlow();
  if(owner.environment!==adapter.localBodyEnvironmentToken())return false;
  const count=adapter.pageCount;
  if(count!==owner.dimensions.length||pages.children.length!==count)return false;
  const bounds=viewport.getBoundingClientRect();
  if(![bounds.top,bounds.bottom,bounds.left,bounds.right].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)return false;
  const epoch=adapter.localBodyEnvironmentToken(true);
  if(epoch===undefined)return false;
  const changed=epoch!==owner.epoch;
  const info=changed?Array.from({length:count},(_,page)=>adapter.call('getPageInfo',page)):undefined;
  const needed=new Set<number>(),current=editor.cursorRect().pageIndex;
  if(!Number.isSafeInteger(current)||current<0||current>=count)return false;
  needed.add(current);
  for(let page=0;page<count;page++){
    const div=pages.children[page] as HTMLElement,dimensions=info?.[page]??owner.dimensions[page];
    if(div.dataset.page!==String(page)||!div.classList.contains('page')||
       ![dimensions.width,dimensions.height].every(n=>Number.isFinite(n)&&n>0))return false;
    if(changed){
      if(div.style.width!==`${dimensions.width}px`)div.style.width=`${dimensions.width}px`;
      if(div.style.height!==`${dimensions.height}px`)div.style.height=`${dimensions.height}px`;
    }else if(div.style.width!==`${dimensions.width}px`||div.style.height!==`${dimensions.height}px`)return false;
    const rect=div.getBoundingClientRect();
    if(rect.bottom>bounds.top&&rect.top<bounds.bottom&&rect.right>bounds.left&&rect.left<bounds.right)needed.add(page);
  }
  stopDeferredPages();
  adapter.withUpdateReads(()=>{
    for(const page of needed){
      const div=pages.children[page] as HTMLElement;
      if(changed||div.hasAttribute('data-render-pending'))
        renderPage(page,info?.[page]??adapter.call('getPageInfo',page),div,owner.fonts,true);
    }
  });
  if(info)owner.dimensions=info.map(value=>({width:value.width,height:value.height}));
  owner.epoch=adapter.localBodyEnvironmentToken(true)!;
  deferredCompositionPages=!!pages.querySelector('[data-render-pending]');
  if(!deferredCompositionPages)bodyPresentation=undefined;
  requestPageFonts(adapter,pages);scheduleFontRefresh("selection-surfaces");
  return true;
}
function render(visibleComposition = false, visibleBodyEdit = false, visibleResize = false,
    changedCellClose?: () => void, fontSource?: FontRefreshSource, committedCellApply=false, repairCellFrame=false):void {
  qaRenderCause?.(fontSource ? "font-render-entry" : "render-entry", fontSource);
  if (resizeCompletion !== undefined) clearTimeout(resizeCompletion);
  resizeCompletion = undefined;
  stopDeferredPages();
  bodyPresentation=undefined;
  renderGeneration++;
  // Cancel obsolete presentation first, including when completion fails.
  // This path reads whole-document metadata; local replies have no page patch.
  adapter.completeLocalBodyFlow();
  const split=committedCellApply&&adapter.canSplitCellApplyReads();
  const checkCellFrame=split||repairCellFrame;
  const pageJob=()=>{
  const viewAdapter = adapter;
  applyViewMarkers(viewAdapter);
  const replaced = renderedDocument !== undefined && renderedDocument !== adapter.documentId;
  if (replaced) $("clipboard-status").textContent = "";
  const previous = viewport.scrollTop, previousLeft = viewport.scrollLeft;
  const fontRevision = fontSupplyRevision();
  // The measured benefit is unchanged siblings of an edited page. Avoid
  // observer/cache bookkeeping for single-page documents with no siblings.
  const reusePages = viewAdapter.pageCount > 1;
  if (fontViewportDocument && !fontViewportActive()) fontViewportDocument = undefined;
  // Ordinary input must not immediately drain the offscreen work left by a
  // font update. Keep the current document in this demand presentation mode.
  // Non-caret/unknown cases retain the authoritative full renderer.
  const fontPresentation = fontViewportActive() && editor.selection.kind === 'caret' && reusePages;
  const previousPages = reusePages ? Array.from(pages.children) as HTMLElement[] : [];
  // Core supplies every current page's dimensions even when only visible ink
  // is consumed first. Body paste reuses the existing guarded IME page drain,
  // but remain SVG; Canvas/composition policy is unchanged.
  const resize = visibleResize && !composing && document.fonts.status !== "loading" &&
    (editor.selection.kind === "cells" || editor.selection.kind === "table") && reusePages;
  const selection=editor.selection;
  // Exact local BODY range display is viewport-driven too. Whole Core flow
  // already completed above; cells, mixed/cross-paragraph, unknown/transient,
  // loading fonts and first-document presentation retain the full path.
  let localTextScreen=reusePages&&!composing&&!adapter.transientEdit&&!files.busy&&document.fonts.status!=="loading"&&
    !document.querySelector("dialog[open]")&&adapter.localBodyTextIdentified&&renderedDocument===adapter.documentId&&
    selection.kind==="text"&&selection.anchor.kind==="body"&&selection.focus.kind==="body"&&
    selection.anchor.sec===selection.focus.sec&&selection.anchor.para===selection.focus.para;
  if(localTextScreen)try{editor.capture();}catch{localTextScreen=false;}
  const worksetPresentation=activeWorkset(document)&&reusePages&&!composing&&!adapter.transientEdit&&
    !visibleResize&&!visibleComposition&&!files.busy&&document.fonts.status==='loaded'&&
    editor.selection.kind==='caret';
  const prioritize = worksetPresentation || fontPresentation || resize || localTextScreen || (visibleComposition && composing || visibleBodyEdit && !composing) &&
    editor.selection.kind === "caret" && reusePages;
  const infos = prioritize ? Array.from({ length: viewAdapter.pageCount }, (_, page) => viewAdapter.call("getPageInfo", page)) : undefined;
  let needed: Set<number> | undefined;
  if (infos) {
    for (let page = 0; page < infos.length; page++) {
      let div = previousPages[page];
      if (!div) {
        div = document.createElement("div");
        div.className = "page"; div.dataset.page = String(page);
        const overlay = document.createElement("div"); overlay.className = "overlay";
        div.append(overlay); pages.append(div); previousPages[page] = div;
      }
      if (div.style.width !== `${infos[page].width}px`) div.style.width = `${infos[page].width}px`;
      if (div.style.height !== `${infos[page].height}px`) div.style.height = `${infos[page].height}px`;
    }
    while (pages.children.length > infos.length) pages.lastElementChild!.remove();
    const bounds = viewport.getBoundingClientRect();
    if (fontPresentation && (![bounds.top,bounds.bottom,bounds.left,bounds.right].every(Number.isFinite) ||
        bounds.width <= 0 || bounds.height <= 0)) {
      fontViewportDocument = undefined; render(visibleComposition,visibleBodyEdit,visibleResize); return;
    }
    needed = new Set([editor.cursorRect().pageIndex]);
    if (resize) for (const r of editor.rectangles()) needed.add(r.pageIndex);
    for (let page = 0; page < infos.length; page++) {
      const rect = previousPages[page].getBoundingClientRect();
      if (rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right)
        needed.add(page);
    }
    if(worksetPresentation){
      const active=activePageRange(pages,viewport,editor.cursorRect().pageIndex);
      if(active)needed=active;else needed=new Set(infos.map((_,i)=>i));
    }
    // Canvas is already supported for current-document screen composition.
    // Restrict resize use to table/text pages, with exact Core cell boxes on
    // every selected page. Objects keep the ordinary validated SVG route.
    if (resize) {
      const controls = [...needed].flatMap(page => adapter.call("getPageControlLayout", page).controls ?? []);
      const roots = controls.filter((c: any) => c.type === "table");
      const cellLists = new Set(adapter.call("getCursorModel").lists.filter((l: any) =>
        l.isCell && l.hostListId === 0 && roots.some((t: any) =>
          l.sectionIndex === t.secIdx && l.hostPara === t.paraIdx && l.controlIndex === t.controlIdx)).map((l: any) => l.listId));
      if (needed.size > 2 || controls.some((c: any) => c.type !== "table") ||
          adapter.call<any[]>("getControls").some(c => cellLists.has(c.list))) {
        render(); return;
      }
    }
  }
  deferredCompositionPages = false;
  // B receipts decide only pre-SVG reuse for already visible/required pages.
  // The font demand branch already determines these same required pages;
  // pending pages, Canvas/composition and all geometry keep the old renderer.
  const receiptPages = !repairCellFrame && reusePages && !replaced && (!prioritize || fontPresentation) &&
    !resize && !visibleComposition && !composing && !adapter.transientEdit && document.fonts.status === "loaded"
    ? (needed ?? visibleSelectionPages()) : undefined;
  const pageCount = viewAdapter.pageCount, renderDoc = adapter.doc, renderId = adapter.documentId,
    revision = adapter.revision, generation = renderGeneration, selectionGeneration = editor.currentSelectionGeneration,
    zoom = pages.style.zoom;
  const receiptView: ScreenReceiptView = {pageCount, current: () =>
    adapter.doc === renderDoc && adapter.documentId === renderId && adapter.revision === revision &&
    generation === renderGeneration && selectionGeneration === editor.currentSelectionGeneration &&
    !composing && !adapter.transientEdit && fontRevision === fontSupplyRevision() &&
    document.fonts.status === "loaded" && zoom === pages.style.zoom};
  const screenInputs=checkCellFrame?adapter.cellApplyScreenInputs():undefined;
  const fontStatus=document.fonts.status, dpr=devicePixelRatio;
  const frameCurrent=()=>screenInputs?.()===true && generation===renderGeneration &&
    document.fonts.status===fontStatus && fontRevision===fontSupplyRevision() && dpr===devicePixelRatio &&
    zoom===pages.style.zoom && renderedDocument===renderId;
  for (let page = 0; page < viewAdapter.pageCount; page++) {
    const info = infos?.[page] ?? viewAdapter.call("getPageInfo", page);
    let div = previousPages[page];
    if (needed && !needed.has(page)) {
      // Keep the validated DOM for byte comparison at flush, but do not expose
      // stale ink/geometry as the current page. Scroll/resize flush before use.
      // Only the already-hidden, fixed-size pending surface may skip its
      // descendant style/layout/paint. Fresh visible pages never retain this.
      if (div.style.contentVisibility !== "hidden") div.style.contentVisibility = "hidden";
      if (div.style.visibility !== "hidden") div.style.visibility = "hidden";
      const pending = worksetPresentation ? "workset" : fontPresentation ? "font" : resize ? "resize" : visibleBodyEdit || localTextScreen ? "body-edit" : "composition";
      if (div.dataset.renderPending !== pending) div.dataset.renderPending = pending;
      if(worksetPresentation)pagePresenter.release(div);
      deferredCompositionPages = true;
      continue;
    }
    try {
      renderPage(page, info, div, fontRevision, reusePages, prioritize && visibleComposition, resize,
        receiptPages?.has(page) ? receiptView : undefined);
    } catch (error) {
      // Presentation fallback only: never replay the already committed command.
      if (resize) { render(); return; }
      throw error;
    }
  }
  while (pages.children.length > viewAdapter.pageCount) pages.lastElementChild!.remove();
  viewport.scrollTop = previous;
  viewport.scrollLeft = previousLeft;
  renderedDocument = adapter.documentId;
  qaInputBoundary?.("screen-published");
  if(infos&&deferredCompositionPages&&!fontPresentation&&!resize&&!composing&&!adapter.transientEdit&&
      (visibleBodyEdit||localTextScreen)&&adapter.localBodyTextIdentified&&document.fonts.status!=="loading"){
    const environment=adapter.localBodyEnvironmentToken(),epoch=adapter.localBodyEnvironmentToken(true);
    if(environment!==undefined&&epoch!==undefined)bodyPresentation={doc:adapter.doc,id:adapter.documentId,
      revision:adapter.revision,generation:renderGeneration,environment,epoch,fonts:fontRevision,dpr:devicePixelRatio,
      dimensions:infos.map(info=>({width:info.width,height:info.height}))};
  }
  requestPageFonts(adapter, pages);
  const fontNotice = $("font-notice");
  fontNotice.textContent = ''; fontNotice.hidden = true;
  scheduleFontRefresh("render-tail");
  if (replaced) $("error").hidden = true;
  // Page finalization ends above. Hold only live scalar/identity witnesses,
  // not a model, owner receipt, DPI receipt or page transaction.
  const focus=editor.selection;
  const selectionCurrent=split?editor.cellApplySelectionWitness():undefined;
  const current=()=>receiptView.current() && editor.selection===focus &&
    selectionCurrent?.()===true && focus.kind==="caret" &&
    focus.focus.kind==="cell"&&!nested(focus.focus) && !replaced && !resize &&
    !visibleBodyEdit && !visibleResize && !visibleComposition && !files.busy && !clipboardBusy &&
    !deferredCompositionPages && !pages.querySelector("[data-render-pending],[data-ime-canvas],[data-resize-canvas]");
  return () => {
  if(checkCellFrame&&!frameCurrent()){
    // The displayed page cannot lend geometry to a different native document
    // generation. Re-render once without page receipt reuse; never redo Apply.
    if(!repairCellFrame)
      return withQaReadPhase(adapter.doc,"cell-frame-repair",()=>render(false,false,false,undefined,undefined,false,true));
    pages.replaceChildren();
    renderedDocument=undefined;
    throw Error("Current cell display could not be verified after rerender");
  }
  const display=()=>paint(replaced ? undefined : changedCellClose);
  const fence=split?adapter.cellApplyDisplayFence(current):undefined;
  withQaReadPhase(adapter.doc,"ui-display",()=>split?adapter.withUpdateReads(display,fence??(()=>false)):display());
  if (resize) {
    // Only presentation is coalesced. Every key has already completed its own
    // Core command, validation, snapshot and History entry synchronously.
    // A normal render/scroll/selection/font/document transition cancels this
    // generation. Completion reads the current document, never queued edits.
    const generation = renderGeneration, doc = adapter.doc, id = adapter.documentId;
    resizeCompletion = window.setTimeout(() => {
      resizeCompletion = undefined;
      if (generation === renderGeneration && doc === adapter.doc && id === adapter.documentId) {
        finishResizePages();
      }
    }, 300);
  }
  if (visibleBodyEdit && !fontPresentation) finishCompositionPages();
  if (replaced) document.dispatchEvent(new CustomEvent("rhwp:reveal-selection"));
  };
  };
  if(checkCellFrame){
    // Close the actual page-owned transaction before invoking the display.
    const publish=withQaReadPhase(adapter.doc,"page-job",()=>adapter.withUpdateReads(pageJob));
    return publish?.();
  }
  return withQaReadPhase(adapter.doc,"legacy-render",()=>adapter.withUpdateReads(()=>pageJob()?.()));
}
type ActivePageProof={doc:typeof adapter.doc;id:string;revision:number;generation:number;
  native:number;fonts:number;environment:string;dpi:number;zoom:string;svg:Element};
const activePageProofs=new WeakMap<HTMLElement,ActivePageProof>();
function activePageReady(page:HTMLElement):boolean {
  const p=activePageProofs.get(page);
  return !!p&&p.doc===adapter.doc&&p.id===adapter.documentId&&p.revision===adapter.revision&&
    p.generation===renderGeneration&&p.native===screenInputDispatchEpoch(adapter.doc)&&
    p.fonts===fontSupplyRevision()&&p.environment===adapter.observedLocalBodyEnvironment()&&
    p.dpi===devicePixelRatio&&p.zoom===pages.style.zoom&&p.svg===page.querySelector(':scope > svg')&&
    !page.matches('[data-render-pending],[data-ime-canvas],[data-resize-canvas]')&&
    !adapter.hasPendingLocalBodyFlow()&&!adapter.transientEdit&&document.fonts.status==='loaded';
}
function renderPage(page: number, info: { width: number; height: number }, div: HTMLElement | undefined, fontRevision: number, reusePages: boolean, hangulUpdate = false, resizeCanvas = false, receiptView?: ScreenReceiptView) {
  const native=screenInputDispatchEpoch(adapter.doc),environment=adapter.observedLocalBodyEnvironment();
  pagePresenter.renderPage(page, info, div, fontRevision, reusePages, hangulUpdate, resizeCanvas, receiptView);
  const mounted=pages.children[page] as HTMLElement|undefined,svg=mounted?.querySelector(':scope > svg');
  if(activeWorkset(document)&&mounted&&svg&&native!==undefined&&native===screenInputDispatchEpoch(adapter.doc)&&
    environment!==undefined&&environment===adapter.observedLocalBodyEnvironment()&&!adapter.hasPendingLocalBodyFlow())
    activePageProofs.set(mounted,{doc:adapter.doc,id:adapter.documentId,revision:adapter.revision,
      generation:renderGeneration,native,fonts:fontRevision,environment,dpi:devicePixelRatio,zoom:pages.style.zoom,svg});
}
// B resize-drain: yield only committed presentation, never input/History.
// Uses A's existing cancellation slots and validated renderPage, no scene/cache prerequisite.
function finishResizePages() {
  stopDeferredPages();
  const generation = renderGeneration, doc = adapter.doc, id = adapter.documentId;
  const revision = adapter.revision, fonts = fontSupplyRevision(), dpi = devicePixelRatio;
  const schedule = () => { deferredFrame = requestAnimationFrame(() => {
    deferredFrame = undefined; deferredTask = window.setTimeout(run, 0);
  }); };
  const run = () => {
    deferredTask = undefined;
    if (generation !== renderGeneration || doc !== adapter.doc || id !== adapter.documentId ||
        revision !== adapter.revision || composing) return;
    if (fonts !== fontSupplyRevision() || dpi !== devicePixelRatio) { render(); return; }
    try {
      const visible = pages.querySelector<HTMLElement>("[data-resize-canvas]");
      const div = visible ?? pages.querySelector<HTMLElement>("[data-render-pending]");
      if (!div) { deferredCompositionPages = false; return; }
      const page = Number(div.dataset.page);
      adapter.withUpdateReads(() => {
        renderPage(page, adapter.call("getPageInfo", page), div, fonts, true);
      });
      // Multiple visible pieces of a selected table must all have fresh ink
      // before paint(), which otherwise correctly falls back to a full render.
      if (!pages.querySelector("[data-resize-canvas]")) paint();
      deferredCompositionPages = !!pages.querySelector("[data-render-pending]");
      if (deferredCompositionPages || pages.querySelector("[data-resize-canvas]")) schedule();
      else requestPageFonts(adapter, pages);
    } catch (error) { files.ui.error(error); render(); }
  };
  schedule();
}
// These callbacks always read the current document/composition, never a queued
// revision (IME may reuse revision numbers). A new visible page must not expose
// old SVG. No Core cache or input/Command coalescing is added.
function flushCompositionPages() {
  if (!deferredCompositionPages) return;
  try {
    if(activeWorkset(document)&&!composing&&!adapter.transientEdit&&
      !pages.querySelector('[data-render-pending]:not([data-render-pending="workset"])')&&
      pages.querySelector('[data-render-pending="workset"]')){
      // Re-enter the ordinary complete-layout renderer on demand; its workset
      // branch selects viewport+buffer and the current caret before publication.
      const needed=activePageRange(pages,viewport,editor.cursorRect().pageIndex);
      if(!needed){render();return;}
      const visible=[...pages.children] as HTMLElement[];
      const fresh=visible.filter(p=>!p.hasAttribute('data-render-pending'));
      if(!fresh.length||fresh.some(p=>!activePageReady(p))){render();return;}
      adapter.withUpdateReads(()=>{for(const n of needed){const div=visible[n];
        if(div?.hasAttribute('data-render-pending'))renderPage(n,adapter.call('getPageInfo',n),div,fontSupplyRevision(),true);}});
      for(const div of visible)if(!needed.has(Number(div.dataset.page))&&!div.contains(document.activeElement)){
        div.style.contentVisibility='hidden';div.style.visibility='hidden';div.dataset.renderPending='workset';pagePresenter.release(div);
      }
      deferredCompositionPages=!!pages.querySelector('[data-render-pending]');
      requestPageFonts(adapter,pages);scheduleFontRefresh('deferred-drain');return;
    }
    if(prepareBodySelectionSurfaces())return;
    if (fontViewportActive() && editor.selection.kind === 'caret' &&
        !pages.querySelector('[data-render-pending]:not([data-render-pending="font"])')) {
      // Scroll/zoom consumes only newly exposed pending font surfaces. It must
      // not invalidate already current pages or restart an all-page drain.
      const bounds = viewport.getBoundingClientRect();
      if (![bounds.top,bounds.bottom,bounds.left,bounds.right].every(Number.isFinite) ||
          bounds.width <= 0 || bounds.height <= 0) {
        fontViewportDocument = undefined; render(); return;
      }
      const caretPage = editor.cursorRect().pageIndex;
      const needed = [...pages.querySelectorAll<HTMLElement>('[data-render-pending="font"]')].filter(div => {
        const rect = div.getBoundingClientRect();
        return Number(div.dataset.page) === caretPage ||
          rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right;
      });
      if (!needed.length) return;
      adapter.completeLocalBodyFlow();
      adapter.withUpdateReads(() => {
        for (const div of needed) {
          const page = Number(div.dataset.page);
          renderPage(page, adapter.call('getPageInfo',page), div, fontSupplyRevision(), true);
        }
      });
      deferredCompositionPages = !!pages.querySelector('[data-render-pending]');
      requestPageFonts(adapter,pages); scheduleFontRefresh("deferred-drain");
      return;
    }
    render();
  }
  catch (error) { files.ui.error(error); }
}
viewport.addEventListener("scroll", refreshSelectionViewport, { passive: true });
new ResizeObserver(refreshSelectionViewport).observe(viewport);
// The existing zoom controller changes the page container, not the viewport's
// content box. Flush before newly exposed pages can retain hidden/stale ink.
let pageDisplayStyle = pages.getAttribute("style");
new MutationObserver(() => {
  const current = pages.getAttribute("style");
  // Fit mode may write its unchanged zoom during a state refresh.
  if (current === pageDisplayStyle) return;
  pageDisplayStyle = current;
  refreshSelectionViewport();
}).observe(pages, { attributes: true, attributeFilter: ["style"] });
// A matching commit already has exact current-page ink. Finish hidden pages
// one at a time after yielding a frame; never defer a model edit or validation.
// A render cancels this generation. Document identity is checked as well because
// transient IME restore/insert reuses revision numbers.
function finishCompositionPages() {
  stopDeferredPages();
  if (!deferredCompositionPages) return;
  if(activeWorkset(document)&&pages.querySelector('[data-render-pending="workset"]')&&
    !pages.querySelector('[data-render-pending]:not([data-render-pending="workset"])'))return;
  // A committed BODY screen policy leaves hidden pages pending until needed.
  if(bodyPresentation&&pages.querySelector('[data-render-pending="body-edit"]')&&!pages.querySelector('[data-render-pending]:not([data-render-pending="body-edit"])'))return;
  const generation = renderGeneration, doc = adapter.doc, documentId = adapter.documentId;
  const run = () => {
    deferredTask = undefined;
    if (generation !== renderGeneration || adapter.doc !== doc || adapter.documentId !== documentId || composing) return;
    try {
      const div = pages.querySelector<HTMLElement>('[data-render-pending]:not([data-render-pending="font"])');
      if (!div) { deferredCompositionPages = !!pages.querySelector('[data-render-pending]'); return; }
      const page = Number(div.dataset.page);
      // Page metadata, marker settings and label geometry share only this
      // synchronous page application. Next hidden page starts a fresh scope.
      adapter.withUpdateReads(() => {
        renderPage(page, adapter.call("getPageInfo", page), div, fontSupplyRevision(), true);
      });
      deferredCompositionPages = !!pages.querySelector("[data-render-pending]");
      if (pages.querySelector('[data-render-pending]:not([data-render-pending="font"])')) schedule();
      else requestPageFonts(adapter, pages);
    } catch (error) { files.ui.error(error); }
  };
  const schedule = () => {
    deferredFrame = requestAnimationFrame(() => {
      deferredFrame = undefined;
      deferredTask = window.setTimeout(run, 0);
    });
  };
  // The first frame presents the already updated caret/input page. Even if the
  // browser delays actual paint, each offscreen task remains independently bounded.
  deferredFrame = requestAnimationFrame(schedule);
}
let formatViewKey = "";
function syncFormatView(owners?: OwnerProjection) {
  const key = JSON.stringify([
    adapter.documentId,
    adapter.revision,
    editor.selection,
    editor.typing,
    editor.currentSelectionGeneration,
    fontSupplyRevision(), devicePixelRatio,
  ]);
  if (formatViewKey === key) return;
  formatViewKey = key;
  try {
    const state = readEditorDisplay(editor,"selection",
      (_owners,retry)=>retry?editor.freshDisplayFormat("char"):readFormatPresentation(editor,"char"),
      ()=>withCellDisplayOwner(owners,()=>readFormatPresentation(editor,"char")));
    if (document.getElementById("selection-font")) {
      projectText("selection-font", state.fontFamily === undefined ? "혼합 / 조회 불가" : String(state.fontFamily));
      projectText("selection-font-size", state.fontSize === undefined ? "혼합 / 조회 불가" : `${state.fontSize} pt`);
    }
    for (const name of ["bold", "italic", "underline"])
      markFormatToggle($(name) as HTMLButtonElement,formatToggleState(state,name));
  } catch (error) {
    if (document.getElementById("selection-font")) {
      projectText("selection-font", "조회 불가");
      projectText("selection-font-size", "조회 불가");
    }
    for (const name of ["bold", "italic", "underline"])
      markFormatToggle($(name) as HTMLButtonElement,formatToggleState({},name),String(error));
  }
}
function paint(changedCellClose?: () => void) {
  adapter.completeLocalBodyFlow();
  return adapter.withUpdateReads(() => {
  // The zoom-aware pointer capture path can bypass the legacy handler. Restore
  // SVG before any non-caret selection asks for exact glyph/object boundaries.
  if (!composing && editor.selection.kind !== "caret" && pages.querySelector("[data-ime-canvas]")) {
    render();
    return;
  }
  const cellSelection = editor.selection.kind === "cells" || editor.selection.kind === "table";
  if (pages.querySelector("[data-resize-canvas]") && !cellSelection) { render(); return; }
  // Selection geometry must never measure stale hidden SVG. Normal caret moves
  // into an unprepared page and any range selection synchronously finish it.
  if (deferredCompositionPages && (!cellSelection && editor.selection.kind !== "caret" ||
      cellSelection && editor.rectangles().some(r => pages.querySelector(`[data-page="${r.pageIndex}"]`)?.hasAttribute("data-render-pending")) ||
      pages.querySelector(`[data-page="${editor.cursorRect().pageIndex}"]`)?.hasAttribute("data-render-pending"))) {
    if(!prepareBodySelectionSurfaces()){render();return;}
  }
  const synchronousClose = pages.children.length>1&&editor.selection.kind==="caret"&&
    editor.selection.focus.kind==="cell"&&!nested(editor.selection.focus)&&!composing&&
    !adapter.transientEdit&&document.fonts.status==="loaded" ? changedCellClose : undefined;
  editor.withCellBlockPresentation(owners=>paintSelection(owners,synchronousClose));
  });
}
// A selection moves over the same rendered document. Reuse its Core run
// geometry while that exact SVG/document/revision remains on screen. A render
// replaces the SVG; edits, undo/redo and document replacement also invalidate
// the identity checks. Scroll/zoom never change these document coordinates.
const selectionLayouts = new WeakMap<SVGSVGElement, {
  doc: RhwpAdapter["doc"]; documentId: string; revision: number; native?: number; runs: Run[];
}>();
const pagePresenter = createPagePresenter({
  adapter, document, pages,
  invalidateSelectionSvg: svg => { selectionLayouts.delete(svg); },
});
function selectionRuns(viewEditor: Interaction, page: number): readonly Run[] {
  const a = viewEditor.adapter;
  const svg = pages.querySelector<SVGSVGElement>(`[data-page="${page}"] > svg`);
  const cached = svg && selectionLayouts.get(svg);
  if (cached && cached.doc === a.doc && cached.documentId === a.documentId && cached.revision === a.revision && cached.native === a.nativeMutationGeneration())
    return cached.runs;
  const runs = a.runs(page);
  if (svg) selectionLayouts.set(svg, { doc: a.doc, documentId: a.documentId, revision: a.revision, native: a.nativeMutationGeneration(), runs });
  return runs;
}
// Paint projection only: never truncate the logical selection or owner checks.
// Read all runs of each visible page; a paragraph/inline table can span pages.
let selectionPaintPageKey: string | undefined;
let selectionPaintNative: number | undefined;
function visibleSelectionPages(): Set<number> | undefined { return readVisibleSelectionPages(pages,viewport); }
function selectionPageKey(visible: Set<number> | undefined): string {
  return visible ? [...visible].join(",") : "all";
}
function refreshSelectionViewport() {
  flushCompositionPages();
  if (editor.selection.kind !== "text") return;
  // Reproject newly exposed pages from current state, synchronously. No stale
  // callback, new document cache or Selection/History mutation is introduced.
  if (selectionPageKey(visibleSelectionPages()) === selectionPaintPageKey &&
      selectionPaintNative===adapter.nativeMutationGeneration()) return;
  editor.withViewQueries(paintSelectionGeometry);
}
// No retained geometry or command authority: this stamp describes the
// overlay already on screen. A missing/different stamp takes the old paint.
const selectionPaintStamp = () => {
  const environment = adapter.localBodyEnvironmentToken(true);
  if (!environment) return;
  return JSON.stringify([adapter.documentId, adapter.revision, editor.currentSelectionGeneration,
    editor.selection, editor.typing, adapter.scope, adapter.documentLocked, adapter.viewerOnlyReason,
    environment, renderGeneration, fontSupplyRevision(), document.fonts.status, pages.style.zoom, adapter.nativeMutationGeneration()]);
};
let paintedCellSelection: {
  native: typeof adapter.doc; stamp: string; formats?: Readonly<Partial<Record<FormatKind, FormatState>>>;
} | undefined;
function withCellDisplayOwner<T>(owners: OwnerProjection | undefined, read: () => T): T {
  const s = editor.selection;
  return (s.kind === "cells" || s.kind === "table") && owners?.isCurrent(adapter)
    ? adapter.withOwnerReads(read, owners) : read();
}
let f5Visual:{id:number;cells:number[]} | undefined;
// Test-only readonly port: does not requery Core, flush work or expose DOM references.
if(f5SliceEnabled)Object.defineProperty(window,"__oneditQaF5Slice", {value:()=>f5Render.snapshot(qaReadPhaseSnapshot ? currentF5Epoch(adapter.doc,true) : undefined)});
function currentF5Epoch(native:typeof adapter.doc, observeOnly=false): F5Epoch | undefined {
  if(native!==adapter.doc||renderedDocument!==adapter.documentId||editor.selection.kind!=="cells"||
     files.busy||clipboardBusy||composing||adapter.transientEdit||adapter.hasPendingLocalBodyFlow()||adapter.scope!=="edit"||adapter.documentLocked||
     adapter.viewerOnlyReason||document.fonts.status!=="loaded"||pages.children.length!==5||
     pages.querySelector("[data-ime-canvas],[data-resize-canvas]")||document.querySelector("dialog[open]:not(#format)"))return;
  const pending=[...pages.querySelectorAll<HTMLElement>("[data-render-pending]")];
  if(deferredCompositionPages&&!pending.length)return;
  if(pending.length){
    const visible=visibleSelectionPages();
    if(!visible||pending.some(p=>p.parentNode!==pages||!Number.isSafeInteger(Number(p.dataset.page))||
      p.dataset.renderPending!=="font"||visible.has(Number(p.dataset.page))||
      p.style.visibility!=="hidden"||p.style.contentVisibility!=="hidden"))return;
  }
  const environment=observeOnly?adapter.observedLocalBodyEnvironment():adapter.localBodyEnvironmentToken();
  if(environment===undefined)return;
  return {docId:adapter.documentId,revision:adapter.revision,selectionGen:editor.currentSelectionGeneration,
    layoutGen:renderGeneration,fontEpoch:fontSupplyRevision(),native:adapter.nativeMutationGeneration(),
    state:JSON.stringify([environment,pages.style.zoom,editor.selection,editor.typing,
      adapter.savedRevision,files.dirty,editor.history.undoStack.length,editor.history.redoStack.length])};
}
function f5SelectionCells(owners?:OwnerProjection){
  if(!owners?.isCurrent(adapter))return;
  const s=editor.capture().selection;
  if(s.kind!=="cells")return;
  const grid=adapter.withOwnerReads(()=>adapter.cells(s.focus),owners);
  if(!ordinaryF5Grid(s,grid))return;
  const a=grid.find(b=>b.cellIdx===s.anchor.cell)!,b=grid.find(b=>b.cellIdx===s.focus.cell)!;
  return (s.phase===3?grid:grid.filter(x=>x.row>=Math.min(a.row,b.row)&&x.row<=Math.max(a.row,b.row)&&
     x.col>=Math.min(a.col,b.col)&&x.col<=Math.max(a.col,b.col))).map(x=>x.cellIdx);
}
// QA read-only witness is deliberately independent of f5Render. It records
// the actual mounted geometry and native target reference captured by
// Interaction's selection setter, with no getter or fallback execution here.
let qaSelectionMount: (()=>unknown)|undefined;
if(qaReadPhaseSnapshot){
  Object.defineProperty(window,"__oneditQaReadLifetimes",{value:qaReadPhaseSnapshot});
  Object.defineProperty(window,"__oneditQaSelectionMount",{value:()=>qaSelectionMount?.()??null});
}
function noteQaSelectionMount(viewEditor:Interaction,page:HTMLElement,r:{pageIndex:number;x:number;y:number;height:number}) {
  const owner=viewEditor.qaCellTarget();
  const svg=page.querySelector(":scope > svg"),overlay=page.querySelector(".highlight-cells path[d]");
  if(!owner||!svg||!overlay)return;
  const native=adapter.nativeMutationGeneration(),rev=adapter.revision,layout=renderGeneration,
    font=fontSupplyRevision(),dpr=devicePixelRatio,zoom=pages.style.zoom,left=input.style.left,top=input.style.top;
  qaSelectionMount=()=>({
    current:owner.current()&&native===adapter.nativeMutationGeneration()&&adapter.revision===rev&&layout===renderGeneration&&
      font===fontSupplyRevision()&&document.fonts.status==="loaded"&&dpr===devicePixelRatio&&zoom===pages.style.zoom&&
      !adapter.hasPendingLocalBodyFlow()&&!adapter.transientEdit&&!composing&&!files.busy&&
      page.isConnected&&page.parentNode===pages&&!page.hasAttribute("data-render-pending")&&page.querySelector(":scope > svg")===svg&&
      overlay.isConnected&&page.contains(overlay)&&left===input.style.left&&top===input.style.top,
    docId:owner.docId,revision:rev,selectionGen:owner.generation,native,layout,font,dpr,zoom,target:owner.target,
    owner:owner.position,phase:owner.phase,caret:{...r},input:{left,top,focused:document.activeElement===input},
  });
}
function paintSelectionGeometry(owners?:OwnerProjection) {
  paintedCellSelection = undefined;
  qaSelectionMount=undefined;
  const viewEditor = editor;
  // Read authoritative SVG/caret coordinates before mutating absolute overlays.
  // Only text highlighting is viewport-scoped; full owner/graph checks remain
  // in Interaction.rectangles, and all other selection kinds use the same path.
  const {visible,rectangles}=withCellDisplayOwner(owners,
    () => screenSelection(viewEditor,pages,viewport,owners,page=>selectionRuns(viewEditor,page)));
  const rects = selectionPaintBoxes(pages, visible ? rectangles.filter(r => visible.has(r.pageIndex)) : rectangles);
  selectionPaintNative = viewEditor.adapter.nativeMutationGeneration();
  selectionPaintPageKey = viewEditor.selection.kind === "text" ? selectionPageKey(visible) : undefined;
  const r = withCellDisplayOwner(owners, () => viewEditor.presentationCursorRect() ?? viewEditor.cursorRect());
  const compositionBoxes = composing ? compositionCursorBoxes(viewEditor, composition) : [];
  const page = pages.querySelector<HTMLElement>(`[data-page="${r.pageIndex}"]`);
  const point = page ? viewportPoint(page, viewport, r.x, r.y) : undefined;
  for (const overlay of Array.from(pages.getElementsByClassName("overlay")))
    overlay.replaceChildren();
  paintTableGuides(viewEditor,pages);
  paintBodyCorners(viewEditor,pages);
  let f5Overlay:SVGSVGElement|undefined;
  for (const pageIndex of new Set(rects.map(r => r.pageIndex))) {
    const bands = rects.filter(r => r.pageIndex === pageIndex && r.width > 0 && r.height > 0);
    if (!bands.length) continue;
    const x = Math.min(...bands.map(r => r.x)), y = Math.min(...bands.map(r => r.y));
    const width = Math.max(...bands.map(r => r.x + r.width)) - x;
    const height = Math.max(...bands.map(r => r.y + r.height)) - y;
    // Paint the existing exact union once per page. Independently composited
    // fractional div edges create bright seams and doubled inversion lines.
    // A single nonzero path shares internal edges without rounding selection
    // endpoints or tinting the bounding rectangle's unselected gaps.
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS(el.namespaceURI, "path");
    const cells = viewEditor.selection.kind === "cells";
    el.setAttribute("class", cells ? "highlight highlight-cells" : "highlight");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("viewBox", `0 0 ${width} ${height}`);
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, background: "none" });
    path.setAttribute("fill", cells ? "#d2daf2" : "#b8d8ff");
    path.setAttribute("fill-rule", "nonzero");
    path.setAttribute("d", bands.map(r => `M${r.x-x} ${r.y-y}h${r.width}v${r.height}h${-r.width}Z`).join(""));
    el.append(path);
    pages.querySelector(`[data-page="${pageIndex}"] .overlay`)?.append(el);
    if(f5Visual&&cells&&pageIndex===r.pageIndex)f5Overlay=el;
  }
  if (page && point) {
    const shaded = paintCompositionCursor(document, pages, compositionBoxes);
    // The regular caret has no DOM consumer for block selections or when
    // the composition overlay already supplies the caret presentation.
    if (viewEditor.selection.kind === "caret" && !shaded) {
      const cursor = document.createElement("div");
      cursor.className = "caret";
      Object.assign(cursor.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        height: `${r.height}px`,
      });
      page.querySelector(".overlay")!.append(cursor);
    }
    input.style.left = `${point.x}px`;
    input.style.top = `${point.y}px`;
    if(qaReadPhaseSnapshot)noteQaSelectionMount(viewEditor,page,r);
    if(f5Visual&&f5Overlay){
      const node=f5Overlay, svg=page.querySelector(":scope > svg"), path=node.firstElementChild;
      const d=path?.getAttribute("d"), left=input.style.left, top=input.style.top;
      const viewBox=node.getAttribute("viewBox"), style=node.getAttribute("style"), fill=path?.getAttribute("fill");
      f5Render.visual(f5Visual.id,viewEditor.selection,r,rects,f5Visual.cells,()=>
        !!svg&&!!path&&!!d&&page.parentNode===pages&&page.isConnected&&node.isConnected&&
        !page.hasAttribute("data-render-pending")&&page.style.visibility!=="hidden"&&
        page.style.contentVisibility!=="hidden"&&page.querySelector(":scope > svg")===svg&&
        node.parentNode===page.querySelector(".overlay")&&node.firstElementChild===path&&path.getAttribute("d")===d&&
        node.classList.contains("highlight-cells")&&!node.hasAttribute("hidden")&&
        node.getAttribute("viewBox")===viewBox&&node.getAttribute("style")===style&&path.getAttribute("fill")===fill&&
        input.isConnected&&input.style.left===left&&input.style.top===top);
    }
    if (viewEditor.selection.focus.kind === "cell" && !composing && !adapter.transientEdit) {
      const stamp = selectionPaintStamp();
      if (stamp) paintedCellSelection = {native: adapter.doc, stamp};
    }
  }
}
function projectText(id: string, text: string) {
  const node = $(id); if (node.textContent !== text) node.textContent = text;
}
let publishHostState:(()=>void)|undefined;
const coordinatorTrace=configureEditorDisplay(editor,()=>{
  if(renderedDocument!==adapter.documentId||files.busy||clipboardBusy||composing||
      adapter.transientEdit||document.fonts.status!=="loaded"||pages.children.length<2)return;
  // Geometry stays on the authoritative renderer. Unrelated pending
  // offscreen pages do not supply or invalidate structural membership.
  return `${renderGeneration}:${fontSupplyRevision()}:${devicePixelRatio}:${pages.style.zoom}:${pages.children.length}`;
},location.href,window.parent===window);
if(coordinatorTrace)Object.defineProperty(window,"__oneditQaEditorCoordinator",{value:coordinatorTrace});
function paintSelection(owners?:OwnerProjection, changedCellClose?:()=>void) {
  return publishEditorDisplay(editor,()=>withFormatPresentationRead(editor, () => {
  menuSettings?.sync();
  headerFooter?.sync();
  pageNumber?.sync();
  columns?.sync();
  // Resize only changes geometry. UI2 already projects passive format state
  // after the frame and flushes it before toolbar/menu actions. Avoid reading
  // all selected text formats again on every size key; blocking admission still
  // updates immediately, and every real command revalidates its live owner.
  const reason = formatUIBlockReason({fileBusy:files.busy,composing:false,clipboardBusy,modal:!!document.querySelector("dialog[open]")});
  const resizeFormatsUnchanged = !reason && adapter.scope === "edit" && !adapter.documentLocked && renderedDocument === adapter.documentId &&
    !!document.getElementById("integration-menus") && !!pages.querySelector("[data-resize-canvas]");
  const keepFormat = !reason && keepTypingFormatPresentation(editor);
  if (!changedCellClose && !resizeFormatsUnchanged && !keepFormat) syncFormatView(owners);
  paintSelectionGeometry(owners);
  projectText("status",specialEditingStatus(document,editor));
  $("status").title = adapter.viewerOnlyReason ?? "";
  const statistics=characterStatistics(editor);statistics.sync();
  try { projectText("selection", readEditorDisplay(editor,"selection-status",()=>statistics.selection(),
    ()=>withCellDisplayOwner(owners,()=>statistics.selection()))); }
  catch (error) { $("selection").textContent="선택정보 확인 불가";console.warn('선택 글자수 조회 실패',error); }
  projectSaveNotice();
  pasteResult.sync();
  $("download-confirm").hidden = !files.pending;
  for (const id of activeWorkset(document) ? ["download-confirm"] : ["save", "save-as", "download-confirm"])
    $(id).toggleAttribute(
      "disabled",
      files.busy || (id !== "save" && window.parent !== window),
    );
  if(!activeWorkset(document))for (const id of ["new", "open", "close-document"])
    $(id).toggleAttribute("disabled", files.busy || window.parent !== window);
  // Cell guides and the authoritative overlay can invalidate earlier native
  // reads. Start the shared display reads only after that work has settled.
  if (changedCellClose && !resizeFormatsUnchanged && !keepFormat) syncFormatView(owners);
  if (activeWorkset(document)) {
    changedCellClose?.();
  } else if (!resizeFormatsUnchanged) {
    if (keepFormat) syncCommandToolbar(document, editor, !!reason, null, editMenuState(editor, !!reason, true));
    else {
      const painted = paintedCellSelection, values: Partial<Record<FormatKind, FormatState>> = {};
      withQaReadPhase(adapter.doc,"toolbar",()=>projectToolbarAdmission(document, editor, !!reason, reason, kind => {
        const value = readFormatPresentation(editor,kind);
        if (painted) values[kind] = value;
        return value;
      }, owners));
      if (changedCellClose && painted && !reason) changedCellClose();
      if (painted && paintedCellSelection === painted && painted.stamp === selectionPaintStamp()) {
        painted.formats = Object.freeze(values);
        if (!reason && owners?.isCurrent(adapter) &&
            (editor.selection.kind === "cells" || editor.selection.kind === "table"))
          rememberCellToolbar(document, painted.formats, cellToolbarContext(editor, !!reason, reason));
      }
    }
  }
  if (!keepFormat) { if (!activeWorkset(document)) syncFormatAdditions(); checkpointFormatPresentation(editor); }
  publishHostState?.();
  if(f5Visual)f5Render.commitVisual();
  }),!!changedCellClose);
}
function revealCursor() {
  const r = editor.presentationCursorRect() ?? editor.cursorRect();
  const page = pages.querySelector<HTMLElement>(`[data-page="${r.pageIndex}"]`);
  if (!page) return;
  const projected=viewportPoint(page,viewport,r.x,r.y);
  const top = projected.y;
  const left = projected.x;
  if (top < viewport.scrollTop + 16) viewport.scrollTop = Math.max(0, top - 16);
  else if (top + r.height*projected.scale > viewport.scrollTop + viewport.clientHeight - 16)
    viewport.scrollTop = top + r.height*projected.scale - viewport.clientHeight + 16;
  if (left < viewport.scrollLeft) viewport.scrollLeft = left;
  else if (left > viewport.scrollLeft + viewport.clientWidth - 16)
    viewport.scrollLeft = left - viewport.clientWidth + 16;
}
function updateView(action: () => void, afterF5?: () => void, trustedF5=false) {
  let revealed = false;
  try {
    $("error").hidden = true;
    action();
    if(f5SliceEnabled&&trustedF5&&afterF5&&!dialog.open){
      const native=adapter.doc, live=()=>currentF5Epoch(native);
      // Admission is optional. A read failure uses the untouched renderer;
      // never retry the selection mutation itself.
      let handled=false;
      editor.withCellBlockPresentation(owners=>{
        let id:number|undefined, cells:number[]|undefined;
        try{
          const epoch=live();
          if(epoch&&(cells=f5SelectionCells(owners)))id=f5Render.begin(epoch,live);
        }catch{/* legacy presentation below */}
        if(id===undefined||!cells)return;
        const selected=cells;
        handled=f5Render.write(id,()=>{
          f5Visual={id,cells:selected};
          try{files.ui.change(false);revealed=true;afterF5();}
          finally{f5Visual=undefined;}
        });
      });
      if(handled)return;
    }
    // Selection changes publish through the same explicit state boundary as
    // pointer/menu commands; overlay DOM is only a visual projection.
    if (afterF5 && !composing && !adapter.transientEdit && !deferredCompositionPages &&
        !pages.querySelector("[data-ime-canvas],[data-resize-canvas]")) {
      editor.withCellBlockPresentation(() => {
        files.ui.change(false);
        revealed = true;
        afterF5();
      });
      return;
    }
    files.ui.change(false);
  } catch (e) {
    knownDiagnosticError(e);
    $("error").textContent = String(e);
    $("error").hidden = false;
  }
  if (!revealed) afterF5?.();
}
function format(kind: FormatKind) {
  try {
    const captured = editor.capture();
    adapter.assertEditable(captured.selection.focus);
    for (const target of editor.targets(captured.selection)) adapter.assertEditable(target.p);
    if (kind === "cell" && nested(captured.selection.focus))
      throw Error("Core API 미지원: 중첩 셀 속성 변경");
    const state = editor.formatState(kind, captured.selection);
    if(kind==='char')state.__documentFonts=documentFontNames(editor.adapter);
    $("format-title").textContent = {
      char: "글자 모양",
      paragraph: "문단 모양",
      cell: "셀 속성",
    }[kind];
    $("format-note").textContent =
      kind === "cell"
        ? "선택한 셀에 적용합니다. 공유선은 선택된 이웃 셀도 함께 변경하며, 비선택 셀에 영향이 생기면 거절합니다. 그림·그라데이션 채우기는 조회·편집을 지원하지 않습니다."
        : "변경한 속성만 적용합니다. 혼합 값과 빈 항목은 유지하며, 음영 없음과 흰색은 구분됩니다.";
    if (kind === "paragraph" && nested(captured.selection.focus))
      $("format-note").textContent =
        "선택한 자식 셀 문단에 변경한 속성만 적용합니다. 혼합 값과 빈 항목은 유지합니다.";
    const changes = mountFields($("fields"), kind, state);
    if (kind === "char" || kind === "paragraph") showDocumentEditingDialog(dialog);
    else showEditorDialog(dialog);
    if(f5SliceEnabled)f5Render.open(dialog);
    ($("fields").querySelector("input,select") as HTMLElement)?.focus();
    $("format-form").onsubmit = (e) => {
      e.preventDefault();
      const props = changes();
      closeEditorDialog(dialog);
      if (Object.keys(props).length) safe(() => editor.execute({ type: kind, props }, captured));
    };
  } catch (e) {
    knownDiagnosticError(e);
    $("error").textContent = String(e);
    $("error").hidden = false;
    focus();
  }
}
$("cancel").onclick = () => {
  if(f5SliceEnabled&&dialog.open)f5Render.armClose(dialog);
  closeEditorDialog(dialog);
};
dialog.addEventListener("close", () => {
  if (dialog.open) {if(f5SliceEnabled)f5Render.closed(dialog,true);return;} // Never touch a reopened form.
  // Closing transfers focus synchronously. The queued close notification
  // owns presentation only; it cannot take focus from a later user action.
  // Only a proven unchanged close of this exact modal lifetime can use the
  // coordinator receipt. Unknown/implicit closes retain the original path.
  if(f5SliceEnabled&&f5Render.closed(dialog,false)&&cellDialogFor(document)?.ownsClosingDialog()){
    adapter.completeLocalBodyFlow();
    if(paintedCellSelection?.native===adapter.doc&&f5Render.isCurrent()){
      f5Render.reusedClose();return;
    }
  }
  // The integrated cell modal owns its admission publication, not the page
  // overlay. Reuse that already-painted overlay only after the same layout
  // barrier and only if all current cell view inputs still match.
  if (cellDialogFor(document)?.ownsClosingDialog() && paintedCellSelection &&
      !files.busy && !clipboardBusy && !composing && !adapter.transientEdit &&
      !deferredCompositionPages && !pages.querySelector("[data-resize-canvas],[data-ime-canvas]")) {
    adapter.completeLocalBodyFlow();
    if (paintedCellSelection.native === adapter.doc &&
        paintedCellSelection.stamp === selectionPaintStamp()) return;
  }
  paint();
});
syncFormatAdditions = mountFormatAdditions($("toolbar"), editor, {
  busy: () => composing || dialog.open || clipboardBusy || files.busy,
  command: (command, captured) => { safe(() => editor.execute(command, captured)); focus(); },
  dialog: () => document.dispatchEvent(new CustomEvent("rhwp:paragraph-lists")),
  feedback: message => { $("error").textContent = message; $("error").hidden = false; },
});
$("table-object").onclick = () => {
  updateView(() => editor.selectTable());
  focus();
};
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-resize]"))
  b.onclick = () => {
    const [width, height] = b.dataset.resize!.split(",").map(Number);
    safe(() => editor.execute({ type: "resize", width, height }), false, true);
    focus();
  };
$("character").onclick = () => format("char");
$("paragraph").onclick = () => format("paragraph");
$("cell-format").onclick = event => {
  const command = cellDialogFor(document);
  if (command) { if (event.detail < 2) command.open("properties"); }
  else format("cell");
};
$("bold").onclick = () => {
  safe(() => editor.execute({ type: "bold" }));
  focus();
};
for (const name of ["italic", "underline"])
  $(name).onclick = () => {
    safe(() =>
      editor.execute({
        type: "char",
        props: { [name]: editor.formatState("char")[name] !== true },
      }),
    );
    focus();
  };
$("undo").onclick = () => {
  safe(() => runHistory(editor, false, clipboardBusy || files.busy), true);
  focus();
};
$("redo").onclick = () => {
  safe(() => runHistory(editor, true, clipboardBusy || files.busy), true);
  focus();
};
$("table").onclick = () => {
  safe(() => editor.execute({ type: "insert-table", rows: 2, cols: 2 }));
  focus();
};
$("inline-table").onclick = () => {
  safe(() =>
    editor.execute({ type: "insert-table", rows: 2, cols: 2, inline: true }),
  );
  focus();
};

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-table]",
))
  button.onclick = () => {
    safe(() =>
      editor.execute({
        type: "table-edit",
        operation: button.dataset.table as any,
      }),
    );
    focus();
  };
async function save(as = false) {
  $("error").hidden = true;
  await files.save(as);
  focus();
}
$("save").onclick = (e) => {
  if (e.detail < 2) void save();
};
$("save-as").onclick = (e) => {
  if (e.detail < 2) void save(true);
};
$("download-confirm").onclick = () => {
  const pending = files.pending;
  if (files.busy || !pending) return;
  // A fresh element owns this chooser's callbacks, even if an old chooser event
  // arrives after a later activation. Never attach "latest" to a shared input.
  const control = document.createElement("input");
  control.type = "file";
  control.accept = ".hwpx";
  $("error").hidden = true;
  control.onchange = async () => {
    const file = control.files?.[0];
    control.value = "";
    $("error").hidden = true;
    if (file) await files.confirmDownloaded(pending.requestId, file);
    focus();
  };
  control.oncancel = () => {
    files.cancelDownload(pending.requestId);
    focus();
  };
  control.click();
};
$("new").onclick = async (e) => {
  if (e.detail > 1) return;
  $("error").hidden = true;
  await files.newDocument();
  focus();
};
$("close-document").onclick = async (e) => {
  if (e.detail > 1) return;
  $("error").hidden = true;
  await files.closeDocument();
  focus();
};
const openControl = $<HTMLInputElement>("open");
const restoreOpenFocus = () => {
  // A chooser cancel has no change event. Restore only its abandoned focus;
  // an opening document/dialog or a newer control must keep its own focus.
  if (!files.busy && !document.querySelector('dialog[open]') &&
      (document.activeElement === openControl || document.activeElement === document.body)) focus();
};
openControl.oncancel = restoreOpenFocus;
openControl.onchange = async (e) => {
  const control = e.target as HTMLInputElement,
    file = control.files?.[0];
  // Clear before every return/await, including dirty-warning cancellation. This
  // makes selecting the same file again a fresh browser change event.
  control.value = "";
  if (!file) { restoreOpenFocus(); return; }
  $("error").hidden = true;
  await files.open(file);
  focus();
};
if(new URL(location.href).searchParams.get('perf40ActiveWorksetTrace')==='1'&&window.parent===window&&location.hostname==='127.0.0.1')
  Object.defineProperty(window,'__oneditQaActiveWorkset',{value:()=>({
    enabled:activeWorkset(document),docId:adapter.documentId,revision:adapter.revision,
    selectionGeneration:editor.currentSelectionGeneration,selection:structuredClone(editor.selection),
    renderGeneration,fontRevision:fontSupplyRevision(),nativeDispatch:screenInputDispatchEpoch(adapter.doc),
    environment:adapter.observedLocalBodyEnvironment(),pendingLocalFlow:adapter.hasPendingLocalBodyFlow(),
    deferredCompositionPages,composing,zoom:pages.style.zoom,
    pages:Array.from(pages.children).map(p=>({page:(p as HTMLElement).dataset.page,
      pending:(p as HTMLElement).dataset.renderPending??null,svg:!!p.querySelector(':scope > svg'),
      canvas:!!p.querySelector(':scope > canvas'),gutter:p.querySelectorAll('.line-selection-gutter').length,
      currentNativeProof:activePageReady(p as HTMLElement)})),
    openMenus:Array.from(document.querySelectorAll('#main-menu details[open]')).map(e=>e.id)
  })});
const studioClickCounts:Record<string,number>=Object.create(null);
const studioClickTrace=new URL(window.location.href).searchParams.get("studioTableClickTrace")==="1";
if(studioClickTrace&&studioS6ClickRoute())Object.defineProperty(window,"__oneditQaTableClickScope",{
  value:()=>({...studioClickCounts}),
});
function studioS6ClickRoute(){
  const u=new URL(window.location.href);
  return window.parent===window&&u.protocol==="http:"&&u.hostname==="127.0.0.1"&&
    u.searchParams.get("studioS6DormantTableTools")==="1";
}
function withStudioTableClick(page:HTMLElement,run:()=>void) {
  if(!activeWorkset(document)&&!studioTableClickScopedEnabled(window,coreRuntimeIdentity(adapter.doc)?.sha256))return run();
  const note=(reason:string)=>{if(studioClickTrace)studioClickCounts[reason]=(studioClickCounts[reason]??0)+1;};
  const a=adapter,native=a.doc,docId=a.documentId,revision=a.revision,svg=page.querySelector(":scope > svg"),
    view=renderGeneration,fonts=fontSupplyRevision(),environment=a.observedLocalBodyEnvironment(),zoom=pages.style.zoom,
    index=Number(page.dataset.page);
  const current=()=>adapter===a&&a.doc===native&&a.documentId===docId&&a.revision===revision&&
    renderedDocument===docId&&renderGeneration===view&&fontSupplyRevision()===fonts&&
    environment!==undefined&&a.observedLocalBodyEnvironment()===environment&&pages.style.zoom===zoom&&
    document.fonts.status==="loaded"&&!composing&&!files.busy&&!clipboardBusy&&!a.transientEdit&&
    !a.hasPendingLocalBodyFlow()&&!document.querySelector("dialog[open]")&&
    (!deferredCompositionPages||activeWorkset(document)&&activePageReady(page))&&!page.matches("[data-render-pending],[data-ime-canvas],[data-resize-canvas]")&&
    !!svg&&svg===page.querySelector(":scope > svg")&&page.isConnected&&page.parentElement===pages&&
    Number.isSafeInteger(index)&&index>=0&&page.dataset.page===String(index);
  const pending=[...pages.querySelectorAll<HTMLElement>('[data-render-pending],[data-ime-canvas],[data-resize-canvas]')];
  const active=activeWorkset(document)?activePageRange(pages,viewport,index):undefined;
  const pendingSafe=activeWorkset(document)&&activePageReady(page)&&!!active&&pending.every(p=>
    !active.has(Number(p.dataset.page))&&p.parentElement===pages&&
    ['font','workset'].includes(p.dataset.renderPending??'')&&p.style.visibility==='hidden'&&
    p.style.contentVisibility==='hidden'&&!p.matches('[data-ime-canvas],[data-resize-canvas]'));
  if(!current()||(pending.length>0&&!pendingSafe)){
    note(!current()?"current-input-fence":!activePageReady(page)?"page-native-proof-unavailable":"active-page-pending");
    note("view-pending-or-stale");return run();
  }
  note("pointer-scope");
  return editor.withClickedTablePointer(index,current,note,run);
}
pages.onpointerdown = (e) => {
  if (e.pointerType === 'touch') return; // Touch intent belongs to the scaled view controller.
  let target = (e.target as Element).closest<HTMLElement>(".page");
  if (target && pages.querySelector("[data-ime-canvas]")) {
    const page = Number(target.dataset.page);
    render();
    // render replaces the page element; never measure the detached event target.
    target = pages.querySelector<HTMLElement>(`[data-page="${page}"]`);
  }
  if (!target) return;
  e.preventDefault();
  const page=target;
  const select=()=>updateView(() => {
    editor.pointer(
      Number(page.dataset.page),
      e.clientX - page.getBoundingClientRect().left,
      e.clientY - page.getBoundingClientRect().top,
      e.shiftKey,
      true,
    );
    dragging = true;
  });
  if(e.isTrusted&&e.button===0&&e.isPrimary&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey)withStudioTableClick(page,select);
  else select();
  focus();
};
window.addEventListener("pointermove", (e) => {
  // CSS owns the whole page's text cursor, including empty margins. Hover no
  // longer needs Core hit queries; actual selection/drag admission stays here.
  if (!dragging) return;
  const target = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest<HTMLElement>(".page");
  if (target)
    updateView(() =>
      editor.pointer(
        Number(target.dataset.page),
        e.clientX - target.getBoundingClientRect().left,
        e.clientY - target.getBoundingClientRect().top,
        true,
      ),
    );
});
window.addEventListener("pointerup", () => (dragging = false));
// Separate double-click admission; single pointer/drag/paint performance paths
// remain unchanged. The existing Selection boundary drives copy/edit/card.
pages.addEventListener('dblclick',e=>{
  if(e.defaultPrevented||e.button!==0||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||composing||adapter.transientEdit||files.busy||clipboardBusy||document.querySelector('dialog[open]'))return;
  const page=(e.target as Element).closest<HTMLElement>('.page');if(!page||!pages.contains(page))return;
  try{
    const captured=editor.capture(),point=pagePoint(page,e.clientX,e.clientY),range=bodyWordAtPoint(adapter,Number(page.dataset.page),point.x,point.y);
    if(!range||!page.isConnected||captured.documentId!==adapter.documentId||captured.revision!==adapter.revision||JSON.stringify(captured.selection)!==JSON.stringify(editor.selection))return;
    e.preventDefault();updateView(()=>{editor.point(range[0]);editor.point(range[1],true);editor.block=false;});focus();
  }catch(error){files.ui.error(error);}
});
qaInputBoundary = mountQaInputBoundary(window, input, () => ({
  revision: adapter.revision, selectionGeneration: editor.currentSelectionGeneration, renderGeneration,
  composing, fileBusy: files.busy, clipboardBusy, transientEdit: adapter.transientEdit, selectionKind: editor.selection.kind,
}));
mountCompositionInput({
  noteCommit: qaInputBoundary && (() => qaInputBoundary?.("native-composition-committed")),
  input, document, editor, files, compositionKeys, $, cancelComposition, paint, render, finishCompositionPages, safe,
  get composing() { return composing; }, set composing(value) { composing = value; },
  get composition() { return composition; }, set composition(value) { composition = value; },
  get clipboardBusy() { return clipboardBusy; },
});
async function clipboardAction(kind: "copy" | "cut" | "paste" | "paste-text", native?: NativePastePayload) {
  const selection = editor.selection;
  if (kind === "copy" && (selection.kind === "caret" ||
      selection.kind === "text" && samePosition(selection.anchor, selection.focus))) return;
  if (composing || files.busy || document.querySelector("dialog[open]")) {
    $("clipboard-status").textContent = "한글 조합·대화상자·문서 작업을 마친 뒤 사용하세요.";
    return;
  }
  if (clipboardBusy) {
    $("error").textContent = "클립보드 작업이 진행 중입니다.";
    $("error").hidden = false;
    return;
  }
  const initiator = document.activeElement;
  let osWriteCompleted = false;
  let pasteApplied = false;
  let restoreTarget: ReturnType<Interaction["capture"]> | undefined;
  clipboardBusy = true;
  paint();
  try {
    if (kind === "paste" || kind === "paste-text") pasteResult.start(kind === "paste-text");
    const captured = editor.capture();
    restoreTarget = captured;
    const support = clipboardSupport(editor, kind === "paste-text" ? "paste" : kind);
    if (!support.supported) {
      // Known selection limits are admission decisions, not failed OS work.
      // Keep them explicit and do not enter a clipboard transport or Command.
      if(support.expectedUnsupported){recordTableRefusal(document,new UnsupportedTableOperation("clipboard-scope",support.reason!),editor.selection);$("error").hidden=true;}else{$("error").textContent=support.reason!;$("error").hidden=false;}
      $("clipboard-status").textContent = "현재 선택에서는 클립보드 명령을 사용할 수 없습니다.";
      if (kind === "paste" || kind === "paste-text") pasteResult.failed(support.reason!, false);
      return;
    }
    const unchanged = () => {
      if (!document.hasFocus())
        throw Error("클립보드 작업 중 편집기 포커스가 변경되었습니다.");
      const current = editor.capture();
      if (
        current.documentId !== captured.documentId ||
        current.revision !== captured.revision ||
        JSON.stringify(current.selection) !== JSON.stringify(captured.selection)
      )
        throw Error(
          "클립보드 대기 중 문서 또는 선택이 변경되어 작업을 취소했습니다.",
        );
    };
    $("error").hidden = true;
    $("clipboard-status").textContent = "클립보드 처리 중";
    if (kind === "paste" || kind === "paste-text") {
      const origin = editor.adapter, nativeDoc = origin.doc,
        generation = editor.currentSelectionGeneration, undo = editor.history.undoStack.length,
        redo = editor.history.redoStack.length;
      let plain = kind === "paste-text", data: ClipboardRead | undefined, refused: PasteFormatUnavailable | undefined;
      try { data = native ? await readNativePaste(native) : await readClipboard(plain); }
      catch (e) { if (!(e instanceof PasteFormatUnavailable)) throw e; refused = e; }
      unchanged();
      const markdown = !plain && data && !data.image && !data.structured
        ? clipboardMarkdownTable(data.text) : undefined;
      if (data?.image) {
        const size = clipboardPictureSize(data.image);
        editor.execute({type:"picture",change:{action:"insert",file:data.image,...size,placement:"inline",replaceSelection:true}},captured);
      } else if (data) {
        try {
          editor.execute({ type: "paste", text: data.text, html: data.html, structured: data.structured,
            markdownTable: markdown }, captured);
        } catch (e) {
          const refusedRichScope = e instanceof UnsupportedTableOperation &&
            ["clipboard-target-scope", "clipboard-owner-width", "clipboard-body-oversized-table"].includes(e.code);
          if (plain || !(data.html || data.structured || markdown) ||
              !(e instanceof PasteFormatUnavailable || refusedRichScope)) throw e;
          refused = e instanceof PasteFormatUnavailable ? e : new PasteFormatUnavailable(e.message);
        }
      }
      if (refused) {
        const text = refused.alternativeText ?? data?.plainAlternative ?? data?.text;
        if (plain || !text) {
          const message = "이 형식은 붙일 수 없고, 클립보드에 대신 붙일 텍스트도 없습니다.";
          pasteResult.failed(message, false);
          $("clipboard-status").textContent = "붙여넣지 않음";
          return;
        }
        const checkContext = () => {
          if (!document.hasFocus() || composing || files.busy || origin.transientEdit ||
              document.querySelector("dialog[open]") || editor.adapter !== origin || origin.doc !== nativeDoc ||
              editor.currentSelectionGeneration !== generation || origin.revision !== captured.revision ||
              editor.history.undoStack.length !== undo || editor.history.redoStack.length !== redo)
            throw Error("붙여넣을 위치가 바뀌었습니다. 위치를 선택해 다시 붙여넣으세요.");
        };
        const validateAlternative = () => {
          checkContext();
          const live = editor.capture();
          if (live.documentId !== captured.documentId ||
              JSON.stringify(live.selection) !== JSON.stringify(captured.selection) ||
              JSON.stringify(live.paths) !== JSON.stringify(captured.paths))
            throw Error("붙여넣을 위치가 바뀌었습니다. 위치를 선택해 다시 붙여넣으세요.");
          if (live.selection.kind !== "caret" && live.selection.kind !== "text")
            throw Error("텍스트를 붙일 위치에 커서를 두거나 텍스트를 선택하세요.");
          for (const {p} of editor.targets(live.selection)) {
            origin.assertEditable(p);
            origin.assertTextOnly(p);
            if (live.selection.kind === "text" && p.kind === "body" && origin.hasBodyLayoutObject(p))
              throw Error("개체를 피해서 텍스트를 붙일 위치를 선택하세요.");
          }
          checkContext();
        };
        validateAlternative();
        $("clipboard-status").textContent = "";
        if (!await offerPlainPaste(document)) {
          $("clipboard-status").textContent = "붙여넣기 취소";
          return;
        }
        validateAlternative();
        plain = true;
        data = {text, html: ""};
        pasteResult.start(true);
        editor.execute({type: "paste", ...data}, captured);
      }
      if (!data) return;
      pasteApplied = adapter.revision !== captured.revision;
      publishBodyPaste(captured, !data.image);
      const markdownApplied = !!markdown && !plain;
      const detail = markdownApplied ? "마크다운 표 붙여넣기 완료" : data.image ? "클립보드 그림 삽입 완료" : pasteCompletion(data);
      $("clipboard-status").textContent = pasteApplied ? `${plain ? "텍스트만" : "서식 포함"} 붙이기 · ${detail}` : "붙여넣기 · 문서 변경 없음";
      pasteResult.applied({ detail, changed: pasteApplied, formatted: !!(markdownApplied || data.image || data.structured || data.html),
        extensionMetadata: !markdownApplied && !data.structured && !data.html.includes("data-rhwp-next-clipboard") && /hwpEditorBoardContent|data-hjsonver|hwpjson/i.test(data.html) });
    } else {
      const objectSource = kind === 'cut' && captured.selection.kind === 'object'
        ? selectedCutObject(adapter, captured.selection) : undefined;
      if (kind === "cut" && !objectSource)
        for (const t of editor.targets()) adapter.assertEditable(t.p);
      const cellBlockCut=kind==='cut'&&captured.selection.kind==='cells'
        ? captureCellBlockObjectCut(adapter,captured.selection,editor.cells(captured.selection).map(c=>c.cellIdx)) : undefined;
      const parentTableCut=kind==='cut'?captureParentTableCut(adapter,captured.selection):undefined;
      const data = editor.copyClipboard();
      if (!data.text && !data.html) throw Error("복사할 영역을 선택하세요.");
      const path = await writeClipboard(data);
      osWriteCompleted = true;
      unchanged();
      if (kind === "cut") {
        editor.execute(objectSource ? { type: 'cut-object', source: objectSource }
          : { type: "delete", backward: false }, parentTableCut?{...captured,parentTableCut}:cellBlockCut?{...captured,cellBlockCut}:captured);
        files.ui.change(true);
      }
      $("clipboard-status").textContent =
        `${path} ${kind === "cut" ? "잘라내기" : "복사"} 완료`;
    }
    restoreTarget = editor.capture();
  } catch (e) {
    if(e instanceof UnsupportedTableOperation&&!pasteApplied&&!osWriteCompleted){recordTableRefusal(document,e,editor.selection);$("error").hidden=true;$("clipboard-status").textContent=e.message;return;}
    if (kind === "paste" || kind === "paste-text") {
      pasteResult.failed(e instanceof Error ? e.message : String(e), pasteApplied);
      $("error").hidden = true;
    } else {
      $("error").textContent = `클립보드 작업 실패: ${String(e)}`;
      $("error").hidden = false;
    }
    $("clipboard-status").textContent = kind === 'cut' && osWriteCompleted
      ? '클립보드 기록 완료 · 잘라내기 취소 (클립보드 내용은 유지됩니다.)'
      : pasteApplied ? "붙여넣기 명령 이후 오류 · 결과 확인 필요" : "클립보드 작업 취소";
  } finally {
    clipboardBusy = false;
    paint();
    if (
      mayRestoreClipboardFocus(document, initiator, restoreTarget, () =>
        editor.capture(),
      )
    )
      focus();
  }
}
mountNativeClipboardInput(input, clipboardAction);
mountKeyboardInput({
  f5ReadEpoch: f5SliceEnabled ? () => currentF5Epoch(adapter.doc) : undefined,
  input, pages, viewport, dialog, document, window, editor, adapter, files, $, render, focus, revealCursor, safe, updateView, format, save, clipboardAction,
  get composing() { return composing; }, get clipboardBusy() { return clipboardBusy; },
  get menuSettings() { return menuSettings; }, get headerFooter() { return headerFooter; },
});
window.addEventListener("beforeunload", (e) => {
  if (adapter.revision !== adapter.savedRevision) {
    e.preventDefault();
    e.returnValue = "";
  }
});
if (window.parent !== window) {
  $("new").setAttribute("disabled", "");
  $("open").setAttribute("disabled", "");
}
const externalHost = new NextHostAdapter(adapter, editor);
connectConfiguredAIHost(externalHost, (bytes,binding,_generated,source,prepared) => {
  if (source && prepared) files.adoptHostOpen(prepared,source.format,source.scope,source.fileName);
  else {
    if (source || prepared) throw Error("연결 문서 검사 결과를 확인할 수 없습니다.");
    files.adoptPreparedAI(bytes);
  }
  externalHost.binding={documentId:binding.documentId,workingCopyId:binding.workingCopyId,baseVersion:binding.hostVersion};
},()=>files.busy||clipboardBusy||composing||!!document.querySelector('dialog[open]'),render,
 publish=>{publishHostState=publish;});
installMarkdownImport(externalHost, files);
// D mounts workspace menus in its existing FileLifecycle adapter microtask.
// Connect only after those exact U24 launchers and toolbar mirrors exist.
queueMicrotask(() => {
  mountLocalFontSettings(document,editor,{busy:()=>composing||clipboardBusy||files.busy});
  menuSettings = mountMenuSettings(document, {
    busy: () => composing || clipboardBusy || files.busy || !!document.querySelector('dialog[open]:not(#menu-settings)'),
    reason: id => {
      if (composing || clipboardBusy || files.busy || document.querySelector('dialog[open]'))
        return '입력·저장·열린 대화상자를 먼저 마치세요.';
      const state = settingsCommandState(editor).get(id);
      if (state) return state.reason;
      // D's existing list menu owns its admission; execution still revalidates Command/History.
      const source = document.querySelector<HTMLButtonElement>(`[data-format-addition="${id}"]`);
      return !source ? '지원하지 않는 명령입니다.' : source.disabled ? source.title : '';
    },
    capture: () => editor.capture(),
  });
  mountTextboxEditor(document,editor,{busy:()=>composing||clipboardBusy||files.busy,changed:render,focus,error:e=>{$("error").textContent=String(e);$("error").hidden=false;}});
  mountShortcutResults(document,{blocked:()=>composing||clipboardBusy||files.busy||!!document.querySelector('dialog[open]'),preferences:()=>menuSettings?.read()??[]});
  // Embedded Host has no standalone page-menu launchers. Do not partially
  // mount their dialogs or abort the remaining UI bootstrap on a null button.
  if (document.getElementById("header-footer-open")) headerFooter = mountHeaderFooter(document, editor, {
    busy: () => composing || clipboardBusy || files.busy,
    page: () => Math.max(0, Number($("view-status").dataset.viewPage ?? 1) - 1),
    changed: render, focus,
    error: error => { $("error").textContent = String(error); $("error").hidden = false; },
  });
  if (document.getElementById("page-number-open")) pageNumber = mountPageNumber(document, editor, {
    busy: () => composing || clipboardBusy || files.busy,
    page: () => Math.max(0, Number($("view-status").dataset.viewPage ?? 1) - 1),
    changed: render, focus,
    error: error => { $("error").textContent = String(error); $("error").hidden = false; },
  });
  if (document.getElementById("columns-open")) columns = mountColumns(document, editor, {
    busy: () => composing || clipboardBusy || files.busy,
    changed: render, focus,
    error: error => { $("error").textContent = String(error); $("error").hidden = false; },
  });
  // Presentation only, after shared sources, settings and late textbox entries
  // are connected. Other entrances and the closed command catalog stay intact.
  applyUserMenuDecisions(document);
  mountMenuLabels(document);
});
render();
focus();
// Read-only inspection for assertions. Tests may observe, never drive edits through this surface.
Object.defineProperty(window, "studioNext", {
  value: Object.freeze({
    files: () => files.state(),
    inspect: () => ({
      documentId: adapter.documentId,
      revision: adapter.revision,
      selection: copy(editor.selection),
      semantic: adapter.semantic(),
      undo: editor.history.undoStack.length,
      redo: editor.history.redoStack.length,
    }),
  }),
});
