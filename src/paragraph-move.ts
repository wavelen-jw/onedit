import type {RhwpAdapter} from './adapter.js';
import {copy,type Selection,type Position} from './model.js';
export function prepareParagraphMove(a:RhwpAdapter,s:Selection,direction:-1|1){
  if((s.kind!=='caret'&&s.kind!=='text')||s.focus.kind!=='body'||s.kind==='text'&&(s.anchor.kind!=='body'||s.anchor.sec!==s.focus.sec))throw Error('문단 이동은 같은 본문의 일반 문단 커서/블록에서 지원합니다.');
  const p=s.focus,anchor=s.kind==='text'?s.anchor:p;a.validate(p);a.validate(anchor);
  let first=Math.min(anchor.para,p.para),last=Math.max(anchor.para,p.para);const end=anchor.para>p.para?anchor:p;
  if(last>first&&end.offset===0)last--;
  const count=a.doc.getParagraphCount(p.sec);if(direction<0&&first===0||direction>0&&last===count-1)return;
  if(last+1>=count||direction>0&&last+2>=count)throw Error('문서 끝의 문단 경계를 보존하는 원자 이동 API가 필요합니다. 원문·선택을 유지합니다.');
  const lo=direction<0?first-1:first,hi=direction<0?last:last+1;let root=0;for(let sec=0;sec<p.sec;sec++)root+=a.doc.getParagraphCount(sec);
  const catalog=a.call<any[]>('getControls');
  if(catalog.some(c=>!['tbl','gso','secd','cold','head','foot'].includes(c.ctrlId)))throw Error('필드·책갈피 등 문단 식별자 참조 가능성이 있는 문서는 이동하지 않습니다. 기존 원문·선택을 유지합니다.');
  const controls=catalog.filter(c=>c.list===0&&c.para>=root+lo&&c.para<=root+hi);
  if(controls.length||lo===0)throw Error('개체·필드·구역 시작을 포함한 문단 이동은 별도 Core 보존 계약이 필요합니다. 현재 문단을 유지합니다.');
  for(let para=lo;para<=hi;para++)a.assertEditable({...p,para,offset:0});
  const before=a.semantic();if(!('body'in before))throw Error('읽기 전용 문서는 문단을 이동하지 않습니다.');
  const expected=copy(before),body=before.body.filter(r=>r.sec===p.sec),group=body.slice(lo,hi+1);
  const reordered=direction<0?[...group.slice(1),group[0]]:[group.at(-1)!,...group.slice(0,-1)];
  for(let i=0;i<reordered.length;i++){const index=expected.body.findIndex(r=>r.sec===p.sec&&r.para===lo+i);expected.body[index]={...copy(reordered[i]),para:lo+i};}
  const styles=body.map((_,para)=>a.call('getStyleAt',p.sec,para));const nextStyles=[...styles];for(let i=lo;i<=hi;i++)nextStyles[i]=styles[direction<0?(i===hi?lo:i+1):(i===lo?hi:i-1)];
  return ()=>{const fragment=a.doc.captureBodyClipboard(p.sec,first,0,last+1,0);try{
    a.call('deleteBodyBlock',p.sec,first,0,last+1,0);a.call('pasteCapturedBody',fragment,p.sec,direction<0?first-1:first+1,0);
    if(JSON.stringify(a.semantic())!==JSON.stringify(expected)||JSON.stringify(Array.from({length:a.doc.getParagraphCount(p.sec)},(_,para)=>a.call('getStyleAt',p.sec,para)))!==JSON.stringify(nextStyles))throw Error('문단 이동의 정확한 내용·서식·비대상 보존을 확인하지 못했습니다. 변경을 취소했습니다.');
    const moved=(position:Position):Position=>({...position,para:position.para+direction});
    return s.kind==='caret'?{kind:'caret' as const,focus:moved(s.focus)}:{kind:'text' as const,anchor:moved(s.anchor),focus:moved(s.focus)};
  }finally{fragment.free();}};
}
