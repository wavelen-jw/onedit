import type { Interaction } from "./interaction.js";
import { menuControlDemanded } from "./menu-lifetime.js";

export const cellDialogCommand = "table:cell-props";
export type CellDialogMode = "properties" | "border-properties" | "block-border" | "block-background";
export type CellDialogTarget = ReturnType<Interaction["capture"]>;
export function cellDialogMode(id: string): CellDialogMode | undefined {
  switch (id) {
    case "properties": case "table:cell-props": return "properties";
    case "border-properties": case "table:border-each": return "border-properties";
    case "block-border": case "table:border-one": return "block-border";
    case "block-background": return "block-background";
  }
}
type Ports = {
  ownsClosingDialog?: () => boolean;
  reason: (mode: CellDialogMode) => string;
  open: (mode: CellDialogMode, expected?: CellDialogTarget, beforeShow?: () => void) => boolean;
};
const commands = new WeakMap<Document, ReturnType<typeof connectCellDialogCommand>>();
export function cellDialogFor(doc: Document) { return commands.get(doc); }

/** Presentation receipts never authorize execution. A publication is
 * synchronous and shares only one value per demanded property variant. */
export function connectCellDialogCommand(doc: Document, ports: Ports) {
  const buttons = new Map<HTMLButtonElement, { mode: CellDialogMode; title: string; describe: boolean }>();
  const api = {
    bind(button: HTMLButtonElement, mode: CellDialogMode, title: string, describe = false) {
      button.dataset.oneditCellCommand = cellDialogCommand;
      button.dataset.oneditCellMode = mode;
      buttons.set(button, { mode, title, describe });
      return () => buttons.delete(button);
    },
    publish(surface?: Element, readReason = ports.reason) {
      const reasons = new Map<"properties" | "block-border", string>();
      for (const [button, binding] of buttons) {
        if (!button.isConnected) continue;
        if (surface ? !surface.contains(button) : !menuControlDemanded(button)) continue;
        const key = binding.mode === "properties" || binding.mode === "border-properties" ? "properties" : "block-border";
        if (!reasons.has(key)) reasons.set(key, readReason(key));
        const reason = reasons.get(key)!, disabled = String(!!reason);
        if (button.disabled !== !!reason) button.disabled = !!reason;
        if (button.title !== (reason || binding.title)) button.title = reason || binding.title;
        if (button.getAttribute("aria-disabled") !== disabled) button.setAttribute("aria-disabled", disabled);
        if (binding.describe && button.getAttribute("aria-description") !== reason)
          button.setAttribute("aria-description", reason);
      }
    },
    ownsClosingDialog: () => ports.ownsClosingDialog?.() === true,
    reason: ports.reason,
    open: ports.open,
    dispose() {
      if (commands.get(doc) === api) commands.delete(doc);
      doc.removeEventListener("click", disclose, true);
      for (const button of buttons.keys()) {
        delete button.dataset.oneditCellCommand;
        delete button.dataset.oneditCellMode;
      }
      buttons.clear();
    },
  };
  // Native disclosure click occurs before its async toggle event. Prepare its
  // property buttons before focus can reach them (including toolbar overflow).
  doc.addEventListener("click", disclose, true);
  function disclose(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const summary = event.target.closest("summary");
    const details = summary?.parentElement;
    if (details instanceof HTMLDetailsElement && !details.open) api.publish(details);
  }
  commands.set(doc, api);
  return api;
}
