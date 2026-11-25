import type { Interaction } from "./interaction.js";
import { sameContainer } from "./model.js";
import { clipboardMarkdown } from "./clipboard-markdown.js";
import { readClipboard, readNativePaste, type ClipboardRead, type NativePastePayload } from "./clipboard-transport.js";
import { hancomFragmentRequested, readHancomQaHwpx } from "./hancom-native-qa.js";
import { encodeHancomNativeRange } from "./clipboard.js";
import { restoreHancomNativeLink, prepareHancomLinkedHwpx } from "./hancom-linked-hwpx.js";
import { inspectPreparedHancomPaste } from "./hancom-paste-adoption.js";
import { siblingDocument, wasCreatedBlank } from "./core-runtime.js";
import { hasClipboardMarker } from "./clipboard-envelope.js";
import { PasteFormatUnavailable } from "./paste-format-fallback.js";

export function clipboardMarkdownPlan(data: ClipboardRead, plain: boolean) {
  if (!plain && !data.structured && !hasClipboardMarker(data.html) && (data.markdown || !data.html))
    return clipboardMarkdown(data.text, data.markdown);
}

export async function prepareClipboardPaste(
  editor: Interaction,
  captured: ReturnType<Interaction["capture"]>,
  plain: boolean,
  native: NativePastePayload | undefined,
  assertCurrent: () => void,
) {
  const adapter = editor.adapter, document = adapter.doc, dest = captured.selection;
  const blankTarget = dest.kind === "caret" && dest.focus.kind === "body" &&
    dest.focus.sec === 0 && dest.focus.para === 0 && dest.focus.offset === 0 &&
    editor.history.undoStack.length === 0 && editor.history.redoStack.length === 0 &&
    captured.revision === 0 && wasCreatedBlank(document) && document.isEmptyDocument();
  const nativeFragment = !plain && hancomFragmentRequested();
  const qaNative = !plain && (blankTarget || nativeFragment) ? await readHancomQaHwpx(native) : undefined;
  if (qaNative && nativeFragment &&
      ((dest.kind !== "caret" && dest.kind !== "text" && dest.kind !== "cells") ||
       (dest.kind === "text" && !sameContainer(dest.anchor, dest.focus))))
    throw Error("한/글 조각은 같은 본문 구역 또는 같은 셀의 커서나 텍스트 범위에 붙여넣으세요.");
  assertCurrent();

  const fragment = qaNative && nativeFragment ? encodeHancomNativeRange(adapter, qaNative.bytes) : undefined;
  if (dest.kind === "cells" && editor.cells(dest).length > 1 && !fragment)
    throw Error("확인된 한/글 셀 범위가 필요합니다.");
  const linked = !fragment && qaNative?.sourceFormat === "hwpx" && native
    ? await restoreHancomNativeLink(qaNative.bytes, native.html, native.text) : undefined;
  const qaBytes = fragment ? undefined : linked?.bytes ?? qaNative?.bytes;
  let data: ClipboardRead | undefined;
  let refused: PasteFormatUnavailable | undefined;
  try {
    data = (fragment || qaBytes) && native ? { html: native.html, text: native.text, structured: fragment } :
      native ? await readNativePaste(native) : await readClipboard(plain);
  } catch (error) {
    if (!(error instanceof PasteFormatUnavailable)) throw error;
    refused = error;
  }
  const plan = async (data: ClipboardRead, markdown: ReturnType<typeof clipboardMarkdownPlan>) => {
    const whole = !qaBytes && !plain && !data.structured && !data.mixedPicture && !markdown && blankTarget
      ? await prepareHancomLinkedHwpx(data.html, data.text, () => siblingDocument(document)).catch(() => {
          throw new PasteFormatUnavailable("한/글 링크 포함 붙여넣기를 확인하지 못했습니다.");
        })
      : undefined;
    const bytes = qaBytes ?? whole?.bytes;
    const prepared = bytes && await inspectPreparedHancomPaste(bytes,
      linked?.expected ?? whole?.expected, !!qaBytes);
    return { prepared, fragment };
  };
  return { data, refused, plan };
}
