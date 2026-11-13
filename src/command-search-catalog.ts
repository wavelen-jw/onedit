import {activeWorkset} from "./active-workset.js";
import { cellDialogMode, type CellDialogMode } from "./cell-dialog-command.js";
import { formatMenuItems } from "./integration/a-format-menu.js";
import { stylesUnavailable } from "./style-availability.js";
import type { CatalogCommand } from "./integration/a-format-menu.js";
export type SearchCommand = {
  id:string; label:string; group:string; aliases?:string; command?:CatalogCommand;
  dialog?:"char"|"paragraph"|"cell"; insertion?:"table"|"picture"|"textbox";
  cellDialog?:CellDialogMode; selector?:string; unavailable?:string; groupTab?:string; entrance?:string;
};
const aliases:Record<string,string>={center:"중앙 가운데 중앙정렬",left:"왼쪽 좌측",right:"오른쪽 우측",bold:"굵게 볼드",italic:"기울임 이탤릭",character:"폰트 글꼴 색 글자색 크기",paragraph:"문단 여백 간격",'list-Number':"번호 목록 숫자 리스트",'list-Bullet':"글머리표 목록 불릿 리스트"};
/** Existing command objects and existing dialog entrances only. */
const buildSearchCommands=():SearchCommand[]=>[
  ...([
    ["file-save","저장","파일","save 저장","#save"],
    ["file-print","인쇄","파일","print 인쇄","#print-button"],
    ["app-settings","메뉴·단축키 설정","도구","settings 설정 단축키","#tools-shortcut-settings"],
    ["view-zoom-in","문서 확대","보기","zoom in 확대","[data-view-action=in]"],
    ["view-zoom-out","문서 축소","보기","zoom out 축소","[data-view-action=out]"],
    ["edit-undo","실행 취소","편집","undo 되돌리기 취소","#undo"],
    ["edit-redo","다시 실행","편집","redo 다시 실행","#redo"],
  ]).map(([id,label,group,aliases,entrance])=>({id,label,group,aliases,entrance,selector:entrance})),
  ...formatMenuItems.filter(x=>x.command||x.dialog==="char"||x.dialog==="paragraph").map(x=>({id:x.id,label:x.label,group:x.group,aliases:aliases[x.id],command:x.command,dialog:x.dialog==="char"||x.dialog==="paragraph"?x.dialog:undefined,selector:`[data-format-action="${x.id}"]`,groupTab:x.dialogGroup,unavailable:x.unsupported})),
  {id:"styles",label:"문단 스타일",group:"서식",aliases:"스타일 제목 본문",unavailable:stylesUnavailable},
  {id:"cell-properties",label:"셀 테두리·배경…",group:"표",aliases:"셀 색 배경 채우기 선 테두리",dialog:"cell",cellDialog:"border-properties",groupTab:"테두리·배경",selector:"#cell-format"},
  {id:"insert-table",label:"표 만들기…",group:"입력",aliases:"표 테이블 행 열",insertion:"table",selector:"[data-insert-entry=table]"},
  {id:"insert-picture",label:"그림 넣기…",group:"입력",aliases:"사진 이미지 picture image",insertion:"picture",selector:"[data-insert-entry=picture]"},
  {id:"insert-textbox",label:"빈 글상자 넣기…",group:"입력",aliases:"텍스트상자 글상자 textbox",insertion:"textbox",selector:"[data-insert-entry=textbox]"},
  {id:"page-break",label:"쪽 나누기",group:"쪽",aliases:"페이지 나누기 다음 쪽",command:{type:"page-break"},selector:"#page-break"},
  {id:"column-break",label:"단 나누기",group:"쪽",aliases:"컬럼 다단 단 나눔",command:{type:"column-break"},selector:"#column-break"},
];
// No dynamic catalog construction before actual search/slash demand.
let initialized=typeof document==="undefined"||!activeWorkset(document);
export const searchCommands:SearchCommand[]=initialized?buildSearchCommands():[];
export function ensureSearchCatalog(){if(!initialized){searchCommands.push(...buildSearchCommands());initialized=true;}}
export function releaseSearchCatalog(doc:Document){
  if(!activeWorkset(doc))return;
  for(const row of searchCommands){
    if(row.entrance?.startsWith("[data-search-entrance="))doc.querySelector(row.entrance)?.removeAttribute("data-search-entrance");
  }
  searchCommands.length=0;initialized=false;
}
const normalize=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[\s·…()[\]_-]/g,"");
export function matchesSearch(row:SearchCommand,query:string){const text=normalize(`${row.label} ${row.group} ${row.aliases??""}`);return query.trim().split(/\s+/).every(q=>text.includes(normalize(q)));}

/** Enrich the same finder catalog from live supported menu entrances after
 * exclusions. Reuse actual nodes/handlers; do not infer new editor Commands. */
export function collectSupportedMenuCommands(doc:Document){
  ensureSearchCatalog();
  const known=new Set<Element>();
  for(const row of searchCommands)if(row.selector)for(const n of doc.querySelectorAll(row.selector))known.add(n);
  const canonical=(b:HTMLButtonElement)=>b.dataset.commandProxy?doc.querySelector(b.dataset.commandProxy)??b:
    b.dataset.editEntry?doc.querySelector(`[data-edit-action="${b.dataset.editEntry}"]`)??b:b;
  for(const id of["undo","redo"])for(const b of doc.querySelectorAll(`[data-edit-action="${id}"],[data-edit-entry="${id}"]`))known.add(b);
  for(const id of["character","paragraph","cell-format"])if(doc.getElementById(id))known.add(doc.getElementById(id)!);
  for(const n of [...known])if(n instanceof HTMLButtonElement)known.add(canonical(n));
  for(const b of doc.querySelectorAll<HTMLButtonElement>('#main-menu button')){
    if(!b.onclick||b.closest('#style-menu,[data-menu-excluded]')||b.matches('[data-menu-scope-id],[data-table-held],[data-edit-held]')||
      b.dataset.tableAction&&['auto-fit','table-properties'].includes(b.dataset.tableAction))continue;
    const source=canonical(b);if(b.title===stylesUnavailable||(source as HTMLElement).title===stylesUnavailable||source.matches("#style,#style-manager-open")||known.has(b)||known.has(source))continue;
    const label=b.cloneNode(true) as HTMLElement;for(const n of label.querySelectorAll('kbd,small,[data-format-state-note]'))n.remove();
    const name=label.textContent?.trim().replace(/\s+/g,' ');if(!name)continue;
    const id=`menu-${searchCommands.length}`;b.dataset.searchEntrance=id;
    const parent=b.closest('#main-menu>details'),group=parent?.querySelector(':scope>summary')?.textContent?.trim()||'도구';
    const entrance=`[data-search-entrance="${id}"]`;
    searchCommands.push({id,label:name,group,aliases:`${name} ${b.dataset.tableAction??b.dataset.editEntry??b.dataset.insertEntry??b.id}`,entrance,selector:entrance,cellDialog:cellDialogMode(b.dataset.oneditCellMode ?? "")});known.add(b);known.add(source);
  }
}
