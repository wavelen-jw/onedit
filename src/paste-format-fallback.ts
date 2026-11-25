import { closeEditorDialog, showDocumentEditingDialog, wrapDialogTab } from "./editor-popup-focus.js";
/** A refused source format, distinct from a rejected edit or an integrity failure. */
export class PasteFormatUnavailable extends Error {
  constructor(message: string, readonly alternativeText?: string) {
    super(message);
    this.name = "PasteFormatUnavailable";
  }
}

/** The clipboard payload stays in the caller. No new read or edit on open. */
export async function offerPlainPaste(doc: Document, reason?: string, fileOption?: {
  open: () => void;
  canPasteText: boolean;
}): Promise<boolean> {
  const dialog = doc.createElement("dialog");
  dialog.id = "paste-format-fallback";
  dialog.className = "manager-dialog";
  dialog.setAttribute("aria-labelledby", "paste-format-fallback-title");
  dialog.setAttribute("aria-describedby", "paste-format-fallback-message");
  const title = doc.createElement("h2"), message = doc.createElement("p");
  title.id = "paste-format-fallback-title";
  title.textContent = "붙여넣기";
  message.id = "paste-format-fallback-message";
  message.textContent = fileOption
    ? "클립보드에서 한/글 문서의 원본 구성 전체를 확인하지 못했습니다. 한/글에서 HWPX로 저장한 파일을 불러올 수 있습니다."
    : reason ? `${reason} 텍스트만 붙일까요?` : "원본 형식을 적용하기 어렵습니다. 텍스트만 붙일까요?";
  const form = doc.createElement("form"), actions = doc.createElement("footer");
  actions.className = "dialog-actions";
  const confirm = doc.createElement("button"), cancel = doc.createElement("button");
  confirm.type = cancel.type = "submit";
  confirm.value = "text";
  confirm.textContent = "텍스트로 붙이기";
  confirm.className = "primary";
  confirm.hidden = fileOption?.canPasteText === false;
  confirm.autofocus = !fileOption;
  cancel.value = "cancel";
  cancel.textContent = "취소";
  cancel.autofocus = !!fileOption;
  actions.append(cancel, confirm);
  let load: HTMLButtonElement | undefined;
  if (fileOption) {
    load = doc.createElement("button");
    load.type = "submit";
    load.textContent = "HWPX 파일 불러오기";
    actions.append(load);
  }
  form.append(actions);
  dialog.append(title, message, form);
  dialog.addEventListener("keydown", e => {
    e.stopPropagation();
    wrapDialogTab(e, dialog);
  });
  const closed = new Promise<boolean>(resolve => {
    const finish = (text: boolean) => {
      closeEditorDialog(dialog, true, text ? "text" : "cancel");
      resolve(text);
    };
    form.addEventListener("submit", e => {
      e.preventDefault();
      finish(e.submitter === confirm && !confirm.hidden);
      if (e.submitter && e.submitter === load) fileOption?.open();
    });
    dialog.addEventListener("cancel", e => {
      e.preventDefault();
      finish(false);
    });
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "text"), { once: true });
  });
  doc.body.append(dialog);
  try {
    showDocumentEditingDialog(dialog, true);
    return await closed;
  } finally {
    dialog.remove();
  }
}
