import type { Interaction } from "../interaction.js";
import { sameFormatTarget } from "./a-format-input-guard.js";
import { observeStyle } from "../style-observation.js";
export function styleState(editor: Interaction) {
  const captured = editor.capture();
  const targets = editor.styleTargets(editor.selection, true);
  const observations = targets.map(({ p }) => observeStyle(editor.adapter, p));
  const rows = observations.map((row) => row.style);
  if (!sameFormatTarget(captured, editor.capture()))
    throw Error("스타일 조회 대상 문서·리비전·선택이 변경되었습니다.");
  return {
    ...(rows.every((row) => row.id === rows[0]?.id)
      ? rows[0]
      : { name: "혼합", id: undefined }),
    observations,
  };
}

function referenceText(rows: ReturnType<typeof observeStyle>[]) {
  return rows
    .map((row, index) => {
      const p = row.target;
      const where =
        p.kind === "body"
          ? `본문 문단 ${p.para + 1}`
          : `셀 ${p.cell + 1} 문단 ${p.cellPara + 1}`;
      const actualCharacters = row.characters.map(
        ({ properties: c }) =>
          `${c.fontFamily} ${Number(c.fontSize) / 100} pt${c.bold ? " 굵게" : ""}${c.italic ? " 기울임" : ""}${c.underline ? " 밑줄" : ""}`,
      );
      return (
        `${index + 1}. ${where}: 스타일 ${row.style.name} (ID ${row.style.id}), ` +
        `문단 참조 ${row.paragraph.paraShapeId} / 기본 ${row.defaults.paragraph.paraShapeId}, ` +
        `글자 참조 ${row.characterReferences.join(", ")} / 기본 ${row.defaults.character.charShapeId}. ` +
        `현재 조회값: 정렬 ${row.paragraph.alignment}, 줄 간격 ${row.paragraph.lineSpacing} (${row.paragraph.lineSpacingType}); 글자 ${[...new Set(actualCharacters)].join(" / ")}. ` +
        (row.paragraphMatchesDefault && !row.differingCharacterRuns
          ? "조회한 참조는 스타일 기본값과 같습니다. 화면·저장 검증 결과는 별도입니다."
          : "기본값과 다른 참조가 있습니다(직접 지정 또는 가져온 서식). 전체 서식 초기화 성공을 뜻하지 않습니다.")
      );
    })
    .join("\n");
}
export function mountStyles(
  root: HTMLElement,
  editor: Interaction,
  composing: () => boolean,
  apply: (id: number, captured: ReturnType<Interaction["capture"]>, resetDirect?: boolean) => void,
  manage?: () => void,
  blockedReason?: () => string,
) {
  const panel = root.querySelector<HTMLElement>("[data-style-panel]")!,
    state = document.createElement("p"),
    select = document.createElement("select"),
    preview = document.createElement("p"),
    button = document.createElement("button"),
    observed = document.createElement("p"),
    reset = document.createElement("button");
  select.id = "style-select";
  select.setAttribute("aria-label", "문단 스타일");
  button.id = "style-apply";
  button.type = "button";
  button.textContent = "선택 문단에 적용";
  reset.id = "style-reset";
  reset.type = "button";
  reset.textContent = "스타일 기본값으로 초기화";
  reset.title = "선택한 본문 문단의 직접 글자·문단 서식을 지우고 선택 스타일 기본값으로 되돌립니다. 실행 취소로 복원할 수 있습니다.";
  observed.id = "style-observed-format";
  observed.setAttribute("aria-live", "polite");
  panel.append(state, select, preview, button, observed, reset);
  const notice = document.createElement("p");
  notice.textContent =
    "‘선택 문단에 적용’은 직접 서식을 유지합니다. ‘스타일 기본값으로 초기화’는 본문 문단 전체의 직접 글자·문단 서식을 지웁니다. 같은 스타일도 명시적으로 초기화할 수 있으며 실행 취소가 가능합니다. 아래 실제 참조 조회는 화면·저장·한컴 동등성 인증이 아닙니다.";
  panel.append(notice);
  if (manage) {
    const open = document.createElement("button");
    open.type = "button";
    open.id = "style-manager-open";
    open.textContent = "스타일 관리…";
    open.onclick = manage;
    panel.append(open);
  }
  for (const name of [
    ...(manage ? [] : ["스타일 만들기·수정·삭제"]),
    "글자 스타일",
    "일반·중첩 셀 스타일",
  ]) {
    const b = document.createElement("button");
    b.type = "button";
    b.disabled = true;
    b.textContent = name + " (미지원)";
    panel.append(b);
  }
  let captured: ReturnType<Interaction["capture"]> | undefined;
  let catalogDocument: string | undefined;
  const refreshCatalog = () => {
    const key = `${editor.adapter.documentId}:${editor.adapter.revision}`;
    if (catalogDocument === key) return;
    const list = editor.adapter.call("getStyleList");
    select.replaceChildren(new Option("선택하세요", ""));
    for (const style of list)
      if (style.type === 0)
        select.add(new Option(style.name, String(style.id)));
    catalogDocument = key;
  };
  const refreshPreview = () => {
    if (select.value === "") {
      preview.textContent = "스타일 선택";
      return;
    }
    try {
      const detail = editor.adapter.call(
        "getStyleDetail",
        Number(select.value),
      );
      preview.textContent = `선택 스타일의 기본값: ${detail.charProps.fontFamily} · ${Number(detail.charProps.fontSize) / 100} pt · ${detail.paraProps.alignment}. 문단 참조 ${detail.paraProps.paraShapeId}, 글자 참조 ${detail.charProps.charShapeId}. 현재 실제 서식과 다를 수 있습니다.`;
    } catch {
      preview.textContent = "스타일 조회 실패";
      button.disabled = reset.disabled = true;
    }
  };
  const sync = () => {
    observed.textContent = "";
    try {
      if (composing()) throw Error(blockedReason?.() || "입력·저장 또는 대화상자 작업을 마친 뒤 사용하세요.");
      refreshCatalog();
      const current = styleState(editor);
      state.textContent = `현재 문단: ${current?.name ?? "조회 불가"}`;
      observed.textContent = referenceText(current.observations);
      try {
        editor.styleTargets();
      } catch (error) {
        state.textContent += ` · ${String(error)}`;
        observed.textContent = "적용은 보류 중입니다. " + observed.textContent;
        button.disabled = reset.disabled = select.disabled = true;
        select.value = "";
        preview.textContent = "현재 선택에서 스타일 적용을 사용할 수 없습니다.";
        return;
      }
      button.disabled = reset.disabled = select.disabled = false;
      if (captured && !sameFormatTarget(captured, editor.capture())) {
        state.textContent +=
          " — 대상 문서·리비전·선택이 변경되었습니다. 다시 여세요.";
        button.disabled = reset.disabled = select.disabled = true;
        select.value = "";
        preview.textContent =
          "대상이 변경되어 이전 스타일 초안을 취소했습니다. 다시 여세요.";
        return;
      }
      if (!(root as HTMLDetailsElement).open) {
        captured = undefined;
        select.value = current.id === undefined ? "" : String(current.id);
        refreshPreview();
      }
    } catch (e) {
      state.textContent = String(e);
      observed.textContent = "실제 서식 조회 불가. 적용은 계속 차단됩니다.";
      button.disabled = reset.disabled = select.disabled = true;
      select.value = "";
      preview.textContent = "현재 선택에서 스타일 적용을 사용할 수 없습니다.";
    }
  };
  let prepared = false;
  const prepare = () => {
    captured = undefined;
    sync();
    refreshCatalog();
    const current = styleStateSafe();
    select.value = current?.id === undefined ? "" : String(current.id);
    refreshPreview();
    if (!button.disabled) captured = editor.capture();
  };
  // Native details toggle is queued/coalesced. Prepare before its default click
  // so a delayed toggle never resets a style the user has already selected.
  root.querySelector("summary")!.addEventListener("click", () => {
    if (!(root as HTMLDetailsElement).open) {
      try {
        prepare();
        prepared = true;
      } catch (error) {
        captured = undefined;
        state.textContent = String(error);
        select.disabled = button.disabled = reset.disabled = true;
      }
    } else prepared = false;
  });
  root.addEventListener("toggle", () => {
    if (!(root as HTMLDetailsElement).open) {
      prepared = false;
      captured = undefined;
      return;
    }
    if (!prepared) {
      try {
        prepare();
        prepared = true;
      } catch (error) {
        captured = undefined;
        state.textContent = String(error);
        select.disabled = button.disabled = reset.disabled = true;
      }
    }
  });
  function styleStateSafe() {
    try {
      return styleState(editor);
    } catch {
      return undefined;
    }
  }
  select.addEventListener("change", refreshPreview);
  const submit = (resetDirect: boolean) => {
    if (button.disabled || reset.disabled || !captured || composing() || select.value === "")
      return;
    // D session path references must not resolve against a replacement document.
    let current: ReturnType<Interaction["capture"]>;
    try {
      if (
        captured.documentId !== editor.adapter.documentId ||
        captured.revision !== editor.adapter.revision
      )
        throw Error("스타일 선택 대상이 변경되었습니다.");
      current = editor.capture();
    } catch {
      state.textContent = "스타일 선택 대상이 변경되었습니다. 다시 여세요.";
      button.disabled = reset.disabled = select.disabled = true;
      captured = undefined;
      return;
    }
    if (!sameFormatTarget(captured, current)) {
      (root as HTMLDetailsElement).open = false;
      state.textContent = "스타일 선택 대상이 변경되었습니다. 다시 여세요.";
      button.disabled = reset.disabled = select.disabled = true;
      captured = undefined;
      return;
    }
    const target = captured;
    const id = Number(select.value);
    captured = undefined;
    (root as HTMLDetailsElement).open = false;
    try {
      apply(id, target, resetDirect);
    } finally {
      sync();
    }
  };
  button.onclick = () => submit(false);
  reset.onclick = () => submit(true);
  sync();
  return sync;
}
