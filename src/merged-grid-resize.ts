import type {RhwpAdapter} from './adapter.js';
import {nested, type Command, type Position, type Selection} from './model.js';
import {exactCellFrames} from './resize-height-bases.js';
import {UnsupportedTableOperation} from './table-capability.js';

type Cell=ReturnType<RhwpAdapter['cells']>[number];
type Owner=Extract<Position,{kind:'cell'}>;
const refuse=(message:string):never=>{throw new UnsupportedTableOperation('resize-merged-grid',message);};
const stable=(value:Record<string,unknown>,omit:string[])=>JSON.stringify(Object.fromEntries(Object.entries(value).filter(([k])=>!omit.includes(k))));
const integer=(n:number)=>Number.isSafeInteger(n)&&n>=200&&n<=2147483647;

// A closed, single-frame merged grid is a separate authenticated native path.
// Rounded bboxes identify owners only; all dimensions below come from lossless
// current SVG clips and exact stored HU. No bbox inversion or global epsilon.
function frame(a:RhwpAdapter,p:Owner){
  const grid=a.call('getTableDimensions',p.sec,p.para,p.control),all=a.cells(p);
  if(!Number.isSafeInteger(grid.rowCount)||!Number.isSafeInteger(grid.colCount)||grid.rowCount<1||grid.colCount<1||
    all.length!==grid.cellCount||new Set(all.map(c=>c.cellIdx)).size!==all.length)refuse('불완전하거나 분할된 병합 표의 프레임은 조절하지 않습니다.');
  const geometry=exactCellFrames(a,p,all.map(c=>c.cellIdx));
  if(!geometry||new Set([...geometry.cells.values()].map(c=>c.box.pageIndex)).size!==1)refuse('병합 표의 정확한 단일 프레임을 확인할 수 없습니다.');
  const props=new Map(all.map(c=>[c.cellIdx,a.cellProps({...p,cell:c.cellIdx})]));
  const rows=new Map<number,{hu:number;height:number;y:number}>(),cols=new Map<number,number>();
  for(const c of all){
    if(![c.cellIdx,c.row,c.col,c.rowSpan,c.colSpan].every(Number.isSafeInteger)||c.row<0||c.col<0||c.rowSpan<1||c.colSpan<1||
      c.row+c.rowSpan>grid.rowCount||c.col+c.colSpan>grid.colCount)refuse('병합 셀 주소·범위가 유효한 격자와 일치하지 않습니다.');
    const value=props.get(c.cellIdx)!,g=geometry!.cells.get(c.cellIdx)!;
    if(!integer(value.width)||!integer(value.height)||value.cellProtect||value.textDirection!==0)refuse('보호되거나 다른 글 방향인 병합 셀은 조절하지 않습니다.');
    if(c.rowSpan===1){const r=rows.get(c.row);if(r&&(r.hu!==g.hu||r.height!==g.rect[3]||r.y!==g.rect[1]))refuse('같은 행의 실제 높이·위치가 일치하지 않습니다.');rows.set(c.row,{hu:g.hu,height:g.rect[3],y:g.rect[1]});}
    if(c.colSpan===1){const width=cols.get(c.col);if(width!==undefined&&width!==value.width)refuse('같은 열의 선언 너비가 일치하지 않습니다.');cols.set(c.col,value.width);}
  }
  // No rows*columns allocation. Require an existing single-track anchor for
  // every track before scanning the actual cell intervals, including spans.
  if(rows.size!==grid.rowCount||cols.size!==grid.colCount)refuse('병합 표의 행·열 기준 셀이 부족합니다.');
  const rowList=Array.from({length:grid.rowCount},(_,r)=>rows.get(r)!),widths=Array.from({length:grid.colCount},(_,c)=>cols.get(c)!);
  if(rowList.some(r=>!r||!integer(r.hu))||widths.some(w=>!integer(w)))refuse('병합 표 행·열의 정확한 단위를 확인할 수 없습니다.');
  for(let r=0;r<grid.rowCount;r++){
    const active=all.filter(c=>c.row<=r&&r<c.row+c.rowSpan).sort((a,b)=>a.col-b.col);let col=0;
    for(const c of active){if(c.col!==col)refuse('병합 격자에 빈칸 또는 중복 영역이 있습니다.');col+=c.colSpan;}
    if(col!==grid.colCount)refuse('병합 격자가 전체 열을 덮지 않습니다.');
  }
  const total= a.call('getTableProperties',p.sec,p.para,p.control),page=[...geometry!.cells.values()][0].box.pageIndex;
  const left=Math.min(...[...geometry!.cells.values()].map(f=>f.rect[0])),right=Math.max(...[...geometry!.cells.values()].map(f=>f.rect[0]+f.rect[2]));
  for(const c of all){const g=geometry!.cells.get(c.cellIdx)!,v=props.get(c.cellIdx)!;
    if(v.width!==widths.slice(c.col,c.col+c.colSpan).reduce((n,w)=>n+w,0)||Math.round(g.rect[2]*geometry!.units)!==v.width||
      g.hu!==rowList.slice(c.row,c.row+c.rowSpan).reduce((n,r)=>n+r.hu,0))refuse('병합 셀의 선언·실제 span 합계가 일치하지 않습니다.');
  }
  if(total.tableWidth!==widths.reduce((n,w)=>n+w,0)||total.tableHeight!==rowList.reduce((n,r)=>n+r.hu,0))refuse('압축되거나 닫히지 않은 병합 표의 전체 프레임은 조절하지 않습니다.');
  return{grid,all,props,geometry:geometry!,rows:rowList,widths,total,page,left,right};
}

