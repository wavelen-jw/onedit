import type { NativePastePayload } from "./clipboard-transport.js";

export function hancomFragmentRequested(): boolean {
  return false;
}

export function materializeHancomQaClipboard(_data: DataTransfer, _html: string, _trusted: boolean): boolean {
  return false;
}

export async function readHancomQaHwpx(_input?: NativePastePayload): Promise<{
  bytes: Uint8Array<ArrayBuffer>; sourceFormat: "hwp" | "hwpx";
} | undefined> {
  return undefined;
}
