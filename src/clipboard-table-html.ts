import type {RhwpAdapter} from './adapter.js';
import type {Position} from './model.js';

// Outbound only: a detached, already validated Core fragment. Never consumes
// external clipboard HTML, changes the document, or changes the fragment wire.
export function tableFragmentHTML(a:RhwpAdapter):string|undefined {
 const controls=a.call<any[]>('getControls').filter(c=>c.list===0&&!['secd','cold'].includes(c.ctrlId));
 if(!controls.some(c=>c.ctrlId==='tbl')||controls.some(c=>c.ctrlId!=='tbl'))return;
 const htmlDoc=new DOMParser().parseFromString('<!doctype html><body></body>','text/html');
 const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html').body;
 const point=(n:number)=>{if(!Number.isFinite(n))throw Error('클립보드의 실제 길이 값을 확인할 수 없습니다.');return `${n}pt`;};
 const paragraph=(element:HTMLElement,p:Position)=>{
  const list=p.kind==='cell'?a.list(p).listId:0,para=p.kind==='cell'?p.cellPara:p.para;
  const raw=a.call<any>('getParaShapeSet',list,para),props=a.paraProps(p);
  for(const key of ['LeftMargin','RightMargin','Indentation','PrevSpacing','NextSpacing'])
   if(!Number.isSafeInteger(raw[key]))throw Error('클립보드 문단의 원래 단위를 확인할 수 없습니다.');
  // Existing resolver contract: horizontal HWP ParaShape units are doubled;
  // authored/imported vertical units are distinguished by the existing getter.
  if(props.spacingUnitScale!==1&&props.spacingUnitScale!==2)throw Error('클립보드 문단 간격 단위를 확인할 수 없습니다.');
  element.style.marginLeft=point((raw.LeftMargin+Math.max(-raw.Indentation,0))/200);
  element.style.marginRight=point(raw.RightMargin/200);
  element.style.textIndent=point(raw.Indentation/200);
  element.style.marginTop=point(raw.PrevSpacing/(100*props.spacingUnitScale));
  element.style.marginBottom=point(raw.NextSpacing/(100*props.spacingUnitScale));
 };
 const root=htmlDoc.body;
 for(let para=0;para<a.doc.getParagraphCount(0);para++){
  const owner={kind:'body' as const,sec:0,para,offset:0},text=a.text(owner),length=Array.from(text).length;
  const tables=controls.filter(c=>c.para===para),positions=a.call<number[]>('getControlTextPositions',0,para);
  if(!tables.length){root.insertAdjacentHTML('beforeend',a.doc.exportSelectionHtml(0,para,0,para,length).replace(/<\/?(?:html|body)[^>]*>|<!--(?:Start|End)Fragment-->/gi,''));continue;}
  const group=htmlDoc.createElement('div');let start=0,style:string|undefined;
  const appendText=(end:number)=>{
   if(end===start)return;
   const body=parse(a.doc.exportSelectionHtml(0,para,start,para,end));
   if(body.children.length!==1||body.firstElementChild?.tagName!=='P')throw Error('클립보드 본문 문단 구조가 다릅니다.');
   const p=body.firstElementChild as HTMLElement,current=p.getAttribute('style')??'';
   if(style!==undefined&&style!==current)throw Error('같은 문단의 서식 조회가 달라졌습니다.');
   style=current;
   for(const child of Array.from(p.childNodes)){
    if(child.nodeType===3&&!child.textContent?.trim())continue; // Core pretty-print whitespace only; source text lives in spans.
    group.append(child);
   }
  };
  for(const t of tables){
   const offset=positions[t.controlIndex];
   if(!Number.isSafeInteger(offset)||offset<start||offset>length)throw Error('표의 실제 본문 순서를 확인할 수 없습니다.');
   appendText(offset);
   const body=parse(a.doc.exportControlHtml(0,para,'[]',t.controlIndex));
   if(body.children.length!==1||body.firstElementChild?.tagName!=='TABLE')throw Error('클립보드 표 구조가 다릅니다.');
   const table=body.firstElementChild as HTMLTableElement,props=a.call<any>('getTableProperties',0,para,t.controlIndex);
   if(typeof props.treatAsChar!=='boolean')throw Error('표의 글자 취급 속성을 확인할 수 없습니다.');
   table.style.display=props.treatAsChar?'inline-table':'table';table.style.verticalAlign='baseline';
   for(const [side,key]of [['Left','outerLeft'],['Right','outerRight'],['Top','outerTop'],['Bottom','outerBottom']]as const)
    table.style[`margin${side}`]=point(props[key]/100);
   const cells=a.cells({kind:'cell',sec:0,para,control:t.controlIndex,cell:0,cellPara:0,offset:0}).sort((x,y)=>x.row-y.row||x.col-y.col);
   const elements=Array.from(table.querySelectorAll('td')).filter(td=>td.closest('table')===table);
   if(elements.length!==cells.length)throw Error('선택 표의 실제 셀 수가 다릅니다.');
   for(const [i,cell]of cells.entries()){
    const p={kind:'cell' as const,sec:0,para,control:t.controlIndex,cell:cell.cellIdx,cellPara:0,offset:0};
    const paragraphs=Array.from(elements[i].querySelectorAll('p')).filter(n=>n.closest('td')===elements[i]);
    // The existing Core exporter emits no <p> for an empty text paragraph,
    // including an otherwise valid paragraph hosting only a nested table.
    // Match exact live nonempty owners; never shift indexes speculatively.
    const owners=Array.from({length:a.count(p)},(_,cellPara)=>({...p,cellPara})).filter(q=>a.text(q)!=='');
    if(paragraphs.length!==owners.length)throw Error('표 셀 문단의 정확한 소유 순서가 다릅니다.');
    for(const [i,element]of paragraphs.entries())paragraph(element,owners[i]);
   }
   group.append(table);start=offset;
  }
  appendText(length);if(style!==undefined)group.setAttribute('style',style);paragraph(group,owner);root.append(group);
 }
 // Preserve source spaces inside text runs, without preserving Core's HTML
 // pretty-print newlines between runs as additional document content.
 for(const span of root.querySelectorAll('span'))span.style.whiteSpace='pre-wrap';
 return root.innerHTML;
}
