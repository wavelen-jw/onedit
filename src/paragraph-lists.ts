import { validateNumberDefinition } from "./numbering-definitions.js";
import { numberRestartAvailable, restartScope } from "./numbering-restart.js";
import type { Props, Command } from "./model.js";
import type { FormatState } from "./formatting.js";

export type ListMode = "None" | "Number" | "Bullet" | "Outline";
export type ParagraphListChange = {
  // UI intent only, never serialized as a Core property. Untouched drafts omit it.
  explicit?: true;
  mode?: ListMode;
  definition?: number | "default";
  level?: number;
  custom?: import("./numbering-definitions.js").NumberDefinition;
};
export type ListCatalog = {
  numbers: { id: number; levelFormats: string[]; startNumber?: number }[];
  bullets: { id: number; char: string }[];
};
export const listGroup = "문단 번호·글머리표";
// One existing Command object per explicit operation, shared by both menu surfaces.
export const paragraphListItems = (["Number", "Bullet", "Outline", "None"] as const).map((mode, i) => ({
  id: `list-${mode}`, label: ["문단 번호 적용", "글머리표 적용", "개요 번호 적용", "번호·글머리표·개요 해제"][i], value: mode,
  command: {type: "paragraph-list", list: {mode}} as Extract<Command, {type: "paragraph-list"}>,
}));


// A pure plan: default definitions are allocated only INSIDE History.transact.
export function listPlan(raw: Props, change: ParagraphListChange, catalog: ListCatalog) {
  const props: Props = {};
  if (!change || typeof change !== "object" || Array.isArray(change)) throw Error("잘못된 문단 번호 요청입니다.");
  if (!Object.keys(change).length) return { props };
  if (Object.keys(change).some(k => !["mode", "definition", "level", "custom", "explicit"].includes(k)))
    throw Error("지원하지 않는 문단 번호 옵션입니다.");
  if (change.explicit !== undefined && change.explicit !== true) throw Error("잘못된 문단 번호 적용 의도입니다.");
  if (!["mode", "definition", "level", "custom"].some(k => k in change)) return { props };
  if (change.mode !== undefined && !["None", "Number", "Bullet", "Outline"].includes(change.mode))
    throw Error("지원하지 않는 문단 번호 종류입니다.");
  const mode = change.mode ?? raw.headType;
  if(change.custom !== undefined){
    validateNumberDefinition(change.custom);
    if(!["Number","Outline"].includes(String(mode)) || change.definition !== undefined) throw Error("사용자 정의는 문단 번호·개요 종류와 함께 선택하세요.");
  }
  if (!["None", "Number", "Bullet", "Outline"].includes(String(mode)))
    throw Error("개요 번호는 조회·보존만 지원합니다. 문단 번호 또는 글머리표를 선택하세요.");
  if (mode === "None") {
    if (change.definition !== undefined || change.level !== undefined || change.custom !== undefined)
      throw Error("번호 모양·수준을 변경하려면 문단 번호 또는 글머리표를 선택하세요.");
    if (raw.headType !== "None" || (change.explicit && change.mode === "None")) Object.assign(props, { headType: "None", numberingId: 0, paraLevel: 0 });
    return { props };
  }
  const definitions = mode !== "Bullet" ? catalog.numbers : catalog.bullets;
  const current = raw.headType === mode && definitions.some(d => d.id === raw.numberingId);
  if (change.custom === undefined && change.definition === undefined && raw.headType === mode && !current)
    throw Error("기존 번호 정의를 조회할 수 없습니다. 사용할 정의를 명시적으로 선택하세요.");
  const preferred = mode !== "Bullet" ? catalog.numbers[0] : catalog.bullets.find(d => d.char === "•");
  const id = change.custom ? undefined : change.definition === "default" ? preferred?.id
    : change.definition ?? (current ? Number(raw.numberingId) : preferred?.id);
  if (id !== undefined && (!Number.isSafeInteger(id) || !definitions.some(d => d.id === id)))
    throw Error("이 문서에 없는 번호·글머리표 정의입니다.");
  const level = change.level ?? (raw.headType === mode ? Number(raw.paraLevel) : 0);
  const levels = mode !== "Bullet" ? (catalog.numbers.find(d => d.id === id)?.levelFormats.length ?? 7) : 1;
  if (!Number.isSafeInteger(level) || level < 0 || level > 6 ||
      ((change.level !== undefined || change.definition !== undefined || mode !== raw.headType) && level >= levels))
    throw Error("이 번호 모양이 지원하지 않는 수준입니다. 기본 글머리표는 1수준만 지원합니다.");
  if (raw.headType !== mode || (change.explicit && change.mode !== undefined)) props.headType = mode as ListMode;
  if (raw.paraLevel !== level || (change.explicit && change.level !== undefined)) props.paraLevel = level;
  if (id !== undefined && (raw.numberingId !== id || (change.explicit && change.definition !== undefined))) props.numberingId = id;
  return { props, create: change.custom ? "custom" as const : id === undefined ? mode === "Bullet" ? "Bullet" as const : "Number" as const : undefined };
}

