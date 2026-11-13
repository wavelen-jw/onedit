import { activeWorkset } from "./active-workset.js";
import {reportBlockPresets,slashReportRoles,reportBlockFormat} from './report-block-presets.js';
import type { Interaction } from "./interaction.js";
import { copy, nested, type Command, type Selection } from "./model.js";
import {toCoreCharacter,toCoreParagraph} from "./formatting.js";
import { sameFormatTarget } from "./integration/a-format-input-guard.js";
import { searchCommands, ensureSearchCatalog, type SearchCommand } from "./command-search-catalog.js";

// One view of the existing supported catalog. Approved basic presets reuse
// actual character/paragraph formatting; no new bullet/heading model.
const literalBlocks = () => [
  ["□", "미음", "ㅁ 네모 미음 mieum square"], ["○", "이응", "ㅇ 동그라미 이응 ieung circle"],
  ["-", "하이픈", "하이픈 hyphen dash"], ["*", "별표", "별표 asterisk star"], ["※", "당구장", "당구장 reference mark"], ["#", "제목", "제목 heading title"],
].map(([text,name,aliases],i)=>({row:{id:`literal-${i}`,label:i===5?"제목":text,group:"기본 블록",command:i===5?{type:"char",props:toCoreCharacter({fontFamily:"함초롬돋움",fontSize:20,underline:true})}:{type:"insert",text}} as SearchCommand,
  icon:text,name:i===5?"제목":text,description:i===5?"기호 없이 제목 서식":`${name} · 지정 글자·문단 서식`,aliases:`${text} ${name} ${aliases}`,category:"기본 블록"}));
const category=(row:SearchCommand)=>row.insertion||row.group==="입력"?"개체 삽입":row.id.startsWith("list-")||row.id.endsWith("break")?"기본 텍스트":
  row.group==="표"||row.group==="개체"?"표·개체 작업":row.entrance&&!/글자|문단|서식/.test(row.group)?"문서·보기·도구":"글자·문단 서식";
