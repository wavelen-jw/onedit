import type { TablePropertyMember } from "./table-property-projection.js";
import type { Interaction } from './interaction.js';
import type { CellBox, Props, Selection } from './model.js';
import { nested } from './model.js';
import { cellBorderPlan } from './cell-border-plan.js';
import { displayed, mixed, type FormatState } from './formatting.js';

const border = /^border(Left|Right|Top|Bottom)\.(type|width|color)$/;
// UI-only lowering: native B/F scope is the selected rectangle, not every
// selected cell's perimeter. Keep the existing atomic per-cell Command/setters.
export function cellBlockMasks(all: CellBox[], ids: number[]) {
  cellBorderPlan(all, ids, {edges:[], style:{}}); // Existing ordinary-cell guard.
  const cells = [...new Map(all.map(c => [c.cellIdx,c])).values()].filter(c => ids.includes(c.cellIdx));
  const rows = Math.max(...cells.map(c=>c.row)) - Math.min(...cells.map(c=>c.row)) + 1;
  const cols = Math.max(...cells.map(c=>c.col)) - Math.min(...cells.map(c=>c.col)) + 1;
  if (rows * cols !== cells.length || new Set(cells.map(c=>`${c.row}:${c.col}`)).size !== cells.length)
    throw Error('하나의 셀 범위는 빈틈 없는 일반 셀 사각 블록만 지원합니다. 기존 선택·원본을 유지합니다.');
  // These type0 keys are boundary masks only, never default line values.
  return cellBorderPlan(all, ids, {edges:['top','bottom','left','right'],style:{type:0}});
}
export function cellBlockPlan(all: CellBox[], ids: number[], props: Props) {
  const masks=cellBlockMasks(all,ids);
  if(Object.keys(props).some(key=>key!=='background'&&!border.test(key)))
    throw Error('하나의 셀 범위는 방향별 바깥선·단색 배경만 변경합니다. 셀별 속성은 L/C를 사용하세요.');
  return new Map(ids.map(id=>[id,Object.fromEntries(Object.entries(props).filter(([key])=>
    key==='background'||Object.hasOwn(masks.get(id)??{},key.replace(/\.(type|width|color)$/,'.type'))))]));
}
type PreparedBlockValues = {cells: CellBox[]; all: CellBox[]; read: (id: number) => TablePropertyMember["values"]};
export function cellBlockState(editor: Interaction, s: Selection, prepared?: PreparedBlockValues): FormatState {
  if(s.kind!=='cells'||s.focus.kind!=='cell'||nested(s.focus))
    throw Error('하나의 셀 범위는 일반 셀 블록에서 사용하세요. 기존 소유권·원본은 유지합니다.');
  const cells=prepared?.cells ?? editor.cells(s),ids=cells.map(c=>c.cellIdx),masks=cellBlockMasks(prepared?.all ?? editor.adapter.cells(s.focus),ids);
  const samples=cells.map(c=>{
    const p={...s.focus,cell:c.cellIdx,cellPara:0,offset:0};editor.adapter.validate(p);
    const raw=prepared ? prepared.read(c.cellIdx) : editor.adapter.cellProps(p);
    const state:FormatState=displayed('cell',raw);
    if(raw.fillType!=='solid'&&raw.fillType!=='none')state.background=undefined;
    return {id:c.cellIdx,state};
  });
  const result:FormatState={},mixedFields:string[]=[],unavailableFields:string[]=[];
  for(const key of ['background',...['Left','Right','Top','Bottom'].flatMap(side=>['type','width','color'].map(k=>`border${side}.${k}`))]) {
    const relevant=samples.filter(v=>key==='background'||Object.hasOwn(masks.get(v.id)??{},key.replace(/\.(type|width|color)$/,'.type')));
    const summary=mixed(relevant.map(v=>({[key]:v.state[key]})) as Props[]);
    result[key]=summary[key];
    mixedFields.push(...(summary.__mixedFields as string[]??[]));
    unavailableFields.push(...(summary.__unavailableFields as string[]??[]));
  }
  result.__mixedFields=mixedFields;result.__unavailableFields=unavailableFields;
  return result;
}
