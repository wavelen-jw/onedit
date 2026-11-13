import type {Interaction} from './interaction.js';
import {copy,type Position} from './model.js';

/** New ordinary Markdown tables only. Transfer unused short-column width with
 * the same adjacent-track Commands as Alt+arrows; keep outer width and padding.
 * Native runs measure the current fonts. This is not source-HTML fidelity or a
 * resize policy for opened/authored tables. */
export function fitMarkdownTable(editor:Interaction,p:Extract<Position,{kind:'cell'}>){
  const a=editor.adapter,skip=(reason:string)=>({admitted:false,reason}),all=a.cells(p);
  if(p.ancestors?.length||!all.length||all.length>400||all.some(c=>c.colSpan!==1||c.rowSpan!==1||c.pageIndex!==all[0].pageIndex))return skip('complex-or-split-table');
  const dims=a.call('getTableDimensions',p.sec,p.para,p.control),cols=dims.colCount,rows=dims.rowCount;
  if(cols<2||cols>12||rows*cols!==all.length)return skip('not-ordinary-grid');
  const tableProps=a.call('getTableProperties',p.sec,p.para,p.control),total=tableProps.tableWidth;
  const widths=Array.from({length:cols},(_,col)=>a.cellProps({...p,cell:all.find(c=>c.row===0&&c.col===col)!.cellIdx}).width as number);
  if(!Number.isSafeInteger(total)||total<=0||widths.some(w=>!Number.isSafeInteger(w)||w<=0)||widths.reduce((x,y)=>x+y,0)!==total)return skip('unclosed-widths');
  const runs=a.runs(all[0].pageIndex),need=Array(cols).fill(0),original=all.map(c=>{
    const cell={...p,cell:c.cellIdx,cellPara:0,offset:0},props=a.cellProps(cell);
    return {cell,c,props,text:a.text(cell)};
  });
  for(const {cell,c,props,text}of original){
    if(props.width!==widths[c.col]||a.doc.getCellParagraphCount(p.sec,p.para,p.control,c.cellIdx)!==1||/[\r\n\t]/.test(text)||a.call('getCellTextDirection',p.sec,p.para,p.control,c.cellIdx)!==0)return skip('complex-cell');
    const owned=runs.filter(r=>r.secIdx===p.sec&&r.parentParaIdx===p.para&&r.controlIdx===p.control&&r.cellIdx===c.cellIdx&&r.cellParaIdx===0&&r.text).sort((x,y)=>x.charStart-y.charStart);
    if(owned.map(r=>r.text).join('')!==text||owned.some(r=>!Number.isFinite(r.w)||r.w<0))return skip('uncertified-text-width');
    // Four CSS px breathing room plus the actual unchanged native cell padding.
    // Rounding upward avoids narrowing below native serialized advances.
    const paddingSource=props.applyInnerMargin?props:tableProps,padding=paddingSource.paddingLeft+paddingSource.paddingRight;
    if(!Number.isSafeInteger(padding)||padding<0)return skip('unknown-padding');
    need[c.col]=Math.max(need[c.col],Math.ceil(owned.reduce((n,r)=>n+r.w,0)*75)+padding+300);
  }
  const recipient=need.indexOf(Math.max(...need));
  if(need[recipient]<=total/4)return skip('no-long-content-column');
  const transfers=widths.map((w,col)=>col!==recipient&&need[col]<=total/4?Math.max(0,Math.floor((w-need[col])/300)*300):0);
  if(!transfers.some(Boolean))return skip('no-unused-short-column-width');
  const before=copy(editor.selection),typing=copy(editor.typing),decline=Symbol('table-fit-declined');let detail='';
  try{
    editor.selection=editor.history.transact('markdown-table-width',before,()=>{
      for(let col=0;col<cols;col++)if(transfers[col]){
        const direction=col<recipient?1:-1;
        for(let at=col;at!==recipient;at+=direction){
          const boundary=direction===1?at:at-1,first=all.find(c=>c.row===0&&c.col===boundary)!,focus={...p,cell:first.cellIdx,cellPara:0,offset:0};
          editor.selection={kind:'cells',anchor:focus,focus,phase:1};
          try{editor.execute({type:'resize',redistribute:'x',trackBoundary:true,width:direction===1?-transfers[col]:transfers[col],height:0},editor.capture());}
          catch(error){detail=String(error);throw decline;}
        }
      }
      const after=a.cells(p);
      if(a.call('getTableProperties',p.sec,p.para,p.control).tableWidth!==total||after.length!==all.length){detail='outer-width-or-owner';throw decline;}
      for(const {cell,c,props,text}of original){
        const next=a.cellProps(cell),frame=after.find(n=>n.cellIdx===c.cellIdx);
        if(!frame||a.text(cell)!==text||next.height!==props.height||next.paddingLeft!==props.paddingLeft||next.paddingRight!==props.paddingRight||next.paddingTop!==props.paddingTop||next.paddingBottom!==props.paddingBottom){detail='content-or-padding';throw decline;}
        const owned=a.runs(frame.pageIndex).filter(r=>r.secIdx===p.sec&&r.parentParaIdx===p.para&&r.controlIdx===p.control&&r.cellIdx===c.cellIdx&&r.text);
        if(owned.some(r=>r.x<frame.x||r.x+r.w>frame.x+frame.w||r.y<frame.y||r.y+r.h>frame.y+frame.h)){detail='cell-containment';throw decline;}
      }
      return before;
    });
    return {admitted:true,reason:'native-short-column-transfer',beforeWidths:widths,afterWidths:widths.map((w,col)=>col===recipient?w+transfers.reduce((x,y)=>x+y,0):w-transfers[col]),requiredWidths:need};
  }catch(error){editor.selection=before;if(error!==decline)throw error;return {...skip('native-resize-refused'),detail};}
  finally{editor.typing=typing;}
}
