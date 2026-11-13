import { editorChanged } from "./editor-state-adapter.js";
import { tableGuideState,setTableGuideMode,type TableGuideMode } from "./table-guides.js";
import { ViewSequence } from "./view-sequence.js";
import { TouchIntent } from './touch-intent.js';
import {mountTouchSelectionHandles,touchTextRange} from './touch-selection.js';
import {copy} from './model.js';
import { setViewMarker, toggleViewMarker, viewMarkerState } from "./view-markers.js";
import { isPageChrome } from "./page-layers.js";
// D integration only; the A controller is pinned to 9833d714.
import {
  mountViewMenu,
  pagePoint,
  pageScale,
  viewportPoint,
} from "./integration/a-view-menu.js";
import type { FileLifecycle } from "./file-lifecycle.js";

const connections = new WeakMap<Document, { files: FileLifecycle }>();
export function connectViewIntegration(
  files: FileLifecycle,
  document: Document,
) {
  const existing = connections.get(document);
  if (existing) {
    existing.files = files;
    return;
  }
  const pages = document.getElementById("pages"),
    viewport = document.getElementById("viewport"),
    sidebar = document.querySelector<HTMLElement>("aside"),
    input = document.getElementById("input");
  const window = document.defaultView;
  if (!pages || !viewport || !sidebar || !input || !window) return;
  let pageObserver: MutationObserver | undefined;
  const connection = { files };
  connections.set(document, connection);
  let composing = false,
    pointerId: number | null = null;
  const sequence = new ViewSequence();
  let root = document.getElementById("view-menu") as HTMLDetailsElement | null;
  if (!root) {
    const nav = document.querySelector("header nav, #workspace-quickbar nav");
    if (!nav) return;
    root = document.createElement("details");
    root.id = "view-menu";
    const summary = document.createElement("summary");
    summary.textContent = "보기";
    const panel = document.createElement("div");
    panel.dataset.viewPanel = "";
    panel.setAttribute("aria-label", "문서 보기 명령");
    // Host the unchanged A controller without editing A's HTML or stylesheet.
    root.style.position = "relative";
    Object.assign(panel.style, {
      position: "absolute",
      right: "0",
      zIndex: "20",
      background: "white",
      minWidth: "260px",
      padding: "8px",
    });
    root.append(summary, panel);
    nav.append(root);
  }
  if (!document.getElementById("view-status")) {
    const status = document.createElement("span");
    status.id = "view-status";
    status.setAttribute("role", "status");
    root.after(status);
  }
  // Keep the guard live through dialog insertion/removal and open/close. The
  // browser-maintained tag collection avoids rescanning the document SVG tree.
  const dialogs = document.getElementsByTagName("dialog");
  const modal = () => {
    for (let i = 0; i < dialogs.length; i++)
      if (dialogs[i].hasAttribute("open")) return true;
    return false;
  };
  const blocked = () =>
    viewBlocked(
      connection.files,
      composing,
      modal(),
      pages.getElementsByClassName("page").length,
    );
  const locate = () => {
    const f = connection.files;
    const prepared = f.editor.presentationCursorRect();
    // Only the current synchronous, fully validated F5 presentation can
    // supply a rect. Scroll/modal and unproved paths keep fresh capture.
    if (!prepared && !f.editor.clickedTableDisplay()) f.editor.capture();
    const rect = prepared ?? f.editor.cursorRect();
    const page = pages.querySelector<HTMLElement>(
      `.page[data-page="${rect.pageIndex}"]`,
    );
    if (!page) throw Error("선택 쪽이 아직 렌더되지 않았습니다.");
    return { rect, page, selectionPage: rect.pageIndex };
  };
  // Within one view publication the IME anchor and selection page consume
  // the same validated current rect. Failure is shared only in that call.
  type Located = ReturnType<typeof locate>;
  const readLocation = (): Located | null => { try { return locate(); } catch { return null; } };
  const inputPosition = (reveal = false, location = readLocation) => {
    // ui.ts positions the native IME anchor at the isolated preview caret.
    if (input.dataset.imePreview === "true") return;
    try {
      const current = location();
      if (!current) return;
      const { rect, page } = current, point = viewportPoint(page, viewport, rect.x, rect.y);
      input.style.left = `${point.x}px`;
      input.style.top = `${point.y}px`;
      if (reveal) {
        const height = rect.height * point.scale;
        if (point.y < viewport.scrollTop + 16)
          viewport.scrollTop = Math.max(0, point.y - 16);
        else if (
          point.y + height >
          viewport.scrollTop + viewport.clientHeight - 16
        )
          viewport.scrollTop = point.y + height - viewport.clientHeight + 16;
        if (point.x < viewport.scrollLeft) viewport.scrollLeft = point.x;
        else if (point.x > viewport.scrollLeft + viewport.clientWidth - 16)
          viewport.scrollLeft = point.x - viewport.clientWidth + 16;
      }
    } catch {
      /* Invalid paths are already reported by the existing state adapter. */
    }
  };
  // Ruler is absent from the product UI. Do not mount a hidden projection or
  // acquire page geometry for it on every edit/scroll/view refresh.
  const setGuides=(mode:TableGuideMode)=>{
    const f=connection.files;setTableGuideMode(f.editor,mode);
    // Replace the legacy global Core dotted lines, never stack two guide systems.
    if(viewMarkerState(f.adapter,"transparent-borders")===true){setViewMarker(f.adapter,"transparent-borders",false);f.ui.change(true);}
    root!.open=false;input.focus({preventScroll:true});
  };
  const view = mountViewMenu(
    root,
    pages,
    viewport,
    sidebar,
    blocked,
    () => {
      connection.files.ui.change(false);
      inputPosition();
      publish();
    },
    () => {
      inputPosition(true);
      input.focus({ preventScroll: true });
      publish();
    },
    {
      read: id => id==="transparent-borders"?tableGuideState(connection.files.editor).mode==="all":viewMarkerState(connection.files.adapter, id),
      toggle: id => {
        if(id==="transparent-borders"){setGuides("all");return;}
        const f = connection.files, current = viewMarkerState(f.adapter, id);
        if (current === undefined) throw Error("현재 Core/SVG 표시 연결 미지원");
        toggleViewMarker(f.adapter, id);
        f.ui.change(true); // Existing full SVG render; no document mutation.
        root!.open = false;
        input.focus({preventScroll: true});
      },
      error: error => connection.files.ui.error(error),
    },
    undefined,
    {read:()=>tableGuideState(connection.files.editor),set:setGuides},
  );
  // Browser pinch/modified wheel is document zoom only while over its surface.
  // Regular wheel scroll and gestures outside the viewport remain browser-owned.
  viewport.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey || !event.cancelable) return;
    event.preventDefault();
    if (!blocked() && Number.isFinite(event.deltaY) && event.deltaY !== 0)
      view.setZoom(event.ctrlKey
        ? (Math.round(view.zoom() * 100) - Math.sign(event.deltaY) * 5) / 100
        : view.zoom() * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .01));
  }, {passive: false});
  let gestureZoom: number | undefined;
  viewport.addEventListener("gesturestart", event => {
    if (!event.cancelable) return;
    event.preventDefault(); gestureZoom = blocked() ? undefined : view.zoom();
  }, {passive: false});
  viewport.addEventListener("gesturechange", event => {
    if (!event.cancelable) return;
    event.preventDefault(); const factor = (event as Event & {scale?: number}).scale;
    if (gestureZoom !== undefined && !blocked() && typeof factor === "number" && factor > 0)
      view.setZoom(gestureZoom * factor);
  }, {passive: false});
  viewport.addEventListener("gestureend", event => {
    if (event.cancelable) event.preventDefault();
    gestureZoom = undefined;
  }, {passive: false});
  const publishLocation = (location = readLocation) => connection.files.adapter.withUpdateReads(() => {
    const list = Array.from(pages.getElementsByClassName("page")) as HTMLElement[];
    const top = viewport.getBoundingClientRect().top + viewport.clientTop + 24;
    // Keep the original first-visible/last-page rule. The selected page's
    // box also supplies the scale in this synchronous, read-only phase.
    let visibleRect: DOMRect | undefined;
    const visible = list.find(p => (visibleRect = p.getBoundingClientRect()).bottom > top) ?? list.at(-1);
    const selected = location()?.selectionPage ?? null;
    const state = JSON.stringify({
      documentId: connection.files.adapter.documentId,
      pageCount: connection.files.adapter.pageCount,
      renderedPages: list.length,
      visiblePage: visible ? Number(visible.dataset.page) : null,
      selectionPage: selected,
      scale: visible ? pageScale(visible, visibleRect) : null,
      busy: blocked(),
    });
    if (document.documentElement.dataset.rhwpViewState !== state)
      document.documentElement.dataset.rhwpViewState = state;
  });
  const publish = () => publishLocation();
  const refresh = () => connection.files.adapter.withUpdateReads(() => {
    // The synchronous editor-state projection below reads the current tree.
    // Consume only mutations already pending before that read. Later changes
    // (including deferred pages) remain observable; no geometry is cached.
    // Composition keeps its established preview/anchor refresh order. The
    // measured optimization is limited to committed, non-composing input.
    if (!composing && !connection.files.adapter.transientEdit)
      pageObserver?.takeRecords();
    sequence.reconcile(connection.files.adapter.documentId, blocked());
    view.refresh();
    let observed: Located | null | undefined;
    const location = () => observed === undefined ? (observed = readLocation()) : observed;
    inputPosition(false, location);
    publishLocation(location);
  });
  document.addEventListener("rhwp:editor-state", event => {
    if (editorChanged(event,"document","selection","format","admission")) refresh();
  });
  new MutationObserver(refresh).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  document.addEventListener("rhwp:reveal-selection", () => { inputPosition(true); publish(); });
  viewport.addEventListener("scroll", publish, { passive: true });
  pageObserver = new MutationObserver((records) => {
    // Caret/highlight and owner-registered absolute page chrome do not change
    // page geometry. Handle replacement otherwise schedules another full view
    // projection after every drained SVG. Keep real page/SVG and unknown-node
    // changes fresh, including records mixed with registered chrome.
    if (records.some(record => {
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      const changed = [...record.addedNodes, ...record.removedNodes];
      if (target?.matches('#pages > .page') && changed.length &&
          changed.every(node => node.nodeType === 1 && isPageChrome(target, node as Element))) return false;
      return !target?.closest('#pages > .page > .overlay');
    })) refresh();
  });
  pageObserver.observe(pages, {
    childList: true,
    subtree: true,
  });
  const point = (e: Pick<PointerEvent, "clientX" | "clientY">, extend: boolean, start = false, focusInput = true, scopedClick = false) => {
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>(".page");
    if (!target || !pages.contains(target)) return false;
    try {
      const select=()=>{
      const p = pagePoint(target, e.clientX, e.clientY);
      connection.files.editor.pointer(
        Number(target.dataset.page),
        p.x,
        p.y,
        extend,
        start,
      );
      connection.files.ui.change(false);
      inputPosition();
      };
      if(scopedClick&&connection.files.ui.clickTableScope)connection.files.ui.clickTableScope(target,select);
      else select();
      if (focusInput) input.focus({ preventScroll: true });
    } catch (error) {
      stopPointer();
      connection.files.ui.error(error);
      return null;
    }
    return true;
  };
  // A stationary pointer produces no pointermove. Keep the existing exact
  // hit/owner path active while scrolling; never manufacture an endpoint.
  let edgeFrame = 0, edgeTime = 0;
  let drag: { x: number; y: number; documentId: string; revision: number; selection: string } | undefined;
  const pauseEdge = () => {
    if (edgeFrame) window.cancelAnimationFrame(edgeFrame);
    edgeFrame = edgeTime = 0;
  };
  const stopPointer = () => { pauseEdge(); pointerId = null; drag = undefined; };
  const currentDrag = () => !!drag && !blocked() && !document.hidden &&
    drag.documentId === connection.files.adapter.documentId &&
    drag.revision === connection.files.adapter.revision &&
    drag.selection === JSON.stringify(connection.files.editor.selection);
  const edgeVelocity = () => {
    if (!drag) return 0;
    const r = viewport.getBoundingClientRect();
    const left = r.left + viewport.clientLeft, top = r.top + viewport.clientTop;
    const bottom = top + viewport.clientHeight;
    if (drag.x < left || drag.x >= left + viewport.clientWidth) return 0;
    const band = Math.min(48, viewport.clientHeight / 4);
    if (drag.y < top + band) return -900 * Math.min(1, (top + band - drag.y) / band);
    if (drag.y > bottom - band) return 900 * Math.min(1, (drag.y - bottom + band) / band);
    return 0;
  };
  const edgeStep = (now: number) => {
    edgeFrame = 0;
    if (!currentDrag()) { stopPointer(); return; }
    const velocity = edgeVelocity(), previous = viewport.scrollTop;
    const elapsed = Math.min(50, Math.max(0, now - edgeTime)); edgeTime = now;
    if (!velocity || velocity < 0 && previous <= 0 ||
        velocity > 0 && previous >= viewport.scrollHeight - viewport.clientHeight) { pauseEdge(); return; }
    viewport.scrollTop += velocity * elapsed / 1000;
    // The first frame timestamp may precede queueEdge's clock; fractional
    // scroll writes may also round to zero. Neither is a document boundary.
    if (viewport.scrollTop !== previous) {
      const r = viewport.getBoundingClientRect(), top = r.top + viewport.clientTop;
      const d = drag!;
      // Clamp only viewport coordinates, not Core addresses. Page gaps keep the
      // last valid endpoint until the next real page passes under the pointer.
      point({clientX: d.x, clientY: Math.max(top + 1, Math.min(top + viewport.clientHeight - 1, d.y))}, true);
      if (drag !== d) return;
      d.selection = JSON.stringify(connection.files.editor.selection);
    }
    edgeFrame = window.requestAnimationFrame(edgeStep);
  };
  const queueEdge = () => {
    if (!edgeVelocity()) { pauseEdge(); return; }
    if (!edgeFrame) { edgeTime = window.performance.now(); edgeFrame = window.requestAnimationFrame(edgeStep); }
  };
  const touch = new TouchIntent();
  const touchKey = () => `${connection.files.adapter.documentId}:${connection.files.adapter.revision}:${viewport.scrollLeft}:${viewport.scrollTop}:${viewport.clientWidth}:${viewport.clientHeight}:${view.zoom()}`;
  let tapRelease: { x: number; y: number; key: string; focus: boolean } | undefined;
  let holdTimer: number | undefined;
  const clearHold = () => { if (holdTimer !== undefined) window.clearTimeout(holdTimer); holdTimer = undefined; };
  const captureTouch = () => ({documentId:connection.files.adapter.documentId,revision:connection.files.adapter.revision,
    selection:copy(connection.files.editor.selection),typing:{...connection.files.editor.typing},
    block:connection.files.editor.block,preferredX:connection.files.editor.preferredX,selecting:touch.selecting});
  let downBefore: ReturnType<typeof captureTouch> | undefined;
  let tapRestore: {before:ReturnType<typeof captureTouch>;after:string} | undefined;
  const selectionStamp = () => JSON.stringify(connection.files.editor.selection);
  let touchDocument = connection.files.adapter.documentId;
  let lastPagePointerWasTouch = false;
  window.addEventListener('pointerdown',e=>{
    lastPagePointerWasTouch=e.pointerType==='touch'&&e.target instanceof Node&&pages.contains(e.target);
  },true);
  window.addEventListener('dblclick',e=>{
    // Compatibility mouse events cannot re-enter body/table double-click
    // editing after a touch zoom. A real mouse pointerdown clears this latch.
    if(lastPagePointerWasTouch&&e.target instanceof Node&&pages.contains(e.target)){
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  const handles = mountTouchSelectionHandles(document,connection.files.editor,viewport,pages,{
    active:()=>touch.selecting,blocked,changed:()=>connection.files.ui.change(false),error:e=>connection.files.ui.error(e),
  });
  const touchMode = () => {pages.toggleAttribute('data-touch-selection', touch.selecting);handles.refresh();};
  const cancelContact = () => {clearHold();touch.cancel();tapRelease=undefined;tapRestore=undefined;downBefore=undefined;};
  const resetTouch = () => {cancelContact();touch.reset();touchMode();};
  document.addEventListener('rhwp:editor-state', () => {
    if (touchDocument !== connection.files.adapter.documentId) {
      touchDocument = connection.files.adapter.documentId; resetTouch();
    }
  });
  pages.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') { resetTouch(); return; }
    clearHold();tapRelease=undefined;downBefore=undefined;
    if (!e.isPrimary || blocked()) { cancelContact(); return; }
    const key=touchKey();
    if(!touch.start(e.pointerId,e.clientX,e.clientY,e.timeStamp,key)){cancelContact();return;}
    downBefore=captureTouch();const origin=selectionStamp(),x=e.clientX,y=e.clientY,id=e.pointerId;
    // One finite stationary-contact timer. No focus/value/native-input mutation
    // from this callback; release still owns permitted keyboard activation.
    holdTimer=window.setTimeout(()=>{
      holdTimer=undefined;
      if(blocked()||document.hidden||document.fonts.status==='loading'||selectionStamp()!==origin||
          !touch.isCurrent(id,touchKey())||!touch.hold(id,window.performance.now(),touchKey()))return;
      tapRestore=undefined;
      try {
        const page=document.elementFromPoint(x,y)?.closest<HTMLElement>('.page');
        if(!page||!pages.contains(page)||page.hasAttribute('data-render-pending')){touch.rejectHold();return;}
        const at=pagePoint(page,x,y),range=touchTextRange(connection.files.editor,Number(page.dataset.page),at.x,at.y);
        if(!range){touch.rejectHold();return;}
        const f=connection.files;f.editor.point(range[0]);f.editor.point(range[1],true);f.editor.block=false;
        touchMode();f.ui.change(false);inputPosition();handles.refresh();
        document.dispatchEvent(new Event('rhwp:touch-selection'));
      }catch(error){touch.rejectHold();touchMode();connection.files.ui.error(error);}
    },520);
  },true);
  window.addEventListener('pointermove',e=>{
    if(e.pointerType!=='touch')return;
    // Moving on the page is native pan, including while a range is visible.
    // Only the separately mounted handles capture a selection extension.
    if(touch.move(e.pointerId,e.clientX,e.clientY)){clearHold();tapRestore=undefined;}
  },{capture:true,passive:true});
  window.addEventListener('pointerup',e=>{
    if(e.pointerType!=='touch')return;
    clearHold();
    const before=downBefore;downBefore=undefined;
    const result=blocked()?(touch.cancel(),'none'):touch.end(e.pointerId,e.clientX,e.clientY,e.timeStamp,touchKey());
    if(result==='none'){tapRestore=undefined;return;}
    if(e.cancelable)e.preventDefault();
    if(result==='held'){
      if(touch.selecting)tapRelease={x:e.clientX,y:e.clientY,key:touchKey(),focus:false};
      touchMode();return;
    }
    if(result==='zoom'){
      const restore=tapRestore;tapRestore=undefined;
      if(restore&&restore.before.documentId===connection.files.adapter.documentId&&
          restore.before.revision===connection.files.adapter.revision&&restore.after===selectionStamp()){
        const f=connection.files,old=restore.before;
        f.editor.selection=copy(old.selection);f.editor.typing={...old.typing};
        f.editor.block=old.block;f.editor.preferredX=old.preferredX;touch.selecting=old.selecting;
      }
      view.toggleTouchWidth();touchMode();
      tapRelease={x:e.clientX,y:e.clientY,key:touchKey(),focus:false};return;
    }
    input.focus({preventScroll:true});
    if(point(e,false,true)!==true){resetTouch();return;}
    touch.acceptTap();touchMode();
    if(before)tapRestore={before,after:selectionStamp()};
    tapRelease={x:e.clientX,y:e.clientY,key:touchKey(),focus:true};root!.open=false;
  },true);
  window.addEventListener('touchend',e=>{
    const tap=tapRelease;tapRelease=undefined;
    if(!tap||blocked()||tap.key!==touchKey()||e.touches.length||e.changedTouches.length!==1)return;
    const t=e.changedTouches[0];if(Math.hypot(t.clientX-tap.x,t.clientY-tap.y)>10)return;
    if(e.cancelable)e.preventDefault();if(tap.focus)input.focus({preventScroll:true});
  },{capture:true,passive:false});
  window.addEventListener('pointercancel',e=>{if(e.pointerType==='touch')cancelContact();},true);
  pages.addEventListener('contextmenu',e=>{
    // Suppress the browser/custom right-click callout only for an active touch
    // hold; actual desktop right-click still uses its unchanged menus.
    if(touch.active()||(e as PointerEvent).pointerType==='touch'){
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  window.addEventListener('keydown',e=>{if(e.key==='Escape')resetTouch();else cancelContact();},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelContact();});
  // Keyboard appearance changes the visual viewport without changing Core or
  // selection. Reveal only the focused live caret; never refocus on resize.
  const revealMobileCaret = () => {
    if (document.activeElement !== input || composing || modal()) return;
    inputPosition(true);
    const v = window.visualViewport, r = input.getBoundingClientRect();
    if (v && r.bottom > v.offsetTop + v.height - 16)
      viewport.scrollTop += r.bottom - (v.offsetTop + v.height - 16);
    else if (v && r.top < v.offsetTop + 16)
      viewport.scrollTop -= v.offsetTop + 16 - r.top;
  };
  window.visualViewport?.addEventListener('resize', revealMobileCaret);
  pages.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0 || !e.isPrimary) return;
      if (blocked()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const pointed = point(e,e.shiftKey,true,true,e.isTrusted&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey);
      if (pointed === false) return;
      // Capture replaces the legacy unscaled handler, so forward A's outside
      // click dismissal explicitly before stopping the bubbling event.
      root!.open = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (pointed === null) return;
      pointerId = e.pointerId;
      drag = {x: e.clientX, y: e.clientY, documentId: connection.files.adapter.documentId,
        revision: connection.files.adapter.revision, selection: JSON.stringify(connection.files.editor.selection)};
      queueEdge();
    },
    true,
  );
  window.addEventListener(
    "pointermove",
    (e) => {
      if (pointerId !== e.pointerId) return;
      if (!(e.buttons & 1) || !currentDrag()) { stopPointer(); return; }
      e.preventDefault();
      e.stopImmediatePropagation();
      point(e, true);
      if (drag) { drag.x = e.clientX; drag.y = e.clientY;
        drag.selection = JSON.stringify(connection.files.editor.selection); queueEdge(); }
    },
    true,
  );
  const endPointer = (e: PointerEvent) => {
    if (pointerId === e.pointerId) stopPointer();
  };
  window.addEventListener("pointerup", endPointer, true);
  window.addEventListener("pointercancel", endPointer, true);
  window.addEventListener("pointerout", e => {
    if (pointerId === e.pointerId && !e.relatedTarget &&
        (e.clientX < 0 || e.clientY < 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) stopPointer();
  }, true);
  // Dismissing the keyboard/control focus ends a double-tap sequence, but must
  // not discard an existing deliberate range while its controls are in use.
  input.addEventListener("blur", () => { stopPointer(); sequence.cancel(); cancelContact(); });
  window.addEventListener("blur", () => { stopPointer(); sequence.cancel(); cancelContact(); });
  window.addEventListener("pointerdown", () => { stopPointer(); sequence.cancel(); }, true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopPointer(); });
  window.addEventListener("keydown", stopPointer, true);
  window.addEventListener(
    "compositionstart",
    (e) => {
      // A local form's start/end cannot acquire OR release body composition.
      if (e.target !== input) return;
      stopPointer();
      sequence.cancel();
      composing = true;
      refresh();
    },
    true,
  );
  window.addEventListener(
    "compositionend",
    (e) => {
      // A local form's start/end cannot acquire OR release body composition.
      if (e.target !== input) return;
      composing = false;
      queueMicrotask(refresh);
    },
    true,
  );
  window.addEventListener(
    "keydown",
    (e) => {
      const target = e.target as HTMLElement | null;
      const action = sequence.route(e, connection.files.adapter.documentId,
        target === input && !blocked() && !e.getModifierState("AltGraph"));
      if (action) {
        if(action==='fullscreen'&&!e.cancelable)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (action !== "prefix" && action !== "cancel") {
          const button = root!.querySelector<HTMLButtonElement>(`[data-view-action="${action}"]`);
          if (button && !button.disabled) button.click();
        }
        return;
      }
      if (
        target !== input &&
        target?.closest("input,textarea,select,[contenteditable=true],#body-context-menu")
      )
        return;
      if (view.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // A plain character (including Space) in a text selection/caret belongs
      // to the native textarea. A capture-phase microtask can run before its
      // default editing action; do not move the input anchor or force a Core
      // location read from that keydown. The existing input listener below
      // reveals/publishes after the actual edit. Command keys and platform
      // preedit keep their existing paths.
      const selection = connection.files.editor.selection;
      const nativeTextKey = (selection.kind === "caret" || selection.kind === "text") &&
        e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey &&
        !e.isComposing && e.keyCode !== 229 && !e.getModifierState("AltGraph");
      if (target === input && !nativeTextKey && !blocked())
        queueMicrotask(() => {
          inputPosition(true);
          publish();
        });
    },
    true,
  );
  input.addEventListener("input", () =>
    queueMicrotask(() => {
      inputPosition(true);
      publish();
    }),
  );
  refresh();
}

export function viewBlocked(
  files: FileLifecycle,
  composing: boolean,
  modal: boolean,
  renderedPages: number,
) {
  // Viewing remains available in readonly documents; incomplete DOM is not Core.
  return (
    files.busy ||
    composing ||
    modal ||
    renderedPages !== files.adapter.pageCount
  );
}
