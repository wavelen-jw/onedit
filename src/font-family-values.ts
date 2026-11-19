// Raw DOM font-family attributes only, never source font identity, availability,
// glyph coverage, Core measurements or a document/revision receipt.
const SVG = 'http://www.w3.org/2000/svg';
type FamilyUse = { value: string; basicRegularText: boolean };
type Summary = { values: FamilyUse[]; dirty: boolean; observer: MutationObserver };
const summaries = new WeakMap<Element, Summary>();
function append(values: FamilyUse[], value: string, basicRegularText: boolean) {
  const previous = values[values.length - 1];
  if (previous?.value === value) previous.basicRegularText &&= basicRegularText;
  else values.push({value, basicRegularText});
}

const fontAttributes = ['font-family', 'font-weight', 'font-style', 'font-stretch', 'class', 'style'];
const styledText = fontAttributes.slice(1).map(name => `svg [${name}]`).join(',');
function svgValues(svg: Element): readonly FamilyUse[] {
  let entry = summaries.get(svg);
  if (!entry) {
    entry = { values: [], dirty: true, observer: undefined as unknown as MutationObserver };
    const current = entry;
    current.observer = new MutationObserver(records => { if (records.length) current.dirty = true; });
    current.observer.observe(svg, {attributeFilter: fontAttributes, characterData: true, childList: true, subtree: true});
    summaries.set(svg, current);
  }
  if (entry.observer.takeRecords().length) entry.dirty = true;
  if (entry.dirty) {
    const values: FamilyUse[] = [];
    const plainSvg = !svg.querySelector('style,use') &&
      !fontAttributes.slice(1).some(name => svg.hasAttribute(name));
    if (svg.hasAttribute('font-family')) append(values, svg.getAttribute('font-family')!, false);
    for (const node of svg.querySelectorAll('[font-family]')) {
      const text = node.localName === 'text' && !node.childElementCount ? node.textContent : '';
      // Both pinned regular HCR files cover printable ASCII and modern Hangul syllables.
      const basic = !!text && plainSvg && !/[^\u0020-\u007e\uac00-\ud7a3]/u.test(text) && !node.closest(styledText);
      append(values, node.getAttribute('font-family')!, basic);
    }
    entry.values = values; entry.dirty = false;
  }
  return entry.values;
}
/** Synchronous snapshot of descendant attribute values in exact DOM order.
 * SVG subtrees keep only compressed strings and a weakly owned observer.
 * HTML/overlay branches and root ordering are reread on every invocation. */
export function fontFamilyValues(root: Element): readonly FamilyUse[] {
  const values: FamilyUse[] = [];
  const visit = (node: Element) => {
    if (node.namespaceURI === SVG && node.localName === 'svg') {
      for (const value of svgValues(node)) append(values, value.value, value.basicRegularText);
      return;
    }
    if (node.matches('[font-family]')) append(values, node.getAttribute('font-family') ?? '', false);
    for (const child of node.children) visit(child);
  };
  // The old root.querySelectorAll excludes root itself; keep that contract.
  for (const child of root.children) visit(child);
  return values;
}
