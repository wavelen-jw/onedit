import type { OwnerProjection } from './owner-projection.js';
import type { RhwpAdapter } from "./adapter.js";
import { type Position, type Selection, type SelectionReference, type ParagraphTarget, paraIndex, withPara, cellPath, nested } from "./model.js";
import { resolveTextboxSelection } from "./textbox-edit.js";
import { UnsupportedTableOperation } from "./table-capability.js";

// Internal responsibility only; no state ownership or policy changes.
/** @internal Pure synchronous body-index enumeration for read-only catalogs.
 * The original native section/paragraph counts still establish the range.
 * Reuse existing update-scoped receipts when available; otherwise read each
 * bound once locally. No callbacks/writes/yields occur while enumerating.
 * A fresh array is returned on EVERY call: no cross-event owner/geometry cache.
 * Typed object/anchor/lock/resource validation remains with each caller. */
export function bodyParagraphOwners(a: RhwpAdapter): {sec:number;para:number}[] {
  const body: {sec:number;para:number}[] = [];
  const sections = a.readStructural('getSectionCount');
  for (let sec = 0; sec < sections; sec++) {
    const paragraphs = a.readStructural('getParagraphCount', sec);
    for (let para = 0; para < paragraphs; para++) body.push({sec, para});
  }
  return body;
}

export function path(this: RhwpAdapter, p: Position) {
    if (p.kind !== "cell") throw Error("셀 경로가 필요합니다.");
    return JSON.stringify(cellPath(p));
  }

export function fromPath(this: RhwpAdapter, sec: number, para: number, path: import("./model.js").CellPathEntry[], offset: number): Position {
    const leaf = path.at(-1);
    if (!leaf) throw Error("빈 셀 경로입니다.");
    return {
      kind: "cell",
      sec,
      para,
      control: leaf.controlIndex,
      cell: leaf.cellIndex,
      cellPara: leaf.cellParaIndex,
      offset,
      ...(path.length > 1
        ? { ancestors: structuredClone(path.slice(0, -1)) }
        : {}),
    };
  }

export function captureParagraph(this: RhwpAdapter, p: Position): ParagraphTarget {
    this.validate(p);
    if (p.kind !== "cell") throw Error("셀 문단 경로가 필요합니다.");
    return this.call("captureCellParagraphPath", p.sec, p.para, this.path(p))
      .target;
  }

export function resolveParagraph(this: RhwpAdapter, target: ParagraphTarget): ParagraphTarget {
    const resolved = this.call(
      "resolveCellParagraphPath",
      target.targetId,
    ).target;
    // Validate the identity at the Core-returned path, never at a guessed index.
    const checked = this.call(
      "validateCellParagraphPath",
      resolved.sectionIndex,
      resolved.parentParaIndex,
      JSON.stringify(resolved.path),
      target.targetId,
    );
    if (!checked.valid) throw Error("선택 문단 경로가 만료되었습니다.");
    return resolved;
  }

export function clipboardTarget(this: RhwpAdapter, p: Position) {
    this.validate(p);
    const target =
      p.kind === "cell"
        ? this.resolveParagraph(this.captureParagraph(p))
        : null;
    const path = target?.path ?? [];
    const result = this.call(
      "getClipboardTarget",
      p.sec,
      p.para,
      JSON.stringify(path),
    );
    return {
      kind: p.kind,
      sectionIndex: p.sec,
      parentParaIndex: p.para,
      path,
      expectedTargetId: result.expectedTargetId,
    };
  }

export function clipboardInsertedPosition(this: RhwpAdapter, t: ParagraphTarget): Position {
    const live = this.call(
      "getClipboardTarget",
      t.sectionIndex,
      t.parentParaIndex,
      JSON.stringify(t.path),
    );
    if (live.expectedTargetId !== t.targetId)
      throw Error("붙여넣은 Core 문단 경로가 만료되었습니다.");
    const p: Position = t.path.length
      ? this.fromPath(t.sectionIndex, t.parentParaIndex, t.path, 0)
      : {
          kind: "body",
          sec: t.sectionIndex,
          para: t.parentParaIndex,
          offset: 0,
        };
    p.offset = this.length(p);
    this.validate(p);
    return p;
  }

export function captureSelection(this: RhwpAdapter, selection: Selection): SelectionReference {
    const endpoint = (p: Position) =>
      p.kind === "cell"
        ? { target: this.captureParagraph(p), offset: p.offset }
        : undefined;
    return {
      documentId: this.documentId,
      selection: selection.kind === "object" && selection.textbox ? resolveTextboxSelection(this, selection) : structuredClone(selection),
      focus: endpoint(selection.focus),
      anchor: "anchor" in selection ? endpoint(selection.anchor) : undefined,
    };
  }

