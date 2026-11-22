import { rewriteSectionXml } from "./clipboard-section-zip.js";

const hp = "http://www.hancom.co.kr/hwpml/2011/paragraph";
type LinkOrder = { key: string; value: number };
// Scope to the Core handle. Full paste undo/redo already swaps the handles.
const orders = new WeakMap<object, LinkOrder>();

function singleLink(xml: Document) {
  const heads = Array.from(xml.getElementsByTagNameNS(hp,"fieldBegin"));
  if (heads.length !== 1 || heads[0].getAttribute("type") !== "HYPERLINK") return;
  const field = heads[0];
  const id = field.getAttribute("id"), fieldId = field.getAttribute("fieldid");
  if (!id || !fieldId || !/^\d{1,10}$/.test(id) || !/^\d{1,10}$/.test(fieldId)) return;
  const tails = Array.from(xml.getElementsByTagNameNS(hp,"fieldEnd"));
  if (tails.length !== 1 || tails[0].getAttribute("beginIDRef") !== id ||
      tails[0].getAttribute("fieldid") !== fieldId) return;
  const tail = tails[0];
  const owner = field.parentElement?.parentElement?.parentElement;
  if (!owner || owner.namespaceURI !== hp || owner.localName !== "p" ||
      tail.parentElement?.parentElement?.parentElement !== owner) return;
  const params = Array.from(field.getElementsByTagNameNS(hp,"stringParam"))
    .filter(p => p.getAttribute("name") === "Command");
  const command = params.length === 1 ? params[0].textContent ?? "" : "";
  if (!/^mailto:[^\s;]+;/.test(command) || command.length > 256) return;
  const between = Array.from(owner.getElementsByTagNameNS(hp,"t")).filter(t =>
    (field.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
    (tail.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
  const label = between.map(t=>t.textContent).join("");
  if (!label || label.length > 256) return;
  return {field,key:JSON.stringify([id,fieldId,command,label])};
}

export async function extractLinkZOrder(bytes: Uint8Array): Promise<LinkOrder | undefined> {
  if (bytes[0] !== 80 || bytes[1] !== 75) return;
  let result: LinkOrder | undefined;
  await rewriteSectionXml(bytes,xml=>{
    const link = singleLink(xml);
    const raw = link?.field.getAttribute("zorder");
    if (link && raw != null && /^-?\d{1,10}$/.test(raw)) {
      const value = Number(raw);
      if (value >= -2147483648 && value <= 2147483647) result={key:link.key,value};
    }
    return false;
  });
  return result;
}

export function rememberLinkZOrder(doc: object, order: LinkOrder | undefined) {
  if (order) orders.set(doc,order);
}

export async function retainLinkZOrder(doc: object, bytes: Uint8Array): Promise<Uint8Array> {
  const saved = orders.get(doc);
  if (!saved) return bytes;
  return rewriteSectionXml(bytes,xml=>{
    const link = singleLink(xml);
    if (!link || link.key !== saved.key || link.field.hasAttribute("zorder")) return false;
    link.field.setAttribute("zorder",String(saved.value));
  });
}
