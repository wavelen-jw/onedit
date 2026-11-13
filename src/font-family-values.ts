// Raw DOM font-family attributes only, never source font identity, availability,
// glyph coverage, Core measurements or a document/revision receipt.
const SVG = 'http://www.w3.org/2000/svg';
type Summary = { values: string[]; dirty: boolean; observer: MutationObserver };
const summaries = new WeakMap<Element, Summary>();
function append(values: string[], value: string) {
  // Only adjacent identical strings may collapse. A/B/A and different chains
  // for the same family keep their original ordering/last-wins semantics.
  if (!values.length || values[values.length - 1] !== value) values.push(value);
}
function changed(records: MutationRecord[]): boolean {
  return records.some(r => r.type === 'childList' ||
    r.type === 'attributes' && r.attributeName === 'font-family');
}
function svgValues(svg: Element): readonly string[] {
  let entry = summaries.get(svg);
  if (!entry) {
    entry = { values: [], dirty: true, observer: undefined as unknown as MutationObserver };
    const current = entry;
    current.observer = new MutationObserver(records => { if (changed(records)) current.dirty = true; });
    // Observe attributes without a filter so namespaced attribute changes also
    // receive a fresh exact selector read. Coordinates do not affect the list.
    current.observer.observe(svg, {attributes: true, childList: true, subtree: true});
    summaries.set(svg, current);
  }
  if (changed(entry.observer.takeRecords())) entry.dirty = true;
  if (entry.dirty) {
    const values: string[] = [];
    if (svg.matches('[font-family]')) append(values, svg.getAttribute('font-family') ?? '');
    for (const node of svg.querySelectorAll('[font-family]'))
      append(values, node.getAttribute('font-family') ?? '');
    entry.values = values; entry.dirty = false;
  }
  return entry.values;
}
/** Synchronous snapshot of descendant attribute values in exact DOM order.
 * SVG subtrees keep only compressed strings and a weakly owned observer.
 * HTML/overlay branches and root ordering are reread on every invocation. */
export function fontFamilyValues(root: Element): readonly string[] {
  const values: string[] = [];
  const visit = (node: Element) => {
    if (node.namespaceURI === SVG && node.localName === 'svg') {
      for (const value of svgValues(node)) append(values, value);
      return;
    }
    if (node.matches('[font-family]')) append(values, node.getAttribute('font-family') ?? '');
    for (const child of node.children) visit(child);
  };
  // The old root.querySelectorAll excludes root itself; keep that contract.
  for (const child of root.children) visit(child);
  return values;
}
