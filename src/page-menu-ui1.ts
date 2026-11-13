import { browserShortcutScope } from "./browser-shortcut-scope.js";
import type { Interaction } from "./interaction.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";
import { mountDropdownKeys } from "./workspace-menu-navigation.js";
import { pageBreakReason } from "./page-break.js";
import { columnBreakReason } from "./column-break.js";
import { columnDefinitionBreakReason } from "./column-definition-break.js";

// UI1-Z-MENU-PAGE-EXPANDED. Keep supported source controls/handlers intact.
// Body auto-number fields are not the native page-position numbering feature.
export function mountPageMenuUI1(doc: Document, editor: Interaction, actions: {
  busy: () => boolean; focus: () => void; feedback: (message: string) => void;
  breakPage: (target: ReturnType<Interaction["capture"]>) => void;
  paper:()=>void;
  breakColumn: (target: ReturnType<Interaction["capture"]>) => void;
  breakColumnDefinition: (target: ReturnType<Interaction["capture"]>) => void;
}) {
  const root = doc.querySelector<HTMLDetailsElement>("#page-menu")!, summary = root.querySelector<HTMLElement>(":scope>summary")!;
  const panel = root.querySelector<HTMLElement>(":scope>div")!;
  const header = doc.querySelector<HTMLButtonElement>("#header-footer-open")!, columns = doc.querySelector<HTMLButtonElement>("#columns-open")!;
  const number = doc.querySelector<HTMLButtonElement>("#page-number-open")!;
  const paper = [...panel.querySelectorAll<HTMLButtonElement>(":scope>button")].find(b => b.textContent?.startsWith("편집 용지"))!;
  const extra = doc.createElement("details"), extraSummary = doc.createElement("summary"), more = doc.createElement("div");
  extra.id = "page-supported-menu"; extraSummary.textContent = "기존 쪽 탐색·필드·출력 도구"; extra.append(extraSummary,more); more.append(...panel.childNodes);
  panel.classList.add("ui1-page-panel");
  let captured: ReturnType<Interaction["capture"]> | undefined;
  const disposers: (() => void)[] = [];
  const closeChildren = () => root.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(d => d.open = false);
  const guard = (button: HTMLButtonElement) => {
    const click = (e: MouseEvent) => {
      if (actions.busy() || button.disabled) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (!captured || !sameFormatTarget(captured,editor.capture())) {
        e.preventDefault(); e.stopImmediatePropagation(); root.open = false; closeChildren();
        actions.feedback("문서·리비전·선택이 변경되었습니다. 쪽 메뉴를 다시 여세요."); actions.focus(); return;
      }
      root.open = false; closeChildren(); // Existing source captures/validates again.
    };
    button.addEventListener("click",click,true); disposers.push(() => button.removeEventListener("click",click,true));
  };
  const keyHint = (b: HTMLButtonElement, text: string) => {
    const k = doc.createElement("kbd"); k.textContent = text; k.title = "한컴 참조 단축키입니다. 현재 이 연속키는 미연결이며 메뉴로 실행합니다."; b.append(k);
  };
  const live = (b: HTMLButtonElement, letter: string, label: string) => {
    b.textContent = label; b.dataset.pageEntry = letter; b.dataset.menuLetter = letter; b.setAttribute("role","menuitem"); return b;
  };
  const separator = () => { const hr = doc.createElement("hr"); hr.setAttribute("role","separator"); panel.append(hr); };
  const held = (letter: string, label: string, reason: string, key = "", arrow = false) => {
    const b = doc.createElement("button"); b.type = "button"; b.disabled = true; b.textContent = label; b.title = reason;
    b.dataset.pageHeld = letter; b.dataset.menuLetter = letter; b.setAttribute("role","menuitem"); b.setAttribute("aria-disabled","true"); b.setAttribute("aria-description",reason);
    if (key) { const k = doc.createElement("kbd"); k.textContent = key; b.append(k); }
    if (arrow) { const a = doc.createElement("span"); a.className = "page-submenu-hint"; a.textContent = "›"; a.setAttribute("aria-hidden","true"); b.append(a); }
    panel.append(b);
  };
  const unavailable = "현재 쪽 명령과 연결돼 있지 않습니다. 문서의 기존 값은 유지합니다.";
  live(paper,"j","편집 용지(J)…"); keyHint(paper,"F7"); panel.append(paper);guard(paper);paper.onclick=actions.paper;paper.querySelector("kbd")!.title="편집 용지 · F7";
  held("c","글자 방향(C)",unavailable,"",true); held("b","쪽 테두리/배경(B)…",unavailable); held("f","바탕쪽(F)…",unavailable); separator();
  live(header,"h","머리말/꼬리말(H)…"); keyHint(header,"Ctrl+N,H"); guard(header); panel.append(header);
  browserShortcutScope(header.querySelector("kbd")!, "new-window");
  held("g","쪽 번호 매기기(G)…","쪽 위치·번호 모양/시작 번호 지정은 미지원입니다. 기존 본문 자동 번호 필드는 아래 지원 도구에 별도로 보존합니다.","Ctrl+N,P");
  held("w","새 번호로 시작(W)…",unavailable); held("i","감추기(I)…",unavailable,"Ctrl+N,S"); held("m","줄 번호(M)",unavailable,"",true); separator();
  const pageBreak = doc.createElement("button"); pageBreak.type = "button";
  live(pageBreak,"p","쪽 나누기(P)"); pageBreak.id = "page-break"; pageBreak.setAttribute("aria-keyshortcuts","Control+Enter");
  const breakKey = doc.createElement("kbd"); breakKey.textContent = "Ctrl+Enter"; pageBreak.append(breakKey); panel.append(pageBreak); guard(pageBreak);
  pageBreak.onclick = () => { if (captured) actions.breakPage(captured); };
  const columnBreak = doc.createElement("button"); columnBreak.type = "button";
  live(columnBreak,"d","단 나누기(D)"); columnBreak.id = "column-break"; columnBreak.setAttribute("aria-keyshortcuts","Control+Shift+Enter");
  const columnKey = doc.createElement("kbd"); columnKey.textContent = "Ctrl+Shift+Enter"; columnBreak.append(columnKey); panel.append(columnBreak); guard(columnBreak);
  columnBreak.onclick = () => { if (captured) actions.breakColumn(captured); };
  const inherited = doc.createElement("button"); inherited.type = "button";
  live(inherited,"inherit","앞 단 설정 이어 나누기"); inherited.id = "column-definition-break";
  panel.append(inherited); guard(inherited);
  inherited.onclick = () => { if (captured) actions.breakColumnDefinition(captured); };
  const inheritNote = doc.createElement("small"); inheritNote.className = "ui2-command-reason";
  inheritNote.textContent = "앞 단 설정을 그대로 이어갑니다. 새 단의 설정 지정은 미완료입니다.";
  inherited.after(inheritNote);
  const breakNotes = [pageBreak,columnBreak].map((button) => {
    const note=doc.createElement("small");note.id=button.id+"-reason";note.className="ui2-command-reason";
    button.after(note);button.setAttribute("aria-describedby",note.id);return note;
  });
  const showReason=(note:HTMLElement,reason:string)=>{
    if(note.textContent!==reason)note.textContent=reason;
    note.hidden=!reason;
  };
  const sync = () => {
    if(!root.open)return; // open/click/keyboard handlers below refresh before exposing actions
    const inheritReason = actions.busy() ? "입력·저장 또는 대화상자 작업을 마친 뒤 사용하세요." : columnDefinitionBreakReason(editor.adapter,editor.selection);
    inherited.disabled = !!inheritReason; inherited.setAttribute("aria-disabled",String(!!inheritReason));
    inherited.title = inheritReason || inheritNote.textContent!;
    paper.disabled=actions.busy()||editor.adapter.scope!=="edit"||editor.adapter.documentLocked;paper.setAttribute("aria-disabled",String(paper.disabled));paper.title=paper.disabled?"현재 작업 또는 문서 보호로 편집 용지를 사용할 수 없습니다.":"현재 구역의 명시한 용지·여백만 변경합니다.";
    const reason = actions.busy() ? "입력·저장 또는 대화상자 작업을 마친 뒤 사용하세요." : pageBreakReason(editor.adapter,editor.selection);
    const disabled = !!reason, title = reason || "기존 Core로 본문 커서를 나누고 뒤 문단을 다음 쪽에서 시작합니다.";
    if (pageBreak.disabled !== disabled) pageBreak.disabled = disabled;
    if (pageBreak.title !== title) pageBreak.title = title;
    if (pageBreak.getAttribute("aria-disabled") !== String(disabled)) pageBreak.setAttribute("aria-disabled",String(disabled));
    if (pageBreak.getAttribute("aria-description") !== title) pageBreak.setAttribute("aria-description",title);
    showReason(breakNotes[0],reason);
    const columnReason = actions.busy() ? "입력·저장 또는 대화상자 작업을 마친 뒤 사용하세요." : columnBreakReason(editor.adapter,editor.selection);
    const columnDisabled = !!columnReason, columnTitle = columnReason || "기존 Core로 본문 커서를 나누고 뒤 문단을 다음 단에서 시작합니다. 1단에서는 다음 쪽으로 이어집니다.";
    if (columnBreak.disabled !== columnDisabled) columnBreak.disabled = columnDisabled;
    if (columnBreak.title !== columnTitle) columnBreak.title = columnTitle;
    if (columnBreak.getAttribute("aria-disabled") !== String(columnDisabled)) columnBreak.setAttribute("aria-disabled",String(columnDisabled));
    if (columnBreak.getAttribute("aria-description") !== columnTitle) columnBreak.setAttribute("aria-description",columnTitle);
    showReason(breakNotes[1],columnReason);
  };
  separator();
  const columnMenu = doc.createElement("details"), columnSummary = doc.createElement("summary"), columnPanel = doc.createElement("div");
  columnMenu.id = "page-columns-menu"; columnSummary.textContent = "단(U)"; columnSummary.dataset.menuLetter = "u";
  live(columns,"settings","다단 설정…"); columnMenu.append(columnSummary,columnPanel);
  for(const n of [1,2]){const b=doc.createElement('button');b.type='button';b.dataset.columnPreset=String(n);b.textContent=n+'단';b.setAttribute('role','menuitem');columnPanel.append(b);guard(b);}
  columnPanel.append(columns); panel.append(columnMenu); guard(columns);
  held("n","다단 설정 나누기(N)",unavailable,"Ctrl+Alt+Enter"); held("e","구역 설정(E)…",unavailable,"Ctrl+N,G"); held("s","구역 나누기(S)",unavailable,"Alt+Shift+Enter"); separator();
  held("k","쪽 복사하기(K)",unavailable); held("o","쪽 붙이기(O)",unavailable); held("r","쪽 지우기(R)",unavailable); separator();
  held("a","원고지(A)…",unavailable); held("l","라벨(L)",unavailable,"",true); separator(); panel.append(extra);
  number.title ||= "본문 자동 번호 필드 삽입 — 쪽 아래 번호 매기기와 다릅니다."; guard(number);
  const flyout = (d: HTMLDetailsElement, p: HTMLElement) => {
    const s = d.querySelector<HTMLElement>(":scope>summary")!; p.classList.add("ui1-page-subpanel"); p.id ||= d.id + "-panel";
    s.setAttribute("role","menuitem"); s.setAttribute("aria-haspopup","menu"); s.setAttribute("aria-controls",p.id);
    const rows = () => [...p.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")].filter(b => b.closest("details") === d && !!b.getClientRects().length);
    const focus = (e?: HTMLElement) => { e?.focus(); e?.scrollIntoView({block:"nearest",inline:"nearest"}); };
    const position = () => {
      s.setAttribute("aria-expanded",String(d.open)); if (!d.open || !root.open) return;
      const r = s.getBoundingClientRect(), parent = d.parentElement!.getBoundingClientRect(), box = p.getBoundingClientRect(), w = doc.defaultView!;
      const left = parent.right + box.width + 2 < w.innerWidth - 8 ? parent.right + 1 : parent.left - box.width - 1;
      p.style.left = `${Math.max(8,Math.min(left,w.innerWidth-box.width-8))}px`; p.style.top = `${Math.max(8,Math.min(r.top,w.innerHeight-box.height-8))}px`;
    };
    const open = () => { for (const other of [columnMenu,extra]) if (other !== d) other.open = false; d.open = true; position(); focus(rows()[0] ?? s); };
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !(e.target instanceof HTMLElement) || e.target.closest("details") !== d) return;
      if (!["ArrowRight","ArrowLeft","ArrowDown","ArrowUp","Home","End","Enter","Escape"].includes(e.key) || e.target !== s && ["Enter","ArrowRight"].includes(e.key) || e.key === "Escape" && !d.open) return;
      if (e.target === s && !d.open && ["Home","End","ArrowUp","ArrowDown"].includes(e.key)) {
        e.preventDefault(); e.stopPropagation(); if (actions.busy()) return;
        const parentRows = [...panel.querySelectorAll<HTMLElement>(":scope>button:not(:disabled),:scope>details>summary")], at = parentRows.indexOf(s);
        focus(parentRows[e.key === "Home" ? 0 : e.key === "End" ? parentRows.length-1 : (at+(e.key === "ArrowUp"?-1:1)+parentRows.length)%parentRows.length]); return;
      }
      e.preventDefault(); e.stopPropagation(); if (actions.busy()) return;
      if (["Escape","ArrowLeft"].includes(e.key)) { d.open = false; focus(s); return; }
      if (e.target === s && ["Enter","ArrowRight","ArrowDown"].includes(e.key)) { open(); return; }
      d.open = true; position(); const a = rows(), at = a.indexOf(e.target as HTMLButtonElement);
      focus(a[e.key === "Home" ? 0 : e.key === "End" || e.target === s && e.key === "ArrowUp" ? a.length-1 : (at+(e.key === "ArrowUp"?-1:1)+a.length)%a.length] ?? s);
    };
    d.addEventListener("keydown",key); d.addEventListener("toggle",position); position(); disposers.push(() => { d.removeEventListener("keydown",key); d.removeEventListener("toggle",position); }); return open;
  };
  const openColumns = flyout(columnMenu,columnPanel); flyout(extra,more);
  const toggle = () => { if (root.open) { captured ??= editor.capture(); sync(); } else { captured = undefined; closeChildren(); } };
  const pointer = (e: PointerEvent) => { if (!root.open && summary.contains(e.target as Node) && !actions.busy()) captured = editor.capture(); };
  const focus = (e: FocusEvent) => { if (!root.open && e.target === summary && !actions.busy()) captured = editor.capture(); };
  const key = (e: KeyboardEvent) => {
    if (!e.defaultPrevented && !e.isComposing && e.keyCode !== 229 && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === "u" && e.target instanceof HTMLElement && e.target.closest("details") === root) {
      e.preventDefault(); e.stopPropagation(); if (!actions.busy()) openColumns();
    }
  };
  root.addEventListener("toggle",toggle); root.addEventListener("pointerdown",pointer); root.addEventListener("focusin",focus); root.addEventListener("keydown",key);
  const opening = () => { if (!actions.busy()) captured = editor.capture(); };
  root.addEventListener("rhwp:menu-opening",opening);
  const relocate = () => closeChildren(); doc.defaultView!.addEventListener("resize",relocate); doc.getElementById("viewport")!.addEventListener("scroll",relocate);
  disposers.push(mountDropdownKeys(root,actions.busy));
  sync();
  return {sync,dispose() { for (const dispose of disposers) dispose(); root.removeEventListener("toggle",toggle); root.removeEventListener("pointerdown",pointer); root.removeEventListener("focusin",focus); root.removeEventListener("keydown",key); root.removeEventListener("rhwp:menu-opening",opening); doc.defaultView!.removeEventListener("resize",relocate); doc.getElementById("viewport")!.removeEventListener("scroll",relocate); }};
}
