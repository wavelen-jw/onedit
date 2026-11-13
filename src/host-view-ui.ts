import { mountStatusNavigation } from "./status-navigation.js";

const bindings = new WeakMap<Document, {
  busy: () => boolean;
  sync: () => void;
  dispose: () => void;
}>();

/** Host-only presentation for the existing View controller. No edit/File API. */
export function connectHostViewUI(doc: Document, busy: () => boolean) {
  const existing = bindings.get(doc);
  if (existing) { existing.busy = busy; existing.sync(); return existing.dispose; }
  const input = doc.getElementById("input"), menu = doc.getElementById("view-menu"),
    status = doc.getElementById("view-status"), footer = doc.querySelector("footer");
  // Only consume the real controller's DOM/state; never synthesize view state.
  if (!input || !menu || !status || !footer || doc.getElementById("page-navigation")) return;
  const focus = () => input.focus({ preventScroll: true });
  const bar = doc.createElement("span"); bar.id = "page-navigation";
  bar.className = "host-view-navigation";
  bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "문서 보기·쪽 탐색");
  footer.classList.add("host-view-footer"); footer.append(bar);
  const binding = { busy, sync: () => {}, dispose: () => {} };
  const blocked = () => binding.busy() || !!doc.querySelector("dialog[open]") || status.dataset.viewBusy === "true";
  const proxies: HTMLButtonElement[] = [];
  for (const [label, action] of [["이전 쪽", "previous"], ["다음 쪽", "next"],
    ["축소", "out"], ["100%", "actual"], ["확대", "in"], ["폭 맞춤", "width"]]) {
    const button = doc.createElement("button"); button.type = "button";
    button.textContent = label; button.dataset.hostViewAction = action;
    const source = () => menu.querySelector<HTMLButtonElement>(`[data-view-action="${action}"]`);
    button.onclick = () => { const real = source(); if (blocked() || !real || real.disabled) return; real.click(); focus(); };
    proxies.push(button); bar.append(button);
  }
  const controls = mountStatusNavigation(doc, focus, blocked);
  const sync = () => {
    for (const button of proxies) {
      const source = menu.querySelector<HTMLButtonElement>(`[data-view-action="${button.dataset.hostViewAction}"]`);
      button.disabled = blocked() || !source || source.disabled;
      button.title = !source ? "기존 보기 명령이 연결되지 않았습니다." : blocked() ? "입력·저장·대화상자 작업을 마친 뒤 사용하세요." : source.title || button.textContent!;
    }
    controls.sync();
  };
  const observer = new MutationObserver(sync);
  observer.observe(status, {childList:true,attributes:true});
  observer.observe(doc.body, {subtree:true,attributes:true,attributeFilter:["open"]});
  doc.addEventListener("rhwp:editor-state", sync);
  const dispose = () => {
    if (bindings.get(doc) !== binding) return;
    observer.disconnect(); doc.removeEventListener("rhwp:editor-state", sync);
    doc.defaultView?.removeEventListener("pagehide", dispose);
    controls.dispose(); bar.remove(); footer.classList.remove("host-view-footer");
    bindings.delete(doc);
  };
  binding.sync = sync; binding.dispose = dispose; bindings.set(doc, binding);
  doc.defaultView?.addEventListener("pagehide", dispose, {once:true});
  sync(); return dispose;
}
