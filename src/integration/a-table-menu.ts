import {activeWorkset, activeMenuDemand} from "../active-workset.js";
import type {Position} from "../model.js";
import {stage5OwnerBatchOptIn,passiveBatchScreenWitness,PassiveOwnerBatchRetired} from "../passive-owner-batch.js";
import {tablePreviewLiteOptIn,phase3LiteOptIn} from "../selection-context-lite.js";
import { cellDialogFor, cellDialogMode, type CellDialogMode } from "../cell-dialog-command.js";
import {localResizeCommand} from '../cell-local-resize.js';
import {selectedTableObject} from '../table-object-command.js';
import {prepareEqualCells} from '../cell-equal.js';
import type { Interaction, WidthPreviewAdmission } from "../interaction.js";
import { nested, type Command } from "../model.js";
import { mountTableMenuUI1 } from "../table-menu-ui1.js";
import { cellBlockMasks } from '../cell-block-scope.js';
import { cellColumnBlock, cellRowBlock } from '../cell-row-block.js';
import { tableRangeSizeReason } from '../table-range-size-ui.js';
import { hasNativeTrackResize } from '../table-track-resize.js';
type Item = {
  id: string;
  label: string;
  key?: string;
  command?: Extract<Command, { type: "table-edit" | "resize" | "cell" | "control-key" }>;
  unsupported?: boolean;
};
export const tableItems: Item[] = [
  {id:'table-transpose',label:'표 뒤집기 · 줄/칸 전치…',key:'T (표 개체)'},
  {id:'table-object-line',label:'표 개체 테두리…',key:'L (표 개체)'},
  {id:'table-object-background',label:'표 개체 채우기…',key:'C (표 개체)'},
  {id:"equal-height",label:"셀 높이를 같게",key:"H (일반 셀 블록)"},
  {id:"equal-width",label:"셀 너비를 같게",key:"W (일반 셀 블록)"},
  {id:"range-size",label:"선택 범위 크기 조절…"},
  { id: "select", label: "셀 블록 선택·확장", key: "F5 · Enter 편집 복귀" },
  { id: 'select-columns', label:'칸 전체 셀 블록',key:'F7 (셀 블록)' },
  {id:'leave',label:'표 빠져나가기',key:'Shift+Esc (일반 인라인 표)'},
  { id: 'select-rows', label: '줄 전체 셀 블록', key: 'F8 (셀 블록)' },
  { id: "text", label: "현재 셀 텍스트 모두 선택", key: "Ctrl+A" },
  { id: "object", label: "표 객체 선택" },
  { id: "previous", label: "이전 셀" },
  { id: "next", label: "다음 셀", key: "Tab" },
  ...(
    [
      "merge",
      "split",
      "row-add",
      "row-delete",
      "col-add",
      "col-delete",
    ] as const
  ).map(
    (operation, n): Item => ({
      id: operation,
      label: [
        "선택 셀 병합",
        "셀 나누기",
        "아래 행 추가",
        "현재 행 삭제 (내용 포함)",
        "오른쪽 열 추가",
        "현재 열 삭제 (내용 포함)",
      ][n],
      key: n === 0 ? "M (F5 블록)" : undefined,
      command: { type: "table-edit", operation },
    }),
  ),
  {
    id: "properties",
    label: "표/셀 속성…",
    command: { type: "cell", props: {} },
  },
  { id: "border-properties", label: "셀 테두리/배경…", command: { type: "cell", props: {} } },
  {id:'block-border',label:'하나의 셀처럼 · 테두리…',key:'B (셀 블록)',command:{type:'cell',props:{},cellScope:'block'}},
  {id:'block-background',label:'하나의 셀처럼 · 배경…',key:'F (셀 블록)',command:{type:'cell',props:{},cellScope:'block'}},
  ...(
    [
      ["width-plus", 300, 0, "너비 늘리기"],
      ["width-minus", -300, 0, "너비 줄이기"],
      ["height-plus", 0, 300, "높이 늘리기"],
      ["height-minus", 0, -300, "높이 줄이기"],
    ] as const
  ).map(
    ([id, width, height, label]): Item => ({
      id,
      label: label + " (3pt)",
      command: { type: "resize", width, height },
    }),
  ),
  ...([['left',-300,0,'현재 셀 너비 줄이기','Shift+←'],['right',300,0,'현재 셀 너비 늘리기','Shift+→'],['up',0,-300,'현재 셀 높이 줄이기','Shift+↑'],['down',0,300,'현재 셀 높이 늘리기','Shift+↓']]as const).map(([id,width,height,label,key]):Item=>({id:'local-'+id,label:label+' (3pt · 이웃 셀 보상)',key,command:undefined})),
  {id:'split-dialog',label:'셀 나누기…',key:'S (일반 셀 블록)'},
  {id:'add-dialog',label:'줄/칸 추가하기…',key:'Alt+Insert'},
  {id:'delete-dialog',label:'줄/칸 지우기…',key:'Alt+Delete'},
  ...([['front','맨 앞으로','Shift+Page Up'],['back','맨 뒤로','Shift+Page Down'],['inFrontOfText','글 앞으로','Shift+Home'],['behindText','글 뒤로','Shift+End']]as const).map(([action,label,key]):Item=>({id:'control-'+action,label,key,command:{type:'control-key',action}})),
  { id: "table-properties", label: "표 전체 속성…", unsupported: true },
  { id: "auto-fit", label: "내용에 맞춰 자동 크기", unsupported: true },
];
export function tableMenuState(editor: Interaction, busy = false, inspectEqual = true, omitCellDialogs = false, previewView?:()=>string|undefined,phase3=false, batchView?:(page:number)=>(()=>string|undefined)|undefined,widthInputs?:WidthPreviewAdmission,passiveView?:()=>string|undefined) {
  let base = "";
  let block='하나의 셀 범위는 일반 셀 블록에서 사용하세요.';
  let columns='F5로 셀 블록을 먼저 선택하세요.';
  let rows = 'F5로 셀 블록을 먼저 선택하세요.';
  try {
    editor.adapter.validate(editor.selection.focus);
    if (editor.selection.focus.kind !== "cell")
      throw Error("표 안에 커서를 놓으세요");
    editor.targets();
  } catch (e) {
    base = String(e);
  }
  if (!base && editor.selection.kind === 'cells') try {
    cellRowBlock(editor.adapter.cells(editor.selection.focus), editor.cells().map(c => c.cellIdx));
    rows = '';
  } catch (error) { rows = String(error); }
  if(!base&&editor.selection.kind==='cells')try{cellColumnBlock(editor.adapter.cells(editor.selection.focus),editor.cells().map(c=>c.cellIdx));columns='';}catch(error){columns=String(error);}
  if(!base&&editor.selection.kind==='cells'&&!nested(editor.selection.focus))try{
    cellBlockMasks(editor.adapter.cells(editor.selection.focus),editor.cells().map(c=>c.cellIdx));block='';
  }catch(error){block=String(error);}
  // Hidden menu projection must not prepare two full-table mutations on every
  // editing paint. Opening/clicking and the actual Command still check fully.
  const equalReasons=new Map<string,string>();if(inspectEqual)for(const axis of ['width','height']as const)try{prepareEqualCells(editor.adapter,editor.selection,axis);}catch(error){equalReasons.set('equal-'+axis,String(error));}
  let draftReason='', ordinaryGrid:ReturnType<Interaction["adapter"]["cells"]>|undefined;
  if(!base)try{
    const p=editor.selection.focus;
    if(p.kind!=='cell'||nested(p))throw Error('이 임의 나누기/줄·칸 창은 병합 없는 일반 표에서 지원합니다. 기존 병합 해제는 별도 명령을 사용하세요.');
    const cells=editor.adapter.cells(p);
    if(cells.some(c=>c.rowSpan!==1||c.colSpan!==1))throw Error('이 임의 나누기/줄·칸 창은 병합 없는 일반 표에서 지원합니다. 기존 병합 해제는 별도 명령을 사용하세요.');
    ordinaryGrid=cells;
  }catch(error){draftReason=String(error);}
  const objectReason=(transpose:boolean)=>{
    const batch=transpose && batchView ? (focus:Position)=>{
      const owner=editor.tableDisplayGridOwner("table");
      if(!owner?.focusIs(focus))return;
      return (page:number)=>{
        if(!owner.current())throw new PassiveOwnerBatchRetired();
        const view=batchView(page);
        return view && editor.passiveTableObjectBatchFence(view,owner);
      };
    } : undefined;
    try {
      selectedTableObject(editor.adapter,editor.selection,transpose,batch);
      return '';
    } catch(e) {
      if(e instanceof PassiveOwnerBatchRetired)try{
        selectedTableObject(editor.adapter,editor.selection,transpose);
        return '';
      }catch(error){return String(error);}
      return String(e);
    }
  };
  const read=(reason:Interaction["tableCommandReason"])=>new Map(
    tableItems.map((item) => [
      item.id,
      omitCellDialogs && cellDialogMode(item.id) ? "" : item.unsupported
        ? "현재 UI 연결 미지원"
        : busy
          ? "입력 처리 중"
          : item.id==='range-size' ? tableRangeSizeReason(editor)
          : item.id.startsWith('local-')?base||editor.localResizeReason(localResizeCommand(item.id.slice(6))!):item.id.startsWith('table-object-')||item.id==='table-transpose'?objectReason(item.id==='table-transpose'):base || equalReasons.get(item.id) || (['split-dialog','add-dialog','delete-dialog'].includes(item.id)?draftReason|| (item.id==='split-dialog'&&editor.selection.kind!=='cells'?'F5로 나눌 셀을 선택하세요.':''):'') || (item.id === 'select-rows' ? rows : item.id==='select-columns'?columns:'') || (item.id.startsWith('block-')?block:'') ||
            (item.command ? reason(item.command) : ""),
    ]),
  );
  return !busy && !base && !draftReason && previewView
    ? editor.withTableMenuPreview(ordinaryGrid,previewView,read,phase3,undefined,widthInputs)
    : read(passiveView && !busy && !base && !inspectEqual && !widthInputs
      ? command=>editor.perf4PassiveTableReason(command,passiveView)
      : editor.tableCommandReason.bind(editor));
}
export function mountTableMenu(
  root: HTMLDetailsElement,
  editor: Interaction,
  busy: () => boolean,
  run: (item: Item,target?:ReturnType<Interaction["capture"]>) => void,
  feedback: (message: string) => void = () => {},
) {
  const panel = root.querySelector<HTMLElement>("[data-table-panel]")!,
    buttons = new Map<string, HTMLButtonElement>();
  let captured: ReturnType<Interaction["capture"]> | undefined;
  let presentation: ReturnType<typeof mountTableMenuUI1> | undefined;
  const command = cellDialogFor(root.ownerDocument);
  let closedByCell = false;
  const openCellDialog = (mode: CellDialogMode) => command?.open(mode, captured, () => {
    if (root.open) closedByCell = true;
    root.open = false;
  }) ?? false;
  const refresh = (opening = false,widthInputs?:WidthPreviewAdmission,passiveView?:()=>string|undefined) => {
    const doc=root.ownerDocument;
    const preview=!opening && tablePreviewLiteOptIn(doc.defaultView)
      ? ()=>doc.fonts.status==="loaded" ? doc.getElementById("status-zoom")?.textContent ?? undefined : undefined
      : undefined;
    const batchView=!opening && stage5OwnerBatchOptIn(doc.defaultView) && editor.adapter.passiveOwnerBatchAvailable()
      ? (page:number)=>passiveBatchScreenWitness(doc,page)
      : undefined;
    if (!opening && !activeMenuDemand(root)) return;
    const states = tableMenuState(editor, busy(), opening || root.open, !!command,preview,phase3LiteOptIn(doc.defaultView),batchView,widthInputs,passiveView);
    for (const item of tableItems) {
      const b = buttons.get(item.id)!;
      if(item.id==='range-size')b.hidden=!hasNativeTrackResize(editor.adapter);
      if (!command || !cellDialogMode(item.id)) {
        b.disabled = !!states.get(item.id);
        b.title = states.get(item.id) || item.key || item.label;
      }
      if (!presentation?.owns(item.id)) b.textContent =
        (item.id === "split"
          ? nested(editor.selection.focus)
            ? "병합 해제 (원래 그리드)"
            : "셀 나누기 (1행×2열)"
          : item.label) + (item.key ? ` · ${item.key}` : "");
      if (item.id === "select" || item.id === "object")
        b.setAttribute(
          "aria-pressed",
          String(
            editor.selection.kind ===
              (item.id === "select" ? "cells" : "table"),
          ),
        );
    }
    presentation?.sync(nested(editor.selection.focus));
  };
  const activeMenuDemandIsScoped=()=>activeWorkset(root.ownerDocument);
  const invoke = (id: string, target = captured) => {
    const item = tableItems.find(row=>row.id===id);
    if(!item)return;
    const mode = cellDialogMode(id);
      if (mode && command) { command.open(mode,target,()=>{ if(root.open)closedByCell=true;root.open=false; }); return; }
      const reason = tableMenuState(editor, busy()).get(item.id);
      if (reason) {
        feedback(reason);
        refresh();
        return;
      }
      const now = editor.capture();
      if (
        target &&
        (target.documentId !== now.documentId ||
          target.revision !== now.revision ||
          JSON.stringify(target.selection) !== JSON.stringify(now.selection) ||
          activeMenuDemandIsScoped() && JSON.stringify(target.paths) !== JSON.stringify(now.paths))
      ) {
        root.open = false;
        feedback("문서·리비전·선택이 변경되었습니다. 메뉴를 다시 여세요.");
        root.querySelector<HTMLElement>("summary")!.focus();
        return;
      }
      root.open = false;
      run(item,item.id==='range-size'||activeMenuDemandIsScoped()&&item.command ? target??now : undefined);
      refresh();
  };
  for (const item of tableItems) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.tableAction = item.id;
    if(item.id==='range-size')b.hidden=!hasNativeTrackResize(editor.adapter);
    const mode = cellDialogMode(item.id);
    if (mode && command) command.bind(b, mode, item.key || item.label);
    b.onclick=()=>invoke(item.id);
    buttons.set(item.id, b);
    panel.append(b);
  }
  presentation = mountTableMenuUI1(root,buttons,busy);
  const summary = root.querySelector<HTMLElement>(":scope>summary")!;
  const openingPointer = (e: PointerEvent) => { if (!root.open && summary.contains(e.target as Node) && !busy()) captured = editor.capture(); };
  const openingFocus = (e: FocusEvent) => { if (!root.open && e.target === summary && !busy()) captured = editor.capture(); };
  const openingMenu = () => {
    if (!busy()) captured = editor.capture();
    refresh(true);
  };
  const openingClick = () => { if (!root.open) openingMenu(); };
  root.addEventListener("pointerdown",openingPointer); root.addEventListener("focusin",openingFocus);
  summary.addEventListener("click",openingClick); root.addEventListener("rhwp:menu-opening",openingMenu);
  root.addEventListener("toggle", () => {
    // Native toggle delivery can follow a rapid editor selection change.
    // Keep the synchronous opening capture rather than admitting that change.
    captured = root.open ? captured ?? editor.capture() : undefined;
    if (!root.open && closedByCell) { closedByCell = false; return; }
    closedByCell = false;
    refresh();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      e.stopPropagation();
      root.open = false;
      root.ownerDocument.getElementById("input")?.focus();
    }
  });
  root.addEventListener("pointerdown", (e) => {
    if (busy()) e.preventDefault();
  });
  const outside = (e: PointerEvent) => {
    if (!root.contains(e.target as Node)) root.open = false;
  };
  // Shared menu lifetime owns outside pointer and window blur.
  refresh();
  return Object.assign(refresh, {
    openCellDialog, invoke,
    state:()=>tableMenuState(editor,busy(),true,!!command),
    pressed:(id:string)=>id==="select"||id==="object"?String(editor.selection.kind===(id==="select"?"cells":"table")):null,
    dispose: () => { document.removeEventListener("pointerdown", outside); root.removeEventListener("pointerdown",openingPointer); root.removeEventListener("focusin",openingFocus); summary.removeEventListener("click",openingClick); root.removeEventListener("rhwp:menu-opening",openingMenu); presentation?.dispose(); },
  });
}
