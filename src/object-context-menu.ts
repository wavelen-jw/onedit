import { captionTarget } from "./captions.js";
import { prepareControlKey } from "./control-shortcuts.js";
import { editorFeedbackText } from "./editor-feedback-text.js";
import type { Interaction } from "./interaction.js";

const orderItems = [
  ["front", "맨 앞으로", "Shift+Page Up", true],
  ["back", "맨 뒤로", "Shift+Page Down"],
  ["inFrontOfText", "글 앞으로", "Shift+Home"],
  ["behindText", "글 뒤로", "Shift+End"],
] as const;

export type ObjectMenuCommand = {
  reason(): string;
  run(target: ReturnType<Interaction["capture"]>): void;
};

export function objectLineCommand(
  doc: Document,
  resolve: () => { dialog: "#picture-dialog" | "#shape-dialog"; open: () => void },
) {
  return {
    reason() {
      try { resolve(); return ""; }
      catch (error) { return editorFeedbackText(error); }
    },
    run() {
      const { dialog, open } = resolve();
      open();
      const root = doc.querySelector(`${dialog}[open]`);
      if (!root) return; // The property dialog handles and reports its own admission failures.
      const tab = root.querySelector<HTMLButtonElement>('[data-object-tab="2"]');
      if (!tab) throw Error("현재 개체의 선 속성 탭을 열 수 없습니다.");
      tab.click();
      tab.focus();
    },
  };
}

export function sharedObjectMenuCommands(
  doc: Document,
  editor: Interaction,
  actions: { busy(): boolean; changed(): void; focus(): void; line: ObjectMenuCommand },
): ReadonlyMap<string, ObjectMenuCommand> {
  const commands = new Map<string, ObjectMenuCommand>();
  const busyReason = "현재 작업을 마친 후 사용하세요.";
  function reason(check: () => void) {
    try {
      if (actions.busy()) return busyReason;
      check();
      return "";
    } catch (error) {
      return editorFeedbackText(error);
    }
  }
  for (const [action] of orderItems) {
    commands.set(action, {
      reason: () => reason(() => prepareControlKey(editor.adapter, editor.selection, action)),
      run(target) {
        editor.execute({type: "control-key", action}, target);
        actions.changed();
        actions.focus();
      },
    });
  }
  commands.set("caption", {
    reason: () => reason(() => captionTarget(editor.adapter, editor.selection)),
    run() { doc.dispatchEvent(new CustomEvent("rhwp:remaining-open", {detail: "caption"})); },
  });
  commands.set("line", actions.line);
  return commands;
}

export function objectContextItems(kind: "picture" | "textbox"): readonly (readonly [string, string, string?, boolean?])[] {
  const shared: readonly (readonly [string, string, string?, boolean?])[] = [
    ["properties", "개체 속성…", "P"],
    ["cut", "잘라내기", "Ctrl+X"],
    ["copy", "복사", "Ctrl+C"],
    ...orderItems,
    ["line", "선 속성…", "L"],
    ["caption", "캡션 넣기…", "Ctrl+N,C"],
  ];
  return kind === "picture"
    ? [...shared, ["description", "그림 설명…"], ["delete", "그림 지우기", "Ctrl+E", true]]
    : shared;
}

export function renderObjectContextItems(popup:HTMLElement,kind:"picture"|"textbox",activate:(id:string)=>void,dataName:"pictureContextAction"|"shapeContextAction") {
  popup.classList.add("object-ui1-context");popup.dataset.objectKind=kind;
  const buttons=new Map<string,HTMLButtonElement>();
  for(const [id,label,shortcut,separator]of objectContextItems(kind)) {
    const b=document.createElement("button"),text=document.createElement("span"),key=document.createElement("span");b.type="button";b.setAttribute("role","menuitem");b.dataset[dataName]=id;
    text.textContent=label;key.textContent=shortcut??"";key.className="object-menu-shortcut";b.append(text,key);if(separator)b.classList.add("object-menu-separator");b.onclick=()=>activate(id);popup.append(b);buttons.set(id,b);
  }
  return buttons;
}
