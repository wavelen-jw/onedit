import type {Interaction} from './interaction.js';
import type {BodyLine,NavigationRect} from './adapter.js';
import type {Position} from './model.js';

export type BodyVisualLine={position:Extract<Position,{kind:'body'}>;line:BodyLine;start:{position:Position;rect:NavigationRect};end:{position:Position;rect:NavigationRect};left:number;right:number;top:number;bottom:number};
// Existing navigation-owner admission excludes cell/shape/header display runs.
// Query an interior scalar of each run so a wrap boundary does not acquire the
// next line's affinity merely because two visual carets share one offset.
export function bodyVisualLines(editor:Interaction,page:number):BodyVisualLine[]{
  const a=editor.adapter;
  // Resolve current page runs through the ORIGINAL layout barrier first.
  const groups=editor.lines(undefined,page);
  return a.withBodyLineReadFence(current => {
  const rows=new Map<string,BodyVisualLine>();
  const receipts=new Map<string,Readonly<BodyLine>[]>();
  let receiptCount=0,disabled=current?.()!==true;
  const certified=!disabled;
  const clear=()=>{receipts.clear();receiptCount=0;disabled=true;};
  const checkPass=()=>{
    if(certified&&!current!()){
      clear();rows.clear();edges.clear();
      throw Error('현재 문서의 줄 정보를 다시 확인해야 합니다.');
    }
  };
  const lineFor=(p:Extract<Position,{kind:'body'}>):BodyLine=>{
    checkPass();
    if(disabled)return a.bodyLine(p);
    // Preserve current owner/bounds checks even when the native line lookup
    // is shared. Logical/control offsets still use the existing conversion.
    a.validate(p);
    const offset=a.textOffset(p),id=JSON.stringify([p.sec,p.para]);
    const known=receipts.get(id)??[];
    const matches=known.filter(l=>l.charStart<offset&&offset<l.charEnd);
    if(matches.length===1){
      const l=matches[0];
      // The original BodyLine result guards remain, including exact text
      // bounds. Never cache mutable parsed objects or infer coordinates.
      if(![l.lineIndex,l.lineCount,l.charStart,l.charEnd].every(Number.isSafeInteger)||
          l.lineIndex<0||l.lineCount<=l.lineIndex||l.charStart<0||
          l.charEnd<l.charStart||l.charEnd>Array.from(a.text(p)).length)
        throw Error('Core 줄 정보가 유효하지 않습니다.');
      checkPass();return {...l};
    }
    if(matches.length>1)clear();
    // Current p and scalar were validated above, including every cache miss.
    // Use the same original native getter/result guards once, rather than
    // entering bodyLine(p) and repeating that exact owner/offset validation.
    const line=a.call('getLineInfo',p.sec,p.para,offset) as BodyLine;
    if(![line.lineIndex,line.lineCount,line.charStart,line.charEnd].every(Number.isSafeInteger)||
        line.lineIndex<0||line.lineCount<=line.lineIndex||line.charStart<0||
        line.charEnd<line.charStart||line.charEnd>Array.from(a.text(p)).length)
      throw Error('Core 줄 정보가 유효하지 않습니다.');
    checkPass();if(disabled)return line;
    // Ambiguous intervals/counts or a changed same-line receipt disable all
    // reuse for the rest of this pass. Endpoints/empty lines never match.
    const conflict=known.some(l=>l.lineCount!==line.lineCount||
      (l.lineIndex===line.lineIndex
        ? l.charStart!==line.charStart||l.charEnd!==line.charEnd
        : Math.max(l.charStart,line.charStart)<Math.min(l.charEnd,line.charEnd)));
    if(conflict||receiptCount>=256){clear();return line;}
    if(!known.some(l=>l.lineIndex===line.lineIndex)){
      known.push(Object.freeze({lineIndex:line.lineIndex,lineCount:line.lineCount,
        charStart:line.charStart,charEnd:line.charEnd}));
      receipts.set(id,known);receiptCount++;
    }
    return line;
  };
  // Mixed-font runs on one visual line ask for identical owner/line edges.
  // Share only within this synchronous read; each run still resolves its owner
  // and validates its current line. No values survive an edit or view refresh.
  const edges=new Map<string,Pick<BodyVisualLine,'start'|'end'>>();
  for(const group of groups)for(const run of group.runs){
    const p=a.position(run,run.charStart+Math.floor(Array.from(run.text).length/2));
    if(p.kind!=='body'||a.hasBodyLayoutObject(p))continue;
    const line=lineFor(p),key=JSON.stringify([p.sec,p.para,line.lineIndex,line.charStart,line.charEnd]);
    let edge=edges.get(key);
    if(!edge){edge={start:a.bodyLineEdge(p,line,false),end:a.bodyLineEdge(p,line,true)};edges.set(key,edge);}
    checkPass();
    const {start,end}=edge;
    if(start.rect.pageIndex!==page||end.rect.pageIndex!==page)continue;
    const id=JSON.stringify([p.sec,p.para,line.lineIndex]),before=rows.get(id);
    const top=Math.min(start.rect.y,run.y),bottom=Math.max(start.rect.y+start.rect.height,run.y+run.h);
    if(before){before.left=Math.min(before.left,run.x);before.right=Math.max(before.right,run.x+run.w);before.top=Math.min(before.top,top);before.bottom=Math.max(before.bottom,bottom);}
    else rows.set(id,{position:p,line,start,end,left:Math.min(start.rect.x,run.x),right:Math.max(end.rect.x,run.x+run.w),top,bottom});
  }
  checkPass();
  return [...rows.values()].sort((a,b)=>a.top-b.top||a.left-b.left);
  });
}
