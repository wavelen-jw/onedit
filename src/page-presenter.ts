import {activeWorkset} from "./active-workset.js";
import { prepareScreenPageReceipt, type ScreenPageReceipt } from "./screen-page-receipt.js";
import type { RhwpAdapter } from "./adapter.js";
import {hasPageLayers} from './page-layers.js';
import { createPageSvg } from "./svg-page.js";
import { projectControlLabels } from "./control-label-presentation.js";
import { updateHangulSvgText } from "./svg-text-update.js";
import { updateSvgTextRegion } from './svg-text-region.js';
import { paragraphOnlyMarkers, separateSpaceMarkers, projectParagraphMarks, viewMarkerState } from "./view-markers.js";

type RenderedPage = {
  doc: RhwpAdapter["doc"]; documentId: string; page: number; fontRevision: number;
  markup: string;
  paragraphOnly: boolean; controlCodes: boolean; width: number; height: number;
  svg: SVGSVGElement; observer: MutationObserver; dirty: boolean; receipt?: ScreenPageReceipt;
};

// Supplied only for currently visible pages in the established complete-layout
// ordinary SVG pass. No geometry, selection or editing permission is conveyed.
export type ScreenReceiptView = {pageCount: number; current: () => boolean};
type PagePresenterContext = {
  adapter: RhwpAdapter;
  document: Document;
  pages: HTMLElement;
  invalidateSelectionSvg: (svg: SVGSVGElement) => void;
};

