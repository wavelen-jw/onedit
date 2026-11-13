import type { RhwpAdapter } from "./adapter.js";
import { UnsupportedTableOwner } from "./adapter.js";
import { type Position, cellPath, withPara } from "./model.js";
import { captionCatalog } from "./caption-preservation.js";
import { noteCatalog } from "./notes.js";
import { fragmentClipboardObjects, captureFragmentObject } from "./object-clipboard.js";

// Internal responsibility only; no state ownership or policy changes.
export function projectSemantic(this: RhwpAdapter) {
    if (this.viewerOnlyReason) {
      // Explicitly a READ-ONLY DISPLAY projection, not full editable semantics.
      // No export/serialization fallback and no invented cell address. Saving is
      // rejected below; the original file remains the preservation authority.
      return {
        projection: "readonly-rendering-not-editable-semantics",
        reason: this.viewerOnlyReason,
        pages: Array.from({ length: this.pageCount }, (_, page) => this.doc.renderPageSvg(page)),
        cursorModel: this.call("getCursorModel"),
      };
    }
    const strip = (o: any) => {
      // Core properties are decoded JSON objects. Preserve every enumerable
      // property except the three transient definition IDs, without allocating
      // an entries array, pair arrays and a filtered array for every character.
      const { charShapeId, paraShapeId, borderFillId, ...properties } = o;
      return properties;
    };
    // One synchronous projection, one immutable Core definition pool. A source
    // shape and the SAME Unicode character have identical properties across
    // paragraphs/owners (build_char_properties_json depends only on shape+lang).
    // Never share across documents, edits, or a second semantic() invocation.
    const propertiesByShape = new Map<number, Map<string, ReturnType<typeof strip>>>();
    const paragraph = (p: Position) => {
      const text = this.text(p), letters = Array.from(text), chars: ReturnType<typeof strip>[] = [];
      if (!letters.length) {
        chars.push(strip(this.charProps({ ...p, offset: this.logical(p, 0) })));
      } else {
        const runs: { startOffset: number; endOffset: number; charShapeId: number }[] =
          p.kind === "body"
            ? this.call("getCharShapeRuns", p.sec, p.para, 0, letters.length)
            : this.call("getCharShapeRunsInCellByPath", p.sec, p.para, this.path(p), 0, letters.length);
        // One paragraph in this synchronous projection only. Core properties
        // depend on shape AND character language, so a shape-only cache would
        // lose mixed-language source fonts. Reuse only an identical character
        // in the same shape run; retain every character in the comparison.
        let next = 0;
        for (const run of runs) {
          if (run.startOffset !== next || !Number.isSafeInteger(run.endOffset) ||
              run.endOffset <= next || run.endOffset > letters.length)
            throw Error("의미 검사 글자 모양 구간이 일치하지 않습니다.");
          let properties = propertiesByShape.get(run.charShapeId);
          if (!properties) {
            properties = new Map<string, ReturnType<typeof strip>>();
            propertiesByShape.set(run.charShapeId, properties);
          }
          for (; next < run.endOffset; next++) {
            const letter = letters[next];
            let props = properties.get(letter);
            // Keep the independent shape-reference check at EVERY run boundary,
            // even if its first character was already projected elsewhere.
            if (next === run.startOffset || !props) {
              const raw = this.charProps({ ...p, offset: this.logical(p, next) });
              if (raw.charShapeId !== run.charShapeId)
                throw Error("의미 검사 글자 모양 참조가 일치하지 않습니다.");
              props = strip(raw);
              properties.set(letter, props);
            }
            chars.push(props);
          }
        }
        if (next !== letters.length)
          throw Error("의미 검사 글자 모양 범위가 일치하지 않습니다.");
      }
      return { text, properties: strip(this.paraProps(p)), chars };
    };
    const body = [];
    for (let sec = 0; sec < this.doc.getSectionCount(); sec++)
      for (let para = 0; para < this.doc.getParagraphCount(sec); para++)
        body.push({
          sec,
          para,
          ...paragraph({ kind: "body", sec, para, offset: 0 }),
          inlineTables: this.inline({ kind: "body", sec, para, offset: 0 }).map(
            (t) => ({ control: t.controlIndex, offset: t.offset }),
          ),
        });
    const model = this.call("getCursorModel");
    const unaddressable=new Set<number>(), requiredOwners=new Map<string,any>();
    for(const entry of model.lists.filter((l:any)=>l.isCell&&l.row!==undefined)){
      let owner=entry;const seen=new Set<number>(),chain=[entry];
      while(owner.hostListId!==0){
        if(seen.has(owner.hostListId))throw Error('의미 검사 소유 경로가 순환합니다.');
        seen.add(owner.hostListId);owner=model.lists.find((l:any)=>l.listId===owner.hostListId);
        if(!owner)throw Error('의미 검사 소유 문단이 없습니다.');
        chain.push(owner);
      }
      const opaque=chain.reverse().find(e=>!e.isCell||e.row===undefined);
      if(opaque){unaddressable.add(entry.listId);requiredOwners.set(JSON.stringify([opaque.sectionIndex,opaque.hostListId,opaque.hostPara,opaque.controlIndex]),opaque);}
    }
    const cells = model.lists
      .filter((l: any) => l.isCell && l.hostListId === 0)
      .map((l: any) => ({
        sec: l.sectionIndex,
        para: l.hostPara,
        control: l.controlIndex,
        cell: l.cellIndex,
        row: l.row,
        col: l.col,
        rowSpan: l.rowSpan,
        colSpan: l.colSpan,
        properties: strip(
          this.call(
            "getCellOwnProperties",
            l.sectionIndex,
            l.hostPara,
            l.controlIndex,
            l.cellIndex,
          ),
        ),
        paragraphs: Array.from({ length: l.paraCount }, (_, cellPara) =>
          paragraph({
            kind: "cell",
            sec: l.sectionIndex,
            para: l.hostPara,
            control: l.controlIndex,
            cell: l.cellIndex,
            cellPara,
            offset: 0,
          }),
        ),
      }));
    const tables = [
      ...new Map(
        cells.map((c: any) => [
          `${c.sec}/${c.para}/${c.control}`,
          {
            sec: c.sec,
            para: c.para,
            control: c.control,
            properties: strip(
              this.call("getTableProperties", c.sec, c.para, c.control),
            ),
          },
        ]),
      ).values(),
    ];
    const nestedCells = model.lists
      .filter((l: any) => l.isCell && l.row !== undefined && l.hostListId !== 0 && !unaddressable.has(l.listId))
      .map((l: any) => {
        const p = this.listPosition(l, model.lists);
        return {
          position: p,
          row: l.row,
          col: l.col,
          rowSpan: l.rowSpan,
          colSpan: l.colSpan,
          dimensions: this.call(
            "getTableDimensionsByPath",
            p.sec,
            p.para,
            this.path(p),
          ),
          paragraphs: Array.from({ length: this.count(p) }, (_, n) =>
            paragraph(withPara(p, n)),
          ),
        };
      });
    // Control array indices are transient addresses: export may prepend
    // SectionDef/ColDef to the first paragraph. Compare table order/ownership,
    // retaining every table/cell/text/style/geometry value in the projection.
    const ordinal = (
      sec: number,
      host: number,
      para: number,
      control: number,
    ) => {
      const controls: number[] = [
        ...new Set<number>(
          model.lists
            .filter(
              (l: any) =>
                l.isCell &&
                l.row !== undefined &&
                l.sectionIndex === sec &&
                l.hostListId === host &&
                l.hostPara === para,
            )
            .map((l: any) => l.controlIndex),
        ),
      ].sort((a, b) => a - b);
      const index = controls.indexOf(control);
      if (index < 0) {
        // Non-table cell-like containers keep their existing strict address.
        if (
          model.lists.some(
            (l: any) =>
              l.isCell &&
              l.row === undefined &&
              l.sectionIndex === sec &&
              l.hostListId === host &&
              l.hostPara === para &&
              l.controlIndex === control,
          )
        )
          return control;
        throw Error("의미 검사 표 소유 경로가 없습니다.");
      }
      return index;
    };
    const semanticPosition = (p: Position): Position => {
      if (p.kind !== "cell") return p;
      let host = 0,
        para = p.para;
      const path = cellPath(p).map((step) => {
        const controlIndex = ordinal(p.sec, host, para, step.controlIndex);
        const cell = model.lists.find(
          (l: any) =>
            l.isCell &&
            l.row !== undefined &&
            l.sectionIndex === p.sec &&
            l.hostListId === host &&
            l.hostPara === para &&
            l.controlIndex === step.controlIndex &&
            l.cellIndex === step.cellIndex,
        );
        if (!cell) throw Error("의미 검사 셀 소유 경로가 없습니다.");
        host = cell.listId;
        para = step.cellParaIndex;
        return { ...step, controlIndex };
      });
      return {
        ...p,
        control: path.at(-1)!.controlIndex,
        ...(p.ancestors?.length ? { ancestors: path.slice(0, -1) } : {}),
      };
    };
    // Retain the former rejection unless Core can independently serialize each
    // entire owned graph. Compare exact closed-fragment bytes before/after cold;
    // do not drop inaccessible descendants from exportChecked's proof.
    let ownedGraphs:unknown[]|undefined;
    if(unaddressable.size){
      try{
        const rows=fragmentClipboardObjects(this),selected=new Set<(typeof rows)[number]>();
        for(const owner of requiredOwners.values()){
          const row=rows.find(r=>r.sec===owner.sectionIndex&&r.control===owner.controlIndex&&
            (owner.hostListId===0?r.focus.kind==='body'&&r.para===owner.hostPara:
              r.focus.kind==='cell'&&r.focus.cellPara===owner.hostPara&&this.list(r.focus).listId===owner.hostListId));
          if(!row)throw Error('표를 소유한 전체 개체 그래프를 정확히 연결할 수 없습니다.');
          selected.add(row);
        }
        ownedGraphs=[...selected].map(row=>{
          const clip=captureFragmentObject(this,row);
          try{return {owner:semanticPosition(row.focus),fragment:Array.from(clip.toFragmentBytes())};}
          finally{clip.free();}
        });
        if(!ownedGraphs.length)throw Error('닫힌 개체 그래프가 없습니다.');
      }
      catch(e){throw new UnsupportedTableOwner(`복합 개체의 전체 보존 검사를 수행할 수 없습니다: ${String(e)}`);}
    }
    const captions=captionCatalog(this).map(v=>({...v,paragraphs:v.paragraphs.map(p=>({...p,properties:strip(p.properties),chars:p.chars.map(strip)}))}));
    const notes=noteCatalog(this).map(v=>({...v,properties:v.properties.map(strip)}));
    return {
      ...(notes.length?{notes}:{}),
      ...(captions.length?{captions}:{}),
      ...(ownedGraphs?{ownedGraphs}:{}),
      body: body.map((p: any) => ({
        ...p,
        inlineTables: p.inlineTables.map((t: any) => ({
          ...t,
          control: ordinal(p.sec, 0, p.para, t.control),
        })),
      })),
      cells: cells.map((c: any) => ({
        ...c,
        control: ordinal(c.sec, 0, c.para, c.control),
      })),
      tables: tables.map((t: any) => ({
        ...t,
        control: ordinal(t.sec, 0, t.para, t.control),
      })),
      ...(nestedCells.length
        ? {
            nestedCells: nestedCells.map((c: any) => ({
              ...c,
              position: semanticPosition(c.position),
            })),
          }
        : {}),
    };
  }
