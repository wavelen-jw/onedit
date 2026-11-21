import {AIError,reportBudget} from './contract.js';
import type {NativeDocumentPlan} from '../ai-merged-grid.js';

export function documentWork(plan:NativeDocumentPlan):number {
 let units=plan.blocks.length, bytes=0;
 const encoder=new TextEncoder();
 const count=(text:string)=>{bytes+=encoder.encode(text).byteLength;units++;};
 for(const block of plan.blocks){
  if(block.kind==='merged-grid'){
   units+=4*block.rowCount*block.colCount;
   for(const cell of block.cells)count(cell.text);
  }else if(block.kind==='table'){
   for(const row of block.rows)for(const cell of row){
    units+=4;
    for(const run of cell)count(run.text);
   }
  }else{
   if(block.prefix)count(block.prefix);
   for(const run of block.runs)count(run.text);
  }
  if(units>reportBudget.work||bytes>reportBudget.utf8Bytes)
   throw new AIError('CONTENT_LIMIT_EXCEEDED','보고서의 텍스트 또는 표·문단 조판량이 한 번에 처리할 수 있는 범위를 넘었습니다.');
 }
 if(plan.blocks.length>reportBudget.markdownBlocks)
  throw new AIError('CONTENT_LIMIT_EXCEEDED','보고서의 미리보기 구조가 한 번에 처리할 수 있는 범위를 넘었습니다.');
 return units;
}
