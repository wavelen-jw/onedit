/** Private presentation ownership for original toolbar controls moved to overflow.
 * Native form association and draft/IME ownership survive; no copied controls/events. */
const owners = new WeakMap<HTMLElement, HTMLFormElement>();
export function toolbarFormContains(form: HTMLFormElement, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (form.contains(target)) return true;
  for (let p: Node | null = target; p && p !== form.ownerDocument; p = p.parentNode)
    if (p instanceof HTMLElement && owners.get(p) === form) return true;
  return false;
}
export function bindToolbarFormView(node: HTMLElement, form: HTMLFormElement) {
  owners.set(node, form);
  const controls = [...node.querySelectorAll<HTMLElement>('button,input,select,textarea,output')];
  if (node.matches('button,input,select,textarea,output')) controls.unshift(node);
  const previous = controls.map(control => ({control, value: control.getAttribute('form')}));
  for (const {control} of previous) control.setAttribute('form', form.id);
  return () => {
    owners.delete(node);
    for (const {control,value} of previous)
      if (value === null) control.removeAttribute('form'); else control.setAttribute('form', value);
  };
}
