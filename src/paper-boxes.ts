type PaperSize = Readonly<{width: number; height: number}>;

// This remembers only the paper boxes the UI has already sized. Core still
// supplies the complete current run list on every edit, including section breaks.
export function mountedPaperBoxes(pages: HTMLElement) {
  let known: {runs: number[][]; sizes: PaperSize[]} | undefined;
  const styled = new WeakMap<HTMLElement, {width: string; height: string}>();
  const observer = new MutationObserver(inspect);
  function forget() {
    known = undefined;
    observer.disconnect();
  }
  function inspect(records: MutationRecord[]) {
    for (const {target, type} of records) {
      if (type === 'childList') { forget(); return; }
      const page = target as HTMLElement, prior = styled.get(page);
      if (!prior || page.style.width !== prior.width || page.style.height !== prior.height) {
        forget();
        return;
      }
    }
  }
  function current(count: number, runs: number[][]) {
    inspect(observer.takeRecords());
    if (!known || known.sizes.length !== count || pages.children.length !== count ||
        runs.length !== known.runs.length) return;
    // Validated Core runs contain end-exclusive page, physical width, height.
    for (let i = 0; i < runs.length; i++) {
      const [end, width, height] = runs[i], prior = known.runs[i];
      if (end !== prior[0] || width !== prior[1] || height !== prior[2]) return;
    }
    return known.sizes;
  }
  function remember(runs: number[][], sizes: PaperSize[]) {
    forget();
    if (sizes.length !== pages.children.length) return;
    // Shallow registrations only. Glyphs, selection and overlay mutations
    // do not invalidate paper dimensions or create pending observer records.
    observer.observe(pages, {childList: true});
    for (let i = 0; i < sizes.length; i++) {
      const page = pages.children[i] as HTMLElement;
      styled.set(page, {width: page.style.width, height: page.style.height});
      observer.observe(page, {attributes: true, attributeFilter: ['style']});
    }
    known = {runs: runs.map(([end, w, h]) => [end, w, h]), sizes};
  }
  return {current, remember};
}
