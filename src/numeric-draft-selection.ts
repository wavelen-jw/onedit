/** Select a numeric draft after the native single click places the caret. */
export function selectNumericDraftOnClick(input: HTMLInputElement, signal?: AbortSignal): void {
  input.addEventListener("click", event => {
    if (event.detail !== 1 || event.button !== 0 || event.altKey || event.ctrlKey ||
        event.metaKey || event.shiftKey || input.disabled || input.readOnly) return;
    input.select();
  }, { signal });
}
