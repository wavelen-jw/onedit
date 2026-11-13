import { fontSupplyRevision } from "./font-provider.js";
import type { FileLifecycle } from "./file-lifecycle.js";
import type { FormatKind } from "./formatting.js";

type Availability = { enabled: boolean; reason: string | null };
// Metadata projection only. Document content, path identity and History stay
// owned by Core/Interaction; downloaded bytes alone never imply saved state.
export function lifecycleCommandState(files: FileLifecycle, state = files.state()) {
  const pending = state.pending;
  const reason = !files.ui.standalone
    ? "HOST_OWNED"
    : files.busy
      ? "BUSY"
      : null;
  const readyReason =
    reason ?? (state.transition ? "AWAITING_TRANSITION_SAVE" : null);
  const ready: Availability = {
    enabled: readyReason === null,
    reason: readyReason,
  };
  const confirmation: Availability = reason
    ? { enabled: false, reason }
    : pending?.documentId === files.adapter.documentId
      ? { enabled: true, reason: null }
      : { enabled: false, reason: "NO_CURRENT_DOWNLOAD" };
  return {
    new: { ...ready },
    open: { ...ready },
    close: { ...ready },
    save: { ...ready },
    "save-as": { ...ready },
    "confirm-download": { ...confirmation },
    "cancel-download": { ...confirmation },
    "save-hwp": { enabled: false, reason: "NOT_CONNECTED" },
    "export-pdf": { enabled: false, reason: "NOT_SUPPORTED" },
    recover: { enabled: false, reason: "NOT_SUPPORTED" },
  } satisfies Record<string, Availability>;
}

export function readEditorState(files: FileLifecycle) {
  const { adapter, editor } = files;
  let selection = null,
    pageIndex: number | null = null,
    selectionError: string | null = null;
  try {
    // Reuse validation and Core path remapping. Never guess stale cell indices.
    selection = editor.capture().selection;
    pageIndex = adapter.rect(selection.focus).pageIndex;
  } catch (error) {
    selection = null;
    pageIndex = null;
    selectionError = String(error);
  }
  const request = files.state().request;
  const historyReason = files.busy
    ? "BUSY"
    : adapter.scope !== "edit" || adapter.documentLocked
      ? "READ_ONLY"
      : null;
  const history = (count: number): Availability => ({
    enabled: !historyReason && count > 0,
    reason: historyReason ?? (count ? null : "EMPTY_HISTORY"),
  });
  const format = (kind: FormatKind): Availability => {
    if (historyReason) return { enabled: false, reason: historyReason };
    if (!selection) return { enabled: false, reason: "INVALID_SELECTION" };
    try {
      for (const target of editor.targets(selection))
        adapter.assertEditable(target.p);
      // Existing getter rejects object formatting and unsupported cell paths.
      editor.formatState(kind, selection);
      return { enabled: true, reason: null };
    } catch {
      return { enabled: false, reason: "UNAVAILABLE_SELECTION" };
    }
  };
  return {
    documentId: adapter.documentId,
    revision: adapter.revision,
    savedRevision: adapter.savedRevision,
    modified: files.dirty,
    selection: {
      valid: selection !== null,
      value: selection,
      pageIndex,
      error: selectionError,
    },
    storage: {
      busy: files.busy,
      state: files.busy ? "in-progress" : (request?.status ?? "idle"),
      requestId: request?.requestId ?? null,
      exportedRevision: request?.revision ?? null,
      filename: files.filename,
      notice: files.notice,
    },
    commands: {
      ...lifecycleCommandState(files),
      undo: history(editor.history.undoStack.length),
      redo: history(editor.history.redoStack.length),
      character: format("char"),
      paragraph: format("paragraph"),
      "cell-format": format("cell"),
    },
  };
}

type Domain = "document" | "selection" | "format" | "history" | "historyTravel" | "storage" | "admission";
type Storage = ReturnType<FileLifecycle["state"]>;
type Stamps = {
  source: FileLifecycle;
  native: FileLifecycle["adapter"]["doc"];
  id: string;
  revision: number;
  selection: string;
  format: string;
  history: string;
  historyTravel: number;
  storage: string;
  admission: string;
};
const stamps = new WeakMap<Document, Stamps>();
const notifications = new WeakMap<Event, ReadonlySet<Domain>>();
// Only the exact synchronous committed event can suppress an inert writer.
// No paragraph values, admission result or native cache is carried.
const dormantTableToolsEvents = new WeakMap<Event,()=>boolean>();
export function committedDormantTableTools(event:Event|undefined) {
  return event&&dormantTableToolsEvents.get(event);
}
export function editorChanged(event: Event | undefined, ...domains: Domain[]) {
  const changed = event && notifications.get(event);
  // Manual invalidation and the legacy host event have no domain metadata.
  return !changed || domains.some(domain => changed.has(domain));
}
export function editorHistoryTravelled(event: Event | undefined) {
  return !!event && notifications.get(event)?.has("historyTravel") === true;
}