// Draft-only controls; hidden groups and untouched mixed values never mutate Core.
export function mountParagraphLists(root: HTMLElement, state: FormatState, catalog?: ListCatalog) {
  const group = document.createElement("section");
  group.dataset.paragraphLists = "true";
  const mode = document.createElement("select"); mode.name = "listMode";
  const definition = document.createElement("select"); definition.name = "listDefinition";
  const level = document.createElement("select"); level.name = "listLevel";
  const initialMode = state.headType === undefined ? "" : String(state.headType);
  const initialLevel = state.paraLevel === undefined ? "" : String(state.paraLevel);
  mode.add(new Option(initialMode ? "유지" : "혼합 / 유지", ""));
  for (const [v, label] of [["None", "없음 (번호 해제)"], ["Number", "문단 번호"], ["Bullet", "글머리표"], ["Outline", "개요 번호"]])
    mode.add(new Option(label, v));
  if (initialMode && !["None", "Number", "Bullet", "Outline"].includes(initialMode)) {
    const stored = new Option(`현재: ${initialMode} · 조회·보존만`, initialMode);
    stored.disabled = true; mode.add(stored);
  }
  mode.value = initialMode;
  const note = document.createElement("small");
  note.textContent = catalog
    ? "변경하지 않은 혼합 값은 유지합니다. 기존 정의와 개요 번호를 사용합니다. 새 7수준 번호·개요 정의는 서식 메뉴의 번호 관리에서 만듭니다. 기존 번호 정의의 직접 편집·삭제는 미지원입니다. " +
      (numberRestartAvailable()
        ? "문단별 새 시작·이어가기는 번호 관리에서 지원 범위를 확인하세요. " + restartScope
        : "문단별 새 시작·이어가기는 설치 Core의 재조회·저장 보존 확인을 통과하지 못해 보류합니다. 기존 값은 유지합니다.")
    : "NOT_SUPPORTED: 설치 Core의 문단 번호·글머리표 목록 조회가 없어 적용할 수 없습니다. 기존 값은 보존됩니다.";
  const captions = [["종류", mode], ["번호·글머리표 모양", definition], ["번호 수준", level]] as const;
  for (const [text, select] of captions) {
    const label = document.createElement("label"); label.append(document.createTextNode(text), select); group.append(label);
  }
  group.append(note); root.append(group);
  const populate = (reset: boolean) => {
    const selected = mode.value || initialMode;
    definition.replaceChildren(new Option("혼합 / 유지", ""));
    const defs = ["Number","Outline"].includes(selected) ? catalog?.numbers : selected === "Bullet" ? catalog?.bullets : [];
    if (["Number","Outline","Bullet"].includes(selected)) {
      definition.add(new Option(["Number","Outline"].includes(selected) ? "기본 번호" : "기본 글머리표 •", "default"));
      for (const d of defs ?? []) definition.add(new Option("levelFormats" in d ? `번호 ${d.id}: ${d.levelFormats.join(" / ")}` : `글머리표 ${d.id}: ${d.char}`, String(d.id)));
    }
    const initialDefinition = initialMode === selected && typeof state.numberingId === "number" && defs?.some(d => d.id === state.numberingId) ? String(state.numberingId) : "";
    definition.value = reset ? "" : initialDefinition;
    level.replaceChildren(new Option("혼합 / 유지", ""));
    for (let i = 0; i < 7; i++) { const o = new Option(`${i + 1}수준`, String(i)); o.disabled = selected === "Bullet" && i !== 0; level.add(o); }
    level.value = reset ? "" : initialLevel;
    definition.disabled = level.disabled = !catalog || !["Number", "Bullet", "Outline"].includes(selected);
    return initialDefinition;
  };
  const initialDefinition = populate(false);
  mode.disabled = !catalog;
  const touched = new Set<string>();
  mode.addEventListener("change", () => { touched.add("mode"); touched.delete("definition"); touched.delete("level"); populate(true); });
  definition.addEventListener("change", () => touched.add("definition"));
  level.addEventListener("change", () => touched.add("level"));
  const read = (): ParagraphListChange | undefined => {
    if (!catalog) return;
    const patch: ParagraphListChange = {};
    if (mode.value && (mode.value !== initialMode || touched.has("mode"))) {
      if (!["None", "Number", "Bullet", "Outline"].includes(mode.value)) throw Error("개요 번호 편집은 미지원입니다.");
      patch.mode = mode.value as ListMode;
    }
    if (!definition.disabled && definition.value && (definition.value !== initialDefinition || touched.has("definition")))
      patch.definition = definition.value === "default" ? "default" : Number(definition.value);
    if (!level.disabled && level.value && (level.value !== initialLevel || touched.has("level"))) patch.level = Number(level.value);
    // A definition/level change on a mixed selection needs an explicit kind.
    if ((patch.definition !== undefined || patch.level !== undefined) && !patch.mode && !["Number", "Bullet", "Outline"].includes(initialMode))
      throw Error("혼합 선택의 종류를 먼저 선택하세요.");
    if (Object.keys(patch).length && touched.size) patch.explicit = true;
    return Object.keys(patch).length ? patch : undefined;
  };
  return { element: group, read };
}
