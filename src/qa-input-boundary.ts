// Local QA only. No keys, document text, control values, clipboard data, paths
// or owner identifiers are retained. Never intercept, replay or repair input.
export function mountQaInputBoundary(
  win: Window & typeof globalThis,
  input: HTMLTextAreaElement,
  state: () => Readonly<{revision: number; selectionGeneration: number; renderGeneration: number;
    composing: boolean; fileBusy: boolean; clipboardBusy: boolean; transientEdit: boolean; selectionKind: string}>,
) {
  const url = new URL(win.location.href);
  if (win.parent !== win || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.searchParams.getAll('oneditQaInputBoundary').join('/') !== '1') return;
  const doc = win.document;
  const kind = (target: EventTarget | null) => {
    if (target === input) return 'editor';
    if (target === doc.body) return 'body';
    if (!(target instanceof win.Element)) return 'other';
    const dialog = target.closest('dialog');
    if (!dialog) return 'other';
    if (dialog.id === 'format') {
      const value = dialog.getAttribute('data-format-kind');
      if (value === 'char' || value === 'paragraph' || value === 'paragraph-basic' || value === 'cell')
        return value;
      return 'format';
    }
    return 'other-dialog';
  };
  type Row = {
    sequence: number; ms: number; event: string; target: string; active: string;
    modal: string | null; focused: boolean; inputConnected: boolean; inputEnabled: boolean;
    selectionCollapsed: boolean; saveNotice: boolean; revision: number; selectionGeneration: number;
    renderGeneration: number; composing: boolean; fileBusy: boolean; clipboardBusy: boolean; transientEdit: boolean; selectionKind: string;
    trusted?: boolean; prevented?: boolean; keyClass?: string; ime?: boolean;
  };
  const limit = 256;
  let rows: Row[] = [], sequence = 0, dropped = 0, epoch = 0;
  const record = (label: string, event?: Event) => {
    if (rows.length === limit) { dropped++; return; }
    const modal = doc.querySelector('dialog[open]');
    const row: Row = {
      sequence: ++sequence, ms: win.performance.now(), event: label,
      target: kind(event?.target ?? null), active: kind(doc.activeElement),
      modal: modal ? kind(modal) : null, focused: doc.hasFocus(),
      inputConnected: input.isConnected, inputEnabled: !input.disabled && !input.readOnly && !input.closest('[inert]'),
      selectionCollapsed: input.selectionStart === input.selectionEnd,
      saveNotice: doc.getElementById('file-notice')?.hidden === false,
      ...state(),
    };
    if (event) {
      row.trusted = event.isTrusted;
      row.prevented = event.defaultPrevented;
      if (event instanceof win.KeyboardEvent) {
        row.ime = event.isComposing || event.keyCode === 229;
        row.keyClass = row.ime ? 'ime' : event.key === 'Enter' ? 'enter' : event.key === 'Escape' ? 'escape' :
          event.key === ' ' ? 'space' : event.key.startsWith('Arrow') ? 'arrow' :
          event.key === 'Backspace' ? 'backspace' : event.key.length === 1 ? 'character' : 'other';
      } else if (event instanceof win.InputEvent) row.ime = event.isComposing;
    }
    rows.push(row);
    return row;
  };
  const modalEvent = new Set(['char', 'paragraph', 'paragraph-basic', 'cell', 'format', 'other-dialog']);
  for (const label of ['focusin', 'focusout', 'submit', 'close', 'cancel', 'keydown', 'keyup',
    'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend']) {
    doc.addEventListener(label, event => {
      // Keydown on another control can itself explain lost editor input.
      // Outside the editor/modals record only key class and coarse ownership.
      if (event.target !== input && label !== 'keydown' && label !== 'keyup' &&
          !modalEvent.has(kind(event.target))) return;
      const row = record(label, event);
      if (row && (label === 'keydown' || label === 'beforeinput')) {
        // Observe the final cancellation state after synchronous dispatch,
        // including preventDefault from later listeners or stopped propagation.
        const snapshot = epoch;
        win.setTimeout(() => { if (snapshot === epoch) row.prevented = event.defaultPrevented; }, 0);
      }
    }, {capture: true, passive: true});
  }
  Object.defineProperty(win, '__oneditQaInputBoundary', {value: (reset = false) => {
    const result = {rows: rows.map(row => ({...row})), dropped};
    if (reset) { rows = []; dropped = 0; sequence = 0; epoch++; }
    return result;
  }});
  return (label: 'native-command-committed' | 'native-composition-committed' | 'screen-published') => { record(label); };
}
