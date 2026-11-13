/** Keep the native number control, validation and spinner. Select only on
 * a plain single click, so the next digit replaces the displayed value. */
export function selectNumericDraftOnClick(input: HTMLInputElement): void {
  input.addEventListener("click", event => {
    if (event.detail !== 1 || event.button !== 0 || event.altKey || event.ctrlKey ||
        event.metaKey || event.shiftKey || input.disabled || input.readOnly) return;
    input.select();
  });
}