// One UI-owned page cache. Scheduling and selection geometry stay with the caller.
export function createPagePresenter({adapter, document, pages, invalidateSelectionSvg}: PagePresenterContext) {
  const renderedPages = new WeakMap<HTMLElement, RenderedPage>();
  function renderPage(page: number, info: { width: number; height: number }, div: HTMLElement | undefined, fontRevision: number, reusePages: boolean, hangulUpdate = false, resizeCanvas = false, receiptView?: ScreenReceiptView) {
    return adapter.withUpdateReads(() => {
    const controlCodes = viewMarkerState(adapter,'control-codes') === true;
    // Keep a composition surface through its commit; keyboard/range navigation restores SVG.
    // Enabled control labels require their SVG margin projection even when
    // paragraph marks happen to be off (e.g. a restored view state).
    if ((hangulUpdate || resizeCanvas) && !controlCodes && viewMarkerState(adapter,'paragraph-marks')!==true) {
      let canvas = div?.querySelector<HTMLCanvasElement>(":scope > canvas");
      if (!canvas) {
        canvas = document.createElement("canvas");
        div = document.createElement("div");
        div.className = "page"; div.dataset.page = String(page);
        const overlay = document.createElement("div"); overlay.className = "overlay";
        div.append(canvas, overlay);
      }
      delete div!.dataset.imeCanvas;
      delete div!.dataset.resizeCanvas;
      if (resizeCanvas) div!.dataset.resizeCanvas = "true";
      else div!.dataset.imeCanvas = "true";
      canvas.style.display = "block";
      adapter.doc.renderPageToCanvasFilteredWithProfile(page, canvas, devicePixelRatio, "all", "screen");
      // Core rounds the bitmap outward. Do not shrink the rounded bitmap back
      // into fractional page dimensions: that resamples every glyph. Preserve
      // page geometry and clip only the extra blank edge pixels.
      if (canvas.width === Math.ceil(info.width * devicePixelRatio) &&
          canvas.height === Math.ceil(info.height * devicePixelRatio)) {
        canvas.style.width = `${canvas.width / devicePixelRatio}px`;
        canvas.style.height = `${canvas.height / devicePixelRatio}px`;
        canvas.style.clipPath = `inset(0 ${Math.max(0, canvas.width / devicePixelRatio - info.width)}px ${Math.max(0, canvas.height / devicePixelRatio - info.height)}px 0)`;
      } else {
        // The Core may cap extreme bitmap dimensions. Keep its established
        // scale behavior rather than guessing the normalization policy.
        canvas.style.width = `${info.width}px`; canvas.style.height = `${info.height}px`;
        canvas.style.clipPath = "";
      }
      div!.style.width = `${info.width}px`; div!.style.height = `${info.height}px`;
      div!.style.removeProperty("content-visibility");
      div!.style.removeProperty("visibility"); delete div!.dataset.renderPending;
      const current = pages.children[page];
      if (current !== div) { if (current) pages.replaceChild(div!, current); else pages.append(div!); }
      return;
    }
    const cached = div && renderedPages.get(div);
    if (cached?.observer.takeRecords().length) cached.dirty = true;
    const previousReceipt = cached?.receipt;
    if (cached) cached.receipt = undefined; // A fallback or unrequested page never carries this proof forward.
    // Control label placement has additional browser-side layout inputs. Its
    // enabled mode stays on the established SVG+sanitizer route.
    const eligible = receiptView && div && div === pages.children[page] && div.isConnected &&
      !div.hasAttribute("data-render-pending") && !hangulUpdate && !resizeCanvas &&
      receiptView.current() && !controlCodes;
    const environment = eligible ? adapter.localBodyEnvironmentToken(true) : undefined;
    const paragraphOnly = paragraphOnlyMarkers(adapter);
    const previousIsMounted = eligible && cached && !cached.dirty && cached.doc === adapter.doc &&
      cached.documentId === adapter.documentId && cached.page === page && cached.fontRevision === fontRevision &&
      cached.width === info.width && cached.height === info.height && cached.paragraphOnly === paragraphOnly && cached.controlCodes === controlCodes &&
      hasPageLayers(div!, cached.svg);
    const decision = environment === undefined ? undefined : prepareScreenPageReceipt(adapter.doc, page,
      {key:JSON.stringify(["a-screen-svg-v1",fontRevision,adapter.presentationDpi(),
        document.defaultView?.devicePixelRatio,pages.style.zoom,paragraphOnly]),composing:false},
      previousIsMounted ? previousReceipt : undefined);
    const receiptCurrent = () => receiptView?.current() && adapter.localBodyEnvironmentToken(true) === environment;
    if (decision?.status === "reuse" && cached && previousIsMounted && receiptCurrent() && decision.pageCount === receiptView?.pageCount) {
      cached.receipt = decision.receipt;
      return; // Exact native witness for this same already sanitized mounted SVG.
    }
    const markup = adapter.doc.renderPageSvg(page);
    // A page that previously had no projected labels can acquire its first
    // one on an edit. The presence of a label in the old DOM is not an
    // admission test for an incremental renderer.
    if (!controlCodes && div && cached && !cached.controlCodes && !cached.dirty && cached.doc === adapter.doc &&
        cached.documentId === adapter.documentId && cached.page === page && cached.fontRevision === fontRevision &&
        cached.width === info.width && cached.height === info.height && hasPageLayers(div,cached.svg) &&
        cached.paragraphOnly === paragraphOnly && cached.markup !== markup &&
        updateSvgTextRegion(cached.svg, cached.markup, markup, paragraphOnly,
          fragment => createPageSvg(fragment, page, document, cached.svg))) {
      cached.markup = markup;
      cached.observer.takeRecords();
      invalidateSelectionSvg(cached.svg);
    }
    if (hangulUpdate && !controlCodes && div && cached && !cached.controlCodes && !cached.dirty && cached.doc === adapter.doc &&
        cached.documentId === adapter.documentId && cached.page === page && cached.fontRevision === fontRevision &&
        cached.width === info.width && cached.height === info.height && hasPageLayers(div,cached.svg) &&
        cached.paragraphOnly === paragraphOnly && !paragraphOnly && cached.markup !== markup && updateHangulSvgText(cached.svg, cached.markup, markup)) {
      cached.markup = markup;
      // Consume only our synchronous text writes. The independent glyph-bounds
      // observer still sees them; Core run queries must also get fresh text.
      cached.observer.takeRecords();
      invalidateSelectionSvg(cached.svg);
    }
    // Ask Core for every page when that page is consumed. Only an identical, already
    // sanitized SVG in this same document can skip DOM parse/import. Commands,
    // snapshots and selection queries remain fresh. Never reuse a mutated SVG.
    if (!div || !cached || cached.doc !== adapter.doc || cached.documentId !== adapter.documentId ||
        cached.page !== page || cached.fontRevision !== fontRevision || cached.dirty ||
        cached.markup !== markup || cached.paragraphOnly !== paragraphOnly || cached.controlCodes !== controlCodes || cached.width !== info.width || cached.height !== info.height ||
        !hasPageLayers(div,cached.svg)) {
      div = document.createElement("div");
      // The existing parser reuses only exact, already-decoded font attribute
      // strings. Ordinary edits need the same benefit as IME: all new geometry,
      // text/entities, namespaces and resources still take the full parser and
      // sanitizer path. Never reuse a modified SVG or another document/font view.
      const previousSvg = cached && !cached.dirty && cached.doc === adapter.doc &&
        cached.documentId === adapter.documentId && cached.page === page && cached.fontRevision === fontRevision
        ? cached.svg : undefined;
      const svg = createPageSvg(markup, page, document, previousSvg);
      separateSpaceMarkers(svg,paragraphOnly);
      projectParagraphMarks(svg,adapter.presentationDpi());
      projectControlLabels(svg,adapter,page);
      div.append(svg);
      const overlay = document.createElement("div");
      overlay.className = "overlay";
      div.append(overlay);
      if (reusePages) {
        const entry: RenderedPage = {
          doc: adapter.doc, documentId: adapter.documentId, page, fontRevision,
          markup, paragraphOnly, controlCodes, width: info.width, height: info.height, svg, dirty: false,
          observer: new MutationObserver(() => { entry.dirty = true; }),
        };
        entry.observer.observe(svg, { attributes: true, childList: true, characterData: true, subtree: true });
        renderedPages.set(div, entry);
      }
    }
    // Text-region updates can create new markers too. Consume only our own
    // projection writes; unrelated DOM mutations retain the existing fallback.
    const displayed=div.querySelector<SVGSVGElement>(':scope > svg');
    if(displayed){projectParagraphMarks(displayed,adapter.presentationDpi());renderedPages.get(div)?.observer.takeRecords();}
    div.className = "page";
    div.dataset.page = String(page);
    // Identical dimensions are not a page-layout change. Avoid waking the
    // layout observer for a write that leaves its input unchanged.
    if (div.style.width !== `${info.width}px`) div.style.width = `${info.width}px`;
    if (div.style.height !== `${info.height}px`) div.style.height = `${info.height}px`;
    div.style.removeProperty("content-visibility");
    div.style.removeProperty("visibility");
    delete div.dataset.renderPending;
    // Keep identical validated siblings attached. Detaching the entire page
    // list on each IME update invalidates layout even for unchanged pages.
    const current = pages.children[page];
    if (current !== div) {
      if (current) pages.replaceChild(div, current);
      else pages.append(div);
    }
    // Publish only after successful original SVG rendering/sanitization and
    // attachment, with exact document/layout/view provenance still in scope.
    if (decision?.status === "render" && receiptCurrent() && decision.pageCount === receiptView?.pageCount) {
      const mounted = renderedPages.get(div);
      if (mounted && !mounted.dirty && hasPageLayers(div,mounted.svg) && pages.children[page] === div)
        mounted.receipt = decision.receipt;
    }
    });
}
  function release(div:HTMLElement) {
    const entry=renderedPages.get(div);
    if(entry){entry.observer.disconnect();invalidateSelectionSvg(entry.svg);renderedPages.delete(div);}
    div.replaceChildren();const overlay=document.createElement('div');overlay.className='overlay';div.append(overlay);
  }
  return {renderPage,release};
}
