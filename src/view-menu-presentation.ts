import { unavailableMenuButton } from "./menu-scope.js";
import { mountDropdownKeys } from "./workspace-menu-navigation.js";

// Presentation of existing view-only sources. No document/selection/History or
// new view option lives here. Native submenus are not available as references.
export function mountViewMenuPresentation(root: HTMLDetailsElement, busy: () => boolean) {
  const doc = root.ownerDocument, panel = root.querySelector<HTMLElement>("[data-view-panel]")!;
  const original = [...panel.children];
  const source = (id: string) => panel.querySelector<HTMLButtonElement>(`[data-view-action="${id}"]`)!;
  const marks = source("paragraph-marks").parentElement!;
  const windowGroup = source("horizontal-ruler").parentElement!;
  const zoomNodes = original.filter(node => node !== marks && node !== windowGroup && node !== source("sidebar"));
  const side = source("sidebar");
  const groups: {button: HTMLButtonElement; body: HTMLElement; focus?: HTMLElement}[] = [];
  panel.replaceChildren(); panel.classList.add("ui1-view-panel");
  for (const key of ["min-width", "padding", "right"]) panel.style.removeProperty(key);
  const separator = () => { const hr = doc.createElement("hr"); hr.setAttribute("role", "separator"); panel.append(hr); };
  const held = (key: string, label: string, reason: string, shortcut = "") => {
    const b = doc.createElement("button"); b.type = "button"; b.disabled = true;
    b.dataset.viewHeld = key; b.dataset.menuLetter = key; b.setAttribute("role", "menuitem");
    b.setAttribute("aria-disabled", "true"); b.title = reason + " 기존 문서는 유지합니다.";
    b.setAttribute("aria-description", b.title); b.append(label);
    if (shortcut) { const k = doc.createElement("kbd"); k.textContent = shortcut; b.append(k); }
    panel.append(b); return b;
  };
  const closeGroups = () => { for (const {button,body} of groups) { body.hidden = true; button.setAttribute("aria-expanded", "false"); } };
  const group = (key: string, id: string, label: string, nodes: Element[], focus?: HTMLElement) => {
    const button = doc.createElement("button"), body = doc.createElement("div"); button.type = "button";
    button.dataset.viewEntry = id; button.dataset.menuLetter = key; button.textContent = label;
    body.dataset.viewSlot = id;
    button.setAttribute("role", "menuitem"); button.setAttribute("aria-haspopup", "true");
    body.id = "view-section-" + id; body.className = "ui1-view-section"; body.hidden = true;
    body.setAttribute("role", "group"); body.setAttribute("aria-label", label);
    button.setAttribute("aria-controls", body.id); button.setAttribute("aria-expanded", "false");
    body.append(...nodes); panel.append(button,body); groups.push({button,body,focus});
    button.onclick = () => {
      if (busy() || button.disabled) return;
      const open = body.hidden; closeGroups(); body.hidden = !open; button.setAttribute("aria-expanded", String(open));
      if (open) (focus ?? body.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled)"))?.focus({preventScroll:true});
      else button.focus({preventScroll:true});
    };
    return button;
  };
  group("s", "zoom", "확대/축소(S)…", zoomNodes, zoomNodes.flatMap(n => [...n.querySelectorAll<HTMLInputElement>('input[aria-label="문서 배율 (%)"]')])[0]);
  const outline = held("a", "쪽 윤곽(A)", "쪽 윤곽 전환 명령은 연결되지 않았습니다.", "Ctrl+G,L");
  // The native checked state is not an implemented Edit outline toggle.
  outline.dataset.nativeObservedChecked = "true";
  separator();
  group("h", "marks", "표시/숨기기(H)", [...marks.children].filter(n => n.tagName !== "SUMMARY"));
  const memo = unavailableMenuButton(doc, "V07", "메모", "메모 표시 연결은 미지원입니다. 기존 문서의 메모는 제거하지 않습니다.");
  memo.textContent = "메모(E)"; memo.dataset.viewHeld = "e"; memo.dataset.menuLetter = "e"; memo.setAttribute("role", "menuitem"); panel.append(memo);
  held("p", "한자 발음(P)", "한자 발음 표시 명령은 연결되지 않았습니다.");
  held("g", "격자(G)", "격자 표시 명령은 연결되지 않았습니다.");
  held("d", "개체 이동 안내선(D)", "개체 이동 안내선 표시는 연결되지 않았습니다.");
  held("c", "컬러/회색조(C)", "컬러/회색조 화면 전환 명령은 연결되지 않았습니다."); separator();
  group("t", "toolbox", "도구 상자(T)", []);
  group("w", "sidebar", "작업 창(W)", [side]);
  group("n", "window", "문서 창(N)", [...windowGroup.children].filter(n => n.tagName !== "SUMMARY")); separator();
  held("b", "편집 화면 나누기(B)", "편집 화면 분할 명령은 연결되지 않았습니다.");
  held("o", "창 배열(O)", "문서 창 배열 명령은 제공하지 않습니다.");
  held("f", "창 목록(F)…", "다른 문서 창 전환 목록은 제공하지 않습니다."); separator();
  const current = held("1", "1 현재 문서", "현재 문서 정보만 표시하며 다른 창으로 전환하지 않습니다.");
  current.dataset.viewCurrentDocument = "true"; current.setAttribute("role", "menuitemcheckbox");
  const checks = [...panel.querySelectorAll<HTMLButtonElement>("[data-view-action]")]
    .filter(b => ["paragraph-marks","control-codes","transparent-borders","table-guides-selected","table-guides-hidden","horizontal-ruler","sidebar","actual","width","page"].includes(b.dataset.viewAction!));
  for (const b of checks) b.setAttribute("role", b.dataset.tableGuideMode?"menuitemradio":"menuitemcheckbox");
  mountDropdownKeys(root, busy);
  root.addEventListener("toggle", () => { if (!root.open) closeGroups(); });
  root.addEventListener("keydown", e => {
    if (e.key !== "Escape" || e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const active = groups.find(g => !g.body.hidden);
    if (!active) return;
    e.preventDefault(); e.stopImmediatePropagation(); closeGroups(); active.button.focus({preventScroll:true});
  });
  return { refresh(hasDocument: boolean) {
    const blocked = busy() || !hasDocument;
    for (const {button} of groups) {
      const unavailable = blocked || (button.dataset.viewEntry === "toolbox" && !panel.querySelector("[data-toolbox-view]"));
      button.disabled = unavailable; button.setAttribute("aria-disabled", String(unavailable));
      button.title = unavailable ? "입력·대화상자를 마치고 문서를 먼저 여세요." : "기존 지원 보기 명령 · 문서/이력 불변";
    }
    for (const b of checks) b.setAttribute("aria-checked", String(b.getAttribute("aria-pressed") === "true"));
    for (const b of panel.querySelectorAll<HTMLButtonElement>("[data-toolbox-view]")) {
      b.setAttribute("role", b.dataset.tableGuideMode?"menuitemradio":"menuitemcheckbox"); b.setAttribute("aria-checked", String(b.getAttribute("aria-pressed") === "true"));
    }
    current.setAttribute("aria-checked", String(hasDocument));
  } };
}
