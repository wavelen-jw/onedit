import { rewriteHwpxXmlMember } from "./clipboard-section-zip.js";

const appNamespace = "http://www.hancom.co.kr/hwpml/2011/app";
const config = "urn:oasis:names:tc:opendocument:xmlns:config:1.0";
const supported = new Map<string, { type: string; values: readonly string[] }>([
  ["PrintAutoFootNote", {type: "boolean", values: ["true", "false"]}],
  ["PrintAutoHeadNote", {type: "boolean", values: ["true", "false"]}],
  ["PrintMethod", {type: "short", values: ["0", "4"]}],
  ["OverlapSize", {type: "short", values: ["0"]}],
  ["PrintCropMark", {type: "short", values: ["0"]}],
  ["BinderHoleType", {type: "short", values: ["0"]}],
  ["ZoomX", {type: "short", values: ["100"]}],
  ["ZoomY", {type: "short", values: ["100"]}],
]);
export type PrintSettings = ReadonlyMap<string, string>;
const documentSettings = new WeakMap<object, PrintSettings>();

function settingsRoot(xml: Document) {
  const root = xml.documentElement;
  if (root.namespaceURI !== appNamespace || root.localName !== "HWPApplicationSetting")
    throw Error("HWPX 인쇄 설정을 읽지 못했습니다.");
  return root;
}

function printGroups(root: Element) {
  return Array.from(root.children).filter(child =>
    child.namespaceURI === config && child.localName === "config-item-set" &&
    child.getAttribute("name") === "PrintInfo");
}

export async function readPrintSettings(bytes: Uint8Array): Promise<PrintSettings | undefined> {
  if (bytes[0] !== 80 || bytes[1] !== 75) return;
  let settings: PrintSettings | undefined;
  await rewriteHwpxXmlMember(bytes, "settings.xml", xml => {
    const groups = printGroups(settingsRoot(xml));
    if (!groups.length) return false;
    if (groups.length !== 1 || groups[0].attributes.length !== 1)
      throw Error("HWPX 인쇄 설정이 중복되었습니다.");
    const values = new Map<string, string>();
    for (const child of Array.from(groups[0].children)) {
      const name = child.getAttribute("name") ?? "";
      const entry = supported.get(name);
      const value = child.textContent?.trim() ?? "";
      if (child.namespaceURI !== config || child.localName !== "config-item" || child.childElementCount ||
          child.attributes.length !== 2 || values.has(name) || !entry ||
          child.getAttribute("type") !== entry.type || !entry.values.includes(value))
        throw Error("지원하지 않는 HWPX 인쇄 설정입니다.");
      values.set(name, value);
    }
    if (values.size !== supported.size) throw Error("HWPX 인쇄 설정이 완전하지 않습니다.");
    settings = values;
    return false;
  });
  return settings;
}

export function rememberPrintSettings(doc: object, settings: PrintSettings | undefined) {
  if (settings) documentSettings.set(doc, settings);
}

export async function retainPrintSettings(doc: object, bytes: Uint8Array): Promise<Uint8Array> {
  const settings = documentSettings.get(doc);
  if (!settings) return bytes;
  return rewriteHwpxXmlMember(bytes, "settings.xml", xml => {
    const root = settingsRoot(xml);
    // A value written by Core or already in the destination takes precedence.
    if (printGroups(root).length) return false;
    const group = xml.createElementNS(config, "config:config-item-set");
    group.setAttribute("name", "PrintInfo");
    for (const [name, entry] of supported) {
      const item = xml.createElementNS(config, "config:config-item");
      item.setAttribute("name", name);
      item.setAttribute("type", entry.type);
      item.textContent = settings.get(name) ?? "";
      group.appendChild(item);
    }
    root.appendChild(group);
  });
}

