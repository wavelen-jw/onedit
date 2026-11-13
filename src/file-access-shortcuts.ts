import type { KeyInput } from "./keyboard.js";

// Published Han/word 2024 file keys; no new file or OS operation.
export const fileAccessShortcuts = [
  {id: "new", code: "KeyN", shortcut: "", menuKeys: ""},
  {id: "open", code: "KeyO", shortcut: "Alt+O", menuKeys: "Ctrl+O / Alt+O"},
  {id: "save", code: "KeyS", shortcut: "Alt+S", menuKeys: "Ctrl+S / Alt+S"},
  {id: "save-as", code: "KeyV", shortcut: "Alt+V", menuKeys: "Ctrl+Shift+S / Alt+V"},
] as const;

export function fileAccessShortcut(e: KeyInput) {
  if (e.isComposing || e.keyCode === 229 || e.altGraph || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  return fileAccessShortcuts.find(item => item.shortcut && item.code === e.code)?.id;
}
