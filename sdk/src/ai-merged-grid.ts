export type MergedGridCell = Readonly<{
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
}>;
