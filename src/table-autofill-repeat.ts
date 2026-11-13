import type {RhwpAdapter} from './adapter.js';
import {copy,nested,type Position,type Selection} from './model.js';

const styleKeys=['paddingLeft','paddingRight','paddingTop','paddingBottom','applyInnerMargin','verticalAlign','textDirection','borderFillId'] as const;
const strip=(o:any)=>{const{charShapeId,paraShapeId,borderFillId,...rest}=o;return rest;};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
// Same-document, immutable paragraph fragments preserve every explicit run and
// paragraph. No OS/internal clipboard overwrite and no plain-text substitute.
function state(a:RhwpAdapter,p:Position,admit=true){
 if(admit){
  const list=a.list(p).listId;
  if(a.call<any[]>('getControls').some(c=>c.list===list))
   throw Error('개체·필드가 있는 셀은 문자·서식 반복에서 보존합니다.');
 }
 const paragraphs=Array.from({length:a.count(p)},(_,cellPara)=>{
  const q={...p,cellPara,offset:0};a.validate(q);if(admit){a.assertEditable(q);a.assertTextOnly(q);}
  const text=a.text(q),chars=[...text].map((_,offset)=>strip(a.charProps({...q,offset})));
  if(!chars.length)chars.push(strip(a.charProps(q)));
  return{text,properties:strip(a.paraProps(q)),chars};
 });
 const own=a.cellProps(p),effective=a.call('getCellProperties',p.sec,p.para,(p as any).control,(p as any).cell);
 if(admit&&(own.fieldName||own.editableInForm||own.borderFillId!==effective.borderFillId))
  throw Error('셀 필드·양식 또는 별도 영역 서식이 있는 셀은 반복 채우기에서 보존합니다.');
 return{paragraphs,own};
}
export function repeatAutofillPlan(a:RhwpAdapter,s:Selection){
 if(s.kind!=='cells'||nested(s.focus))throw Error('일반 표의 연속된 셀 블록을 선택하세요.');
 const p=s.focus;a.validate(p);
 const root=Array.from({length:p.sec},(_,sec)=>a.doc.getParagraphCount(sec)).reduce((n,count)=>n+count,0)+p.para;
 const host=a.call<any[]>('getControls').find(c=>c.list===0&&c.para===root&&c.controlIndex===p.control);
 if(!host||host.ctrlId!=='tbl'||host.props?.Lock)throw Error('보호되었거나 정확한 소유 표를 확인할 수 없습니다.');
 const all=a.cells(p),anchor=all.find(c=>c.cellIdx===s.anchor.cell),focus=all.find(c=>c.cellIdx===p.cell);
 if(!anchor||!focus||all.some(c=>c.rowSpan!==1||c.colSpan!==1))throw Error('병합·분할 없는 일반 표에서 문자·서식 반복을 지원합니다.');
 const left=Math.min(anchor.col,focus.col),right=Math.max(anchor.col,focus.col),top=Math.min(anchor.row,focus.row),bottom=Math.max(anchor.row,focus.row);
 const cells=all.filter(c=>c.row>=top&&c.row<=bottom&&c.col>=left&&c.col<=right);
 if(cells.length!==(right-left+1)*(bottom-top+1)||new Set(cells.map(c=>c.cellIdx)).size!==cells.length)throw Error('정확한 사각형 셀 블록을 선택하세요.');
 cells.sort((a,b)=>right-left>=bottom-top?a.row-b.row||a.col-b.col:a.col-b.col||a.row-b.row);
 const entries=cells.map(c=>{const q={...p,cell:c.cellIdx,cellPara:0,offset:0};return{p:q,...state(a,q)};});
 const end=entries.findIndex(e=>e.paragraphs.every(p=>p.text===''));
 if(end<=0)return{writes:[],apply:()=>copy(s)};
 const seeds=entries.slice(0,end),writes=entries.slice(end).map((e,i)=>({...e,source:seeds[i%seeds.length],text:seeds[i%seeds.length].paragraphs.map(p=>p.text).join(' / ')}));
 const outside=all.filter(c=>!writes.some(w=>w.p.cell===c.cellIdx)).map(c=>{const q={...p,cell:c.cellIdx,cellPara:0,offset:0};return{p:q,...state(a,q,false)};});
 return{writes,apply:()=>{
  // Capture every seed before any destination is replaced. Handles exist only
  // within the caller's single atomic History transaction and are always freed.
  const fragments:ReturnType<RhwpAdapter['doc']['captureNestedClipboard']>[]=[];
  try{
   for(const seed of seeds){const t=a.captureParagraph(seed.p),end=a.captureParagraph({...seed.p,cellPara:seed.paragraphs.length-1});fragments.push(a.doc.captureNestedClipboard(t.sectionIndex,t.parentParaIndex,JSON.stringify(t.path),t.targetId,JSON.stringify({kind:'paragraphs',startParagraph:0,endParagraph:seed.paragraphs.length-1,endTargetId:end.targetId})));}
   for(const w of writes){
    if(!equal(state(a,w.p),{paragraphs:w.paragraphs,own:w.own}))throw Error('채울 셀 내용·서식이 변경되었습니다.');
    const last={...w.p,cellPara:a.count(w.p)-1};last.offset=a.length(last);a.remove(w.p,last);
    const fragment=fragments[seeds.indexOf(w.source)],target={...a.clipboardTarget(w.p),after:false};
    const r=a.call('pasteCapturedNested',fragment,JSON.stringify(target));
    if(!r.ok||!r.changed||r.inserted?.length!==w.source.paragraphs.length)throw Error(`문자·서식 복제 거절: ${r.reason??r.error??'문단 수 불일치'}`);
    for(const[i,t]of r.inserted.entries()){
     const q=a.clipboardInsertedPosition(t);
     if(q.kind!=='cell'||q.sec!==w.p.sec||q.para!==w.p.para||q.control!==w.p.control||q.cell!==w.p.cell||q.cellPara!==i)throw Error('복제한 셀 문단의 실제 소유 경로가 다릅니다.');
    }
    const tail={...w.p,cellPara:w.source.paragraphs.length-1};tail.offset=a.length(tail);
    // Remove only the old empty destination paragraph, keeping the imported
    // last paragraph's formatting through the existing range-merge contract.
    a.remove(tail,{...w.p,cellPara:w.source.paragraphs.length,offset:0});
    const patch=Object.fromEntries(styleKeys.map(k=>[k,w.source.own[k]]));
    a.call('setCellProperties',w.p.sec,w.p.para,w.p.control,w.p.cell,JSON.stringify(patch));
    const expected={...w.own,...patch},after=state(a,w.p);
    // These are direct same-document IDs. Validate all visual properties too;
    // a silently ignored border/zone setter must cause complete rollback.
    for(const k of Object.keys(w.source.own))if(!['width','height','isHeader','cellProtect','fieldName','editableInForm'].includes(k))expected[k]=w.source.own[k];
    if(!equal(after,{paragraphs:w.source.paragraphs,own:expected}))throw Error('반복 채우기의 글자·문단·셀 서식이 원본과 다릅니다. 전체 변경을 취소합니다.');
   }
   for(const old of outside)if(!equal(state(a,old.p,false),{paragraphs:old.paragraphs,own:old.own}))throw Error('반복 채우기 비대상 셀의 내용·서식이 달라 취소했습니다.');
   a.exportChecked();
   return copy(s);
  }finally{for(const fragment of fragments)fragment.free();}
 }};
}
