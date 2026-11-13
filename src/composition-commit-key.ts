// A physical Enter can both finish an IME composition and request a paragraph.
// Wait for that same key's release and a successful commit on the exact owner;
// never prevent the IME default, synthesize composition or use a time window.
export function compositionCommitKey(input: HTMLTextAreaElement, identity: () => string, enter: () => void) {
  let processDown = false, committed: string | undefined, enterDown = false, composing = false;
  const clear = () => { processDown = enterDown = false; committed = undefined; };
  input.addEventListener('keydown', e => {
    const ime = e.key === 'Process' || e.keyCode === 229 || e.isComposing || composing;
    if (ime) {
      processDown = true; committed = undefined;
      enterDown = !e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter') &&
        !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
      return;
    }
    if (e.key === 'Enter' && processDown && committed === identity() &&
        !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.cancelable &&
        input.ownerDocument.activeElement === input) {
      // Some IMEs expose the commit's Enter again after compositionend.
      enterDown = true;e.preventDefault();e.stopImmediatePropagation();return;
    }
    clear();
  }, true);
  input.ownerDocument.defaultView?.addEventListener('keyup', e => {
    if (e.key === 'Process' || e.keyCode === 229 || e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      const apply = enterDown && !composing && committed === identity() && input.ownerDocument.activeElement === input &&
        (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter');
      clear();if (apply) enter();
    }
  }, true);
  input.addEventListener('blur', clear);
  input.ownerDocument.defaultView?.addEventListener('blur', clear);
  input.ownerDocument.addEventListener('pointerdown', clear, true);
  return {
    start() { composing = true; committed = undefined; },
    commit() { composing = false; if (processDown) committed = identity(); },
    cancel() { composing = false; clear(); },
  };
}
