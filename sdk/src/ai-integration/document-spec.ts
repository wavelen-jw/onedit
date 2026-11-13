import type {MergedGridCell} from '../ai-merged-grid.js';
type Paragraph={kind:'heading';styleId:'title'|'subtitle';text:string}|{kind:'paragraph';styleId:'body';text:string};
export type DocumentSpec={templateId:'public-report';templateVersion:'1';blocks:(Paragraph|
 {kind:'list';styleId:'bullet';items:string[]}|{kind:'table';styleId:'table';rows:string[][]})[]};
export type GridSpec={rowCount:number;colCount:number;cells:MergedGridCell[]};
export type HostDocumentSpec=Omit<DocumentSpec,'blocks'>&{blocks:(DocumentSpec['blocks'][number]|
 {kind:'table';styleId:'table';grid:GridSpec})[]};
