import {initializeBlankDocument} from './blank-document-defaults.js';
import {analyzeMarkdown,type MarkdownRequest,type MarkdownRun} from './markdown-import.js';
import {executeReportBlockSteps,formatEmptyCommandParagraph} from './slash-commands.js';
import {RhwpAdapter} from './adapter.js';
import {Interaction} from './interaction.js';
import {headerFooterCatalog} from './header-footer.js';
import {siblingDocument} from './core-runtime.js';
import type {HwpDocument} from '../development/core/rhwp.js';
import {fitShortLastLine} from './markdown-line-fit.js';
import {fitMarkdownTable} from './markdown-table-fit.js';
import {assertValidatedMergedGrids,constructFreshMergedGrid,type MergedGridBlock,type NativeDocumentPlan} from './ai-merged-grid.js';
import {copy,type Position,type Props,type Run,type Selection} from './model.js';

/** @internal Safety of the generated Edit document, not source visual fidelity.
 * Native page/line and render frames are the authority; never fix dimensions
 * after the fact or attach imported markup. No cross-event geometry cache. */
export function assertMarkdownSafety(a:RhwpAdapter){
  inspectMarkdownLayout(a,false);
}

/** Existing HWPX only: a native Header/Footer text run can be outside the
 * body. Exempt it only when its explicit owner, geometry and unique matching
 * text-layout run agree. The caller compares this proof across the edit. */
export function existingHwpxLayoutProof(a:RhwpAdapter):string{
  return inspectMarkdownLayout(a,true);
}

type Rect={x:number;y:number;w:number;h:number};
function rectValues(b:Rect){return [b.x,b.y,b.w,b.h];}
function within(r:Rect,b:Rect){
  return r.x>=b.x&&r.y>=b.y&&r.x+r.w<=b.x+b.w&&r.y+r.h<=b.y+b.h;
}
function runKey(pi:number,text:string,b:Rect){return JSON.stringify([pi,text,...rectValues(b)]);}
function plainPageRun(r:Run){
  return r.parentParaIdx===undefined&&r.controlIdx===undefined&&
    r.cellIdx===undefined&&r.cellParaIdx===undefined&&r.cellPath===undefined;
}
function inspectMarkdownLayout(a:RhwpAdapter,existing:boolean):string{
  const issues:string[]=[],proof:unknown[]=[];
  for(let page=0;page<a.pageCount;page++){
    const info=a.call('getPageInfo',page),runs=a.runs(page),top=info.headerArea.y+info.headerArea.height,bottom=info.footerArea.y;
    const tree=a.call('getPageRenderTree',page);
    const outsideBody=(r:Run)=>r.x<info.bodyLeft||r.x+r.w>info.bodyRight||r.y<top||r.y+r.h>bottom;
    const decorations=new Set<Run>();
    if(existing&&tree.type==='Page'){
      const candidates=new Map<string,Run[]>();
      for(const r of runs){
        if(!r.text||!outsideBody(r)||!plainPageRun(r))continue;
        const key=runKey(r.paraIdx,r.text,r),group=candidates.get(key)??[];
        group.push(r);candidates.set(key,group);
      }
      for(const owner of tree.children??[]){
        if(owner.type!=='Header'&&owner.type!=='Footer')continue;
        const area=owner.type==='Header'?info.headerArea:info.footerArea;
        const bounds={x:area.x,y:area.y,w:area.width,h:area.height};
        if(!owner.bbox||JSON.stringify(rectValues(owner.bbox))!==JSON.stringify(rectValues(bounds))){
          issues.push(`page${page}:decoration-frame`);continue;
        }
        const matched:Run[]=[];
        // Restrict the exception to direct native header/footer text lines.
        for(const line of owner.children??[]){
          if(line.type!=='TextLine')continue;
          for(const leaf of line.children??[]){
            if(leaf.type!=='TextRun'||!leaf.text)continue;
            const box=leaf.bbox;
            if(!box||leaf.pi!==line.pi||!within(box,bounds)){
              issues.push(`page${page}:decoration-text`);continue;
            }
            const group=candidates.get(runKey(leaf.pi,leaf.text,box));
            if(group?.length!==1||decorations.has(group[0])){
              issues.push(`page${page}:decoration-owner`);continue;
            }
            decorations.add(group[0]);matched.push(group[0]);
          }
        }
        // Include the full owned subtree and full text layout records, so
        // a different resource, style, owner or position cannot be exempted.
        if(owner.children?.length)proof.push([page,owner,matched]);
      }
    }
    for(const r of runs)if(r.text&&outsideBody(r)&&!decorations.has(r))issues.push(`page${page}:body`);
    const walk=(node:any,cell?:Rect)=>{
      const box=node.bbox as Rect|undefined;
      if(node.type==='Table'&&box&&!within(box,{x:info.bodyLeft,y:top,w:info.bodyRight-info.bodyLeft,h:bottom-top}))issues.push(`page${page}:table`);
      if(node.type==='TextRun'&&node.text&&cell&&box&&!within(box,cell))issues.push(`page${page}:cell-text`);
      const owner=node.type==='Cell'?box:cell;for(const child of node.children??[])walk(child,owner);
    };walk(tree);
  }
  if(issues.length)throw Object.assign(Error('가져온 내용이 페이지 여백이나 표 셀을 넘어갑니다. 원본 문서는 유지했습니다.'),{code:'MARKDOWN_LAYOUT_UNSAFE',details:[...new Set(issues)]});
  return existing?JSON.stringify([headerFooterCatalog(a),proof]):"";
}