const order=["기본 텍스트","개체 삽입","글자·문단 서식","표·개체 작업","문서·보기·도구"];
export const buildSlashCommands=()=>{ensureSearchCatalog();return [...literalBlocks(),...searchCommands.filter(row=>!row.unavailable).map(row=>({row,
  icon:row.insertion==="table"?"▦":row.insertion==="picture"?"▧":row.insertion==="textbox"?"▭":row.group==="표"?"▦":row.entrance?"⌘":"T",
  name:row.label.replace(/…$/,""),description:row.group,aliases:`${row.label} ${row.id} ${row.aliases??""}`,category:category(row),
})).sort((a,b)=>order.indexOf(a.category)-order.indexOf(b.category))];};
export let slashCommands:ReturnType<typeof buildSlashCommands>=typeof document!=="undefined"&&activeWorkset(document)?[]:buildSlashCommands();
export function refreshSlashCatalog(){slashCommands=buildSlashCommands();}
export const matchesSlash = (aliases: string, query: string) => {
  const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s/g, "");
  return query.trim().split(/\s+/).every(word => norm(aliases).includes(norm(word)));
};
const reportPrefix=(text:string)=>/^ *[□ㅁㅇ○*※-] ?/u.exec(text)?.[0]??"";
export function assertSlashStart(editor: Interaction) {
  const s = editor.selection, p = s.focus, a = editor.adapter;
  if (s.kind !== "caret" || p.offset !== 0 || nested(p) ||
      (a.text(p)!==""&&!reportPrefix(a.text(p))) || a.hasBodyLayoutObject(p))
    throw Error("빈 문단 또는 기존 기본블록의 문단 시작에서 사용하세요.");
  a.assertEditable(p); a.assertTextOnly(p);
  const controls = a.call<any[]>("getControls");
  if (p.kind === "cell") {
    const list = a.list(p).listId;
    if (controls.some(c => c.list === list && c.para === p.cellPara)) throw Error("개체가 있는 셀입니다.");
  } else {
    const para = p.para + Array.from({ length: p.sec }, (_, sec) => a.doc.getParagraphCount(sec)).reduce((a, b) => a + b, 0);
    if (controls.some(c => c.list === 0 && c.para === para && !["secd", "cold"].includes(c.ctrlId))) throw Error("개체가 있는 문단입니다.");
  }
}
export function slashRange(editor: Interaction, target: ReturnType<Interaction["capture"]>, text: string): Selection {
  if (!sameFormatTarget(target, editor.capture()) || target.selection.kind !== "caret") throw Error("빠른 삽입의 문서·선택이 변경되었습니다.");
  const p = target.selection.focus;
  // Search draft is UI-only. Save/print/settings can run without writing a
  // command string into a file or disturbing dirty/Redo on cancellation.
  if(!nested(p)&&text.startsWith("/")&&p.offset===0&&(editor.adapter.text(p)===""||!!reportPrefix(editor.adapter.text(p)))){
    assertSlashStart(editor);return copy(target.selection);
  }
  if (nested(p) || !text.startsWith("/") || editor.adapter.text(p) !== text ||
      editor.adapter.length(p) !== [...text].length || p.offset !== [...text].length)
    throw Error("빠른 삽입의 검색어·대상 문단이 변경되었습니다.");
  editor.adapter.assertEditable(p); editor.adapter.assertTextOnly(p);
  return { kind: "text", anchor: { ...p, offset: 0 }, focus: copy(p) };
}
export function executeSlash(editor: Interaction, target: ReturnType<Interaction["capture"]>, text: string, command: Command) {
  const range = slashRange(editor, target, text), selection = copy(editor.selection),
    typing = copy(editor.typing), block = editor.block, preferredX = editor.preferredX;
  try {
    // No document prefix exists for a UI-only search. The existing Command
    // owns its one transaction/no-op/typing contract; do not add a dummy Undo.
    if(range.kind==="caret"){editor.execute(command,target);return;}
    editor.selection = editor.history.atomic("slash-insert", selection, () => {
      editor.execute({ type: "delete", backward: false }, { documentId: target.documentId, revision: target.revision, selection: range });
      editor.execute(command, editor.capture());
      return editor.selection;
    });
  } catch (error) {
    editor.selection = selection; editor.typing = typing; editor.block = block; editor.preferredX = preferredX;
    throw error;
  }
}
export function slashCommandMatches(row: SearchCommand, command: Command) {
  return row.insertion === "table" ? command.type === "insert-table"
    : row.insertion === "picture" ? command.type === "picture" && command.change.action === "insert"
    : row.insertion === "textbox" ? command.type === "textbox-insert"
    : row.dialog ? command.type === row.dialog || row.dialog === "paragraph" && ["paragraph-relative","paragraph-list"].includes(command.type)
    : row.command?.type === command.type;
}

/** @internal Existing empty-run operation shared by slash and command import.
 * Caller owns its compound History; native shape/no-op/rollback remain real. */
export function formatEmptyCommandParagraph(editor:Interaction,character:import('./model.js').Props){
  const a=editor.adapter,p=editor.selection.focus,before=copy(editor.selection);
  if(before.kind!=='caret'||p.offset!==0||a.text(p)!=='')throw Error('빈 문단의 글자 서식 대상이 아닙니다.');
  a.validate(p);a.assertEditable(p);a.assertTextOnly(p);
  let list=0,index=p.para;if(p.kind==='body')for(let sec=0;sec<p.sec;sec++)index+=a.doc.getParagraphCount(sec);else{list=a.list(p).listId;index=p.cellPara;}
  const original=JSON.stringify(a.call('getCharShapeSet',list,index,0));
  editor.selection=editor.history.transact('empty-character',before,()=>{a.format(p,0,character);return before;},()=>JSON.stringify(a.call('getCharShapeSet',list,index,0))===original);
  editor.execute({type:'char',props:character},editor.capture());
}
/** @internal Synchronous command steps; shared by the normal slash transaction
 * and an isolated Markdown compound transaction. No key/event emulation. */
