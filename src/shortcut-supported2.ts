import {formatValueState} from './format-value-state.js';
import type {FormatState} from './formatting.js';
import type {RhwpAdapter} from './adapter.js';
import type {Props,Selection,Position,Run} from './model.js';
import {copy} from './model.js';

export type PaperChange=Partial<Record<'width'|'height'|'marginLeft'|'marginRight'|'marginTop'|'marginBottom'|'marginHeader'|'marginFooter'|'marginGutter',number>> & {landscape?:boolean;binding?:0|1|2;scope?:'current'|'all'|'new-section'};
function physicalParagraph(a:RhwpAdapter,global:number){
  if(!Number.isSafeInteger(global)||global<0)throw Error('구역의 전역 문단 주소를 확인할 수 없습니다.');
  let start=0;
  for(let sec=0;sec<a.doc.getSectionCount();sec++){const count=a.doc.getParagraphCount(sec);if(global<start+count)return{sec,para:global-start,start};start+=count;}
  throw Error('구역 경계 문단이 현재 문서에 없습니다.');
}
function paperBoundary(a:RhwpAdapter,s:Selection){
  if(s.kind!=='caret'||s.focus.kind!=='body')throw Error('새 구역부터 적용하려면 본문 한 곳에 커서를 놓으세요. 셀·블록·개체 선택은 유지합니다.');
  const p=s.focus;a.validate(p);a.assertEditable(p);
  if(typeof a.doc.breakAtCursor!=='function')throw Error('현재 Core의 구역 나누기 연결이 없습니다.');
  let root=p.para;for(let sec=0;sec<p.sec;sec++)root+=a.doc.getParagraphCount(sec);
  const scalar=a.textOffset(p),stops=a.call<number[]>('getCaretStops',0,root),stream=stops[scalar],bounds=a.call<{start:number;end:number}>('getParaBounds',0,root);
  if(stops.length!==[...a.text(p)].length+1||!Number.isSafeInteger(stream)||stops.indexOf(stream)!==scalar||![bounds.start,bounds.end].every(Number.isSafeInteger)||stream<bounds.start||stream>bounds.end)
    throw Error('구역을 나눌 실제 본문 문자 경계를 확인할 수 없습니다.');
  const edge=stream>=bounds.end&&bounds.end>0?root+1:stream<=bounds.start?root:root+1;
  let total=0;for(let sec=0;sec<a.doc.getSectionCount();sec++)total+=a.doc.getParagraphCount(sec);
  if(edge>=total&&scalar===[...a.text(p)].length)throw Error('마지막 문단 끝에는 새 구역의 대상 문단이 없습니다. 본문 안에 커서를 놓으세요.');
  return{root,stream,edge};
}
export function paperNewSectionReason(a:RhwpAdapter,s:Selection){try{paperBoundary(a,s);return '';}catch(error){return String(error).replace(/^Error: /,'');}}
export function preparePaper(a:RhwpAdapter,s:Selection,change:PaperChange){
  a.validate(s.focus);a.assertEditable(s.focus);
  const numeric=['width','height','marginLeft','marginRight','marginTop','marginBottom','marginHeader','marginFooter','marginGutter'],keys=[...numeric,'landscape','binding'];
  if(!Object.keys(change).every(k=>[...keys,'scope'].includes(k))||change.scope!==undefined&&!['current','all','new-section'].includes(change.scope))throw Error('지원하지 않는 용지 속성입니다.');
  const {scope,...delta}=change;
  for(const[k,v]of Object.entries(delta)){
    if(k==='landscape'){if(typeof v!=='boolean')throw Error('용지 방향을 확인하세요.');}
    else if(k==='binding'){if(![0,1,2].includes(v as number))throw Error('제본 방식을 확인하세요.');}
    else if(!Number.isSafeInteger(v)||Number(v)<0||Number(v)>566929||(['width','height'].includes(k)&&Number(v)<2835))throw Error('용지 크기는 10~2000mm, 여백은 0 이상의 정확한 값으로 입력하세요.');
  }
  if(!Object.keys(delta).length)return; // Display-only confirmation must preserve even imported out-of-range geometry.
  const plan=(sec:number)=>{const before=a.call<Record<string,number|boolean>>('getPageDef',sec),next:Record<string,number|boolean>={...before,...delta};
    for(const k of numeric)if(!Number.isSafeInteger(next[k]))throw Error('용지 원값을 조회할 수 없습니다.');
    const w=Number(next.landscape?next.height:next.width),h=Number(next.landscape?next.width:next.height);
    if(w-Number(next.marginLeft)-Number(next.marginRight)-Number(next.marginGutter)<2835||h-Number(next.marginTop)-Number(next.marginHeader)-Number(next.marginBottom)-Number(next.marginFooter)<2835)throw Error(`${sec+1}구역: 여백을 줄여 본문 너비·높이를 최소 10mm 남겨주세요.`);
    return{sec,next,patch:Object.fromEntries(Object.entries(delta).filter(([k,v])=>before[k]!==v))};
  };
  if(scope==='new-section'){
    const boundary=paperBoundary(a,s);
    return()=>{
      const result=a.call<{ok:boolean;para:number;pos:number;reason?:string}>('breakAtCursor',0,boundary.root,boundary.stream,'section');
      if(result.ok!==true)throw Error(result.reason||'새 구역을 만들지 못해 원문을 유지합니다.');
      // The request boundary owns the delta. The returned cursor may follow
      // original text into the NEXT section when an occupied start is split.
      const target=physicalParagraph(a,boundary.edge),starts=a.call<number[]>('getSectionStarts');
      if(target.start!==boundary.edge||!starts.includes(boundary.edge))throw Error('새 구역 경계와 실제 용지 주소가 일치하지 않습니다.');
      const{sec,next,patch}=plan(target.sec);
      if(Object.keys(patch).length)a.call('setPageDef',sec,JSON.stringify(patch));
      if(JSON.stringify(a.call('getPageDef',sec))!==JSON.stringify(next))throw Error('새 구역 용지 설정 재조회가 요청과 다릅니다.');
      const cursor=physicalParagraph(a,result.para),p={kind:'body' as const,sec:cursor.sec,para:cursor.para,offset:0},stops=a.call<number[]>('getCaretStops',0,result.para),scalar=stops.indexOf(result.pos);
      if(scalar<0||stops.length!==[...a.text(p)].length+1)throw Error('새 구역의 반환 커서가 실제 문자 경계에 없습니다.');
      p.offset=a.logical(p,scalar);a.validate(p);if(a.textOffset(p)!==scalar)throw Error('새 구역의 커서 소유 경로가 일치하지 않습니다.');
      return{kind:'caret' as const,focus:p};
    };
  }
  const sections=scope==='all'?Array.from({length:a.doc.getSectionCount()},(_,i)=>i):[s.focus.sec];
  const starts=a.call<number[]>('getSectionStarts');if(starts.length!==a.doc.getSectionCount())throw Error('문단 내부 구역 표식의 용지는 현재 위치별 지정 연결이 없어 원본을 유지합니다.');
  const plans=sections.map(plan).filter(row=>Object.keys(row.patch).length);
  if(!plans.length)return;
  return()=>{for(const{sec,next,patch}of plans){a.call('setPageDef',sec,JSON.stringify(patch));if(JSON.stringify(a.call('getPageDef',sec))!==JSON.stringify(next))throw Error('용지 설정 재조회가 요청과 다릅니다.');}a.validate(s.focus);return copy(s);};
}

