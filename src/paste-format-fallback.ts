import { showEditorDialog } from "./editor-popup-focus.js";
/** A refused source format, distinct from a rejected edit or an integrity failure. */
export class PasteFormatUnavailable extends Error {
  constructor(message: string, readonly alternativeText?: string) {
    super(message);
    this.name = "PasteFormatUnavailable";
  }
}

/** The clipboard payload stays in the caller. No new read or edit on open. */
export async function offerPlainPaste(doc: Document): Promise<boolean> {
  const dialog = doc.createElement("dialog");
  dialog.id = "paste-format-fallback";
  dialog.className = "manager-dialog";
  dialog.setAttribute("aria-labelledby", "paste-format-fallback-title");
  dialog.setAttribute("aria-describedby", "paste-format-fallback-message");
  const title = doc.createElement("h2"), message = doc.createElement("p");
  title.id = "paste-format-fallback-title";
  title.textContent = "붙여넣기";
  message.id = "paste-format-fallback-message";
  message.textContent = "원본 형식을 적용하기 어렵습니다. 텍스트만 붙일까요?";
  const form = doc.createElement("form"), actions = doc.createElement("footer");
  form.method = "dialog";
  actions.className = "dialog-actions";
  const confirm = doc.createElement("button"), cancel = doc.createElement("button");
  confirm.type = cancel.type = "submit";
  confirm.value = "text";
  confirm.textContent = "텍스트로 붙이기";
  confirm.className = "primary";
  confirm.autofocus = true;
  cancel.value = "cancel";
  cancel.textContent = "취소";
  actions.append(cancel, confirm);
  form.append(actions);
  dialog.append(title, message, form);
  dialog.addEventListener("keydown", e => e.stopPropagation());
  const closed = new Promise<boolean>(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "text"), { once: true });
  });
  doc.body.append(dialog);
  try {
    showEditorDialog(dialog, false);
    return await closed;
  } finally {
    dialog.remove();
  }
}
