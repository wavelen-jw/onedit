/** Internal UI membership only, never editor state or geometry. Selectors must
 * be a union of self-only ID/attribute selectors (no ancestor/pseudo selectors).
 * Invalidate synchronously for matching subtree moves, insertion/removal and
 * relevant attribute changes. Nonmatching SVG edits do not change membership. */
export function observeSelectorMembership(root: Document | Element, selector: string, attributes: string[]) {
  let dirty = true;
  let nodes: Element[] = [];
  let members = new Set<Element>();
  const affects = (node: Node): boolean => node.nodeType === 1 &&
    ((node as Element).matches(selector) || (node as Element).querySelector(selector) !== null);
  const changed = (records: MutationRecord[]) => {
    if (dirty) return;
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target as Element;
        if (members.has(target) || target.matches(selector)) { dirty = true; return; }
      } else {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (affects(node)) { dirty = true; return; }
        }
      }
    }
  };
  const observer = new MutationObserver(changed);
  observer.observe(root, {subtree: true, childList: true, attributes: true, attributeFilter: attributes});
  return {
    read(): readonly Element[] {
      changed(observer.takeRecords());
      if (dirty) {
        nodes = Array.from(root.querySelectorAll(selector));
        members = new Set(nodes); dirty = false;
      }
      return nodes;
    },
    disconnect() { observer.disconnect(); nodes = []; members.clear(); dirty = true; },
  };
}
