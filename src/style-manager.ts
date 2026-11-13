import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import { stylesUnavailable } from "./style-availability.js";

/** Preserve caller lifecycle without mounting or offering a style manager. */
export function mountStyleManager(_root: HTMLElement, _editor: Interaction, _actions: {
  busy: () => boolean;
  execute: (command: Command, captured: ReturnType<Interaction["capture"]>) => void;
  changed: () => void;
  focus: () => void;
}) {
  return { get open() { return false; }, show() { throw Error(stylesUnavailable); }, sync() {} };
}
