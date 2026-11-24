import type { Command, Selection } from "./model.js";

export function lineBreakCommand(soft = false): Extract<Command, {type: "break"}> {
  return soft ? { type: "break", soft: true } : { type: "break" };
}

export function forwardDeleteCommand(selection: Selection): Command {
  return selection.kind === "cells"
    ? { type: "clear-cells" }
    : { type: "delete", backward: false };
}
