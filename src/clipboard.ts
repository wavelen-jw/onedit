import {wholeInlineCellBlock,tableCaptureRefusal,UnsupportedTableOperation} from './table-capability.js';
import { fragmentForDocument, siblingDocument } from "./core-runtime.js";
import { type Position, type Selection, nested, ordered, sameContainer } from "./model.js";
import { RhwpAdapter } from "./adapter.js";
import { selectedFragmentObject, captureFragmentObject } from './object-clipboard.js';
import {tableFragmentHTML} from './clipboard-table-html.js';
import {PasteFormatUnavailable} from './paste-format-fallback.js';

export const CLIPBOARD_MIME = "web application/vnd.rhwp-next.body+json";
export const MAX_CLIPBOARD_BYTES = 8 * 1024 * 1024;
const marker = "data-rhwp-next-clipboard";
export type ClipboardData = { text: string; html: string; structured?: string; image?: import("./clipboard-image.js").ClipboardPicture };
const encode = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const decode = (text: string, limit = MAX_CLIPBOARD_BYTES) => {
  if (text.length > limit * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text))
    throw Error("클립보드 데이터 크기 또는 인코딩이 올바르지 않습니다.");
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  // atob returns one byte per UTF-16 code unit. Fill directly rather than
  // allocating an iterable conversion and calling a mapper for every byte.
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
export function decodeEnvelope(wire: string) {
  if (wire.length > MAX_CLIPBOARD_BYTES * 1.4)
    throw Error("클립보드 크기 제한을 초과했습니다.");
  const data = JSON.parse(wire);
  if (
    data?.format !== "rhwp-next-body" ||
    data.version !== 1 ||
    data.encoding !== "hwpx-fragment" ||
    typeof data.payload !== "string"
  )
    throw Error("지원하지 않거나 손상된 RHWP 클립보드 형식입니다.");
  if (data.paragraphMode !== undefined &&
      data.paragraphMode !== "retain-target-at-body-end")
    throw Error("지원하지 않는 클립보드 문단 결합 방식입니다.");
  const bytes = decode(data.payload);
  if (bytes.length > MAX_CLIPBOARD_BYTES)
    throw Error("클립보드 크기 제한을 초과했습니다.");
  return bytes;
}
export function envelopeFromHTML(html: string): string | undefined {
  if (html.length > MAX_CLIPBOARD_BYTES * 2)
    throw Error("HTML 클립보드 크기 제한을 초과했습니다.");
  if (!html.includes(marker)) return undefined;
  const matches = [
    ...html.matchAll(/data-rhwp-next-clipboard="([A-Za-z0-9+/=]+)"/g),
  ];
  if (matches.length !== 1)
    throw Error("손상되거나 중복된 RHWP HTML 클립보드입니다.");
  return new TextDecoder("utf-8", { fatal: true }).decode(
    decode(matches[0][1], MAX_CLIPBOARD_BYTES * 1.5),
  );
}

