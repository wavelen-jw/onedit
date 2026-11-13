import type { ClipboardMarkdownTable } from "./clipboard-markdown-table.js";

// Body offsets count inline objects as one logical slot; cell offsets count Unicode scalars.
// getCursorRect consumes logical offsets, hitTest/format APIs use text offsets.
export type CellPathEntry = {
  controlIndex: number;
  cellIndex: number;
  cellParaIndex: number;
};
export type Position =
  | {
      kind: "body";
      sec: number;
      para: number;
      offset: number;
    }
  | {
      kind: "cell";
      sec: number;
      para: number;
      control: number;
      cell: number;
      cellPara: number;
      offset: number;
      // Ancestor cells retain the exact paragraph hosting the next table.
      // The leaf is held in control/cell/cellPara so spread navigation stays safe.
      ancestors?: CellPathEntry[];
    };
export type Selection =
  | {
      kind: "caret";
      focus: Position;
    }
  | {
      kind: "text";
      anchor: Position;
      focus: Position;
    }
  | {
      kind: "cells";
      anchor: Extract<
        Position,
        {
          kind: "cell";
        }
      >;
      focus: Extract<
        Position,
        {
          kind: "cell";
        }
      >;
      phase: 1 | 2 | 3;
    }
  | {
      kind: "table";
      focus: Extract<
        Position,
        {
          kind: "cell";
        }
      >;
    }
  | {
      kind: "object";
      focus: Position;
      control: number;
      textbox?: import("./textbox-edit.js").TextboxCaret;
    };
// Live-document references only; never serialized into document semantics/HWPX.
export type ParagraphTarget = {
  targetId: string;
  sectionIndex: number;
  parentParaIndex: number;
  path: CellPathEntry[];
  charLength: number;
};
export type SelectionReference = {
  documentId: string;
  selection: Selection;
  focus?: { target: ParagraphTarget; offset: number };
  anchor?: { target: ParagraphTarget; offset: number };
};
export type Box = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CellBox = {
  pageIndex: number;
  cellIdx: number;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Run = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  charX: number[];
  secIdx: number;
  paraIdx: number;
  charStart: number;
  parentParaIdx?: number;
  controlIdx?: number;
  cellIdx?: number;
  cellParaIdx?: number;
  cellPath?: CellPathEntry[];
};
export type TabStop = { position: number; type: number; fill: number };
export type Props = Record<
  string,
  string | number | boolean | number[] | TabStop[]