export function executeReportBlockSteps(editor:Interaction,role:import('./report-block-presets.js').ReportBlockRole,prefixOverride?:string){
  assertSlashStart(editor);if(editor.adapter.text(editor.selection.focus)!=='')throw Error('새 기본블록은 빈 문단에서 적용하세요.');
  const {character,paragraph,prefix}=reportBlockFormat(role,prefixOverride);
  formatEmptyCommandParagraph(editor,character);
  editor.execute({type:'paragraph',props:paragraph},editor.capture());
  if(prefix){editor.execute({type:'insert',text:prefix},editor.capture());alignReportPrefix(editor,prefix);}
}

/** Current native caret advances, within the caller's synchronous transaction.
 * Quantize to an integral physical HWPUNIT; never export a half-HU margin.
 * HWP hanging indentation advances continuation lines. The left margin stays
 * zero; adding a positive margin as well would move the marker a second time. */
function alignReportPrefix(editor:Interaction,marker:string){
  const a=editor.adapter,p=editor.selection.focus,start={...p,offset:0};
  if(!a.text(start).startsWith(marker))throw Error('기본블록 접두부가 변경되었습니다.');
  const end={...start,offset:a.logical(start,[...marker].length)},left=a.rect(start),right=a.rect(end);
  const hu=Math.round((right.x-left.x)*75);
  if(left.pageIndex!==right.pageIndex||left.y!==right.y||!Number.isSafeInteger(hu)||hu<=0||hu>20000)throw Error('기본블록 기호의 현재 줄 폭을 확인할 수 없습니다.');
  editor.execute({type:'paragraph',props:toCoreParagraph({marginLeft:0,marginRight:0,indent:-hu/100})},editor.capture());
}

/** Existing character/paragraph Commands in one existing History transaction.
 * Empty paragraph formatting uses Core's documented empty-run shape range;
 * no placeholder glyph or new heading model is inserted. */
export function executeSlashBlock(editor:Interaction,target:ReturnType<Interaction["capture"]>,text:string,id:string){
  const range=slashRange(editor,target,text);if(range.kind!=="caret")throw Error("기본 블록은 빈 문단에서 실행하세요.");
  assertSlashStart(editor);
  const index=Number(id.slice("literal-".length)),role=id==='text'?'text':slashReportRoles[index];
  const spec=role&&reportBlockPresets[role];if(!spec)throw Error("알 수 없는 기본 블록입니다.");
  const before=copy(editor.selection),typing=copy(editor.typing),block=editor.block,preferredX=editor.preferredX,a=editor.adapter,p=range.focus;
  const {character,paragraph}=reportBlockFormat(role);
  try{
    const prefix=reportPrefix(a.text(p));
    if(prefix){
      editor.selection=editor.history.atomic("report-block-reapply",before,()=>{
        // Explicit preset application owns the whole paragraph, including the
        // subtitle text after its marker. Do not leave the old Batang run there.
        {
          const length=a.length(p);
          editor.selection={kind:"text",anchor:{...p,offset:0},focus:{...p,offset:length}};
          editor.execute({type:"char",props:character},editor.capture());
        }
        editor.selection={kind:"text",anchor:{...p,offset:0},focus:{...p,offset:prefix.length}};
        editor.execute({type:"delete",backward:false},editor.capture());
        editor.execute({type:"paragraph",props:paragraph},editor.capture());
        if(spec.text){
          // A range-format command does not update insertion typing. After
          // reopening, the replacement would otherwise inherit the default run.
          editor.execute({type:"char",props:character},editor.capture());
          editor.execute({type:"insert",text:reportBlockFormat(role).prefix},editor.capture());
          alignReportPrefix(editor,reportBlockFormat(role).prefix);
        }
        return editor.selection;
      });
      editor.typing={...typing,...character};editor.block=false;editor.preferredX=undefined;return;
    }
    editor.selection=editor.history.atomic('slash-block',before,()=>{
      executeReportBlockSteps(editor,role);return editor.selection;
    });
    editor.typing={...typing,...character};editor.block=false;editor.preferredX=undefined;
  }catch(e){editor.selection=before;editor.typing=typing;editor.block=block;editor.preferredX=preferredX;throw e;}
}
