import type { ClipboardData } from "./clipboard.js";
import { encodeClipboardBytes, hasClipboardMarker, MAX_CLIPBOARD_BYTES } from "./clipboard-envelope.js";
import { isHancomMixedPicture, type HancomMixedPicture } from "./clipboard-image.js";
import type { Props } from "./model.js";
import { PasteFormatUnavailable } from "./paste-format-fallback.js";

// A deliberately narrow text reader, not an HTML renderer/importer. No DOM,
// stylesheet installation, URLs, scripts, hwpjson or external resources are used.
// Only the observed one-p/one-span partial-text shape and explicit color/pt size.
function attributes(raw: string, allowed: readonly string[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  let end = 0;
  for (const m of raw.matchAll(/\s+([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    if (raw.slice(end, m.index).trim()) return;
    const key = m[1].toLowerCase();
    if (!allowed.includes(key) || key in out) return;
    out[key] = m[2] ?? m[3]; end = m.index! + m[0].length;
  }
  return raw.slice(end).trim() ? undefined : out;
}
function plainText(raw: string): string | undefined {
  if (/[<>]/.test(raw)) return;
  let invalid = false;
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  const text = raw.replace(/&([^;\s]+);/g, (_, entity: string) => {
    if (entity in named) return named[entity];
    const m = /^(?:#(\d+)|#x([\da-f]+))$/i.exec(entity);
    const n = m ? parseInt(m[1] ?? m[2], m[1] ? 10 : 16) : NaN;
    if (!Number.isSafeInteger(n) || n < 32 || n > 0x10ffff || n >= 0xd800 && n <= 0xdfff) { invalid = true; return ""; }
    return String.fromCodePoint(n);
  });
  return invalid || /[\u0000-\u001f\u007f]/.test(text) ? undefined : text;
}
function characterStyle(css: string, props: Props): boolean {
  for (const item of css.split(";")) {
    if (!item.trim()) continue;
    const at = item.indexOf(":"); if (at < 1) return false;
    const key = item.slice(0, at).trim().toLowerCase(), value = item.slice(at + 1).trim();
    if (key === "color") {
      if (!/^#[\da-f]{6}$/i.test(value)) return false;
      props.textColor = value.toUpperCase();
    } else if (key === "font-size") {
      const size = /^(\d+(?:\.\d+)?)pt$/i.exec(value);
      if (!size || Number(size[1]) < 1 || Number(size[1]) > 200) return false;
      props.fontSize = Number(size[1]);
    } else if (["font-weight", "font-style", "text-decoration", "font-variant", "text-transform"].includes(key)) {
      // Do not report unsupported emphasis/decoration as imported formatting.
      if (!/^(normal|none)$/i.test(value)) return false;
    } else if (key === "letter-spacing" && !/^0(?:pt)?$/i.test(value) ||
               key === "mso-font-width" && value !== "100%" ||
               key === "mso-text-raise" && !/^0(?:pt)?$/i.test(value)) return false;
    if (/url\s*\(|expression\s*\(/i.test(value)) return false;
  }
  return true;
}
// The wrapper identifies a compatibility format. Its contents must still
// pass the appropriate format and resource checks.
export function hasHancomClipboardMetadata(html: string): boolean {
  return /<div\b(?=[^<>]*\sid\s*=\s*(["'])hwpEditorBoardContent\1)(?=[^<>]*\sdata-hjsonver\s*=\s*["']1\.0["'])[^<>]*>/i.test(html);
}
const hancomTextDocumentControls = new Map<number, number>([
  [0x73656364, 2], // secd: section settings
  [0x636f6c64, 2], // cold: columns
  [0x70676e70, 21], // pgnp: page numbering
]);
const hancomTextDocumentKeys = new Set([
  "documentPr", "dh", "bf", "cp", "tp", "nu", "bu", "pp", "st", "mp", "ro", "sl", "cs", "bi", "bidt",
]);
const hancomModelId = /^[0-9A-F]{24}$/;
function modelRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function normalizeHancomClipboardText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
}

// Called only after the visible HTML has passed the ordinary import checks.
// Accept a linked, resource-free body with text plus standard page settings.
// Both clipboard representations must agree at every paragraph boundary.
export function hancomTextDocumentModel(html: string, plain: string): { wire: string; paragraphs: string[] } | undefined {
  if (!hasHancomClipboardMetadata(html)) return;
  const comments = [...html.matchAll(/<!--\s*\[data-hwpjson\]([\s\S]*?)-->/gi)];
  if (comments.length !== 1 || comments[0][1].length > 256 * 1024) return;
  const wire = comments[0][1];
  let model: unknown;
  try { model = JSON.parse(wire); } catch { return; }
  if (!modelRecord(model) || Object.keys(model).some(key => !hancomTextDocumentKeys.has(key)) ||
      !Array.isArray(model.bi) || model.bi.length || !modelRecord(model.bidt) || Object.keys(model.bidt).length ||
      !modelRecord(model.ro) || !modelRecord(model.cs)) return;

  const body = model.ro, controls = model.cs;
  const bodyKeys = Object.keys(body);
  const controlKeys = Object.keys(controls);
  if (bodyKeys.length < 2 || bodyKeys.length > 1025 || controlKeys.length > hancomTextDocumentControls.size) return;
  const paragraphs: string[] = [];
  const seen = new Set<string>();
  const seenControls = new Set<string>();
  const seenKinds = new Set<number>();
  let current: unknown = body.hp;
  while (typeof current === "string" && hancomModelId.test(current) && !seen.has(current)) {
    const paragraph = body[current];
    if (!modelRecord(paragraph) || !Array.isArray(paragraph.ru)) return;
    const chunks: string[] = [];
    for (const run of paragraph.ru) {
      if (!modelRecord(run) || !Array.isArray(run.ch)) return;
      for (const part of run.ch) {
        if (!modelRecord(part)) return;
        if (typeof part.t === "string" && Object.keys(part).length === 1 && !/[\r\n]/.test(part.t)) {
          chunks.push(part.t);
          continue;
        }
        const { ci, co, cc } = part;
        if (paragraphs.length !== 0 || Object.keys(part).length !== 3 ||
            typeof ci !== "number" || typeof cc !== "number" || hancomTextDocumentControls.get(ci) !== cc ||
            typeof co !== "string" || !hancomModelId.test(co) || seenControls.has(co) || seenKinds.has(ci)) return;
        const control = controls[co];
        if (!modelRecord(control) || control.ci !== ci || control.cc !== cc) return;
        seenControls.add(co);
        seenKinds.add(ci);
      }
    }
    paragraphs.push(chunks.join(""));
    seen.add(current);
    current = paragraph.np;
  }
  if (current !== "" || seen.size !== bodyKeys.length - 1 || seenControls.size !== controlKeys.length ||
      !seenKinds.has(0x73656364) || !seenKinds.has(0x636f6c64)) return;
  const text = normalizeHancomClipboardText(paragraphs.join("\n"));
  if (!text.trim() || text !== normalizeHancomClipboardText(plain)) return;
  return { wire, paragraphs };
}


export function externalTextFormat(html: string, text: string): { text: string; props: Props } | undefined {
  if (!html || hasClipboardMarker(html) || html.length > MAX_CLIPBOARD_BYTES * 2 || hasHancomClipboardMetadata(html)) return;
  const starts = [...html.matchAll(/<!--StartFragment-->/gi)], ends = [...html.matchAll(/<!--EndFragment-->/gi)];
  let fragment: string;
  if (starts.length || ends.length) {
    if (starts.length !== 1 || ends.length !== 1 || starts[0].index! >= ends[0].index!) return;
    fragment = html.slice(starts[0].index! + starts[0][0].length, ends[0].index);
  } else {
    const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
    fragment = body?.[1] ?? html;
  }
  // Hancom's trailing metadata is a comment, never interpreted as a document.
  const stripped = fragment.replace(/<!--[\s\S]*?-->/g, "");
  const p = /^\s*<p\b([^<>]*)>\s*<span\b([^<>]*)>([^<>]*)<\/span\s*>\s*<\/p\s*>([\s\S]*?)\s*$/i.exec(stripped);
  if (!p) return;
  const pa = attributes(p[1], ["class", "style", "lang"]), sa = attributes(p[2], ["class", "style", "lang"]);
  if (!pa || !sa || sa.class) return;
  if (p[4].trim()) {
    const meta = /^\s*<div\b([^<>]*)>\s*<\/div\s*>\s*$/i.exec(p[4]);
    const ma = meta && attributes(meta[1], ["id", "class", "data-hjsonver", "data-jsonlen"]);
    if (!ma || ma.id !== "hwpEditorBoardContent") return;
  }
  const decoded = plainText(p[3]);
  if (!decoded || decoded !== text || /[\r\n]/.test(text)) return;
  const props: Props = {};
  if (pa.class) {
    if (!/^[\w-]+$/.test(pa.class)) return;
    const rules: string[] = [];
    const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(html)?.[1] ?? "";
    for (const style of head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
      const css = style[1].replace(/<!--|-->/g, "");
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
        if (rule[1].trim() === `p.${pa.class}`) rules.push(rule[2]);
    }
    // Browser Clipboard.read can return the single-text fragment without its
    // original head, while retaining p.class. Read explicit inline properties
    // below; never infer the missing class's font size or parse hwpjson.
    // A supplied but unresolved/ambiguous head still cannot define formatting.
    if (rules.length > 1 || (!rules.length && head) ||
        (rules.length === 1 && !characterStyle(rules[0], props))) return;
  }
  if (!characterStyle(pa.style ?? "", props) || !characterStyle(sa.style ?? "", props) || !Object.keys(props).length) return;
  return { text: decoded, props };
}
export function pasteCompletion(data: ClipboardData): string {
  if (data.structured) return "구조화된 OS 클립보드 붙여넣기 완료";
  if (hasClipboardMarker(data.html)) return "RHWP HTML 붙여넣기 완료";
  if (hasHancomClipboardMetadata(data.html)) return "한/글 클립보드 서식 붙여넣기 완료";
  if (externalCoreHTML(data.html, data.text))
    return "외부 HTML 붙여넣기 완료 (지원 본문·표·CSS 서식 / HWP 전용 속성 제외)";
  return externalTextFormat(data.html, data.text)
    ? "외부 부분 텍스트 붙여넣기 완료 (지원 글자색·pt 크기 / 대상 문단 유지)"
    : "텍스트 붙여넣기 완료 (서식 제외)";
}

// Resolve only explicit, existing-model class rules. This is inert clipboard
// data, never a stylesheet installed in the page. Unknown cascade/at-rules,
// resources and unsupported declarations remain an atomic refusal.
const pointValue = /^-?\d{1,5}(?:\.\d{1,8})?pt$/i;
const hancomDefaults: Record<string, RegExp> = {
  "mso-style-name": /^["'][\p{L}\p{N} ._+()-]{1,100}["']$/u,
  "word-break": /^break-hangul$/i,
  "layout-grid-mode": /^(?:both|none)$/i,
  "vertical-align": /^baseline$/i,
  "mso-pagination": /^none$/i,
  "text-autospace": /^none$/i,
  "mso-padding-alt": /^0pt(?: +0pt){3}$/i,
  "mso-font-width": /^100%$/i,
  "mso-text-raise": /^0pt$/i,
  "mso-font-kerning": /^0pt$/i,
};

function hancomCharacterValue(key: string, value: string): string | undefined {
  if (["font-family", "mso-ascii-font-family", "mso-fareast-font-family"].includes(key)) {
    const families = value.split(",").map(name => name.trim().replace(/^(["'])(.*?)\1$/u, "$2"));
    if (families.length <= 8 && families.every(name => /^[\p{L}\p{M}\p{N} ._+()-]{1,100}$/u.test(name))) return families.join(",");
  } else if (key === "font-size" && pointValue.test(value) && parseFloat(value) >= 1 && parseFloat(value) <= 200) return value;
  else if (key === "font-weight" && /^(normal|bold|[1-9]00)$/i.test(value)) return value;
  else if (key === "font-style" && /^(normal|italic)$/i.test(value)) return value;
  else if (key === "letter-spacing" && pointValue.test(value)) return value;
  else if (["color", "background-color", "text-decoration-color"].includes(key) && paragraphForeground("color:" + value)) return value;
  else if (["text-decoration", "text-decoration-line"].includes(key) && /^(?:none|underline(?: +line-through)?|line-through(?: +underline)?)$/i.test(value)) {
    return value.toLowerCase() === "line-through underline" ? "underline line-through" : value;
  } else if (key === "text-decoration-style" && /^(solid|double|dotted|dashed|wavy)$/i.test(value)) return value;
}

function inlineDeclarations(css: string): [string, string][] {
  const values: [string, string][] = [];
  for (const d of css.split(";")) {
    const colon = d.indexOf(":");
    if (colon < 0) continue;
    values.push([d.slice(0, colon).trim().toLowerCase(), d.slice(colon + 1).trim()]);
  }
  return values;
}

function hancomCharacterStyle(values: ReadonlyMap<string, string>) {
  const character = new Map<string, string>();
  for (const [key, value] of values) {
    const normalized = hancomCharacterValue(key, value);
    if (normalized !== undefined) character.set(key, normalized);
  }
  const asciiFamily = character.get("mso-ascii-font-family");
  if (asciiFamily && !character.has("font-family")) character.set("font-family", asciiFamily);
  character.delete("mso-ascii-font-family");
  return character;
}

const declarationsCSS = (values: ReadonlyMap<string, string>) =>
  [...values].map(([key, value]) => `${key}:${value};`).join("");

function hancomTableTag(tag: string, attrs: Record<string, string>, refuse: () => never): string | undefined {
  if (!["table", "td", "th"].includes(tag)) return;
  const style = new Map(inlineDeclarations(attrs.style ?? ""));
  let changed = false;
  for (const key of ["width", "height"]) {
    const value = attrs[key];
    if (value === undefined) continue;
    if (!style.has(key)) {
      if (!/^\d{1,6}(?:\.\d{1,4})?(?:px)?$/i.test(value) || parseFloat(value) <= 0) refuse();
      style.set(key, parseFloat(value) + "px");
    }
    delete attrs[key];
    changed = true;
  }
  // The native importer takes the declared outer track dimensions and
  // verifies that the totals fit the owner. Drop only the equivalent CSS
  // switches, leaving conflicting/relative constraints for the normal checks.
  if (tag === "table" && style.get("table-layout")?.toLowerCase() === "fixed")
    changed = style.delete("table-layout") || changed;
  if (tag !== "table" && style.get("box-sizing")?.toLowerCase() === "border-box")
    changed = style.delete("box-sizing") || changed;
  if (!changed) return;
  attrs.style = declarationsCSS(style);
  return "<" + tag + Object.entries(attrs).map(([key, value]) => ` ${key}="${value.replace(/"/g, "&quot;")}"`).join("") + ">";
}

function clipboardClassRules(html: string, hancom: boolean, refuse: () => never) {
  const heads = [...html.matchAll(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/gi)];
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)];
  if ([...html.matchAll(/<style\b/gi)].length !== styles.length || [...html.matchAll(/<\/style\s*>/gi)].length !== styles.length) refuse();
  if (!styles.length) return [];
  if (heads.length !== 1 || styles.some(s => s.index! < heads[0].index! || s.index! + s[0].length > heads[0].index! + heads[0][0].length)) refuse();
  const rules: { tag: string; cls: string; declarations: [string, string][] }[] = [];
  for (const s of styles) {
    const opening = /^<style\b([^>]*)>/i.exec(s[0]);
    const attrs = opening && attributes(opening[1], ["type"]);
    if (!attrs || attrs.type && attrs.type.toLowerCase() !== "text/css") refuse();
    const css = s[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*<!--|-->\s*$/g, "");
    if (css.length > 262144 || /[\\@<>]|url\s*\(|expression\s*\(|javascript\s*:/i.test(css)) refuse();
    let end = 0;
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (css.slice(end, m.index).trim() || rules.length >= 128) refuse();
      const selector = /^\s*(p|span)\.([\w-]+)\s*$/i.exec(m[1]);
      if (!selector) refuse();
      const declarations: [string, string][] = [];
      for (const item of m[2].split(";")) {
        if (!item.trim()) continue;
        const d = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(item);
        if (!d) refuse();
        const key = d![1].toLowerCase(), value = d![2];
        const valid = key === "color" ? /^#[\da-f]{6}$/i.test(value)
          : key === "font-size" ? /^(?:\d+(?:\.\d+)?)pt$/i.test(value) && +value.slice(0, -2) >= 1 && +value.slice(0, -2) <= 200
          : key === "font-weight" ? /^(normal|bold)$/i.test(value)
          : key === "font-style" ? /^(normal|italic)$/i.test(value)
          : key === "text-align" ? /^(left|right|center|justify)$/i.test(value)
          : key === "line-height" ? /^\d+(?:\.\d+)?(?:%|pt)$/i.test(value)
          : ["margin-left", "margin-right", "margin-top", "margin-bottom", "text-indent"].includes(key) && /^-?\d+(?:\.\d+)?pt$/i.test(value);
        const paragraphKey = ["text-align", "line-height", "margin-left", "margin-right", "margin-top", "margin-bottom", "text-indent"].includes(key);
        const charValue = hancom ? hancomCharacterValue(key, value) : undefined;
        if (hancom && Object.hasOwn(hancomDefaults, key) && hancomDefaults[key].test(value)) continue;
        // Core's block parser consumes paragraph properties only; do not silently
        // drop class-inherited character formatting on p (or paragraph CSS on span).
        if (charValue === undefined && (!valid || (selector![1].toLowerCase() === "p") !== paragraphKey)) refuse();
        // Source order wins for equal specificity, including duplicate keys.
        const old = declarations.findIndex(d => d[0] === key); if (old >= 0) declarations.splice(old, 1);
        declarations.push([key, charValue ?? value]);
      }
      rules.push({ tag: selector![1].toLowerCase(), cls: selector![2], declarations }); end = m.index! + m[0].length;
    }
    if (css.slice(end).trim()) refuse();
  }
  return rules;
}

// Only validated inert markup reaches this projection. Core already imports
// paragraphs/inline formatting. Its list importer uses a bullet for every ol,
// so preserve ordered numbers and nested item boundaries explicitly here.
function webBlocks(fragment: string): string {
  type Node = {tag:string; raw:string; attrs:Record<string,string>; children:(Node|string)[]};
  const root:Node={tag:'',raw:'',attrs:{},children:[]}, stack=[root];
  for (const token of fragment.split(/(<[^<>]*>)/g)) {
    if (!token) continue;
    if (token[0] !== '<') { stack[stack.length-1].children.push(token); continue; }
    const m=/^<\s*(\/?)\s*([a-z][\w-]*)([\s\S]*?)>$/i.exec(token)!;
    if(m[1]) { stack.pop(); continue; }
    const tag=m[2].toLowerCase(), n:Node={tag,raw:token,attrs:attributes(m[3],
      ['class','lang','style','align','valign','width','height','cellpadding','cellspacing','border','colspan','rowspan','bgcolor','start','value','data-start','data-end','src'])!,children:[]};
    stack[stack.length-1].children.push(n); if(tag!=='br'&&tag!=='img')stack.push(n);
  }
  const render=(node:Node|string,depth=0):string=>{
    if(typeof node==='string')return node;
    const body=()=>node.children.map(n=>render(n,depth)).join('');
    if(node.tag==='ol'||node.tag==='ul'){
      let count=Number(node.attrs.start??1);
      return node.children.map(item=>{
        if(typeof item==='string')return item;
        if(item.tag!=='li')throw new PasteFormatUnavailable('목록의 항목 구조를 확인할 수 없습니다.');
        if(item.attrs.value!==undefined)count=Number(item.attrs.value);
        const prefix='&#160;'.repeat(depth*2)+(node.tag==='ol'?String(count++)+'. ':'• ');
        let first=true,inline='',out='';
        const flush=()=>{if(inline&&!/^[\t\n\f\r ]*$/.test(inline)){out+='<p>'+ (first?prefix:'')+inline+'</p>';first=false;}inline='';};
        for(const child of item.children){
          if(typeof child!=='string'&&(child.tag==='ol'||child.tag==='ul')){flush();out+=render(child,depth+1);}
          else if(typeof child!=='string'&&child.tag==='p'){
            flush();out+=child.raw+(first?prefix:'')+child.children.map(c=>render(c,depth)).join('')+'</p>';first=false;
          }else inline+=render(child,depth);
        }
        flush();return out||'<p>'+prefix+'</p>';
      }).join('');
    }
    if(node.tag==='li')throw Error('목록 밖의 항목은 지원하지 않습니다.');
    if(/^h[1-6]$/.test(node.tag))return '<p><strong>'+body()+'</strong></p>';
    if(node.tag==='blockquote')return '<div>'+body()+'</div>';
    if(node.tag==='code')return '<span>'+body()+'</span>';
    if(!node.tag)return body();
    const opening=node.raw.replace(/\sdata-(?:start|end)\s*=\s*(["']).*?\1/gi,'');
    return opening+ (node.tag==='br'||node.tag==='img'?'':body()+'</'+node.tag+'>');
  };
  return render(root);
}

// Core reads paragraph shape from <p>, but character color from inline runs.
// Carry only an unambiguous literal that Core's inline color reader accepts.
function paragraphForeground(css: string): string | undefined {
  if (/['"\\]|\/\*/.test(css)) return;
  const declarations = [...css.matchAll(/(?:^|;)\s*color\s*:\s*([^;]*)/gi)];
  if (declarations.length !== 1) return;
  const color = declarations[0][1].trim().toLowerCase();
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$|^(?:black|white|red|green|blue|yellow)$/.test(color)) return color;
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(color);
  if (rgb && rgb.slice(1).every(value => Number(value) <= 255)) return color;
}

/** Admission to the existing Core parser, not another HTML importer/renderer.
 * No incoming markup is attached to DOM or allowed to request resources. */
export function externalCoreHTML(html: string, text: string, picture?: HancomMixedPicture, dpi = 96): string | undefined {
  if (!html || hasClipboardMarker(html) || externalTextFormat(html, text)) return;
  const refuse: (code: string) => never = (code) => { throw new PasteFormatUnavailable(`NOT_SUPPORTED: 이 HTML 구조·리소스는 서식 붙여넣기에서 지원하지 않습니다. [${code}]`); };
  if (html.length > MAX_CLIPBOARD_BYTES * 2) refuse("HTML_SIZE");
  const hancom = hasHancomClipboardMetadata(html);
  if (picture && (!hancom || !isHancomMixedPicture(picture) || !Number.isFinite(dpi) || dpi <= 0)) refuse("HTML_IMAGE_SOURCE");
  const forbidden = /<\s*(script|svg|object|embed|iframe|link|base)\b/i.exec(html)
    ?? (!picture ? /<\s*(img)\b/i.exec(html) : null);
  if (forbidden) refuse(`HTML_RESOURCE:${forbidden[1].toLowerCase()}`);
  // The recorded CF_HTML header contains this fixed Office compatibility
  // comment. Keep other stylesheet/resource input subject to the regular gate.
  const ruleSource = hancom ? html.replace(
    /<!--\[if !mso\]>\s*<style>\s*v\\:\*\s*\{behavior:url\(#default#vml\);\}\s*o\\:\*\s*\{behavior:url\(#default#vml\);\}\s*w\\:\*\s*\{behavior:url\(#default#vml\);\}\s*\.shape\s*\{behavior:url\(#default#vml\);\}\s*<\/style>\s*<!\[endif\]\s*-->/gi, "",
  ) : html;
  const rules = clipboardClassRules(ruleSource, hancom, () => refuse("HTML_CLASS_RULES"));
  const starts = [...html.matchAll(/<!--StartFragment-->/gi)], ends = [...html.matchAll(/<!--EndFragment-->/gi)];
  let fragment = html;
  if (starts.length || ends.length) {
    if (starts.length !== 1 || ends.length !== 1 || starts[0].index! >= ends[0].index!) refuse("FRAGMENT_MARKERS");
    fragment = html.slice(starts[0].index! + starts[0][0].length, ends[0].index);
  } else fragment = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html)?.[1] ?? html;
  // Native hwpjson is a metadata comment, never a second authoritative model.
  fragment = fragment.replace(/<!--[\s\S]*?-->/g, "").replace(/<div\b([^<>]*)>\s*<\/div\s*>/gi, (full, raw) => {
    const a = attributes(raw, ["id", "class", "data-hjsonver", "data-jsonlen", "style"]);
    if (a?.id !== "hwpEditorBoardContent") return full;
    // Chromium can attach computed style to this empty metadata wrapper too.
    // Retain the same resource rejection before removing the inert wrapper.
    if (/url\s*\(|expression\s*\(|@import|javascript\s*:/i.test(a.style ?? "")) refuse("CSS_RESOURCE");
    return "";
  });
  // Observed Hancom terminal-empty-paragraph scaffold, not arbitrary Office
  // markup. Keep the p and preceding br; neither is a dispensable line break.
  // Only an empty, attribute-free o:p in this final placeholder shape is inert.
  // Nonempty/attributed/other qualified tags still reach the strict rejection.
  if (/(?:\r\n|\r|\n)$/.test(text)) fragment = fragment.replace(
    /(<p\b[^<>]*>)[\t\n\f\r ]*(?:(?:<!\[if !supportEmptyParas\]>&nbsp;<!\[endif\]>|&nbsp;|\u00a0)[\t\n\f\r ]*)?<o:p[\t\n\f\r ]*(?:\/>|>[\t\n\f\r ]*<\/o:p[\t\n\f\r ]*>)[\t\n\f\r ]*(<\/p\s*>)[\t\n\f\r ]*$/i,
    "$1$2",
  );
  // Hancom emits this inert Office placeholder at the end of ordinary
  // paragraphs as well as empty ones. Preserve the paragraph and its actual
  // content; recognize only a paired empty-paragraph marker and empty o:p.
  if (hancom) fragment = fragment.replace(
    /<!\[if !supportEmptyParas\]>&nbsp;<!\[endif\]>[\t\n\f\r ]*<o:p\/>[\t\n\f\r ]*(<\/p\s*>)/gi,
    "$1",
  );
  const allowed = new Set(["p", "pre", "div", "span", "u", "b", "i", "strong", "em", "s", "strike", "br", "img", "table", "tbody", "thead", "tfoot", "tr", "td", "th", "ol", "ul", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code"]);
  type Replacement = { at: number; length: number; value: string };
  const replacements: Replacement[] = [];
  const inline = new Set(["span", "u", "b", "i", "strong", "em", "s", "strike", "br"]);
  let paragraphFormat: { css: string; depth: number; opening: Replacement; inlineOnly: boolean } | undefined;
  let addedTokens = 0;
  const stack: string[] = []; let at = 0, nodes = 0, imageCount = 0;
  let imageConditionalDepth: number | undefined;
  for (const token of fragment.matchAll(/<[^<>]*>/g)) {
    const gap = fragment.slice(at, token.index);
    if (gap.includes("<") || ++nodes > 100_000) refuse("HTML_TOKEN_LIMIT");
    if (imageConditionalDepth !== undefined && /[^\t\n\f\r ]/.test(gap)) refuse("HTML_IMAGE_CONDITIONAL");
    // Legacy Hancom HTML can expose a downlevel-revealed picture wrapper.
    // Keep its already-verified PNG and discard only the paired delimiters.
    // Never interpret other conditions or admit additional branch content.
    if (hancom && picture) {
      const opensPictureFallback = /^<!\[if[\t ]+!vml[\t ]*\]>$/i.test(token[0]);
      const closesPictureFallback = /^<!\[endif[\t ]*\]>$/i.test(token[0]);
      if (opensPictureFallback || closesPictureFallback) {
        if (opensPictureFallback) {
          if (imageConditionalDepth !== undefined || imageCount !== 0 || stack.includes("table"))
            refuse("HTML_IMAGE_CONDITIONAL");
          imageConditionalDepth = stack.length;
        } else {
          if (imageConditionalDepth !== stack.length || imageCount !== 1) refuse("HTML_IMAGE_CONDITIONAL");
          imageConditionalDepth = undefined;
        }
        replacements.push({at: token.index!, length: token[0].length, value: ""});
        at = token.index! + token[0].length;
        continue;
      }
    }
    const m = /^<\s*(\/?)\s*([a-z][\w-]*)([\s\S]*?)>$/i.exec(token[0]);
    if (!m) refuse("HTML_TOKEN");
    if (!allowed.has(m[2].toLowerCase())) refuse(`HTML_TAG:${m[2].toLowerCase()}`);
    const [, close, rawTag, raw] = m!, tag = rawTag.toLowerCase();
    if (imageConditionalDepth !== undefined &&
        (tag !== "img" && (!inline.has(tag) || tag === "br") || close && stack.length <= imageConditionalDepth))
      refuse("HTML_IMAGE_CONDITIONAL");
    if (tag === "img") {
      if (!picture || close || token[0] !== picture.tag || imageCount !== 0 ||
          stack.includes("table") || /\son[\w-]*\s*=/i.test(raw)) refuse("HTML_IMAGE_SOURCE");
      const { file, width, height } = picture;
      const mime = file.extension === "png" ? "png" : "jpeg";
      replacements.push({at: token.index!, length: token[0].length,
        value: `<img src="data:image/${mime};base64,${encodeClipboardBytes(file.bytes)}" width="${width*dpi/7200}" height="${height*dpi/7200}">`});
      imageCount++;
      at = token.index! + token[0].length;
      continue;
    }
    if (close) {
      if (raw.trim() || stack.pop() !== tag) refuse("HTML_NESTING");
      if (tag === "p" && paragraphFormat?.depth === stack.length) {
        const { css, opening, inlineOnly } = paragraphFormat;
        if (inlineOnly && fragment.slice(opening.at + opening.length, token.index).trim()) {
          // The outer inline run carries paragraph character defaults.
          // Child runs still win. Never wrap a block or a table.
          opening.value += `<span style="${css}">`;
          replacements.push({ at: token.index!, length: token[0].length, value: `</span>${token[0]}` });
          addedTokens += 2;
        }
        paragraphFormat = undefined;
      }
    }
    else {
      const a = attributes(raw.replace(/\/\s*$/, ""), ["class", "lang", "style", "align", "valign", "width", "height", "cellpadding", "cellspacing", "border", "colspan", "rowspan", "bgcolor", "start", "value", "data-start", "data-end"]);
      if (!a) refuse(`HTML_ATTRIBUTES:${tag}`);
      for (const key of ['start','value']) if (a[key] !== undefined &&
          (!/^-?\d{1,6}$/.test(a[key]) || (key==='start'?tag!=='ol':tag!=='li'))) refuse('HTML_LIST_NUMBER');
      if (/url\s*\(|expression\s*\(|@import|javascript\s*:/i.test(a.style ?? "")) refuse("CSS_RESOURCE");
      let openingTag = hancom && hancomTableTag(tag, a, () => refuse("HTML_TABLE_DIMENSION")) || token[0];
      const classValues = new Map<string, string>();
      const own = new Map(hancom || rules.length ? inlineDeclarations(a.style ?? "") : []);
      if (rules.length && a) {
        const matched = rules.filter(r => r.tag === tag && (a.class ?? "").split(/\s+/).includes(r.cls));
        for (const rule of matched) for (const [key, value] of rule.declarations) classValues.set(key, value);
      }
      const effective = new Map([...classValues, ...own]);
      const character = hancom && (tag === "p" || inline.has(tag)) ? hancomCharacterStyle(effective) : undefined;
      const injected = new Map([...classValues].filter(([key]) => !own.has(key)));
      if (character && inline.has(tag) && !effective.has("font-family") && character.has("font-family"))
        injected.set("font-family", character.get("font-family")!);
      const inherited = declarationsCSS(injected);
      if (inherited) {
        const opening = /\sstyle\s*=\s*(["'])/i.exec(openingTag);
        openingTag = opening
          ? openingTag.slice(0, opening.index + opening[0].length) + inherited + openingTag.slice(opening.index + opening[0].length)
          : openingTag.replace(/>$/, ` style="${inherited}">`);
      }
      const replacement = { at: token.index!, length: token[0].length, value: openingTag };
      const color = !hancom && tag === "p" && !stack.length ? paragraphForeground(a.style ?? "") : undefined;
      const css = color ? `color:${color}` : tag === "p" && character ? declarationsCSS(character) : "";
      if (paragraphFormat && !inline.has(tag)) paragraphFormat.inlineOnly = false;
      if (css) paragraphFormat = { css, depth: stack.length, opening: replacement, inlineOnly: true };
      if (css || openingTag !== token[0]) replacements.push(replacement);
      if (tag !== "br") stack.push(tag);
      if (paragraphFormat && stack.length >= 32) paragraphFormat.inlineOnly = false;
      if (stack.length > 32) refuse("HTML_DEPTH");
    }
    at = token.index! + token[0].length;
  }
  if (imageConditionalDepth !== undefined) refuse("HTML_IMAGE_CONDITIONAL");
  if (picture && imageCount !== 1) refuse("HTML_IMAGE_SOURCE");
  if (stack.length || fragment.slice(at).includes("<") || !/<(?:p|pre|div|table|ol|ul|h[1-6]|blockquote)\b/i.test(fragment)) refuse("HTML_ROOT_OR_NESTING");
  if (addedTokens && nodes + addedTokens > 100_000) refuse("HTML_TOKEN_LIMIT");
  const chunks: string[] = [];
  let cursor = 0;
  for (const r of replacements) {
    chunks.push(fragment.slice(cursor, r.at), r.value);
    cursor = r.at + r.length;
  }
  if (replacements.length) fragment = chunks.join("") + fragment.slice(cursor);
  if ((addedTokens || picture) && fragment.length > MAX_CLIPBOARD_BYTES * 2) refuse("HTML_SIZE");
  return /<(?:ol|ul|li|h[1-6]|blockquote|code)\b/i.test(fragment) ? webBlocks(fragment) : fragment;
}
