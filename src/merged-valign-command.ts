import { isMergedValignCoreDigest } from "./b338-focused-owner-trial.js";
import { cellLayoutHold } from "./cell-layout.js";
import { coreRuntimeIdentity } from "./core-runtime.js";
import { fontSupplyRevision } from "./font-provider.js";
import type { Interaction } from "./interaction.js";
import { cellPath, nested, samePosition, sameTable, type Props } from "./model.js";
import { rootEditorCoreSha256 } from "./root-editor-core-binding.js";

type Align = 0 | 1 | 2;
type Capture = ReturnType<Interaction["capture"]>;
const alignment = (v: unknown): v is Align => v === 0 || v === 1 || v === 2;
const stale = "셀 또는 선택이 바뀌었습니다. 속성을 다시 여세요.";

function alignmentScope(editor: Interaction, doc: Document) {
  const win = doc.defaultView;
  const digest = coreRuntimeIdentity(editor.adapter.doc)?.sha256;
  if (!win || win !== win.top || !isMergedValignCoreDigest(digest)) return;
  const url = new URL(win.location.href);
  const once = (key: string) => url.searchParams.getAll(key).join("/") === "1";
  if (url.protocol === "http:" && url.hostname === "127.0.0.1" &&
      once("oneditQaCoreScope") && once("oneditQaMergedValign")) return "trial";
  if (digest === rootEditorCoreSha256) return "3x1";
}

