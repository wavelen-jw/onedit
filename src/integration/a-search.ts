import { closeEditorDialog, showEditorDialog } from "../editor-popup-focus.js";
import { assertPictureFreeTextEdit } from "../search-object-safety.js";
import { formatInputGuard } from "./a-format-input-guard.js";
import { visibleManagerControls } from "../manager-layout.js";
import { revealCommandSelection } from "../command-state-integration.js";
import type { Interaction } from "../interaction.js";
import {
  sameContainer,
  paraIndex,
  nested,
  type Position,
  type Selection,
} from "../model.js";
export class TextSearch {
  private token?: ReturnType<Interaction["capture"]>;
  private selected = "";
  private baseline?: ReturnType<Interaction["capture"]>;
  private matches: { start: Position; end: Position }[] = [];
  private index = -1;
  constructor(readonly editor: Interaction) {}
  private scope: "document" | "body" | "selection" = "document";
  private ranges: { p: Position; end: number }[] = [];
  private scopeVersion?: { documentId: string; revision: number };
  setScope(
    scope: "document" | "body" | "selection",
    selection: Selection = this.editor.selection,
  ) {
    const ranges = scope === "selection" ? this.editor.targets(selection) : [];
    if (
      scope === "selection" &&
      (!["text", "cells"].includes(selection.kind) ||
        nested(selection.focus) ||
        !ranges.some((t) => t.end > t.p.offset))
    )
      throw Error("본문 텍스트 또는 일반 셀 블록을 먼저 선택하세요.");
    this.scope = scope;
    this.ranges = structuredClone(ranges);
    this.scopeVersion = this.editor.capture();
  }
  private inside(p: Position, end: number) {
    return this.ranges.some(
      (t) =>
        sameContainer(t.p, p) &&
        paraIndex(t.p) === paraIndex(p) &&
        p.offset >= t.p.offset &&
        end <= t.end,
    );
  }
  private adjustScope(
    changed: { start: Position; end: Position }[],
    text: string,
  ) {
    if (this.scope !== "selection") return;
    for (const t of this.ranges)
      for (const m of changed)
        if (
          sameContainer(t.p, m.start) &&
          paraIndex(t.p) === paraIndex(m.start)
        )
          t.end += Array.from(text).length - (m.end.offset - m.start.offset);
    this.scopeVersion = this.editor.capture();
  }
  repeatPrevious() {
    const selection=structuredClone(this.editor.selection);
    this.setScope('document');
    this.refresh(this.query,this.sensitive,this.cells);
    this.index=this.matches.findIndex(m=>selection.kind==='text'&&JSON.stringify(selection.anchor)===JSON.stringify(m.start)&&JSON.stringify(selection.focus)===JSON.stringify(m.end));
    return this.move(true);
  }
  query = "";
  sensitive = false;
  cells = true;
  refresh(query: string, sensitive: boolean, cells: boolean) {
    this.baseline = undefined;
    this.token = undefined;
    this.index = -1;
    this.matches = [];
    this.query = query;
    this.sensitive = sensitive;
    this.cells = cells;
    if (!query || /[\r\n]/.test(query))
      throw Error("한 문단 안에서 찾을 문자열을 입력하세요.");
    const a = this.editor.adapter;
    if (
      this.scope === "selection" &&
      (!this.scopeVersion ||
        this.scopeVersion.documentId !== a.documentId ||
        this.scopeVersion.revision !== a.revision)
    )
      throw Error("선택 범위가 만료되었습니다. 대화상자를 다시 여세요.");
    const hits = a.call(
      "searchAllText",
      query,
      sensitive,
      this.scope !== "body" && cells,
    );
    this.matches = hits.map((h: any) => {
      const c = h.cellContext;
      const p: Position = c
        ? {
            kind: "cell",
            sec: h.sec,
            para: c.parentPara,
            control: c.ctrlIdx,
            cell: c.cellIdx,
            cellPara: c.cellPara,
            offset: 0,
          }
        : { kind: "body", sec: h.sec, para: h.para, offset: 0 };
      a.validate(p);
      const actual = Array.from(a.text(p))
        .slice(h.charOffset, h.charOffset + h.length)
        .join("");
      if (
        (sensitive ? actual : actual.toLowerCase()) !==
        (sensitive ? query : query.toLowerCase())
      )
        throw Error("Core 검색 위치를 확인할 수 없습니다.");
      return {
        start: { ...p, offset: a.logical(p, h.charOffset) },
        end: { ...p, offset: a.logical(p, h.charOffset + h.length) },
      };
    });
    if (this.scope === "selection")
      this.matches = this.matches.filter((m) =>
        this.inside(m.start, m.end.offset),
      );
    this.baseline = this.editor.capture();
    return this.matches.length;
  }
  move(backward = false) {
    if (
      this.baseline &&
      (this.baseline.documentId !== this.editor.adapter.documentId ||
        this.baseline.revision !== this.editor.adapter.revision)
    )
      throw Error("문서가 변경되었습니다. 다시 찾으세요.");
    if (!this.matches.length) return "검색 결과 없음";
    this.index =
      this.index < 0
        ? backward
          ? this.matches.length - 1
          : 0
        : (this.index + (backward ? -1 : 1) + this.matches.length) %
          this.matches.length;
    const m = this.matches[this.index];
    this.editor.point(m.start);
    this.editor.point(m.end, true);
    this.token = this.editor.capture();
    this.selected = JSON.stringify(this.editor.selection);
    return `${this.index + 1} / ${this.matches.length}`;
  }
  allReason(): string {
    const a = this.editor.adapter;

    if (a.scope !== "edit" || a.documentLocked) return "읽기 전용 문서입니다.";
    if (
      this.scope === "document" && this.cells &&
      a
        .call("getCellParagraphPaths")
        .targets.some((t: any) => t.path.length > 1)
    )
      return "중첩 표가 있는 문서의 모두 바꾸기는 미지원입니다.";
    return "";
  }
  replaceAll(text: string) {
    const e = this.editor,
      a = e.adapter;
    const reason = this.allReason();
    if (reason) throw Error(reason);
    if (
      !this.baseline ||
      this.baseline.documentId !== a.documentId ||
      this.baseline.revision !== a.revision
    )
      throw Error("검색 결과가 만료되었습니다. 다시 찾으세요.");
    const expectedSelection = this.token?.selection ?? this.baseline.selection;
    if (JSON.stringify(expectedSelection) !== JSON.stringify(e.selection))
      throw Error("검색 대상 선택이 변경되었습니다. 다시 찾으세요.");
    if (/[\r\n]/.test(text))
      throw Error("여러 문단으로 바꾸기는 미지원입니다.");
    for (const m of this.matches) {
      a.assertEditable(m.start);
      assertPictureFreeTextEdit(a, m.start);
      if (m.start.kind === "cell") a.assertTextOnly(m.start);
      else if (
        m.end.offset - m.start.offset !==
          a.textOffset(m.end) - a.textOffset(m.start) ||
        a
          .inline(m.start)
          .some((t) => t.offset >= m.start.offset && t.offset < m.end.offset)
      )
        throw Error("개체를 가로지르는 바꾸기는 미지원입니다.");
    }
    if (
      !this.matches.length ||
      this.matches.every(
        (m) =>
          Array.from(a.text(m.start))
            .slice(a.textOffset(m.start), a.textOffset(m.end))
            .join("") === text,
      )
    )
      return 0;
    const count = this.matches.length;
    const position = { ...this.matches[0].start };
    e.selection = e.history.transact("모두 바꾸기", e.selection, () => {
      if (this.scope === "document" && this.cells) {
        const result = a.call("replaceAll", this.query, text, this.sensitive);
        if (result.count !== count)
          throw Error("Core 치환 범위가 검색 결과와 다릅니다.");
      } else {
        // Core search results are ordered; reverse edits keep earlier offsets valid.
        for (const m of [...this.matches].reverse()) {
          a.remove(m.start, m.end);
          if (text) a.insert(m.start, text);
        }
      }
      a.validate(position);
      return { kind: "caret", focus: position };
    });
    e.typing = {};
    this.adjustScope(this.matches, text);
    this.refresh(this.query, this.sensitive, this.cells);
    return count;
  }
  replace(text: string) {
    if (!this.token || this.selected !== JSON.stringify(this.editor.selection))
      throw Error("먼저 바꿀 검색 결과를 선택하세요.");
    if (/[\r\n]/.test(text))
      throw Error("여러 문단으로 바꾸기는 미지원입니다.");
    const a = this.editor.adapter,
      m = this.matches[this.index];
    if (
      this.token.documentId !== a.documentId ||
      this.token.revision !== a.revision
    )
      throw Error("만료된 검색 결과입니다.");
    a.assertEditable(m.start);
    assertPictureFreeTextEdit(a, m.start);
    // Never replace an inline object hidden between text matches.
    if (
      m.start.kind === "body" &&
      (m.end.offset - m.start.offset !==
        a.textOffset(m.end) - a.textOffset(m.start) ||
        a
          .inline(m.start)
          .some((t) => t.offset >= m.start.offset && t.offset < m.end.offset))
    )
      throw Error("개체를 포함한 검색 결과 바꾸기는 미지원입니다.");
    if (m.start.kind === "cell") a.assertTextOnly(m.start);
    const old = Array.from(a.text(m.start))
      .slice(a.textOffset(m.start), a.textOffset(m.end))
      .join("");
    if (old !== text) this.editor.execute({ type: "insert", text }, this.token);
    this.adjustScope([m], text);
    this.refresh(this.query, this.sensitive, this.cells);
  }
}
export function mountSearch(
  editor: Interaction,
  changed: () => void,
  closed: () => void,
) {
  const root = document.createElement("dialog");
  root.id = "search-dialog";
  root.setAttribute("aria-labelledby", "search-dialog-title");
  root.innerHTML = `
    <div class="search-heading"><h2 id="search-dialog-title">찾기</h2><button type="button" data-action="close" aria-label="찾기 닫기">×</button></div>
    <div class="search-row"><label>찾을 내용 <input type="search" name="query"></label>
      <button type="button" data-action="previous" aria-label="이전 결과">↑</button><button type="button" data-action="next" aria-label="다음 결과">↓</button></div>
    <div class="search-row search-replace-row" hidden><label>바꿀 내용 <input name="replacement"></label>
      <button type="button" data-action="replace">바꾸기</button><button type="button" data-action="all">모두 바꾸기</button></div>
    <div class="search-summary"><output aria-live="polite"></output><button type="button" data-action="mode">바꾸기 열기</button></div>
    <details><summary>범위·옵션</summary><label>검색 범위 <select name="scope"><option value="document">본문·일반 표 셀</option><option value="body">본문만</option><option value="selection">처음 선택한 영역</option></select></label>
    <label><input type="checkbox" name="case">대소문자 구분</label><label><input type="checkbox" name="cells" checked>일반 표 셀 포함</label></details>`;
  document.body.append(root);
  const inputGuard = formatInputGuard(root);
  const get = (n: string) =>
    root.querySelector<HTMLInputElement>(`[name="${n}"]`)!;
  const status = root.querySelector("output")!;
  const search = new TextSearch(editor);
  let replacing = false;
  const mode = (replace: boolean, focus?: "query" | "replacement") => {
    replacing = replace;
    root.querySelector<HTMLElement>(".search-replace-row")!.hidden = !replace;
    root.querySelector("#search-dialog-title")!.textContent = replace ? "찾기 및 바꾸기" : "찾기";
    const toggle = root.querySelector<HTMLButtonElement>('[data-action="mode"]')!;
    toggle.textContent = replace ? "바꾸기 닫기" : "바꾸기 열기";
    toggle.setAttribute("aria-expanded", String(replace));
    if (focus) get(focus).focus();
  };
  let signature = "";
  let scopeError = "";
  let dialogTarget = editor.capture();
  let scopeSelection = structuredClone(editor.selection);
  let scopeOrigin = editor.capture();
  let expired = "";
  // Search-owned navigation/edits advance dialogTarget before repaint. External
  // changes must not silently refresh an old draft against a different target.
  function sync() {
    if (!root.open) return;
    if (!expired) {
      if (
        dialogTarget.documentId !== editor.adapter.documentId ||
        dialogTarget.revision !== editor.adapter.revision
      )
        expired = "대화상자 대상 문서가 변경되었습니다. 닫고 다시 여세요.";
      else if (JSON.stringify(dialogTarget.selection) !== JSON.stringify(editor.selection))
        expired = "대화상자 대상 선택이 변경되었습니다. 닫고 다시 여세요.";
    }
    if (expired) {
      signature = "";
      status.textContent = expired;
      for (const action of ["next", "previous", "replace", "all"])
        root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled = true;
    }
  }
  function act(action: string) {
    try {
      if (action === "close") {
        closeEditorDialog(root);
        return;
      }
      if (!root.open) return;
      if (action === "mode") { mode(!replacing, replacing ? "query" : "replacement"); return; }
      sync();
      if (expired) throw Error(expired);
      if (scopeError) throw Error(scopeError);
      const key = JSON.stringify([
        get("scope").value,
        get("query").value,
        get("case").checked,
        get("cells").checked,
        editor.adapter.documentId,
        editor.adapter.revision,
      ]);
      if (action === "all") {
        if (
          dialogTarget.documentId !== editor.adapter.documentId ||
          dialogTarget.revision !== editor.adapter.revision
        )
          throw Error("대화상자 대상 문서가 변경되었습니다. 닫고 다시 여세요.");
        if (JSON.stringify(dialogTarget.selection) !== JSON.stringify(editor.selection))
          throw Error("대화상자 대상 선택이 변경되었습니다. 닫고 다시 여세요.");
        search.refresh(
          get("query").value,
          get("case").checked,
          get("cells").checked,
        );
        const count = search.replaceAll(get("replacement").value);
        signature = "";
        status.textContent = `${count}개 바꾸기 완료 (지정 범위)`;
      } else if (action === "replace") {
        if (key !== signature)
          throw Error("검색 조건이 변경되었습니다. 다시 찾으세요.");
        search.replace(get("replacement").value);
        signature = "";
        status.textContent = "바꾸기 완료. 다음 찾기를 선택하세요.";
      } else {
        if (key !== signature) {
          search.refresh(
            get("query").value,
            get("case").checked,
            get("cells").checked,
          );
          signature = key;
        }
        status.textContent = search.move(action === "previous");
      }
      const prior = dialogTarget;
      dialogTarget = editor.capture();
      changed();
      if (action === "next" || action === "previous")
        revealCommandSelection(root.ownerDocument, prior, dialogTarget);
    } catch (e) {
      status.textContent = String(e);
    }
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((b) => (b.onclick = () => {
      if (!b.disabled && (b.dataset.action === "close" || inputGuard.ready()))
        act(b.dataset.action!);
    }));
  root.addEventListener("keydown", (e) => {
    // A type=search input may consume Escape itself (clear affordance) rather
    // than send dialog.cancel. Close this panel explicitly outside composition.
    if (e.key === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
        !e.isComposing && e.keyCode !== 229 && inputGuard.ready()) {
      e.preventDefault();
      e.stopPropagation();
      closeEditorDialog(root);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !e.isComposing && e.keyCode !== 229 &&
        ["f", "h"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && inputGuard.ready()) mode(e.key.toLowerCase() === "h", "query");
      return;
    }
    if (e.key === "Tab" && !e.isComposing && e.keyCode !== 229) {
      const controls = visibleManagerControls(root),
        at = controls.indexOf(document.activeElement as HTMLElement);
      if (controls.length && (at < 0 || (e.shiftKey ? at === 0 : at === controls.length - 1))) {
        e.preventDefault();
        controls[e.shiftKey ? controls.length - 1 : 0].focus();
      }
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement,
      button = target.closest<HTMLButtonElement>("button[data-action]");
    if (e.key !== "Enter" && !(e.key === " " && button)) return;
    if (e.isComposing || e.keyCode === 229 || e.repeat || !inputGuard.ready() ||
        e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter" && button) {
      e.preventDefault(); // Suppress the native click: exactly one existing action.
      if (!button.disabled) button.click();
    } else if (e.key === "Enter" && (target === get("query") || target === get("replacement"))) {
      e.preventDefault();
      act("next");
    }
  });
  function syncAll() {
    search.cells = get("cells").checked;
    const button = root.querySelector<HTMLButtonElement>(
      '[data-action="all"]',
    )!;
    const reason = expired || scopeError || search.allReason();
    button.disabled = !!reason;
    button.title = reason || "선택한 검색 범위의 일치 항목을 한 번에 바꿉니다.";
  }
  get("cells").addEventListener("change", syncAll);
  get("query").addEventListener("input", () => {
    signature = "";
    if (!expired) status.textContent = "";
  });
  get("scope").addEventListener("change", () => {
    try {
      sync();
      if (expired) throw Error(expired);
      if (
        scopeOrigin.documentId !== editor.adapter.documentId ||
        scopeOrigin.revision !== editor.adapter.revision
      )
        throw Error("원래 선택 범위가 만료되었습니다. 다시 여세요.");
      search.setScope(
        get("scope").value as "document" | "body" | "selection",
        scopeSelection,
      );
      scopeError = "";
      signature = "";
      syncAll();
    } catch (e) {
      scopeError = String(e);
      status.textContent = scopeError;
      signature = "";
      syncAll();
    }
  });
  root.addEventListener("close", () => { inputGuard.close(); closed(); });
  return {
    sync,
    previous() {
      if(root.open)return;
      if(!get('query').value){this.show();return;}
      // Reuse the current dialog options; never reuse stale match addresses.
      search.query=get('query').value;search.sensitive=get('case').checked;search.cells=get('cells').checked;
      const prior=editor.capture();
      status.textContent=search.repeatPrevious();changed();
      revealCommandSelection(root.ownerDocument,prior,editor.capture());
      closed();
    },
    get open() {
      return root.open;
    },
    show(replace = false) {
      inputGuard.open();
      expired = "";
      for (const action of ["next", "previous", "replace", "all"])
        root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled = false;
      signature = "";
      scopeError = "";
      status.textContent = "";
      dialogTarget = editor.capture();
      scopeOrigin = editor.capture();
      scopeSelection = structuredClone(editor.selection);
      get("scope").value = "document";
      search.setScope("document");
      syncAll();
      mode(replace);
      root.querySelector("details")!.open = false;
      showEditorDialog(root);
      get("query").focus();
    },
  };
}
