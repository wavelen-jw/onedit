import type {Interaction} from './interaction.js';
import type {OwnerProjection} from './owner-projection.js';
import type {Selection} from './model.js';

/** @internal One format-menu publication, common inputs only. Every metric,
 * direction, readonly/lock rule and actual command retains its own verdict.
 * Same existing256/65536 bounds; never raises the Adapter's raw cache budget. */
export function menuTargetReader(editor:Interaction,owners?:OwnerProjection, read?: (selection:Selection) => ReturnType<Interaction["targets"]>) {
  let key:string|undefined,targets:ReturnType<Interaction['targets']>|undefined;
  return (selection:Selection=editor.selection):ReturnType<Interaction['targets']>=>{
    if (read) return read(selection);
    // Existing caret targets are a constant one-position array, with no native
    // owner/table traversal. Serializing and cloning it costs more preparation
    // than asking the authoritative original reader; ranges/blocks still share.
    if(selection.kind==='caret'||!owners?.isCurrent(editor.adapter)){key=undefined;targets=undefined;return editor.targets(selection);}
    const next=JSON.stringify(selection);
    if(key===next&&targets)return structuredClone(targets);
    const value=editor.targets(selection);
    key=undefined;targets=undefined;
    if(owners.isCurrent(editor.adapter)&&value.length<=256&&JSON.stringify(value).length<=65536){
      key=next;targets=structuredClone(value);
    }
    return value;
  };
}