/** These equality inputs never acquire native selection, layout or formats. */
function editorStamps(files: FileLifecycle, document: Document, state: Storage): Stamps {
  const {adapter, editor} = files;
  return {
    source: files, native: adapter.doc, id: adapter.documentId, revision: adapter.revision,
    selection: JSON.stringify([editor.currentSelectionGeneration, editor.selection]),
    format: JSON.stringify([editor.typing, fontSupplyRevision(), document.defaultView?.devicePixelRatio]),
    history: JSON.stringify([editor.history.undoStack.length, editor.history.redoStack.length]),
    historyTravel: editor.history.travelGeneration,
    storage: JSON.stringify([state, adapter.savedRevision, state.pending?.revision === adapter.revision]),
    admission: JSON.stringify([adapter.scope, adapter.documentLocked, adapter.viewerOnlyReason,
      adapter.transientEdit, state.busy]),
  };
}
function sameEditorStamps(a: Stamps, b: Stamps) {
  return (Object.keys(a) as (keyof Stamps)[]).every(key => a[key] === b[key]);
}

/** Passive invalidation, not a store of formats, geometry or command rights. */
export function publishEditorChanges(files: FileLifecycle, document: Document,
  projectStorage: (state: Storage) => void, dormantTableTools?:()=>boolean) {
  const state = files.state(), current = editorStamps(files, document, state);
  const old = stamps.get(document);
  const replaced = !old || old.source !== files || old.native !== current.native || old.id !== current.id;
  const domains = new Set<Domain>();
  if (replaced || old.revision !== current.revision) domains.add("document");
  if (!replaced && old.historyTravel !== current.historyTravel) domains.add("historyTravel");
  for (const domain of ["selection", "format", "history", "storage", "admission"] as const)
    if (replaced || old[domain] !== current[domain]) domains.add(domain);
  if (domains.has("document") || domains.has("selection") || domains.has("admission")) domains.add("format");
  if (!domains.size) return;
  stamps.set(document, current);
  if (domains.has("storage")) projectStorage(state);

  const Event = document.defaultView?.CustomEvent;
  if (!Event) return;
  // Keep the existing event name for the Host bridge, which reads its own
  // state. A legacy synchronous detail read can still demand the full snapshot;
  // normal integrated consumers use only the domains. Never read a later
  // document when an old event is retained by a caller.
  const event = new Event("rhwp:editor-state");
  notifications.set(event, domains);
  let legacy: ReturnType<typeof readEditorState> | undefined;
  const stillCurrent = () => stamps.get(document) === current &&
    sameEditorStamps(current, editorStamps(files, document, files.state()));
  let readLegacy: (() => ReturnType<typeof readEditorState> | null) | undefined = () => {
    if (!stillCurrent()) return null;
    const detail = files.editor.withViewQueries(() => readEditorState(files));
    return stillCurrent() ? detail : null;
  };
  Object.defineProperty(event, "detail", {
    get: () => {
      if (legacy !== undefined) return legacy;
      const state = readLegacy?.();
      if (state == null) return null;
      legacy = state;
      return state;
    },
  });
  delete document.documentElement.dataset.rhwpEditorState;
  if(dormantTableTools&&domains.has("document")&&dormantTableTools())
    dormantTableToolsEvents.set(event,dormantTableTools);
  try { document.dispatchEvent(event); }
  finally { if(dormantTableTools)dormantTableToolsEvents.delete(event); readLegacy = undefined; }
}

const published = new WeakMap<Document, string>();
export function syncEditorState(files: FileLifecycle, document: Document) {
  return files.editor.withViewQueries(() => publishEditorState(files, document));
}
function publishEditorState(files: FileLifecycle, document: Document) {
  const state = readEditorState(files);
  for (const id of [
    "undo",
    "redo",
    "character",
    "paragraph",
    "cell-format",
  ] as const) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (!button) continue;
    // Integrated toolbar admission belongs to syncCommandToolbar/menu sync.
    // Do not overwrite its modal/composition/clipboard verdict with metadata
    // which intentionally only describes document/selection capabilities.
    if (document.getElementById("integration-menus")) continue;
    const command = state.commands[id];
    button.disabled = !command.enabled;
    button.setAttribute("aria-disabled", String(!command.enabled));
    if (command.reason) button.dataset.disabledReason = command.reason;
    else delete button.dataset.disabledReason;
  }
  const encoded = JSON.stringify(state);
  // Attribute writes are outside the child-list observer: no feedback loop.
  if (published.get(document) !== encoded) {
    published.set(document, encoded);
    document.documentElement.dataset.rhwpEditorState = encoded;
    const Event = document.defaultView?.CustomEvent;
    if (Event)
      document.dispatchEvent(
        new Event("rhwp:editor-state", { detail: structuredClone(state) }),
      );
  }
  return state;
}
