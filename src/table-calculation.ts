import type {RhwpAdapter} from './adapter.js';
import {copy,nested,type Selection} from './model.js';
export type TableCalculation={kind:'table-calculation';operation:'SUM'|'AVG'|'PRODUCT';axis:'row'|'column'|'formula';formula?:string};
const address=(row:number,col:number)=>{let name='';for(let n=col+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name+(row+1);};
// Existing Core evaluates and writes plain values. No formula field, cache or
// automatic recalculation is invented. The UI discloses this before applying.
export function calculationPlan(a:RhwpAdapter,s:Selection,c:TableCalculation){
 if(!c||c.kind!=='table-calculation'||!['SUM','AVG','PRODUCT'].includes(c.operation)||!['row','column','formula'].includes(c.axis)||Object.keys(c).some(k=>!['kind','operation','axis','formula'].includes(k)))throw Error('계산 요청을 확인하세요.');
 const p=s.focus;if(p.kind!=='cell'||nested(p)||(s.kind!=='caret'&&s.kind!=='cells'))throw Error('일반 표의 빈 결과 셀 또는 연속 셀 블록에서 실행하세요.');
 a.validate(p);a.assertEditable(p);const all=a.cells(p);
 if(!all.length||new Set(all.map(x=>x.cellIdx)).size!==all.length||all.some(x=>x.rowSpan!==1||x.colSpan!==1))throw Error('병합·분할·반복 없는 일반 표에서 계산하세요.');
 const source=(cell:number)=>{const q={...p,cell,cellPara:0,offset:0};a.validate(q);a.assertEditable(q);a.assertTextOnly(q);if(a.count(q)!==1)throw Error('한 문단으로 된 셀에서 계산하세요.');return a.text(q);};
 const focus=all.find(x=>x.cellIdx===p.cell);if(!focus)throw Error('정확한 결과 셀을 찾을 수 없습니다.');
 const writes:{cell:number;row:number;col:number;formula:string;value:number;text:string}[]=[];
 const add=(target:typeof focus,inputs:typeof all,formula?:string)=>{
  if(source(target.cellIdx)!=='')throw Error('결과를 넣을 셀은 비워 두세요. 기존 내용은 덮어쓰지 않습니다.');
  for(const x of inputs)source(x.cellIdx);
  const f=formula??`=${c.operation}(${address(inputs[0].row,inputs[0].col)}:${address(inputs[inputs.length-1].row,inputs[inputs.length-1].col)})`;
  const result=a.call('evaluateTableFormula',p.sec,p.para,p.control,target.row,target.col,f,false);
  if(result.ok!==true||!Number.isFinite(result.result))throw Error('계산 결과를 확인할 수 없습니다.');
  const value=result.result as number,text=Number.isInteger(value)&&Math.abs(value)<1e15?String(value):String(value);
  writes.push({cell:target.cellIdx,row:target.row,col:target.col,formula:f,value,text});
 };
 if(s.kind==='caret'){
  if(c.axis==='formula'){if(typeof c.formula!=='string'||c.formula.length>1024||!/^=[\x20-\x7e]+$/.test(c.formula))throw Error('=로 시작하는 계산식을 입력하세요.');for(const x of all)source(x.cellIdx);add(focus,[],c.formula);}
  else{const inputs=all.filter(x=>c.axis==='row'?x.row===focus.row&&x.col<focus.col:x.col===focus.col&&x.row<focus.row).sort((a,b)=>c.axis==='row'?a.col-b.col:a.row-b.row);if(!inputs.length)throw Error('현재 셀의 왼쪽 또는 위에 계산할 셀이 없습니다.');add(focus,inputs);}
 }else{
  if(c.axis==='formula')throw Error('직접 계산식은 빈 결과 셀에 커서를 놓고 입력하세요.');
  const anchor=all.find(x=>x.cellIdx===s.anchor.cell);if(!anchor)throw Error('셀 블록 시작점을 찾을 수 없습니다.');
  const left=Math.min(anchor.col,focus.col),right=Math.max(anchor.col,focus.col),top=Math.min(anchor.row,focus.row),bottom=Math.max(anchor.row,focus.row);
  if(c.axis==='row'){
   if(right===left)throw Error('입력 셀과 오른쪽 빈 결과 셀을 함께 선택하세요.');
   for(let row=top;row<=bottom;row++){const cells=all.filter(x=>x.row===row&&x.col>=left&&x.col<=right).sort((a,b)=>a.col-b.col);if(cells.length!==right-left+1)throw Error('연속된 셀 블록을 선택하세요.');add(cells[cells.length-1],cells.slice(0,-1));}
  }else{
   if(bottom===top)throw Error('입력 셀과 아래 빈 결과 셀을 함께 선택하세요.');
   for(let col=left;col<=right;col++){const cells=all.filter(x=>x.col===col&&x.row>=top&&x.row<=bottom).sort((a,b)=>a.row-b.row);if(cells.length!==bottom-top+1)throw Error('연속된 셀 블록을 선택하세요.');add(cells[cells.length-1],cells.slice(0,-1));}
  }
 }
 return {writes,apply:()=>{for(const w of writes){const q={...p,cell:w.cell,cellPara:0,offset:0};const before=a.paraProps(q),props=a.cellProps(q);a.call('evaluateTableFormula',p.sec,p.para,p.control,w.row,w.col,w.formula,true);if(a.text(q)!==w.text||JSON.stringify(a.paraProps(q))!==JSON.stringify(before)||JSON.stringify(a.cellProps(q))!==JSON.stringify(props))throw Error('계산 결과 또는 셀·문단 서식이 달라 변경을 취소했습니다.');}return copy(s);}};
}
