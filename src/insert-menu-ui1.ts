import {activeWorkset} from './active-workset.js';
import { browserShortcutScope } from "./browser-shortcut-scope.js";
import type { Interaction } from "./interaction.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";
import { mountDropdownKeys } from "./workspace-menu-navigation.js";

// Native UI1-Z-MENU-INSERT-EXPANDED / UI1-Z-INSERT-PICTURE-SUBMENU.
// Only presentation and entries to existing insertion/selection dialogs.
export function mountInsertMenuUI1(doc: Document, editor: Interaction, actions: {
  busy: () => boolean; focus: () => void; changed: () => void; feedback: (message: string) => void;
}) {
  const root = doc.querySelector<HTMLDetailsElement>("#insert-menu")!, summary = root.querySelector<HTMLElement>(":scope>summary")!;
  const panel = root.querySelector<HTMLElement>(":scope>div")!;
  const picture = doc.querySelector<HTMLDetailsElement>("#picture-menu")!, pictureSummary = picture.querySelector<HTMLElement>("summary")!;
  const pictureInsert = picture.querySelector<HTMLButtonElement>("button")!;
  const tableInsert = panel.querySelector<HTMLButtonElement>("[data-table-insert-entry]")!;
  const memo = panel.querySelector<HTMLButtonElement>('[data-menu-scope-id="I35"]')!;
  const tools = doc.createElement("details"), toolsSummary = doc.createElement("summary"), toolsPanel = doc.createElement("div");
  tools.id = "input-existing-tools"; toolsSummary.textContent = "기존 입력·개체 도구"; tools.append(toolsSummary, toolsPanel);
  toolsPanel.append(...panel.childNodes); panel.classList.add("ui1-insert-panel");
  let captured: ReturnType<Interaction["capture"]> | undefined;
  const disposers: (() => void)[] = [];
  const close = () => root.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(d => d.open = false);
  const admit = () => {
    if (actions.busy()) return false;
    if (!captured || !sameFormatTarget(captured, editor.capture())) {
      root.open = false; close(); actions.feedback("문서·리비전·선택이 변경되었습니다. 입력 메뉴를 다시 여세요."); actions.focus(); return false;
    }
    return true;
  };
  const guardEntry = (button: HTMLButtonElement) => {
    const click = (e: MouseEvent) => {
      if (button.disabled || !admit()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      close(); root.open = false; // Original handler owns validation/capture/Command.
    };
    button.addEventListener("click", click, true); disposers.push(() => button.removeEventListener("click", click, true));
  };
  const held = (parent: HTMLElement, letter: string, text: string, reason: string, key = "", arrow = false) => {
    const b = doc.createElement("button"); b.type = "button"; b.disabled = true; b.textContent = text;
    b.dataset.insertHeld = letter; b.dataset.menuLetter = letter; b.setAttribute("role", "menuitem"); b.setAttribute("aria-disabled", "true");
    b.title = reason; b.setAttribute("aria-description", reason);
    if (key) { const k = doc.createElement("kbd"); k.textContent = key; b.append(k); }
    if (arrow) { const a = doc.createElement("span"); a.textContent = "›"; a.className = "insert-submenu-hint"; a.setAttribute("aria-hidden", "true"); b.append(a); }
    parent.append(b); return b;
  };
  const separator = (parent = panel) => { const hr = doc.createElement("hr"); hr.setAttribute("role", "separator"); parent.append(hr); };
  const position = (d: HTMLDetailsElement, p: HTMLElement) => {
    if (!d.open || !root.open) return;
    const r = d.querySelector("summary")!.getBoundingClientRect(), b = p.getBoundingClientRect(), w = doc.defaultView!;
    const parent = d.parentElement!.getBoundingClientRect();
    const left = parent.right + b.width + 2 <= w.innerWidth - 8 ? parent.right + 1 : parent.left - b.width - 1;
    p.style.left = `${Math.max(8, Math.min(left, w.innerWidth - b.width - 8))}px`;
    p.style.top = `${Math.max(8, Math.min(r.top, w.innerHeight - b.height - 8))}px`;
  };
  const menuChoices = (d: HTMLDetailsElement, p: HTMLElement) =>
    [...p.querySelectorAll<HTMLElement>("button:not(:disabled),summary,input:not(:disabled),select:not(:disabled)")]
      .filter(e => (e.tagName === "SUMMARY" ? e.parentElement?.parentElement?.closest("details") : e.closest("details")) === d && !!e.getClientRects().length && e.getAttribute("aria-disabled") !== "true");
  const submenu = (d: HTMLDetailsElement, p: HTMLElement, letter?: string) => {
    const s = d.querySelector<HTMLElement>(":scope>summary")!; p.classList.add("ui1-insert-subpanel"); p.id ||= d.id + "-panel";
    s.setAttribute("role", "menuitem"); s.setAttribute("aria-haspopup", "menu"); s.setAttribute("aria-controls", p.id);
    if (letter) s.dataset.menuLetter = letter;
    const choices = () => menuChoices(d,p);
    const focus = (e?: HTMLElement) => { e?.focus(); e?.scrollIntoView({ block: "nearest", inline: "nearest" }); };
    const open = () => {
      if (s.getAttribute("aria-disabled") === "true") return;
      for (const sibling of d.parentElement!.children) if (sibling !== d && sibling instanceof HTMLDetailsElement) sibling.open = false;
      d.open = true; position(d, p); focus(choices()[0] ?? s);
    };
    const toggle = () => { s.setAttribute("aria-expanded", String(d.open)); position(d, p); };
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey ||
        !(e.target instanceof HTMLElement) || (e.key !== "Escape" && e.target.closest("input,select,textarea,[contenteditable=true]")) || e.target.closest("details") !== d) return;
      if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "Escape", "Enter"].includes(e.key)) return;
      if (e.target !== s && ["Enter", "ArrowRight"].includes(e.key)) return;
      if (e.key === "Escape" && !d.open) return;
      e.preventDefault(); e.stopPropagation(); if (actions.busy()) return;
      const parent = d.parentElement!.closest<HTMLDetailsElement>("details");
      if (e.target === s && !d.open && parent?.open && ["Home", "End", "ArrowUp", "ArrowDown"].includes(e.key)) {
        const rows = menuChoices(parent,parent.querySelector<HTMLElement>(":scope>div")!), at = rows.indexOf(s);
        focus(rows[e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1
          : (at + (e.key === "ArrowUp" ? -1 : 1) + rows.length) % rows.length]); return;
      }
      if (["ArrowLeft", "Escape"].includes(e.key)) { d.open = false; focus(s); return; }
      if (e.target === s && ["Enter", "ArrowRight", "ArrowDown"].includes(e.key)) { open(); return; }
      d.open = true; position(d, p); const rows = choices(), at = rows.indexOf(e.target);
      focus(rows[e.key === "Home" ? 0 : e.key === "End" || e.target === s && e.key === "ArrowUp" ? rows.length - 1
        : (at + (e.key === "ArrowUp" ? -1 : 1) + rows.length) % rows.length] ?? s);
    };
    const click = (e: MouseEvent) => { if (s.contains(e.target as Node) && s.getAttribute("aria-disabled") === "true") e.preventDefault(); };
    d.addEventListener("keydown", key); d.addEventListener("toggle", toggle); s.addEventListener("click", click); toggle();
    disposers.push(mountDropdownKeys(d, actions.busy), () => { d.removeEventListener("keydown", key); d.removeEventListener("toggle", toggle); s.removeEventListener("click", click); });
    return open;
  };
  const unavailable = "현재 입력 명령이 연결돼 있지 않습니다. 기존 문서의 내용·설정은 유지합니다.";
  held(panel, "g", "도형(G)", "새 도형 그리기 갤러리는 미연결입니다. 기존 도형 선택·속성은 아래 기존 도구에 보존합니다.", "", true);
  separator();
  pictureSummary.textContent = "그림(P)";
  const picturePanel = doc.createElement("div"), pictureTools = doc.createElement("details"), pictureToolsSummary = doc.createElement("summary"), pictureToolsPanel = doc.createElement("div");
  pictureTools.id = "input-existing-picture-tools"; pictureToolsSummary.textContent = "기존 그림 선택·속성"; pictureTools.append(pictureToolsSummary, pictureToolsPanel);
  pictureToolsPanel.append(...[...picture.childNodes].filter(n => n !== pictureSummary && n !== pictureInsert));
  pictureInsert.textContent = "그림(I)…"; pictureInsert.dataset.menuLetter = "i"; pictureInsert.dataset.insertEntry = "picture"; pictureInsert.setAttribute("role", "menuitem");
  const pictureKey = doc.createElement("kbd"); pictureKey.textContent = "Ctrl+N,I"; pictureInsert.append(pictureKey); browserShortcutScope(pictureKey, "new-window");
  const syncPicture = () => {
    pictureInsert.setAttribute("aria-disabled", String(pictureInsert.disabled));
    pictureInsert.title = (pictureInsert.disabled ? "본문 입력 위치에서만 그림을 넣을 수 있습니다. 현재 문맥/작업 상태를 확인하세요. " : "") +
      "기존 그림 넣기 창을 엽니다. Ctrl+N,I는 일반 Chrome 탭의 새 창 예약키와 겹칩니다. 이 메뉴를 사용하세요.";
  };
  const pictureObserver = new MutationObserver(syncPicture); if(!activeWorkset(doc))pictureObserver.observe(pictureInsert, { attributes:true, attributeFilter:["disabled"] }); syncPicture();
  picturePanel.append(pictureInsert);
  held(picturePanel, "r", "그리기마당(R)…", unavailable); held(picturePanel, "p", "스크린 샷(P)", unavailable, "", true);
  separator(picturePanel); held(picturePanel, "a", "그림에서 글자 가져오기(A)…", unavailable);
  separator(picturePanel); picturePanel.append(pictureTools); picture.append(picturePanel); panel.append(picture);
  guardEntry(pictureInsert); const openPicture = submenu(picture, picturePanel, "p"); submenu(pictureTools, pictureToolsPanel);
  const table = doc.createElement("details"), tableSummary = doc.createElement("summary"), tablePanel = doc.createElement("div");
  table.id = "input-table-menu"; tableSummary.textContent = "표(T)"; table.append(tableSummary, tablePanel); tablePanel.append(tableInsert); tableInsert.dataset.insertEntry = "table";
  tableInsert.setAttribute("role", "menuitem"); guardEntry(tableInsert); panel.append(table); const openTable = submenu(table, tablePanel, "t");
  const syncTable = () => { tableSummary.setAttribute("aria-disabled", String(tableInsert.disabled)); tableSummary.title = tableInsert.title; if (tableInsert.disabled) table.open = false; };
  const tableObserver = new MutationObserver(syncTable); if(!activeWorkset(doc))tableObserver.observe(tableInsert, { attributes:true, attributeFilter:["disabled","title"] }); syncTable();
  held(panel, "j", "차트(J)", unavailable + " 표 데이터 차트·셀 필드/양식 제외 범위는 유지합니다.", "", true);
  const textboxSource = toolsPanel.querySelector<HTMLButtonElement>("#textbox-insert-open")!, textbox = doc.createElement("button");
  textbox.type = "button"; textbox.textContent = "글상자(Q)"; textbox.dataset.insertEntry = "textbox"; textbox.dataset.menuLetter = "q"; textbox.setAttribute("role", "menuitem");
  const textboxKey = doc.createElement("kbd"); textboxKey.textContent = "Ctrl+N,B"; textbox.append(textboxKey);
  browserShortcutScope(textboxKey, "new-window");
  const syncTextbox = () => { textbox.disabled = textboxSource.disabled || actions.busy(); textbox.title = (textboxSource.title ? textboxSource.title + " " : "") + "기존 본문 빈 글상자 넣기. Ctrl+N,B는 일반 Chrome 탭의 새 창 예약키와 겹치므로 이 메뉴를 사용하세요."; textbox.setAttribute("aria-disabled", String(textbox.disabled)); };
  const observer = new MutationObserver(syncTextbox); if(!activeWorkset(doc))observer.observe(textboxSource, { attributes:true, attributeFilter:["disabled","title"] });
  textbox.onclick = () => { syncTextbox(); if (textbox.disabled || !admit()) return; close(); root.open = false; textboxSource.click(); };
  panel.append(textbox); held(panel, "r", "멀티미디어(R)", unavailable, "", true); separator();
  held(panel, "s", "수식(S)…", unavailable, "Ctrl+N,M", true); separator();
  held(panel, "o", "개체(O)", "한컴 개체 입력·OLE 실행은 미지원입니다. 기존 개체 선택·복사는 아래 도구에 보존합니다.", "", true);
  held(panel, "m", "캡션 넣기(M)", unavailable, "", true); held(panel, "l", "문단 띠(L)", unavailable, "Ctrl+N,L"); separator();
  for (const [l,t] of [["n","입력 도우미(N)"],["i","채우기(I)"],["k","주석(K)"],["d","날짜/시간/파일 이름(D)"]]) held(panel,l,t,unavailable,"",true);
  held(panel,"a","덧말 넣기(A)…",unavailable); held(panel,"f","문서 끼워 넣기(F)…",unavailable,"Ctrl+O"); separator();
  const nbsp=doc.createElement('button');nbsp.type='button';nbsp.dataset.insertEntry='nbsp';nbsp.setAttribute('role','menuitem');nbsp.textContent='묶음 빈칸';const nbspKey=doc.createElement('kbd');nbspKey.textContent='Ctrl+Alt+Space';nbsp.append(nbspKey);panel.append(nbsp);
  const nbspReason=()=>{try{if(actions.busy())throw Error('입력 처리 중');const s=editor.selection;if(s.kind!=='caret'&&s.kind!=='text')throw Error('본문 또는 셀의 문자 위치를 선택하세요.');for(const t of editor.targets()){editor.adapter.assertEditable(t.p);editor.adapter.assertTextOnly(t.p);}return '';}catch(e){return String(e);}};
  const syncNbsp=()=>{const why=nbspReason();nbsp.disabled=!!why;nbsp.title=why||'기존 문자 삽입 · NBSP 앞뒤는 자동 줄나눔하지 않습니다.';};
  const nbspOpening=()=>syncNbsp();root.addEventListener('rhwp:menu-opening',nbspOpening);disposers.push(()=>root.removeEventListener('rhwp:menu-opening',nbspOpening));
  nbsp.onclick=()=>{syncNbsp();if(nbsp.disabled||!admit())return;const target=captured!;close();root.open=false;try{editor.execute({type:'insert',text:'\u00a0'},target);actions.changed();}catch(e){actions.feedback(String(e));}actions.focus();};syncNbsp();
  const shy=doc.createElement('button');shy.type='button';shy.dataset.insertEntry='soft-hyphen';shy.setAttribute('role','menuitem');shy.textContent='무른 하이픈';const shyKey=doc.createElement('kbd');shyKey.textContent='Ctrl+Shift+-';shy.append(shyKey);panel.append(shy);
  const syncShy=()=>{const why=nbspReason();shy.disabled=!!why;shy.setAttribute('aria-disabled',String(!!why));shy.title=why||'U+00AD 삽입 · 평소에는 폭 없이 숨기고 선택된 자동 줄끝에서만 하이픈을 표시합니다.';shy.setAttribute('aria-description',shy.title);};
  const shyOpening=()=>syncShy();root.addEventListener('rhwp:menu-opening',shyOpening);disposers.push(()=>root.removeEventListener('rhwp:menu-opening',shyOpening));
  shy.onclick=()=>{syncShy();if(shy.disabled||!admit())return;const target=captured!;close();root.open=false;try{editor.execute({type:'insert',text:'\u00ad'},target);actions.changed();}catch(e){actions.feedback(String(e));}actions.focus();};syncShy();
  held(panel,"c","문자표(C)…",unavailable,"Ctrl+F10"); held(panel,"h","한자 입력(H)",unavailable,"",true); separator();
  memo.textContent = "메모(U)"; memo.dataset.menuLetter = "u"; memo.dataset.insertHeld = "u"; memo.setAttribute("role","menuitem"); panel.append(memo);
  held(panel,"e","상호 참조(E)…",unavailable,"Ctrl+K,R"); held(panel,"b","책갈피(B)…",unavailable,"Ctrl+K,B"); held(panel,"y","하이퍼링크(Y)…",unavailable,"Ctrl+K,H");
  separator(); panel.append(tools); submenu(tools,toolsPanel);
  // Rehost complete existing selection surfaces. Native fields keep their
  // values/events and the original owner/clipboard/property handlers.
  for (const id of ["shape-menu", "object-clipboard-menu"]) {
    const d = doc.getElementById(id) as HTMLDetailsElement | null; if (!d) continue;
    const s = d.querySelector("summary")!, p = doc.createElement("div");
    p.append(...[...d.childNodes].filter(n => n !== s)); d.append(p); submenu(d,p);
  }
  const toggle = () => {
    if (root.open) {
      captured=activeWorkset(doc)?captured??editor.capture():editor.capture(); syncTextbox();syncShy();
      if(activeWorkset(doc)){
        pictureObserver.observe(pictureInsert,{attributes:true,attributeFilter:["disabled"]});
        tableObserver.observe(tableInsert,{attributes:true,attributeFilter:["disabled","title"]});
        observer.observe(textboxSource,{attributes:true,attributeFilter:["disabled","title"]});
        syncPicture();syncTable();
      }
    } else {
      if(activeWorkset(doc)){pictureObserver.disconnect();tableObserver.disconnect();observer.disconnect();}
      captured=undefined;close();
    }
  };
  const pointer = (e: PointerEvent) => { if (!root.open && summary.contains(e.target as Node) && !actions.busy()) { captured = editor.capture(); syncShy(); } };
  const focusEntry = (e: FocusEvent) => { if (e.target === summary && !root.open && !actions.busy()) { captured = editor.capture(); syncShy(); } };
  const rootKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey ||
      !(e.target instanceof HTMLElement) || e.target.closest("details") !== root || e.target.closest("input,select,textarea,[contenteditable=true]")) return;
    const open = e.key.toLowerCase() === "p" ? openPicture : e.key.toLowerCase() === "t" ? openTable : undefined;
    if (open) { e.preventDefault(); e.stopPropagation(); if (!actions.busy()) open(); }
  };
  root.addEventListener("toggle",toggle); root.addEventListener("pointerdown",pointer); root.addEventListener("focusin",focusEntry); root.addEventListener("keydown",rootKey);
  const relocate = () => close(); doc.defaultView!.addEventListener("resize",relocate); doc.getElementById("viewport")!.addEventListener("scroll",relocate);
  disposers.push(mountDropdownKeys(root,actions.busy)); syncTextbox();
  return { dispose() { observer.disconnect(); pictureObserver.disconnect(); tableObserver.disconnect(); for (const dispose of disposers) dispose(); root.removeEventListener("toggle",toggle); root.removeEventListener("pointerdown",pointer); root.removeEventListener("focusin",focusEntry); root.removeEventListener("keydown",rootKey); doc.defaultView!.removeEventListener("resize",relocate); doc.getElementById("viewport")!.removeEventListener("scroll",relocate); } };
}
