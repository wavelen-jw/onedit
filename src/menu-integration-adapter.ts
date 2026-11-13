import { closeEditorDialog, keepDialogFieldFocus, showDocumentEditingDialog, showEditorDialog } from "./editor-popup-focus.js";
import { subscribeWhileOpen } from "./ui-demand-lifetime.js";
import {activeWorkset} from "./active-workset.js";
import { withQaReadPhase } from "./cursor-model-memo.js";
import { changedApplyDisplayEnabled, changedApplyDisplayReady, noteWidthRead, observedDisplayView, synchronousDisplayEnabled, publishEditorDisplay, readEditorDisplay } from "./editor-state-coordinator.js";
import {phase3LiteOptIn} from "./selection-context-lite.js";
import {perf4QuickFormatEnabled, perf4TableReasonOwnerEnabled, studioS6DormantToolsEnabled} from "./b338-focused-owner-trial.js";
import {coreRuntimeIdentity} from "./core-runtime.js";
import {applyNestedValign,captureNestedValign,nestedValignSupported} from "./nested-valign-command.js";
import {applyMergedValign,prepareMergedValign} from "./merged-valign-command.js";
import { f5Render, f5SliceEnabled } from "./f5-render-transaction.js";
import { readMenuAdmission } from "./menu-admission-read.js";
import { selectionContextOptIn, selectionTargetNativeOptIn } from "./selection-context-lite.js";
import { committedDormantTableTools, editorChanged, editorHistoryTravelled } from "./editor-state-adapter.js";
import { CellDisplayBatch } from "./cell-display-batch.js";
import type { OwnerProjection } from "./owner-projection.js";
import { projectCellDraft } from "./cell-dialog-projection.js";
import { connectCellDialogCommand, type CellDialogMode, type CellDialogTarget } from "./cell-dialog-command.js";
import {keepTypingFormatPresentation,checkpointFormatPresentation,withFormatPresentationRead,readFormatPresentation,readPassiveFormatPresentation} from './typing-format-presentation.js';
import { hancomWebKey } from "./hancom-web-shortcuts.js";
import { lowerMenuCommand } from "./menu-command-lowering.js";
import { submitFormatDraft } from "./format-draft-submit.js";
export { lowerMenuCommand } from "./menu-command-lowering.js";
export { submitFormatDraft } from "./format-draft-submit.js";
import { mountStatusStatistics } from './status-statistics.js';
import {mountLineSelectionGutter} from "./line-selection-gutter.js";
import { removeExcludedMenuEntries } from "./menu-exclusions.js";
import {mountTableObjectDraft} from './table-object-draft.js';
import {mountTableRangeSize} from './table-range-size-ui.js';
import { mountDocumentInfo } from "./shortcut-document-info.js";
import {mountPaper} from './shortcut-paper.js';
import {fontCycleCommand} from './shortcut-supported2.js';
import {fontSuggestions} from './font-availability.js';
import { mountTableKeyDraft } from "./shortcut-table-draft.js";
import { mountPasteChooser } from "./shortcut-paste-chooser.js";
import { cellBlockState } from './cell-block-scope.js';
import { mountToolbarOverflow } from "./toolbar-overflow.js";
import { mountWorkspaceToolbarLayout } from "./workspace-toolbar-layout.js";
import { mountHomeToolbar } from "./home-toolbar.js";
import { mountStudioMenus } from "./studio-menu-presentation.js";
import {mountSlashMenu} from "./slash-menu.js";
import {mountCommandSearch} from "./command-search.js";
import {searchCommands,collectSupportedMenuCommands,type SearchCommand} from "./command-search-catalog.js";
import {assertTableInsertTarget} from "./table-insert.js";
import {textboxInsertReason} from "./shapes.js";
import {pageBreakReason} from "./page-break.js";
import {columnBreakReason} from "./column-break.js";
import {mountObjectClipboard} from './object-clipboard-ui.js';
import { mountFormatCopy } from "./format-copy.js";
import { mountToolboxView } from "./toolbox-view.js";
import { searchShortcut } from "./keyboard.js";
import { mountShapes } from "./shape-ui.js";
import { formatUIBlockReason } from "./format-ui-state.js";
import { stylesUnavailable } from "./style-availability.js";
import { initializeStaticToolbar, cellToolbarAlreadyPainted, cellToolbarContext, projectToolbarAdmission, syncCommandToolbar } from "./command-state-integration.js";
import { mountNativePrint } from "./native-print.js";
import { mountOutlineNavigation } from "./outline-navigation.js";
import { mountTableInsert } from "./table-insert.js";
import { mountInsertMenuUI1 } from "./insert-menu-ui1.js";
import { mountPageMenuUI1 } from "./page-menu-ui1.js";
import { mountPropertiesPanel } from "./properties-panel.js";
import { mountMenuLifetime } from "./menu-lifetime.js";
import { mountWorkspaceUI } from "./workspace-ui.js";
import { mountModernWorkspace } from "./workspace-modern.js";
import { mountEmptyParagraphHint } from "./empty-paragraph-hint.js";
import { mountSelectionTools } from "./selection-tools.js";
import { mountDocumentNavigation } from "./document-navigation.js";
import { mountTableBoundary,assertBoundaryTable } from "./table-boundary.js";
import { mountPictureCanvas } from "./picture-canvas.js";
import { mountObjectHandles } from "./object-handles.js";
import { mountPictureContext } from "./picture-context.js";
import { mountShapeContext } from "./shape-context.js";
import { mountPictures } from "./picture-ui.js";
import {mountRemainingShortcutUI} from './remaining-shortcut-ui.js';
import { selectedClipboardObject } from './object-clipboard.js';
import { selectedPicture } from "./pictures.js";
import { mountQuickFormat, qaQuickFormatDemandFlag } from "./quick-format.js";
import { mountTableContext } from "./table-context.js";
import { runHistory, revealCommandSelection } from "./command-state-integration.js";
import { clipboardSupport } from "./clipboard-ui-state.js";
import { mountParagraphLists, listGroup, type ParagraphListChange } from "./paragraph-lists.js";
import {
  formatInputGuard,
  sameFormatTarget,
} from "./integration/a-format-input-guard.js";
import {
  renderFontStatus,
  refreshFontFields,
} from "./integration/a-font-availability.js";
import type { FileLifecycle } from "./file-lifecycle.js";
import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import { nested } from "./model.js";
import {
  keepWithNextHold,
  lineProtectionBodyUnsupported,
  type FormatKind,
} from "./formatting.js";
import type { ParagraphAdjustment } from "./paragraph-adjustments.js";
import { mountFields as basicFields } from "./format-dialog.js";
import { mountFields } from "./integration/a-format-dialog.js";
import { focusParagraphBeforeShortcut, mountHancomParagraphDialog, resetHancomParagraphDialog } from "./hancom-paragraph-dialog.js";
import { appendDialogShortcutHelp } from "./dialog-shortcut-help.js";
import { mountHancomCellDialog, resetHancomCellDialog } from "./hancom-cell-dialog.js";
import { mountSearch } from "./integration/a-search.js";
import { editMenuState, mountEditMenu } from "./integration/a-edit-menu.js";
import { mountTableMenu } from "./integration/a-table-menu.js";
import { mountNumberManager } from "./numbering-manager.js";
import {
  mountFormatMenu,
  formatMenuState,
  formatMenuItems,
  type CatalogCommand,
} from "./integration/a-format-menu.js";

// Resolve the advertised authoring key to the same existing catalog command.
/** One display-only demand boundary. No selection/protection data is read or
 * reused here. Unknown, rehosted, classic or visible toolbars stay eager. */
function legacyTableToolbarDemand(doc:Document,current:()=>boolean) {
  if(!current())return "stale";
  const root=doc.getElementById("table-tools");
  if(!doc.body.classList.contains("workspace-modern")||!(root instanceof HTMLDetailsElement)||
    root.open||root.contains(doc.activeElement))return "active-or-unknown";
  const controls=Array.from(doc.querySelectorAll('[data-resize],[data-table="row-delete"]'));
  if(!controls.length||controls.some(control=>!root.contains(control)))return "rehosted-or-missing";
  if(doc.defaultView?.getComputedStyle(root).display!=="none")return "visible-or-unknown";
  return current()?"dormant":"stale";
}

export function authoringShortcutCommand(
  e: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
): CatalogCommand | undefined {
  if (
    e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    e.shiftKey &&
    (e.code === "KeyL" || e.key.toLowerCase() === "l")
  )
    return formatMenuItems.find((item) => item.id === "left")?.command;
}

const formatGuards = new WeakMap<
  HTMLFormElement,
  ReturnType<typeof formatInputGuard>
>();
// D's dialog consumer only annotates existing fields. Preserve the selected
// imported true value and every untouched draft; explicit false stays enabled.
export function annotateParagraphFlowSupport(
  container: HTMLElement,
  scope: "body" | "cell" = "body",
) {
  const keep = container.querySelector<HTMLSelectElement>(
    'select[name="keepWithNext"]',
  );
  if (keep) {
    const activation = [...keep.options].find((o) => o.value === "true");
    if (activation) activation.disabled = true;
    keep.title = keepWithNextHold;
    const hint = keep.closest("label")?.querySelector("small");
    if (hint)
      hint.textContent +=
        " · " + keepWithNextHold + " · 기존 값 유지/명시적 해제 가능";
  }
  for (const name of ["keepLines", "widowOrphan"] as const) {
    const control = container.querySelector<HTMLSelectElement>(
      `[name="${name}"]`,
    );
    if (!control) continue;
    const activation = [...control.options].find((o) => o.value === "true");
    if (activation) activation.disabled = scope === "body";
    const reason =
      scope === "body"
        ? lineProtectionBodyUnsupported(name)
        : "셀 내부의 제한적 적용 경로는 유지합니다. 실제 쪽 경계 배치는 미검증입니다.";
    control.title = reason;
    const hint = control.closest("label")?.querySelector("small");
    if (hint)
      hint.textContent +=
        " · " + reason + " · XML 저장 지원 / 실제 줄 분할 배치 NOT_RUN";
  }
}
const bindings = new WeakMap<Document, () => void>();

// D's capture may hold session path handles: reject document drift before resolving it.
export function syncWritingFormatDraft(
  editor: Interaction,
  captured: ReturnType<Interaction["capture"]> | undefined,
  guard: ReturnType<typeof formatInputGuard>,
  dialog: HTMLDialogElement,
  doc: Document,
) {
  if (!dialog.open || !captured) return captured;
  let current = false;
  if (
    captured.documentId === editor.adapter.documentId &&
    captured.revision === editor.adapter.revision
  ) {
    try {
      current = sameFormatTarget(captured, editor.capture());
    } catch {
      /* Expired path. */
    }
  }
  if (current) return captured;
  const hadFocus = dialog.contains(doc.activeElement);
  guard.close();
  doc.getElementById("fields")!.replaceChildren();
  doc.getElementById("format-note")!.textContent =
    "대상 문서·리비전·선택이 변경되어 이전 초안을 취소했습니다. 취소 후 다시 여세요.";
  doc
    .getElementById("format-form")!
    .querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled = true;
  if (hadFocus) doc.getElementById("cancel")!.focus();
  return undefined;
}

/** Explicit private standalone loopback opt-in; no inference about Host/API users. */
export function qaLocalCellSubmit(url: string): boolean {
  try {
    const u = new URL(url), flags = u.searchParams.getAll("oneditQaLocalCellSubmit");
    return u.protocol === "http:" && u.hostname === "127.0.0.1" && flags.length === 1 && flags[0] === "1";
  } catch { return false; }
}