>;
export type Command =
  | {type:"textbox-edit";change:import("./textbox-edit.js").TextboxEdit}
  | {type:'remaining-edit';change:import('./remaining-shortcut-commands.js').RemainingEdit}
  | {type:'table-object';action:'transpose'|'format';props?:Props}
  | {type:'object-ungroup'}
  | {type:'paper';change:import('./shortcut-supported2.js').PaperChange}
  | {type:'cell-equal';axis:'width'|'height'}
  | {type:'paragraph-move';direction:-1|1}
  | { type: "format-copy"; sample: import("./format-copy.js").FormatCopySample }
  | {type:"script";mode:"superscript"|"subscript"|"normal"}
  | {type:"toggle-char";property:"italic"|"strikethrough"}
  | {type:"underline"}
  | {type:"delete-line-end"}
  | {type:"delete-current-line"}
  | {type:"table-autofill";repeat?:boolean}
  | {type:"delete-word";backward:boolean}
  | {type:"table-split";rows:number;cols:number;equalHeight:boolean}
  | {type:"control-key";action:import("./control-shortcuts.js").ControlKey}
  | {type:"control-offset";dx:number;dy:number}
  | {type:"list-level"; direction: -1 | 1}
  | {type:"line-spacing-step"; direction: -1 | 1}
  | {type:"header-footer";change:import("./header-footer.js").HeaderFooterChange}
  | {type:"page-number";kind:import("./page-number.js").PageNumberKind}
  | {type:"page-break"}
  | {type:"column-break"}
  | {type:"column-definition-break"}
  | {type:"columns";change:import("./columns.js").ColumnChange}
  | { type: "textbox-insert"; change: import("./shapes.js").TextboxInsert }
  | { type: "shape-size"; change: import("./shapes.js").ShapeSize }
  | { type: "picture"; change: import("./pictures.js").PictureChange }
  | { type: "cut-object"; source: import("./object-clipboard.js").ClipboardObjectSource }
  | { type: "paragraph-relative"; change: import("./paragraph-adjustments.js").ParagraphAdjustment }
  | { type: "paragraph-current-position" }
  | { type: "numbering-restart"; change: import("./numbering-restart.js").NumberRestart }
  | { type: "style-manage"; request: import("./style-definitions.js").StyleMutation }
  | {type:"char-relative"; change: import("./character-increments.js").RelativeCharacterChange}
  | {type:"paragraph-list"; list: import("./paragraph-lists.js").ParagraphListChange; props?: Props}
  | { type: "style"; id: number; resetDirect?: boolean }
  | {
      type: "insert";
      text: string;
    }
  | {
      type: "delete";
      backward: boolean;
    }
  | {
      type: "break";
      // Existing Core newline character; keep this paragraph and its properties.
      soft?: boolean;
    }
  | {
      type: "char";
      props: Props;
    }
  | {
      type: "paragraph";
      props: Props;
    }
  | {
      type: "cell";
      props: Props;
      // UI intent only; lowered to existing cell props before Core consumption.
      borders?: import("./cell-border-plan.js").CellBorderDraft;
      cellScope?: 'block'; // UI-only B/F rectangle scope; never sent to Core.
    }
  | {
      type: "bold";
    }
  | {
      type: "clear-cells";
    }
  | {
      type: "table-edit";
      count?: number;
      after?: boolean;
      operation:
        | "merge"
        | "split"
        | "row-add"
        | "row-delete"
        | "col-add"
        | "col-delete";
    }
  | {
      type: "insert-table";
      inline?: boolean;
      rows: number;
      cols: number;
    }
  | {
      type: "resize";
      /** Ordinary internal boundary: compensate the immediately adjacent track. */
      redistribute?: "x" | "y";
      /** Existing localResize: only the selected cell and its one neighbor. */
      cellOnly?: true;trackBoundary?:true;
      nativeTrackKeys?: true;
      nativeTrackRequired?: true;
      nativeEdge?: import('./table-track-resize.js').NativeResizeEdge;
      width: number;
      height: number;
    }
  | {
      type: "paste";
      text: string;
      html?: string;
      structured?: string;
      markdownTable?: ClipboardMarkdownTable;
    };
export const start = (): Position => ({
  kind: "body",
  sec: 0,
  para: 0,
  offset: 0,
});
export const copy = <T>(v: T): T => structuredClone(v);
// Core JSON and render paths may enumerate the same keys in different orders.
// Compare path coordinates structurally; object insertion order is not identity.
const sameAncestors = (a: CellPathEntry[] = [], b: CellPathEntry[] = []) =>
  a.length === b.length &&
  a.every(
    (step, n) =>
      step.controlIndex === b[n].controlIndex &&
      step.cellIndex === b[n].cellIndex &&
      step.cellParaIndex === b[n].cellParaIndex,
  );
export const sameContainer = (a: Position, b: Position) =>
  a.kind === b.kind &&
  a.sec === b.sec &&
  (a.kind === "body" ||
    (b.kind === "cell" &&
      a.para === b.para &&
      a.control === b.control &&
      sameAncestors(a.ancestors, b.ancestors) &&
      a.cell === b.cell));
export const sameTable = (a: Position, b: Position) =>
  a.kind === "cell" &&
  b.kind === "cell" &&
  a.sec === b.sec &&
  a.para === b.para &&
  a.control === b.control &&
  sameAncestors(a.ancestors, b.ancestors);
export const nested = (p: Position) =>
  p.kind === "cell" && !!p.ancestors?.length;
export const cellPath = (p: Extract<Position, { kind: "cell" }>) => [
  ...(p.ancestors ?? []),
  { controlIndex: p.control, cellIndex: p.cell, cellParaIndex: p.cellPara },
];
export const paraIndex = (p: Position) =>
  p.kind === "cell" ? p.cellPara : p.para;
export const samePosition = (a: Position, b: Position) =>
  sameContainer(a, b) && paraIndex(a) === paraIndex(b) && a.offset === b.offset;
export function ordered(a: Position, b: Position): [Position, Position] {
  if (!sameContainer(a, b))
    throw Error("서로 다른 편집 영역의 텍스트 선택은 지원하지 않습니다.");
  return paraIndex(a) < paraIndex(b) ||
    (paraIndex(a) === paraIndex(b) && a.offset <= b.offset)
    ? [a, b]
    : [b, a];
}
export const withPara = (p: Position, n: number): Position =>
  p.kind === "cell" ? { ...p, cellPara: n } : { ...p, para: n };
