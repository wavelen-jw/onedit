// Raw DOM font-family attributes only, never source font identity, availability,
// glyph coverage, Core measurements or a document/revision receipt.
const SVG = 'http://www.w3.org/2000/svg';
type FamilyUse = { value: string; basicRegularText: boolean };
type Summary = { values: FamilyUse[]; dirty: boolean; observer: MutationObserver; regularGlyph?: Element };
const summaries = new WeakMap<Element, Summary>();
function append(values: FamilyUse[], value: string, basicRegularText: boolean) {
  const previous = values[values.length - 1];
  if (previous?.value === value) previous.basicRegularText &&= basicRegularText;
  else values.push({value, basicRegularText});
}

const fontAttributes = ['font-family', 'font-weight', 'font-style', 'font-stretch', 'class', 'style'];
const styleAttributes = fontAttributes.slice(1);
const basicText = /^[\u0020-\u007e\uac00-\ud7a3]+$/u;
const styledText = styleAttributes.map(name => `svg [${name}]`).join(',');
// A surviving glyph proves a uniform page still uses its original family.
// Handle only flat regular-glyph edits in drawing groups; arbitrary subtrees,
// attributes, complex text or loss of that witness require a fresh snapshot.
function observeFontChanges(svg: Element, entry: Summary, changes: MutationRecord[]) {
  if (!changes.length || entry.dirty) return;
  const glyph = entry.regularGlyph;
  if (glyph && svg.contains(glyph) && !svg.closest(styledText) && changes.every(change => {
    const parent = change.target as Element;
    if (change.type !== 'childList' || parent.namespaceURI !== SVG || parent.localName !== 'g') return false;
    for (const node of change.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) continue;
      const leaf = node as Element;
      if (leaf.namespaceURI !== SVG || leaf.localName !== 'text' || leaf.childElementCount ||
          leaf.getAttribute('font-family') !== entry.values[0].value ||
          styleAttributes.some(name => leaf.hasAttribute(name)) || !basicText.test(leaf.textContent ?? '')) return false;
    }
    return true;
  })) return;
  entry.dirty = true;
  entry.regularGlyph = undefined;
}
function svgValues(svg: Element): readonly FamilyUse[] {
  let entry = summaries.get(svg);
  if (!entry) {
    entry = { values: [], dirty: true, observer: undefined as unknown as MutationObserver };
    const current = entry;
    current.observer = new MutationObserver(records => observeFontChanges(svg, current, records));
    current.observer.observe(svg, {attributeFilter: fontAttributes, characterData: true, childList: true, subtree: true});
    summaries.set(svg, current);
  }
  observeFontChanges(svg, entry, entry.observer.takeRecords());
  if (entry.dirty) {
    const values: FamilyUse[] = [];
    const plainSvg = !svg.querySelector('style,use') &&
      !styleAttributes.some(name => svg.hasAttribute(name));
    // A plain page needs no ancestor walk per glyph. Include outer SVG groups
    // when the supplied SVG is itself nested in a styled drawing.
    const mayHaveStyledText = plainSvg && (svg.closest(styledText) !== null || svg.querySelector(styledText) !== null);
    if (svg.hasAttribute('font-family')) append(values, svg.getAttribute('font-family')!, false);
    const members = svg.querySelectorAll('[font-family]');
    for (const node of members) {
      const text = node.localName === 'text' && !node.childElementCount ? node.textContent : '';
      // Both pinned regular HCR files cover printable ASCII and modern Hangul syllables.
      const basic = plainSvg && basicText.test(text) &&
        (!mayHaveStyledText || !node.closest(styledText));
      append(values, node.getAttribute('font-family')!, basic);
    }
    entry.regularGlyph = !mayHaveStyledText && values.length === 1 && values[0].basicRegularText
      ? members[0] : undefined;
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
