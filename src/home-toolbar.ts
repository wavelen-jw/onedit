/** Word 365 Windows Home relative order, using Edit's original controls only.
 * Complete quick forms keep their draft/owner contracts; no command is copied.
 * Missing/excluded Word features are not introduced by this presentation. */
export function mountHomeToolbar(doc: Document) {
  const bar = doc.getElementById("format-bar"), form = doc.getElementById("quick-format"),
    icons = bar?.querySelector<HTMLElement>(".quick-format-icons"), clipboard = doc.getElementById("edit-tools");
  if (!bar || !form || !icons || !clipboard || bar.dataset.homeOrder) return;
  const locations = [...bar.childNodes, clipboard, ...clipboard.children, ...form.children, ...icons.children]
    .map(node => ({node, parent: node.parentNode!, next: node.nextSibling}));
  const originalButtons = [...clipboard.querySelectorAll<HTMLButtonElement>("button"), ...icons.querySelectorAll<HTMLButtonElement>("button")]
    .map(button => ({button, text: button.textContent, label: button.getAttribute("aria-label"), type: button.getAttribute("type")}));
  bar.dataset.homeOrder = "word365-windows";
  bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "홈 도구모음");
  const group = (id: string, label: string) => {
    const node = doc.createElement("div"); node.className = "home-toolbar-group";
    node.dataset.homeGroup = id; node.setAttribute("role", "group"); node.setAttribute("aria-label", label); return node;
  };
  const font = group("font", "글꼴"), paragraph = group("paragraph", "문단"),
    editing = group("editing", "편집"), extras = group("edit", "Edit 도구");
  const previousGroup = clipboard.closest<HTMLElement>(".tool-group");
  const previousHidden = previousGroup?.hidden;
  clipboard.classList.add("home-toolbar-group"); clipboard.dataset.homeGroup = "clipboard";
  clipboard.setAttribute("aria-label", "클립보드");
  // Same mirrors, same capture/invoke listeners, source disabled reasons and keys.
  const labels: Record<string, string> = {paste:"붙이기",cut:"오려두기",copy:"복사", "format-copy":"모양 복사",find:"찾기",replace:"바꾸기",all:"전체 선택",delete:"지우기"};
  for (const id of ["paste", "cut", "copy", "format-copy", "find", "replace", "all", "delete"]) {
    const button = clipboard.querySelector<HTMLButtonElement>(`[data-edit-tool="${id}"]`);
    if (!button) continue;
    // Keep full authoritative source label/shortcut available to assistive tech.
    button.setAttribute("aria-label", button.textContent || labels[id]);
    button.textContent = labels[id];
    if (["find", "replace", "all", "delete"].includes(id)) button.hidden = true;
    (id === "find" || id === "replace" || id === "all" || id === "delete" ? editing : clipboard).append(button);
  }
  font.append(form);
  const fontLabel = form.querySelector('[name="quickFont"]')?.closest("label"),
    sizeLabel = form.querySelector('[name="quickSize"]')?.closest("label"),
    language = form.querySelector('[name="quickLanguage"]')?.closest("label"),
    apply = form.querySelector('button[type="submit"]'), color = form.querySelector(".text-color-split");
  // Font/size, B/I/U/strike, color; Edit's draft Apply and language scope remain.
  for (const node of [fontLabel, sizeLabel, apply, icons, color, language]) if (node) form.append(node);
  for (const {node} of locations.filter(row => row.parent === form))
    if (![fontLabel, sizeLabel, apply, color, language].includes(node as Element)) form.append(node);
  icons.setAttribute("aria-label", "글자 효과");
  const align = doc.createElement("span"); align.className = "quick-format-icons";
  align.setAttribute("role", "group"); align.setAttribute("aria-label", "문단 정렬");
  for (const value of ["left", "center", "right", "justify"]) {
    const button = icons.querySelector(`[data-align="${value}"]`); if (button) align.append(button);
  }
  paragraph.append(align);
  const spacing = doc.getElementById("quick-paragraph"); if (spacing) paragraph.append(spacing);
  // Edit's extra alignment modes follow the corresponding Word controls.
  for (const value of ["distribute", "split"]) {
    const button = icons.querySelector(`[data-align="${value}"]`); if (button) align.append(button);
  }
  // These independent actions used to leave the quick form and cancel its draft.
  // Preserve that boundary after relocation, including keyboard entry. Never
  // let an original default-submit button implicitly apply an unrelated draft.
  for (const button of icons.querySelectorAll<HTMLButtonElement>("button")) {
    button.type = "button";
  }
  icons.dataset.quickIndependent = "";
  // The remainder (including hidden context proxies) stays reachable as before.
  for (const node of [...bar.children]) if (![form, icons, spacing, clipboard].includes(node as HTMLElement)) extras.append(node);
  bar.append(clipboard, font, paragraph, editing, extras);
  // Only a now-empty drawer presentation is hidden, never an Edit command/menu.
  if (previousGroup && !previousGroup.querySelector("button,input,select,details")) previousGroup.hidden = true;
  return {dispose() {
    for (const {node, parent, next} of locations.reverse()) parent.insertBefore(node, next?.parentNode === parent ? next : null);
    for (const {button, text, label, type} of originalButtons) {
      // Alignment/strike SVGs are owned by quick-format, not text mirrors.
      if (button.dataset.editTool) button.textContent = text;
      if (label === null) button.removeAttribute("aria-label"); else button.setAttribute("aria-label", label);
      if (type === null) button.removeAttribute("type"); else button.setAttribute("type", type);
    }
    for (const node of [font, paragraph, editing, extras]) node.remove();align.remove();
    clipboard.classList.remove("home-toolbar-group");delete clipboard.dataset.homeGroup;
    clipboard.setAttribute("aria-label", "클립보드·선택·찾기");icons.setAttribute("aria-label", "기본 글자·문단 서식");delete icons.dataset.quickIndependent;
    if (previousGroup) previousGroup.hidden = previousHidden!;
    delete bar.dataset.homeOrder;bar.removeAttribute("role");bar.setAttribute("aria-label", "서식 도구 상자");
  }};
}