export function fontCycleCommand(state:FormatState,choices:readonly string[],scope:string,direction:-1|1){
  if(scope!=='all'&&!/^[0-6]$/.test(scope))throw Error('언어 범위를 확인하세요.');
  const key=scope==='all'?'fontFamily':`fontLanguage${scope}`,current=state[key];
  // The catalog order is shared with the actual registered-family picker,
  // not a fabricated three-family cycle or an OS-installed-font inventory.
  if(formatValueState(state,key)!=='common')throw Error(formatValueState(state,key)==='mixed'?'현재 글꼴이 혼합입니다. 글꼴을 명시적으로 선택하세요.':'현재 글꼴이 미조회입니다. 기존 값을 유지합니다.');
  const list=[...new Set(choices.filter(n=>n.trim()))],at=typeof current==='string'?list.indexOf(current):-1;
  if(at<0)throw Error('현재 글꼴이 혼합·미조회이거나 등록 목록에 없습니다. 글꼴을 명시적으로 선택하세요.');
  const index=at+direction;if(index<0||index>=list.length)return;
  const props:Props={[key]:list[index]};return {type:'char' as const,props};
}

export function columnPosition(a:RhwpAdapter,p:Position,lines:{page:number;y:number;runs:Run[]}[],direction:-1|1):Position{
  a.validate(p);if(p.kind!=='body')throw Error('단 이동은 본문 커서에서 지원합니다. 셀·개체 대상은 유지합니다.');
  const caret=a.rect(p),info=a.call<any>('getPageInfo',caret.pageIndex),cols=info.columns;
  if(!Array.isArray(cols)||cols.some((c:any)=>!Number.isFinite(c.x)||!Number.isFinite(c.width)||c.width<=0))throw Error('현재 쪽의 단 경계를 조회할 수 없습니다.');
  const index=cols.findIndex((c:any)=>caret.x>=c.x-.1&&caret.x<=c.x+c.width+.1);if(index<0)throw Error('현재 커서의 단을 확인할 수 없습니다.');
  const target=cols[index+direction];if(!target)return {...p};
  const x=target.x+Math.min(Math.max(0,caret.x-cols[index].x),target.width);
  const runs=lines.filter(l=>l.page===caret.pageIndex).flatMap(l=>l.runs).filter(r=>r.cellIdx===undefined&&r.secIdx===p.sec&&r.x>=target.x-.1&&r.x<target.x+target.width);
  if(!runs.length)return {...p};
  const run=runs.reduce((best,r)=>Math.abs(r.y-caret.y)<Math.abs(best.y-caret.y)?r:best,runs[0]);
  const row=runs.filter(r=>Math.abs(r.y-run.y)<1);let best:Position|undefined,distance=Infinity;
  for(const r of row)for(let i=0;i<r.charX.length;i++){const d=Math.abs(r.x+r.charX[i]-x);if(d<distance){const next=a.position(r,r.charStart+i);a.validate(next);if(next.kind!=='body'||next.sec!==p.sec)throw Error('도착 단의 본문 소유 경로가 다릅니다.');best=next;distance=d;}}
  return best??{...p};
}
