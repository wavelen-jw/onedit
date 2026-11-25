import type { Interaction } from "./interaction.js";
import { captureMarkdownBody, markdownInlineFormat } from "./markdown-compose.js";
import { analyzeMarkdown, markdownLimits, type MarkdownPlan } from "./markdown-import.js";
import { ordered, paraIndex, samePosition, withPara, type Selection } from "./model.js";
import { PasteFormatUnavailable } from "./paste-format-fallback.js";

const literalNotices = new Set([
  "HEADING_PRESENTATION", "LITERAL_LIST_MARKERS", "CODE_LANGUAGE", "LINK_LITERAL", "IMAGE_LITERAL",
  "ENTITY_LITERAL",
]);

export function clipboardMarkdown(text: string, explicit?: string): MarkdownPlan | undefined {
  const source = (explicit || text).replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n");
  // Some chat copy buttons include a single outer Markdown code fence.
  const probe = source.slice(0, markdownLimits.characters);
  const wrapper = probe === source
    ? /^ {0,3}(`{3,}|~{3,})[ \t]*(?:markdown|gfm|md)[ \t]*\n([\s\S]*?)\n {0,3}\1[ \t]*\n*$/i.exec(source)
    : null;
  const innerClosesWrapper = wrapper && Array.from(wrapper[2].matchAll(/^ {0,3}(`{3,}|~{3,})[ \t]*$/gm))
    .some(([, fence]) => fence[0] === wrapper[1][0] && fence.length >= wrapper[1].length);
  const content = wrapper && !innerClosesWrapper ? wrapper[2] : source;
  const unwrapped = content !== source;
  if (!explicit && !unwrapped && !hasMarkdownSyntax(probe)) return;
  let plan: MarkdownPlan;
  try { plan = analyzeMarkdown({ source: content }); }
  catch (error) {
    throw new PasteFormatUnavailable(error instanceof Error ? error.message : "마크다운 원문을 해석할 수 없습니다.", explicit || text);
  }
  const refused = plan.diagnostics.find(d => d.severity === "error" ||
    !(literalNotices.has(d.code) || d.code === "BLOCK_LITERAL" && /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})\n*$/.test(d.source)));
  if (refused) throw new PasteFormatUnavailable(refused.message, explicit || text);
  // Markdown syntax picked up inside an escaped or plain string is ordinary text.
  if (!explicit && !unwrapped && !plan.blocks.some(block => block.kind === "table" ||
      block.role !== "body" || block.runs.some(run => run.bold || run.italic || run.strikethrough || run.code)) &&
      !plan.diagnostics.some(d => d.code === "LINK_LITERAL" || d.code === "IMAGE_LITERAL")) return;
  return { ...plan, ready: true };
}

