export function editorFeedbackText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^(?:Error: |NOT_SUPPORTED[: ·]+)+/, "") || "현재 요청을 처리할 수 없습니다.";
}
