import type { RhwpAdapter } from './adapter.js';
import { ordered, sameContainer, paraIndex, type Command, type Selection } from './model.js';

export function countCharacters(text:string) {
  let total=0,withoutSpaces=0;
  for(const ch of text){if(/[\r\n\u2028\u2029]/u.test(ch))continue;total++;if(!/\s/u.test(ch))withoutSpaces++;}
  return {total,withoutSpaces};
}
export type Count=ReturnType<typeof countCharacters>;
const receipts=new WeakMap<RhwpAdapter,{id:string;rows:Map<number,Count>}>();

// A revision receipt is independent of the Undo entry (which can be coalesced).
// Only a plain paragraph in the body or a root table cell is eligible.
// Boundary crossings, fields, and nested objects retain the full count.
export function prepareCharacterDelta(a:RhwpAdapter, command:Command, s:Selection) {
  if(command.type!=='insert'&&command.type!=='delete')return;
  if(s.kind!=='caret'&&s.kind!=='text')return;
  const [from,to]=s.kind==='text'?ordered(s.anchor,s.focus):[s.focus,s.focus];
  if(!sameContainer(from,to)||paraIndex(from)!==paraIndex(to))return;
  const inserted=command.type==='insert'?command.text:'';
  if(/[\u0000-\u001f\u007f\u2028\u2029]/u.test(inserted))return;
  if(from.kind==='cell'&&(from.ancestors?.length||typeof a.doc.getPlainTableCellTextLength!=='function'))return;
  const length=()=>from.kind==='body'?a.readStructural('getParagraphLength',from.sec,from.para):
    a.doc.getPlainTableCellTextLength(from.sec,from.para,from.control,from.cell,from.cellPara);
  const len=length();
  if(len===undefined||from.kind==='body'&&a.length(from)!==len)return;
  let lo=from.offset,hi=to.offset;
  if(command.type==='delete'&&s.kind==='caret'){
    if(command.backward)lo--;else hi++;
  }
  if(lo<0||hi>len)return;
  // Large replacements are not part of the synchronous typing path.
  if(hi-lo>256||inserted.length>512)return;
  const removed=hi===lo?'':from.kind==='body'?a.readStructural('getTextRange',from.sec,from.para,lo,hi-lo):
    a.doc.getTextInCell(from.sec,from.para,from.control,from.cell,from.cellPara,lo,hi-lo);
  const oldCount=countCharacters(removed);
  if([...removed].length!==hi-lo)return;
  const {documentId,revision}=a;
  return (after:Selection,finalText=inserted)=>{
    if(finalText.length>512||/[\u0000-\u001f\u007f\u2028\u2029]/u.test(finalText))return;
    const newCount=countCharacters(finalText),insertedLength=[...finalText].length;
    const delta={total:newCount.total-oldCount.total,withoutSpaces:newCount.withoutSpaces-oldCount.withoutSpaces};
    if(a.transientEdit||a.documentId!==documentId||a.revision!==revision+1||after.kind!=='caret'||
       !sameContainer(from,after.focus)||paraIndex(from)!==paraIndex(after.focus)||after.focus.offset!==lo+insertedLength||
       length()!==len+insertedLength-(hi-lo))return;
    let history=receipts.get(a);
    if(history?.id!==documentId){history={id:documentId,rows:new Map()};receipts.set(a,history);}
    if(history.rows.size===64)history.rows.delete(history.rows.keys().next().value!);
    history.rows.set(a.revision,delta);
  };
}
export function characterDelta(a:RhwpAdapter,previousRevision:number):Count|undefined{
  const r=receipts.get(a);
  const count=a.revision-previousRevision;
  if(r?.id!==a.documentId||count<1||count>64)return;
  const sum={total:0,withoutSpaces:0};
  for(let n=previousRevision+1;n<=a.revision;n++){
    const delta=r.rows.get(n);if(!delta)return;
    sum.total+=delta.total;sum.withoutSpaces+=delta.withoutSpaces;
  }
  return sum;
}
