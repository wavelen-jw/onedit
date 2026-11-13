export type DialogShortcut = readonly [key: string, label: string];

export function appendDialogShortcutHelp(
  root: HTMLElement, groups: readonly (readonly [string, readonly DialogShortcut[]])[],
) {
  const doc = root.ownerDocument;
  const detail = doc.createElement("details");
  detail.className = "dialog-supported-more";
  const summary = doc.createElement("summary");
  summary.textContent = "대화상자 단축키";
  detail.append(summary);
  for (const [name, keys] of groups) {
    const list = doc.createElement("p");
    const heading = doc.createElement("strong");
    heading.textContent = name;
    list.append(heading, " — ");
    for (const [index, [key, label]] of keys.entries()) {
      if (index) list.append(" · ");
      const kbd = doc.createElement("kbd");
      kbd.textContent = "Alt+" + key.toUpperCase();
      list.append(kbd, " " + label);
    }
    detail.append(list);
  }
  root.append(detail);
}