export function connectMenuIntegration(files: FileLifecycle, doc: Document) {
  const documentTools = doc.querySelector("header nav, #workspace-quickbar nav");
  if (
    !files.ui.standalone ||
    !doc.getElementById("pages") ||
    !doc.getElementById("input") ||
    !documentTools
  )
    return;
  bindings.get(doc)?.();
  const editor = files.editor,
    input = doc.getElementById("input")!;
  const view = doc.defaultView;
  const menuSelectionContext = selectionContextOptIn(view);
  const nativeSelectionTarget = selectionTargetNativeOptIn(view);
  const localCellSubmit = !!view && view.parent === view && qaLocalCellSubmit(view.location.href);
  const format = doc.getElementById("format") as HTMLDialogElement;
  const form = doc.getElementById("format-form") as HTMLFormElement;
  form.querySelector("menu")!.prepend(doc.getElementById("cancel")!);
  let formatGuard = formatGuards.get(form);
  if (!formatGuard) {
    formatGuard = formatInputGuard(form);
    formatGuards.set(form, formatGuard);
  }
  const guard = formatGuard;
  let formatTarget: ReturnType<Interaction["capture"]> | undefined;
  const closeFormatGuard = () => {
    if (format.open) return; // A queued old close must not consume a reopened dialog.
    guard.close();
    formatTarget = undefined;
  };
  format.addEventListener("close", closeFormatGuard);
  const basicParagraphShortcut = (event: KeyboardEvent) => {
    if (format.dataset.formatKind !== "paragraph-basic") return;
    focusParagraphBeforeShortcut(event, format, form.querySelector<HTMLInputElement>('input[name="spacingBefore"]'));
  };
  format.addEventListener("keydown", basicParagraphShortcut);
  let composing = false;
  const focus = () => input.focus({ preventScroll: true });
  // This is a live tag collection, not a cached modal state. Repeated menu
  // admission reads need only inspect dialogs, without walking every SVG node.
  // Attribute presence matches dialog[open], including dynamically added dialogs.
  const dialogs = doc.getElementsByTagName("dialog");
  const modal = () => {
    for (let i = 0; i < dialogs.length; i++)
      if (dialogs[i].hasAttribute("open")) return true;
    return false;
  };
  const busy = () =>
    files.busy ||
    composing ||
    (doc.getElementById("clipboard-status")?.textContent ?? "").includes(
      "처리 중",
    );
  const formatConfirm = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  // A mouse confirmation keeps the current text field or toggle in charge
  // of the native editing selection until the same form validates and closes.
  const disposeFormatConfirmFocus = keepDialogFieldFocus(format, formatConfirm, () =>
    (format.dataset.formatKind === "char" || format.dataset.formatKind === "paragraph") &&
    formatTarget?.selection.focus.kind === "body" && form.contains(doc.activeElement) &&
    guard.ready() && !busy());
  const formatCancel = doc.getElementById("cancel") as HTMLButtonElement;
  const disposeFormatCancelFocus = keepDialogFieldFocus(format, formatCancel, () =>
    (format.dataset.formatKind === "char" || format.dataset.formatKind === "paragraph") &&
    guard.ready() && !busy());
  const unavailable = () => busy() || modal();
  // Opening/reading UI is independent of the pending IME transaction. Actual
  // Commands, modal drafts, file/clipboard work retain the stricter barrier.
  const readUnavailable = () => files.busy || modal() ||
    (doc.getElementById("clipboard-status")?.textContent ?? "").includes("처리 중");
  const formatBlockedReason = () => formatUIBlockReason({fileBusy:files.busy, composing, modal:modal(),
    clipboardBusy:(doc.getElementById("clipboard-status")?.textContent ?? "").includes("처리 중")});
  const publishChange = (changedCellClose?:()=>void, separateDisplay=false, committedCellApply=false, dormantTableTools?:()=>boolean) => {
    const refresh = () => {
    files.ui.change(true,changedCellClose,committedCellApply,dormantTableTools); // Existing renderer + D state/view adapters.
    // D may recreate page DOM while document/revision/selection are unchanged.
    // Restore object handles after that render even if the menu state key repeats.
    pictureCanvas.sync();
    objectHandles.sync();
    };
    // Keep the default publisher untouched; the changed-cell path owns its
    // only shared publication at the post-geometry display sinks.
    return changedCellClose||separateDisplay ? refresh() : publishEditorDisplay(editor,refresh);
  };
  const changed = () => publishChange();
  const safe = (run: () => void, reveal = true) => {
    if (busy()) return;
    try {
      const error = doc.getElementById("error");
      if (error) error.hidden = true;
      const before = editor.capture();
      run();
      changed();
      if (reveal) revealCommandSelection(doc, before, editor.capture());
    } catch (e) {
      files.ui.error(e);
      files.ui.change(false);
    }
    focus();
  };
  const search = mountSearch(editor, changed, focus);
  const documentInfo=mountDocumentInfo(doc,editor,{blocked:unavailable});
  mountStatusStatistics(doc,editor,{blocked:unavailable,show:launcher=>{try{documentInfo.show(launcher);}catch(error){files.ui.error(error);}}});
  const paper=mountPaper(doc,editor,{blocked:unavailable,inFlight:busy,focus,changed,error:files.ui.error});
  const tableObjectDraft=mountTableObjectDraft(doc,editor,{blocked:unavailable,inFlight:busy,changed});
  const tableRangeSize=mountTableRangeSize(doc,editor,{busy,changed,error:e=>files.ui.error(e)});
  const tableKeyDraft=mountTableKeyDraft(doc,editor,{blocked:unavailable,inFlight:busy,changed,error:files.ui.error});
  let remainingShortcuts:ReturnType<typeof mountRemainingShortcutUI>|undefined;
  const pasteChooser=mountPasteChooser(doc,editor,{blocked:unavailable,focus,paste:plain=>{focus();input.dispatchEvent(plain?new Event('rhwp:paste-text'):new ClipboardEvent('paste',{bubbles:true,cancelable:true}));}});
  const queryShortcut=(event:Event)=>{if(unavailable())return;try{const key=(event as CustomEvent<string>).detail;if(key==='i'||key==='d')documentInfo.show();else if(key==='l')search.previous();else search.show(key==='a');}catch(error){files.ui.error(error);}};
  let equalPending=false;
  const shortcutUI=async(event:Event)=>{
    if(unavailable())return;try{const action=(event as CustomEvent<string>).detail;
    if(action==='character-map'){remainingShortcuts?.show('character-map');return;}
    if(action==='table-transpose'||action==='table-object-line'||action==='table-object-background'){tableObjectDraft.show(action==='table-transpose'?'transpose':action==='table-object-line'?'line':'background');return;}
    if(action==='page-goto'){const page=doc.querySelector<HTMLInputElement>('[name=statusPage]');if(!page||page.disabled)throw Error('현재 쪽 이동 입력을 사용할 수 없습니다.');page.focus();page.select();return;}
    if(action==='paper'){paper.show();return;}
    if(action==='equal-width'||action==='equal-height'){
      if(equalPending)return;const target=editor.capture();if(target.selection.focus.kind!=='cell')throw Error('셀 블록을 선택하세요.');equalPending=true;
      try{await assertBoundaryTable(editor,target.selection.focus);if(unavailable()||!sameFormatTarget(target,editor.capture()))throw Error('표 제한 확인 중 문서·선택이 변경되었습니다.');editor.execute({type:'cell-equal',axis:action==='equal-width'?'width':'height'},target);changed();focus();}finally{equalPending=false;}return;
    }
    if(action==='font-next'||action==='font-previous'){
      const state=editor.formatState('char'),scope=doc.querySelector<HTMLSelectElement>('[name=quickLanguage]')?.value??'all';
      const command=fontCycleCommand(state,fontSuggestions(state),scope,action==='font-next'?1:-1);
      if(command){editor.execute(command,editor.capture());changed();}focus();return;
    }
    if(action==='toolbox'){(doc.getElementById('toolbox-collapse')??doc.querySelector<HTMLButtonElement>('[data-toolbox-view="toolbar"]'))?.click();return;}
    if(action==='paste-choose'){pasteChooser.show();return;}
    if(action==='table-add'||action==='table-delete'||action==='cell-split'){tableKeyDraft.show(action);return;}
    if(action==='object-background'){const row=shapes.readSelected();if(editor.selection.kind!=='object'||!row||row.name!=='글상자')throw Error('배경색 입구는 기존 본문 plain 글상자에서 지원합니다.');shapes.showProperties();const tab=doc.querySelector<HTMLButtonElement>('dialog[open] [data-object-tab="3"]');if(!tab)throw Error('글상자 채우기 탭을 확인할 수 없습니다.');tab.click();tab.focus();return;}
    if(action==='object-line'){
      const s=editor.selection;if(s.kind!=='object')throw Error('개체를 선택하세요.');
      if(s.focus.kind==='cell'||selectedClipboardObject(editor.adapter,s).kind==='picture')pictures.showProperties();else {
        const row=shapes.readSelected();if(!row||row.name!=='글상자')throw Error('선 속성 탭은 기존 본문 plain 글상자/그림에서만 지원합니다.');shapes.showProperties();
      }
      const tab=doc.querySelector<HTMLButtonElement>('dialog[open] [data-object-tab="2"]');
      if(!tab)throw Error('현재 개체의 선 속성 탭은 연결되지 않았습니다.');tab.click();tab.focus();
    }
    }catch(error){files.ui.error(error);}
  };
  doc.addEventListener('rhwp:query-shortcut',queryShortcut);
  doc.addEventListener('rhwp:shortcut-ui',shortcutUI);
  const searchRoot = doc.getElementById("search-dialog")!;
  const guardSearch = (e: Event) => {
    if (busy()) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  searchRoot.addEventListener("click", guardSearch, true);
  searchRoot.addEventListener("keydown", guardSearch, true);
  const roots: HTMLElement[] = [doc.getElementById("search-dialog")!];
  const host = doc.createElement("div");
  host.id = "integration-menus";
  const style = doc.createElement("style");
  style.textContent = `#integration-menus{display:flex;gap:6px}#integration-menus details{position:relative}#integration-menus summary{padding:8px;cursor:pointer}#integration-menus [data-menu-panel]{position:absolute;z-index:30;top:100%;right:0;background:white;color:#102b42;border:1px solid #b5c9da;padding:8px;min-width:240px;max-height:65vh;overflow:auto;display:grid;gap:4px}#format #fields nav,#format #fields fieldset,#format #fields>p{grid-column:1/-1}#format #fields [hidden]{display:none!important}#format #fields nav{display:flex;flex-wrap:wrap;gap:4px}#search-dialog label{display:block;margin:8px}#search-dialog output{display:block;max-width:600px;white-space:pre-wrap}`;
  host.append(style);
  documentTools!.append(host);
  roots.push(host);
  const clipboardInfo = doc.createElement("p");
  clipboardInfo.id = "clipboard-support";
  host.after(clipboardInfo);
  roots.push(clipboardInfo);
  let printDisposed = false;
  const nativePrint = mountNativePrint(doc, editor.adapter, () => { if (!printDisposed) { sync(); focus(); } }, e=>files.ui.error(e));
  const directPrintButton=doc.createElement('button');directPrintButton.type='button';directPrintButton.id='print-button';directPrintButton.textContent='인쇄';
  directPrintButton.setAttribute('aria-keyshortcuts','Control+P Meta+P Alt+P');documentTools!.append(directPrintButton);roots.push(directPrintButton);
  const showPrint = () => {
    if(unavailable()||printDisposed||nativePrint.busy)return;
    for(const menu of doc.querySelectorAll<HTMLDetailsElement>('#main-menu > details[open]'))menu.open=false;
    void nativePrint.print();sync();
  };
  directPrintButton.onclick=showPrint;
  const syncPrint = () => {
    if(activeWorkset(doc)){directPrintButton.disabled=false;directPrintButton.title="브라우저 인쇄 창 (Ctrl+P) · 프린터·쪽 범위·매수·PDF 저장";return;}
    nativePrint.sync();
    directPrintButton.disabled = unavailable() || nativePrint.busy;
    directPrintButton.title = "브라우저 인쇄 창 (Ctrl+P) · 프린터·쪽 범위·매수·PDF 저장";

  };
  const printObserver = new MutationObserver(syncPrint);
  if(!activeWorkset(doc))printObserver.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["open"] });else syncPrint();
  const fontPanel = doc.createElement("details"),
    fontSummary = doc.createElement("summary"),
    fontContent = doc.createElement("div");
  fontPanel.id = "font-availability";
  fontSummary.textContent = "글꼴 표시 상태";
  fontContent.id = "font-availability-content";
  fontPanel.append(fontSummary, fontContent);
  (doc.querySelector("aside") ?? host).append(fontPanel);
  roots.push(fontPanel);
  fontPanel.addEventListener("toggle",()=>{if(activeWorkset(doc)&&fontPanel.open)
    withFormatPresentationRead(editor,()=>renderFontStatus(fontContent,readFormatPresentation(editor,"char")));});
  function menu(id: string, label: string, panelName: string) {
    const root = doc.createElement("details"),
      summary = doc.createElement("summary"),
      panel = doc.createElement("div");
    root.id = id;
    summary.textContent = label;
    panel.setAttribute(panelName, "");
    panel.dataset.menuPanel = "";
    root.append(summary, panel);
    host.append(root);
    return root;
  }
  // Display reads use the existing fixed owner fence; an open or apply
  // captures the current target again and never trusts projected DOM state.
  const isBlock = (mode: CellDialogMode) => mode === "block-border" || mode === "block-background";
  const prepareCell = (mode: CellDialogMode, expected?: CellDialogTarget, displayOwner?: OwnerProjection, coordinated = false) => {
    if (mode==="properties" && nested(editor.selection.focus) && nestedValignSupported(editor,doc)) {
      const capture=editor.capture();
      if(expected&&!sameFormatTarget(expected,capture))throw Error("문서·리비전·선택이 변경되었습니다. 메뉴를 다시 여세요.");
      const nestedDraft=captureNestedValign(editor,doc);
      return {capture,state:{verticalAlign:nestedDraft.verticalAlign},nestedDraft};
    }
    const read = () => {
    const capture = editor.capture();
    if (expected && !sameFormatTarget(expected, capture))
      throw Error("문서·리비전·선택이 변경되었습니다. 메뉴를 다시 여세요.");
    if (capture.selection.focus.kind !== "cell" || nested(capture.selection.focus))
      throw Error("일반 셀을 선택하세요.");
    for (const t of editor.targets(capture.selection)) files.adapter.assertEditableForPresentation(t.p);
    const block = isBlock(mode);
    const state = projectCellDraft(editor, capture.selection, block) ??
      (block ? cellBlockState(editor, capture.selection) : editor.formatState("cell", capture.selection));
    return {capture, state, nestedDraft:undefined};
    };
    return coordinated ? read() : files.adapter.withOwnerReads(read, displayOwner);
  };
  function cellReason(mode: CellDialogMode, displayOwner?: OwnerProjection, coordinated = false) {
    if (unavailable()) return "입력·저장 또는 열린 대화상자를 먼저 마치세요.";
    if (editor.selection.focus.kind !== "cell" || nested(editor.selection.focus) &&
      (mode!=="properties" || !nestedValignSupported(editor,doc))) return "일반 셀을 선택하세요.";
    if (isBlock(mode) && editor.selection.kind !== "cells") return "하나의 셀 범위는 일반 셀 블록에서 사용하세요.";
    try { prepareCell(mode, undefined, displayOwner, coordinated); return ""; }
    catch (error) {
      return nested(editor.selection.focus) && error instanceof Error ? error.message : String(error);
    }
  }
  const cellCommand = connectCellDialogCommand(doc, {
    ownsClosingDialog: () => !!cellModal && !format.open &&
      cellModal.document === editor.adapter.doc && cellModal.id === editor.adapter.documentId &&
      cellModal.revision === editor.adapter.revision &&
      cellModal.generation === editor.currentSelectionGeneration,
    reason: cellReason,
    open(mode, expected, beforeShow) {
      if (unavailable()) { files.ui.error("입력·저장 또는 열린 대화상자를 먼저 마치세요."); return false; }
      const opened = showFormat("cell", false, mode === "properties" ? "기본" : "테두리·배경", isBlock(mode), mode, expected, beforeShow);
      if (opened && mode === "block-background") doc.getElementById("cell-border-tab-1")?.click();
      return opened;
    },
  });
  const publishPassiveCell = () => publishEditorDisplay(editor,()=>cellCommand.publish(undefined, mode => {
    // Only the already visible dialog button's reason. The separate open
    // handler always re-captures and validates the current command target.
    const click=mode==="properties"&&!unavailable()&&editor.clickedTableDisplay();
    const checks=click&&editor.clickedTableDisplayChecks();
    if(checks&&click)try{
      checks.check(click.position);
      const values=projectCellDraft(editor,editor.selection,false,()=>
        editor.clickedTableDisplayGrid(click.position,"properties")?.map(c=>({...c})));
      if(values&&editor.clickedTableDisplay()===click)return "";
    }catch(error){if(editor.clickedTableDisplay()===click)return String(error);}
    return unavailable()||editor.selection.focus.kind!=="cell"||isBlock(mode)&&editor.selection.kind!=="cells"
      ? cellReason(mode)
      : readEditorDisplay(editor,"cell-modal", owners=>cellReason(mode,owners,!!owners));
  }));
  cellCommand.bind(doc.getElementById("cell-format") as HTMLButtonElement, "properties", "표/셀 속성");
  function reportF5DisplayFailure(error: unknown) {
    // A partially written menu cannot authorize a same-signature early return.
    signature = "";
    projectedActionKey = undefined;
    files.ui.error(error);
  }
  function flushF5Display() {
    try { return f5Render.flush(); }
    catch (error) { reportF5DisplayFailure(error); return false; }
  }
  function showFormat(kind: "char" | "paragraph" | "cell", listFocus = false, group = "기본", cellBlock = false, cellMode?: CellDialogMode, expected?: CellDialogTarget, beforeShow?: () => void): boolean {
    if(f5SliceEnabled&&cellMode)flushF5Display();
    if (unavailable()) return false;
    try {
      const prepared = cellMode ? prepareCell(cellMode, expected) : (() => {
        const capture = editor.capture();
        for (const t of editor.targets(capture.selection)) files.adapter.assertEditable(t.p);
        return {capture, state: editor.formatState(kind, capture.selection),nestedDraft:undefined};
      })();
      const {capture, nestedDraft} = prepared;
      let {state} = prepared;
      const merged = cellMode === "properties" && !nestedDraft &&
        "__cellLayoutHold" in state && state.__cellLayoutHold === true
          ? prepareMergedValign(editor,doc,capture) : undefined;
      if (merged?.draft) {
        // Keep the existing field state; only the Core-certified verticalAlign
        // is authoritative for this exact merged cell. All padding holds stay.
        const next = merged.draft.verticalAlign;
        state = {...state, verticalAlign:next,
          ...("__mixedFields" in state && Array.isArray(state.__mixedFields)
            ? {__mixedFields:state.__mixedFields.filter(key=>key!=="verticalAlign")} : {}),
          ...("__unavailableFields" in state && Array.isArray(state.__unavailableFields)
            ? {__unavailableFields:state.__unavailableFields.filter(key=>key!=="verticalAlign")} : {})};
      }
      // Pending passive menu work describes the pre-modal background.
      // The modal has its own publication; the next ordinary editor action
      // may prepare the now-current background, not replay that task.
      if (cellMode) { cancelDisplay(); if(f5SliceEnabled)f5Render.retire(); projectedActionKey = undefined; }
      beforeShow?.();
      resetHancomParagraphDialog(doc.getElementById("fields")!);
      resetHancomCellDialog(doc.getElementById("fields")!);
      format.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = kind === "cell" ? "설정" : "확인";
      format.dataset.formatKind = kind === "paragraph" && nested(capture.selection.focus) ? "paragraph-basic" : kind;
      doc.getElementById("format-title")!.textContent =
        kind === "char" ? "글자 모양" : kind === "cell" ? "표/셀 속성" : "문단 모양";
      doc.getElementById("format-note")!.textContent = kind === "cell"
        ? cellBlock ? "선택한 범위의 바깥선과 단색 배경을 바꿉니다." : "선택한 셀에 바꾼 항목만 적용합니다."
        : "변경한 항목만 선택 영역에 적용합니다. 변경하지 않은 항목은 그대로 유지됩니다.";
      // D2 supported nested paragraph delta/path contract is never replaced by A's older rejection.
      const read =
        kind === "paragraph" && nested(capture.selection.focus)
          ? basicFields(doc.getElementById("fields")!, kind, state)
          : mountFields(doc.getElementById("fields")!, kind, state, group,
              merged && {ready:!!merged.draft,reason:merged.reason});
      let readList: (() => ParagraphListChange | undefined) | undefined;
      if (kind === "paragraph" && !nested(capture.selection.focus)) {
        let catalog;
        try { catalog = files.adapter.paragraphListCatalog(); } catch { /* Other fields stay available. */ }
        readList = mountParagraphLists(doc.getElementById("fields")!, state, catalog).read;
      }
      if (kind === "paragraph")
        annotateParagraphFlowSupport(
          doc.getElementById("fields")!,
          capture.selection.focus.kind === "body" ? "body" : "cell",
        );
      if(kind === "paragraph" && !nested(capture.selection.focus))
        mountHancomParagraphDialog(doc.getElementById("fields")!);
      else if (kind === "paragraph" && form.querySelector('input[name="spacingBefore"]:enabled:not([readonly])'))
        appendDialogShortcutHelp(doc.getElementById("fields")!, [["문단모양", [["u", "문단 위 간격 선택"]]]]);
      if(kind === "cell") mountHancomCellDialog(doc.getElementById("fields")!, group === "테두리·배경", nested(capture.selection.focus),cellBlock,!!nestedDraft);
      form.onsubmit = (e) => {
        e.preventDefault();
        if (busy() || !format.open) return;
        const s6=kind==="cell"&&cellMode==="properties"&&!cellBlock&&!nestedDraft&&!merged?.draft&&
          capture.selection.kind==="caret"&&capture.selection.focus.kind==="cell"&&!nested(capture.selection.focus)&&
          studioS6DormantToolsEnabled(doc.defaultView,coreRuntimeIdentity(editor.adapter.doc)?.sha256);
        const previousEntry=s6?editor.history.undoStack.at(-1):undefined;
        try {
          if (nestedDraft) {
            if (!guard.ready()) return;
            applyNestedValign(editor,doc,nestedDraft,read());
          } else if (!submitFormatDraft(editor, kind, capture, guard, read, readList,
            "paragraphAdjustmentChange" in read ? read.paragraphAdjustmentChange as () => ParagraphAdjustment | undefined : undefined,
            cellBlock, (command, target) => {
              if (merged?.draft && command.type === "cell" && "verticalAlign" in command.props)
                applyMergedValign(editor,doc,merged.draft,command.props);
              else executeSearch(command,target);
            },localCellSubmit && cellMode === "properties")) return;
          if(f5SliceEnabled&&cellMode&&files.adapter.revision===capture.revision)f5Render.armClose(format);
          let dormantTableTools:(()=>boolean)|undefined;
          const endpoint=s6?capture.paths.focus:undefined;
          if(endpoint&&files.adapter.revision===capture.revision+1){
            const a=editor.adapter,native=a.doc,id=a.documentId,revision=a.revision,h=editor.history;
            const entry=h.undoStack.at(-1),undo=h.undoStack.length,redo=h.redoStack.length;
            const selectionCurrent=editor.cellApplySelectionWitness(endpoint);
            if(entry&&entry!==previousEntry&&id===capture.documentId)
              dormantTableTools=()=>editor.adapter===a&&a.doc===native&&a.documentId===id&&a.revision===revision&&
                editor.history===h&&h.undoStack.at(-1)===entry&&h.undoStack.length===undo&&h.redoStack.length===redo&&
                selectionCurrent()&&a.scope==="edit"&&!a.documentLocked&&!a.viewerOnlyReason&&!a.transientEdit&&
                !a.hasPendingLocalBodyFlow()&&!unavailable()&&doc.fonts.status==="loaded";
          }
          closeEditorDialog(format);
          if (files.adapter.revision !== capture.revision) {
            const own = cellModal;
            const quick = quickFormat;
            const ordinary = kind==="cell"&&cellMode==="properties"&&!nestedDraft&&!merged?.draft&&own?.open&&quick&&
              own.document===editor.adapter.doc&&own.id===editor.adapter.documentId&&changedApplyDisplayEnabled(editor);
            if (!ordinary) {
              if (synchronousDisplayEnabled(editor)&&kind==="cell"&&cellMode==="properties"&&!nestedDraft&&!merged?.draft)
                publishChange(undefined,true,true,dormantTableTools);
              else if(dormantTableTools)publishChange(undefined,false,false,dormantTableTools);
              else changed();
            } else publishChange(()=>{
              if (own!==cellModal||format.open||unavailable()) return;
              if (!quick.projectOwnedClose(format)||
                  !changedApplyDisplayReady(editor)) return;
              // The renderer already published toolbar and quick state for
              // this exact receipt. Perform the close-only cell button work
              // now. Other observed transitions still use the existing observer.
              publishPassiveCell();
              if(own===cellModal&&!format.open&&changedApplyDisplayReady(editor)) {
                own.open=false;
                projectedActionKey=undefined;
              }
            },false,true,dormantTableTools);
          }
        } catch (error) {
          doc.getElementById("format-note")!.textContent =
            nestedDraft && error instanceof Error ? error.message : String(error);
        }
      };
      form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled =
        false;
      formatTarget = capture;
      guard.open();
      cellModal = cellMode ? { open: false, document: editor.adapter.doc, id: capture.documentId,
        revision: capture.revision, generation: editor.currentSelectionGeneration } : undefined;
      if (kind === "char" || kind === "paragraph") showDocumentEditingDialog(format);
      else showEditorDialog(format);
      if(f5SliceEnabled)f5Render.open(format);
      if (cellModal) projectCellModal();
      // The Web-shaped two-tab dialog retains the existing list draft in
      // Basic's explicit additional-properties section. Reveal it for direct
      // list commands before choosing a supported visible input.
      if (kind === "paragraph" && listFocus && !nested(capture.selection.focus)) {
        doc.getElementById("paragraph-tab-0")?.click();
        const more=doc.querySelector<HTMLDetailsElement>("#paragraph-panel-0>details.dialog-supported-more");if(more)more.open=true;
      }
      if (kind === "paragraph" && group === "기본" && !listFocus &&
          capture.selection.focus.kind === "body") {
        // On ordinary entry, Enter confirms the draft. Alignment buttons
        // still handle Enter/Space natively when the user moves to one.
        const spacing = form.querySelector<HTMLInputElement>('input[name="spacingBefore"]');
        const first = spacing && !spacing.matches(":disabled") && !spacing.readOnly &&
          spacing.getClientRects().length > 0 ? spacing : formatConfirm;
        first.focus({preventScroll: true});
        return true;
      }
      // A direct menu can open a non-default group. Its first DOM input may
      // belong to a hidden tab; focus an actual supported visible field instead.
      [...doc.getElementById("fields")!.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        kind === "cell" ? '[role=tab][aria-selected=true]' : kind === "char" && group === "기본" ? "[data-font-input]" : group === "여백·들여쓰기 증감" ? "[name=paragraphAdjustment]" : listFocus ? "input[name=paragraphListMode], [name=listMode]" : kind === "paragraph" && group === "기본" && !nested(capture.selection.focus) ? "[data-paragraph-align][aria-pressed=true], [data-paragraph-align]" : "input,select",
      )].find(control => !control.disabled && control.getClientRects().length > 0)?.focus();
      return true;
    } catch (e) {
      files.ui.error(e);
      return false;
    }
  }
  mountTableBoundary(doc.getElementById('pages')!,editor,{busy:unavailable,changed,focus,error:e=>files.ui.error(e)});
  const pictureCanvas = mountPictureCanvas(doc.getElementById('pages')!,editor,{busy:unavailable,changed,selectionChanged:()=>files.ui.change(false),focus,error:e=>files.ui.error(e),selected:selecting=>selectionTools?.pointerSelectionStarted(selecting)});
  const objectHandles=mountObjectHandles(doc.getElementById('pages')!,editor,{busy:unavailable,changed,selectionChanged:()=>files.ui.change(false),focus,error:e=>files.ui.error(e),
    properties:()=>{
      if(editor.selection.kind!=='table'){pictures.showProperties();return;}
      cellCommand.open("properties");
    },
    context:(x,y)=>{if(editor.selection.kind==='table')tableContext?.openAt(x,y);else pictureContext.openAt(x,y);}});
  const pictures = mountPictures(host,editor,{execute:(command,target)=>executeSearch(command,target),busy:()=>busy()||!!doc.querySelector("dialog[open]:not(#picture-dialog)"),changed,focus,error:e=>files.ui.error(e)});
  const showPictureInsert = () => pictures.showInsert();
  doc.addEventListener("rhwp:picture-insert", showPictureInsert);
  const pictureContext = mountPictureContext(doc, editor, {busy:unavailable,changed,selectionChanged:()=>files.ui.change(false),focus,properties:pictures.showProperties,error:e=>files.ui.error(e)});
  // Native direct property keys own only an existing typed block/object target.
  // A normal body/cell text caret keeps typing P/L/C as text.
  // Ask the owning editor router before consuming a standalone property key.
  // A Ctrl+N,C suffix keeps its captured owner and must not become background C.
  doc.addEventListener('keydown',e=>{
    if(e.defaultPrevented||e.target!==input||e.isComposing||e.keyCode===229||e.repeat||e.getModifierState('AltGraph')||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||unavailable()||!e.cancelable)return;
    const key=e.key.toLowerCase(),s=editor.selection;
    if(['p','l','c'].includes(key)&&!input.dispatchEvent(new Event('rhwp:editor-sequence-pending',{cancelable:true})))return;
    if(s.kind==='object'&&s.focus.kind==='body'&&key==='p'){
      e.preventDefault();e.stopImmediatePropagation();pictures.showProperties();return;
    }
    if(!['cells','table'].includes(s.kind)||!['p','l','c'].includes(key))return;
    // Full-table border application is a separate scope; preserve its guard.
    if(s.kind==='table'&&key!=='p'){e.preventDefault();e.stopImmediatePropagation();tableObjectDraft.show(key==='l'?'line':'background');return;}
    e.preventDefault();e.stopImmediatePropagation();
    if(key==='p')cellCommand.open('properties');
    else if(cellCommand.open('border-properties')&&key==='c')doc.getElementById('cell-border-tab-1')?.click();
  });
  const blockFormat=(e:Event)=>cellCommand.open((e as CustomEvent<boolean>).detail ? "block-background" : "block-border");
  doc.addEventListener('rhwp:cell-block-format',blockFormat);
  roots.push(doc.getElementById("picture-dialog")!);
  const objectClipboard=mountObjectClipboard(host,editor,{busy:unavailable,changed,focus,copy:()=>input.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true})),error:e=>files.ui.error(e)});
  const shapes = mountShapes(host, editor, {
    execute:(command,target)=>executeSearch(command,target),
    busy, changed: () => {
      changed();
      // A list property target is UI state, outside the editor-state projection.
      doc.dispatchEvent(new Event("rhwp:editor-state"));
    }, focus, error: e => files.ui.error(e),
    copy: () => input.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true })),
    cut: () => input.dispatchEvent(new ClipboardEvent("cut", { bubbles: true, cancelable: true })),
  });
  roots.push(doc.getElementById("shape-dialog")!);
  const shapeContext=mountShapeContext(doc,editor,{busy:unavailable,changed:()=>files.ui.change(false),focus,properties:shapes.showProperties,error:e=>files.ui.error(e)});
  // Current product policy: no style application/manager UI; stored styles are untouched.
  const showStyleManager = () => files.ui.error(stylesUnavailable);
  const numberManager = mountNumberManager(doc.body, editor, {
    busy: () => busy() || !!doc.querySelector("dialog[open]:not(#number-manager)"),
    execute: (command, captured) => editor.execute(command, captured),
    changed,
    focus: () => {
      focus();
      doc.dispatchEvent(new Event("rhwp:editor-state"));
    },
  });
  roots.push(doc.getElementById("number-manager")!);
  const showNumberManager = () => {
    if (unavailable()) return;
    try {
      for (const root of doc.querySelectorAll<HTMLDetailsElement>("#main-menu details[open],#integration-menus details[open]")) root.open = false;
      numberManager.show();
      doc.dispatchEvent(new Event("rhwp:editor-state"));
    } catch (error) { files.ui.error(error); }
  };
  // The menu is an entry to the existing exact-owner object dialogs. A caret
  // in an owning paragraph or an unsupported cell/complex owner is not coerced.
  const objectPropertyEntry = () => {
    if (unavailable()) return { reason: formatBlockedReason() || "입력·대화상자·파일 작업을 마친 후 사용하세요." };
    const s = editor.selection;
    if (s.kind !== "object" || s.focus.kind !== "body") return { reason: "속성을 지원하는 본문 그림 또는 글상자 한 개를 정확히 선택하세요." };
    try {
      editor.adapter.assertEditable(s.focus);
      try { selectedPicture(editor.adapter, s); return { reason: "", open: pictures.showProperties }; } catch { /* Existing shape route below. */ }
      const row = shapes.readSelected();
      if (row && row.target.sec === s.focus.sec && row.target.para === s.focus.para && row.target.control === s.control)
        return { reason: row.reason || "", open: row.reason ? undefined : shapes.showProperties };
      return { reason: "선택 개체의 기존 속성 편집 입구가 지원되지 않습니다. 원본을 유지합니다." };
    } catch (e) { return { reason: String(e) }; }
  };
  const syncFormat = mountFormatMenu(
    menu("format-menu", "서식", "data-format-panel"),
    editor,
    {
      command: (c, captured) =>
        safe(() => editor.execute(lowerMenuCommand(editor, c), captured)),
      dialog: (kind, group) => kind === "styles" ? showStyleManager() : kind === "numbers" ? showNumberManager() : showFormat(kind, group === listGroup, group === listGroup ? "기본" : group),
      composing: unavailable,
      readingBlocked: readUnavailable,
      blockedReason: formatBlockedReason,
      feedback: (message) => files.ui.error(message),
      fontCycle: direction=>{void shortcutUI(new CustomEvent('rhwp:shortcut-ui',{detail:direction>0?'font-next':'font-previous'}));},
      fontState: direction=>{try{if(unavailable())throw Error(formatBlockedReason());if(editor.selection.kind!=='text')throw Error('글자를 블록으로 선택하세요.');const state=editor.formatState('char'),scope=doc.querySelector<HTMLSelectElement>('[name=quickLanguage]')?.value??'all';fontCycleCommand(state,fontSuggestions(state),scope,direction);return '';}catch(error){return String(error);}},
      objectProperties: {
        state: () => { const target = objectPropertyEntry(); return { disabled: !!target.reason, reason: target.reason }; },
        open: () => { const target = objectPropertyEntry(); if (target.reason) files.ui.error(target.reason); else target.open?.(); },
      },
    },
  );
  const formatCopy = mountFormatCopy(doc, editor, { busy, changed, focus, feedback: e => files.ui.error(e) });
  roots.push(doc.getElementById("format-copy-dialog")!, doc.getElementById("format-copy-status")!);
  const formatCopyKey = () => formatCopy.run();
  input.addEventListener("rhwp:format-copy", formatCopyKey);
  const syncEdit = mountEditMenu(
    menu("edit-menu", "편집", "data-edit-panel"),
    editor,
    readUnavailable,
    (id) => {
      if (unavailable()) return;
      if (id === "format-copy") { formatCopy.copy(); return; }
      if (id === "format-paste") { formatCopy.paste(); return; }
      if (id === "find" || id === "replace") {
        search.show(id === "replace");
        return;
      }
      if (id === "copy" || id === "cut" || id === "paste") {
        focus();
        input.dispatchEvent(
          new ClipboardEvent(id, { bubbles: true, cancelable: true }),
        );
        return;
      }
      if (id === "paste-special") { focus(); input.dispatchEvent(new Event("rhwp:paste-text")); return; }
      safe(() => {
        if (id === "undo" || id === "redo") runHistory(editor, id === "redo", unavailable());
        else if (id === "delete")
          editor.execute(editor.selection.kind === "cells" ? {type:"clear-cells"} : { type: "delete", backward: false });
        else if (id === "clear") editor.execute({ type: "clear-cells" });
        else if (id === "all") editor.selectAll();
        else if (id === "block") editor.advanceBlock();
      }, id !== "all" && id !== "block");
    },
    (message) => files.ui.error(message),
    { select: (page, x, y) => { editor.pointer(page, x, y, false); files.ui.change(false); }, focus, formatPasteReason: formatCopy.pasteReason, formatInvoke:syncFormat.invoke },
  );
  const tableMenuRoot = menu("table-menu", "표", "data-table-panel");
  const syncTable = mountTableMenu(
    tableMenuRoot,
    editor,
    readUnavailable,
    (item,target) => {
      if (unavailable()) return;
      if(item.id==='range-size'){tableRangeSize.show(target);return;}
      if(item.id==='table-transpose'||item.id==='table-object-line'||item.id==='table-object-background'){void shortcutUI(new CustomEvent('rhwp:shortcut-ui',{detail:item.id}));return;}
      if(item.id.startsWith('local-')){doc.dispatchEvent(new CustomEvent('rhwp:shortcut-ui',{detail:item.id}));return;}
      if(item.id==='equal-width'||item.id==='equal-height'){void shortcutUI(new CustomEvent('rhwp:shortcut-ui',{detail:item.id}));return;}
      if(item.id==='split-dialog'||item.id==='add-dialog'||item.id==='delete-dialog'){tableKeyDraft.show(item.id==='split-dialog'?'cell-split':item.id==='add-dialog'?'table-add':'table-delete');return;}
      safe(() => {
        if (item.command) editor.execute(item.command,target);
        else if (item.id === "select") editor.f5();
        else if (item.id === 'select-rows') editor.selectCellRows();
        else if(item.id==='select-columns')editor.selectCellRows(true);
        else if(item.id==='leave')editor.leaveTable();
        else if (item.id === "text") editor.selectAll();
        else if (item.id === "object") editor.selectTable();
        else if (item.id === "previous" || item.id === "next")
          editor.tab(item.id === "previous");
      }, item.id !== "text");
    },
    (message) => files.ui.error(message),
  );
  const styleMenu = menu("style-menu", "스타일 (제공 안 함)", "data-style-panel");
  const styleNotice = doc.createElement("p"); styleNotice.textContent = stylesUnavailable;
  styleMenu.querySelector("[data-style-panel]")!.append(styleNotice);
  let tableContext: ReturnType<typeof mountTableContext> | undefined;
  let toolboxView: ReturnType<typeof mountToolboxView> | undefined;
  let quickFormat: ReturnType<typeof mountQuickFormat> | undefined;
  let compactToolbar: ReturnType<typeof mountWorkspaceToolbarLayout>;
  let studioMenus: ReturnType<typeof mountStudioMenus> | undefined;
  let homeToolbar: ReturnType<typeof mountHomeToolbar>;
  let toolbarOverflow: ReturnType<typeof mountToolbarOverflow> | undefined;
  let propertiesPanel: ReturnType<typeof mountPropertiesPanel> | undefined;
  let commandSearch: ReturnType<typeof mountCommandSearch> | undefined;
  let slashMenu: ReturnType<typeof mountSlashMenu> | undefined;
  const executeSearch = (command:Command,target:ReturnType<Interaction["capture"]>) => {
    if (!slashMenu?.execute(command,target)) editor.execute(command,target);
  };
  let emptyHint:ReturnType<typeof mountEmptyParagraphHint>|undefined;
  let selectionTools:ReturnType<typeof mountSelectionTools>|undefined;
  let lineGutter:ReturnType<typeof mountLineSelectionGutter>|undefined;
  let documentNavigation:ReturnType<typeof mountDocumentNavigation>|undefined;
  let tableInsert: ReturnType<typeof mountTableInsert> | undefined;
  let insertMenuUI1: ReturnType<typeof mountInsertMenuUI1> | undefined;
  let pageMenuUI1: ReturnType<typeof mountPageMenuUI1> | undefined;
  let outlineNavigation: ReturnType<typeof mountOutlineNavigation> | undefined;
  // Stable state key prevents A menu text refresh → D observer → menu refresh loops.
  let signature = "",
    documentId = files.adapter.documentId;
  const projectionKey = () => JSON.stringify([
    files.adapter.documentId, files.adapter.revision, files.adapter.scope,
    files.adapter.documentLocked, editor.selection, editor.typing,
    shapes.readSelected()?.target, files.busy, composing, modal(), busy(),
  ]);
  // A publication key for *display* only. Never substitute this for a fresh
  // command check or a format draft's captured owner.
  const displayActionKey = (includeFormat = true) => JSON.stringify([
    editor.adapter.documentId, editor.adapter.revision, editor.adapter.scope,
    editor.adapter.documentLocked, editor.selection, editor.typing,
    editor.history.undoStack.length, editor.history.redoStack.length,
    files.busy, composing, doc.getElementById("clipboard-status")?.textContent,
    Array.from(dialogs).some(d => (includeFormat || d !== format) && d.hasAttribute("open")),
  ]);
  let projectedActionKey: string | undefined;
  let cellModal: { open: boolean; document: Interaction["adapter"]["doc"]; id: string;
    revision: number; generation: number } | undefined;
  const displayBatch = new CellDisplayBatch();
  const demandDisposers:(()=>void)[]=[];
  let legacyTableToolsDirty=false;
  const sync = (event?: Event, backgroundCellSelection = false, settleCellPublication = false) => publishEditorDisplay(editor,()=>{
    displayBatch.widenIfPending();
    projectedActionKey = undefined;
    const projected = displayActionKey();
    let requiredFormatCurrent = !settleCellPublication;
    // A pure cell-selection publication does not demand closed table
    // mutation previews. The actual table menu/toolbar and command paths
    // still refresh from the live owner before use.
    const deferClosedTable = backgroundCellSelection &&
      !(doc.getElementById("table-menu") as HTMLDetailsElement | null)?.open &&
      doc.getElementById("table-tools")?.hidden === true;
    editor.withCellBlockPresentation(owners => withFormatPresentationRead(editor, () => {
    mountMenuLifetime(doc).documentChanged(editor.adapter.documentId);
    if(!activeWorkset(doc))syncPrint();
    if(!activeWorkset(doc)){commandSearch?.sync();slashMenu?.sync();}
    selectionTools?.sync();if(!activeWorkset(doc))emptyHint?.sync();documentNavigation?.sync();lineGutter?.sync();
    if(!activeWorkset(doc))shapes.sync();
    if(!activeWorkset(doc))tableInsert?.sync();
    outlineNavigation?.sync();
    if(!activeWorkset(doc))pictures.sync();
    if(!activeWorkset(doc)){pictureContext.sync();shapeContext.sync();}
    if(!activeWorkset(doc))numberManager.sync();
    if(!activeWorkset(doc))search.sync();
    formatTarget = syncWritingFormatDraft(
      editor,
      formatTarget,
      guard,
      format,
      doc,
    );
    const key = projectionKey();
    const reason = formatBlockedReason();
    if(!activeWorkset(doc))formatCopy.sync();
    const readingBlocked = readUnavailable();
    const keepFormat = !readingBlocked && keepTypingFormatPresentation(editor);
    const demandFormat=!activeWorkset(doc)&&!keepFormat&&syncFormat.demanded();
    const {formats, edits} = activeWorkset(doc) ? {formats: demandFormat ? formatMenuState(editor,readingBlocked,reason) : null, edits: undefined} : readEditorDisplay(editor,"edit-format",(display,retry)=>{
      const check=display?editor.adapter.assertEditableForPresentation.bind(editor.adapter):undefined;
      return {formats:demandFormat?formatMenuState(editor,readingBlocked,reason,
        kind=>retry?editor.freshDisplayFormat(kind):readFormatPresentation(editor,kind),display,undefined,check,undefined,!!display):null,
        edits:editMenuState(editor,readingBlocked,false,check,undefined,undefined,
          display&&synchronousDisplayEnabled(editor)?p=>editor.adapter.assertTextOnlyForDisplay(p,display):undefined)};
    },()=>readMenuAdmission(editor, readingBlocked, reason,
      demandFormat, kind => readFormatPresentation(editor,kind), owners, menuSelectionContext,
      () => doc.fonts.status === "loaded" ? doc.getElementById("status-zoom")?.textContent ?? undefined : undefined,nativeSelectionTarget));
    if (!activeWorkset(doc)) {
    if (formats || keepFormat) syncCommandToolbar(doc, editor, readingBlocked, formats, edits);
    else {
      const painted = deferClosedTable && !reason && !readingBlocked
        ? files.ui.paintedCellFormats?.() : undefined;
      if (!painted || !cellToolbarAlreadyPainted(doc, painted, cellToolbarContext(editor, readingBlocked, reason)))
        projectToolbarAdmission(doc, editor, readingBlocked, reason, kind => readFormatPresentation(editor,kind), owners, edits);
    }
    }
    if (key === signature) {
      if (!keepFormat) {
        if (settleCellPublication && quickFormat) {
          quickFormat.sync();
          requiredFormatCurrent = true;
        }
        checkpointFormatPresentation(editor);
      }
      return;
    }
    signature = keepFormat || deferClosedTable ? "" : key;
    pictureCanvas.sync();
    objectHandles.sync();
    if (documentId !== files.adapter.documentId) {
      documentId = files.adapter.documentId;
      if(activeWorkset(doc))formatCopy.sync();
      if (search.open)
        closeEditorDialog((doc.getElementById("search-dialog") as HTMLDialogElement), false);
    }
    // Reuse only inside this synchronous projection with the same owner and
    // admission. Closing a replaced document's search dialog (or reentrancy)
    // can change that state; keep the existing fresh menu path in that case.
    if (key === projectionKey()) {
      if (formats) syncFormat.project(formats);
      if (edits) syncEdit.project(edits);
    } else {
      if (!activeWorkset(doc)&&syncFormat.demanded()) syncFormat();
      if(!activeWorkset(doc))syncEdit();
    }
    if(!activeWorkset(doc))pageMenuUI1?.sync();
    if (!activeWorkset(doc)) {
    const clipboard = clipboardSupport(editor, "copy");
    clipboardInfo.textContent =
      clipboard.reason ??
      `클립보드 지원: ${clipboard.mode}. OS 전송 권한은 별도 확인됩니다.`;
    }
    const widthWriter=(width?: (site:import("./width-preview-reads.js").WidthSite)=>import("./interaction.js").WidthPreviewAdmission)=>{
    if (!deferClosedTable && !activeWorkset(doc)) {
      const perf4=perf4TableReasonOwnerEnabled(doc.defaultView,coreRuntimeIdentity(editor.adapter.doc)?.sha256);
      // Only this passive publication, not toggle/open or command execution.
      const view=perf4 && !tableMenuRoot.open && !unavailable() ? ()=>
        !tableMenuRoot.open && !unavailable() && doc.fonts.status==="loaded"
          ? doc.getElementById("status-zoom")?.textContent ?? undefined : undefined : undefined;
      syncTable(false,width?.("menu"),view);
    }
    toolboxView?.sync();
    if (!keepFormat && quickFormat) {
      if (!tableMenuRoot.open &&
          perf4QuickFormatEnabled(doc.defaultView, coreRuntimeIdentity(editor.adapter.doc)?.sha256)) {
        quickFormat.sync(true);
      } else quickFormat.sync();
      requiredFormatCurrent = true;
    }
    propertiesPanel?.sync();
    if(!activeWorkset(doc))tableContext?.sync();
    // Modern UI's dormant legacy toolbar has no consumer of these reasons.
    // Its actual Table menu/context commands above retain their own live reads.
    const s6=committedDormantTableTools(event);
    const dormant=(s6||activeWorkset(doc))&&legacyTableToolbarDemand(doc,s6||(()=>activeWorkset(doc)))==="dormant";
    if(dormant)legacyTableToolsDirty=true;
    if (!deferClosedTable && !dormant) {
    projectLegacyTableTools(width?.("toolbar"));
    }
    };
    if(synchronousDisplayEnabled(editor)&&!deferClosedTable&&!unavailable()){
      const focus=doc.activeElement;
      editor.withWidthPreviewInputs(()=>observedDisplayView(editor),()=>!unavailable()&&doc.activeElement===focus,
        widthWriter,(scope,event)=>noteWidthRead(editor,scope,event));
    }else widthWriter();
    if (!keepFormat && (!activeWorkset(doc)||fontPanel.open)) try {
      renderFontStatus(fontContent, readFormatPresentation(editor,"char"));
    } catch {
      fontContent.replaceChildren();
    }
    if (!keepFormat) checkpointFormatPresentation(editor);

    }));
    if (!deferClosedTable && projected === displayActionKey()) projectedActionKey = projected;
    return requiredFormatCurrent;
  });
  const projectLegacyTableTools=(widthInputs?:import("./interaction.js").WidthPreviewAdmission)=>{
    if (phase3LiteOptIn(doc.defaultView)) {
      const resize=Array.from(doc.querySelectorAll<HTMLButtonElement>("[data-resize]"));
      const deletes=Array.from(doc.querySelectorAll<HTMLButtonElement>('[data-table="row-delete"]'));
      const commands:Parameters<Interaction["tableCommandReason"]>[0][] = resize.map(button=>{
        const [width,height]=(button.dataset.resize??"").split(",").map(Number);
        return {type:"resize",width,height};
      });
      for (const _button of deletes) commands.push({type:"table-edit",operation:"row-delete"});
      const reasons=editor.toolbarTableReasons(commands,unavailable,
        ()=>doc.fonts.status==="loaded"?doc.getElementById("status-zoom")?.textContent??undefined:undefined,true,widthInputs);
      for(const [i,button] of [...resize,...deletes].entries()){
        const reason=reasons[i];
        button.disabled=!!reason;
        button.title=reason||(i<resize.length?(button.textContent||"셀 크기 변경"):"현재 행 삭제 (내용 포함)");
      }
    } else {
    // The toolbar and table menu consume the same pre-History Command verdict.
    // Never enable a known unsafe resize just because its Core API exists.
    for (const button of doc.querySelectorAll<HTMLButtonElement>(
      "[data-resize]",
    )) {
      const [width, height] = (button.dataset.resize ?? "")
        .split(",")
        .map(Number);
      const reason = unavailable()
        ? "입력 처리 중"
        : editor.tableCommandReason({ type: "resize", width, height });
      button.disabled = !!reason;
      button.title = reason || button.textContent || "셀 크기 변경";
    }
    for (const button of doc.querySelectorAll<HTMLButtonElement>(
      '[data-table="row-delete"]',
    )) {
      const reason = unavailable()
        ? "입력 처리 중"
        : editor.tableCommandReason({ type: "table-edit", operation: "row-delete" });
      button.disabled = !!reason;
      button.title = reason || "현재 행 삭제 (내용 포함)";
    }
    }
    legacyTableToolsDirty=false;
  };
  // The native modal makes the rest of the editor inert. Reproject command
  // admission and toolbar state, without refreshing unrelated content panels.
  // Full document/selection publications still take the authoritative path.
  const projectCellModal = () => publishEditorDisplay(editor,()=>{
    if (!cellModal) return false;
    if (cellModal.open === format.open) return true;
    const unchangedClose = cellModal.open && cellCommand.ownsClosingDialog();
    cellModal.open = format.open;
    const painted = unchangedClose ? files.ui.paintedCellFormats?.() : undefined;
    let published = false;
    editor.withCellBlockPresentation(owners => withFormatPresentationRead(editor, () => {
      const reading = readUnavailable();
      projectToolbarAdmission(doc, editor, reading, formatBlockedReason(),
        // Only values already on screen are reusable. The toolbar still runs
        // the current structural/protection/History admission in this call.
        kind => painted?.[kind] ?? readFormatPresentation(editor, kind), owners, undefined,
        f5SliceEnabled && (format.open || unchangedClose) && !composing && !editor.adapter.transientEdit);
      // This close already passed the painted-view fence. Share only the live
      // owner rows within this call, never the toolbar's admission decision.
      // Cell capture, protection and draft validation still run for each mode.
      if (painted && owners?.isCurrent(editor.adapter)) {
        cellCommand.publish(undefined, mode => cellReason(mode,
          owners.isCurrent(editor.adapter) ? owners : undefined));
        published = true;
      }
    }));
    if (!published) publishPassiveCell();
    projectedActionKey = undefined; // Unrelated entrances refresh on their own next action.
    return true;
  });
  const projectFormatTransition = () => {
    if (projectCellModal()) return;
    cellModal = undefined;
    flushDisplay();
  };
  // Modal opening must repaint the same admission result, including Alt+T/L.
  const formatModalObserver = new MutationObserver(records => {
    const transitions = records.filter(record => record.target instanceof Element && record.target.tagName === "DIALOG");
    if (!transitions.length) return;
    withQaReadPhase(files.adapter.doc,"format-observer",()=>{
    if (transitions.every(record => record.target === format) ||
        (cellModal && format.open && transitions.every(record => record.target === format ||
          (record.target as HTMLElement).id === "command-search"))) projectFormatTransition();
    else { if (!format.open) cellModal = undefined; cellCommand.publish(); flushDisplay(); }
    });
  });
  if(!activeWorkset(doc))formatModalObserver.observe(doc.body, {subtree: true, attributes: true, attributeFilter: ["open"]});
  const click = (e: MouseEvent) => {
    const button = (e.target as Element)?.closest?.("#character,#paragraph");
    if (!button) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.detail < 2)
      showFormat(button.id === "character" ? "char" : "paragraph");
  };
  const key = (e: KeyboardEvent) => {
    // Own Ctrl+P before admission returns so blocked editor requests never fall
    // through to native browser printing. Local fields do not submit drafts.
    const printKey = (e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "p";
    // Only the exact equation script field owns its native Ctrl+P pile template.
    // The modal consumes it even while its local IME guard is settling.
    if(printKey&&e.ctrlKey&&!e.metaKey&&e.target instanceof Element&&e.target.matches('#remaining-equation[open] [data-equation-script]'))return;
    if (printKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      const localField = e.target instanceof Element && e.target !== input && e.target.closest("input,select,textarea,[contenteditable=true]");
      if (!e.repeat && !e.isComposing && e.keyCode !== 229 && !e.getModifierState("AltGraph") && !localField) showPrint();
      return;
    }
    if ((e.target as Element)?.closest?.("#table-context-menu")) return;
    if (
      composing ||
      e.isComposing ||
      e.keyCode === 229 ||
      e.getModifierState("AltGraph") ||
      unavailable()
    )
      return;
    if (
      e.target instanceof Element &&
      e.target !== input &&
      e.target.closest("input,select,textarea,[contenteditable=true]")
    )
      return;
    const k = e.key.toLowerCase(),
      primary = (e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.metaKey);
    // Web aliases use the shared semantic router below, not the legacy capture aliases.
    if (hancomWebKey(e, editor.selection)) return;
    let action: (() => void) | undefined;
    const authoring = authoringShortcutCommand(e);
    if (authoring)
      action = () =>
        safe(() => editor.execute(lowerMenuCommand(editor, authoring)));
    const searchAction = searchShortcut(e);
    if (searchAction)
      action = () => search.show(searchAction === "replace");
    if (e.altKey && !primary && !e.shiftKey && (k === "l" || k === "t"))
      action = () => showFormat(k === "l" ? "char" : "paragraph");
    if (e.altKey && e.shiftKey && !primary) {
      const c: Record<string, CatalogCommand> = {
        b: { type: "bold" },
        i: { type: "toggle-char", property: "italic" },
        u: { type: "underline" },
        p: { type: "script", mode: "superscript" },
        s: { type: "script", mode: "subscript" },
      };
      if (c[k])
        action = () =>
          safe(() => editor.execute(lowerMenuCommand(editor, c[k])));
    }
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) action();
  };
  // Dialog-local Enter/Escape handlers run first; legacy window editor shortcuts must not edit behind them.
  const dialogKey = (e: KeyboardEvent) => {
    if (e.target instanceof Element && e.target.closest("dialog[open]"))
      e.stopPropagation();
  };
  const start = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-ui2-search],[data-ui2-draft],#format-copy-form,#columns-form,#page-number-form,#header-footer-form,#menu-settings-form,#shape-form,#format-form,#style-manager-form,#number-manager-form,#quick-format,#quick-paragraph,#status-navigation-form,#picture-form,#properties-paragraph-form,#table-insert-form,#search-dialog,#body-context-menu")) return;
      composing = true;
      cellCommand.publish();
      sync();
    },
    end = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-ui2-search],[data-ui2-draft],#format-copy-form,#columns-form,#page-number-form,#header-footer-form,#menu-settings-form,#shape-form,#format-form,#style-manager-form,#number-manager-form,#quick-format,#quick-paragraph,#status-navigation-form,#picture-form,#properties-paragraph-form,#table-insert-form,#search-dialog,#body-context-menu")) return;
      composing = false;
      cellCommand.publish();
      sync();
    };
  const fontsChanged = () => {
    signature = "";
    sync();
    if (format.open) refreshFontFields(doc.getElementById("fields")!);
  };
  doc.addEventListener("rhwp:fonts-updated", fontsChanged);
  doc.fonts?.addEventListener("loading", fontsChanged);
  doc.fonts?.addEventListener("loadingdone", fontsChanged);
  doc.fonts?.addEventListener("loadingerror", fontsChanged);
  const win = doc.defaultView!;
  // Selection/caret and the public editor state are already current before
  // this event. Do not make their next frame wait for every passive panel.
  // Only this display projection may collapse to the latest state; commands,
  // validation, History, and the input stream remain synchronous and ordered.
  let displayFrame: number | undefined, displayTask: number | undefined;
  const displayPending = () => displayFrame !== undefined || displayTask !== undefined;
  let resizeDisplayPending = false;
  let selectionPointer = false;
  const cancelDisplay = () => {
    if (displayFrame !== undefined) win.cancelAnimationFrame(displayFrame);
    if (displayTask !== undefined) win.clearTimeout(displayTask);
    displayFrame = displayTask = undefined;
    resizeDisplayPending = false;
    displayBatch.reset();
  };
  const flushDisplay = (event?:Event) => { cancelDisplay(); sync(event); };
  const projectDisplay = (event?: Event) => {
    if (f5SliceEnabled && editorChanged(event, "document"))
      f5Render.replaceDocument(editor.adapter.documentId);
    if (!editorChanged(event, "document", "selection", "format", "history", "admission")) return;
    if (cellModal && format.open) {
      if(f5SliceEnabled)f5Render.retire();
      formatTarget = syncWritingFormatDraft(editor, formatTarget, guard, format, doc);
      return;
    }
    // Draft fields, modal/IME and file transitions keep their immediate guards.
    if (unavailable() || (!selectionPointer && doc.activeElement !== input && doc.activeElement !== doc.body)) {
      if(f5SliceEnabled)f5Render.retire();
      flushDisplay(event); return;
    }
    // Drag still paints every actual pointer position. Passive format panels
    // have no editing role during that gesture; read its final state on up.
    if (selectionPointer) { cancelDisplay(); if(f5SliceEnabled)f5Render.retire(); return; }
    // Undo/Redo has already committed. Publish the visible selection value now;
    // the existing frame still owns the broader passive UI refresh.
    if (activeWorkset(doc) && editorHistoryTravelled(event)) quickFormat?.projectCurrentAlignment();
    // Geometry-only key bursts do not change hidden format/menu projections.
    // Keep their existing pending-task/flush-before-action contract, but read
    // them once after the burst. Visible panels and blocking states stay live.
    if (editor.adapter.scope === "edit" && !editor.adapter.documentLocked &&
        doc.querySelector("[data-resize-canvas]") &&
        doc.getElementById("selection-properties")?.hidden &&
        doc.getElementById("document-navigation")?.hidden) {
      cancelDisplay(); if(f5SliceEnabled)f5Render.retire(); resizeDisplayPending = true;
      displayTask = win.setTimeout(() => {
        displayTask = undefined; resizeDisplayPending = false; sync();
      }, 350);
      return;
    }
    if (resizeDisplayPending) cancelDisplay();
    const kind = editor.selection.kind;
    const selectionOnly = (kind === "cells" || kind === "table") && editorChanged(event, "selection") &&
      !editorChanged(event, "document", "history", "admission", "storage");
    if(f5SliceEnabled){
      if(selectionOnly&&f5Render.collecting()){
        cancelDisplay();
        if(f5Render.offer(run=>{
          const frame=win.requestAnimationFrame(()=>{
            try { run(); } catch(error) { reportF5DisplayFailure(error); }
          });
          return()=>win.cancelAnimationFrame(frame);
        },delivery=>{
          if(cellModal&&format.open){formatTarget=syncWritingFormatDraft(editor,formatTarget,guard,format,doc);return false;}
          const blocked=unavailable();
          const settle=delivery!=="fallback"&&!blocked;
          const published=sync(undefined,delivery==="scheduled"&&!blocked,settle);
          return settle&&published&&!unavailable()&&!(cellModal&&format.open);
        }))return;
      }
      f5Render.retire();
    }
    const adapter = editor.adapter, native = adapter.doc;
    const generation = editor.currentSelectionGeneration;
    const key = selectionOnly ? displayActionKey() : undefined;
    displayBatch.note(key === undefined ? null : () =>
      adapter === editor.adapter && adapter.doc === native && !adapter.transientEdit &&
      editor.currentSelectionGeneration === generation && key === displayActionKey());
    if (displayPending()) return;
    displayFrame = win.requestAnimationFrame(() => {
      displayFrame = undefined;
      // A task after the frame gives the changed selection a rendering
      // opportunity; this is not a timer on input or a paint-time guarantee.
      displayTask = win.setTimeout(() => {
        displayTask = undefined;
        sync(undefined, displayBatch.takeSelectionOnly());
      }, 0);
    });
  };
  const beforeDisplayAction = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || target === input || target.closest("#pages,[data-onedit-cell-command]") || cellModal && target.closest("#format")) return;
    // If another workspace presentation makes the original toolbar usable,
    // refresh its exact legacy reasons before focus/keyboard/pointer action.
    if(legacyTableToolsDirty&&target.closest("#table-tools")){flushDisplay();return;}
    if(activeWorkset(doc))return; // Real entrances refresh/validate their current target.
    // Native close may restore the opener's focus before close/observer delivery.
    // That focus is not a request to run every passive menu. The modal's own
    // transition restores admission; the next pointer/key action still flushes.
    if (event.type === "focusin" && cellModal?.open && cellCommand.ownsClosingDialog()) return;
    // Pointerdown and its resulting focusin may see the same publication.
    // Flush a pending or genuinely stale one; do not replay the full pass.
    if(f5SliceEnabled&&flushF5Display())return;
    if (!displayPending() && projectedActionKey === displayActionKey()) return;
    flushDisplay();
  };
  const displayPointer = (event: Event) => {
    if (event.type === "pointerdown") {
      const e = event as PointerEvent;
      if (e.button === 0 && e.target instanceof Element && e.target.closest("#pages")) {
        selectionPointer = true; cancelDisplay();
      }
    } else if (selectionPointer) {
      selectionPointer = false; projectDisplay();
    }
  };
  const beforeContext=()=>{if(f5SliceEnabled)flushF5Display();};
  if(f5SliceEnabled)doc.addEventListener("contextmenu",beforeContext,true);
  const legacyTableToolsOpening=(event:Event)=>{
    const root=event.target;
    if(legacyTableToolsDirty&&root instanceof HTMLDetailsElement&&root.id==="table-tools"&&root.open&&
      doc.defaultView?.getComputedStyle(root).display!=="none")flushDisplay();
  };
  doc.addEventListener("toggle",legacyTableToolsOpening,true);
  doc.addEventListener("pointerdown", displayPointer, true);
  for (const name of ["pointerup", "pointercancel", "blur"]) win.addEventListener(name, displayPointer, true);
  doc.addEventListener("pointerdown", beforeDisplayAction, true);
  doc.addEventListener("keydown", beforeDisplayAction, true);
  doc.addEventListener("focusin", beforeDisplayAction, true);
  win.addEventListener("click", click, true);
  win.addEventListener("keydown", key, true);
  doc.addEventListener("keydown", dialogKey);
  doc.addEventListener("compositionstart", start, true);
  doc.addEventListener("compositionend", end, true);
  const showLists = (event:Event) => {showFormat("paragraph", true);if((event as CustomEvent).detail==='Outline'&&format.open){
    const mode=doc.querySelector<HTMLSelectElement>('#fields [name=listMode]');if(mode&&!mode.disabled){mode.value='Outline';mode.dispatchEvent(new Event('change',{bubbles:true}));doc.querySelector<HTMLInputElement>('#fields [name=paragraphListMode][value=Outline]')?.focus();}
  }};
  doc.addEventListener("rhwp:paragraph-lists", showLists);
  const publishCellState = (event?: Event) => {
    if (editorChanged(event, "document", "selection", "format", "admission")) publishPassiveCell();
  };
  doc.addEventListener("rhwp:editor-state", publishCellState);
  doc.addEventListener("rhwp:editor-state", projectDisplay);
  // Copy can finish without changing public document/selection metadata. The
  // existing clipboard status is already the admission source; publish its
  // busy/completed transition to the same fresh projection, without polling.
  const clipboardDisplayObserver=new MutationObserver(() => { publishCellState(); projectDisplay(); });
  const clipboardStatus=doc.getElementById("clipboard-status");
  if(clipboardStatus&&!activeWorkset(doc))clipboardDisplayObserver.observe(clipboardStatus,{childList:true,characterData:true,subtree:true});
  format.addEventListener("close", projectFormatTransition);
  format.addEventListener("cancel", projectFormatTransition);
  for (const dialog of [doc.getElementById("search-dialog")!, doc.getElementById("format-copy-dialog")!]) {
    dialog.addEventListener("close", sync);
    dialog.addEventListener("cancel", sync);
  }
  // Initial constructor runs before ui.ts finishes; refresh after bootstrap, not while FileLifecycle is in its TDZ.
  queueMicrotask(() => {
    if (!doc.getElementById("main-menu")) {
      const nav = doc.createElement("nav"); nav.id = "main-menu"; nav.setAttribute("aria-label", "상단 메뉴");
      doc.getElementById("toolbar")!.before(nav);
      for (const id of ["edit-menu", "view-menu", "format-menu", "style-menu", "table-menu"]) {
        const node = doc.getElementById(id); if (node) nav.append(node);
      }
    }
    if (!doc.getElementById("selection-font")) {
      const panel = doc.createElement("section"), title = doc.createElement("h2"), list = doc.createElement("dl");
      title.textContent = "선택 글자 서식";
      for (const [id, label] of [["selection-font", "공통 글꼴"], ["selection-font-size", "크기"]]) {
        const dt = doc.createElement("dt"), dd = doc.createElement("dd"); dt.textContent = label; dd.id = id; list.append(dt, dd);
      }
      panel.append(title, list); doc.querySelector("aside")!.prepend(panel);
    }
    const projectFont = () => {
      if (keepTypingFormatPresentation(editor)) return;
      let family = "조회 불가", size = "조회 불가";
      try { const state = readFormatPresentation(editor,"char"); family = state.fontFamily === undefined ? "혼합 / 조회 불가" : String(state.fontFamily); size = state.fontSize === undefined ? "혼합 / 조회 불가" : `${state.fontSize} pt`; } catch { /* Unsupported selection stays explicit. */ }
      doc.getElementById("selection-font")!.textContent = family;
      doc.getElementById("selection-font-size")!.textContent = size;
    };
    doc.body.classList.add("workspace-modern");
    mountWorkspaceUI(doc, focus, readUnavailable, () => ({name: files.filename, dirty: files.dirty}));
    toolboxView = mountToolboxView(doc, formatBlockedReason, focus);
    projectFont();
    tableInsert=mountTableInsert(doc,editor,{
      busy:()=>busy()||!!doc.querySelector('dialog[open]:not(#table-insert-dialog)'),
      execute:(command,target)=>executeSearch(command,target),
      changed:()=>{changed();doc.dispatchEvent(new CustomEvent("rhwp:reveal-selection"));},
    });
    insertMenuUI1 = mountInsertMenuUI1(doc,editor,{busy:unavailable,focus,changed,feedback:message=>files.ui.error(message)});
    pageMenuUI1 = mountPageMenuUI1(doc,editor,{busy:unavailable,focus,paper:()=>paper.show(),feedback:message=>files.ui.error(message),
      breakPage:target=>safe(()=>editor.execute({type:"page-break"},target)),
      breakColumn:target=>safe(()=>editor.execute({type:"column-break"},target)),
      breakColumnDefinition:target=>safe(()=>editor.execute({type:"column-definition-break"},target))});
    remainingShortcuts=mountRemainingShortcutUI(doc,editor,{blocked:unavailable,inFlight:busy,focus,changed,error:files.ui.error});
    quickFormat = mountQuickFormat(doc, editor, unavailable, (command, target) => { editor.execute(lowerMenuCommand(editor, command), target); changed(); }, focus, formatBlockedReason, readUnavailable,
      f5SliceEnabled && qaQuickFormatDemandFlag(doc.defaultView?.location.href ?? ""));
    propertiesPanel = mountPropertiesPanel(doc, editor, unavailable, (props,target) => { editor.execute(lowerMenuCommand(editor,{type:"paragraph",props}),target); changed(); },focus,formatBlockedReason,()=>showFormat("paragraph",true),shapes.readSelected,(command,target)=>{editor.execute(command,target);changed();});
    tableContext = mountTableContext(doc, editor, unavailable, p => { editor.point(p); files.ui.change(false); }, focus, reason => files.ui.error(reason), {
      state: () => activeWorkset(doc)?syncEdit.liveState():editMenuState(editor, unavailable()), invoke: syncEdit.invoke,
    },{invoke:syncTable.invoke,formatInvoke:syncFormat.invoke});
    outlineNavigation = mountOutlineNavigation(doc, editor, {
      busy: unavailable,
      navigate: p => { editor.point(p); files.ui.change(false); doc.dispatchEvent(new CustomEvent("rhwp:reveal-selection")); },
      focus, error: reason => files.ui.error(reason),
    });
    mountModernWorkspace(doc, files, readUnavailable);
    queueMicrotask(()=>{toolbarOverflow=mountToolbarOverflow(doc);});
    documentNavigation=mountDocumentNavigation(doc,editor,{busy:unavailable,focus,changed:()=>files.ui.change(false),find:()=>search.show()});
    emptyHint=mountEmptyParagraphHint(doc,editor,unavailable);
    selectionTools=mountSelectionTools(doc,editor,{busy:unavailable,focus,shapeTarget:()=>shapes.readSelected()?.target,touchClipboard:{state:syncEdit.liveState,invoke:syncEdit.invoke},execute:(command,target)=>{editor.execute(lowerMenuCommand(editor,command),target);changed();}});
    lineGutter=mountLineSelectionGutter(doc,editor,{busy:unavailable,changed:()=>files.ui.change(false),focus,error:e=>files.ui.error(e)});
    removeExcludedMenuEntries(doc);
    if(!activeWorkset(doc))collectSupportedMenuCommands(doc);
    const searchCellMode = (row: SearchCommand) => row.cellDialog;
    const searchReasons=(rows?:SearchCommand[])=>editor.withViewQueries(owners=>{
        if(!rows){collectSupportedMenuCommands(doc);rows=searchCommands;}
        const formatRows = new Set(rows.filter(row => !row.cellDialog && !row.entrance && !row.insertion &&
          !row.unavailable && row.id !== "page-break" && row.id !== "column-break").map(row => row.id));
        let formats: ReturnType<typeof formatMenuState> | undefined;
        let formatSourceReady = false;
        const preparedRoots=new Set<Element>();
        const result=new Map<string,string>();
        for(const row of rows){let why=row.unavailable||"";
          try{
            if(busy())throw Error("입력·저장·클립보드 작업을 먼저 마치세요.");
            const cellMode = searchCellMode(row);
            if(cellMode)why=cellCommand.reason(cellMode);
            else if(row.entrance){
              const source=doc.querySelector<HTMLButtonElement>(row.entrance);
              if (!formatSourceReady && source?.closest("#format-menu")) {
                syncFormat();
                formatSourceReady = true;
              }
              if(activeWorkset(doc)&&source){const root=source.closest<HTMLDetailsElement>("#main-menu>details");
                if(root&&!preparedRoots.has(root)){preparedRoots.add(root);root.dispatchEvent(new Event("rhwp:menu-opening"));}}
              if(!source||source.disabled)why=source?.title||"현재 실행할 수 없는 명령입니다.";
            }
            else if(row.id==="page-break")why=pageBreakReason(editor.adapter,editor.selection);
            else if(row.id==="column-break")why=columnBreakReason(editor.adapter,editor.selection);
            else if(row.insertion==="textbox")why=textboxInsertReason(editor.adapter,editor.selection);
            else if(row.insertion==="table")assertTableInsertTarget(editor,editor.capture(),busy());
            else if(row.insertion==="picture"){if(editor.selection.kind!=="caret"||editor.selection.focus.kind!=="body")throw Error("그림은 본문 커서에서 넣으세요.");editor.adapter.assertEditable(editor.selection.focus);}
            else if(!why) {
              formats ??= formatMenuState(editor,busy(),undefined,undefined,owners,formatRows);
              why=formats.get(row.id)?.reason??"지원 명령을 조회할 수 없습니다.";
            }
          }catch(error){why=String(error).replace(/^Error: /,"");}result.set(row.id,why);
        }return result;
      });
    const invokeSearch=(row:SearchCommand,target:ReturnType<Interaction["capture"]>)=>{
        if(!sameFormatTarget(target,editor.capture()))throw Error("명령 대상 선택이 바뀌었습니다.");
        const cellMode = searchCellMode(row);
        if(cellMode){if(!cellCommand.open(cellMode,target))throw Error("현재 선택의 표/셀 속성을 열 수 없습니다.");}
        else if(row.entrance){const source=doc.querySelector<HTMLButtonElement>(row.entrance);source?.closest("#main-menu>details")?.dispatchEvent(new Event("rhwp:menu-opening"));if(!source||source.disabled)throw Error("현재 실행할 수 없는 명령입니다.");source.click();}
        else if(row.command){executeSearch(lowerMenuCommand(editor,row.command),target);changed();}
        else if(row.dialog && row.dialog !== "cell")showFormat(row.dialog,row.groupTab===listGroup,row.groupTab===listGroup?"기본":row.groupTab??"기본");
        else if(row.insertion==="table")tableInsert!.show();
        else if(row.insertion==="picture")pictures.showInsert();
        else if(row.insertion==="textbox")(doc.getElementById("textbox-insert-open") as HTMLButtonElement).click();
      };
    commandSearch=mountCommandSearch(doc,editor,{
      busy,focus,refresh:()=>{signature="";sync();},reasons:searchReasons,invoke:invokeSearch,
      direct(row, target) {
        const mode = searchCellMode(row);
        if (!mode) return false;
        if (!cellCommand.open(mode, target)) throw Error("현재 선택의 표/셀 속성을 열 수 없습니다.");
        return true;
      },
    });
    slashMenu=mountSlashMenu(doc,editor,{busy,focus,changed,refresh:()=>{signature="";sync();},reasons:searchReasons,invoke:invokeSearch});
    // All existing menu surfaces are mounted; remove reviewed exclusions before
    // the queued overflow layout captures their original nodes. No command change.
    removeExcludedMenuEntries(doc);
    homeToolbar=mountHomeToolbar(doc);
    compactToolbar=mountWorkspaceToolbarLayout(doc);
    // Project only after the existing bootstrap microtasks have attached the
    // status-page launcher, local-font/settings and shortcut-result sources,
    // and the toolbar has rehosted its original utility buttons. Early source
    // capture silently omitted late supported entries or exposed duplicates.
    queueMicrotask(()=>{studioMenus=mountStudioMenus(doc, unavailable, focus, syncTable.openCellDialog,{
      edit:syncEdit.liveState, table:syncTable.state, tablePressed:syncTable.pressed,
      paragraphDisplay:()=>readPassiveFormatPresentation(editor,"paragraph"),
      invokeEdit:syncEdit.invokeCurrent, invokeTable:syncTable.invoke,
    });if(activeWorkset(doc))initializeStaticToolbar(doc);});
    cellCommand.publish();
    sync();
  });
  if(activeWorkset(doc))queueMicrotask(()=>{
    const surfaces:[string,()=>void][]=[
      ["table-menu",()=>syncTable()],["format-menu",()=>syncFormat()],["edit-menu",()=>syncEdit()],
      ["picture-menu",()=>pictures.sync()],["picture-dialog",()=>pictures.sync()],
      ["shape-menu",()=>shapes.sync()],["shape-dialog",()=>shapes.sync()],
      ["number-manager",()=>numberManager.sync()],["search-dialog",()=>search.sync()],
      ["command-search",()=>commandSearch?.sync()],
      ["table-context-menu",()=>tableContext?.sync()],
      ["picture-context-menu",()=>pictureContext.sync()],
      ["shape-context-menu",()=>shapeContext.sync()],
      ["format-copy-dialog",()=>formatCopy.sync()],
      ["table-insert-dialog",()=>tableInsert?.sync()],
      ["page-menu",()=>pageMenuUI1?.sync()],
    ];
    for(const [id,update]of surfaces){const root=doc.getElementById(id);if(root)demandDisposers.push(subscribeWhileOpen(doc,root,update,!["table-menu","format-menu","edit-menu","command-search","table-context-menu"].includes(id)));}
  });
  bindings.set(doc, () => {
    demandDisposers.forEach(dispose=>dispose());studioMenus?.dispose();objectClipboard.dispose();
    remainingShortcuts?.dispose();documentInfo.dispose();paper.dispose();tableKeyDraft.dispose();tableObjectDraft.dispose();tableRangeSize.dispose();pasteChooser.dispose();doc.removeEventListener('rhwp:query-shortcut',queryShortcut);doc.removeEventListener('rhwp:shortcut-ui',shortcutUI);
    commandSearch?.dispose();slashMenu?.dispose();
    insertMenuUI1?.dispose();
    pageMenuUI1?.dispose();
    input.removeEventListener("rhwp:format-copy", formatCopyKey);
    formatModalObserver.disconnect();
    guard.close();
    format.removeEventListener("close", closeFormatGuard);
    format.removeEventListener("keydown", basicParagraphShortcut);
    disposeFormatConfirmFocus();
    disposeFormatCancelFocus();
    doc.removeEventListener("rhwp:fonts-updated", fontsChanged);
    doc.fonts?.removeEventListener("loading", fontsChanged);
    doc.fonts?.removeEventListener("loadingdone", fontsChanged);
    doc.fonts?.removeEventListener("loadingerror", fontsChanged);
    searchRoot.removeEventListener("click", guardSearch, true);
    searchRoot.removeEventListener("keydown", guardSearch, true);
    win.removeEventListener("click", click, true);
    win.removeEventListener("keydown", key, true);
    doc.removeEventListener("keydown", dialogKey);
    doc.removeEventListener("compositionstart", start, true);
    doc.removeEventListener("compositionend", end, true);
    doc.removeEventListener("rhwp:paragraph-lists", showLists);
    doc.removeEventListener("rhwp:picture-insert", showPictureInsert);
    doc.removeEventListener('rhwp:cell-block-format',blockFormat);
    cancelDisplay();
    if(f5SliceEnabled){f5Render.clear();doc.removeEventListener("contextmenu",beforeContext,true);}
    doc.removeEventListener("toggle",legacyTableToolsOpening,true);
    doc.removeEventListener("pointerdown", displayPointer, true);
    for (const name of ["pointerup", "pointercancel", "blur"]) win.removeEventListener(name, displayPointer, true);
    doc.removeEventListener("pointerdown", beforeDisplayAction, true);
    doc.removeEventListener("keydown", beforeDisplayAction, true);
    doc.removeEventListener("focusin", beforeDisplayAction, true);
    clipboardDisplayObserver.disconnect();
    doc.removeEventListener("rhwp:editor-state", publishCellState);
    doc.removeEventListener("rhwp:editor-state", projectDisplay);
    cellCommand.dispose();
    format.removeEventListener("close", projectFormatTransition);
    format.removeEventListener("cancel", projectFormatTransition);
    for (const dialog of [doc.getElementById("search-dialog")!, doc.getElementById("format-copy-dialog")!]) {
      dialog.removeEventListener("close", sync);
      dialog.removeEventListener("cancel", sync);
    }
    printDisposed = true; printObserver.disconnect(); nativePrint.dispose();
    shapes.dispose();
    syncFormat.dispose();
    toolbarOverflow?.dispose();compactToolbar?.dispose();homeToolbar?.dispose();
    syncEdit.dispose();
    tableContext?.dispose();
    pictureContext.dispose();
    shapeContext.dispose();
    toolboxView?.dispose();
    quickFormat?.dispose();
    emptyHint?.dispose();selectionTools?.dispose();lineGutter?.dispose();documentNavigation?.dispose();propertiesPanel?.dispose();
    tableInsert?.dispose();
    outlineNavigation?.dispose();
    syncTable.dispose();
    objectHandles.dispose();
    roots.forEach((r) => r.remove());
  });
}
