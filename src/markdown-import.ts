import type {ReportBlockRole} from './report-block-presets.js';
import { Lexer } from './vendor/marked.js';

export type MarkdownMode = 'source' | 'report';
export type MarkdownDiagnostic = { id: string; code: string; line: number; column: number; source: string; message: string; severity: 'error' | 'confirm'; treatment: string };
export type MarkdownRun = { text: string; bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean };
export type MarkdownBlock = { kind: 'paragraph'; runs: MarkdownRun[]; role: 'body' | 'heading' | 'code' | 'quote' | 'list'; level?: number; prefix?: string; reportRole?: ReportBlockRole; quoteGroup?: number } | { kind: 'table'; rows: MarkdownRun[][][]; align: ('left' | 'center' | 'right' | null)[] };
export type MarkdownPlan = { version: 1; mode: MarkdownMode; blocks: MarkdownBlock[]; diagnostics: MarkdownDiagnostic[]; ready: boolean; preview: string };
export type MarkdownRequest = { source: string; mode?: MarkdownMode; acceptedDiagnostics?: string[]; fitShortLastLine?:boolean };
export const markdownLimits = Object.freeze({ characters: 100000, blocks: 500, cells: 1000, columns: 12, depth: 8 });
export function decodeMarkdownFile(bytes: Uint8Array): string {
  if (bytes.byteLength > 400000) throw Error('Markdown 파일은 UTF-8 400,000 bytes 이하만 지원합니다.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, key: string) => {
  const named: Record<string,string> = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'};
  if (!key.startsWith('#')) return named[key.toLowerCase()] ?? raw;
  const n = key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2),16) : parseInt(key.slice(1),10);
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : raw;
});
// No rendering of HTML and no URL fetching. Unsupported semantics stay visible
// as exact Markdown literals, only after an explicit per-diagnostic acceptance.
export function analyzeMarkdown(request: MarkdownRequest): MarkdownPlan {
  const { source, mode = 'source' } = request;
  if(request.fitShortLastLine!==undefined&&typeof request.fitShortLastLine!=='boolean')throw Error('마지막 줄 정리 옵션이 올바르지 않습니다.');
  if (typeof source !== 'string' || !source.trim() || source.length > markdownLimits.characters) throw Error('비어 있지 않은 100,000자 이하 Markdown이 필요합니다.');
  if (!['source','report'].includes(mode)) throw Error('지원하지 않는 서식 모드입니다.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(source)) throw Error('지원하지 않는 제어문자가 있습니다.');
  if (request.acceptedDiagnostics !== undefined && (!Array.isArray(request.acceptedDiagnostics) || request.acceptedDiagnostics.some(x=>typeof x!=='string'))) throw Error('진단 승인 목록이 올바르지 않습니다.');
  if (/\p{Surrogate}/u.test(source)) throw Error('잘못된 Unicode surrogate 입력입니다.');
  const normalized = source.replace(/^\uFEFF/u,'').replace(/\r\n?/g,'\n');
  const diagnostics: MarkdownDiagnostic[] = [], blocks: MarkdownBlock[] = [];
  const diagnostic = (code:string, offset:number, raw:string, message:string, severity:'error'|'confirm'='confirm', treatment='원문 Markdown 기호·주소를 문자 그대로 보존') => {
    const before = normalized.slice(0,Math.max(0,offset)), line=before.split('\n').length, column=before.length-(before.lastIndexOf('\n')+1)+1;
    const id=`${code}:${offset}:${diagnostics.length}`;
    diagnostics.push({id,code,line,column,source:raw,message,severity,treatment});
  };
  // Marked pads/truncates ragged cells. Reject this before lexing rather than
  // accepting already-lossy tokens. Escaped pipes do not split cells in GFM.
  const splitRow=(s:string)=>{
    s=s.trim();if(s.startsWith('|'))s=s.slice(1);
    const cells:string[]=[];let begin=0;
    for(let i=0;i<s.length;i++)if(s[i]==='|'){
      let slashes=0;for(let j=i-1;j>=0&&s[j]==='\\';j--)slashes++;
      if(slashes%2===0){cells.push(s.slice(begin,i));begin=i+1;}
    }
    if(begin<s.length||!cells.length)cells.push(s.slice(begin));
    return cells;
  };
  const lines=normalized.split('\n'); let inFence:string|undefined, lineOffset=0;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i]; const fence=/^ {0,3}(`{3,}|~{3,})/.exec(line);
    if(fence){if(!inFence)inFence=fence[1][0];else if(fence[1][0]===inFence)inFence=undefined;}
    if(!inFence && line.includes('|') && splitRow(line).every(c=>/^\s*:?-{3,}:?\s*$/.test(c)) && i>0){
      const width=splitRow(lines[i-1]).length;
      if(splitRow(line).length!==width)diagnostic('MALFORMED_TABLE',lineOffset,line,'표 구분선 열 수가 머리행과 다릅니다.','error','차단');

    }
    lineOffset+=line.length+1;
  }
  let count=0, cellCount=0, quoteSequence=0;
  const inline=(tokens:any[],base:number,depth=0,style:Omit<MarkdownRun,'text'>={}):MarkdownRun[]=>{
    if(depth>markdownLimits.depth)throw Error('Markdown 인라인 중첩 한도 초과');
    const runs:MarkdownRun[]=[];let at=base;
    for(const t of tokens){
      if(++count>10000)throw Error('Markdown 토큰 한도 초과');
      const where=normalized.indexOf(t.raw??'',at);const offset=where<0?at:where;at=offset+(t.raw?.length??0);
      if(t.type==='strong'||t.type==='em'||t.type==='del') runs.push(...inline(t.tokens,offset,depth+1,{...style,[t.type==='strong'?'bold':t.type==='em'?'italic':'strikethrough']:true}));
      else if(t.type==='codespan') runs.push({...style,text:t.text,code:true});
      else if(t.type==='br') runs.push({...style,text:'\n'});
      else if(t.type==='escape') runs.push({...style,text:t.text});
      else if(t.type==='text') {
        if(t.tokens)runs.push(...inline(t.tokens,offset,depth+1,style));
        else {
          if (/&(?!(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);)[a-z][a-z0-9]+;/i.test(t.text)) diagnostic('ENTITY_LITERAL',offset,t.raw,'이 HTML named entity는 해석하지 않고 원문 표기를 보존합니다.');
          if(t.text.includes('\t')) diagnostic('TEXT_TAB',offset,t.raw,'일반 본문 탭의 정지점 변환은 이번 범위에서 지원하지 않습니다.','error','차단');
          const decoded=decodeEntities(t.text.replace(/\n/g,' '));
          if(/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(decoded)) diagnostic('ENTITY_CONTROL',offset,t.raw,'문자 참조로 표현된 제어문자는 지원하지 않습니다.','error','차단');
          runs.push({...style,text:decoded});
        }
      } else {
        const code=t.type==='image'?'IMAGE_LITERAL':t.type==='link'?'LINK_LITERAL':t.type==='html'?'HTML_LITERAL':'INLINE_LITERAL';
        diagnostic(code,offset,t.raw,`${t.type}의 원래 기능은 생성하지 않습니다. 원문 표기를 유지하려면 확인하세요.`);
        runs.push({...style,text:t.raw});
      }
    }
    return runs;
  };
  const visit=(tokens:any[],start=0,depth=0,quote=0,quoteGroup?:number)=>{
    if(depth>markdownLimits.depth)throw Error('Markdown 블록 중첩 한도 초과');let cursor=start;
    for(const t of tokens){
      if(++count>10000)throw Error('Markdown 토큰 한도 초과');
      const where=normalized.indexOf(t.raw??'',cursor),offset=where<0?cursor:where;cursor=offset+(t.raw?.length??0);
      if(t.type==='space')continue;
      if(t.type==='heading'||t.type==='paragraph'||t.type==='text'){
        const runs=inline(t.tokens??[{type:'text',text:t.text,raw:t.raw}],offset);
        blocks.push({kind:'paragraph',role:quote&&mode==='report'?'quote':t.type==='heading'?'heading':quote?'quote':'body',runs,level:t.depth??quote,...(quoteGroup!==undefined?{quoteGroup}:{})});
      } else if(t.type==='blockquote'){
        if(mode==='report'){
          // Preserve each consecutive quoted run as one box, including hard
          // line breaks. Blank non-quote lines separate independent boxes.
          const chunks:string[][]=[];let part:string[]=[];
          for(const line of String(t.raw).replace(/\n+$/,'').split('\n')){
            if(!line.trim()){if(part.length)chunks.push(part);part=[];continue;}
            part.push(line.replace(/^ {0,3}> ?/,''));
          }
          if(part.length)chunks.push(part);
          for(const chunk of chunks)visit(Lexer.lex(chunk.join('\n'),{gfm:true}),offset,depth+1,quote+1,quoteGroup??++quoteSequence);
        }else visit(t.tokens,offset,depth+1,quote+1);
      }
      else if(t.type==='code'){
        const rawLines=String(t.raw).replace(/\n+$/,'').split('\n');
        if(mode==='report'&&!t.lang&&!/^ {0,3}[`~]{3}/.test(t.raw)&&rawLines.every((line:string)=>/^ +[-*※] +\S/.test(line))){
          // Unfenced, explicitly marked report lines can have indentation
          // without a GFM parent. Fenced and ordinary code remain code.
          for(const line of rawLines){
            const m=/^( +)([-*※]) +(.*)$/.exec(line)!;
            blocks.push({kind:'paragraph',role:'list',runs:inline(Lexer.lexInline(m[3]),offset),level:1+Math.ceil(m[1].length/2),prefix:m[2]+' '});
          }
          if(blocks.length>markdownLimits.blocks)throw Error('문단/블록 한도 초과');
          continue;
        }
        const rawTabs=t.raw.includes('\t');
        if(rawTabs)diagnostic('CODE_TAB',offset,t.raw,'코드 내 탭은 글꼴/탭정지점에 따라 배치가 다릅니다. 이번 버전은 탭 코드를 차단합니다.','error','차단');
        for(const line of t.text.split('\n')) blocks.push({kind:'paragraph',role:'code',runs:[{text:line,code:true}]});
        if(t.lang)diagnostic('CODE_LANGUAGE',offset,t.raw,`코드 언어(${t.lang})의 구문 강조는 적용하지 않습니다. 코드 내용·공백·줄은 보존합니다.`,'confirm','언어 표시는 문서 속성으로 저장하지 않고 코드 내용·공백·줄 보존');
      } else if(t.type==='list'){
        let n=Number(t.start)||1;
        for(const item of t.items){
          const itemOffset=normalized.indexOf(item.raw,offset);const rawMarker=/^\s*([-+*]|\d+[.)])/.exec(item.raw)?.[1]??(t.ordered?`${n}.`:'-');n++;
          // Report lines with an explicit unindented note/plain continuation
          // are independent blocks, while source-mode GFM remains unchanged.
          let itemTokens=item.tokens,tail='',tailOffset=0;
          if(mode==='report'&&!quote){
            const rawLines=String(item.raw).split('\n'),indent=/^ */.exec(rawLines[0])![0].length;
            const cut=rawLines.findIndex((line:string,i:number)=>i>0&&line.trim()&&/^ */.exec(line)![0].length<=indent&&!/^ *(?:[-+*]|\d+[.)]) +/.test(line));
            if(cut>0){const head=rawLines.slice(0,cut).join('\n');tail=rawLines.slice(cut).join('\n');tailOffset=Math.max(offset,itemOffset)+head.length+1;itemTokens=Lexer.lex(head.replace(/^ *([-+*]|\d+[.)]) +/,''),{gfm:true});}
          }
          const before=blocks.length;visit(itemTokens.filter((token:any)=>token.type!=='checkbox'),Math.max(offset,itemOffset),depth+1,quote,quoteGroup);
          for(const continuation of blocks.slice(before)){
            if(continuation.kind!=='paragraph'||(['quote','code','heading'].includes(continuation.role)&&!(mode==='report'&&quote&&continuation.role==='quote'))) diagnostic('COMPLEX_LIST',Math.max(offset,itemOffset),item.raw,'목록 안 표·코드·인용·제목은 아직 구조 보존을 검증하지 않았습니다.','error','차단');
            else if(continuation.role==='body'){continuation.role='list';continuation.level=depth+1;}
          }
          const first=blocks[before];
          if(!first || first.kind!=='paragraph')diagnostic('LIST_STRUCTURE',offset,item.raw,'첫 내용이 문단이 아닌 목록은 지원하지 않습니다.','error','차단');
          else {
            first.role=quote&&mode==='report'?'quote':'list';first.level=depth+1+(depth===0&&mode==='report'?Math.ceil((/^ */.exec(t.raw)?.[0].length??0)/2):0);if(quoteGroup!==undefined)first.quoteGroup=quoteGroup;first.prefix=rawMarker+' '+(item.task?(item.tokens.find((token:any)=>token.type==='checkbox')?.raw??`[${item.checked?'x':' '}] `):'');
            // Native numbering is intentionally not synthesized. Literal marker
            // preserves authored numbers; diagnostic discloses no auto-renumber.
          }
          if(tail)visit(Lexer.lex(tail,{gfm:true}),tailOffset,depth,quote,quoteGroup);
        }
      } else if(t.type==='table'){
        const rows=[t.header,...t.rows];cellCount+=rows.length*t.header.length;
        if(t.header.length>markdownLimits.columns || cellCount>markdownLimits.cells)throw Error('표 크기 한도 초과');
        const rawRows=t.raw.replace(/\n+$/,'').split('\n');let rowAt=offset;
        for(let n=0;n<rawRows.length;n++){
          if(n!==1 && splitRow(rawRows[n]).length!==t.header.length)diagnostic('MALFORMED_TABLE',rowAt,rawRows[n],'표 행의 열 수가 다릅니다. 생략/채움 없이 차단합니다.','error','차단');
          rowAt+=rawRows[n].length+1;
        }
        let rowOffset=offset;
        blocks.push({kind:'table',rows:rows.map((r:any[],ri:number)=>{
          const line=rawRows[ri===0?0:ri+1]??'',parts=splitRow(line);let cellAt=rowOffset;
          const rendered=r.map((c:any,ci:number)=>{const start=normalized.indexOf(parts[ci]?.trim()??'',cellAt);const at=start<0?cellAt:start;cellAt=at+(parts[ci]?.trim().length??0)+1;return inline(c.tokens,at);});
          rowOffset+=line.length+1+(ri===0?(rawRows[1]?.length??0)+1:0);return rendered;
        }),align:t.align});
      } else {
        diagnostic(t.type==='html'?'HTML_LITERAL':mode==='report'&&t.type==='hr'?'RULE_LITERAL':'BLOCK_LITERAL',offset,t.raw,`${t.type}는 원문 기호를 문자로 보존하는 처리만 지원합니다.`);
        for(const line of t.raw.replace(/\n$/,'').split('\n')) blocks.push({kind:'paragraph',role:'body',runs:[{text:line}]});
      }
      if(blocks.length>markdownLimits.blocks)throw Error('문단/블록 한도 초과');
    }
  };
  const tokens=Lexer.lex(normalized,{gfm:true,breaks:false});
  if(Object.keys(tokens.links).length){
    const definition=/^ {0,3}\[[^\]]+\]:/m.exec(normalized);
    diagnostic('REFERENCE_DEFINITIONS',definition?.index??0,definition?.[0]??'', '참조형 링크 정의의 원문 위치·주소 보존은 아직 지원하지 않습니다. 인라인 링크로 직접 변경한 뒤 다시 확인하세요.','error','차단');
  }
  visit(tokens);
  if(mode==='report'){
    let informalParent=false;
    const stripPrefix=(runs:MarkdownRun[],pattern:RegExp)=>{
      const match=pattern.exec(runs.map(r=>r.text).join(''));if(!match)return undefined;
      let length=match[0].length;
      while(length&&runs.length){const n=Math.min(length,runs[0].text.length);runs[0]={...runs[0],text:runs[0].text.slice(n)};length-=n;if(!runs[0].text)runs.shift();}
      return match[0].trim();
    };
    for(const b of blocks){
      if(b.kind!=='paragraph'){informalParent=false;continue;}
      if(b.role==='quote')continue;
      if(b.role==='heading'){
        informalParent=false;b.reportRole=b.level===1?'title':'subtitle';
        // A supplied marker replaces the preset marker; it is never doubled.
        let marker:string|undefined;
        // Collapse redundant heading bullets; preserve the meaningful final
        // authored number/Roman marker without adding another square.
        // Subtitle prefixes override the default square. Keep Unicode Roman
        // numerals verbatim; a level-one title has no prefix override.
        const headingMarker=b.reportRole==='subtitle'
          ? /^(?:[□■ㅁㅇ○◦●*※-]|\d+[.)]|[IVXLCDM]+[.)]|[\u2160-\u217f]+[.)])\s+/u
          : /^(?:[□■ㅁㅇ○◦●*※-]|\d+[.)]|[IVXLCDM]+[.)])\s+/u;
        for(let n=0;n<markdownLimits.depth;n++){
          const next=stripPrefix(b.runs,headingMarker);
          if(!next)break;marker=next;
        }
        if(marker&&b.reportRole==='subtitle')b.prefix=/^[□■ㅁㅇ○◦●*※-]$/.test(marker)?'□ ':marker+' ';
      }else if(b.role==='list'){
        const marker=b.prefix?.trim()??'-';
        const level=Math.min(4,(b.level??1)+(informalParent&&(b.level??1)===1?1:0));
        b.reportRole=marker==='*'?'reference1':marker==='※'?'reference2':level===1?'body1':level===2?'body2':level===3?'reference1':'reference2';
        if(/^\d+[.)]/.test(marker))b.prefix=b.prefix?.trimStart();
        else delete b.prefix;
      }else if(b.role==='body'){
        const marker=stripPrefix(b.runs,/^\s*(?:([○◦●※□])\s*|([ㅇㅁ*])\s+)/u);
        if(marker){b.reportRole=/^[ㅇ○◦●]$/.test(marker)?'body1':marker==='*'?'reference1':marker==='※'?'reference2':'subtitle';informalParent=b.reportRole==='body1';}
        else{b.reportRole='text';informalParent=false;}
      }
    }
  }
  if(blocks.some(b=>b.kind==='paragraph'&&b.role==='heading')) diagnostic('HEADING_PRESENTATION',0,'','제목 수준 1~6은 글자 크기·굵게로 구분합니다. 문서 개요/목차의 제목 메타데이터는 생성하지 않습니다.','confirm','제목 내용·수준별 시각 서식 보존; 개요 메타데이터 없음');
  if(blocks.some(b=>b.kind==='paragraph'&&b.role==='list')) diagnostic('LITERAL_LIST_MARKERS',0,'',mode==='report'?'목록 수준은 기본블록의 표시 기호로 적용합니다. 작성된 번호·체크상태는 유지합니다.':'목록 번호·체크상태는 정확한 표시 문자로 보존합니다. 자동 번호/체크 컨트롤은 아닙니다.','confirm','원 번호·마커 문자와 들여쓰기 보존; 자동 재번호 없음');
  if(mode==='report')diagnostic('REPORT_PRESENTATION',0,'','기본블록 서식과 보고서 목록 기호를 적용하고 인용은 글상자로 만듭니다.','confirm','본문 내용 유지, 기본블록 기호·서식 및 인용 글상자 적용');
  if(!blocks.length)throw Error('생성할 내용이 없습니다.');
  const known=new Set(diagnostics.map(d=>d.id));
  if(request.acceptedDiagnostics?.some(id=>!known.has(id)))throw Error('현재 원문에 없는 진단 승인입니다. 다시 미리보세요.');
  const accepted=new Set(request.acceptedDiagnostics??[]);
  const ready=diagnostics.every(d=>d.severity!=='error'&&accepted.has(d.id));
  const preview=blocks.map(b=>b.kind==='paragraph'?(b.prefix??'')+b.runs.map(r=>r.text).join(''):b.rows.map(row=>row.map(c=>c.map(r=>r.text).join('')).join(' | ')).join('\n')).join('\n');
  return {version:1,mode,blocks,diagnostics,ready,preview};
}