function target(editor: Interaction, doc: Document, capture: Capture) {
  const a = editor.adapter, s = capture.selection, p = s.focus, ref = capture.paths.focus;
  const scope = alignmentScope(editor, doc);
  if (!scope || p.kind !== "cell" || nested(p) || !ref ||
      capture.documentId !== a.documentId || capture.revision !== a.revision ||
      capture.paths.documentId !== a.documentId || ref.offset !== p.offset)
    throw Error(stale);
  const path = cellPath(p);
  if (path.length !== 1 || ref.target.sectionIndex !== p.sec || ref.target.parentParaIndex !== p.para ||
      ref.target.path.length !== path.length ||
      path.some((hop, index) => {
        const owner = ref.target.path[index];
        return owner?.controlIndex !== hop.controlIndex ||
          owner.cellIndex !== hop.cellIndex || owner.cellParaIndex !== hop.cellParaIndex;
      }))
    throw Error(stale);
  if (s.kind !== "caret" && !(s.kind === "cells" && (s.phase === 1 || s.phase === 2) &&
      s.anchor.kind === "cell" && sameTable(s.anchor,p) && s.anchor.cell === p.cell && capture.paths.anchor))
    throw Error("병합 셀 한 개를 선택하세요.");
  const env = a.localBodyEnvironmentToken();
  if (a.transientEdit || a.hasPendingLocalBodyFlow() || doc.fonts.status !== "loaded" || env === undefined)
    throw Error("글꼴 또는 입력·쪽 배치가 끝난 뒤 다시 시도하세요.");
  // Keep actual command admission and native reference re-resolution live.
  a.assertEditable(p);
  const resolved = a.resolveSelection(capture.paths);
  if (resolved.kind !== s.kind || !samePosition(resolved.focus,p) ||
      (s.kind === "cells" && (resolved.kind !== "cells" || !samePosition(resolved.anchor,s.anchor))))
    throw Error(stale);
  const generation = editor.currentSelectionGeneration;
  const owner = a.tablePropertyProjection({
    target:{section:p.sec,paragraph:p.para,path,range:{kind:"focus"},selectionGeneration:generation},
    fields:["verticalAlign","cellProtect","fieldName","editableInForm","textDirection"],
  }, () => editor.currentSelectionGeneration);
  if (owner.status !== "ok" || owner.members.length !== 1) throw Error(stale);
  const m = owner.members[0], values = m.values, protection = owner.protection;
  if (owner.documentReadonly) throw Error("읽기 전용 문서입니다.");
  if (m.cellProtected || values.cellProtect || protection.anyCellProtected || protection.ancestorCellProtected)
    throw Error("보호된 셀은 편집할 수 없습니다.");
  if (protection.tableLocked || protection.tableSizeProtected)
    throw Error("잠금 또는 크기 보호가 적용된 표는 변경할 수 없습니다.");
  if (values.fieldName !== "" || values.editableInForm !== false || values.textDirection !== 0)
    throw Error("누름틀·양식 또는 세로쓰기 셀의 세로 정렬은 지원하지 않습니다.");
  if (m.cellIndex !== p.cell || (m.rowSpan === 1 && m.colSpan === 1) || !alignment(values.verticalAlign))
    throw Error(stale);
  if (scope === "3x1" && (m.rowSpan !== 3 || m.colSpan !== 1)) throw Error(cellLayoutHold);
  const boxes = a.cells(p).filter(box => box.cellIdx === p.cell);
  const box = boxes[0];
  if (boxes.length !== 1 || box.row !== m.row || box.col !== m.col ||
      box.rowSpan !== m.rowSpan || box.colSpan !== m.colSpan ||
      !Number.isSafeInteger(box.pageIndex) || box.pageIndex < 0 ||
      ![box.x,box.y,box.w,box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0)
    throw Error("한 쪽에 온전히 표시된 병합 셀만 변경할 수 있습니다.");
  const page = doc.querySelector(`#pages [data-page="${box.pageIndex}"]`);
  if (!page?.querySelector(":scope > svg") || page.hasAttribute("data-render-pending"))
    throw Error("현재 셀의 화면 배치가 끝난 뒤 다시 시도하세요.");
  if (s.kind === "cells") {
    const selected = editor.cells(s);
    if (selected.length !== 1 || selected[0].cellIdx !== p.cell)
      throw Error("병합 셀 한 개를 선택하세요.");
  }
  const key = JSON.stringify([
    a.documentId,a.revision,generation,s,capture.paths.focus,capture.paths.anchor,
    owner.owner.instance,owner.owner.documentEpoch,owner.owner.sectionRevision,owner.owner.ownerIds,
    m.cellId,m.row,m.col,m.rowSpan,m.colSpan,values.verticalAlign,box,
    env,fontSupplyRevision(),doc.defaultView?.devicePixelRatio,
  ]);
  return {native:a.doc,key,position:p,paths:capture.paths,verticalAlign:values.verticalAlign,
    mutationGeneration:a.nativeMutationGeneration()};
}

export type MergedValignDraft = Readonly<ReturnType<typeof target>>;
export function prepareMergedValign(editor: Interaction, doc: Document, capture: Capture):
  {draft?: MergedValignDraft; reason?: string} {
  if (!alignmentScope(editor, doc)) return {};
  try { return {draft:Object.freeze(target(editor,doc,capture))}; }
  catch (e) { return {reason:e instanceof Error ? e.message : "현재 병합 셀을 확인할 수 없습니다."}; }
}

export function applyMergedValign(editor: Interaction, doc: Document, draft: MergedValignDraft, delta: Props) {
  if (Object.keys(delta).length !== 1 || !alignment(delta.verticalAlign))
    throw Error("병합 셀 세로 정렬은 다른 속성과 따로 적용하세요.");
  const next = delta.verticalAlign, a = editor.adapter;
  const recheck = (expectedGeneration: number | undefined) => {
    const current = target(editor,doc,editor.capture());
    if (current.native !== draft.native || current.key !== draft.key ||
        current.mutationGeneration !== expectedGeneration) throw Error(stale);
    return current;
  };
  const {mutationGeneration} = recheck(draft.mutationGeneration);
  if (next === draft.verticalAlign) return;
  // History takes one native snapshot before the callback. The dispatch fence
  // advances even though the snapshot does not change the selected cell.
  const snapshotGeneration = mutationGeneration === undefined ? undefined : mutationGeneration + 1;
  let refused: {error:unknown} | undefined;
  const selected = editor.history.transact("병합 셀 세로 정렬", editor.selection, () => {
    let live;
    try { live = recheck(snapshotGeneration); }
    catch (error) { refused = {error}; return editor.selection; } // No setter was entered.
    const p = live.position;
    const reply = a.call("setCellProperties", p.sec, p.para, p.control, p.cell, JSON.stringify({verticalAlign:next}));
    if (reply?.ok !== true || !Array.isArray(reply.changes) || reply.changes.length ||
        !Array.isArray(reply.zones) || reply.zones.length || a.cellProps(p).verticalAlign !== next)
      throw Error("병합 셀 세로 정렬 결과를 확인할 수 없습니다.");
    // Resolve the original owner after Core recomposes; don't select whatever
    // happens to occupy the old numeric indices. History rolls back on error.
    const resolved = a.resolveSelection(live.paths);
    const before = live.paths.selection;
    if (resolved.kind !== before.kind || !samePosition(resolved.focus,p) ||
        (before.kind === "cells" && (resolved.kind !== "cells" || !samePosition(resolved.anchor,before.anchor))))
      throw Error(stale);
    return resolved;
  }, () => refused !== undefined, undefined, true);
  if (refused) throw refused.error;
  editor.selection = selected;
  editor.preferredX = undefined;
  editor.history.endTypingRun();
}
