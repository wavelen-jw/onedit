import type {RhwpAdapter} from './adapter.js';
import {sameContainer,type Position} from './model.js';
import {f3WordRange} from './f3-word-range.js';

// Core text-to-logical positions use before-object affinity. A real rendered
// glyph can prove the after-object owner instead. Reuse the same Core word
// queries as F3, but require a UNIQUE stream caret for this exact scalar; do not
// assume caret-stop count equals logical length (inline slots need not appear).
function wordRangeAtGlyph(a:RhwpAdapter,p:Position):[Position,Position]{
  const scalar=a.textOffset(p);
  if(a.logical(p,scalar)===p.offset)return f3WordRange(a,p);
  let para=p.para;for(let sec=0;sec<p.sec;sec++)para+=a.doc.getParagraphCount(sec);
  const chars=[...a.text(p)],stops=a.call<number[]>('getCaretStops',0,para);
  if(!Array.isArray(stops)||!stops.length||stops.some((n,i)=>!Number.isSafeInteger(n)||n<0||(i>0&&n<=stops[i-1])))throw Error('개체 인접 단어의 캐럿 조회 불일치');
  const index=(stream:number)=>{const n=a.call<{charIndex:number}>('getCharIndexAtStreamPos',0,para,stream).charIndex;if(!Number.isSafeInteger(n)||n<0||n>chars.length)throw Error('개체 인접 단어의 문자 조회 불일치');return n;};
  let lo=0,hi=stops.length;while(lo<hi){const mid=(lo+hi)>>>1;if(index(stops[mid])<scalar)lo=mid+1;else hi=mid;}
  const origin=stops[lo];
  if(origin===undefined||index(origin)!==scalar||(lo+1<stops.length&&index(stops[lo+1])===scalar))throw Error('개체 인접 단어의 스트림 위치가 모호합니다.');
  const starts=a.call<number[]>('getWordStarts',0,para);
  if(!Array.isArray(starts)||starts.some((n,i)=>!Number.isSafeInteger(n)||n<0||(i>0&&n<=starts[i-1])||!stops.includes(n)))throw Error('개체 인접 단어 경계 조회 불일치');
  const start=starts.findLast(n=>n<=origin),end=a.call<number|null>('getWordEnd',0,para,origin);
  if(start===undefined||!Number.isSafeInteger(end)||!stops.includes(end!))throw Error('개체 인접 단어 끝 조회 불일치');
  const from=index(start),to=index(end!);
  if(from>scalar||to<=scalar||chars.slice(from,to).some(ch=>/\s/u.test(ch)))throw Error('개체 인접 단어 범위를 확인할 수 없습니다.');
  return[{...p,offset:a.logical(p,from)},{...p,offset:a.logical(p,to)}];
}

/** Only called for a double click, never the drag/hit-test hot path. */
export function bodyWordAtPoint(a:RhwpAdapter,page:number,x:number,y:number):[Position,Position]|undefined{
  const glyphs:Position[]=[];
  for(const r of a.runs(page)){
    if(r.cellIdx!==undefined||r.cellPath?.length||r.controlIdx!==undefined||y<r.y||y>=r.y+r.h||x<r.x||x>=r.x+r.w)continue;
    const chars=[...r.text];if(r.charX.length!==chars.length+1)continue;
    for(let i=0;i<chars.length;i++)if(x>=r.x+r.charX[i]&&x<r.x+r.charX[i+1]&&!/\s/u.test(chars[i])){
      const p=a.position(r,r.charStart+i),q=a.position(r,r.charStart+i+1),hit=a.hit(page,x,y);
      if(p.kind!=='body'||!sameContainer(p,hit)||hit.offset<p.offset||hit.offset>q.offset||[...a.text(p)][a.textOffset(p)]!==chars[i])continue;
      glyphs.push(p);
    }
  }
  if(glyphs.length!==1)return;
  const p=glyphs[0];a.validate(p);
  let globalPara=p.para;for(let sec=0;sec<p.sec;sec++)globalPara+=a.doc.getParagraphCount(sec);
  const controls=a.call<any[]>('getControls').filter(c=>c.list===0&&c.para===globalPara);
  if(controls.some(c=>!['secd','cold','tbl','gso'].includes(c.ctrlId)))return; // Field/note affinity is not extended by this UI request.
  const [begin,end]=wordRangeAtGlyph(a,p),chars=[...a.text(p)],length=a.length(p);
  let from=begin.offset,to=end.offset;
  // Zero scalar advance is an existing logical control slot. Clip around the
  // clicked word owner; a word query must never drag an object into this range.
  for(let offset=from;offset<to;offset++)if(a.textOffset(p,offset+1)===a.textOffset(p,offset)){
    if(offset<p.offset)from=offset+1;else{to=offset;break;}
  }
  let text=a.textOffset(p,to);
  // Only literal ordinary spaces are newly included. Tabs, NBSP, punctuation,
  // paragraph boundaries and visual empty area retain the existing policy.
  while(to<length&&chars[text]===' '&&a.textOffset(p,to+1)===text+1){to++;text++;}
  if(from>=to)return;
  // Existing full-paragraph body blocks own floating controls. Do not turn a
  // glyph double click into that different object-bearing selection contract.
  if(from===0&&to===length&&controls.some(c=>['tbl','gso'].includes(c.ctrlId)&&c.props?.TreatAsChar!==1))return;
  const range:[Position,Position]=[{...p,offset:from},{...p,offset:to}];
  for(const q of range)a.validate(q);
  return range;
}
