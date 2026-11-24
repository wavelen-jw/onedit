export function dialogUnit(control:HTMLInputElement|HTMLSelectElement|undefined,unit:string){
 if(!control)return;const span=document.createElement('span');span.className='dialog-unit';span.textContent=unit;control.after(span);
}

/** Check the live dialog elements without searching every document-page SVG. */
export function hasOpenDialog(doc: Document, exceptId?: string): boolean {
  const dialogs = doc.getElementsByTagNameNS("*", "dialog");
  for (let i = 0, n = dialogs.length; i < n; i++) {
    const dialog = dialogs[i];
    if (dialog.hasAttribute("open") && dialog.id !== exceptId) return true;
  }
  return false;
}


export function heldMenuItem(doc: Document, label: string, reason: string, letter: string,
  key: string, arrowClass: string | undefined) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.disabled = true;
  button.textContent = label;
  button.title = reason;
  button.dataset.menuLetter = letter;
  button.setAttribute('role', 'menuitem');
  button.setAttribute('aria-disabled', 'true');
  button.setAttribute('aria-description', reason);
  if (key) {
    const kbd = doc.createElement('kbd');
    kbd.textContent = key;
    button.append(kbd);
  }
  if (arrowClass) {
    const arrow = doc.createElement('span');
    arrow.className = arrowClass;
    arrow.textContent = '›';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(arrow);
  }
  return button;
}
