import { mountProductInfo } from "./product-info.js";
import {activeWorkset} from './active-workset.js';
import {subscribeWhileOpen} from './ui-demand-lifetime.js';
import {mountMenuLifetime} from './menu-lifetime.js';
import { mountWorkspaceChrome } from "./workspace-chrome.js";
import { mountToolsMenuUI1 } from "./tools-menu-ui1.js";
import { localMenuLetter, mountDropdownKeys, mountMainMenuNavigation } from "./workspace-menu-navigation.js";
import { fileAccessShortcuts } from "./file-access-shortcuts.js";
import { stylesUnavailable } from "./style-availability.js";
import { mountStatusNavigation } from "./status-navigation.js";
import { unavailableMenuButton } from "./menu-scope.js";
import { WorkspaceAccess, menuAccessKeys } from "./workspace-access.js";
// Presentation only. Existing buttons own admission, captured targets and Commands.
const groups = [
  "파일",
  "편집",
  "보기",
  "입력",
  "서식",
  "쪽",
  "보안",
  "검토",
  "도구",
];
export const workspaceMenus = groups;
export function formatTab(kind: string, group: string) {
  if (kind === "char")
    return ["장식 효과", "선 모양", "테두리·배경"].includes(group) ? "확장" : "기본";
  return group === "테두리·배경" ? "테두리/배경" : "기본";
}

export function mountFormatTabs(
  nav: HTMLElement,
  kind: string,
  initial: string,
) {
  const children = [
    ...nav.querySelectorAll<HTMLButtonElement>("[data-format-group]"),
  ];
  const strip = document.createElement("div");
  strip.className = "dialog-tabs";
  strip.setAttribute("role", "tablist");
  strip.setAttribute("aria-label", "모양 탭");
  const tabs =
    kind === "char"
      ? ["기본", "확장"]
      : kind === "paragraph"
        ? ["기본", "테두리/배경"]
        : ["기본"];
  const activate = (name: string) => {
    for (const b of strip.querySelectorAll<HTMLButtonElement>("button")) {
      const active = b.textContent === name;
      b.setAttribute("aria-selected", String(active));
      b.tabIndex = active ? 0 : -1;
    }
    for (const b of children)
      b.hidden = formatTab(kind, b.dataset.formatGroup!) !== name;
  };
  for (const name of tabs) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.dataset.dialogTab = name;
    b.setAttribute("role", "tab");
    b.onclick = () => {
      activate(name);
      children
        .find((c) => formatTab(kind, c.dataset.formatGroup!) === name)
        ?.click();
    };
    b.addEventListener("keydown", (e) => {
      if (
        e.isComposing ||
        e.keyCode === 229 ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const index = tabs.indexOf(name);
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? tabs.length - 1
            : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      const target = strip.querySelectorAll<HTMLButtonElement>("button")[next];
      target.click();
      target.focus();
    });
    strip.append(b);
  }
  for (const c of children)
    c.addEventListener("click", () =>
      activate(formatTab(kind, c.dataset.formatGroup!)),
    );
  nav.prepend(strip);
  activate(formatTab(kind, initial));
}

