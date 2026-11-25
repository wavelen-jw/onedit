import type { RhwpAdapter } from "./adapter.js";
import { printSnapshot } from "./print-preview.js";
import { createPrintSurface } from "./print-surface.js";
import { allFontSupply } from "./font-provider.js";

type Pages = ReturnType<typeof printSnapshot>["pages"];

function groupByPaper(pages: Pages) {
  const groups: Pages[] = [];
  for (const page of pages) {
    const group = groups.at(-1), first = group?.[0];
    if (group && first && first.width === page.width && first.height === page.height) group.push(page);
    else groups.push([page]);
  }
  return groups;
}

function paperRangeLabel(pages: Pages) {
  const first = pages[0], last = pages[pages.length - 1];
  const range = first === last ? `${first.page + 1}쪽` : `${first.page + 1}–${last.page + 1}쪽`;
  const orientation = first.width > first.height ? "가로" : first.width < first.height ? "세로" : "정사각형";
  const mm = (px: number) => Math.round(px * 25.4 / 96);
  return `${range} · ${orientation} (${mm(first.width)} × ${mm(first.height)} mm)`;
}

/** Direct browser print settings; mixed paper uses one output document per selected range. */
export function mountNativePrint(doc: Document, adapter: RhwpAdapter, done: () => void, error: (e: unknown) => void) {
  const status = doc.createElement("div");
  status.id = "native-print-status";
  status.hidden = true;
  const label = doc.createElement("span");
  label.setAttribute("role", "status");
  const picker = doc.createElement("select");
  picker.setAttribute("aria-label", "인쇄할 구간");
  const printRange = doc.createElement("button");
  printRange.type = "button";
  printRange.textContent = "선택 구간 인쇄";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  const controls = doc.createElement("div");
  controls.append(picker, printRange, cancel);
  status.append(label, controls);
  const stage = doc.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none";
  doc.body.append(status, stage);

  let generation = 0, disposed = false, identity: string | undefined;
  let groups: Pages[] = [];
  let surface: ReturnType<typeof createPrintSurface> | undefined;
  let unbind: (() => void) | undefined;
  const currentIdentity = () => `${adapter.documentId}:${adapter.revision}`;
  const clearSurface = () => {
    unbind?.();
    unbind = undefined;
    const previous = surface;
    surface = undefined;
    previous?.dispose();
  };
  const release = () => {
    generation++;
    identity = undefined;
    groups = [];
    picker.replaceChildren();
    clearSurface();
    status.hidden = true;
    done();
  };
  const showGroups = (restoreFocus: boolean) => {
    label.textContent = "용지 크기나 방향이 다른 문서입니다. 구간을 선택해 인쇄하세요.";
    picker.hidden = printRange.hidden = cancel.hidden = false;
    picker.disabled = printRange.disabled = false;
    cancel.textContent = "닫기";
    if (restoreFocus) picker.focus({preventScroll: true});
  };
  const runGroup = async (pages: Pages, ticket: number) => {
    label.textContent = "인쇄 자료 준비 중…";
    picker.disabled = printRange.disabled = true;
    cancel.textContent = "준비 취소";
    try {
      const prepared = createPrintSurface(stage, pages);
      surface = prepared;
      await prepared.ready;
      if (disposed || ticket !== generation || surface !== prepared) return;
      if (identity !== currentIdentity()) { release(); return; }
      if (allFontSupply().some(face => face.status === "loading"))
        throw Error("글꼴을 준비하는 중입니다. 잠시 후 다시 인쇄하세요.");
      const win = prepared.frame.contentWindow!;
      const after = () => {
        if (surface !== prepared) return;
        if (groups.length > 1) {
          clearSurface();
          showGroups(true);
        } else {
          release();
        }
      };
      win.addEventListener("afterprint", after);
      unbind = () => win.removeEventListener("afterprint", after);
      cancel.hidden = true;
      label.textContent = "인쇄 창이 열렸습니다.";
      prepared.print();
    } catch (e) {
      if (ticket !== generation || disposed) return;
      if (groups.length > 1) {
        clearSurface();
        showGroups(false);
      } else {
        release();
      }
      error(e);
    }
  };
  printRange.onclick = () => {
    if (surface || !identity) return;
    if (identity !== currentIdentity()) { release(); return; }
    const pages = groups[picker.selectedIndex];
    if (pages) void runGroup(pages, ++generation);
  };
  cancel.onclick = release;
  const esc = (e: KeyboardEvent) => {
    if (identity && !cancel.hidden && e.key === "Escape" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      e.stopPropagation();
      release();
    }
  };
  doc.addEventListener("keydown", esc, true);

  return {
    get busy() { return identity !== undefined; },
    sync() { if (identity && identity !== currentIdentity()) release(); },
    async print() {
      if (disposed || identity) return;
      const ticket = ++generation;
      identity = currentIdentity();
      status.hidden = cancel.hidden = false;
      picker.hidden = printRange.hidden = true;
      cancel.textContent = "준비 취소";
      label.textContent = "인쇄 자료 준비 중…";
      try {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (disposed || ticket !== generation) return;
        if (identity !== currentIdentity()) { release(); return; }
        groups = groupByPaper(printSnapshot(adapter, "").pages);
        if (groups.length === 1) {
          await runGroup(groups[0], ticket);
        } else {
          picker.replaceChildren(...groups.map(pages => {
            const option = doc.createElement("option");
            option.textContent = paperRangeLabel(pages);
            return option;
          }));
          showGroups(true);
        }
      } catch (e) {
        if (ticket === generation && !disposed) { release(); error(e); }
      }
    },
    dispose() {
      disposed = true;
      doc.removeEventListener("keydown", esc, true);
      release();
      status.remove();
      stage.remove();
    },
  };
}
