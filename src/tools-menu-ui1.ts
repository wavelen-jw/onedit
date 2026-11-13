import { mountDropdownKeys } from "./workspace-menu-navigation.js";

// UI1-Z-MENU-TOOLS-EXPANDED: rehost existing U24 launchers only. The native
// settings dialog/substates were not captured; retain the existing limited UI.
export function mountToolsMenuUI1(root: HTMLDetailsElement, blocked: () => boolean) {
  const doc = root.ownerDocument, panel = root.querySelector<HTMLElement>(":scope>div")!;
  const old = [...panel.querySelectorAll<HTMLButtonElement>(":scope>button")];
  const spelling = old.find(b => b.dataset.menuScopeId === "U01")!;
  const macro = old.find(b => b.dataset.menuScopeId === "U11")!;
  const environment = old.find(b => b.textContent?.startsWith("환경 설정"))!;
  const settings = old.find(b => b.dataset.menuScopePart === "menu-settings")!;
  const shortcuts = old.find(b => b.dataset.menuScopePart === "shortcut-settings")!;
  const toolbar = old.find(b => b.dataset.menuScopePart === "toolbar-settings")!;
  panel.replaceChildren(); panel.classList.add("ui1-tools-panel");
  const separator = () => { const hr = doc.createElement("hr"); hr.setAttribute("role","separator"); panel.append(hr); };
  const row = (letter: string, label: string, shortcut = "", arrow = false, source?: HTMLButtonElement) => {
    const b = source ?? doc.createElement("button"); b.type = "button";
    if (!source) b.dataset.toolsRootOnly = "true";
    if (!source) b.dataset.menuPlaceholder="permanent";
    if(source===environment){delete b.dataset.menuPlaceholder;b.dataset.localFontSettings='';}
    b.textContent = label; b.dataset.toolsEntry = letter; b.dataset.menuLetter = letter; b.setAttribute("role","menuitem");
    if (source !== settings) {
      b.disabled = true;
      b.title ||= "현재 기존 편집 기능에 연결되지 않은 항목입니다. 문서와 설정은 유지합니다.";
      b.setAttribute("aria-disabled","true"); b.setAttribute("aria-description",b.title);
      if (!source) {
        const state = doc.createElement("span"); state.dataset.toolsAvailability = "";
        state.textContent = " · 미연결";
        b.append(state);
      }
    }
    if (shortcut) { const k = doc.createElement("kbd"); k.textContent = shortcut; b.append(k); }
    if (arrow) { const a = doc.createElement("span"); a.className = "tools-submenu-hint"; a.textContent = "›"; a.setAttribute("aria-hidden","true"); b.append(a); }
    panel.append(b); return b;
  };
  row("s","맞춤법(S)…","F8",false,spelling); row("h","한컴 사전(H)…","F12");
  row("j","한자 사전(J)…","Shift+F9"); row("t","유의어/반의어 사전(T)…","Ctrl+F12");
  row("b","번역(B)","",true); row("q","빠른 교정(Q)","",true); separator();
  row("d","한컴 애셋(D)…"); row("g","무엇이든 3줄 요약(G)"); separator();
  row("m","메일 머지(M)","",true); row("r","스크립트 매크로(R)","",true,macro);
  row("c","차례/색인(C)","",true); row("i","참고 문헌(I)","",true);
  row("l","블록 계산(L)","",true); row("f","문서 찾기(F)…"); row("e","개인 정보 바꾸기(E)","",true); separator();
  row("p","프레젠테이션(P)","",true); separator(); row("1","오피스 톡(1)"); separator();
  row("k","글자판(K)","",true); separator(); row("a","추가 기능 설정(A)…");
  row("z","사용자 설정(Z)…","",false,settings); settings.id = "tools-user-settings";
  settings.dataset.ui1Label = "사용자 설정(Z)…";
  row("u","환경 설정(U)…","",false,environment); row("n","스킨 설정(N)…");
  // Preserve the existing explicit shortcut entry and excluded toolbar notice.
  // These extra rows do not claim an observed native submenu/dialog layout.
  separator(); shortcuts.id = "tools-shortcut-settings"; shortcuts.setAttribute("role","menuitem"); panel.append(shortcuts,toolbar);
  mountDropdownKeys(root,blocked);
}
