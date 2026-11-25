import { RhwpAdapter } from "./adapter.js";
import { siblingDocument } from "./core-runtime.js";
import type { HancomClipboardLink } from "./hancom-linked-hwpx.js";
import { validateClipboardPrintSettings } from "./hwpx-print-settings.js";
import type { Interaction } from "./interaction.js";
import type { Selection } from "./model.js";

type PreparedPaste = {
  bytes: Uint8Array;
  expectedLink?: HancomClipboardLink;
};

export async function inspectPreparedHancomPaste(
  bytes: Uint8Array | undefined,
  expectedLink: HancomClipboardLink | undefined,
  keepPrintSettings: boolean,
): Promise<PreparedPaste | undefined> {
  if (!bytes) return;
  if (keepPrintSettings) await validateClipboardPrintSettings(bytes);
  return { bytes, expectedLink };
}

/** The caller revalidates the paste destination after its last async read.
 * Until History accepts the replacement, this function owns the detached document. */
export function adoptPreparedHancomPaste(
  editor: Interaction,
  destination: Selection,
  paste: PreparedPaste,
  prepareDisplay: (candidate: RhwpAdapter) => void,
  assertDestination: () => void,
) {
  const prepared = siblingDocument(editor.adapter.doc, paste.bytes);
  let adopted = false;
  try {
    const candidate = new RhwpAdapter(prepared);
    candidate.scope = editor.adapter.scope;
    if (prepared.getSectionCount() !== 1 || prepared.getParagraphCount(0) < 1)
      throw Error("구역을 확인하지 못했습니다.");
    prepareDisplay(candidate);

    const expected = paste.expectedLink;
    if (expected) {
      const { links } = candidate.call<{
        links: { uri: string; text: string; start: number; end: number; zOrder?: number }[];
      }>("getHyperlinkContext", JSON.stringify({ section: 0, para: expected.paragraph, cellPath: [] }));
      const match = links.length === 1 && links[0];
      if (!match || match.uri !== expected.uri || match.text !== expected.label ||
          match.start !== expected.start || match.end !== expected.end)
        throw Error("붙여넣은 링크의 범위를 확인하지 못했습니다.");
      if (expected.zOrder !== undefined && match.zOrder !== expected.zOrder)
        throw Error("붙여넣을 링크의 순서 값을 확인하지 못했습니다.");
    }

    candidate.exportChecked();
    const focus = { kind: "body" as const, sec: 0, para: prepared.getParagraphCount(0) - 1, offset: 0 };
    focus.offset = candidate.length(focus);
    candidate.validate(focus);
    assertDestination();
    editor.selection = editor.history.adoptPreparedPaste(prepared, destination, { kind: "caret", focus });
    adopted = true;
  } finally {
    if (!adopted) prepared.free();
  }
}