/** @internal Run ordinary Edit commands against a new isolated blank document.
 * No synthesized keyboard/input events, HTML importer, bespoke table dimensions
 * or source-document mutation. The existing compound History owns all rollback.
 */
export function applyMarkdownCommands(editor:Interaction,request:MarkdownRequest){
  return applyDocumentPlan(editor,analyzeMarkdown(request),request.fitShortLastLine);
}

function applyDocumentPlan(editor:Interaction,plan:NativeDocumentPlan,fitShortLines?:boolean){
  assertValidatedMergedGrids(plan);
  const a=editor.adapter;
  if(!plan.ready)throw Object.assign(Error('미지원 요소의 처리를 확인하거나 차단 항목을 수정하세요.'),{code:'MARKDOWN_DIAGNOSTICS',details:plan.diagnostics});
  const first:Position={kind:'body',sec:0,para:0,offset:0};
  if(a.doc.getSectionCount()!==1||a.doc.getParagraphCount(0)!==1||a.text(first)!==''||a.hasBodyLayoutObject(first))throw Error('마크다운 입력은 별도 빈 문서에서 시작합니다. 기존 문서는 유지합니다.');
  const locations:{kind:'paragraph'|'table';paragraph:number;text?:string;rows?:string[][];grid?:MergedGridBlock}[]=[];
  const lineFit:ReturnType<typeof fitShortLastLine>[]=[];
  const tableFit:ReturnType<typeof fitMarkdownTable>[]=[];
  const execute=(command:Parameters<Interaction['execute']>[0])=>editor.execute(command,editor.capture());
  const character=(p:Position,end:Position,props:Props)=>{
    editor.selection={kind:'text',anchor:copy(p),focus:copy(end)};
    execute({type:'char',props});editor.point(end);
  };
  const populate=(p:Position,runs:MarkdownRun[],base:Props)=>{
    editor.point(p);editor.typing={};formatEmptyCommandParagraph(editor,base);
    const text=runs.map(r=>r.text).join('');
    // Hard inline Markdown breaks are the ordinary soft-break command, while
    // block transitions below use Enter. Keep Unicode scalar offsets intact.
    for(const [n,part]of text.split('\n').entries()){
      if(n)execute({type:'break',soft:true});if(part)execute({type:'insert',text:part});
    }
    const end=copy(editor.selection.focus);
    if(text)character(p,end,base);
    let offset=0;
    for(const run of runs){const length=[...run.text].length;
      if(length){const from={...p,offset:a.logical(p,offset)},to={...p,offset:a.logical(p,offset+length)};
        character(from,to,{bold:!!base.bold||!!run.bold,italic:!!run.italic,strikethrough:!!run.strikethrough,...(run.code?{fontFamily:'monospace'}:{})});}
      offset+=length;
    }
    if(a.text(p)!==text)throw Error('마크다운 명령 입력의 공백·줄바꿈·내용이 일치하지 않습니다.');
    editor.point(end);return text;
  };
  const quote=(host:number,paragraphs:MarkdownRun[][])=>{
    const page=a.call('getPageDef',0),width=page.width-page.marginLeft-page.marginRight-page.marginGutter,
      maxHeight=page.height-page.marginTop-page.marginBottom-page.marginHeader-page.marginFooter;
    // Existing textbox command retains the normal default floating placement;
    // this explicit existing-model option is the requested inline quote path.
    execute({type:'textbox-insert',change:{width,height:maxHeight,inline:true}});
    const controls=a.call<any[]>('getControls').filter(c=>c.list===0&&c.para===host&&c.ctrlId==='gso');
    if(controls.length!==1)throw Error('새 인용 글상자의 소유자를 확인할 수 없습니다.');
    const control=controls[0].controlIndex,props=a.call('getShapeProperties',0,host,control);
    let selection:Extract<Selection,{kind:'object'}>={kind:'object',focus:{kind:'body',sec:0,para:host,offset:0},control};
    const fonts=Array.from({length:7},(_,lang)=>a.doc.findOrCreateFontIdForLang(lang,'맑은 고딕'));
    const before=copy(editor.selection);
    for(let n=0;n<paragraphs.length;n++){
      editor.selection=selection;const runs=paragraphs[n],text=runs.map(r=>r.text).join('');
      execute({type:'textbox-edit',change:{expected:'',text,caret:[...text].length}});
      selection=copy(editor.selection)as typeof selection;
      const path=JSON.stringify([{controlIndex:control,cellIndex:0,cellParaIndex:n}]);
      // The ordinary textbox editor owns content/split/owner. Its existing
      // path-format APIs own the requested quote formatting (not a fake cell).
      editor.history.transact('quote-format',editor.selection,()=>{
        a.call('applyCharFormatInCellByPath',0,host,path,0,[...text].length,JSON.stringify({fontIds:fonts,fontSize:1200,bold:false,italic:false,underline:false,strikethrough:false,textColor:'#000000'}));
        a.call('applyParaFormatInCellByPath',0,host,path,JSON.stringify({alignment:'left',marginLeft:0,marginRight:0,indent:0,spacingBefore:0,spacingAfter:0,lineSpacing:140,lineSpacingType:'Percent',headType:'None',numberingId:0,paraLevel:0}));
        let at=0;for(const run of runs){const length=[...run.text].length;if(length)a.call('applyCharFormatInCellByPath',0,host,path,at,at+length,JSON.stringify({bold:!!run.bold,italic:!!run.italic,strikethrough:!!run.strikethrough}));at+=length;}return editor.selection;
      });
      if(n<paragraphs.length-1){editor.selection=selection;execute({type:'textbox-edit',change:{expected:text,text,caret:[...text].length,splitAt:[...text].length}});selection=copy(editor.selection)as typeof selection;}
    }
    const begin=a.call('getCursorRectByPath',0,host,JSON.stringify([{controlIndex:control,cellIndex:0,cellParaIndex:0}]),0),end=a.call('getCursorRectByPath',0,host,JSON.stringify([{controlIndex:control,cellIndex:0,cellParaIndex:paragraphs.length-1}]),[...paragraphs.at(-1)!.map(r=>r.text).join('')].length);
    const height=Math.ceil((end.y+end.height-begin.y)*7200/a.doc.getDpi()+props.tbMarginTop+props.tbMarginBottom);
    if(begin.pageIndex!==end.pageIndex||!Number.isSafeInteger(height)||height<=0||height>maxHeight)throw Error('한 쪽보다 긴 인용은 글상자를 나누어 주세요. 기존 문서는 유지합니다.');
    editor.history.transact('quote-content-height',selection,()=>{a.call('setShapeProperties',0,host,control,JSON.stringify({height}));const after=a.call('getShapeProperties',0,host,control);if(after.treatAsChar!==true||after.width!==width||after.height!==height)throw Error('인용 글상자의 글자처럼 취급·크기가 일치하지 않습니다.');return selection;});
    editor.selection=before;editor.point({kind:'body',sec:0,para:host,offset:a.length({kind:'body',sec:0,para:host,offset:0})});
    return paragraphs.map(r=>r.map(x=>x.text).join('')).join('\n');
  };
  // Generated content may span pages. Use the existing paragraph's explicit
  // page-break-before command at a generated block boundary when the native
  // layout puts that block below the body. This changes only this new document;
  // it is not a repair of an opened file or a guess about source appearance.
  // One bounded attempt per block; a block too large for a page still refuses.
  const blockBelowBody=(paragraph:number)=>{
    let below=false;
    for(let page=0;page<a.pageCount;page++){
      const info=a.call('getPageInfo',page);
      if(a.runs(page).some(r=>r.secIdx===0&&(r.parentParaIdx??r.paraIdx)===paragraph&&r.text&&r.y+r.h>info.footerArea.y))below=true;
      const visit=(node:any)=>{if(node.pi===paragraph&&['Table','Shape'].includes(node.type)&&node.bbox&&node.bbox.y+node.bbox.h>info.footerArea.y)below=true;for(const child of node.children??[])visit(child);};
      visit(a.call('getPageRenderTree',page));
    }
    return below;
  };
  const before=copy(editor.selection),typing=copy(editor.typing);
  try{editor.selection=editor.history.atomic('markdown-command-import',before,()=>{
    editor.point(first);
    for(let index=0;index<plan.blocks.length;index++){
      const block=plan.blocks[index],p=copy(editor.selection.focus);
      if(p.kind!=='body'||p.offset!==0||a.text(p)!=='')throw Error('마크다운 다음 블록의 빈 본문 위치가 아닙니다.');
      // Enter inherits paragraph properties: do not propagate a generated page
      // break to every following block. Other formatting uses the shared preset.
      execute({type:'paragraph',props:{pageBreakBefore:false}});
      // A fitted preceding paragraph must not pass its tracking through Enter
      // into another generated paragraph, quote or table. OFF keeps the old path.
      if(fitShortLines)formatEmptyCommandParagraph(editor,{spacings:Array(7).fill(0)});
      if(block.kind==='paragraph'&&plan.mode==='report'&&block.role==='quote'){
        const paragraphs:MarkdownRun[][]=[],group=block.quoteGroup;
        do{const q=plan.blocks[index];if(q.kind!=='paragraph')throw Error('인용 블록이 일치하지 않습니다.');const rows:MarkdownRun[][]=[[]];for(const run of q.runs){run.text.split('\n').forEach((text,n)=>{if(n)rows.push([]);if(text)rows.at(-1)!.push({...run,text});});}paragraphs.push(...rows);const next=plan.blocks[index+1];if(!next||next.kind!=='paragraph'||next.role!=='quote'||next.quoteGroup!==group)break;index++;}while(true);
        executeReportBlockSteps(editor,'text');locations.push({kind:'paragraph',paragraph:p.para,text:quote(p.para,paragraphs)});
      }else if(block.kind==='paragraph'){
        const role=plan.mode==='report'?block.reportRole:undefined;
        if(role){
          executeReportBlockSteps(editor,role,block.prefix);
          // Slash owns paragraph and empty-run/prefix formatting. Fill the rest
          // with the same insertion command, then style only the parsed spans.
          const base={...editor.typing},prefix=a.text(p);editor.point({...p,offset:a.length(p)});
          const text=block.runs.map(r=>r.text).join('');
          for(const[n,part]of text.split('\n').entries()){if(n)execute({type:'break',soft:true});if(part)execute({type:'insert',text:part});}
          const end=copy(editor.selection.focus);let at=[...prefix].length;
          for(const run of block.runs){const size=[...run.text].length;if(size)character({...p,offset:a.logical(p,at)},{...p,offset:a.logical(p,at+size)},{bold:!!base.bold||!!run.bold,italic:!!run.italic,strikethrough:!!run.strikethrough,...(run.code?{fontFamily:'monospace'}:{})});at+=size;}
          if(a.text(p)!==prefix+text)throw Error('기본블록 입력 내용이 일치하지 않습니다.');editor.point(end);locations.push({kind:'paragraph',paragraph:p.para,text:prefix+text});
        }else{const text=populate(p,[...(block.prefix?[{text:block.prefix}]:[]),...block.runs],{fontSize:block.role==='heading'?2000-Math.min(5,(block.level??1)-1)*150:1000,bold:block.role==='heading',underline:false,italic:false,strikethrough:false,textColor:'#000000'});execute({type:'paragraph',props:{alignment:'left',marginLeft:0,marginRight:0,indent:0,spacingBefore:0,spacingAfter:0,lineSpacing:160,lineSpacingType:'Percent'}});locations.push({kind:'paragraph',paragraph:p.para,text});}
      }else if(block.kind==='merged-grid'){
        executeReportBlockSteps(editor,'text');
        execute({type:'insert-table',inline:true,rows:block.rowCount,cols:block.colCount});
        const table=copy(editor.selection.focus);
        if(table.kind!=='cell')throw Error('새 병합 격자의 표 소유자가 없습니다.');
        constructFreshMergedGrid(a,table,block,(cell,entry)=>{
          populate(cell,[{text:entry.text}],{fontFamily:'맑은 고딕',fontSize:1200,bold:entry.row===0,italic:false,underline:false,strikethrough:false,textColor:'#000000'});
          execute({type:'paragraph',props:{alignment:entry.row===0?'center':'left',marginLeft:0,marginRight:0,indent:0,spacingBefore:0,spacingAfter:0,lineSpacing:160,lineSpacingType:'Percent',headType:'None',numberingId:0,paraLevel:0}});
        });
        locations.push({kind:'table',paragraph:table.para,grid:block});
        const host:Position={kind:'body',sec:table.sec,para:table.para,offset:0};
        const inline=a.inline(host).find(x=>x.controlIndex===table.control);
        if(!inline)throw Error('새 표를 담은 본문 소유자가 없습니다.');
        editor.point({...host,offset:inline.offset+1});
      }else{
        executeReportBlockSteps(editor,'text');
        execute({type:'insert-table',inline:true,rows:block.rows.length,cols:block.align.length});
        const table=copy(editor.selection.focus);if(table.kind!=='cell')throw Error('일반 표 삽입 결과가 셀 위치가 아닙니다.');
        const rows:string[][]=[];
        for(let r=0;r<block.rows.length;r++){const texts:string[]=[];for(let c=0;c<block.align.length;c++){
          const cell:Position={...table,cell:r*block.align.length+c,cellPara:0,offset:0};
          texts.push(populate(cell,block.rows[r][c],{fontFamily:plan.mode==='report'?'맑은 고딕':'함초롬바탕',fontSize:plan.mode==='report'?1200:1000,bold:r===0,italic:false,underline:false,strikethrough:false,textColor:'#000000'}));
          execute({type:'paragraph',props:{alignment:r===0?'center':block.align[c]??'left',marginLeft:0,marginRight:0,indent:0,spacingBefore:0,spacingAfter:0,lineSpacing:160,lineSpacingType:'Percent',headType:'None',numberingId:0,paraLevel:0}});
        }rows.push(texts);}
        tableFit.push(fitMarkdownTable(editor,table));
        locations.push({kind:'table',paragraph:table.para,rows});
        const host:Position={kind:'body',sec:table.sec,para:table.para,offset:0};const inline=a.inline(host).find(x=>x.controlIndex===table.control);if(!inline)throw Error('새 표를 담은 본문 소유자가 없습니다.');editor.point({...host,offset:inline.offset+1});
      }
      if(fitShortLines&&block.kind==='paragraph'&&block.role!=='quote'&&block.role!=='code')lineFit.push(fitShortLastLine(editor,p));
      if(blockBelowBody(p.para)){
        const end=copy(editor.selection);editor.point(p);
        execute({type:'paragraph',props:{pageBreakBefore:true}});editor.selection=end;
        if(blockBelowBody(p.para))throw Error('한 쪽 안에 안전하게 배치할 수 없는 블록입니다. 내용을 나누어 주세요. 원본 문서는 유지했습니다.');
      }
      if(index<plan.blocks.length-1)execute({type:'break'});
    }
    assertMarkdownSafety(a);return editor.selection;
  });return{plan,locations,lineFit,tableFit};}
  catch(error){editor.selection=before;editor.typing=typing;throw error;}
}

