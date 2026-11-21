export function editorFeedbackText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/\bUNSUPPORTED_FILE_FORMAT\b/.test(message))
    return "파일을 열 수 없습니다. 지원하지 않는 형식이거나 파일이 손상됐을 수 있습니다. 원본 파일을 확인해 주세요.";
  // Only remove exception wrappers at the start of a user-facing reason.
  return message.trim().replace(/^(?:(?:Error|TypeError|RangeError|SyntaxError|DOMException|UnsupportedTableOperation|UnsupportedTableOwner):\s*|NOT_SUPPORTED[: ·]+)+/, "").trim() ||
    "현재 요청을 처리할 수 없습니다.";
}
