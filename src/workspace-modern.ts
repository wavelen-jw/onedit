import { editorChanged } from "./editor-state-adapter.js";
import { dialogShortcutHelp } from "./browser-shortcut-scope.js";
import type { FileLifecycle } from "./file-lifecycle.js";

/** UI2-1 rehosts existing command owners and complete draft forms. No Core,
 * selection, History, clipboard or file mutation lives in this shell. */
export function mountModernWorkspace(doc: Document, files: FileLifecycle, busy: () => boolean) {
  const header = doc.querySelector<HTMLElement>("body > header")!,
    menu = doc.getElementById("main-menu")!, toolbar = doc.getElementById("toolbar")!,
    format = doc.getElementById("format-bar")!, quick = doc.getElementById("workspace-quickbar")!;
  doc.body.classList.add("workspace-modern");
  header.setAttribute("aria-label", "문서 작업");
  const title = doc.getElementById("workspace-document-title")!;
  const identity = doc.createElement("div"); identity.id = "workspace-document-identity";
  const saved = doc.createElement("span"); saved.id = "workspace-save-state"; saved.setAttribute("role", "status");
  title.before(identity); identity.append(title, saved); header.append(quick);
  // Original file and History buttons, not proxies with a second admission path.
  const history = quick.querySelector(".tool-group"); if (history) quick.prepend(history);
  for (const [id, label] of [["save", "저장"], ["save-as", "다른 이름"], ["close-document", "닫기"]]) {
    const button = doc.getElementById(id)!;
    for (const node of button.childNodes) if (node.nodeType === Node.TEXT_NODE) node.textContent = label;
  }
  // UI1 split labels selected a toolbox, while the adjacent arrow opened its
  // menu. UI2 uses one familiar menu entry; the original summary listener stays.
  for (const entry of menu.querySelectorAll<HTMLElement>("[data-split-menu]")) entry.removeAttribute("data-split-menu");
  for (const tab of menu.querySelectorAll<HTMLElement>("[data-toolbox-tab]")) tab.hidden = true;
  const table = doc.getElementById("table-menu"), tools = doc.getElementById("workspace-8");
  if (table && tools) tools.before(table);

  // The existing context tools remain reachable, but do not add a permanent
  // fourth row. View > toolboxes still operates on these exact target elements.
  toolbar.hidden = true;
  toolbar.setAttribute("aria-label", "추가 문맥 도구");
  const more = doc.getElementById("toolbox-collapse") ?? doc.querySelector<HTMLButtonElement>('[data-toolbox-view="toolbar"]')!;
  if(more.id==="toolbox-collapse"){more.setAttribute("aria-label", "추가 문맥 도구 열기 또는 닫기");format.append(more);}
  more.addEventListener("click", () => {
    if (toolbar.hidden) return;
    // The original toggle first enforces its busy/modal guard. Move focus only
    // after it has actually opened this presentation-only drawer.
    const first = [...toolbar.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),summary")]
      .find(node => node.getClientRects().length > 0);
    first?.focus({preventScroll:true});
  });
  const style = format.querySelector<HTMLElement>(".style-unavailable");
  if (style) { style.textContent = "문단 스타일"; style.setAttribute("aria-disabled", "true"); style.setAttribute("role", "button"); }
  const panel = doc.getElementById("properties-toggle");
  if (panel) { panel.textContent = "속성"; format.append(panel); }
  const help = doc.createElement("details"), summary = doc.createElement("summary"), helpBody = doc.createElement("div");
  help.id = "workspace-help-menu"; summary.textContent = "도움말";
  helpBody.className = "workspace-menu-panel ui2-help-panel";
  const intro = doc.createElement("p"); intro.textContent = "메뉴에서 기능을 찾고, 빠른 서식은 Enter로 적용하거나 Esc로 취소하세요.";
  const keys = doc.createElement("p"); keys.textContent = "브라우저가 먼저 사용하는 단축키는 메뉴로 실행하세요. 추가 단축키는 도구에서 설정할 수 있습니다.";
  const dialogKeys = doc.createElement("p"); dialogKeys.dataset.dialogShortcutHelp=""; dialogKeys.textContent=dialogShortcutHelp;
  const browserKeys=doc.createElement("p");browserKeys.textContent="F5 셀 선택·F10 메뉴·Ctrl+K,N 번호 모양·Ctrl+Shift+Delete 글머리표는 편집기에 키가 전달될 때만 동작합니다. F7은 편집 명령에 연결하지 않고 브라우저에 맡깁니다. 입력창·IME·열린 대화상자가 우선입니다.";
  helpBody.append(intro, keys, dialogKeys, browserKeys); help.append(summary, helpBody); menu.append(help);
  summary.onclick = event => { if (busy() || doc.querySelector("dialog[open]")) event.preventDefault(); };
  help.addEventListener("toggle", () => {
    summary.setAttribute("aria-expanded", String(help.open));
    if (help.open) for (const entry of menu.querySelectorAll<HTMLDetailsElement>(":scope > details[open]")) if (entry !== help) entry.open = false;
  });
  const closeTools = (returnFocus: boolean) => {
    if (toolbar.hidden) return;
    // Preserve View checkbox/expanded synchronization via its original toggle.
    more.click(); if (returnFocus) (more.id==="toolbox-collapse"?more:doc.getElementById("input"))?.focus({preventScroll:true});
  };
  toolbar.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.isComposing || event.keyCode === 229 || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest("details[open]")) return;
    event.preventDefault(); event.stopPropagation(); closeTools(true);
  }, true);
  doc.addEventListener("pointerdown", event => {
    if (!(event.target instanceof Node)) return;
    if (!toolbar.contains(event.target) && !more.contains(event.target) && !menu.contains(event.target)) closeTools(false);
    if (!menu.contains(event.target)) help.open = false;
  });
  menu.addEventListener("toggle", event => {
    if (event.target instanceof HTMLDetailsElement && event.target !== help && event.target.open) help.open = false;
  }, true);
  // Existing file lifecycle is authoritative. A generated download is never
  // described as a confirmed save; errors/stale requests keep the original notice.
  const sync = () => {
    const state = files.state();
    const pendingCurrent=!!state.pending&&state.pending.documentId===files.adapter.documentId&&state.pending.revision===files.adapter.revision;
    const failure = state.request?.status === "failed" ? state.request.failure : undefined;
    const label = state.saving ? "저장 중" : state.busy ? "파일 처리 중"
      : failure === "unavailable" ? "사본 다운로드 필요"
      : failure === "permission" ? "저장 권한 없음"
      : failure ? "저장 실패"
      : pendingCurrent ? "내려받은 파일 확인 필요"
      : state.dirty ? "저장 필요" : state.request?.status === "completed" ? "저장됨" : "변경 없음";
    if (saved.textContent !== label) saved.textContent = label;
    saved.dataset.state = state.busy ? "busy" : failure && failure !== "unavailable" ? "error"
      : pendingCurrent || failure === "unavailable" ? "pending" : state.dirty ? "dirty" : "clean";
    saved.title = state.notice || label;
  };
  const observer = new MutationObserver(sync);
  const notice = doc.getElementById("file-status"); if (notice) observer.observe(notice, {subtree:true,childList:true,characterData:true});
  doc.addEventListener("rhwp:editor-state", event => { if (editorChanged(event, "storage")) sync(); });
  sync();
}
