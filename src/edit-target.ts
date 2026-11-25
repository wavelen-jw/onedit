import type { Interaction } from "./interaction.js";

type SelectionStamp = { documentId: string; revision: number; selection: unknown };
type Capture = ReturnType<Interaction["capture"]>;

export function sameEditTarget(expected: SelectionStamp, current: SelectionStamp) {
  return expected.documentId === current.documentId &&
    expected.revision === current.revision &&
    JSON.stringify(expected.selection) === JSON.stringify(current.selection);
}

/** Keep preparation outside History. Recheck the live target before a synchronous
 * Command or prepared document adoption, which owns the existing History entry. */
export function editTarget(editor: Interaction, expected: Capture, options: {
  message: string;
  coalesceCellCaret?: boolean;
  current?: () => boolean;
}) {
  const adapter = editor.adapter;
  const native = adapter.doc;
  function checkContext() {
    if (editor.adapter !== adapter || adapter.doc !== native ||
        expected.documentId !== adapter.documentId || expected.revision !== adapter.revision ||
        options.current?.() === false)
      throw Error(options.message);
  }

  function assertCurrent() {
    checkContext();
    const current = editor.capture(options.coalesceCellCaret);
    if (!sameEditTarget(expected, current) ||
        JSON.stringify(expected.paths) !== JSON.stringify(current.paths))
      throw Error(options.message);
    checkContext();
    return current;
  }

  return {
    assertCurrent,
    apply<T>(run: (target: Capture) => T): T {
      assertCurrent();
      return run(expected);
    },
  };
}