function assertFragmentScope(a:RhwpAdapter,fragment:{toFragmentBytes():Uint8Array}){
  // Inspect only a Core-validated bounded graph, never the untrusted ZIP.
  const source=siblingDocument(a.doc,fragment.toFragmentBytes());
  try{if(JSON.parse(source.listCharts()).length||JSON.parse(source.getControls()).some((c:any)=>c.userDesc==='차트'))
    throw Error('표차트는 사용자 제외 범위입니다. 원문을 보존합니다.');}
  finally{source.free();}
}
function fragmentPlainText(a:RhwpAdapter,bytes:Uint8Array){
 const source=siblingDocument(a.doc,bytes);try{const text=JSON.parse(source.getTextFileUnicode());if(typeof text!=='string')throw Error('fragment 텍스트 반환 형식이 다릅니다.');return text;}finally{source.free();}
}
function fragmentExternalHTML(a:RhwpAdapter,bytes:Uint8Array){
  const source=siblingDocument(a.doc,bytes);
  try{
    if(source.getSectionCount()!==1)throw Error('외부 HTML로 내보낼 fragment 구역을 확인할 수 없습니다.');
    const view=new RhwpAdapter(source),controls=view.call<any[]>('getControls').filter(c=>c.list===0&&['tbl','gso','eqed'].includes(c.ctrlId));
    const tables=tableFragmentHTML(view);
    if(tables!==undefined){const text=JSON.parse(source.getTextFileUnicode());if(typeof text!=='string')throw Error('fragment 텍스트 반환 형식이 다릅니다.');return{text,html:tables,tableOnly:true};}
    let html='';
    for(let para=0;para<source.getParagraphCount(0);para++){
      const p={kind:'body' as const,sec:0,para,offset:0},content=view.text(p),positions=view.call<number[]>('getControlTextPositions',0,para);let start=0;
      for(const control of controls.filter(c=>c.para===para)){
        const offset=positions[control.controlIndex];
        if(!Number.isSafeInteger(offset)||offset<start||offset>Array.from(content).length)throw Error('fragment 개체의 실제 문자 경계를 확인할 수 없습니다.');
        if(offset>start)html+=source.exportSelectionHtml(0,para,start,para,offset).replace(/<\/?(?:html|body)[^>]*>|<!--(?:Start|End)Fragment-->/gi,'');
        html+=source.exportControlHtml(0,para,'[]',control.controlIndex).replace(/<\/?(?:html|body)[^>]*>|<!--(?:Start|End)Fragment-->/gi,'');start=offset;
      }
      if(start<Array.from(content).length)html+=source.exportSelectionHtml(0,para,start,para,Array.from(content).length).replace(/<\/?(?:html|body)[^>]*>|<!--(?:Start|End)Fragment-->/gi,'');
    }
    const text=JSON.parse(source.getTextFileUnicode());if(typeof text!=='string')throw Error('fragment 텍스트 반환 형식이 다릅니다.');
    return{text,html,tableOnly:false};
  }finally{source.free();}
}

/** No source document, token cache or cross-tab shared memory. Each paste imports
 * a fresh immutable fragment. Core resolves its local IDs against the target pool. */
