import type { Interaction } from './interaction.js';
import type { OwnerProjection } from './owner-projection.js';
import { formatMenuState } from './integration/a-format-menu.js';
import { editMenuState } from './integration/a-edit-menu.js';

// Read both output maps before DOM writes. Only the edit-menu-only publication
// uses the structural receipt; sharing across demanded formats was rejected.
// existing permission, target resolution, format and History computations run.
export function readMenuAdmission(editor:Interaction, busy:boolean, reason:string,
    includeFormat:boolean, readDisplay:Parameters<typeof formatMenuState>[3],
    owners:OwnerProjection|undefined, enabled:boolean, currentView:()=>string|undefined, nativeEnabled=false) {
  const a=editor.adapter,s=editor.selection;
  const read=(check?: (p:typeof s.focus)=>void, validate?: (p:typeof s.focus)=>void) => ({
    formats: includeFormat ? formatMenuState(editor,busy,reason,readDisplay,owners) : null,
    edits:editMenuState(editor,busy,false,check,undefined,validate),
  });
  if (!enabled || includeFormat || busy || reason || s.kind!=='caret' || s.focus.kind!=='cell' || s.focus.ancestors?.length) return read();
  if (nativeEnabled && !editor.menuCaretReferenceMatches(s)) return read();
  const {history}=editor, generation=editor.currentSelectionGeneration;
  const stamp=JSON.stringify(s), view=currentView();
  if(view===undefined)return read();
  const undo=history.undoStack.at(-1), redo=history.redoStack.at(-1);
  const undoDepth=history.undoStack.length, redoDepth=history.redoStack.length;
  return a.withMenuSelectionContext(s.focus,()=>editor.selection===s &&
    editor.currentSelectionGeneration===generation && JSON.stringify(s)===stamp &&
    editor.history===history && history.undoStack.at(-1)===undo && history.redoStack.at(-1)===redo &&
    history.undoStack.length===undoDepth && history.redoStack.length===redoDepth && currentView()===view,
    read,nativeEnabled);
}
