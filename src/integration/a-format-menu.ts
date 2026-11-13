import {menuTargetReader} from '../menu-input-projection.js';
import type {OwnerProjection} from '../owner-projection.js';
import { scriptCycleFromState } from '../hancom-key-links.js';
import {selectedGroup} from '../object-ungroup.js';
import { linePositionItems } from "../line-position.js";
import { relativeCharacterMenuItems } from "../character-increments.js";
import { listGroup, paragraphListItems } from "../paragraph-lists.js";
import { stylesUnavailable } from "../style-availability.js";
import { paragraphAdjustmentItems, paragraphAdjustmentGroup, hangingIndentCommand } from "../paragraph-adjustments.js";
import type { Interaction } from "../interaction.js";
import { type Command as EditorCommand } from "../model.js";
import type { FormatKind, FormatState } from "../formatting.js";
import { mountFormatMenuUI1 } from "../format-menu-ui1.js";
import { formatToggleState, markFormatToggle, type FormatValueState } from "../format-value-state.js";

export type CatalogCommand =
  | EditorCommand
  | {type:"script-cycle"}
  | { type: "toggle-char"; property: "italic" | "strikethrough" }
  | { type: "underline" }
  | { type: "script"; mode: "superscript" | "subscript" | "normal" };
type Item = {
  id: string;
  label: string;
  group: string;
  kind: "char" | "paragraph";
  shortcut?: string;
  command?: CatalogCommand;
  dialog?: "char" | "paragraph" | "styles" | "numbers";
  dialogGroup?: string;
  property?: string;
  value?: string;
  unsupported?: string;
};
// UI catalog only: mutations remain in Selection → Command → History → Adapter.
export const formatMenuItems: Item[] = [
  {id:'object-ungroup',label:'묶음 개체 풀기',group:'개체',kind:'char',shortcut:'U',command:{type:'object-ungroup'}},
  ...relativeCharacterMenuItems.map((item): Item => ({...item, group: "글자 크기·장평·자간 증감", kind: "char"})),
  { id: "paragraph-adjustments", label: "문단 여백·들여쓰기 증감…", group: paragraphAdjustmentGroup, kind: "paragraph", dialog: "paragraph", dialogGroup: paragraphAdjustmentGroup, shortcut: "Alt+T → 여백·들여쓰기 증감" },
  ...paragraphAdjustmentItems.map((item): Item => ({ id: `paragraph-relative-${item.metric}-${item.direction}`, label: item.label, group: paragraphAdjustmentGroup, kind: "paragraph", command: { type: "paragraph-relative", change: { metric: item.metric, direction: item.direction } } })),

  {
    id: "character",
    label: "글자 모양…",
    group: "모양",
    kind: "char",
    dialog: "char",
    shortcut: "Alt+L",
  },
  {
    id: "paragraph",
    label: "문단 모양…",
    group: "모양",
    kind: "paragraph",
    dialog: "paragraph",
    shortcut: "Alt+T",
  },
  {
    id: "bold",
    label: "진하게",
    group: "글자 속성",
    kind: "char",
    property: "bold",
    command: { type: "bold" },
    shortcut: "Alt+Shift+B",
  },
  {
    id: "italic",
    label: "기울임",
    group: "글자 속성",
    kind: "char",
    property: "italic",
    command: { type: "toggle-char", property: "italic" },
    shortcut: "Alt+Shift+I",
  },
  {
    id: "underline",
    label: "밑줄",
    group: "글자 속성",
    kind: "char",
    property: "underline",
    command: { type: "underline" },
    shortcut: "Alt+Shift+U",
  },
  ...linePositionItems.map((item): Item => ({...item, group: "글자 속성", kind: "char"})),
  {
    id: "strike",
    label: "취소선",
    group: "글자 속성",
    kind: "char",
    property: "strikethrough",
    command: { type: "toggle-char", property: "strikethrough" },
  },
  ...(["superscript", "subscript", "normal"] as const).map(
    (mode, n): Item => ({
      id: mode,
      label: ["위 첨자", "아래 첨자", "첨자 해제"][n],
      group: "글자 속성",
      kind: "char",
      property: mode,
      command: { type: "script", mode },
      shortcut: ["Alt+Shift+P", "Alt+Shift+S"][n],
    }),
  ),
  {id:'char-normal',label:'보통 모양',group:'글자 속성',kind:'char',shortcut:'Alt+Shift+C',command:{type:'char',props:{bold:false,italic:false,underline:false,underlineType:"None",strikethrough:false,superscript:false,subscript:false,outlineType:0,shadowType:0,emboss:false,engrave:false}}},
  ...([-1,1]as const).map((direction):Item=>({id:`number-level-${direction}`,label:direction<0?'번호·개요 한 수준 증가':'번호·개요 한 수준 감소',group:'문단 번호·글머리표',kind:'paragraph',shortcut:direction<0?'Ctrl+Num −':'Ctrl+Num +',command:{type:'list-level',direction}})),
  ...([1,-1]as const).map((direction):Item=>({id:`line-spacing-${direction}`,label:direction>0?'줄 간격 늘리기 (+10%)':'줄 간격 줄이기 (−10%)',group:'문단 여백·들여쓰기 증감',kind:'paragraph',shortcut:direction>0?'Alt+Shift+Z':'Alt+Shift+A',command:{type:'line-spacing-step',direction}})),
  {id:"script-cycle",label:"첨자 순환 (위·아래·해제)",group:"글자 속성",kind:"char",command:{type:"script-cycle"},shortcut:"Ctrl+Alt+A"},
  ...["left", "center", "right", "justify", "distribute", "split"].map(
    (alignment, n): Item => ({
      id: alignment,
      label: [
        "왼쪽 정렬",
        "가운데 정렬",
        "오른쪽 정렬",
        "양쪽 정렬",
        "배분 정렬",
        "나눔 정렬",
      ][n],
      group: "문단 정렬",
      kind: "paragraph",
      property: "alignment",
      value: alignment,
      command: { type: "paragraph", props: { alignment } },
      shortcut: n === 0 ? "Control+Shift+L" : undefined,
    }),
  ),
  {
    id: "tabs",
    label: "탭 설정…",
    dialogGroup: "탭",
    group: "문단 정렬",
    kind: "paragraph",
    dialog: "paragraph",
  },
  {
    id: "hanging-indent",
    label: "첫 줄 내어쓰기 10pt",
    group: "문단 모양",
    kind: "paragraph",
    command: hangingIndentCommand,
    shortcut: "Control+Shift+`",
  },
  {id: "paragraph-lists", label: "문단 번호·글머리표…", group: listGroup, kind: "paragraph", dialog: "paragraph", dialogGroup: listGroup},
  ...paragraphListItems.map((item): Item => ({...item, group: listGroup, kind: "paragraph", property: "headType"})),
  ...["스타일 관리", "문단 번호·글머리표", "문단 테두리·배경"].map(
    (label, n): Item => n === 0 ? {
      id: "styles-manage", label: "스타일 관리 (제공 안 함)", group: "모양", kind: "char", unsupported: stylesUnavailable,
    } : n === 1 ? {
      id: "numbers-manage", label: "사용자 번호·개요 관리…", group: "문단 번호·글머리표", kind: "paragraph", dialog: "numbers",
    } : ({
      id: "paragraph-border",
      label: "문단 테두리/배경…",
      group: "문단 모양",
      kind: "paragraph",
      dialog: "paragraph",
      dialogGroup: "테두리·배경",
    }),
  ),
];
export type MenuState = {
  disabled: boolean;
  reason: string;
  pressed?: "true" | "false" | "mixed";
  valueState?: FormatValueState;
  valueReason?: string;
};
export function formatMenuState(
  editor: Interaction,
  composing = false,
  blockedReason = "입력·저장 또는 대화상자 작업을 마친 뒤 사용하세요.",
  readDisplay: (kind: FormatKind) => FormatState = kind => editor.formatState(kind),
  owners?:OwnerProjection,
  only?: ReadonlySet<string>,
  checkEditable = (position: Parameters<Interaction["adapter"]["assertEditable"]>[0]) => editor.adapter.assertEditable(position),
  targets?: Parameters<typeof menuTargetReader>[2],
  structuralDisplay = false,
): Map<string, MenuState> {
  const items = only ? formatMenuItems.filter(item => only.has(item.id)) : formatMenuItems;
  const readTargets=menuTargetReader(editor,owners,targets);
  const states: Partial<Record<FormatKind, FormatState>> = {};
  const errors: Partial<Record<FormatKind, string>> = {};
  for (const kind of ["char", "paragraph"] as const) {
    if (only && !items.some(item => item.kind === kind)) continue;
    if (composing) { errors[kind] = blockedReason || "입력·저장 또는 대화상자 작업을 마친 뒤 사용하세요."; continue; }
    try {
      checkEditable(editor.selection.focus);
      for (const target of readTargets())
        checkEditable(target.p);
      states[kind] = readDisplay(kind);
    } catch (error) {
      errors[kind] = String(error);
    }
  }
  return new Map(
    items.map((item) => {
      if(item.command?.type==='object-ungroup'){
        let reason=composing?blockedReason:'';
        if(!reason)try{selectedGroup(editor.adapter,editor.selection);}catch(error){reason=String(error).replace(/^Error: /,'');}
        return [item.id,{disabled:!!reason,reason}];
      }
      let reason = item.unsupported ?? errors[item.kind] ?? "";
      if (!reason && (item.id === "paragraph-lists" || item.command?.type === "paragraph-list")) {
        try {
          if (readTargets().some(target => target.p.kind === "cell" && !!target.p.ancestors?.length))
            throw Error("NOT_SUPPORTED: 중첩 셀 문단 번호 변경은 지원하지 않습니다.");
          editor.adapter.paragraphListCatalog();
        } catch (error) { reason = String(error); }
      }
      if (!reason && item.id === "numbers-manage") {
        try {
          if (editor.selection.focus.kind === "cell" && editor.selection.focus.ancestors?.length)
            throw Error("NOT_SUPPORTED: 중첩 셀 문단 번호 변경은 지원하지 않습니다.");
          editor.adapter.paragraphListCatalog();
        } catch (error) { reason = String(error); }
      }
      if (!reason && item.command?.type === "paragraph-relative") {
        try { editor.paragraphAdjustmentPlan(item.command.change,editor.selection,owners,owners?.isCurrent(editor.adapter)?readTargets():undefined, structuralDisplay?checkEditable:undefined); } catch(error) { reason=String(error); }
      }
      if (!reason && item.id === "paragraph-adjustments" && readTargets().some(t => t.p.kind === "cell" && !!t.p.ancestors?.length)) reason = "중첩 셀 상대 여백 조절은 미검증입니다.";
      if(!reason&&(item.command?.type==='list-level'||item.command?.type==='line-spacing-step'))try{editor.paragraphStepPlan(item.command.type,item.command.direction,editor.selection,owners,owners?.isCurrent(editor.adapter)?readTargets():undefined, structuralDisplay?checkEditable:undefined);}catch(error){reason=String(error);}
      const state = states[item.kind] ?? {};
      if(!reason&&item.command?.type==='script-cycle'){try{scriptCycleFromState(state);}catch(error){reason=String(error);}}
      const toggle=item.property?formatToggleState(state,item.property,item.value):undefined;
      return [
        item.id,
        {
          disabled: !!reason,
          reason,
          pressed:toggle?.pressed,
          valueState:toggle?.valueState,
          valueReason:errors[item.kind],
        },
      ];
    }),
  );
}