function hasMarkdownSyntax(text: string) {
  return /^ {0,3}(?:#{1,6}[ \t]+\S|(?:`{3,}|~{3,})|>[ \t]+\S|[-+*][ \t]+\S)/m.test(text) ||
    /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*\|/m.test(text) ||
    /^ {0,3}\S[^\n]*\n {0,3}(?:={3,}|-{3,})[ \t]*$/m.test(text) ||
    /(?:\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/u.test(text) ||
    /(?:^|[\s(])(?:\*[^*\s\n][^*\n]*\*|_[^_\s\n][^_\n]*_)(?=[\s).,!?]|$)/u.test(text) ||
    (text.match(/^ {0,3}\d+[.)][ \t]+\S/gm)?.length ?? 0) >= 2;
}

/** Insert generated content through the existing body fragment contract.
 * The outer editor History owns the selected range, all splices and rollback. */
export function pasteClipboardMarkdown(editor: Interaction, selection: Selection, plan: MarkdownPlan): Selection {
  const a = editor.adapter;
  const single = plan.blocks.length === 1 ? plan.blocks[0] : undefined;
  const inline = single?.kind === "paragraph" && single.role === "body" && single.runs.every(run => !run.text.includes("\n"))
    ? single.runs : undefined;
  if (selection.kind !== "caret" && selection.kind !== "text")
    throw new PasteFormatUnavailable("마크다운을 붙일 위치에 커서를 두거나 글자를 선택하세요.");
  const [from, to] = selection.kind === "text" ? ordered(selection.anchor, selection.focus) : [selection.focus, selection.focus];
  const controls = from.kind === "body" ? a.call<Parameters<typeof a.hasBodyLayoutObject>[1]>("getControls") : undefined;
  for (let index = paraIndex(from); index <= paraIndex(to); index++) {
    const position = index === paraIndex(from) ? from : { ...withPara(from, index), offset: 0 };
    a.assertEditable(position);
    if (a.hasBodyLayoutObject(position, controls))
      throw new PasteFormatUnavailable("표나 그림이 없는 본문 문단에 마크다운을 붙이세요.");
  }
  a.assertTextOnly(from, paraIndex(to));
  if (inline) {
    return editor.history.transact("paste", selection, () => {
      if (!samePosition(from, to)) a.remove(from, to);
      const text = inline.map(run => run.text).join("");
      const end = a.insert(from, text);
      let offset = from.offset;
      for (const run of inline) {
        const next = offset + Array.from(run.text).length;
        if (next > offset && (run.bold || run.italic || run.strikethrough || run.code))
          a.format({ ...from, offset }, next, markdownInlineFormat(run));
        offset = next;
      }
      a.validate(end);
      return { kind: "caret", focus: end };
    });
  }
  if (from.kind !== "body")
    throw new PasteFormatUnavailable("제목·목록·표가 있는 마크다운은 일반 본문에 붙이세요.");
  const hasTable = plan.blocks.some(block => block.kind === "table");
  if (hasTable && a.call("getColumnDef", from.sec).columnCount > 1)
    throw new PasteFormatUnavailable("마크다운 표는 한 단 본문에 붙이세요.");
  const { fragment, locations } = captureMarkdownBody(editor, from.sec, plan);
  try {
    return editor.history.transact("paste", selection, () => {
      if (!samePosition(from, to)) a.remove(from, to);
      // Separate the inserted blocks from the surviving text on either side.
      const position = from.offset ? a.split(from) : from;
      if (position.kind !== "body") throw Error("마크다운을 붙일 본문 위치를 확인할 수 없습니다.");
      if (a.length(position)) a.split(position);
      const count = a.doc.getParagraphCount(position.sec);
      const result = a.call("pasteCapturedBody", fragment, position.sec, position.para, 0);
      if (result.ok !== true || result.paraIdx !== position.para + locations.length - 1 ||
          a.doc.getParagraphCount(position.sec) !== count + locations.length - 1)
        throw Error("붙여넣은 마크다운의 문단 위치를 확인할 수 없습니다.");
      for (const entry of locations) {
        const body = { ...position, para: position.para + entry.paragraph };
        if (entry.kind === "paragraph") {
          if (a.text(body) !== entry.text) throw Error("붙여넣은 마크다운의 원문이 일치하지 않습니다.");
          continue;
        }
        const tables = a.inline(body);
        const rows = entry.rows;
        if (!rows || tables.length !== 1) throw Error("붙여넣은 마크다운 표를 확인할 수 없습니다.");
        const control = tables[0].controlIndex, dimensions = a.readLayout("getTableDimensions", body.sec, body.para, control);
        if (dimensions.rowCount !== rows.length || dimensions.colCount !== rows[0].length)
          throw Error("붙여넣은 표의 행과 열이 원문과 다릅니다.");
        for (const [row, cells] of rows.entries()) for (const [col, text] of cells.entries()) {
          const cell = { ...body, kind: "cell" as const, control, cell: row * cells.length + col, cellPara: 0 };
          if (a.text(cell) !== text) throw Error("붙여넣은 표의 셀 내용이 원문과 다릅니다.");
        }
      }
      const end = { ...position, para: result.paraIdx, offset: result.bodyLogicalOffset };
      a.validate(end);
      a.exportChecked();
      return { kind: "caret", focus: end };
    });
  } finally { fragment.free(); }
}
