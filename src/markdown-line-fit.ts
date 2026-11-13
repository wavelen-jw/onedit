import type {Interaction} from './interaction.js';
import {copy,type Position} from './model.js';

/** Optional import-only typography, never a live typing policy or CSS transform.
 * Existing native spacing and native layout own the result. Whole import History
 * remains authoritative; a failed bounded search restores its exact snapshot. */
export function fitShortLastLine(editor:Interaction,p:Position){
  const a=editor.adapter,text=a.text(p),chars=[...text];
  const skipped=(reason:string)=>({admitted:false,spacing:0,reason});
  if(p.kind!=='body'||chars.length<2||chars.length>160||/[\n\r\t]/.test(text)||a.hasBodyLayoutObject(p))return skipped('complex-or-explicit-break');
  const lines=()=>{
    const groups=new Map<string,{start:number;text:string}>();
    for(let page=0;page<a.pageCount;page++)for(const r of a.runs(page)){
      if(r.secIdx!==p.sec||r.paraIdx!==p.para||r.parentParaIdx!==undefined||r.cellIdx!==undefined||r.cellPath||!r.text)continue;
      if(chars.slice(r.charStart,r.charStart+[...r.text].length).join('')!==r.text)return undefined;
      const k=page+':'+r.y,g=groups.get(k);if(g){g.start=Math.min(g.start,r.charStart);g.text+=r.text;}else groups.set(k,{start:r.charStart,text:r.text});
    }
    return [...groups.values()].sort((x,y)=>x.start-y.start);
  };
  const beforeLines=lines();if(!beforeLines||![2,3].includes(beforeLines.length))return skipped('not-two-or-three-certified-lines');
  const targetLines=beforeLines.length-1;
  const tail=chars.slice(beforeLines.at(-1)!.start).join('').trim();
  if(!tail||[...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(tail)].length>5)return skipped('tail-longer-than-five');
  // Do not flatten pre-existing per-script spacing or mixed manual tracking.
  for(let n=0;n<chars.length;n++){
    const raw=a.charProps({...p,offset:a.logical(p,n)}),v=raw.spacings;
    if(!Array.isArray(v)||v.length!==7||v.some(x=>x!==0))return skipped('authored-spacing');
  }
  const before=copy(editor.selection),typing=copy(editor.typing),end={...p,offset:a.length(p)},noFit=Symbol('no-fit');let spacing=0;
  try{
    editor.selection=editor.history.transact('import-short-last-line',before,()=>{
      for(let amount=1;amount<=10;amount++){
        editor.selection={kind:'text',anchor:{...p,offset:0},focus:end};
        editor.execute({type:'char',props:{spacings:Array(7).fill(-amount)}},editor.capture());
        if(a.text(p)!==text)throw Error('자간 조정 중 문단 내용이 변경되었습니다.');
        const next=lines();if(next?.length===targetLines){spacing=-amount;return before;}
      }
      throw noFit;
    });
    return {admitted:true,spacing,reason:targetLines===1?'native-single-line':'native-line-reduction',linesBefore:beforeLines.length,linesAfter:targetLines};
  }catch(error){editor.selection=before;if(error!==noFit)throw error;return skipped('ten-percent-insufficient');}
  finally{editor.typing=typing;}
}
