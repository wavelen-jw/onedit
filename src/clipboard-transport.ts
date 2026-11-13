import { clipboardPicture, imageOnly } from "./clipboard-image.js";
import { PasteFormatUnavailable } from "./paste-format-fallback.js";
import {
  CLIPBOARD_MIME,
  MAX_CLIPBOARD_BYTES,
  type ClipboardData,
} from "./clipboard.js";
export type ClipboardRead = ClipboardData & { plainAlternative?: string };
export type NativePastePayload = {files: File[]; advertisedFiles?: boolean; html: string; text: string; structured?: string};

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
export async function readPasteFiles(files: File[], html: string, text: string): Promise<ClipboardData> {
  if (files.length !== 1) throw new PasteFormatUnavailable("그림 파일 한 개만 붙여넣을 수 있습니다.", text);
  validateImageOnly(html, text, files[0].name);
  return {text:"",html:"",image:await bounded(clipboardPicture(files[0],html))};
}
function validateImageOnly(html: string, text: string, fileName?: string) {
  try { imageOnly(html, text, fileName); }
  catch (e) { throw new PasteFormatUnavailable(e instanceof Error ? e.message : String(e), text); }
}
// No second clipboard read, permission request, URL fetch or source substitution.
// These strings/files were synchronously supplied by the browser paste event.
export async function readNativePaste(data:NativePastePayload):Promise<ClipboardData>{
  for(const value of [data.html,data.text,data.structured??""])
    if(new TextEncoder().encode(value).byteLength>MAX_CLIPBOARD_BYTES*2)throw Error("클립보드 크기 제한을 초과했습니다.");
  if(data.structured)return{text:data.text,html:data.html,structured:data.structured};
  if(data.files.length)return readPasteFiles(data.files,data.html,data.text);
  if(data.advertisedFiles && !data.html.includes("data-rhwp-next-clipboard"))
    throw new PasteFormatUnavailable("브라우저에서 클립보드 파일 데이터를 읽을 수 없습니다.",data.text);
  if(!data.html&&!data.text)throw new PasteFormatUnavailable("붙일 수 있는 클립보드 내용이 없습니다.");
  return{text:data.text,html:data.html};
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
    const text = await read("text/plain");
    if (!text) throw Error("클립보드에 붙일 일반 텍스트가 없습니다.");
    return {text,html:""};
  }
  if (item.types.includes(CLIPBOARD_MIME)) {
    const structured = await read(CLIPBOARD_MIME);
    // An optional plain flavor must not change the established rich import.
    const plainAlternative = await read("text/plain").catch(() => "");
    return { text: "", html: "", structured, plainAlternative };
  }
  const html = await read("text/html"),
    text = await read("text/plain");
  // Preserve existing immutable RHWP fragments before alternate raster data.
  if (html.includes("data-rhwp-next-clipboard")) return {text,html};
  const imageType = ["image/png", "image/jpeg"].find(type => item.types.includes(type));
  if (imageType) {
    validateImageOnly(html,text);
    return {text:"",html:"",image:await bounded(clipboardPicture(await bounded(item.getType(imageType)),html))};
  }
  if (item.types.some(type=>type.startsWith("image/")))
    throw new PasteFormatUnavailable("브라우저가 제공한 그림 형식을 지원하지 않습니다. PNG/JPEG 데이터가 필요합니다.", text);
  if (!html && !text) throw new PasteFormatUnavailable("붙일 수 있는 클립보드 내용이 없습니다.");
  return { text, html };
}