export function mountFormatMenu(
  root: HTMLDetailsElement,
  editor: Interaction,
  actions: {
    command: (
      command: CatalogCommand,
      captured: ReturnType<Interaction["capture"]>,
    ) => void;
    dialog: (kind: "char" | "paragraph" | "styles" | "numbers", group?: string) => void;
    composing: () => boolean;
    readingBlocked?: () => boolean;
    blockedReason?: () => string;
    feedback?: (message: string) => void;
    fontCycle?: (direction:-1|1)=>void;
    fontState?: (direction:-1|1)=>string;
    objectProperties?: {
      state: () => { disabled: boolean; reason: string };
      open: () => void;
    };
  },
) {
  const panel = root.querySelector<HTMLElement>("[data-format-panel]")!;
  const summary = root.querySelector<HTMLElement>("summary")!;
  const buttons = new Map<string, HTMLButtonElement>();
  let capture: ReturnType<Interaction["capture"]> | undefined;
  const toggleList = (mode: "Number" | "Bullet" | "Outline", target: ReturnType<Interaction["capture"]>) => {
    try {
      if (!["Number", "Bullet", "Outline"].includes(mode)) throw Error("지원하지 않는 문단 번호 요청입니다.");
      const current = editor.capture();
      if (!target || target.documentId !== current.documentId || target.revision !== current.revision ||
        JSON.stringify(target.selection) !== JSON.stringify(current.selection))
        throw Error("문서·리비전·선택이 변경되었습니다. 명령을 다시 실행하세요.");
      const states = formatMenuState(editor, actions.composing(), actions.blockedReason?.());
      const apply = states.get(`list-${mode}`)!, remove = states.get("list-None")!;
      if (apply.disabled || remove.disabled) throw Error(apply.reason || remove.reason);
      if (apply.pressed === "mixed" || apply.valueState === "unavailable") throw Error(apply.valueState === "unavailable"?"문단 번호 종류가 미조회입니다. 문단 번호 모양에서 종류를 명시하세요.":"문단 번호 종류가 혼합입니다. 문단 번호 모양에서 종류를 명시하세요.");
      const command = paragraphListItems.find(item => item.value === (apply.pressed === "true" ? "None" : mode))!.command;
      root.open = false;
      actions.command(command, target);
    } catch (error) {
      root.open = false; actions.feedback?.(String(error).replace(/^Error: /, ""));
    }
    root.ownerDocument.getElementById("input")?.focus({ preventScroll: true });
  };
  const project = (states: ReadonlyMap<string, MenuState>) => {
    for (const item of formatMenuItems) {
      const button = buttons.get(item.id)!,
        state = states.get(item.id)!;
      button.disabled = state.disabled;
      button.title = state.reason || button.dataset.hint || item.shortcut || item.label;
      button.setAttribute(
        "aria-label",
        `${button.querySelector("span")?.textContent ?? item.label}${state.reason ? ` (${state.reason})` : state.pressed === "mixed" ? " (혼합)" : ""}`,
      );
      if (state.valueState)markFormatToggle(button,{valueState:state.valueState,pressed:state.pressed},state.valueReason||state.reason);
    }
    layout.sync();
  };
  const sync = () => editor.withViewQueries(owners=>project(formatMenuState(editor, (actions.readingBlocked ?? actions.composing)(), actions.blockedReason?.(),undefined,owners)));
  const invoke = (id:string, target=capture) => {
      const item=formatMenuItems.find(row=>row.id===id);if(!item)return;
      const state = formatMenuState(editor, actions.composing(), actions.blockedReason?.()).get(item.id)!;
      if (state.disabled) {
        actions.feedback?.(state.reason);
        sync();
        return;
      }
      // A queued click must never silently bind to a replaced document or new selection.
      const current = editor.capture();
      if (
        target &&
        (target.documentId !== current.documentId ||
          target.revision !== current.revision ||
          JSON.stringify(target.selection) !==
            JSON.stringify(current.selection))
      ) {
        root.open = false;
        actions.feedback?.("문서·리비전·선택이 변경되었습니다. 메뉴를 다시 여세요.");
        summary.focus();
        return;
      }
      root.open = false;
      if (item.dialog) actions.dialog(item.dialog, item.dialogGroup);
      else if (item.command) actions.command(item.command, target ?? current);
    };
  let group = "";
  for (const item of formatMenuItems) {
    if (group !== item.group) {
      const heading = document.createElement("strong");
      heading.textContent = item.group;
      panel.append(heading);
      group = item.group;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.formatAction = item.id;
    const label = document.createElement("span");
    label.textContent = item.label;
    button.append(label);
    if (item.shortcut) {
      button.setAttribute("aria-keyshortcuts", item.shortcut);
      const key = document.createElement("kbd");
      key.textContent = item.shortcut.replace("Control", "Ctrl");
      button.append(key);
    }
    button.onclick=()=>invoke(item.id);
    buttons.set(item.id, button);
    panel.append(button);
  }
  const layout = mountFormatMenuUI1(root, buttons, {
    blocked: actions.composing,
    fontCycle: direction=>{const current=editor.capture();if(capture&&(capture.documentId!==current.documentId||capture.revision!==current.revision||JSON.stringify(capture.selection)!==JSON.stringify(current.selection))){actions.feedback?.('글꼴 대상 선택이 변경되었습니다. 메뉴를 다시 여세요.');return;}actions.fontCycle?.(direction);}, fontState: actions.fontState,
    openOutline:()=>{try{const target=capture??editor.capture(),now=editor.capture();if(target.documentId!==now.documentId||target.revision!==now.revision||JSON.stringify(target.selection)!==JSON.stringify(now.selection))throw Error('문서·선택이 변경되었습니다. 메뉴를 다시 여세요.');const state=formatMenuState(editor,actions.composing(),actions.blockedReason?.()).get('paragraph-lists');if(!state||state.disabled)throw Error(state?.reason??'문단 설정을 확인할 수 없습니다.');root.open=false;root.ownerDocument.dispatchEvent(new CustomEvent('rhwp:paragraph-lists',{detail:'Outline'}));}catch(error){actions.feedback?.(String(error));}},
    toggleList: mode => toggleList(mode, capture ?? editor.capture()),
    objectState: () => actions.objectProperties?.state() ?? { disabled: true, reason: "선택 개체의 속성 입구가 연결돼 있지 않습니다. 기존 개체를 유지합니다." },
    openObject: () => {
      const current = editor.capture();
      if (!capture || capture.documentId !== current.documentId || capture.revision !== current.revision ||
        JSON.stringify(capture.selection) !== JSON.stringify(current.selection)) {
        root.open = false; actions.feedback?.("문서·리비전·선택이 변경되었습니다. 메뉴를 다시 여세요."); summary.focus(); return;
      }
      root.open = false; actions.objectProperties?.open();
    },
  });
  root.addEventListener("toggle", () => {
    // A delayed toggle must not silently replace the synchronous opening owner.
    capture = root.open ? capture ?? editor.capture() : undefined;
    sync();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 &&
      !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
      if ((event.target as Element).closest("details[open]") !== root) return;
      event.preventDefault();
      event.stopPropagation();
      root.open = false;
      (root.ownerDocument.getElementById("input") ?? summary).focus();
    }
  });
  root.addEventListener("pointerdown", (event) => {
    if ((actions.readingBlocked ?? actions.composing)()) event.preventDefault();
    // details.toggle is queued. A fast open → local command must not compare
    // against the previous menu's owner while waiting for that notification.
    else if (!root.open && summary.contains(event.target as Node)) capture = editor.capture();
  });
  const entryFocus = (event: FocusEvent) => {
    if (event.target === summary && !root.open && !actions.composing()) capture = editor.capture();
  };
  root.addEventListener("focusin", entryFocus);
  const opening = () => {
    if (!actions.composing()) capture = editor.capture();
    sync();
  };
  const disclose = (event: MouseEvent) => {
    // Details toggle is queued. Prepare hidden command sources at disclosure,
    // before the first focus/click can reach a visible menu item.
    if (!root.open && summary.contains(event.target as Node)) opening();
  };
  root.addEventListener("click", disclose, true);
  root.addEventListener("rhwp:menu-opening", opening);
  const input = root.ownerDocument.getElementById("input")!;
  const shortcut = (event: Event) => {
    const { mode, captured } = (event as CustomEvent<{ mode: "Number" | "Bullet" | "Outline"; captured: ReturnType<Interaction["capture"]> }>).detail ?? {};
    toggleList(mode, captured);
  };
  input.addEventListener("rhwp:paragraph-list-toggle", shortcut);
  const outside = (event: PointerEvent) => {
    if (!root.contains(event.target as Node)) root.open = false;
  };
  // Main menu lifetime owns outside-pointer closing.
  sync();
  return Object.assign(sync, {
    // Only the enclosing synchronous UI projection may supply its fresh map.
    // Opening and command handlers above always compute their own admission.
    project, invoke,
    demanded: () => root.open,
    dispose: () => { document.removeEventListener("pointerdown", outside); root.removeEventListener("focusin", entryFocus); root.removeEventListener("rhwp:menu-opening", opening); root.removeEventListener("click", disclose, true); input.removeEventListener("rhwp:paragraph-list-toggle", shortcut); layout.dispose(); },
  });
}