export function mountWorkspaceUI(
  doc: Document,
  restoreFocus: () => void,
  busy: () => boolean,
  readDocument?: () => {name: string; dirty: boolean},
) {
  const menu = doc.getElementById("main-menu")!,
    toolbar = doc.getElementById("toolbar")!;
  if (menu.dataset.workspaceMounted) return;
  menu.dataset.workspaceMounted = "true";
  mountMenuLifetime(doc);
  doc.body.classList.add("workspace-classic");
  // The fallback View host is created with inline absolute positioning. Once
  // rehosted here, the workspace's existing narrow-screen CSS owns placement.
  menu.querySelector<HTMLElement>("#view-menu > [data-view-panel]")?.style.removeProperty("position");
  const onDemand=activeWorkset(doc),proxyRefresh=new WeakMap<HTMLButtonElement,()=>void>();
  const proxy = (label: string, selector: string, shortcut = "") => {
    const b = doc.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.dataset.commandProxy = selector;
    if (shortcut) {
      const k = doc.createElement("kbd");
      k.textContent = shortcut;
      b.append(k);
    }
    const source = () =>
      doc.querySelector<HTMLInputElement | HTMLButtonElement>(selector);
    const sync = () => {
      const s = source();
      // Open's lifecycle admission belongs to the existing label, while its
      // real click target is the file input. Do not show that mirror as ready
      // during a pending transition just because the input itself is enabled.
      const openBlocked = selector === "#open" && s?.closest("label.file")?.getAttribute("aria-disabled") === "true";
      b.disabled = !s || s.disabled || openBlocked;
      b.title = s
        ? openBlocked ? "현재 파일 작업 또는 문서 전환을 마친 후 사용하세요." : s.title || label
        : "현재 편집기에서 연결하지 않은 명령입니다. 기존 문서는 변경하지 않습니다.";
      const pressed = s?.getAttribute("aria-pressed") ?? null;
      if (pressed === null) b.removeAttribute("aria-pressed");
      else if (b.getAttribute("aria-pressed") !== pressed) b.setAttribute("aria-pressed", pressed);
    };
    if(onDemand)proxyRefresh.set(b,sync);else sync();
    if (!onDemand&&source()) {
      const observer = new MutationObserver(sync);
      observer.observe(source()!, {
        attributes: true,
        attributeFilter: ["disabled", "title", "aria-pressed", "aria-disabled"],
      });
      const openLabel = selector === "#open" ? source()!.closest("label.file") : null;
      if (openLabel) observer.observe(openLabel, { attributes:true, attributeFilter:["aria-disabled"] });
    }
    b.onclick = () => {
      if(onDemand){sync();if(b.disabled)return;}
      const s = source();
      if (!s || s.disabled || busy() || doc.querySelector("dialog[open]"))
        return;
      menu
        .querySelectorAll("details[open]")
        .forEach((d) => d.removeAttribute("open"));
      s.click();
    };
    return b;
  };
  const make = (id: string, title: string) => {
    const d = doc.createElement("details"),
      s = doc.createElement("summary"),
      p = doc.createElement("div");
    d.id = id;
    s.textContent = title;
    p.className = "workspace-menu-panel";
    d.append(s, p);
    return { d, p };
  };
  const file = make("file-menu", "파일");
  file.p.classList.add("ui1-file-panel"); file.p.id = "ui1-file-panel";
  const fileLive = (letter: string, label: string, selector: string, shortcut = "") => {
    const button = proxy(label, selector, shortcut);
    button.dataset.fileEntry = letter; button.setAttribute("role", "menuitem");
    button.dataset.menuLetter = letter; file.p.append(button);
  };
  const fileHeld = (label: string, reason: string, shortcut = "", submenu = false, scope = "") => {
    const button = doc.createElement("button"); button.type = "button"; button.disabled = true;
    button.textContent = label; button.dataset.fileHeld = "true";
    if (scope) button.dataset.menuScopeId = scope;
    button.setAttribute("role", "menuitem"); button.setAttribute("aria-disabled", "true");
    button.title = reason + " 기존 문서와 설정은 유지합니다.";
    button.setAttribute("aria-description", button.title);
    if (shortcut) { const kbd = doc.createElement("kbd"); kbd.textContent = shortcut; button.append(kbd); }
    if (submenu) { const arrow = doc.createElement("span"); arrow.className = "file-submenu-hint"; arrow.textContent = "›"; arrow.setAttribute("aria-hidden", "true"); button.append(arrow); }
    file.p.append(button); return button;
  };
  const fileSeparator = () => { const line = doc.createElement("hr"); line.setAttribute("role", "separator"); file.p.append(line); };
  const heldFile = "현재 파일 메뉴에 실행 명령이 연결되지 않은 항목입니다.";
  fileLive("n", "새 문서(N)", "#new", fileAccessShortcuts[0].shortcut);
  fileHeld("문서마당(T)…", heldFile, "Ctrl+Alt+N", false, "F04");
  fileHeld("문서 시작 도우미(G)", heldFile, "", false, "F05");
  fileLive("o", "불러오기(O)…", "#open", fileAccessShortcuts[1].shortcut);
  fileHeld("PDF를 오피스 문서로 변환하기(D)…", heldFile, "", false, "F06");
  fileHeld("그림을 오피스 문서로 변환하기(H)…", heldFile, "", false, "F07");
  fileSeparator(); fileHeld("XML 문서(M)", heldFile, "", true, "F13"); fileSeparator();
  fileLive("s", "저장하기(S)", "#save", fileAccessShortcuts[2].shortcut);
  fileLive("a", "다른 이름으로 저장하기(A)…", "#save-as", fileAccessShortcuts[3].shortcut);
  fileLive("f", "PDF로 저장하기(F)… (인쇄 창)", "#print-button");
  fileHeld("모바일 최적화 문서로 저장하기(B)…", heldFile, "", false, "F12");
  fileSeparator(); fileLive("i","문서 정보(I)… · 지원 조회","#document-info-open","Ctrl+Q,I / Ctrl+Q,D");
  fileHeld("DAISY 문서(W)", heldFile, "", true, "F16");
  fileHeld("CCL 넣기(Q)…", heldFile, "", false, "F17"); fileHeld("공공누리 넣기(K)…", heldFile, "", false, "F17");
  fileSeparator(); fileHeld("점자로 바꾸기(L)", heldFile, "", true, "F18"); fileHeld("보내기(E)", heldFile, "", true, "F19");
  fileSeparator();
  const paperEntry=doc.createElement("button");paperEntry.type="button";paperEntry.textContent="편집 용지…";paperEntry.dataset.fileEntry="paper";paperEntry.setAttribute("role","menuitem");const paperKey=doc.createElement("kbd");paperKey.textContent="F7";paperEntry.append(paperKey);paperEntry.onclick=()=>{if(busy()||doc.querySelector("dialog[open]"))return;file.d.open=false;doc.dispatchEvent(new CustomEvent("rhwp:shortcut-ui",{detail:"paper"}));};file.p.append(paperEntry);
  file.d.addEventListener("toggle",()=>{const source=doc.querySelector<HTMLButtonElement>('[data-page-entry="j"]');paperEntry.disabled=busy()||!!source?.disabled;paperEntry.setAttribute("aria-disabled",String(paperEntry.disabled));});
  fileLive("p", "인쇄(P)…", "#print-button", "Ctrl+P / Alt+P");
  fileSeparator(); fileHeld("최근 문서 목록", "로컬 경로·최근 문서 목록을 수집하거나 재현하지 않습니다.").dataset.fileEntry = 'recent';
  // Later approved UI: hide titlebar X, retain the real File Close entrance.
  // Use its current identity rather than the historically excluded c row.
  fileSeparator(); fileLive("close", "문서 닫기(C)", "#close-document");
  fileHeld("끝(X)", "브라우저 창 종료 명령은 제공하지 않습니다.", "Alt+X", false, "HK041");
  mountProductInfo(doc,file.p,busy);
  mountDropdownKeys(file.d, () => busy() || !!doc.querySelector("dialog[open]"));
  if(onDemand){
    const refresh=()=>{for(const button of file.p.querySelectorAll<HTMLButtonElement>('button[data-command-proxy]'))proxyRefresh.get(button)?.();};
    file.d.addEventListener('rhwp:menu-opening',refresh);
    file.d.querySelector(':scope>summary')?.addEventListener('click',refresh);
    queueMicrotask(()=>subscribeWhileOpen(doc,file.d,refresh));
  }
  const input = make("insert-menu", "입력");
  input.p.append(
    proxy("표 만들기", "#table"),
    proxy("글자처럼 취급하는 표", "#inline-table"),
  );
  const picture = doc.getElementById("picture-menu");
  if (picture) input.p.append(picture);
  const shapes = doc.getElementById("shape-menu");
  if (shapes) input.p.append(shapes);
  const objectClipboard=doc.getElementById('object-clipboard-menu');
  if(objectClipboard)input.p.append(objectClipboard);
  const memoReason = '메모는 유지 대상이지만 설치 Core의 메모 조회·편집·표시 연결이 없습니다. 필드의 설명값과 메모를 혼동하지 않습니다. 기존 문서 메모는 제거하지 않습니다.';
  input.p.append(unavailableMenuButton(doc, 'I35', '메모 넣기', memoReason));
  if (!doc.querySelector('[data-view-panel] [data-menu-scope-id="V07"]'))
    doc.querySelector('[data-view-panel]')?.append(unavailableMenuButton(doc, 'V07', '메모 표시', memoReason));
  const style = doc.getElementById("style-menu");
  if (style) (doc.querySelector("[data-format-extensions]") ?? doc.querySelector("[data-format-panel]"))!.prepend(style);
  const unsupported = (title: string, names: readonly (string | readonly [string, string, string?])[]) => {
    const entry = make("workspace-" + groups.indexOf(title), title);
    for (const item of names) {
      if (typeof item !== 'string') {
        entry.p.append(unavailableMenuButton(doc, item[0], item[1], item[2] ?? '현재 편집기 연결 미지원. 기존 문서의 내용과 설정은 유지합니다.'));
        continue;
      }
      const name = item;
      const b = doc.createElement("button");
      b.type = "button";
      b.disabled = true;
      b.textContent = name + " · 미지원";
      b.dataset.menuPlaceholder="permanent";
      const reason =
        "현재 편집기에서 지원하지 않습니다. 문서의 기존 설정은 유지합니다.";
      b.title = reason;
      const note = doc.createElement("small");
      note.textContent = reason;
      entry.p.append(b, note);
    }
    return entry.d;
  };
  const page = make("page-menu", "쪽");
  const explore = doc.createElement("button");
  explore.id = "workspace-page-explore";
  explore.type = "button";
  explore.textContent = "쪽 탐색…";
  explore.onclick = () => {
    if (busy()) return;
    page.d.open = false;
    const view = doc.getElementById("view-menu")! as HTMLDetailsElement;
    view.open = true;
    view.querySelector<HTMLButtonElement>('[data-view-entry="zoom"]')?.click();
    view.querySelector<HTMLElement>('input[aria-label="이동할 쪽 번호"]')?.focus();
  };
  page.p.append(
    explore,
    proxy("인쇄…", "#print-button", "Ctrl+P"),
  );
  const headerFooter = doc.createElement('button');headerFooter.type='button';headerFooter.id='header-footer-open';headerFooter.textContent='머리말/꼬리말…';page.p.append(headerFooter);
  const pageNumber = doc.createElement('button');pageNumber.type='button';pageNumber.id='page-number-open';pageNumber.textContent='쪽 번호 필드 넣기…';page.p.append(pageNumber);
  const columns = doc.createElement('button');columns.type='button';columns.id='columns-open';columns.textContent='다단…';page.p.append(columns);
  for (const name of ["편집 용지"]) {
    const b = doc.createElement("button");
    b.type = "button";
    b.disabled = true;
    b.textContent = name + " · 미지원";
    b.title = "설치 Core와 연결된 편집 기능이 없습니다. 기존 값은 유지합니다.";
    page.p.append(b);
  }
  menu.prepend(file.d);
  const entries = [
    file.d,
    doc.getElementById("edit-menu")!,
    doc.getElementById("view-menu")!,
    input.d,
    doc.getElementById("format-menu")!,
    page.d,
    unsupported("보안", ["문서 암호", ['S02', '배포용 문서']]),
    unsupported("검토", [['R07', '메모', memoReason], ['R03', '변경 내용 추적']]),
    unsupported("도구", [['U01', '맞춤법 검사'], ['U11', '매크로'], "환경 설정"]),
  ];
  const tools = entries[8].querySelector('.workspace-menu-panel')!;
  for (const [part, label] of [['menu-settings', '메뉴 사용자 설정'], ['shortcut-settings', '단축키 사용자 설정'], ['toolbar-settings', '도구 상자 사용자 설정']] as const)
    tools.append(unavailableMenuButton(doc, 'U24', label,
      '유지 대상이지만 현재 메뉴·키 배치 사용자 설정 명령은 연결돼 있지 않습니다. 기존 메뉴·단축키는 사용할 수 있습니다.', part));
  mountToolsMenuUI1(entries[8] as HTMLDetailsElement, () => busy() || !!doc.querySelector("dialog[open]"));
  for (const e of entries) menu.append(e);
  const table = doc.getElementById("table-menu");
  if (table) {
    const panel = table.querySelector('[data-table-panel]');
    for (const [id, label] of [['T06', '표 데이터로 차트'], ['T30', '셀 필드 이름·양식 모드']])
      panel?.append(unavailableMenuButton(doc, id, label, ''));
    table.dataset.contextMenu = "table";
    menu.append(table);
  }
  const closePeers = (entry: HTMLElement) => {
    for (const other of menu.querySelectorAll<HTMLDetailsElement>(
      ":scope > details",
    ))
      if (other !== entry) other.open = false;
  };
  for (const entry of menu.querySelectorAll<HTMLDetailsElement>(
    ":scope > details",
  ))
    entry
      .querySelector("summary")
      ?.addEventListener("click", () => closePeers(entry));
  const wrap = (title: string, selectors: string[]) => {
    const g = doc.createElement("div");
    g.className = "tool-group";
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", title);
    for (const sel of selectors)
      doc.querySelectorAll(sel).forEach((e) => g.append(e));
    const caption = doc.createElement("small");
    caption.className = "tool-caption";
    caption.textContent = title;
    g.append(caption);
    toolbar.append(g);
  };
  wrap("되돌리기", ["#undo", "#redo"]);
  wrap("글자 모양", [
    "#bold",
    "#italic",
    "#underline",
    '[role="group"][aria-label="첨자"]',
    "#character",
  ]);
  wrap("문단 모양", ['[role="group"][aria-label="문단 정렬"]', "#paragraph"]);
  const tableTools = doc.createElement("details"),
    ts = doc.createElement("summary"),
    tp = doc.createElement("div");
  ts.textContent = "표 도구";
  tp.className = "workspace-menu-panel";
  tableTools.id = "table-tools";
  tableTools.append(ts, tp);
  for (const s of [
    "#inline-table",
    "#table",
    "[data-table]",
    "#cell-format",
    "#table-object",
    "[data-resize]",
  ])
    toolbar.querySelectorAll(s).forEach((e) => tp.append(e));
  toolbar.append(tableTools);
  toolbar.querySelectorAll(":scope > i").forEach((e) => e.remove());
  // Small original line icons complement text labels; no imported Hancom assets.
  const icons: Record<string, string> = {
    new: "M5 2h9l5 5v15H5z M14 2v6h5",
    save: "M3 3h18v18H3z M7 3v6h10V3 M7 21v-8h10v8",
    undo: "M9 5L3 10l6 5 M3 10h11a6 6 0 0 1 6 6",
    redo: "M15 5l6 5-6 5 M21 10H10a6 6 0 0 0-6 6",
    "print-button": "M6 8V2h12v6 M6 17H3V8h18v9h-3 M6 14h12v8H6z",
  };
  for (const [id, path] of Object.entries(icons)) {
    const b = doc.getElementById(id);
    if (!b) continue;
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"),
      p = doc.createElementNS(svg.namespaceURI, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("command-icon");
    p.setAttribute("d", path);
    svg.append(p);
    b.prepend(svg);
  }
  const formatbar = doc.createElement("div");
  formatbar.id = "format-bar";
  formatbar.setAttribute("aria-label", "서식 도구 상자");
  const styleNotice = doc.createElement("span"); styleNotice.className = "style-unavailable";
  styleNotice.textContent = "스타일 미제공"; styleNotice.title = stylesUnavailable; formatbar.append(styleNotice);
  for (const [selector, label] of [
    ["#selection-font", "글꼴"],
    ["#selection-font-size", "크기"],
  ]) {
    const b = proxy(label, "#character");
    b.className = "current-format";
    const original = doc.querySelector(selector)!;
    const sync = () => {
      b.textContent = original.textContent + " ▾";
      b.setAttribute(
        "aria-label",
        label + ": " + original.textContent + " · 글자 모양 열기",
      );
    };
    new MutationObserver(sync).observe(original, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    sync();
    formatbar.append(b);
    b.addEventListener("click", () => {
      if (!doc.getElementById("format")?.hasAttribute("open")) return;
      doc
        .querySelector<HTMLElement>(
          `#fields [name="${selector === "#selection-font" ? "fontFamily" : "fontSize"}"]:not(:disabled)`,
        )
        ?.focus();
    });
  }
  formatbar.append(
    proxy("글자 모양…", "#character", "Alt+L"),
    proxy("문단 모양…", "#paragraph", "Alt+T"),
  );
  toolbar.after(formatbar);
  const footer = doc.querySelector("footer")!,
    status = doc.getElementById("view-status")!;
  footer.prepend(status);
  const pagebar = doc.createElement("span");
  pagebar.id = "page-navigation";
  pagebar.setAttribute("role", "group");
  pagebar.setAttribute("aria-label", "쪽과 배율");
  footer.append(pagebar);
  mountStatusNavigation(doc, restoreFocus, busy);
  // Context toolboxes rehost original mutation buttons; launchers open the
  // existing captured-target menus rather than bypassing their admission.
  const contextTitle = doc.createElement("output");
  contextTitle.id = "toolbox-context";
  contextTitle.hidden = true;
  contextTitle.setAttribute("aria-live", "polite");
  toolbar.prepend(contextTitle);
  const contexts = new Map<HTMLElement, readonly string[]>();
  const baseGroup = (name: string) =>
    toolbar.querySelector<HTMLElement>(`.tool-group[aria-label="${name}"]`)!;
  contexts.set(baseGroup("글자 모양"), ["edit-menu", "format-menu"]);
  contexts.set(baseGroup("문단 모양"), ["edit-menu", "format-menu"]);
  contexts.set(tableTools, ["table-menu"]);
  const group = (name: string, ids: string[]) => {
    const g = doc.createElement("div");
    g.className = "tool-group";
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", name);
    const caption = doc.createElement("small");
    caption.className = "tool-caption";
    caption.textContent = name;
    g.append(caption);
    toolbar.append(g);
    contexts.set(g, ids);
    return g;
  };
  const launcher = (label: string, id: string) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.dataset.menuLauncher = id;
    b.onclick = () => openMenu(id);
    return b;
  };
  const editGroup=group("편집 명령", ["edit-menu"]),editTools=doc.getElementById("edit-tools");
  if(editTools)editGroup.prepend(editTools);
  else editGroup.append(launcher("클립보드·찾기 메뉴…", "edit-menu"));
  const inserts = group("표·그림 입력", ["insert-menu"]);
  for (const id of ["table", "inline-table"]) {
    const b = doc.getElementById(id);
    if (b) inserts.append(b);
  }
  inserts.append(launcher("그림·입력 메뉴…", "insert-menu"));
  const viewTools = group("쪽 탐색·배율", ["view-menu"]);
  for (const [label, id] of [
    ["이전 쪽", "previous"],
    ["다음 쪽", "next"],
    ["축소", "out"],
    ["확대", "in"],
    ["100%", "actual"],
    ["폭 맞춤", "width"],
    ["쪽 맞춤", "page"],
  ])
    viewTools.append(proxy(label, `[data-view-action="${id}"]`));
  for (const [label, action] of [["문단 부호", "paragraph-marks"], ["조판 부호", "control-codes"], ["투명 선", "transparent-borders"]])
    viewTools.append(proxy(label, `[data-view-action="${action}"]`));
  viewTools.append(launcher("쪽 번호·배율 입력…", "view-menu"));
  // The View menu/status bar retain these commands; omit their extra drawer copy.
  contexts.delete(viewTools); viewTools.hidden = true;
  group("쪽·출력", ["page-menu"]).append(
    proxy("쪽 이동…", "#workspace-page-explore"),
    proxy("인쇄…", "#print-button", "Ctrl+P"),
  );
  for (const entry of entries.slice(6)) {
    const g = group(entry.querySelector("summary")!.textContent!, [entry.id]);
    for (const source of entry.querySelectorAll<HTMLButtonElement>(
      "button:disabled",
    )) {
      if (source.dataset.toolsRootOnly === "true") continue;
      const b = doc.createElement("button");
      b.type = "button";
      b.disabled = true;
      b.textContent = source.textContent;
      b.title = source.title;
      // Preserve exact U24 identity in the existing toolbar mirrors.
      Object.assign(b.dataset, source.dataset);
      g.append(b);
    }
    const note = doc.createElement("small");
    note.className = "toolbox-limitation";
    note.textContent = "비활성 항목은 아직 연결되지 않은 기능입니다. 제한 사유는 각 버튼에서 확인하세요. 기존 문서는 변경하지 않습니다.";
    g.append(note);
  }
  let activeContext = "edit-menu";
  const toolboxTabs = new Map<string, HTMLButtonElement>();
  function selectContext(id: string) {
    if (id === "file-menu" || busy()) return; // File has a menu, not a toolbox.
    const root = doc.getElementById(id);
    if (!root || ![...contexts.values()].some((ids) => ids.includes(id)))
      return;
    activeContext = id;
    for (const [element, ids] of contexts) element.hidden = !ids.includes(id);
    // Toolbox context persists after a popup closes. It is not a current
    // menu: open/hover and :focus-visible own their separate visual states.
    toolbar.dataset.activeMenu = id;
    for (const [target, tab] of toolboxTabs)
      tab.setAttribute("aria-pressed", String(target === id));
    contextTitle.textContent =
      root.querySelector("summary")!.textContent + " 도구 상자";
  }
  function openMenu(id: string, focus = true) {
    if (busy() || doc.querySelector("dialog[open]")) return;
    const root = doc.getElementById(id) as HTMLDetailsElement | null;
    if (!root || root.hidden || root.parentElement !== menu) return;
    closePeers(root);
    selectContext(id);
    if (!root.open) root.dispatchEvent(new Event("rhwp:menu-opening"));
    root.open = true;
    // Hover transfer must not leave keyboard/Escape ownership in a closed
    // peer. Move only existing menu focus, never focus stolen from editing.
    if (focus || menu.contains(doc.activeElement))
      root.querySelector<HTMLElement>("summary")!.focus({preventScroll:true});
  }
  // Switch only an already opened menu session. Mouse hover is presentation,
  // never a command/capture replay; touch, closed menus and modals keep clicks.
  menu.addEventListener("pointerover", event => {
    if (event.pointerType !== "mouse" || event.buttons || busy() || doc.querySelector("dialog[open]")) return;
    const summary = (event.target as Element)?.closest?.("summary");
    const entry = summary?.parentElement as HTMLDetailsElement | null;
    if (!entry || entry.parentElement !== menu || entry.open ||
        !menu.querySelector(":scope > details[open]")) return;
    openMenu(entry.id, false);
  });
  // The received native reference has separate toolbox labels and menu arrows.
  // Keep details/summary (and all existing menu routes) as the dropdown control;
  // the adjacent button only selects the already implemented toolbox.
  for (const entry of entries.slice(1)) {
    const summary = entry.querySelector<HTMLElement>("summary")!;
    const label = summary.textContent!;
    const tab = doc.createElement("button");
    tab.type = "button";
    tab.className = "workspace-toolbox-tab";
    tab.dataset.toolboxTab = entry.id;
    tab.textContent = label;
    tab.setAttribute("aria-label", label + " 도구 상자 선택");
    tab.setAttribute("aria-controls", toolbar.id);
    tab.title = label + " 도구 상자 선택 · 메뉴는 옆 화살표 또는 아래 방향키";
    tab.onclick = () => {
      if (busy() || doc.querySelector("dialog[open]")) return;
      closePeers(tab);
      selectContext(entry.id);
    };
    tab.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229 || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        openMenu(entry.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePeers(tab);
        restoreFocus();
      }
    });
    entry.dataset.splitMenu = "true";
    summary.setAttribute("aria-label", label + " 메뉴 열기");
    entry.before(tab);
    toolboxTabs.set(entry.id, tab);
  }
  for (const entry of menu.querySelectorAll<HTMLDetailsElement>(
    ":scope > details",
  ))
    entry
      .querySelector("summary")
      ?.addEventListener("click", () => selectContext(entry.id));
  menu.addEventListener(
    "pointerdown",
    (e) => {
      if (busy()) e.preventDefault();
    },
    true,
  );
  menu.addEventListener(
    "click",
    (e) => {
      if (busy()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  selectContext(activeContext);
  doc.addEventListener("rhwp:table-context", () => selectContext("table-menu"));
  mountMainMenuNavigation(menu, () => busy() || !!doc.querySelector("dialog[open]"), openMenu);
  // Native fields keep their own keys. Only menu navigation is handled here.
  menu.addEventListener(
    "toggle",
    (e) => {
      const target = e.target;
      if (
        target instanceof HTMLDetailsElement &&
        target.open &&
        target.parentElement === menu
      ) {
        selectContext(target.id);
        for (const other of entries)
          if (other !== target) other.removeAttribute("open");
      }
    },
    true,
  );
  menu.addEventListener("keydown", (e) => {
    if (
      e.isComposing ||
      e.keyCode === 229 ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement
    )
      return;
    const t = e.target as HTMLElement;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      // A closed child's summary retains focus after Escape. The next Escape
      // belongs to its open parent, not to the already closed child again.
      const open = t.closest("details[open]");
      open?.removeAttribute("open");
      if (open?.parentElement === menu) restoreFocus();
      else open?.querySelector<HTMLElement>("summary")?.focus();
    }
    if (
      t.tagName === "SUMMARY" &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
    ) {
      const list = [
          ...menu.querySelectorAll<HTMLElement>(":scope > details > summary"),
        ],
        i = list.indexOf(t);
      if (i < 0) return;
      e.preventDefault();
      e.stopPropagation();
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? list.length - 1
            : (i + (e.key === "ArrowRight" ? 1 : -1) + list.length) %
              list.length;
      list[next].focus();
    }
    if (t.tagName === "SUMMARY" && e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const d = t.parentElement! as HTMLDetailsElement;
      d.open = true;
      [
        ...d.querySelectorAll<HTMLElement>(
          "button:not(:disabled),select:not(:disabled),input:not(:disabled),summary",
        ),
      ]
        .find((b) => b !== t && b.getClientRects().length > 0)
        ?.focus();
    } else if (
      ["ArrowDown", "ArrowUp"].includes(e.key) &&
      t.tagName === "BUTTON"
    ) {
      const root = t.closest("details");
      const items = [
        ...(root?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),summary",
        ) ?? []),
      ].filter((b) => b.getClientRects().length > 0);
      const index = items.indexOf(t);
      if (index >= 0 && items.length) {
        e.preventDefault();
        e.stopPropagation();
        items[
          (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length
        ].focus();
      }
    }
  });
  const access = new WorkspaceAccess();
  for (const [letter, id] of Object.entries(menuAccessKeys)) {
    const summary = doc
      .getElementById(id)
      ?.querySelector<HTMLElement>("summary");
    if (summary) {
      summary.dataset.accessKey = letter.toUpperCase();
      summary.title = `Alt를 눌렀다 뗀 후 ${letter.toUpperCase()} · 편집기에 F10이 전달될 때 메뉴 접근(브라우저 도구막대와 충돌 가능)`;
    }
  }
  const announcement = doc.createElement("span");
  announcement.className = "workspace-sr-only";
  announcement.setAttribute("role", "status");
  menu.append(announcement);
  const hints = () => {
    menu.toggleAttribute("data-keytips", access.armed);
    announcement.textContent = access.armed
      ? "메뉴 접근: F 파일, E 편집, U 보기, D 입력, J 서식, W 쪽, R 보안, H 검토, K 도구. Esc 취소."
      : "";
  };
  const cancelAccess = () => {
    access.cancel();
    hints();
  };
  const allowed = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    return (
      !e.defaultPrevented &&
      !busy() &&
      !doc.querySelector("dialog[open]") &&
      !t.closest?.("#table-context-menu") &&
      doc.hasFocus() &&
      !(
        t !== doc.getElementById("input") &&
        t.closest?.("input,select,textarea,[contenteditable=true]")
      )
    );
  };
  doc.addEventListener(
    "keydown",
    (e) => {
      // Once inside a File/Edit dropdown, its observed local letter owns the
      // event, even if F10/Alt previously armed the top-level menu hints.
      if (localMenuLetter(e)) { cancelAccess(); return; }
      const action = access.keydown(
        { ...keyData(e), altGraph: e.getModifierState("AltGraph") },
        allowed(e),
      );
      hints();
      if (action.type === "open" || action.type === "dismiss") {
        e.preventDefault();
        e.stopPropagation();
        if (action.type === "open") openMenu(action.id);
        else {
          menu
            .querySelectorAll("details[open]")
            .forEach((d) => d.removeAttribute("open"));
          restoreFocus();
        }
      }
    },
    true,
  );
  doc.addEventListener(
    "keyup",
    (e) => {
      const action = access.keyup(
        { ...keyData(e), altGraph: e.getModifierState("AltGraph") },
        allowed(e),
      );
      hints();
      if (action.type === "hint")
        file.d.querySelector<HTMLElement>("summary")!.focus();
    },
    true,
  );
  doc.addEventListener("pointerdown", cancelAccess, true);
  doc.addEventListener("compositionstart", cancelAccess, true);
  doc.addEventListener("focusin", (e) => {
    if (
      (e.target as HTMLElement).closest?.(
        "dialog,input:not(#input),select,[contenteditable=true]",
      )
    )
      cancelAccess();
  });
  doc.defaultView?.addEventListener("blur", cancelAccess);
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) cancelAccess();
  });
  if (readDocument) mountWorkspaceChrome(doc, readDocument);
}

function keyData(e: KeyboardEvent) {
  return {
    key: e.key,
    code: e.code,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    repeat: e.repeat,
    isComposing: e.isComposing,
    keyCode: e.keyCode,
  };
}
