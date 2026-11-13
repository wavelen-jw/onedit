import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import type { CatalogCommand } from "./integration/a-format-menu.js";
import { hancomScriptCycle } from "./hancom-key-links.js";

// UI intent lowering only. Interaction keeps its separate captured-target aliases.
export function lowerMenuCommand(
  editor: Interaction,
  command: CatalogCommand,
): Command {
  if(command.type==='script-cycle')command=hancomScriptCycle(editor);
  if (command.type === "toggle-char")
    return {
      type: "char",
      props: {
        [command.property]:
          editor.formatState("char")[command.property] !== true,
      },
    };
  if (command.type === "underline")
    return {
      type: "char",
      props: { underline: editor.formatState("char").underline !== true },
    };
  if (command.type === "script")
    return {
      type: "char",
      props: {
        superscript: command.mode === "superscript",
        subscript: command.mode === "subscript",
      },
    };
  return command;
}