export class StructuredClipboard {
  captureObject(a:RhwpAdapter,s:Selection):ClipboardData {
    const row=selectedFragmentObject(a,s);
    // Existing Core local identity disambiguates co-anchored controls during
    // capture only. Nothing references it after immutable bytes reach the OS.
    const clip=captureFragmentObject(a,row);
    try {
      const bytes=clip.toFragmentBytes();assertFragmentScope(a,clip);if(bytes.length>MAX_CLIPBOARD_BYTES)throw Error('클립보드 크기 제한은 8 MiB입니다.');
      const structured=JSON.stringify({format:'rhwp-next-body',version:1,encoding:'hwpx-fragment',payload:encode(bytes)});
      const text=`[${row.kind}]`;
      return Object.freeze({text,structured,html:`<div ${marker}="${encode(new TextEncoder().encode(structured))}">${text}</div>`});
    }finally{clip.free();}
  }
  capture(a: RhwpAdapter, from: Position, to: Position): ClipboardData {
    const fragment = a.doc.captureBodyClipboard(
      from.sec,
      from.para,
      from.offset,
      to.para,
      to.offset,
    );
    try {
      const payload = fragment.toFragmentBytes();
      if (payload.length > MAX_CLIPBOARD_BYTES)
        throw Error("클립보드 크기 제한은 8 MiB입니다.");
      const structured = JSON.stringify({
        format: "rhwp-next-body",
        version: 1,
        encoding: "hwpx-fragment",
        payload: encode(payload),
      });
      const data = a.call(
        "copyBodyBlock",
        from.sec,
        from.para,
        from.offset,
        to.para,
        to.offset,
      );
      let body = String(data.html).replace(/<\/?(?:html|body)[^>]*>/gi, "");
      const external=/<table\b/i.test(body)?fragmentExternalHTML(a,payload):undefined;
      if(external?.tableOnly)body=external.html;
      return Object.freeze({
        text: external?external.text:data.text,
        structured,
        html: `<div ${marker}="${encode(new TextEncoder().encode(structured))}">${body}</div>`,
      });
    } finally {
      fragment.free();
    }
  }
  supportsNested(a: RhwpAdapter) {
    return [
      "captureNestedClipboard",
      "getClipboardTarget",
      "pasteCapturedNested",
    ].every((k) => typeof (a.doc as any)[k] === "function");
  }
  captureCellText(a: RhwpAdapter, s: Selection, text: string): ClipboardData {
    // Same immutable paragraph capture, imported through the existing body text
    // splice. Do not turn a former inline text paste into a new table/paragraph.
    if (s.kind !== "text" || s.anchor.kind !== "cell" || s.focus.kind !== "cell")
      throw Error("셀 문단 텍스트 범위가 필요합니다.");
    const captured = this.captureNested(a, s);
    const envelope = JSON.parse(captured.structured!);
    delete envelope.scope;
    const [from, to] = ordered(s.anchor, s.focus);
    // Hancom evidence covers a partial single nested paragraph at a body end.
    // Full paragraphs/F5 and other destinations retain their existing policy.
    if (from.kind === "cell" && to.kind === "cell" && nested(from) &&
        from.cellPara === to.cellPara &&
        (from.offset !== 0 || to.offset !== a.length(to)))
      envelope.paragraphMode = "retain-target-at-body-end";
    const structured = JSON.stringify(envelope);
    // Only the wrapper scope changes. Keep the already-exported same fragment
    // HTML instead of importing/serializing that identical payload a second time.
    const html=captured.html.replace(`${marker}="${encode(new TextEncoder().encode(captured.structured!))}"`,`${marker}="${encode(new TextEncoder().encode(structured))}"`);
    if(html===captured.html)throw Error('셀 클립보드 wrapper 갱신 실패');
    return Object.freeze({
      text, structured,
      html,
    });
  }
  captureNested(
    a: RhwpAdapter,
    s: Selection,
    cells: {
      cellIdx: number;
      row: number;
      col: number;
      rowSpan: number;
      colSpan: number;
    }[] = [],
  ): ClipboardData {
    if (!this.supportsNested(a) || s.focus.kind !== "cell")
      throw Error("Core API 미지원: 중첩 구조화 클립보드");
    let p = s.focus,
      request: Record<string, unknown>;
    const whole=wholeInlineCellBlock(a,s,cells);
    if(whole&&tableCaptureRefusal(a,p))return this.capture(a,{kind:'body',sec:p.sec,para:p.para,offset:whole.offset},{kind:'body',sec:p.sec,para:p.para,offset:whole.offset+1});
    if (s.kind === "text") {
      const [from, to] = ordered(s.anchor, s.focus);
      if (from.kind !== "cell" || to.kind !== "cell")
        throw Error("같은 셀 문단 범위만 복사할 수 있습니다.");
      p = from;
      const end = a.captureParagraph(to);
      request = {
        kind: "paragraphs",
        startParagraph: from.cellPara,
        endParagraph: to.cellPara,
        endTargetId: end.targetId,
      };
      // Full paragraph boundaries omit offsets, allowing existing Core control capture.
      if (from.offset !== 0) request.startOffset = from.offset;
      if (to.offset !== a.length(to)) request.endOffset = to.offset;
    } else {
      const t = a.captureParagraph(p);
      const table = a.call(
        "getTableStructureByPath",
        t.sectionIndex,
        t.parentParaIndex,
        JSON.stringify(t.path),
        t.targetId,
      ).table;
      request = {
        kind: s.kind === "table" ? "table" : "cells",
        expectedRevision: table.revision,
      };
      if (s.kind === "cells") {
        if (!cells.length) throw Error("셀 블록을 선택하세요.");
        Object.assign(request, {
          startRow: Math.min(...cells.map((c) => c.row)),
          startCol: Math.min(...cells.map((c) => c.col)),
          endRow: Math.max(...cells.map((c) => c.row + c.rowSpan - 1)),
          endCol: Math.max(...cells.map((c) => c.col + c.colSpan - 1)),
        });
      } else if (s.kind !== "table")
        throw Error("구조화 복사할 선택이 없습니다.");
    }
    if(s.kind==='cells'||s.kind==='table'){const refusal=tableCaptureRefusal(a,p,s.kind==='cells'?'cells':'table');if(refusal)throw refusal;}
    const target = a.captureParagraph(p);
    const fragment = a.doc.captureNestedClipboard(
      target.sectionIndex,
      target.parentParaIndex,
      JSON.stringify(target.path),
      target.targetId,
      JSON.stringify(request),
    );
    try {
      const bytes = fragment.toFragmentBytes();
      if (bytes.length > MAX_CLIPBOARD_BYTES)
        throw Error("클립보드 크기 제한은 8 MiB입니다.");
      const structured = JSON.stringify({
        format: "rhwp-next-body",
        version: 1,
        encoding: "hwpx-fragment",
        scope: "nested",
        payload: encode(bytes),
      });
      const external=fragmentExternalHTML(a,bytes);
      return Object.freeze({
        text: external.text,
        structured,
        html: `<div ${marker}="${encode(new TextEncoder().encode(structured))}">${external.html}</div>`,
      });
    } finally {
      fragment.free();
    }
  }
  isNested(html: string, wire?: string) {
    try {
      const envelope = wire ?? envelopeFromHTML(html);
      if (!envelope) return false;
      decodeEnvelope(envelope); // Existing shape/size/encoding checks before routing.
      const scope = JSON.parse(envelope).scope;
      if (scope !== undefined && scope !== "nested")
        throw Error("지원하지 않는 클립보드 scope입니다.");
      return scope === "nested";
    } catch(e) {
      throw new PasteFormatUnavailable(e instanceof Error ? e.message : String(e));
    }
  }
  pasteNested(
    a: RhwpAdapter,
    p: Position,
    html: string,
    wire?: string,
  ): Position {
    if (!this.supportsNested(a))
      throw new UnsupportedTableOperation("clipboard-target-scope","Core API 미지원: 중첩 구조화 붙여넣기");
    const envelope = wire ?? envelopeFromHTML(html);
    if (!envelope || !this.isNested(html, envelope))
      throw Error("중첩 fragment envelope가 필요합니다.");
    const length = a.length(p);
    if (p.offset !== 0 && p.offset !== length)
      throw new UnsupportedTableOperation("clipboard-target-scope","문단 시작/끝 경계에서만 구조화 붙여넣기를 지원합니다.");
    const target = a.clipboardTarget(p);
    const fragment = fragmentForDocument(a.doc,
      decodeEnvelope(envelope),
    );
    try {
      const r = JSON.parse(
        a.doc.pasteCapturedNested(
          fragment,
          JSON.stringify({ ...target, after: p.offset !== 0 }),
        ),
      );
      // This exact Core capability code is a bounded admission refusal, not a
      // parse/resource/save failure. The caller's History still rolls back.
      if(r.ok===false&&r.reason==='렌더링 오류: unsupported-body-oversized-inline-table')
        throw new UnsupportedTableOperation('clipboard-body-oversized-table','현재 본문 쪽 높이를 넘는 인라인 표 붙여넣기는 아직 지원하지 않습니다.');
      if(r.ok===false&&r.reason==='렌더링 오류: fragment-exceeds-owner-width')
        throw new UnsupportedTableOperation('clipboard-owner-width','붙일 표가 현재 대상의 가용 너비를 넘습니다. 원문 크기는 변경하지 않습니다.');
      if (!r.ok || !r.changed)
        throw Error(
          `중첩 붙여넣기 거절: ${r.reason ?? r.error ?? "no-change"}`,
        );
      const last = r.inserted?.at(-1);
      if (!last) throw Error("Core 붙여넣기 경로 결과가 없습니다.");
      const position = a.clipboardInsertedPosition(last);
      // Existing loss/reopen checks run inside the host transaction. Any
      // target-document integrity mismatch rolls back before dirty/History.
      a.exportChecked();
      return position;
    } finally {
      fragment.free();
    }
  }
  recognizes(html: string) {
    return html.includes(marker);
  }
  /** Existing immutable importer remaps definitions; existing cell split/join
   * commands splice text paragraphs in one caller-owned History transaction. */
  pasteCell(a: RhwpAdapter, p: Position, text: string, html: string, wire?: string): Position {
    if(p.kind!=='cell')throw Error('셀 서식 붙여넣기 대상이 셀이 아닙니다.');
    if (!this.supportsNested(a))
      throw new UnsupportedTableOperation("clipboard-target-scope","Core API 미지원: 셀 서식 붙여넣기");
    const envelope = wire ?? envelopeFromHTML(html);
    if (!envelope) throw Error("RHWP 서식 fragment가 필요합니다.");
    const payload=decodeEnvelope(envelope);
    const fragment = fragmentForDocument(a.doc, payload);
    try {
      assertFragmentScope(a,fragment);
      // Inspect only the validated Core fragment through existing getters. No
      // XML parsing, HTML execution, source-document cache or second OS read.
      const source = siblingDocument(a.doc, fragment.toFragmentBytes());
      let paragraphs: string[], hasControl: boolean;
      try {
        if (source.getSectionCount() !== 1) throw Error("한 구역 fragment만 지원합니다.");
        paragraphs = Array.from({ length: source.getParagraphCount(0) }, (_, i) =>
          source.getTextRange(0, i, 0, source.getParagraphLength(0, i)));
        hasControl = JSON.parse(source.getControls()).some((c: any) => c.ctrlId === "tbl" || c.ctrlId === "gso" || c.ctrlCh === 11);
      } finally { source.free(); }
      if (!paragraphs.length) throw Error("빈 fragment입니다.");
      const insert = (after: boolean) => {
        const r = JSON.parse(a.doc.pasteCapturedNested(fragment, JSON.stringify({ ...a.clipboardTarget(p), after })));
        if (!r.ok || !r.changed || r.inserted?.length !== paragraphs.length)
          throw Error(`셀 붙여넣기 거절: ${r.reason ?? r.error ?? "잘못된 문단 결과"}`);
        return r.inserted.map((t: any) => a.clipboardInsertedPosition(t)) as Position[];
      };
      if (hasControl) {
        if (p.offset !== 0 && p.offset !== a.length(p))
          throw new UnsupportedTableOperation("clipboard-target-scope","NOT_SUPPORTED: 표·개체 fragment는 셀 문단 시작/끝 경계에서 붙여넣으세요.");
        const inserted = insert(p.offset !== 0);
        a.exportChecked();
        return inserted[inserted.length - 1];
      }
      if (text && text.replace(/\r\n?/g, "\n") !== paragraphs.join("\n"))
        throw Error("셀 텍스트와 서식 fragment가 일치하지 않습니다.");
      if (paragraphs.length === 1 && !paragraphs[0]) throw Error("빈 텍스트 fragment입니다.");
      a.assertTextOnly(p);
      const before = Array.from(a.text(p)), count = a.count(p), shape = a.paraProps(p).paraShapeId;
      a.split(p);
      const inserted = insert(true);
      for (const [i, at] of inserted.entries()) {
        if (at.kind !== "cell" || !sameContainer(p, at) || at.cellPara !== p.cellPara + i + 1)
          throw Error("셀 붙여넣기 대상 경로 보존 확인에 실패했습니다.");
        a.assertTextOnly(at);
        if (a.text(at) !== paragraphs[i]) throw Error("붙여넣은 셀 문단 텍스트 확인에 실패했습니다.");
      }
      const lastLength = a.length(inserted[inserted.length - 1]);
      a.remove(p, { ...inserted[0], offset: 0 });
      const end = { ...p, cellPara: p.cellPara + inserted.length - 1,
        offset: lastLength + (inserted.length === 1 ? p.offset : 0) };
      a.remove(end, { ...end, cellPara: end.cellPara + 1, offset: 0 });
      const expected = [...paragraphs];
      expected[0] = before.slice(0, p.offset).join("") + expected[0];
      expected[expected.length - 1] += before.slice(p.offset).join("");
      if (a.count(p) !== count + inserted.length - 1 || a.paraProps(p).paraShapeId !== shape ||
          expected.some((value, i) => a.text({ ...p, cellPara: p.cellPara + i }) !== value))
        throw Error("셀 텍스트·대상 문단 서식 보존 확인에 실패했습니다.");
      a.exportChecked();
      return end;
    } finally { fragment.free(); }
  }
  paste(a: RhwpAdapter, p: Position, html: string, wire?: string, allowObject=true): Position {
    if (p.kind !== "body") throw Error("본문 블록은 본문 위치에 붙여넣으세요.");
    const envelope = wire ?? envelopeFromHTML(html);
    if (!envelope)
      throw Error(
        "외부 HTML 표 가져오기는 아직 지원하지 않습니다. 텍스트 전용으로 복사한 내용을 붙여넣으세요.",
      );
    const payload = decodeEnvelope(envelope);
    const retainParagraph =
      JSON.parse(envelope).paragraphMode === "retain-target-at-body-end" &&
      p.offset === a.length(p);
    const shapeId = retainParagraph ? a.paraProps(p).paraShapeId : undefined;
    if (retainParagraph && (!Number.isSafeInteger(shapeId) || Number(shapeId) < 0 ||
        typeof a.doc.setParaShapeId !== "function"))
      throw Error("NOT_SUPPORTED: 대상 문단 서식 참조를 보존할 수 없습니다.");
    const fragment = fragmentForDocument(a.doc,
      payload,
    );
    try {
      assertFragmentScope(a,fragment);
      const source=siblingDocument(a.doc,fragment.toFragmentBytes());
      let object=false,objectOnly=false;
      try {
        object=JSON.parse(source.getControls()).some((c:{ctrlId:string})=>c.ctrlId==='gso');
        objectOnly=object&&source.getSectionCount()===1&&source.getParagraphCount(0)===1&&source.getParagraphLength(0,0)===0;
      }finally{source.free();}
      if(object&&!allowObject)throw Error('개체 fragment는 본문 커서 위치에서 붙여넣으세요. 선택 대체는 별도 지원 범위입니다.');
      const paragraphProperties=()=>Object.fromEntries(Object.entries(a.paraProps(p)).filter(([key])=>!['paraShapeId','borderFillId'].includes(key)));
      const originalParagraph=objectOnly?JSON.stringify(paragraphProperties()):undefined;
      const r = a.call("pasteCapturedBody", fragment, p.sec, p.para, p.offset);
      // Object-only clipboard contents do not authorize changing the existing
      // destination text's paragraph format. Preserve the real Core failure;
      // roll back this History transaction instead of overwriting its format.
      if(originalParagraph!==undefined&&JSON.stringify(paragraphProperties())!==originalParagraph)
        throw Error('개체 붙여넣기가 기존 문단 서식을 변경하여 취소했습니다. 원문은 보존됩니다.');
      if(object){
        // Preserve the existing paste caret contract. Picture properties do not
        // expose persistent IDs; never infer one from equal geometry or choose
        // an arbitrary co-anchored object after a repeated paste.
        a.validate({...p,para:r.paraIdx,offset:r.bodyLogicalOffset});
        a.exportChecked();
      }
      if (retainParagraph) {
        if (r.paraIdx !== p.para)
          throw Error("부분 텍스트 붙여넣기가 문단 구조를 변경하여 취소했습니다.");
        // The caller's existing paste transaction includes both operations.
        // Restore the raw ID; getter values mix units and must not be reapplied.
        a.call("setParaShapeId", p.sec, p.para, Number(shapeId));
        if (a.paraProps(p).paraShapeId !== shapeId)
          throw Error("대상 문단 서식 참조 보존 확인에 실패했습니다.");
      }
      return { ...p, para: r.paraIdx, offset: r.bodyLogicalOffset };
    } finally {
      fragment.free();
    }
  }
}
