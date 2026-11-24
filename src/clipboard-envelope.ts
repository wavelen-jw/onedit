export const CLIPBOARD_MIME = "web application/vnd.rhwp-next.body+json";
export const MAX_CLIPBOARD_BYTES = 8 * 1024 * 1024;
const marker = "data-rhwp-next-clipboard";
const markerAttribute = new RegExp(`${marker}="([A-Za-z0-9+/=]+)"`, "g");
const header = { format: "rhwp-next-body", version: 1, encoding: "hwpx-fragment" } as const;

export function hasClipboardMarker(html: string) {
  return html.includes(marker);
}

export const encodeClipboardBytes = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
export function clipboardEnvelope(
  bytes: Uint8Array,
  metadata?: { scope: "nested" } | { paragraphMode: "retain-target-for-native-range" },
) {
  if (bytes.length > MAX_CLIPBOARD_BYTES)
    throw Error("클립보드 크기 제한은 8 MiB입니다.");
  return { ...header, ...metadata, payload: encodeClipboardBytes(bytes) };
}

export function clipboardHTMLAttribute(wire: string) {
  return `${marker}="${encodeClipboardBytes(new TextEncoder().encode(wire))}"`;
}

export function wrapClipboardHTML(wire: string, content: string) {
  return `<div ${clipboardHTMLAttribute(wire)}>${content}</div>`;
}

const decode = (text: string, limit = MAX_CLIPBOARD_BYTES) => {
  if (text.length > limit * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text))
    throw Error("클립보드 데이터 크기 또는 인코딩이 올바르지 않습니다.");
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  // atob returns one byte per UTF-16 code unit. Fill directly rather than
  // allocating an iterable conversion and calling a mapper for every byte.
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
export function decodeEnvelope(wire: string, nativeHancomRange = false) {
  if (wire.length > MAX_CLIPBOARD_BYTES * 1.4)
    throw Error("클립보드 크기 제한을 초과했습니다.");
  const data = JSON.parse(wire);
  if (
    data?.format !== header.format ||
    data.version !== header.version ||
    data.encoding !== header.encoding ||
    typeof data.payload !== "string"
  )
    throw Error("지원하지 않거나 손상된 RHWP 클립보드 형식입니다.");
  if (data.paragraphMode !== undefined &&
      data.paragraphMode !== "retain-target-at-body-end" && data.paragraphMode !== "retain-target-for-inline-text" && (data.paragraphMode !== "retain-target-for-native-range" || !nativeHancomRange))
    throw Error("지원하지 않는 클립보드 문단 결합 방식입니다.");
  const bytes = decode(data.payload);
  if (bytes.length > MAX_CLIPBOARD_BYTES)
    throw Error("클립보드 크기 제한을 초과했습니다.");
  return bytes;
}
export function envelopeFromHTML(html: string): string | undefined {
  if (html.length > MAX_CLIPBOARD_BYTES * 2)
    throw Error("HTML 클립보드 크기 제한을 초과했습니다.");
  if (!hasClipboardMarker(html)) return undefined;
  const matches = [...html.matchAll(markerAttribute)];
  if (matches.length !== 1)
    throw Error("손상되거나 중복된 RHWP HTML 클립보드입니다.");
  return new TextDecoder("utf-8", { fatal: true }).decode(
    decode(matches[0][1], MAX_CLIPBOARD_BYTES * 1.5),
  );
}
