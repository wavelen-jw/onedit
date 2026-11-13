import {withTypingFormatPresentation} from './typing-format-presentation.js';
import { LiveComposition } from "./live-composition.js";
import type { Interaction } from "./interaction.js";
import type { FileLifecycle } from "./file-lifecycle.js";
import type { compositionCommitKey } from "./composition-commit-key.js";
import { nativeTextDelta, retainNativeText } from './native-text-delta.js';
import { runHistory } from './command-state-integration.js';
import type { Position, Selection } from './model.js';

type CompositionInputContext = {
  input: HTMLTextAreaElement; document: Document; editor: Interaction; files: FileLifecycle;
  compositionKeys: ReturnType<typeof compositionCommitKey>;
  composing: boolean; composition: LiveComposition | undefined; readonly clipboardBusy: boolean;
  $: (id: string) => HTMLElement; cancelComposition: () => void; paint: () => void;
  render: (reusePages?: boolean) => void; finishCompositionPages: () => void;
  noteCommit?: () => void;
  safe: (action: () => void, visibleBodyEdit?: boolean) => void;
};

// UI owns the shared transaction flags; accessors read/write its current values.
export function mountCompositionInput(context: CompositionInputContext) {
  const {input, document, editor, files, compositionKeys, $, cancelComposition, paint, render, finishCompositionPages, safe} = context;
  let committedTail: string | undefined;
  let native: { value: string; start: Position; expected: string } | undefined;
  const identity = () => JSON.stringify([editor.adapter.documentId, editor.adapter.revision, editor.selection]);
  const resetNative = () => { native = undefined; committedTail = undefined; if (!context.composing) input.value = ''; };
  const rememberNative = () => {
    native = undefined;
    const value = input.value, s = editor.selection, a = editor.adapter;
    if (!retainNativeText(value) || s.kind !== 'caret') return;
    const end = a.textOffset(s.focus), from = end - [...value].length;
    if (from < 0 || [...a.text(s.focus)].slice(from, end).join('') !== value) return;
    const start = {...s.focus, offset: a.logical(s.focus, from)};
    a.validate(start); native = { value, start, expected: identity() };
  };
  let typingStart: {target: ReturnType<Interaction['capture']>; count:number} | undefined;
  // An explicit navigation/edit boundary ends the native input run even if
  // the user later returns to the identical caret. IME letters are not breaks.
  document.addEventListener('pointerdown', () => editor.history.endTypingRun(), true);
  input.addEventListener('blur', () => { editor.history.endTypingRun(); if (!context.composing) resetNative(); });
  document.addEventListener('pointerdown', () => { if (!context.composing) resetNative(); }, true);
  document.defaultView?.addEventListener('blur', () => editor.history.endTypingRun());
  input.addEventListener('keydown', e => {
    const ime = e.isComposing || e.keyCode === 229 || e.key === 'Process' || context.composing;
    if (e.key === 'Backspace' || e.key === 'Delete' || e.code === 'Backspace' || e.code === 'Delete' ||
        (!ime && (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1 && e.key !== 'Shift')))
      editor.history.endTypingRun();
    // Navigation/commands own their existing key route. Retire only committed
    // native context; never rewrite the active platform preedit buffer.
    if (!ime && (e.ctrlKey || e.metaKey || e.altKey ||
        ['Backspace','Delete','Enter','Escape','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))) resetNative();
  }, true);
  input.addEventListener('beforeinput', e => {
    if (context.composing || e.isComposing || e.inputType.toLowerCase().includes('composition')) return;
    if (files.busy || context.clipboardBusy || document.querySelector('dialog[open]')) { if (e.cancelable) e.preventDefault(); return; }
    if (native && native.expected !== identity()) resetNative();
    const backward = e.inputType === 'deleteContentBackward', forward = e.inputType === 'deleteContentForward';
    const boundaryDelete = backward && input.selectionStart === 0 && input.selectionEnd === 0 ||
      forward && input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    const line = e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak';
    const history = e.inputType === 'historyUndo' || e.inputType === 'historyRedo';
    if ((!boundaryDelete || !backward && !forward) && !line && !history) return;
    if (!e.cancelable) return; // Do not run a Command beside an unpreventable native edit.
    e.preventDefault(); resetNative();
    safe(() => {
      editor.history.endTypingRun();
      if (history) runHistory(editor, e.inputType === 'historyRedo', false);
      else editor.execute(line ? {type:'break'} : {type:'delete', backward});
    }, true);
  });
  // Moving from body IME to a toolbar/menu action should use the browser's own
  // composition commit before that action's existing admission/target capture.
  // Do not fake compositionend, discard the transaction, or replay a stale click.
  document.addEventListener("pointerdown", event => {
    if (!event.isTrusted || event.button !== 0 || !context.composing || !context.composition ||
        !(event.target instanceof Element) ||
        !event.target.closest("button,summary,input,select,label,a") ||
        !event.target.closest("body > header,#main-menu,#toolbar,#format-bar,#page-navigation")) return;
    input.blur(); // Native compositionend owns commit/History; pending guards remain until it arrives.
  }, true);
  document.addEventListener("click", event => {
    if (!context.composing || !(event.target instanceof Element)) return;
    const button = event.target.closest("button,input,select,label,a");
    if (!button || !button.closest("body > header,#main-menu,#toolbar,#format-bar,#page-navigation") ||
        button.closest("[data-ui-read]")) return;
    input.blur();
    if (context.composing) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  input.addEventListener("compositionstart", () => {
    editor.resetBlockSequence();
    committedTail = undefined;
    try {
      cancelComposition();
      compositionKeys.start();
      if (files.busy || context.clipboardBusy || document.querySelector("dialog[open]"))
        throw Error("문서 작업·대화상자를 마친 뒤 입력하세요.");
      typingStart = {target:editor.capture(),count:editor.history.undoStack.length};
      context.composition = new LiveComposition(editor);
      context.composing = true;
      $("error").hidden = true;
    } catch (error) {
      context.composing = false;
      compositionKeys.cancel();
      $("error").textContent = String(error); $("error").hidden = false;
    }
    paint();
  });
  input.addEventListener("compositionupdate", (e) => withTypingFormatPresentation(editor, () => {
    if (!context.composition) return;
    try {
      if (context.composition.update(e.data)) render(e.data.length > 0);
      if (e.data) input.dataset.imePreview = "true";
      else delete input.dataset.imePreview;
    } catch (error) {
      cancelComposition();
      context.composing = false;
      render();
      $("error").textContent = String(error); $("error").hidden = false;
    }
  }, typingStart?.target.selection.kind === 'caret' && !!e.data && !/[\r\n]/.test(e.data)));
  input.addEventListener("compositionend", (e) => withTypingFormatPresentation(editor, () => {
    committedTail = e.data;
    try {
      if (context.composition) {
        const changed = context.composition.commit(e.data);
        context.composition = undefined;
        context.composing = false;
        if (e.data && typingStart) editor.history.recordTyping(typingStart.target,typingStart.count);
        typingStart = undefined;
        delete input.dataset.imePreview;
        if (changed) context.noteCommit?.();
        // The last update already painted the committed document. Keep that DOM
        // and update History/dirty/panels; only a different final string needs SVG.
        files.ui.change(changed);
        finishCompositionPages();
        if (e.data) compositionKeys.commit();
        else compositionKeys.cancel();
      }
    } catch (error) {
      cancelComposition();
      context.composing = false;
      render();
      $("error").textContent = String(error); $("error").hidden = false;
    } finally {
      context.composing = false;
      // WebKit may deliver its final native input AFTER compositionend. Keep
      // the same host/value/selection; an exact composition tail is not a new
      // insertion. No microtask clears a still-owned platform replacement range.
      if (e.data) rememberNative(); else resetNative();
      paint();
    }
  }, typingStart?.target.selection.kind === 'caret' && !!e.data && !/[\r\n]/.test(e.data)));
  input.addEventListener("input", (e) => withTypingFormatPresentation(editor, () => {
    const ev = e as InputEvent;
    if (context.composing || ev.isComposing) {
      // Some keyboards expose the current preedit only on input, rather than a
      // useful compositionupdate. Existing transaction/owner guards still own it.
      if (context.composition && ev.data !== null) try {
        if (context.composition.update(ev.data)) render(ev.data.length > 0);
      } catch (error) {
        cancelComposition(); context.composing = false; resetNative(); render();
        $('error').textContent = String(error); $('error').hidden = false;
      }
      return;
    }
    if (committedTail !== undefined && ev.inputType.toLowerCase().includes('composition') && ev.data === committedTail) {
      committedTail = undefined; rememberNative(); return;
    }
    committedTail = undefined;
    const old = native;
    if (old && old.expected !== identity()) { resetNative(); $('error').textContent = '입력 대상이 변경되었습니다. 위치를 선택한 뒤 다시 입력하세요.'; $('error').hidden = false; return; }
    const value = input.value;
    // Native replacements (including Korean final-consonant changes) replace
    // the exact mapped scalar range. Never concatenate or normalize jamo.
    if (old && value !== old.value) {
      let applied = false;
      safe(() => {
        const a = editor.adapter, delta = nativeTextDelta(old.value, value), start = a.textOffset(old.start);
        if ([...a.text(old.start)].slice(start, start + [...old.value].length).join('') !== old.value)
          throw Error('입력 원문 범위가 변경되었습니다.');
        const anchor = {...old.start, offset:a.logical(old.start, start + delta.from)};
        const focus = {...old.start, offset:a.logical(old.start, start + delta.to)};
        const selection: Selection = {kind:'text',anchor,focus};
        const before = editor.capture(), count = editor.history.undoStack.length;
        editor.execute({type:'insert',text:delta.text}, {...before,selection,paths:a.captureSelection(selection)});
        if (delta.from === [...old.value].length && delta.to === delta.from && !/[\r\n]/u.test(delta.text)) editor.history.recordTyping(before,count);
        applied = true;
      }, true);
      // A middle replacement retains its whole native buffer, not just the
      // suffix after the resulting caret. Bind it to this exact new revision.
      native = applied && retainNativeText(value)
        ? {value,start:old.start,expected:identity()} : undefined;
      if (!native) input.value = '';
      return;
    }
    const text = old ? '' : ev.data ?? value;
    if (text) safe(() => {
        const before = editor.capture(), count = editor.history.undoStack.length;
        editor.execute({ type: "insert", text });
        if (!/[\r\n]/.test(text)) editor.history.recordTyping(before,count);
        else editor.history.endTypingRun();
      }, true);
    rememberNative();
    if (!native) input.value = '';
  }, ((e as InputEvent).inputType === 'insertText' || (e as InputEvent).isComposing) &&
    !/[\r\n]/.test((e as InputEvent).data ?? '') &&
    ((e as InputEvent).isComposing ? typingStart?.target.selection.kind === 'caret' :
      !native || input.value === native.value + ((e as InputEvent).data ?? ''))));
}