export function resolveSelection(this: RhwpAdapter, ref: SelectionReference, observeFocus?: (target:ParagraphTarget)=>void): Selection {
    if (ref.documentId !== this.documentId)
      throw Error("선택 대상 문서가 변경되었습니다.");
    const selection = structuredClone(ref.selection);
    const endpoint = (e: NonNullable<SelectionReference["focus"]>, observe?: (target:ParagraphTarget)=>void) => {
      const t = this.resolveParagraph(e.target);
      if (
        !Number.isSafeInteger(e.offset) ||
        e.offset < 0 ||
        e.offset > t.charLength
      )
        throw Error("선택 문단의 문자 위치가 만료되었습니다.");
      const position=this.fromPath(t.sectionIndex, t.parentParaIndex, t.path, e.offset);
      observe?.(t);
      return position;
    };
    if (ref.focus)
      selection.focus = endpoint(ref.focus,observeFocus) as typeof selection.focus;
    if (ref.anchor && "anchor" in selection)
      selection.anchor = endpoint(ref.anchor) as typeof selection.anchor;
    return selection.kind === "object" && selection.textbox ? resolveTextboxSelection(this, selection) : selection;
  }

export function list(this: RhwpAdapter, p: Position, owners?: OwnerProjection, fresh = false) {
    if (p.kind !== "cell") throw Error("셀 경로가 필요합니다.");
    const lists = owners ? owners.lists(this) :
      (fresh ? this.readOwnerModelFresh() : this.readCursorModelForLookup()).lists;
    let host = 0,
      hostPara = p.para;
    let found: any;
    for (const step of cellPath(p)) {
      found = owners ? owners.findCell(this, lists, p.sec, host, hostPara, step.controlIndex, step.cellIndex) : lists.find(
        (l: any) =>
          l.isCell &&
          l.row !== undefined &&
          l.sectionIndex === p.sec &&
          l.hostListId === host &&
          l.hostPara === hostPara &&
          l.controlIndex === step.controlIndex &&
          l.cellIndex === step.cellIndex,
      );
      if (!found || step.cellParaIndex >= found.paraCount)
        throw Error("선택 셀 경로가 현재 문서에 없습니다.");
      host = found.listId;
      hostPara = step.cellParaIndex;
    }
    return Object.isFrozen(found)?{...found}:found;
  }

export function listPosition(this: RhwpAdapter, entry: any, lists: readonly any[]): Position {
    if (entry.hostListId === 0)
      return {
        kind: "cell",
        sec: entry.sectionIndex,
        para: entry.hostPara,
        control: entry.controlIndex,
        cell: entry.cellIndex,
        cellPara: 0,
        offset: 0,
      };
    const parent = lists.find((l) => l.listId === entry.hostListId);
    if (!parent?.isCell || parent.row === undefined)
      throw Error("표가 아닌 중첩 영역입니다.");
    const p = this.listPosition(parent, lists);
    if (p.kind !== "cell") throw Error("잘못된 셀 경로입니다.");
    return this.fromPath(
      p.sec,
      p.para,
      [
        ...cellPath({ ...p, cellPara: entry.hostPara }),
        {
          controlIndex: entry.controlIndex,
          cellIndex: entry.cellIndex,
          cellParaIndex: 0,
        },
      ],
      0,
    );
  }

export function child(this: RhwpAdapter, p: Position, last = false): Position | undefined {
    if (p.kind !== "cell") return;
    const lists = this.readCursorModelForLookup().lists,
      host = this.list(p).listId;
    const children = lists.filter(
      (l: any) =>
        l.isCell &&
        l.row !== undefined &&
        l.hostListId === host &&
        l.hostPara === p.cellPara,
    );
    const entry = last ? children.at(-1) : children[0];
    if (!entry) return;
    let target = this.listPosition(entry, lists);
    if (last) {
      target = withPara(target, this.count(target) - 1);
      target.offset = this.length(target);
    }
    return target;
  }

export function assertTextOnly(this: RhwpAdapter, p: Position, endPara = paraIndex(p), owners?:OwnerProjection) {
    if (p.kind !== "cell") return;
    const host = this.list(p).listId;
    if (
      (owners?.isCurrent(this)?owners.lists(this):this.readCursorModelForLookup().lists).some(
        (l: any) =>
          l.isCell &&
          l.hostListId === host &&
          l.hostPara >= p.cellPara &&
          l.hostPara <= endPara,
      )
    )
      throw new UnsupportedTableOperation('nested-parent-text',
        "Core API 미지원: 중첩 개체가 포함된 부모 문단의 논리적 텍스트 편집",
      );
  }

