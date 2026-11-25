import type { Interaction } from "./interaction.js";
import type { Command, Props } from "./model.js";
import type { ParagraphListChange } from "./paragraph-lists.js";
import { paragraphAdjustmentCommand, type ParagraphAdjustment } from "./paragraph-adjustments.js";
import { editTarget } from "./edit-target.js";
import type { formatInputGuard } from "./integration/a-format-input-guard.js";

// Per-guard synchronous lock; all compatibility exports share this one instance.
const submittingFormats = new WeakSet<ReturnType<typeof formatInputGuard>>();
// Validation precedes Command; only success consumes the correctable draft.
export function submitFormatDraft(
  editor: Interaction,
  kind: "char" | "paragraph" | "cell",
  captured: ReturnType<Interaction["capture"]>,
  guard: ReturnType<typeof formatInputGuard>,
  read: () => Props,
  readList?: () => ParagraphListChange | undefined,
  readAdjustment?: () => ParagraphAdjustment | undefined,
  cellBlock = false,
  execute: (command:Command,target:ReturnType<Interaction["capture"]>)=>void = (command,target)=>editor.execute(command,target),
  localCellCapture = false,
) {
  if (!guard.ready() || submittingFormats.has(guard)) return false;
  const target = editTarget(editor, captured, {
    message: "대화상자 대상 문서 또는 선택이 변경되었습니다. 취소 후 다시 열어 주세요.",
    coalesceCellCaret: localCellCapture && kind === "cell" && !cellBlock,
  });
  target.assertCurrent();
  submittingFormats.add(guard);
  try {
    const props = read(); // Invalid drafts stay retryable and never consume History.
    const list = readList?.();
    const adjustment = readAdjustment?.();
    if(adjustment && (list || Object.keys(props).length)) throw Error("문단 증감과 다른 서식은 따로 적용하세요. 초안은 유지됩니다.");
    if (adjustment || list || Object.keys(props).length) {
      const command: Command = adjustment ? paragraphAdjustmentCommand(adjustment)
        : list ? { type: "paragraph-list", list, props }
        : kind === "cell" && cellBlock ? { type: kind, props, cellScope: "block" }
        : { type: kind, props };
      target.apply(capture => execute(command, capture));
    }
    guard.consume();
    return true;
  } finally {
    // A refusal never reopens/resets the IME guard. A later retry must still pass
    // ready() and the original document/revision/selection checks above.
    submittingFormats.delete(guard);
  }
}
