import {AIError,exact,limits} from './contract.js';
import {validateMergedGrid,type MergedGridCell,type NativeDocumentPlan} from '../ai-merged-grid.js';

export const catalog=Object.freeze({templateId:'public-report',templateVersion:'1',
 styles:Object.freeze(['title','subtitle','body','bullet','table'] as const)});
type Paragraph={kind:'heading';styleId:'title'|'subtitle';text:string}|{kind:'paragraph';styleId:'body';text:string};
export type DocumentSpec={templateId:'public-report';templateVersion:'1';blocks:(Paragraph|
 {kind:'list';styleId:'bullet';items:string[]}|{kind:'table';styleId:'table';rows:string[][]})[]};
export type GridSpec={rowCount:number;colCount:number;cells:MergedGridCell[]};
export type HostDocumentSpec=Omit<DocumentSpec,'blocks'>&{blocks:(DocumentSpec['blocks'][number]|
 {kind:'table';styleId:'table';grid:GridSpec})[]};
const invalid=()=>new AIError('INVALID_SPEC','지원되는 제목·문단·목록·일반 표와 등록된 스타일만 사용하세요.');
/** Literal structured text becomes native command runs, never HTML or Markdown
 * syntax. Both sources share the same plan execution and checked export. */
export function compileDocumentSpec(input:unknown,allowMerged=false):NativeDocumentPlan{
 if(!exact(input,['templateId','templateVersion','blocks'])||input.templateId!==catalog.templateId||input.templateVersion!==catalog.templateVersion||
  !Array.isArray(input.blocks)||!input.blocks.length)throw invalid();
 const out:NativeDocumentPlan['blocks']=[];let length=0,tables=0,cells=0;
 const bounded=(ok:boolean)=>{if(!ok)throw new AIError('CONTENT_LIMIT_EXCEEDED','공공문서 생성 한도를 넘었습니다.')};
 bounded(input.blocks.length<=limits.blocks);
 const text=(x:unknown)=>{
  if(typeof x!=='string'||/[\p{Surrogate}\u0000-\u001f\u007f\u2028\u2029]/u.test(x))throw invalid();
  length+=[...x].length;bounded(length<=limits.characters);return x;
 };
 for(const b of input.blocks){
  if(exact(b,['kind','styleId','text'])&&b.kind==='heading'&&(b.styleId==='title'||b.styleId==='subtitle')){
   const t=text(b.text);if(!t.trim())throw invalid();
   out.push({kind:'paragraph',runs:[{text:t}],role:'heading',level:b.styleId==='title'?1:2,reportRole:b.styleId});
  }else if(exact(b,['kind','styleId','text'])&&b.kind==='paragraph'&&b.styleId==='body'){
   out.push({kind:'paragraph',runs:[{text:text(b.text)}],role:'body',reportRole:'text'});
  }else if(exact(b,['kind','styleId','items'])&&b.kind==='list'&&b.styleId==='bullet'&&Array.isArray(b.items)&&b.items.length){
   bounded(out.length+b.items.length<=limits.blocks);
   for(const s of b.items){
    const t=text(s);if(!t.trim())throw invalid();
    out.push({kind:'paragraph',role:'list',level:1,reportRole:'body1',runs:[{text:t}]});
   }
  }else if(allowMerged&&exact(b,['kind','styleId','grid'])&&b.kind==='table'&&b.styleId==='table'){
   let grid;
   try{grid=validateMergedGrid(b.grid)}catch(e){
    if((e as {code?:string})?.code==='GRID_LIMIT')bounded(false);
    throw invalid();
   }
   cells+=grid.rowCount*grid.colCount;bounded(++tables<=limits.tables&&cells<=limits.cells);
   for(const cell of grid.cells)text(cell.text);
   out.push(grid);
  }else if(exact(b,['kind','styleId','rows'])&&b.kind==='table'&&b.styleId==='table'&&Array.isArray(b.rows)&&b.rows.length){
   const columns=Array.isArray(b.rows[0])?b.rows[0].length:0;
   if(!columns||!b.rows.every(row=>Array.isArray(row)&&row.length===columns))throw invalid();
   cells+=b.rows.length*columns;bounded(columns<=limits.columns&&++tables<=limits.tables&&cells<=limits.cells);
   out.push({kind:'table',rows:b.rows.map(row=>row.map((s:unknown)=>[{text:text(s)}])),align:Array(columns).fill(null)});
  }else throw invalid();
  bounded(out.length<=limits.blocks);
 }
 return {version:1,mode:'report',blocks:out,diagnostics:[],ready:true,preview:''};
}
