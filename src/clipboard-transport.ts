import { clipboardPicture, hancomMixedPicture, imageOnly, type HancomMixedPicture } from "./clipboard-image.js";
import { hasHancomClipboardMetadata } from "./external-text-format.js";
import { PasteFormatUnavailable } from "./paste-format-fallback.js";
import type { ClipboardData } from "./clipboard.js";
import { CLIPBOARD_MIME, hasClipboardMarker, MAX_CLIPBOARD_BYTES } from "./clipboard-envelope.js";
export const MARKDOWN_FLAVORS = ["text/markdown", "web text/markdown"] as const;
export type ClipboardRead = ClipboardData & { plainAlternative?: string; markdown?: string; mixedPicture?: HancomMixedPicture };
export type NativePastePayload = {files: File[]; advertisedFiles?: boolean; hancomQaPrepared?: boolean; html: string; text: string; structured?: string; markdown?: string};

async function permission(name: "clipboard-read" | "clipboard-write") {
  if (!document.hasFocus())
    throw Error("편집기에 포커스를 둔 뒤 다시 시도하세요.");
  const policy = (
    document as Document & {
      featurePolicy?: { allowsFeature(name: string): boolean };
    }
  ).featurePolicy;
  if (policy && !policy.allowsFeature(name))
    throw Error(`iframe 권한 정책에서 ${name} 접근을 차단했습니다.`);
  // A query observes an explicit denial; it never requests or changes permission.
  let status: PermissionStatus | undefined;
  try {
    status = await navigator.permissions?.query({
      name: name as PermissionName,
    });
  } catch {
    /* Browser may not expose this descriptor. The actual API still enforces it. */
  }
  if (status?.state === "denied")
    throw Error(`클립보드 권한이 거절되었습니다: ${name}`);
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                "클립보드 응답 시간이 초과되었습니다. 문서는 변경하지 않았습니다.",
              ),
            ),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
// Only called from explicit copy/cut/paste user commands. Never polls the clipboard.
export async function writeClipboard(data: ClipboardData): Promise<string> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw Error(
      "이 브라우저는 확인 가능한 클립보드 쓰기를 지원하지 않습니다. 잘라내기는 취소되었습니다.",
    );
  await permission("clipboard-write");
  const types: Record<string, Blob> = {
    "text/plain": new Blob([data.text], { type: "text/plain" }),
  };
  if (data.html)
    types["text/html"] = new Blob([data.html], { type: "text/html" });
  const custom = data.structured && ClipboardItem.supports?.(CLIPBOARD_MIME);
  if (custom)
    types[CLIPBOARD_MIME] = new Blob([data.structured!], {
      type: "application/vnd.rhwp-next.body+json",
    });
  await bounded(navigator.clipboard.write([new ClipboardItem(types)]));
  return custom
    ? "구조화된 OS 클립보드"
    : data.html
      ? "HTML 클립보드 (RHWP fragment 포함)"
      : "텍스트 클립보드 (서식 제외)";
}
function validateImageOnly(html: string, text: string, fileName?: string) {
  try { imageOnly(html, text, fileName); }
  catch (e) { throw new PasteFormatUnavailable(e instanceof Error ? e.message : String(e), text); }
}
async function readHancomMixed(html: string, text: string, images: readonly Blob[], fileName?: string): Promise<ClipboardRead | undefined> {
  if (!hasHancomClipboardMetadata(html) || !/<img\b/i.test(html)) return;
  try {
    if (images.length > 1) throw Error("한/글 본문과 함께 복사된 그림 파일이 여러 개입니다.");
    const mixedPicture = await bounded(hancomMixedPicture(html, text, images[0], fileName));
    if (mixedPicture && mixedPicture.file.bytes.length > MAX_CLIPBOARD_BYTES)
      throw Error("혼합 붙여넣기의 그림 크기 제한은 8 MiB입니다.");
    if (mixedPicture) return { html, text, mixedPicture };
  } catch (error) {
    throw new PasteFormatUnavailable(error instanceof Error ? error.message : "한/글 그림 원본을 확인할 수 없습니다.", text);
  }
}
async function choosePasteFormat(
  html: string,
  text: string,
  readImages: () => readonly Blob[] | Promise<readonly Blob[]>,
  readMarkdown: () => string | undefined | Promise<string | undefined>,
  missingImageReason?: string,
): Promise<ClipboardRead> {
  // An RHWP envelope is the authoritative fragment even when the browser
  // supplies an alternate thumbnail. The paste command validates the envelope.
  if (hasClipboardMarker(html)) return { html, text };

  const images = await readImages();
  const image = images[0];
  const fileName = image instanceof File ? image.name : undefined;
  const mixed = await readHancomMixed(html, text, images, fileName);
  if (mixed) return mixed;
  if (image) {
    if (images.length !== 1)
      throw new PasteFormatUnavailable("그림 파일 한 개만 붙여넣을 수 있습니다.", text);
    validateImageOnly(html, text, fileName);
    return { text: "", html: "", image: await bounded(clipboardPicture(image, html)) };
  }
  if (missingImageReason) throw new PasteFormatUnavailable(missingImageReason, text);

  const markdown = await readMarkdown();
  if (!html && !text && !markdown)
    throw new PasteFormatUnavailable("붙일 수 있는 클립보드 내용이 없습니다.");
  return { text: text || markdown || "", html, markdown };
}

