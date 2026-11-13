import { menuScope, type ScopePart } from './menu-scope.js';

// Exact reviewed presentation identities, not label matching, capability guesses,
// or a filter on unimplemented/deferred commands. Data/command code stays intact.
export const excludedMenuBindings: readonly { ids: readonly string[]; selector: string }[] = [
  {ids:['V11'], selector:'[data-view-held="c"]'},
  {ids:['V16'], selector:'[data-outline-toggle]'},
  {ids:['HK087'], selector:'[data-view-held="a"]'},
  {ids:['N08'], selector:'#style-menu, .style-unavailable, [data-format-held="s"], [data-table-context-format="styles"], [data-format-action="styles-manage"]'},
  {ids:['N09'], selector:'[data-format-held="y"]'},
  {ids:['I03'], selector:'#picture-menu [data-insert-held="r"], [data-picture-context-action="register"], [data-shape-context-action="register"]'},
  {ids:['I04'], selector:'#picture-menu [data-insert-held="p"]'},
  {ids:['I05'], selector:'#picture-menu [data-insert-held="a"], [data-picture-context-action="ocr"]'},
  {ids:['I07'], selector:'#insert-menu > div > [data-insert-held="j"]'},
  {ids:['I09'], selector:'#insert-menu > div > [data-insert-held="r"]'},
  {ids:['I13'], selector:'#insert-menu > div > [data-insert-held="o"]'},
  {ids:['I17'], selector:'#insert-menu > div > [data-insert-held="l"]'},
  {ids:['I28','I29','I30'], selector:'#insert-menu > div > [data-insert-held="d"]'},
  {ids:['I31'], selector:'#insert-menu > div > [data-insert-held="a"]'},
  {ids:['I32'], selector:'#insert-menu > div > [data-insert-held="f"]'},
  {ids:['I36'], selector:'#insert-menu > div > [data-insert-held="e"]'},
  {ids:['I37'], selector:'#insert-menu > div > [data-insert-held="b"]'},
  {ids:['I38'], selector:'#insert-menu > div > [data-insert-held="y"], [data-picture-context-action="hyperlink"], [data-shape-context-action="hyperlink"]'},
  {ids:['L02'], selector:'[data-page-held="c"]'},
  {ids:['L14'], selector:'[data-page-held="e"]'},
  {ids:['L15'], selector:'[data-page-held="s"]'},
  {ids:['L16'], selector:'[data-page-held="a"]'},
  {ids:['L17'], selector:'[data-page-held="l"]'},
  {ids:['U01'], selector:'[data-tools-entry="s"]'},
  {ids:['U02'], selector:'[data-tools-entry="h"]'},
  {ids:['U03'], selector:'[data-tools-entry="j"]'},
  {ids:['U04'], selector:'[data-tools-entry="t"]'},
  {ids:['U05'], selector:'[data-tools-entry="b"]'},
  {ids:['U06','U07','U08'], selector:'[data-tools-entry="q"]'},
  {ids:['U09'], selector:'[data-tools-entry="d"]'},
  {ids:['U10'], selector:'[data-tools-entry="m"]'},
  {ids:['U11','U12'], selector:'[data-tools-entry="r"]'},
  {ids:['U13','U14','U15'], selector:'[data-tools-entry="c"]'},
  {ids:['U16'], selector:'[data-tools-entry="i"]'},
  {ids:['U18'], selector:'[data-tools-entry="f"]'},
  {ids:['U19'], selector:'[data-tools-entry="e"]'},
  {ids:['U20'], selector:'[data-tools-entry="p"]'},
  {ids:['U23'], selector:'[data-tools-entry="a"]'},
  {ids:['HK230','HK231','HK232','HK233'], selector:'[data-tools-entry="k"]'},
  {ids:['HK323'], selector:'#workspace-help-menu'},
];

/** Once, after the existing surfaces and owners are connected, before overflow
 * captures controls. Removing a presentation never mutates Core or preferences. */
export function removeExcludedMenuEntries(doc: Document) {
  const removed: { ids: readonly string[]; location: string; label: string }[] = [];
  const remove = (node: Element, ids: readonly string[], location: string) => {
    removed.push({ids, location, label: node.textContent?.trim() ?? ''});
    node.remove();
  };
  for (const node of doc.querySelectorAll<HTMLElement>('[data-menu-scope-id]')) {
    const id = node.dataset.menuScopeId!;
    if (menuScope(id, node.dataset.menuScopePart as ScopePart) === 'excluded')
      remove(node, [id], `[data-menu-scope-id="${id}"]${node.dataset.menuScopePart ? `[data-menu-scope-part="${node.dataset.menuScopePart}"]` : ''}`);
  }
  for (const {ids, selector} of excludedMenuBindings) {
    if (!ids.every(id => menuScope(id) === 'excluded')) continue;
    for (const node of doc.querySelectorAll(selector)) remove(node, ids, selector);
  }
  // Explicitly inert presentation placeholders, not context-disabled commands.
  // Memo and menu/shortcut settings carry retained scope and are never filtered.
  for(const node of doc.querySelectorAll<HTMLButtonElement>('#main-menu [data-menu-placeholder="permanent"]')){
    if(!node.disabled||node.dataset.menuScope==='retained')continue;
    const note=node.nextElementSibling;if(note?.tagName==='SMALL')note.remove();
    remove(node,[], '[data-menu-placeholder="permanent"]');
  }
  // Only the menu surfaces affected above. Retained disabled entries count as
  // content; they are not removed just because they cannot execute yet.
  const roots = '#main-menu, #toolbar, #table-context-menu, #picture-context-menu, #shape-context-menu';
  for (const root of doc.querySelectorAll(roots)) {
    for (const details of [...root.querySelectorAll('details')].reverse()) {
      if (!details.querySelector('button, input, select, textarea, a, details')) details.remove();
    }
    for (const hr of [...root.querySelectorAll('hr')]) {
      if (!hr.previousElementSibling || !hr.nextElementSibling || hr.previousElementSibling.tagName === 'HR') hr.remove();
    }
    for (const first of root.querySelectorAll(':scope > button:first-child.object-menu-separator')) first.classList.remove('object-menu-separator');
  }
  // A category with no remaining actions is not an empty menu button.
  for(const root of [...doc.querySelectorAll<HTMLDetailsElement>('#main-menu>details')]){
    if(!root.querySelector('button,input,select,textarea,a'))root.remove();
  }
  return removed;
}
