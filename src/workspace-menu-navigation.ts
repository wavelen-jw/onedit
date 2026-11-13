import {activeWorkset} from "./active-workset.js";
// Keyboard presentation of the existing main-menu entries. No command dispatch,
// document selection or History lives here; native fields and nested owners keep
// their own keys. WorkspaceAccess still owns Alt/F10 entry.
export function mountMainMenuNavigation(menu: HTMLElement, blocked: () => boolean,
  openMenu: (id: string) => void) {
  const focus = (element?: HTMLElement) => {
    element?.focus({preventScroll: true});
    element?.scrollIntoView({block: "nearest", inline: "nearest"});
  };
  const items = (root: HTMLDetailsElement) =>
    [...root.querySelectorAll<HTMLElement>("button:not(:disabled),summary")].filter(item => {
      const owner = item.tagName === "SUMMARY"
        ? item.parentElement?.parentElement?.closest("details") : item.closest("details");
      // A notice-only subtree (for example the non-provided style UI) is
      // not an executable submenu. Keep supported nested entries reachable.
      const actionable = item.tagName !== "SUMMARY" || !!item.parentElement?.querySelector("button:not(:disabled),input:not(:disabled),select:not(:disabled)");
      return actionable && owner === root && !item.hidden && item.getAttribute("aria-disabled") !== "true" && !!item.getClientRects().length;
    });
  const key = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const target = e.target;
    if (!(target instanceof HTMLElement) || target.closest("input,select,textarea,[contenteditable=true]")) return;
    const root = target.closest<HTMLDetailsElement>("details");
    // Nested menus retain the existing owner-specific keyboard contracts.
    if (!root || root.parentElement !== menu || !["BUTTON", "SUMMARY"].includes(target.tagName)) return;
    const keys = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (blocked()) return;
    const summary = root.querySelector<HTMLElement>(":scope > summary")!;
    if ((target === summary && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) ||
        (target !== summary && ["ArrowLeft", "ArrowRight"].includes(e.key))) {
      const entries = [...menu.querySelectorAll<HTMLDetailsElement>(":scope > details")]
        .filter(d => !d.hidden && !!d.getClientRects().length);
      const index = entries.indexOf(root);
      if (index < 0) return;
      const next = e.key === "Home" ? 0 : e.key === "End" ? entries.length - 1
        : (index + (e.key === "ArrowLeft" ? -1 : 1) + entries.length) % entries.length;
      const destination = entries[next];
      if (root.open || target !== summary) {
        openMenu(destination.id);
        if (destination.open) focus(target === summary
          ? destination.querySelector<HTMLElement>(":scope > summary")! : items(destination)[0] ?? destination.querySelector<HTMLElement>(":scope > summary")!);
      } else focus(destination.querySelector<HTMLElement>(":scope > summary")!);
      return;
    }
    if (target === summary && !root.open) {
      // Arrow navigation focuses its first result in the same call. A queued
      // details toggle cannot prepare the demand-scoped format menu in time.
      if (activeWorkset(root.ownerDocument) || root.id === "format-menu" || root.id === "table-menu") root.dispatchEvent(new Event("rhwp:menu-opening"));
      root.open = true;
    }
    const choices = items(root), index = choices.indexOf(target);
    const next = e.key === "Home" || target === summary && e.key === "ArrowDown" ? 0
      : e.key === "End" || target === summary && e.key === "ArrowUp" ? choices.length - 1
      : (index + (e.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length;
    focus(choices[next] ?? summary);
  };
  // Capture before legacy per-menu Escape/selection listeners. Enter, Escape,
  // Tab and all mutation shortcuts remain with their existing owners.
  menu.addEventListener("keydown", key, true);
  return () => menu.removeEventListener("keydown", key, true);
}

// File and Edit share dropdown-only letter/outside behavior. These events do
// not own editor shortcuts, selection, Commands, native fields or composition.
export function localMenuLetter(e: KeyboardEvent): HTMLButtonElement | undefined {
  if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.repeat ||
      e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.getModifierState("AltGraph") ||
      !(e.target instanceof HTMLElement) || e.target.closest("input,textarea,select,[contenteditable=true]")) return;
  const root = e.target.closest<HTMLDetailsElement>("details[open][data-dropdown-letters]");
  return root ? [...root.querySelectorAll<HTMLButtonElement>("button[data-menu-letter]")]
    .find(button => button.closest("details") === root && !!button.getClientRects().length &&
      button.dataset.menuLetter === e.key.toLowerCase()) : undefined;
}
export function mountDropdownKeys(root: HTMLDetailsElement, blocked: () => boolean) {
  root.dataset.dropdownLetters = "true";
  const summary = root.querySelector("summary")!;
  const panel = root.querySelector<HTMLElement>(":scope > div")!;
  panel.id ||= root.id + "-panel";
  panel.setAttribute("role", "menu"); panel.setAttribute("aria-label", summary.textContent ?? "");
  summary.setAttribute("aria-haspopup", "menu"); summary.setAttribute("aria-controls", panel.id);
  const toggle = () => summary.setAttribute("aria-expanded", String(root.open));
  const key = (e: KeyboardEvent) => {
    const button = localMenuLetter(e); if (!button) return;
    e.preventDefault(); e.stopPropagation();
    if (!button.disabled && !blocked()) button.click();
  };
  const outside = (e: PointerEvent) => {
    if (root.open && e.target instanceof Node && !root.contains(e.target)) root.open = false;
  };
  toggle(); root.addEventListener("toggle", toggle); root.addEventListener("keydown", key);
  if(!root.closest("#main-menu"))root.ownerDocument.addEventListener("pointerdown", outside);
  return () => { root.removeEventListener("toggle", toggle); root.removeEventListener("keydown", key);
    root.ownerDocument.removeEventListener("pointerdown", outside); };
}