// The browser paste event owns these synchronously captured strings and files.
export async function readNativePaste(data: NativePastePayload): Promise<ClipboardRead> {
  for (const value of [data.html, data.text, data.structured ?? "", data.markdown ?? ""])
    if (new TextEncoder().encode(value).byteLength > MAX_CLIPBOARD_BYTES * 2)
      throw Error("클립보드 크기 제한을 초과했습니다.");
  if (data.structured) return { text: data.text, html: data.html, structured: data.structured };
  return choosePasteFormat(
    data.html, data.text, () => data.files, () => data.markdown,
    data.advertisedFiles ? "브라우저에서 클립보드 파일 데이터를 읽을 수 없습니다." : undefined,
  );
}
export async function readClipboard(plainOnly = false): Promise<ClipboardRead> {
  if (!navigator.clipboard?.read)
    throw Error("이 브라우저는 클립보드 읽기를 지원하지 않습니다.");
  await permission("clipboard-read");
  const items = await bounded(navigator.clipboard.read());
  if (items.length !== 1) throw Error("클립보드 항목은 하나만 지원합니다.");
  const item = items[0];
  const read = async (type: string) => {
    if (!item.types.includes(type)) return "";
    const blob = await bounded(item.getType(type));
    if (blob.size > MAX_CLIPBOARD_BYTES * 2)
      throw Error("클립보드 크기 제한을 초과했습니다.");
    return blob.text();
  };
  if (plainOnly) {
    const text = await read("text/plain") || await read("text/markdown") || await read("web text/markdown");
    if (!text) throw Error("클립보드에 붙일 일반 텍스트가 없습니다.");
    return {text,html:""};
  }
  if (item.types.includes(CLIPBOARD_MIME)) {
    const structured = await read(CLIPBOARD_MIME);
    // An optional plain flavor must not change the established rich import.
    const plainAlternative = await read("text/plain").catch(() => "");
    return { text: "", html: "", structured, plainAlternative };
  }
  const html = await read("text/html"), text = await read("text/plain");
  return choosePasteFormat(
    html,
    text,
    async () => {
      const raster = ["image/png", "image/jpeg"].find(type => item.types.includes(type));
      return raster ? [await bounded(item.getType(raster))] : [];
    },
    async () => await read("text/markdown") || await read("web text/markdown"),
    item.types.some(type => type.startsWith("image/"))
      ? "브라우저가 제공한 그림 형식을 지원하지 않습니다. PNG/JPEG 데이터가 필요합니다."
      : undefined,
  );
}
