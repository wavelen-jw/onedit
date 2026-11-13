// Local, uncommitted values only. Changing units must neither convert a value
// nor erase the draft belonging to a previously visited spacing type.
export function bindSpacingDraft(type: HTMLSelectElement, value: HTMLInputElement) {
  let previous = type.value;
  const drafts = new Map<string, string>();
  const reset = () => {
    previous = type.value;
    drafts.clear();
    drafts.set(previous, value.value);
  };
  reset();
  type.addEventListener("change", () => {
    if (type.value === previous) return;
    drafts.set(previous, value.value); // Preserve raw/invalid/empty text for correction.
    previous = type.value;
    value.value = drafts.get(previous) ?? ""; // A new unit still needs explicit input.
  });
  return { reset };
}
