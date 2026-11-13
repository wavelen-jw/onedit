// Core emits the same long, XML-escaped font family list on many glyphs.
// Reuse only its already XML-decoded value; every tag, coordinate, text/entity,
// namespace and duplicate-attribute check still goes through the XML parser.
export type SvgTextTemplates = Map<string, string>;
const marker = "__rhwp_decoded_font_";
const imageMarker = "__rhwp_decoded_image_";
// Only canonical, inert raster data that this exact validated page already used.
// Other hrefs/entities/attributes still pass through the ordinary XML parser.
const raster = /^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/i;
const tags = /<(?:"[^"]*"|'[^']*'|[^'">])*?>/g;
const attributes = /\s+([^\s=/'"<>]+)\s*=\s*("[^"]*"|'[^']*')/g;

export function parseSvgMarkup(markup: string, previous?: SvgTextTemplates): { parsed: Document; templates: SvgTextTemplates } {
  const eligible = !markup.includes("<!") && !markup.includes("<?") && !markup.includes(marker) && !markup.includes(imageMarker);
  const raw: (string | undefined)[] = [], restored: string[] = [];
  const imageRaw: {name:string;quoted:string}[][] = [], imageValues: string[] = [];
  let index = 0, imageIndex = 0;
  const compact = eligible ? markup.replace(tags, tag => {
    const text = /^<text(?=\s|>)/.test(tag), image = /^<image(?=\s|\/?>)/.test(tag);
    if (!text && !image) return tag;
    const i = text ? index++ : imageIndex++;
    return tag.replace(attributes, (all, name, quoted) => {
      if (image) {
        if (name !== "href" && name !== "xlink:href") return all;
        const value = quoted.slice(1, -1);
        if (quoted.length < 4096 || !raster.test(value)) return all;
        (imageRaw[i] ??= []).push({name, quoted});
        // Require the old decoded bytes to equal the current literal data URI.
        // No image decoding, href policy, or namespace validation is skipped.
        if (previous?.get(quoted) !== value) return all;
        const token = imageMarker + imageValues.length;
        imageValues.push(value);
        return all.slice(0, -quoted.length) + '"' + token + '"';
      }
      if (name !== "font-family") return all;
      // Exact quoted bytes are the cache key. Entity/quote changes are parsed
      // normally. Keep the attribute name, so duplicate attributes still fail.
      raw[i] = quoted;
      const value = previous?.get(quoted);
      if (value === undefined || quoted.length < 80) return all;
      const token = `${marker}${restored.length}`;
      restored.push(value);
      return ` font-family="${token}"`;
    });
  }) : markup;
  const parsed = new DOMParser().parseFromString(compact, "image/svg+xml");
  const templates: SvgTextTemplates = new Map();
  if (eligible && !parsed.getElementsByTagName("parsererror").length) {
    const texts = [...parsed.getElementsByTagName("text")];
    const images = [...parsed.getElementsByTagName("image")];
    if (texts.length !== index || images.length !== imageIndex) {
      // An unusual namespace/tag shape must not receive guessed attribute owners.
      return { parsed: new DOMParser().parseFromString(markup, "image/svg+xml"), templates };
    }
    images.forEach((node, i) => {
      for (const source of imageRaw[i] ?? []) {
        const attr = node.getAttributeNode(source.name);
        if (!attr) continue;
        if (attr.value.startsWith(imageMarker)) {
          const n = Number(attr.value.slice(imageMarker.length));
          if (!Number.isSafeInteger(n) || imageValues[n] === undefined) throw Error("Invalid SVG image token");
          attr.value = imageValues[n];
        }
        if (attr.value === source.quoted.slice(1, -1)) templates.set(source.quoted, attr.value);
      }
    });
    texts.forEach((node, i) => {
      const value = node.getAttribute("font-family");
      if (value?.startsWith(marker)) {
        const n = Number(value.slice(marker.length));
        if (!Number.isSafeInteger(n) || restored[n] === undefined) throw Error("Invalid SVG font token");
        node.setAttribute("font-family", restored[n]);
      }
      if (raw[i] && node.hasAttribute("font-family")) templates.set(raw[i]!, node.getAttribute("font-family")!);
    });
  }
  return { parsed, templates };
}
