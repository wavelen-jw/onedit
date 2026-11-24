import { pageScale } from "./integration/a-view-menu.js";

// Keyboard menus anchor to the caret or selected object's lower edge in page coordinates.
export function contextMenuAnchor(page: HTMLElement, x: number, bottom: number): [number, number] {
  const rect = page.getBoundingClientRect();
  const scale = pageScale(page, rect);
  return [rect.left + x * scale, rect.top + bottom * scale];
}

export function showContextMenuAt(popup: HTMLElement, x: number, y: number) {
  const view = popup.ownerDocument.defaultView!;
  const inset = 8;
  popup.hidden = false;
  // Measure at the same starting position even when reopening near the opposite edge.
  popup.style.left = popup.style.top = `${inset}px`;
  const box = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(inset, Math.min(x, view.innerWidth - box.width - inset))}px`;
  popup.style.top = `${Math.max(inset, Math.min(y, view.innerHeight - box.height - inset))}px`;
}

export function placeSubmenu(trigger: HTMLElement, root: HTMLElement, panel: HTMLElement) {
  const view = panel.ownerDocument.defaultView!;
  const inset = 8, gap = 1;
  const anchor = trigger.getBoundingClientRect();
  const menu = root.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  const right = menu.right + gap;
  const left = menu.left - box.width - gap;
  const fitsRight = right + box.width <= view.innerWidth - inset;
  const fitsLeft = left >= inset;
  let x = right, y = anchor.top;
  if (!fitsRight) {
    x = left;
    if (!fitsLeft) {
      // On narrow screens, keep the trigger clickable when either side
      // would place the submenu on top of it.
      x = anchor.left;
      const below = view.innerHeight - inset - anchor.bottom;
      const above = anchor.top - inset;
      y = below >= box.height + gap || below >= above
        ? anchor.bottom + gap : anchor.top - box.height - gap;
    }
  }
  panel.style.left = `${Math.max(inset, Math.min(x, view.innerWidth - box.width - inset))}px`;
  panel.style.top = `${Math.max(inset, Math.min(y, view.innerHeight - box.height - inset))}px`;
  return fitsRight || fitsLeft;
}
