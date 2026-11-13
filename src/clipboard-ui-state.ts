import {captureParentTableCut} from './parent-table-cut.js';
import {captureCellBlockObjectCut} from './cell-block-cut.js';
import {wholeInlineCellBlock,tableCaptureRefusal,UnsupportedTableOperation} from './table-capability.js';
import type { Interaction } from "./interaction.js";
import { nested, ordered, paraIndex } from "./model.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";
import { selectedCutObject, selectedFragmentObject } from './object-clipboard.js';

// Capability presence is not a Studio bridge or an OS permission grant.
export function clipboardSupport(
  editor: Interaction,
  action: "copy" | "cut" | "paste",
) {
  const s = editor.selection;
  const doc = editor.adapter.doc as unknown as Record<string, unknown>;
  const coreNested = [
    "captureNestedClipboard",
    "getClipboardTarget",
    "pasteCapturedNested",
  ].every((name) => typeof doc[name] === "function");
  if (s.kind === "object") {
    let reason:string|null=action==='paste'?'본문 커서 위치에서 붙여넣으세요. 개체 선택 대체는 별도 지원 범위입니다.':null;
    if(!reason)try{(action==='cut'?selectedCutObject:selectedFragmentObject)(editor.adapter,s);if(action==='cut')editor.adapter.assertEditable(s.focus);}catch(e){reason=String(e);}
    return {coreNested,supported:!reason,expectedUnsupported:false,structuredSelection:false,mode:action==='cut'?'본문·표 셀의 그림·글상자·그룹 잘라내기':'기존 단일 개체·복합 개체 fragment 복사',reason};
  }
  if(action==='cut'&&s.kind==='table'&&!nested(s.focus)){
    try{if(captureParentTableCut(editor.adapter,s))return{coreNested,supported:true,expectedUnsupported:false,structuredSelection:true,mode:'독립 부모표 개체 전체 그래프 잘라내기',reason:null};}
    catch(e){if(!(e instanceof UnsupportedTableOperation))throw e;return{coreNested,supported:false,expectedUnsupported:true,structuredSelection:true,mode:'부모표 개체 잘라내기',reason:e.message};}
  }
  let structuredSelection =
    nested(s.focus) && ["cells", "table"].includes(s.kind);
  let nestedText = false;
  if (nested(s.focus) && s.kind === "text") {
    try {
      const [from, to] = ordered(s.anchor, s.focus);
      editor.adapter.assertTextOnly(from, paraIndex(to));
      nestedText = true;
    } catch {
      structuredSelection = true;
    }
  }
  let reason: string | null = null;let expectedUnsupported=false;
  const ordinaryCells = s.kind === "cells" && !nested(s.focus);
  if (ordinaryCells) {
    structuredSelection = true;
    if (!coreNested)
      reason = "NOT_SUPPORTED: 설치 Core의 셀 문단 서식 클립보드 API가 없습니다.";
    else try {
      if (editor.cells(s).length === 1) for (const target of editor.targets(s))
        editor.adapter.assertTextOnly(target.p);
    } catch (e) { if(!(e instanceof UnsupportedTableOperation))throw e;reason=e.message;expectedUnsupported=true; }
  }
  if (nested(s.focus) && ["cells", "table"].includes(s.kind) && !coreNested)
    reason = "NOT_SUPPORTED: 설치 Core의 중첩 구조화 클립보드 API가 없습니다.";
  if (nestedText && action !== "paste" && !coreNested)
    reason = "NOT_SUPPORTED: 설치 Core의 중첩 셀 텍스트 서식 클립보드 API가 없습니다.";
  if (nested(s.focus) && s.kind === "table" && action !== "copy"){reason="자식 표 전체 삭제/선택 대체는 아직 지원하지 않습니다. 복사는 지원합니다.";expectedUnsupported=true;}
  if(action==='paste'&&s.kind==='cells'&&editor.cells(s).length>1){reason='복수 셀을 대신하는 붙여넣기는 아직 지원하지 않습니다.';expectedUnsupported=true;}
  if(action!=='paste'&&(s.kind==='table'&&nested(s.focus)||s.kind==='cells'&&(nested(s.focus)||editor.cells(s).length>1))){
    const refusal=wholeInlineCellBlock(editor.adapter,s,editor.cells(s))?undefined:tableCaptureRefusal(editor.adapter,s.focus,s.kind==='cells'?'cells':'table');
    if(refusal){reason=refusal.message;expectedUnsupported=true;}
  }
  if (action === "cut") {
    try {
      const objectBlock=s.kind==='cells'?captureCellBlockObjectCut(editor.adapter,s,editor.cells(s).map(c=>c.cellIdx)):undefined;
      if(!objectBlock)for (const t of editor.targets())
        editor.adapter.assertTextOnly(
          t.p,
          t.p.kind === "cell" ? t.p.cellPara : undefined,
        );
    } catch (e) {
      if(!(e instanceof UnsupportedTableOperation))throw e;reason=e.message;expectedUnsupported=true;
    }
  }
  const mode = ordinaryCells
    ? "단일 셀 문단 또는 복수 셀 표 fragment · 본문 경계 붙여넣기"
    : nestedText
    ? "중첩 셀 텍스트·서식 복사 · 셀 구조 제외 · 본문 붙여넣기"
    : structuredSelection
    ? "중첩 구조화 fragment · 붙여넣기는 문단 경계에서만 지원"
    : s.focus.kind === "body" || s.kind === "table"
      ? "본문 구조화/HTML/텍스트"
      : "셀 텍스트·복수 문단 fragment 서식 붙이기 · 지원 표는 문단 경계";
  return { coreNested, supported: !reason, reason, mode, structuredSelection,expectedUnsupported };
}

export function mayRestoreClipboardFocus(
  doc: Pick<Document, "hasFocus" | "activeElement" | "body">,
  initiator: Element | null,
  expected: ReturnType<Interaction["capture"]> | undefined,
  current: () => ReturnType<Interaction["capture"]>,
) {
  if (
    !expected ||
    !doc.hasFocus() ||
    (doc.activeElement !== initiator && doc.activeElement !== doc.body)
  )
    return false;
  try {
    return sameFormatTarget(expected, current());
  } catch {
    return false;
  }
}
