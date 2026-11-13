import { activeWorkset } from "./active-workset.js";
import { readEditorDisplay } from "./editor-state-coordinator.js";
import {observeSelectorMembership} from './selector-membership.js';
import {normalizeWorkspaceToolTitle} from './workspace-toolbar-layout.js';
import type {FormatKind, FormatState} from './formatting.js';
import type { Interaction } from './interaction.js';

// Presentation policy only: never used for command admission or geometry.
// A ticket comes from an explicit native text/composition publication, not from
// guessing that an arbitrary revision change means unchanged formatting.
const policies = new WeakMap<Interaction, ReturnType<typeof createPolicy>>();
const selector = '#bold,#italic,#underline,[data-script],[data-align],#quick-format,[data-quick-form="quick-format"],#quick-paragraph';
function createPolicy(editor: Interaction, input: HTMLTextAreaElement, environment: () => string, blocked: () => boolean) {
  const document = input.ownerDocument;
  const membership = observeSelectorMembership(document, selector, ['id','data-script','data-align','data-quick-form']);
  let publication: {key: string; value: boolean; active: boolean; scope: string; locked: boolean; ticket: string} | undefined;
  let publicationDepth = 0;
  let formatKey = '', formatDoc: object | undefined;
  const formats = new Map<FormatKind, FormatState>();
  const clearFormats = () => { formats.clear(); formatKey = ''; formatDoc = undefined; };
  const freeze = (value: unknown): void => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  let ready = false, active = false, ticket = '', owner = '', env = '', typing = '', id = '';
  let native: object | undefined;
  let nodes: Element[] = [];
  let domChanged = false, projectedDOM: string[] = [];
  const observer = new MutationObserver(() => { domChanged = true; });
  const positionOwner = () => { const {offset: _offset, ...p} = editor.selection.focus; return JSON.stringify(p); };
  const state = () => JSON.stringify([editor.adapter.documentId,editor.adapter.revision,editor.selection,editor.typing]);
  const invalidate = () => { ready = false; ticket = ''; publication = undefined; clearFormats(); };
  const intact = () => {
    if (observer.takeRecords().length) domChanged = true;
    const current = membership.read();
    const sameNodes = nodes.length > 0 && nodes.length === current.length && nodes.every((n,i) => n.isConnected && current[i] === n);
    if (domChanged && sameNodes) {
      // Existing mirrors may assign an equal attribute or replace equal text.
      // Compare only these small UI roots when notified, never document content.
      if (nodes.some((n,i) => n.outerHTML !== projectedDOM[i])) invalidate();
      domChanged = false;
    }
    return sameNodes;
  };
  const eligible = () => !blocked() && document.activeElement === input && input.isConnected &&
    editor.adapter.scope === 'edit' && !editor.adapter.documentLocked && editor.selection.kind === 'caret' &&
    (editor.selection.focus.kind === 'body' || editor.selection.focus.kind === 'cell');
  const valid = () => eligible() && native === editor.adapter.doc && id === editor.adapter.documentId &&
    owner === positionOwner() && env === environment() && typing === JSON.stringify(editor.typing);
  const authoritativeKeep = () => {
    if (!intact() || !ready || !valid()) return false;
    return active || ticket === state();
  };
  // Read-only synchronous UI publication. Never retained across a callback,
  // await, timer, rAF or native edit. Model/context changes invalidate sharing.
  const publicationKey = state;
  const keep = () => {
    if (!publicationDepth) return authoritativeKeep();
    // Drain synchronously: MutationObserver callbacks have not necessarily run.
    const changed = observer.takeRecords().length > 0;
    if (changed) { domChanged = true; publication = undefined; }
    const key = publicationKey();
    if (publication && publication.key === key && publication.active === active &&
        publication.scope === editor.adapter.scope && publication.locked === editor.adapter.documentLocked &&
        publication.ticket === ticket && ready && native === editor.adapter.doc &&
        input.isConnected && document.activeElement === input && !blocked() &&
        nodes.every(n => n.isConnected)) return publication.value;
    const value = authoritativeKeep();
    publication = {key: publicationKey(), value, active, scope: editor.adapter.scope, locked: editor.adapter.documentLocked, ticket};
    return value;
  };
  const publish = <T>(action: () => T): T => {
    // Reentrant callbacks get their own decision and invalidate the outer one.
    const outer = publicationDepth; publication = undefined; clearFormats(); publicationDepth++;
    try { return action(); }
    finally { publicationDepth = outer; publication = undefined; clearFormats(); }
  };
  const checkpoint = () => {
    publication = undefined;
    observer.disconnect(); observer.takeRecords();
    nodes = Array.from(membership.read());
    // Canonical existing tooltip decoration must precede the recorded display.
    // Otherwise its own MutationObserver changes title/description just after
    // every checkpoint and falsely invalidates every native text event.
    const bar = document.getElementById('format-bar');
    const buttons = new Set<HTMLElement>();
    for (const node of nodes) {
      if (node.matches('button,[data-tool-name]')) buttons.add(node as HTMLElement);
      for (const child of node.querySelectorAll<HTMLElement>('button,[data-tool-name]')) buttons.add(child);
    }
    for (const button of buttons) if (bar?.contains(button)) normalizeWorkspaceToolTitle(button);
    for (const node of nodes) observer.observe(node,{attributes:true,childList:true,characterData:true,subtree:true});
    projectedDOM = nodes.map(n => n.outerHTML); domChanged = false;
    // Pointer selection projects before the existing focus() call. Focus is
    // checked when admitting an input, not while recording its preceding view.
    ready = !blocked() && editor.selection.kind === 'caret'; ticket = ''; // A full projection is not itself a typing ticket.
  };
  const run = <T>(action: () => T, textOnly: boolean): T => {
    publication = undefined;
    const usable = intact() && ready && eligible() && textOnly;
    ticket = '';
    if (!usable) { invalidate(); return action(); }
    native = editor.adapter.doc; id = editor.adapter.documentId; owner = positionOwner();
    env = environment(); typing = JSON.stringify(editor.typing); active = true;
    try { const result = action(); if (ready && valid()) ticket = state(); return result; }
    catch (error) { invalidate(); throw error; }
    finally { active = false; }
  };
  // Intent boundaries invalidate even when the user returns to the same offset.
  document.addEventListener('pointerdown', invalidate, true);
  document.addEventListener('focusin', e => { if(e.target !== input) invalidate(); }, true);
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || (!e.isComposing && e.keyCode !== 229 && e.key.length > 1 && e.key !== 'Shift')) invalidate();
  }, true);
  for (const event of ['rhwp:fonts-updated','rhwp:font-layout','rhwp:shortcut-ui']) document.addEventListener(event,invalidate,true);
  document.defaultView?.addEventListener('blur',invalidate);
  let activeReadFence:(()=>boolean)|undefined;
  const readFormat = (kind: FormatKind): FormatState => {
    const demand=activeWorkset(document), a=editor.adapter;
    const local=()=>demand&&document.fonts.status==="loaded"&&!blocked()
      ? editor.currentCaretDisplayFormat(kind):undefined;
    if (!publicationDepth) return local() ?? editor.formatState(kind);
    const key = state(), doc = a.doc;
    if (key !== formatKey || doc !== formatDoc || (demand&&!activeReadFence?.())) {
      clearFormats(); formatKey = key; formatDoc = doc;activeReadFence=undefined;
    }
    const hit = formats.get(kind);
    if (hit) return hit;
    // Only this synchronous publication; retire on native writes even when
    // public App revision has not yet advanced. No command uses this value.
    const nativeFence=demand?a.tablePreviewFence():undefined;
    const selectionFence=demand?editor.cellApplySelectionWitness():undefined;
    const env=environment(), fontStatus=document.fonts.status;
    const current=()=>!!nativeFence?.()&&!!selectionFence?.()&&a.nativeMutationGeneration()!==undefined&&
      environment()===env&&document.fonts.status===fontStatus&&!blocked();
    const value = local() ?? editor.presentationFormatState(kind);
    if (key === state() && doc === a.doc && key === formatKey && (!demand||current())) {
      freeze(value); formats.set(kind, value);if(demand)activeReadFence=current;
    }
    return value;
  };
  return {keep,checkpoint,run,invalidate,publish,readFormat};
}
export function mountTypingFormatPresentation(editor: Interaction, input: HTMLTextAreaElement,
  environment: () => string, blocked: () => boolean) {
  if (policies.has(editor)) throw Error('Typing presentation already mounted');
  policies.set(editor,createPolicy(editor,input,environment,blocked));
}
export const keepTypingFormatPresentation = (editor: Interaction) => policies.get(editor)?.keep() ?? false;
export const checkpointFormatPresentation = (editor: Interaction) => policies.get(editor)?.checkpoint();
export function withTypingFormatPresentation<T>(editor: Interaction, action: () => T, textOnly = true): T {
  const policy = policies.get(editor);
  return policy ? policy.run(action,textOnly) : action();
}

/** @internal Caller must be a synchronous, read-only UI publication. */
export function withFormatPresentationRead<T>(editor: Interaction, action: () => T): T {
  const policy = policies.get(editor);
  return policy ? policy.publish(action) : action();
}

/** Immutable display payload only. Outside a publication, authoritative read. */
export function readFormatPresentation(editor: Interaction, kind: FormatKind): FormatState {
  const policy = policies.get(editor);
  return policy ? policy.readFormat(kind) :
    editor.clickedTableDisplay() ? editor.presentationFormatState(kind) : editor.formatState(kind);
}

/** Shared display-only read for a visible consumer. No command admission. */
export function readPassiveFormatPresentation(editor: Interaction, kind: FormatKind): FormatState {
  return readEditorDisplay(editor,"quick-values",
    (_owners,retry)=>retry?editor.freshDisplayFormat(kind):readFormatPresentation(editor,kind));
}
