import { analyzeMarkdown, markdownLimits, type MarkdownRun } from "./markdown-import.js";

type Block = { readonly text: string } | { readonly rows: readonly (readonly string[])[] };
export type ClipboardMarkdownTable = { readonly html: string; readonly blocks: readonly Block[] };
const issued = new WeakSet<ClipboardMarkdownTable>();
export const isClipboardMarkdownTable = (plan: ClipboardMarkdownTable) => issued.has(plan);
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textOf = (runs: readonly MarkdownRun[]) => runs.map(r => r.text).join("");
const rule = /^ {0,3}(?:-[ \t]*){3,}\n*$/;
function runsHTML(runs: readonly MarkdownRun[]) {
  return runs.map(r => {
    let html = escape(r.text);
    if (r.code) html = '<span style="font-family:monospace">' + html + '</span>';
    if (r.strikethrough) html = '<span style="text-decoration:line-through">' + html + '</span>';
    if (r.italic) html = '<i>' + html + '</i>';
    if (r.bold) html = '<b>' + html + '</b>';
    return html;
  }).join("");
}

/** Prefer the actual GFM table grammar; plain text containing pipes is not enough. */
export function clipboardMarkdownTable(text: string): ClipboardMarkdownTable | undefined {
  if (!text || text.length > markdownLimits.characters ||
      !/^ {0,3}\|\s*:?-{3,}:?\s*\|(?:\s*:?-{3,}:?\s*\|)+[ \t]*\r?$/m.test(text)) return;
  try {
    const plan = analyzeMarkdown({ source: text });
    if (!plan.blocks.some(b => b.kind === "table") || plan.diagnostics.some(d =>
      d.severity === "error" ||
      !(d.code === "HEADING_PRESENTATION" || d.code === "BLOCK_LITERAL" && rule.test(d.source)))) return;
    const blocks: Block[] = [], html: string[] = [];
    for (const block of plan.blocks) {
      if (block.kind === "paragraph") {
        if (block.role !== "body" && block.role !== "heading") return;
        const content = textOf(block.runs);
        const separator = rule.test(content) ? content.replace(/\n+$/, "") : undefined;
        const expected = separator ?? content;
        if (!expected || /[\r\n\t]/.test(expected)) return;
        const rendered = separator === undefined ? runsHTML(block.runs) : escape(separator);
        html.push('<p style="white-space:pre-wrap">' +
          (block.role === "heading" ? '<b>' + rendered + '</b>' : rendered) + '</p>');
        blocks.push(Object.freeze({ text: expected }));
        continue;
      }
      if (block.rows.length < 2 || block.align.length < 2) return;
      const rows = block.rows.map(row => Object.freeze(row.map(textOf)));
      if (rows.some(row => row.length !== block.align.length || row.some(cell => /[\r\n\t]/.test(cell)))) return;
      const table = block.rows.map((row, ri) => '<tr>' + row.map((cell, ci) => {
        const tag = ri === 0 ? "th" : "td", align = block.align[ci] ?? "left";
        const content = runsHTML(cell);
        return '<' + tag + ' style="text-align:' + align + ';white-space:pre-wrap">' +
          (ri === 0 ? '<b>' + content + '</b>' : content) + '</' + tag + '>';
      }).join("") + '</tr>').join("");
      html.push('<table><tbody>' + table + '</tbody></table>');
      blocks.push(Object.freeze({ rows: Object.freeze(rows) }));
    }
    const result = Object.freeze({ html: html.join(""), blocks: Object.freeze(blocks) });
    issued.add(result);
    return result;
  } catch {
    // An unrecognized or over-limit Markdown payload remains ordinary text.
    return;
  }
}
