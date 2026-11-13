// Modal-local input state; never changes the editor's IME or document history.
export function formatInputGuard(form: HTMLElement, view?: {root: HTMLElement; owns: (target: EventTarget | null) => boolean}) {
  const life = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(type: K, action: (event: HTMLElementEventMap[K]) => void, capture = false) => {
    (view?.root ?? form).addEventListener(type, event => {
      if (!view || view.owns(event.target)) action(event);
    }, {capture, signal: life.signal});
  };
  let composing = false,
    settling = false,
    consumed = true,
    generation = 0;
  on("compositionstart", () => {
    composing = true;
  });
  on("compositionend", () => {
    composing = false;
    settling = true;
    const current = generation;
    setTimeout(() => {
      if (generation === current) settling = false;
    }, 0);
  });
  on(
    "keydown",
    (e) => {
      const ime = e.isComposing || e.keyCode === 229 || composing || settling;
      if ((e.key === "Enter" && (ime || e.repeat)) || (e.key === "Escape" && ime)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  // Native dialog cancellation is a separate event from keydown. Object
  // dialogs must not lose their draft when Escape belongs to an active IME.
  // Reuse the same local state/settling boundary as confirmation; never reset
  // the editor IME or alter the captured target/History to keep a modal open.
  form.closest("dialog")?.addEventListener("cancel", (e) => {
    if (composing || settling) e.preventDefault();
  });
  return {
    open() {
      generation++;
      composing = settling = consumed = false;
    },
    close() {
      generation++;
      composing = settling = false;
      consumed = true;
    },
    ready() {
      return !consumed && !composing && !settling;
    },
    consume() {
      consumed = true;
    },
    dispose() { life.abort(); generation++; },
  };
}
export function sameFormatTarget(
  a: { documentId: string; revision: number; selection: unknown },
  b: typeof a,
) {
  return (
    a.documentId === b.documentId &&
    a.revision === b.revision &&
    JSON.stringify(a.selection) === JSON.stringify(b.selection)
  );
}