export function parent(this: RhwpAdapter, p: Position, backward: boolean): Position {
    if (p.kind !== "cell" || !p.ancestors?.length)
      throw Error("부모 셀 경로가 없습니다.");
    let target = this.fromPath(p.sec, p.para, p.ancestors, 0);
    const host = paraIndex(target),
      adjacent = host + (backward ? -1 : 1);
    // Existing text-offset APIs cannot represent either side of a nested control
    // in mixed text. Use an adjacent paragraph, never flatten the control slot.
    if (adjacent < 0 || adjacent >= this.count(target))
      throw Error(
        "부모 표의 개체 경계 커서 API가 필요합니다. 부모 셀을 클릭하세요.",
      );
    target = withPara(target, adjacent);
    target.offset = backward ? this.length(target) : 0;
    return target;
  }

export function length(this: RhwpAdapter, p: Position, allowOwnerRead=true) {
    if (nested(p))
      return this.doc.getCellParagraphLengthByPath(p.sec, p.para, this.path(p));
    return p.kind === "body"
      ? this.readStructural('getLogicalLength',p.sec, p.para)
      : readRootCellScalar(this,"length",p,allowOwnerRead,
          ()=>this.doc.getCellParagraphLength(p.sec,p.para,p.control,p.cell,p.cellPara));
  }

function readRootCellScalar(adapter:RhwpAdapter,key:"count"|"length",p:Position,allow:boolean,read:()=>number) {
  return allow ? adapter.displayCellScalar(key,p,read) : read();
}
export function count(this: RhwpAdapter, p: Position, allowOwnerRead=true) {
    if (nested(p))
      return this.doc.getCellParagraphCountByPath(p.sec, p.para, this.path(p));
    return p.kind === "body"
      ? this.readStructural('getParagraphCount',p.sec)
      : readRootCellScalar(this,"count",p,allowOwnerRead,()=>this.doc.getCellParagraphCount(p.sec,p.para,p.control,p.cell));
  }

export function text(this: RhwpAdapter, p: Position) {
    if (nested(p))
      return this.doc.getTextInCellByPath(
        p.sec,
        p.para,
        this.path(p),
        0,
        this.length(p),
      );
    return p.kind === "body"
      ? this.readStructural('getTextRange',
          p.sec,
          p.para,
          0,
          this.readStructural('getParagraphLength',p.sec, p.para),
        )
      : this.doc.getTextInCell(
          p.sec,
          p.para,
          p.control,
          p.cell,
          p.cellPara,
          0,
          this.length(p),
        );
  }

export function validate(this: RhwpAdapter, p: Position, allowOwnerRead = true, menuDisplay = false, tableOwner?: (p:Extract<Position,{kind:"cell"}>)=>boolean) {
    if (
      !p ||
      !["body", "cell"].includes(p.kind) ||
      ![
        p.sec,
        p.para,
        p.offset,
        ...(p.kind === "cell" ? [p.control, p.cell, p.cellPara] : []),
      ].every((n) => Number.isSafeInteger(n) && n >= 0)
    )
      throw Error("잘못된 문서 위치입니다.");
    if (p.kind === "cell") {
      if (
        p.ancestors !== undefined &&
        (!Array.isArray(p.ancestors) ||
          p.ancestors.some(
            (e) =>
              !e ||
              ![e.controlIndex, e.cellIndex, e.cellParaIndex].every(
                (n) => Number.isSafeInteger(n) && n >= 0,
              ),
          ))
      )
        throw Error("잘못된 중첩 셀 경로입니다.");
      if (!tableOwner?.(p) && (!menuDisplay || !allowOwnerRead || !this.validateMenuCellOwner(p))) this.list(p, allowOwnerRead);
    }
    if (
      p.sec < 0 ||
      p.sec >= this.readStructural('getSectionCount') ||
      paraIndex(p) < 0 ||
      paraIndex(p) >= count.call(this,p,allowOwnerRead) ||
      p.offset < 0 ||
      p.offset > length.call(this,p,allowOwnerRead)
    )
      throw Error("선택 위치가 현재 문서에 없습니다.");
  }

export function textOffset(this: RhwpAdapter, p: Position, offset = p.offset) {
    return p.kind === "body"
      ? this.readStructural('logicalToTextOffset',p.sec, p.para, offset)
      : offset;
  }

export function logical(this: RhwpAdapter, p: Position, offset: number): number {
    return p.kind === "body"
      ? this.readStructural('textToLogicalOffset',p.sec, p.para, offset)
      : offset;
  }
