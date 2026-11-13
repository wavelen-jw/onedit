import { CLIPBOARD_MIME } from "./clipboard.js";
import { pasteFiles } from "./clipboard-image.js";
import type { NativePastePayload } from "./clipboard-transport.js";

type ClipboardAction = (kind: "copy" | "cut" | "paste" | "paste-text", native?: NativePastePayload) => Promise<void>;

// Registered once at the existing UI bootstrap position for the document lifetime.
export function mountNativeClipboardInput(input: HTMLTextAreaElement, clipboardAction: ClipboardAction) {
  input.addEventListener("rhwp:paste-text",()=>{void clipboardAction("paste-text");});
  // Native context-menu actions share the same semantic route. preventDefault also
  // prevents browser textarea edits from racing an asynchronous Core transaction.
  for (const kind of ["copy", "cut", "paste"] as const)
    input.addEventListener(kind, (e) => {
      e.preventDefault();
      const data = kind === "paste" ? (e as ClipboardEvent).clipboardData : null;
      const images = pasteFiles(data);
      const html = data?.getData("text/html") ?? "";
      const hasFiles = !!data && (data.types.includes("Files") || Array.from(data.items).some(i=>i.kind === "file"));
      // Snapshot the native event payload while it exists. A menu-generated paste
      // has no DataTransfer and retains the explicit Clipboard API path.
      const native = data ? {files:hasFiles&&!html.includes("data-rhwp-next-clipboard")?images:[],advertisedFiles:hasFiles,html,text:data.getData("text/plain"),structured:data.getData(CLIPBOARD_MIME)||undefined} : undefined;
      void clipboardAction(kind, native);
    });
}
