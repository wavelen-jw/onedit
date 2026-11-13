/** Focus handoff only. Each popup still owns validation, cancellation and its command. */
const blocked = new WeakMap<Document, () => boolean>();
const captureReturnOwner = new WeakMap<Document, () => (() => boolean)>();
const pendingReturns = new WeakMap<Document, {
  input: HTMLTextAreaElement;
  origin: Element;
  stillCurrent: () => boolean;
}>();
const cancelPolicy = new WeakMap<HTMLDialogElement, boolean>();
const composing = new WeakSet<HTMLDialogElement>();
const openers = new WeakMap<HTMLDialogElement, Element | null>();
const utilityReturns = new WeakMap<HTMLDialogElement, {launcher: HTMLElement | null; menu: HTMLElement | null}>();
type DismissKey = Readonly<{dialog: HTMLDialogElement; key: string; code: string; location: number}>;
const keyboardHandoffs = new WeakMap<Document, {pending?: DismissKey; dismissed?: DismissKey}>();
const matchesKey = (key: DismissKey | undefined, event: KeyboardEvent) =>
  key?.key === event.key && key.code === event.code && key.location === event.location;
const keyboardForms = new WeakSet<HTMLFormElement>();

/** A single-line draft field's Enter submits the modal, not its native text editor. */
export function bindEditorDialogFormSubmit(form: HTMLFormElement | null) {
  if (!form || keyboardForms.has(form)) return;
  const dialog = form.closest('dialog'), win = form.ownerDocument.defaultView;
  if (!dialog || !win) return;
  keyboardForms.add(form);
  form.addEventListener('keydown', event => {
    const field = event.target;
    if (!dialog.open || !event.isTrusted || !event.cancelable || event.defaultPrevented ||
        event.key !== 'Enter' || event.repeat || event.isComposing || event.keyCode === 229 ||
        event.altKey || event.ctrlKey || event.shiftKey || event.metaKey || composing.has(dialog) ||
        !(field instanceof win.HTMLInputElement) || field.form !== form || form.ownerDocument.activeElement !== field ||
        !['text', 'number', 'search'].includes(field.type) || field.readOnly || field.disabled) return;
    // Use the same submitter, native constraint validation and existing form
    // handler. Consume the text control default before a synchronous close can
    // change the input owner. Selects, IME and button activation remain native.
    const submitter = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submitter || submitter.form !== form || submitter.matches(':disabled')) return;
    event.preventDefault();
    event.stopPropagation();
    form.requestSubmit(submitter);
  });
}

export function bindEditorPopupFocus(doc: Document, unavailable: () => boolean,
    captureOwner?: () => (() => boolean)) {
  blocked.set(doc, unavailable);
  if (captureOwner) captureReturnOwner.set(doc, captureOwner);
  const win = doc.defaultView;
  if (!win || keyboardHandoffs.has(doc)) return;
  const keys: {pending?: DismissKey; dismissed?: DismissKey} = {};
  keyboardHandoffs.set(doc, keys);
  doc.addEventListener('keydown', event => {
    if (!event.isTrusted) return;
    pendingReturns.delete(doc);
    if (event.isComposing || event.keyCode === 229) {
      keys.pending = undefined;
      return;
    }
    if (event.repeat) {
      const input = doc.getElementById('input');
      if (matchesKey(keys.dismissed, event) && event.target === input &&
          doc.activeElement === input && !doc.querySelector('dialog[open]')) {
        // This physical press already dismissed the dialog. A held repeat
        // must not become a new paragraph or editor Escape after handoff.
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (matchesKey(keys.dismissed, event)) keys.dismissed = undefined;
    keys.pending = undefined;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    const dialog = event.target instanceof win.Element ? event.target.closest('dialog[open]') : null;
    if (dialog instanceof win.HTMLDialogElement && cancelPolicy.has(dialog) && !composing.has(dialog))
      keys.pending = {dialog, key: event.key, code: event.code, location: event.location};
  }, true);
  win.addEventListener('keyup', event => {
    if (!event.isTrusted) return;
    if (matchesKey(keys.pending, event)) keys.pending = undefined;
    if (matchesKey(keys.dismissed, event)) keys.dismissed = undefined;
  }, true);
  doc.addEventListener('pointerdown', event => {
    if (event.isTrusted) {
      keys.pending = undefined;
      pendingReturns.delete(doc);
    }
  }, true);
  doc.addEventListener('focusin', event => {
    const pending = pendingReturns.get(doc);
    if (pending && event.target !== pending.origin) pendingReturns.delete(doc);
  }, true);
  win.addEventListener('focus', event => {
    if (!event.isTrusted || event.target !== win) return;
    const pending = pendingReturns.get(doc);
    pendingReturns.delete(doc);
    if (pending && !doc.hidden && doc.activeElement === pending.origin &&
        editorInput(doc) === pending.input && pending.stillCurrent()) focusEditorAfterPopup(doc);
  });
  win.addEventListener('pagehide', () => pendingReturns.delete(doc));
  const release = () => { keys.pending = keys.dismissed = undefined; };
  win.addEventListener('blur', release);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) release(); });
}

/** Keep the current dialog control focused until a real mouse dismissal. */
export function keepDialogFieldFocus(dialog: HTMLDialogElement, button: HTMLButtonElement, allowed: () => boolean) {
  const life = new AbortController();
  const options = {signal: life.signal};
  let pressed = false;
  button.addEventListener('pointerdown', event => {
    pressed = event.isTrusted && event.isPrimary && event.pointerType === 'mouse' && event.button === 0;
  }, options);
  button.addEventListener('pointercancel', () => { pressed = false; }, options);
  button.addEventListener('mousedown', event => {
    const mouse = pressed;
    pressed = false;
    const active = dialog.ownerDocument.activeElement;
    if (mouse && event.isTrusted && event.button === 0 && event.cancelable && dialog.open &&
        !button.disabled && active !== button && dialog.contains(active) &&
        !composing.has(dialog) && allowed()) event.preventDefault();
  }, options);
  return () => life.abort();
}

