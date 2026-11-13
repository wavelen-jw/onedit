import type { Interaction } from "./interaction.js";
import type { Position } from "./model.js";
import { excludedMenuReason, unavailableMenuButton } from "./menu-scope.js";

export type OutlineEntry = {
  section: number; paragraph: number; level: number;
  number: string; title: string; page: number;
};
export type OutlineSnapshot = {
  documentId: string; revision: number; entries: OutlineEntry[];
};

// Read the Core's outline classification; never infer headings from visible text.
export function outlineSnapshot(editor: Interaction): OutlineSnapshot {
  const a = editor.adapter;
  if (typeof a.doc.getOutlineNavigation !== "function")
    throw Error("설치 Core의 개요 조회가 없어 이 작업 창을 사용할 수 없습니다.");
  const raw = a.call("getOutlineNavigation");
  if (!raw || !Array.isArray(raw.outline)) throw Error("개요 조회 응답을 확인할 수 없습니다.");
  const seen = new Set<string>();
  const entries = raw.outline.map((v: OutlineEntry): OutlineEntry => {
    if (!v || ![v.section, v.paragraph, v.level].every(n => Number.isSafeInteger(n) && n >= 0)
      || !Number.isSafeInteger(v.page) || v.page < 1 || v.page > a.pageCount
      || typeof v.title !== "string" || typeof v.number !== "string")
      throw Error("개요의 문단·쪽 위치가 올바르지 않습니다.");
    const key = `${v.section}:${v.paragraph}`;
    if (seen.has(key)) throw Error("중복된 개요 위치는 이동하지 않습니다.");
    seen.add(key);
    a.validate({ kind: "body", sec: v.section, para: v.paragraph, offset: 0 });
    return { section: v.section, paragraph: v.paragraph, level: v.level, number: v.number, title: v.title, page: v.page };
  });
  return { documentId: a.documentId, revision: a.revision, entries };
}

export function outlinePosition(editor: Interaction, snapshot: OutlineSnapshot, entry: OutlineEntry, busy = false): Position {
  if (busy) throw Error("입력·저장 또는 열린 대화상자를 마친 후 개요로 이동하세요.");
  const a = editor.adapter;
  if (a.documentId !== snapshot.documentId || a.revision !== snapshot.revision)
    throw Error("문서가 변경되어 이전 개요로 이동하지 않았습니다. 갱신된 목록에서 다시 선택하세요.");
  if (!snapshot.entries.includes(entry)) throw Error("현재 목록에 없는 개요입니다.");
  // Recheck the actual Core target before changing selection, including a late event.
  const actual = outlineSnapshot(editor).entries.find(v => v.section === entry.section && v.paragraph === entry.paragraph);
  if (!actual || JSON.stringify(actual) !== JSON.stringify(entry)) throw Error("개요 위치가 변경되었습니다. 목록을 다시 확인하세요.");
  return { kind: "body", sec: entry.section, para: entry.paragraph, offset: 0 };
}