export function prepareMergedGridResize(a:RhwpAdapter,s:Selection,command:Extract<Command,{type:'resize'}>,selection:Cell[]){
  const p=s.focus;
  if(!a.mergedGridCandidateIdentified||p.kind!=='cell'||nested(p)||s.kind!=='cells'||command.redistribute||command.cellOnly)return;
  const all=a.cells(p);if(!all.some(c=>c.rowSpan>1||c.colSpan>1))return;
  const vertical=command.width===0&&command.height!==0,horizontal=command.height===0&&command.width!==0&&command.trackBoundary;
  if(!vertical&&!horizontal)return;
  if(![command.width,command.height].every(Number.isSafeInteger))refuse('병합 표 증분은 정확한 정수 HU여야 합니다.');
  const axis=vertical?'row':'col',span=vertical?'rowSpan':'colSpan',tracks=new Set<number>();
  for(const c of selection)if(c[span]===1)tracks.add(c[axis]);
  if(!tracks.size)refuse('병합 셀만 선택한 조절은 변경할 행·열이 미확정입니다. 비병합 기준 셀을 선택하세요.');
  const before=frame(a,p);
  if(selection.some(c=>!before.all.some(b=>b.cellIdx===c.cellIdx)))refuse('선택된 병합 셀의 현재 소유자가 없습니다.');
  // A selected spanning cell must have explicit anchors for each of its tracks.
  // Crossing siblings added below are affected data, not invented selection.
  for(const c of selection)for(let i=c[axis];i<c[axis]+c[span];i++)if(!tracks.has(i))refuse('선택 범위의 병합 행·열 기준이 모호합니다.');
  const controls=a.call<any[]>('getControls'),model=a.call('getCursorModel');
  const lists=model.lists.filter((l:any)=>l.isCell&&l.hostListId===0&&l.sectionIndex===p.sec&&l.hostPara===p.para&&l.controlIndex===p.control);
  let hostPara=p.para;for(let sec=0;sec<p.sec;sec++)hostPara+=a.doc.getParagraphCount(sec);
  const host=controls.filter(c=>c.list===0&&c.para===hostPara),ids=new Set(lists.map((l:any)=>l.listId));
  if(p.control!==0||host.length!==1||host[0].ctrlId!=='tbl'||host[0].props?.Lock||host[0].props?.SizeProtect||
    a.text({kind:'body',sec:p.sec,para:p.para,offset:0}).trim()||lists.length!==before.all.length||controls.some(c=>ids.has(c.list)))refuse('개체가 섞이거나 잠긴 병합 표의 크기 조절은 지원하지 않습니다.');
  const table=before.total;
  if(!table.treatAsChar||table.hasCaption||table.cellSpacing!==0||table.textWrap!=='TopAndBottom'||table.allowOverlap)refuse('현재 병합 표 배치의 단일 본문 흐름을 확인할 수 없습니다.');
  for(const c of before.all)a.assertEditable({...p,cell:c.cellIdx,cellPara:0,offset:0});
  const page=a.call('getPageDef',p.sec),columns=a.call('getColumnDef',p.sec),parent=a.paraProps({kind:'body',sec:p.sec,para:p.para,offset:0});
  const parentIdentity=JSON.stringify({page,columns,parent}),pageInfo=a.call('getPageInfo',before.page);
  if(horizontal){
    if(columns.columnCount!==1||page.landscape||page.marginGutter!==0||table.horzRelTo!=='Para'||table.horzAlign!=='Left'||
      !Number.isSafeInteger(table.horzOffset)||table.horzOffset<0||typeof parent.indent!=='number'||!Number.isFinite(parent.indent)||parent.indent>0||
      typeof parent.alignment!=='string'||!['left','center','right'].includes(parent.alignment)||!Number.isFinite(pageInfo.width))refuse('현재 병합 표의 가로 배치·쪽 범위를 확인할 수 없습니다.');
    const expansion=Math.max(0,command.width*tracks.size/before.geometry.units);
    // The imported table already exceeds the nominal text column. Its native
    // overfull-line alignment can stop centering, so never assume half-delta
    // recentering to admit an otherwise off-page request. Reserve the full
    // positive extent; the post-command actual page-envelope check also stays.
    // Authored offset/indent and ordinary-table parent guards are untouched.
    if(before.left-table.outerLeft/before.geometry.units<0||before.right+expansion+table.outerRight/before.geometry.units>pageInfo.width)
      throw new UnsupportedTableOperation('resize-parent-bound','병합 표 너비가 실제 쪽 범위를 초과합니다.');
  }
  const delta=vertical?command.height:command.width;
  const count=(c:Cell)=>{let n=0;for(let i=c[axis];i<c[axis]+c[span];i++)if(tracks.has(i))n++;return n;};
  const updates=before.all.filter(c=>count(c)>0).map(c=>({cellIdx:c.cellIdx,widthDelta:horizontal?delta*count(c):0,heightDelta:vertical?delta*count(c):0}));
  if(updates.some(u=>![u.widthDelta,u.heightDelta].every(Number.isSafeInteger)))refuse('병합 표 증분 합계가 유효한 HU가 아닙니다.');
  if(horizontal&&before.widths.some((w,i)=>!integer(w+(tracks.has(i)?delta:0))))refuse('열 너비 하한 또는 정수 범위를 벗어납니다.');
  const doc=a.doc,id=a.documentId,revision=a.revision;
  return{
    updates,
    apply(){if(doc!==a.doc||id!==a.documentId||revision!==a.revision)throw Error('병합 표 조절의 문서·리비전이 변경되었습니다.');a.call('resizeTableCells',p.sec,p.para,p.control,JSON.stringify(updates));},
    unchanged(){
      const after=frame(a,p),fail=():never=>{throw Error('Core 병합 격자 결과가 요청·비대상·저장 프레임과 달라 원문을 복원했습니다.');};
      if(JSON.stringify({page:a.call('getPageDef',p.sec),columns:a.call('getColumnDef',p.sec),parent:a.paraProps({kind:'body',sec:p.sec,para:p.para,offset:0})})!==parentIdentity||
        stable(before.total,['tableWidth','tableHeight'])!==stable(after.total,['tableWidth','tableHeight'])||
        before.geometry.units!==after.geometry.units||before.all.length!==after.all.length||before.grid.rowCount!==after.grid.rowCount||before.grid.colCount!==after.grid.colCount)fail();
      for(const c of before.all){const next=after.all.find(n=>n.cellIdx===c.cellIdx),old=before.props.get(c.cellIdx)!,now=after.props.get(c.cellIdx);
        if(!next||!now||['row','col','rowSpan','colSpan'].some(k=>c[k as keyof Cell]!==next[k as keyof Cell])||stable(old,['width','height'])!==stable(now,['width','height']))fail();
      }
      const same=before.all.every(c=>{const b=before.props.get(c.cellIdx)!,n=after.props.get(c.cellIdx)!;return b.width===n.width&&b.height===n.height;});
      if(same)return true; // History restores the whole snapshot and old Redo.
      if(vertical){
        if(before.total.tableWidth!==after.total.tableWidth||before.widths.some((w,i)=>w!==after.widths[i]))fail();
        const differences=after.rows.map((r,i)=>r.hu-before.rows[i].hu);
        let nonmovingRawChanged=false;
        for(let i=0;i<before.rows.length;i++){
          const change=differences[i];
          if(tracks.has(i)?delta>0?change!==delta:change<delta||change>0:change!==0)fail();
          if(!tracks.has(i)&&after.rows[i].height!==before.rows[i].height)nonmovingRawChanged=true;
        }
        for(const c of before.all){const old=before.props.get(c.cellIdx)!,now=after.props.get(c.cellIdx)!,d=differences.slice(c.row,c.row+c.rowSpan).reduce((n,d)=>n+d,0),g=before.geometry.cells.get(c.cellIdx)!,n=after.geometry.cells.get(c.cellIdx)!;
          if(now.width!==old.width||now.height!==(d===0?old.height:c.rowSpan===1?after.rows[c.row].hu:old.height+d)||g.rect[0]!==n.rect[0]||g.rect[2]!==n.rect[2])fail();
          if(d===0&&g.rect[3]!==n.rect[3])nonmovingRawChanged=true;
        }
        if(nonmovingRawChanged){
          // Only a native partial content-floor shrink can use the existing
          // same-painter/source certificate. HU, declarations and all other
          // checks above remain exact. Shifted clip subtraction need not keep
          // the old raw bits: require an independent checked source reopen to
          // reproduce EVERY full post-command coordinate, not a pixel epsilon.
          if(delta>=0||!differences.some((d,i)=>tracks.has(i)&&d>delta&&d<0))fail();
          const certificate=(f:ReturnType<typeof frame>)=>JSON.stringify({
            grid:f.all.map(({cellIdx,row,col,rowSpan,colSpan})=>({cellIdx,row,col,rowSpan,colSpan})),
            props:[...f.props],table:f.total,page:f.page,units:f.geometry.units,
            cells:[...f.geometry.cells].map(([i,c])=>[i,c.rect,c.hu]),rows:f.rows,widths:f.widths,
          });
          if(!a.withCheckedReopen(reopened=>certificate(frame(reopened,p))===certificate(after)))fail();
        }
      }else{
        if(after.total.tableWidth!==before.total.tableWidth+delta*tracks.size)fail();
        for(const c of before.all){const old=before.props.get(c.cellIdx)!,now=after.props.get(c.cellIdx)!;if(now.height!==old.height||now.width!==old.width+delta*count(c)||after.geometry.cells.get(c.cellIdx)!.hu<now.height)fail();}
        const info=a.call('getPageInfo',after.page);
        if(after.left-table.outerLeft/after.geometry.units<0||after.right+table.outerRight/after.geometry.units>info.width)fail();
      }
      return false;
    },
  };
}
export type MergedGridResizePlan=NonNullable<ReturnType<typeof prepareMergedGridResize>>;