function editorInput(doc: Document) {
  const win = doc.defaultView;
  const input = doc.getElementById('input');
  if (win && input instanceof win.HTMLTextAreaElement && input.isConnected && !input.disabled &&
      !input.closest('[inert]')) return input;
}

export function focusEditorAfterPopup(doc: Document) {
  if (!doc.hasFocus() || blocked.get(doc)?.() || doc.querySelector('dialog[open]')) return;
  const input = editorInput(doc);
  if (input && doc.activeElement !== input)
    input.focus({preventScroll: true});
}

export function closeEditorDialog(dialog: HTMLDialogElement, returnToEditor = true, value?: string) {
  if (!dialog.open) return;
  const doc = dialog.ownerDocument;
  pendingReturns.delete(doc);
  const active = doc.activeElement;
  const input = doc.getElementById('input');
  const opener = openers.get(dialog);
  const utility = utilityReturns.get(dialog);
  utilityReturns.delete(dialog);
  const wasOwned = active === doc.body || dialog.contains(active) || active === input;
  const wasComposing = composing.has(dialog);
  if (value === undefined) dialog.close(); else dialog.close(value);
  const after = doc.activeElement;
  const keys = keyboardHandoffs.get(doc);
  if (keys?.pending?.dialog === dialog) {
    if (!utility && returnToEditor && wasOwned && !wasComposing) keys.dismissed = keys.pending;
    keys.pending = undefined;
  }
  // This is the synchronous handoff. Queued close listeners may clean up
  // their draft, but must not take focus from a later user action.
  // Native close can restore the opener, but a new focus owner established
  // during that transition is not part of this dialog's handoff.
  if (!wasOwned || wasComposing || !after ||
      !(after === doc.body || after === opener || after === input || dialog.contains(after))) return;
  if (utility) {
    if (!doc.hasFocus() || doc.querySelector('dialog[open]')) return;
    for (const target of [utility.launcher, utility.menu]) {
      if (target?.isConnected && !target.closest('[inert], [hidden], [aria-hidden="true"]') &&
          !target.matches(':disabled, [aria-disabled="true"]') && target.getClientRects().length &&
          doc.defaultView?.getComputedStyle(target).visibility === 'visible') {
        if (doc.activeElement !== target) target.focus({preventScroll: true});
        if (doc.activeElement === target) return;
      }
    }
    focusEditorAfterPopup(doc);
    return;
  }
  if (!returnToEditor) return;
  if (doc.hasFocus()) {
    focusEditorAfterPopup(doc);
  } else if (after !== input && (after === doc.body || after === opener) &&
      !blocked.get(doc)?.() && !doc.querySelector('dialog[open]')) {
    // A background close cannot focus the editor. Keep this handoff only
    // until the window returns, and only for the same document and selection.
    const stillCurrent = captureReturnOwner.get(doc)?.();
    const liveInput = editorInput(doc);
    if (stillCurrent && liveInput === input && liveInput)
      pendingReturns.set(doc, {input: liveInput, origin: after, stillCurrent});
  }
}

/** Return utility dialogs to their launcher or to the closed menu's header. */
export function showUtilityDialog(dialog: HTMLDialogElement, launcher: HTMLElement | null) {
  if (!dialog.open) {
    const menu = launcher?.closest('#main-menu > details')?.querySelector<HTMLElement>(':scope > summary') ?? null;
    utilityReturns.set(dialog, {launcher, menu});
  }
  showEditorDialog(dialog, false);
}

/** Return from a document-editing dialog through the editor's non-text viewport. */
export function showDocumentEditingDialog(dialog: HTMLDialogElement) {
  const doc = dialog.ownerDocument;
  const input = editorInput(doc), viewport = doc.getElementById('viewport');
  if (!dialog.open && dialog.isConnected && doc.hasFocus() && input &&
      doc.activeElement === input && !blocked.get(doc)?.() && !doc.querySelector('dialog[open]') &&
      viewport === input.parentElement && viewport?.getAttribute('tabindex') === '-1') {
    // showModal records the focused element. A keyboard launch from #input
    // must not hand the live text host back to native dialog.close(): that can
    // report DOM focus without restoring the browser's text input. Park focus
    // on the owning viewport so the usual explicit close handoff owns entry.
    viewport.focus({preventScroll: true});
  }
  showEditorDialog(dialog);
}

export function showEditorDialog(dialog: HTMLDialogElement, returnOnCancel = true) {
  pendingReturns.delete(dialog.ownerDocument);
  if (!cancelPolicy.has(dialog)) {
    dialog.addEventListener('compositionstart', () => composing.add(dialog), true);
    dialog.addEventListener('compositionend', () => composing.delete(dialog), true);
    // Existing owner cancel listeners are registered first and may veto or
    // perform their own cancellation. Adopt only the remaining native Escape.
    dialog.addEventListener('cancel', event => {
      if (event.defaultPrevented || !dialog.open) return;
      event.preventDefault();
      if (!composing.has(dialog)) closeEditorDialog(dialog, cancelPolicy.get(dialog));
    });
  }
  cancelPolicy.set(dialog, returnOnCancel);
  if (!dialog.open) {
    composing.delete(dialog);
    openers.set(dialog, dialog.ownerDocument.activeElement);
  }
  dialog.showModal();
}
