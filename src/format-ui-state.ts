/** UI-only projection of existing admission states; never changes their lifetime. */
export function formatUIBlockReason(state: {
  fileBusy: boolean; composing: boolean; modal: boolean; clipboardBusy: boolean;
}): string {
  if (state.fileBusy) return "문서를 처리 중입니다. 작업이 끝난 뒤 다시 시도하세요.";
  if (state.composing) return "IME 조합을 마친 후 사용하세요";
  if (state.modal) return "열린 대화상자를 먼저 닫으세요.";
  if (state.clipboardBusy) return "클립보드 작업을 마친 뒤 사용하세요.";
  return "";
}
