import { parseSvgMarkup, type SvgTextTemplates } from "./svg-parse.js";
import { rememberSvgTextSource } from './svg-text-region.js';
const SVG = "http://www.w3.org/2000/svg";
const pageTemplates = new WeakMap<SVGSVGElement, SvgTextTemplates>();
// Shared by renderer instances in the same DOM, without owning document state.
const instanceKey = Symbol.for("rhwp.edit.svg-instance");

function unescapeCss(value: string): string {
  return value.replace(
    /\\([0-9a-f]{1,6}\s?|[\s\S])/gi,
    (_, escaped: string) => {
      if (!/^[0-9a-f]/i.test(escaped)) return escaped;
      const code = parseInt(escaped.trim(), 16);
      return code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "\ufffd";
    },
  );
}

/** Mount Core SVG resources in their own page/instance scope. No IR mutation. */
export function createPageSvg(
  markup: string,
  page: number,
  owner: Document = document,
  previous?: SVGSVGElement,
): SVGSVGElement {
  if (!Number.isSafeInteger(page) || page < 0)
    throw Error("Invalid SVG page index");
  const { parsed, templates } = parseSvgMarkup(markup, previous && pageTemplates.get(previous));
  const svg = parsed.documentElement;
  if (
    svg.namespaceURI !== SVG ||
    svg.localName !== "svg" ||
    parsed.getElementsByTagName("parsererror").length
  )
    throw Error("Invalid Core page SVG");
  // Preserve the existing Core drawing trust boundary before importing nodes.
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    if (
      el.namespaceURI !== SVG ||
      [
        "script",
        "foreignObject",
        "iframe",
        "animate",
        "animateMotion",
        "animateTransform",
        "set",
      ].includes(el.localName)
    ) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      if (
        attr.localName.toLowerCase().startsWith("on") ||
        (attr.namespaceURI === "http://www.w3.org/XML/1998/namespace" &&
          attr.localName === "base")
      )
        el.removeAttributeNode(attr);
      else if (
        attr.localName === "href" &&
        !attr.value.startsWith("#") &&
        !(el.localName === "image" && attr.value.startsWith("data:image/"))
      )
        el.removeAttributeNode(attr);
    }
  }
  const elements = [svg, ...svg.querySelectorAll("*")];
  const originalIds = new Set<string>();
  for (const el of elements) {
    const id = el.getAttribute("id");
    if (id === null) continue;
    // Duplicate IDs within one fragment have ambiguous targets. Never guess.
    if (!id || /\s/.test(id) || originalIds.has(id))
      throw Error("Ambiguous Core SVG resource ID");
    originalIds.add(id);
  }
  let instance: number = Reflect.get(owner, instanceKey) ?? 0;
  if (!Number.isSafeInteger(instance) || instance < 0)
    throw Error("Invalid SVG instance scope");
  let prefix: string;
  do {
    if (!Number.isSafeInteger(++instance))
      throw Error("SVG instance scope exhausted");
    prefix = `rhwp-svg-p${page}-i${instance}`;
  } while (
    [prefix, ...Array.from(originalIds, (_, i) => `${prefix}-r${i}`)].some(
      (id) => owner.getElementById(id),
    )
  );
  Reflect.set(owner, instanceKey, instance);
  const ids = new Map([...originalIds].map((id, i) => [id, `${prefix}-r${i}`]));
  const rootId = ids.get(svg.getAttribute("id") ?? "") ?? prefix;
  const local = (value: string) => {
    if (!value.startsWith("#")) throw Error("External SVG resource URL");
    let id: string;
    try {
      id = decodeURIComponent(value.slice(1));
    } catch {
      throw Error("Invalid SVG fragment URL");
    }
    const scoped = ids.get(id);
    if (!scoped) throw Error("Unresolved Core SVG resource");
    return `#${scoped}`;
  };
  // Parse CSS URL tokens, not arbitrary text replacements or selector lookups.
  const urls = (value: string, fontSource = false) => {
    // Both transforming/rejecting branches below require a literal opening
    // parenthesis after the decoded token. Without one, the lexer can only
    // copy its input unchanged (including quoted names and escaped tokens).
    if (!value.includes("(")) return value;
    let out = "",
      pos = 0;
    while (pos < value.length) {
      const rest = value.slice(pos);
      const skip =
        /^(?:\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/.exec(rest);
      if (skip) {
        out += skip[0];
        pos += skip[0].length;
        continue;
      }
      const token = /^(?:[a-z_-]|\\(?:[0-9a-f]{1,6}\s?|.))+/i.exec(rest);
      if (!token) {
        out += value[pos++];
        continue;
      }
      const name = unescapeCss(token[0]).toLowerCase();
      const tail = rest.slice(token[0].length);
      if (name === "var" && /^\s*\(/.test(tail))
        throw Error("Unscoped SVG CSS variable");
      if (name !== "url" || !/^\s*\(/.test(tail)) {
        out += token[0];
        pos += token[0].length;
        continue;
      }
      const args =
        /^\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)\\])*))\s*\)/.exec(
          tail,
        );
      if (!args) throw Error("Invalid SVG CSS resource URL");
      const ref = unescapeCss(args[1] ?? args[2] ?? args[3]).trim();
      const embeddedFont =
        fontSource &&
        /^data:(?:font\/(?:ttf|otf|opentype|woff2?)|application\/(?:x-font-(?:ttf|opentype|woff)|vnd\.ms-opentype|font-woff));base64,[a-z0-9+/]+={0,2}$/i.test(
          ref,
        );
      out += `url(${embeddedFont ? '"' + ref + '"' : local(ref)})`;
      pos += token[0].length + args[0].length;
    }
    return out;
  };
  const selector = (value: string) => {
    let out = "",
      pos = 0,
      brackets = 0;
    while (pos < value.length) {
      const rest = value.slice(pos);
      const skip =
        /^(?:\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/.exec(rest);
      if (skip) {
        out += skip[0];
        pos += skip[0].length;
        continue;
      }
      if (value[pos] === "[") brackets++;
      if (value[pos] === "]") brackets--;
      const id =
        !brackets &&
        /^#((?:[\w-]|[^\x00-\x7f]|\\(?:[0-9a-f]{1,6}\s?|.))+)/.exec(rest);
      if (id) {
        out += "#" + (ids.get(unescapeCss(id[1])) ?? id[1]);
        pos += id[0].length;
      } else out += value[pos++];
    }
    return out;
  };
  const stylesheet = (text: string) => {
    if (/@import/i.test(unescapeCss(text)))
      throw Error("External SVG stylesheet");
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    const rules = (items: CSSRuleList): string =>
      [...items]
        .map((rule) => {
          if (rule instanceof CSSStyleRule) {
            const declarations = [...rule.style]
              .map(
                (name) =>
                  `${name}:${urls(rule.style.getPropertyValue(name))}${rule.style.getPropertyPriority(name) ? " !important" : ""};`,
              )
              .join("");
            const s = selector(rule.selectorText);
            return `#${rootId}:is(${s}),#${rootId} :is(${s}){${declarations}}`;
          }
          if (rule instanceof CSSMediaRule)
            return `@media ${rule.conditionText}{${rules(rule.cssRules)}}`;
          if (rule instanceof CSSSupportsRule)
            return `@supports ${rule.conditionText}{${rules(rule.cssRules)}}`;
          // Core may emit local or embedded font faces. Retain that existing
          // font-provider contract, without allowing remote font fetches.
          if (rule instanceof CSSFontFaceRule) {
            const declarations = [...rule.style]
              .map(
                (name) =>
                  `${name}:${urls(rule.style.getPropertyValue(name), name === "src")};`,
              )
              .join("");
            return `@font-face{${declarations}}`;
          }
          throw Error("Unsupported Core SVG stylesheet rule");
        })
        .join("\n");
    return rules(sheet.cssRules);
  };
  for (const el of elements) {
    for (const attr of [...el.attributes]) {
      if (attr.localName === "id") el.setAttribute("id", ids.get(attr.value)!);
      else if (attr.localName === "href" && attr.value.startsWith("#"))
        el.setAttributeNS(attr.namespaceURI, attr.name, local(attr.value));
      else if (["aria-labelledby", "aria-describedby"].includes(attr.localName))
        el.setAttribute(
          attr.name,
          attr.value
            .split(/\s+/)
            .map((id) => {
              const scoped = ids.get(id);
              if (!scoped) throw Error("Unresolved SVG accessible reference");
              return scoped;
            })
            .join(" "),
        );
      // Raster hrefs are URL data, not CSS declarations. This strict alphabet
      // cannot contain CSS URL/var tokens or escapes; all other values still
      // pass through the existing resource lexer and rejection rules below.
      else if (
        el.localName === "image" && attr.localName === "href" &&
        /^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(attr.value)
      ) continue;
      else {
        const value = urls(attr.value);
        if (value !== attr.value)
          el.setAttributeNS(attr.namespaceURI, attr.name, value);
      }
    }
    if (el.localName === "style")
      el.textContent = stylesheet(el.textContent ?? "");
  }
  svg.setAttribute("id", rootId);
  // This freshly parsed tree is private to this call and already fully
  // validated/scoped. Transfer it to the target document instead of cloning
  // every glyph a second time. No caller retains the temporary XML document.
  const result = owner.adoptNode(svg) as unknown as SVGSVGElement;
  pageTemplates.set(result, templates);
  rememberSvgTextSource(result, markup);
  return result;
}
