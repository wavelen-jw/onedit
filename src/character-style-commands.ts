import type { Command } from "./model.js";

type CharacterStyle = "bold" | "italic" | "underline" | "strikethrough"
  | "superscript" | "subscript" | "normal" | "char-normal";

const shortcutStyles: ReadonlyMap<string, CharacterStyle> = new Map([
  ["b", "bold"], ["i", "italic"], ["u", "underline"],
  ["p", "superscript"], ["s", "subscript"],
]);

// The menu and keyboard keep their own target and shortcut admission rules.
export function characterStyleCommand(style: CharacterStyle): Command {
  switch (style) {
    case "bold":
    case "underline":
      return { type: style };
    case "italic":
    case "strikethrough":
      return { type: "toggle-char", property: style };
    case "superscript":
    case "subscript":
    case "normal":
      return { type: "script", mode: style };
    case "char-normal":
      return {
        type: "char",
        props: {
          bold: false, italic: false, underline: false, underlineType: "None",
          strikethrough: false, superscript: false, subscript: false,
          outlineType: 0, shadowType: 0, emboss: false, engrave: false,
        },
      };
  }
}

export function characterStyleShortcut(letter: string): Command | undefined {
  const style = shortcutStyles.get(letter);
  return style && characterStyleCommand(style);
}
