// A narrow presentation update, never a document edit or a second SVG parser.
// The caller owns the validated, unmodified SVG and its exact original markup.
// All source bytes outside literal Hangul text must still match Core output.
export function updateHangulSvgText(svg: SVGSVGElement, before: string, after: string): boolean {
  // Relocated editor labels change DOM text order. Keep the full validated
  // parser path instead of applying Core-order text patches to that projection.
  if (svg.querySelector('[data-control-label]')) return false;
  // Comments/CDATA/DTD/processing instructions can contain apparent text tags.
  // They remain on the ordinary XML parser/validation path.
  if (before.includes("<!") || after.includes("<!") || before.includes("<?") || after.includes("<?")) return false;
  const pattern = /(<text(?=\s|>)(?:"[^"]*"|'[^']*'|[^'">])*?>)([^<]*)(<\/text\s*>)/g;
  const oldPattern = new RegExp(pattern), newPattern = new RegExp(pattern);
  const changes: { index: number; before: string; after: string }[] = [];
  let oldEnd = 0, newEnd = 0, count = 0;
  for (;;) {
    const old = oldPattern.exec(before), next = newPattern.exec(after);
    if (!old || !next) {
      if (old || next) return false;
      break;
    }
    const oldStart = old.index + old[1].length, newStart = next.index + next[1].length;
    if (before.slice(oldEnd, oldStart) !== after.slice(newEnd, newStart)) return false;
    if (old[2] !== next[2]) {
      // Literal same-length Hangul cannot introduce XML syntax/entities or
      // change logical character count. Geometry/style are in the exact bytes.
      if (old[2].length !== next[2].length ||
          !/^[\u3131-\u318e\uac00-\ud7a3]+$/.test(old[2]) ||
          !/^[\u3131-\u318e\uac00-\ud7a3]+$/.test(next[2])) return false;
      changes.push({ index: count, before: old[2], after: next[2] });
    }
    oldEnd = oldStart + old[2].length;
    newEnd = newStart + next[2].length;
    count++;
  }
  if (!changes.length || before.slice(oldEnd) !== after.slice(newEnd)) return false;
  const nodes = svg.querySelectorAll("text");
  if (nodes.length !== count) return false;
  // Validate every target before the first write. Sanitized/complex text that
  // cannot be bound one-to-one uses the full path, without a partial mutation.
  for (const change of changes) {
    const node = nodes[change.index];
    if (node.namespaceURI !== "http://www.w3.org/2000/svg" || node.childNodes.length !== 1 ||
        node.firstChild?.nodeType !== Node.TEXT_NODE || node.textContent !== change.before) return false;
  }
  for (const change of changes) (nodes[change.index].firstChild as Text).data = change.after;
  return true;
}
