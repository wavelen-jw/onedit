import type { HwpDocument } from "../development/core/rhwp.js";

export class UnsupportedTableOwner extends Error {}

type PageArea = { x: number; y: number; width: number; height: number };
type TableDimensions = { rowCount: number; colCount: number; cellCount: number };

/** The native JSON fields used by the read-only layout commands. */
export type CoreLayoutResults = {
  getPageInfo: {
    pageIndex: number; pageNumber: number; sectionIndex: number;
    width: number; height: number;
    marginLeft: number; marginRight: number; marginTop: number; marginBottom: number;
    marginHeader: number; marginFooter: number; marginGutter: number;
    headerArea: PageArea; footerArea: PageArea;
    bodyLeft: number; bodyRight: number; bindingMirrored: boolean;
    pageBorderLeft: number; pageBorderRight: number; pageBorderTop: number; pageBorderBottom: number;
    columns: { x: number; width: number }[];
  };
  getPageSizeRuns: [end: number, width: number, height: number][];
  getTableDimensions: TableDimensions;
  getTableDimensionsByPath: TableDimensions;
};

export function result<T = any>(raw: string): T {
  const v = JSON.parse(raw);
  if (v?.ok === false || v?.error) throw Error(v.error ?? "Core 명령 실패");
  return v;
}

/** Raw dispatch only. The existing Adapter call owns its synchronous projection cache. */
export function invokeCore(doc: HwpDocument, method: keyof HwpDocument, args: any[]): string {
  return (doc[method] as Function).apply(doc, args);
}