export function composeMarkdownHwpx(source:HwpDocument,request:MarkdownRequest){
  return composeDocumentPlan(source,analyzeMarkdown(request),request.fitShortLastLine);
}

/** Internal trusted plan; never accept a caller-supplied MarkdownPlan on the wire. */
export function composeDocumentPlan(source:HwpDocument,plan:NativeDocumentPlan,fitShortLastLine?:boolean){
  const doc=siblingDocument(source),a=new RhwpAdapter(doc),editor=new Interaction(a);
  try{
    initializeBlankDocument(a);
    const result=applyDocumentPlan(editor,plan,fitShortLastLine),exported=a.exportChecked();
    if(plan.blocks.some(block=>block.kind==='merged-grid')){
      // This is a new, bounded creation contract. Do not alter the legacy
      // composer or use HWPX reopen to repair the live generated model.
      const coldDoc=siblingDocument(doc,exported.bytes);
      try{
        const cold=new RhwpAdapter(coldDoc);
        assertMarkdownSafety(cold);
        if(cold.pageCount!==a.pageCount)throw Object.assign(Error('GRID_NATIVE_PRESERVATION'),{code:'GRID_NATIVE_PRESERVATION',detail:'FRESH_PAGE_COUNT'});
        for(let page=0;page<a.pageCount;page++){
          if(a.doc.getPageTextLayout(page)!==coldDoc.getPageTextLayout(page)||
             a.doc.renderPageSvg(page)!==coldDoc.renderPageSvg(page))
            throw Object.assign(Error('GRID_NATIVE_PRESERVATION'),{code:'GRID_NATIVE_PRESERVATION',detail:'FRESH_LAYOUT'});
        }
      }finally{coldDoc.free();}
    }
    return{bytes:exported.bytes,pageCount:a.pageCount,...result};
  }
  finally{editor.history.clear();doc.free();}
}
