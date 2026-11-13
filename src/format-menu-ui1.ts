import { browserShortcutScope } from "./browser-shortcut-scope.js";
import { mountDropdownKeys } from "./workspace-menu-navigation.js";
import { stylesUnavailable } from "./style-availability.js";
import { markFormatToggle } from "./format-value-state.js";

// UI1-Z-MENU-FORMAT-EXPANDED. Rehost the original buttons/handlers, not Commands.
// Extra supported entries remain reachable; their uncaptured submenu is not a
// claim of native visual parity. No native icons or assets are copied.
export function mountFormatMenuUI1(root: HTMLDetailsElement,
  buttons: Map<string, HTMLButtonElement>, actions: {
    blocked: () => boolean;
    fontCycle?: (direction:-1|1)=>void;
    fontState?: (direction:-1|1)=>string;
    objectState: () => { disabled: boolean; reason: string };
    openObject: () => void;
    openOutline: () => void;
    toggleList: (mode: "Number" | "Bullet" | "Outline") => void;
  }) {
  const doc = root.ownerDocument, panel = root.querySelector<HTMLElement>("[data-format-panel]")!;
  panel.classList.add("ui1-format-panel");
  const extra = doc.createElement("details"), summary = doc.createElement("summary"), more = doc.createElement("div");
  extra.id = "format-supported-menu"; summary.textContent = "기존 지원 서식 명령";
  more.id = "format-supported-panel"; more.dataset.formatExtensions = "true";
  more.setAttribute("role", "menu"); more.setAttribute("aria-label", summary.textContent);
  summary.setAttribute("role", "menuitem"); summary.setAttribute("aria-haspopup", "menu");
  summary.setAttribute("aria-controls", more.id);
  extra.append(summary, more); more.append(...panel.childNodes);
  const separator = () => { const hr = doc.createElement("hr"); hr.setAttribute("role", "separator"); panel.append(hr); };
  const live = (id: string, letter: string, label: string) => {
    const b = buttons.get(id)!; b.dataset.formatEntry = id; b.dataset.menuLetter = letter;
    b.setAttribute("role", "menuitem"); b.querySelector("span")!.textContent = label; panel.append(b);
  };
  const held = (letter: string, label: string, reason: string, shortcut = "") => {
    const b = doc.createElement("button"); b.type = "button"; b.disabled = true;
    b.dataset.formatHeld = letter; b.dataset.menuLetter = letter;
    b.setAttribute("role", "menuitem"); b.setAttribute("aria-disabled", "true");
    b.textContent = label; b.title = reason; b.setAttribute("aria-description", reason);
    if (shortcut) { const k = doc.createElement("kbd"); k.textContent = shortcut; b.append(k); }
    panel.append(b);
  };
  // State comes from the original explicit apply/remove buttons. Menu and key
  // use the same captured-target dispatcher and existing paragraph-list Command.
  const listToggles: { button: HTMLButtonElement; apply: HTMLButtonElement; remove: HTMLButtonElement; shortcut: string }[] = [];
  const listToggle = (mode: "Number" | "Bullet" | "Outline", letter: string, label: string, shortcut: string) => {
    const button = doc.createElement("button"), apply = buttons.get(`list-${mode}`)!, remove = buttons.get("list-None")!;
    button.type = "button"; button.dataset.formatEntry = `list-toggle-${mode}`; button.dataset.menuLetter = letter;
    button.setAttribute("role", "menuitemcheckbox");
    const text = doc.createElement("span"), key = doc.createElement("kbd"); text.textContent = label; key.textContent = shortcut;
    key.title = shortcut === "Ctrl+Shift+Delete"
      ? "편집기에 키가 전달되면 기존 글머리표 토글을 실행합니다. 브라우저의 인터넷 사용기록 삭제와 겹치며 Windows/Safari 물리키는 미확인입니다. 메뉴로도 실행할 수 있습니다."
      : "기존 문단 번호 적용/해제 명령에 연결된 단축키입니다.";
    button.setAttribute("aria-keyshortcuts", shortcut.replace("Ctrl", "Control"));
    button.append(text, key); button.onclick = () => {
      if (!actions.blocked() && !button.disabled)
        actions.toggleList(mode);
    };
    listToggles.push({ button, apply, remove, shortcut }); panel.append(button);
  };
  live("character", "l", "글자 모양(L)…");
  live("paragraph", "m", "문단 모양(M)…");
  held("d", "문단 첫 글자 장식(D)…", "문단 첫 글자 장식 명령은 연결돼 있지 않습니다. 기존 문단을 유지합니다.");
  separator(); live("paragraph-lists", "n", "문단 번호 모양(N)…");
  const listDialog = buttons.get("paragraph-lists")!;
  listDialog.dataset.hint = "기존 문단 번호·글머리표 모양 창. Ctrl+K,N은 브라우저 검색과 충돌할 수 있어 일반 창 물리키 수용은 미확인입니다. 이 메뉴를 사용하세요.";
  const listDialogKey = doc.createElement("kbd"); listDialogKey.textContent = "Ctrl+K,N";
  listDialog.append(listDialogKey); browserShortcutScope(listDialogKey, "search");
  listToggle("Number", "u", "문단 번호 적용/해제(U)", "Ctrl+Shift+Insert");
  listToggle("Bullet", "b", "글머리표 적용/해제(B)", "Ctrl+Shift+Delete");
  separator();
  const outline=doc.createElement('button');outline.type='button';outline.dataset.formatEntry='outline-dialog';outline.dataset.menuLetter='t';outline.setAttribute('role','menuitem');const outlineKey=doc.createElement('kbd');outlineKey.textContent='Ctrl+K,O';outline.append(doc.createTextNode('개요 번호 모양(T)…'),outlineKey);browserShortcutScope(outlineKey,'search');outline.onclick=()=>{if(!actions.blocked()&&!outline.disabled)actions.openOutline();};panel.append(outline);
  listToggle('Outline','o','개요 적용/해제(O)','Ctrl+Insert');
  separator();live('number-level--1','a','한 수준 증가(A)');live('number-level-1','c','한 수준 감소(C)');
  separator(); held("s", "스타일(S)…", stylesUnavailable, "F6"); held("y", "스타일마당(Y)…", stylesUnavailable);
  separator();
  const object = doc.createElement("button"); object.type = "button"; object.textContent = "개체 속성(P)…";
  object.dataset.formatEntry = "object-properties"; object.dataset.menuLetter = "p";
  object.setAttribute("role", "menuitem"); object.onclick = () => {
    const state = actions.objectState(); if (!actions.blocked() && !state.disabled) actions.openObject();
  };
  panel.append(object); separator(); panel.append(extra);
  const fontButtons=([1,-1]as const).map(direction=>{const b=doc.createElement('button');b.type='button';b.dataset.fontCycle=String(direction);b.setAttribute('role','menuitem');b.textContent=direction>0?'다음 등록 글꼴 · Alt+Shift+F':'이전 등록 글꼴 · Alt+Shift+G';b.onclick=()=>{if(actions.blocked()||b.disabled)return;root.open=false;actions.fontCycle?.(direction);};more.append(b);return{b,direction};});
  const choices = () => [...more.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
    .filter(b => b.closest("details") === extra && !!b.getClientRects().length);
  const focus = (e?: HTMLElement) => { e?.focus(); e?.scrollIntoView({ block: "nearest", inline: "nearest" }); };
  const key = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
      !(e.target instanceof HTMLElement) || e.target.closest("input,textarea,select,[contenteditable=true]") || e.target.closest("details") !== extra) return;
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End", "Escape", "Enter"].includes(e.key)) return;
    if (e.target !== summary && e.key === "Enter") return; // Original button owns execution.
    if (e.target !== summary && e.key === "ArrowRight") return;
    if (e.key === "Escape" && !extra.open) return; // Next Escape belongs to the root.
    e.preventDefault(); e.stopPropagation(); if (actions.blocked()) return;
    if (e.key === "ArrowLeft" || e.key === "Escape") { extra.open = false; focus(summary); return; }
    extra.open = true;
    const rows = choices(), index = rows.indexOf(e.target as HTMLButtonElement);
    const next = e.key === "End" || e.target === summary && e.key === "ArrowUp" ? rows.length - 1
      : e.key === "Home" || e.target === summary ? 0
      : (index + (e.key === "ArrowUp" ? -1 : 1) + rows.length) % rows.length;
    focus(rows[next] ?? summary);
  };
  const toggle = () => summary.setAttribute("aria-expanded", String(extra.open));
  const rootToggle = () => { if (!root.open) extra.open = false; };
  extra.addEventListener("keydown", key); extra.addEventListener("toggle", toggle); root.addEventListener("toggle", rootToggle); toggle();
  const disposeKeys = mountDropdownKeys(root, actions.blocked);
  return {
    sync() {
      outline.disabled=actions.blocked()||listDialog.disabled;outline.title=listDialog.disabled?listDialog.title:'기존 개요 종류·정의·수준을 초안에서 설정합니다.';outline.setAttribute('aria-disabled',String(outline.disabled));
      for(const {b,direction}of fontButtons){const reason=actions.fontState?.(direction)??'등록 글꼴 명령 미연결';b.disabled=!!reason;b.title=reason||'현재 언어 범위와 등록 글꼴 목록 순서로 적용합니다.';b.setAttribute('aria-disabled',String(!!reason));}
      for (const { button, apply, remove } of listToggles) {
        const pressed = apply.getAttribute("aria-pressed"),unknown=apply.dataset.valueState==="unavailable";
        const reason = apply.disabled ? apply.title : remove.disabled ? remove.title : unknown
          ? "문단 번호 종류가 미조회입니다. 문단 번호 모양에서 종류를 명시하세요.":pressed === "mixed"
          ? "문단 번호 종류가 혼합입니다. 문단 번호 모양에서 종류를 명시하세요." : "";
        button.disabled = actions.blocked() || !!reason; button.title = reason || "메뉴·표시된 단축키가 같은 기존 문단 번호 명령으로 적용/해제합니다.";
        markFormatToggle(button,{valueState:unknown?"unavailable":pressed==="mixed"?"mixed":"common",pressed:pressed===null?undefined:pressed as "true"|"false"|"mixed"},reason);
        button.setAttribute("aria-description", button.title); button.setAttribute("aria-disabled", String(button.disabled));
        button.setAttribute("role",unknown?"menuitem":"menuitemcheckbox");
        if(pressed===null){button.removeAttribute("aria-checked");button.removeAttribute("aria-pressed");}
        else{button.setAttribute("aria-checked", pressed); button.setAttribute("aria-pressed", pressed);}
      }
      const state = actions.objectState(); object.disabled = state.disabled || actions.blocked(); object.title = state.reason || "선택한 기존 본문 개체의 속성 창"; object.setAttribute("aria-disabled", String(object.disabled));
    },
    dispose() { disposeKeys(); extra.removeEventListener("keydown", key); extra.removeEventListener("toggle", toggle); root.removeEventListener("toggle", rootToggle); },
  };
}
