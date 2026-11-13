import {activeWorkset,activeMenuDemand,withMenuDemand} from "./active-workset.js";
// View presentation only: never reads/writes document, Selection or History.
// This is toolbar visibility, not the excluded U24 toolbar customization.
export function mountToolboxView(doc: Document, blockedReason: () => string, focusEditor: () => void) {
  const menu = doc.getElementById("main-menu")!, basic = doc.getElementById("toolbar")!,
    formatting = doc.getElementById("format-bar")!, panel = doc.querySelector<HTMLElement>("[data-view-panel]")!;
  const group = doc.createElement("details"), summary = doc.createElement("summary");
  group.id = "toolbox-view-menu"; summary.textContent = "도구 상자"; group.append(summary);
  const basicEntry = doc.createElement("button"), formatEntry = doc.createElement("button"), collapse = doc.createElement("button");
  for (const [button, target, label] of [[basicEntry, basic, "기본"], [formatEntry, formatting, "서식"]] as const) {
    button.type = "button"; button.textContent = label; button.dataset.toolboxView = target.id;
    button.setAttribute("aria-controls", target.id); button.onclick = () => toggle(target);
    group.append(button);
  }
  // The UI1 View frame rehosts these same source buttons, not new toggles.
  const slot = panel.querySelector('[data-view-slot="toolbox"]');
  if (slot) slot.append(basicEntry, formatEntry); else panel.append(group);
  collapse.type = "button"; collapse.id = "toolbox-collapse"; collapse.className = "workspace-toolbox-collapse";
  collapse.setAttribute("aria-label", "기본 도구 상자 접기/펴기"); collapse.setAttribute("aria-controls", basic.id);
  collapse.onclick = () => toggle(basic); // Menu toggles remain; no permanent collapse button.
  const view=doc.getElementById("view-menu") as HTMLDetailsElement;
  const sync = () => {
    if(activeWorkset(doc)&&view&&!activeMenuDemand(view))return;
    const reason = blockedReason();
    for (const [button, target] of [[basicEntry, basic], [formatEntry, formatting], [collapse, basic]] as const) {
      button.disabled = !!reason; button.title = reason || (button === collapse ? "기본 도구 상자 접기/펴기" : `${button.textContent} 도구 상자 표시`);
      button.setAttribute("aria-disabled", String(!!reason));
      if (button !== collapse) button.setAttribute("aria-pressed", String(!target.hidden));
      button.setAttribute("aria-expanded", String(!target.hidden));
    }
    collapse.textContent = basic.hidden ? "⌄" : "⌃";
  };
  function toggle(target: HTMLElement) {
    if (blockedReason()) { sync(); return; }
    target.hidden = !target.hidden;
    // A hidden owner must not retain an open popup/captured draft.
    if (target.hidden) for (const popup of target.querySelectorAll<HTMLDetailsElement>("details[open]")) popup.open = false;
    for (const popup of menu.querySelectorAll<HTMLDetailsElement>("details[open]")) popup.open = false;
    sync(); focusEditor();
  }
  const doubleClick = (event: MouseEvent) => {
    const tab = event.target instanceof Element ? event.target.closest("[data-toolbox-tab]") : null;
    if (!tab || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    event.preventDefault(); toggle(basic);
  };
  menu.addEventListener("dblclick", doubleClick);
  const observer = new MutationObserver(sync);
  if(!activeWorkset(doc))observer.observe(doc.body, {subtree: true, attributes: true, attributeFilter: ["open"]});
  const opening=()=>withMenuDemand(view,sync);
  view?.addEventListener("rhwp:menu-opening",opening);
  sync();
  return {sync, dispose() {view?.removeEventListener("rhwp:menu-opening",opening);observer.disconnect();menu.removeEventListener("dblclick", doubleClick);group.remove();basicEntry.remove();formatEntry.remove();collapse.remove();basic.hidden = formatting.hidden = false;}};
}