export function mountOutlineNavigation(doc: Document, editor: Interaction, actions: {
  busy: () => boolean; navigate: (position: Position) => void; focus: () => void; error: (error: unknown) => void;
}) {
  const aside = doc.querySelector<HTMLElement>("aside")!, view = doc.querySelector("#view-menu [data-view-panel]");
  if (!aside || !view) throw Error("개요 작업 창을 연결할 화면이 없습니다.");
  // V16 excludes this task pane, not the retained paragraph outline/number
  // commands. Do not query Core or mount a hidden, callable navigation pane.
  if (excludedMenuReason('V16')) {
    const buttons = [view, doc.querySelector('#toolbar .tool-group[aria-label="쪽 탐색·배율"]')]
      .filter((host): host is Element => !!host).map(host => {
        const b = unavailableMenuButton(doc, 'V16', '개요 작업 창', '');
        b.dataset.outlineToggle = ''; (host === view ? view.querySelector('[data-view-slot="sidebar"]') ?? view : host).append(b); return b;
      });
    return { sync() {}, dispose() { buttons.forEach(b => b.remove()); } };
  }
  const group = doc.createElement("details"), summary = doc.createElement("summary");
  group.dataset.outlineMenu = ""; summary.textContent = "작업 창"; group.append(summary);
  const panel = doc.createElement("section"); panel.id = "outline-panel"; panel.hidden = true;
  panel.setAttribute("aria-label", "개요 보기");
  const heading = doc.createElement("h2"); heading.textContent = "개요 보기";
  const close = doc.createElement("button"); close.type = "button"; close.textContent = "개요 닫기";
  const note = doc.createElement("output"); note.setAttribute("aria-live", "polite");
  const list = doc.createElement("ol"); list.setAttribute("aria-label", "문서 개요");
  const help = doc.createElement("small"); help.textContent = "개요 번호가 지정된 본문만 표시합니다. 항목을 누르면 해당 문단으로 이동합니다. 일반 번호·책갈피·개요 재배열은 이 창에서 지원하지 않습니다.";
  panel.append(heading, close, note, list, help); aside.prepend(panel); view.append(group);
  const buttons: HTMLButtonElement[] = [];
  let snapshot: OutlineSnapshot | undefined, cache = "", failure = "", disposed = false;
  const blocked = () => actions.busy() || !!doc.querySelector("dialog[open]");
  const visible = () => !panel.hidden && !aside.hidden;
  const text = (el: HTMLElement, value: string) => { if (el.textContent !== value) el.textContent = value; };
  const collapse = () => { panel.hidden = true; sync(); actions.focus(); };
  function toggle() {
    if (blocked() || failure) return;
    if (visible()) { collapse(); return; }
    panel.hidden = false; aside.hidden = false;
    (doc.getElementById("view-menu") as HTMLDetailsElement).open = false;
    sync(); (list.querySelector<HTMLElement>("[aria-current=true]") ?? list.querySelector<HTMLElement>("button") ?? close).focus();
  }
  for (const host of [group, doc.querySelector('#toolbar .tool-group[aria-label="쪽 탐색·배율"]')]) {
    if (!host) continue;
    const b = doc.createElement("button"); b.type = "button"; b.textContent = "개요 보기";
    b.dataset.outlineToggle = ""; b.setAttribute("aria-controls", panel.id); b.onclick = toggle; host.append(b); buttons.push(b);
  }
  close.onclick = collapse;
  function sync() {
    if (disposed) return;
    const a = editor.adapter, key = JSON.stringify([a.documentId, a.revision, a.pageCount]);
    if (key !== cache) {
      cache = key; snapshot = undefined; failure = ""; list.replaceChildren();
      try {
        snapshot = outlineSnapshot(editor);
        for (const entry of snapshot.entries) {
          const captured = snapshot, li = doc.createElement("li"), b = doc.createElement("button");
          b.type = "button"; b.dataset.outlineTarget = `${entry.section}:${entry.paragraph}`;
          b.style.setProperty("--outline-level", String(Math.min(entry.level, 9)));
          b.textContent = `${entry.number} ${entry.title} · ${entry.page}쪽`;
          b.title = `수준 ${entry.level} · ${entry.number} ${entry.title} · ${entry.page}쪽`;
          b.onclick = () => {
            try {
              const p = outlinePosition(editor, captured, entry, blocked());
              actions.navigate(p); sync(); actions.focus();
            } catch (error) { actions.error(error); sync(); }
          };
          li.append(b); list.append(li);
        }
      } catch (error) { failure = String(error); }
    }
    const why = failure || (blocked() ? "입력·저장 또는 열린 대화상자를 먼저 마치세요." : "");
    for (const b of [...buttons, ...list.querySelectorAll<HTMLButtonElement>("button")]) {
      if (b.disabled !== !!why) b.disabled = !!why;
      if (buttons.includes(b)) {
        const title = why || "개요 번호 문단을 찾아 이동합니다. 문서 내용은 바꾸지 않습니다.";
        if (b.title !== title) b.title = title;
        const expanded = String(visible()); if (b.getAttribute("aria-expanded") !== expanded) b.setAttribute("aria-expanded", expanded);
      }
    }
    const p = editor.selection.focus;
    for (const b of list.querySelectorAll<HTMLButtonElement>("button")) {
      const current = String(p.kind === "body" && b.dataset.outlineTarget === `${p.sec}:${p.para}`);
      if (b.getAttribute("aria-current") !== current) b.setAttribute("aria-current", current);
    }
    text(note, why || (snapshot?.entries.length ? `${snapshot.entries.length}개 개요 · 문단 첫 위치로 이동` : "개요 번호가 지정된 본문 문단이 없습니다."));
  }
  panel.addEventListener("keydown", e => {
    if (e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); collapse(); return; }
    if (!['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
    const items = [...list.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = items.indexOf(doc.activeElement as HTMLButtonElement); if (i < 0) return;
    e.preventDefault(); e.stopPropagation();
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    items[next]?.focus();
  });
  const observer = new MutationObserver(sync);
  observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  observer.observe(aside, { attributes: true, attributeFilter: ["hidden"] });
  sync();
  return { sync, dispose() { disposed = true; observer.disconnect(); panel.remove(); group.remove(); buttons.forEach(b => b.remove()); } };
}
