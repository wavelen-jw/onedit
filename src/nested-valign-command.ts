import { isB338OwnerTrialDigest } from "./b338-focused-owner-trial.js";
import type {Interaction} from "./interaction.js";
import {cellPath,nested,type Props} from "./model.js";
import {coreRuntimeIdentity} from "./core-runtime.js";

type Align=0|1|2;
const alignment=(v:unknown):v is Align=>v===0||v===1||v===2;
const nat=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const text=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=160;
type Json=Record<string,unknown>;
function record(v:unknown):Json {
  if(!v||typeof v!=="object"||Array.isArray(v))throw Error("중첩 셀 응답을 확인할 수 없습니다.");
  return v as Json;
}
export function nestedValignTrialEnabled(win:Window) {
  const url=new URL(win.location.href),p=url.searchParams.getAll("oneditQaNestedValign");
  return win.parent===win&&url.protocol==="http:"&&url.hostname==="127.0.0.1"&&p.length===1&&p[0]==="1";
}
export function nestedValignSupported(editor:Interaction,doc:Document) {
  return !!doc.defaultView&&nestedValignTrialEnabled(doc.defaultView)&&isB338OwnerTrialDigest(coreRuntimeIdentity(editor.adapter.doc)?.sha256);
}
function target(editor:Interaction,doc:Document) {
  const a=editor.adapter,s=editor.selection,p=s.focus;
  if(!nestedValignSupported(editor,doc)||p.kind!=="cell"||!nested(p))throw Error("일반 셀을 선택하세요.");
  if(doc.fonts.status!=="loaded"||a.transientEdit||a.hasPendingLocalBodyFlow()||a.localBodyEnvironmentToken()===undefined)
    throw Error("글꼴 또는 입력·쪽 배치가 끝난 뒤 다시 시도하세요.");
  if(a.scope!=="edit"||a.documentLocked||a.viewerOnlyReason)throw Error("읽기 전용 문서입니다.");
  if(p.sec!==0||p.ancestors?.length!==1||a.pageCount!==1||a.doc.getSectionCount()!==1)
    throw Error("한 쪽 안의 일반 중첩 셀 한 개만 조정할 수 있습니다.");
  const hops=cellPath(p);
  const kind=s.kind==="caret"?"caret":s.kind==="cells"&&s.phase===1&&s.anchor.sec===p.sec&&s.anchor.para===p.para&&
    JSON.stringify(cellPath(s.anchor))===JSON.stringify(hops)?"singleCellF5":null;
  if(!kind||!nat(editor.currentSelectionGeneration)||!nat(a.revision)||!nat(p.para)||hops.length!==2||
    !hops.every(h=>[h.controlIndex,h.cellIndex,h.cellParaIndex].every(nat)))throw Error("중첩 셀 한 개를 선택하세요.");
  const selection={path:{section:p.sec,rootParagraph:p.para,hops},kind,selectionEpoch:String(editor.currentSelectionGeneration)};
  return {native:a.doc,documentId:a.documentId,revision:a.revision,selection};
}
function same(a:ReturnType<typeof target>,b:ReturnType<typeof target>) {
  return a.native===b.native&&a.documentId===b.documentId&&a.revision===b.revision&&JSON.stringify(a.selection)===JSON.stringify(b.selection);
}
function refusal(reason:unknown) {
  if(reason==="protected")return "보호된 셀은 편집할 수 없습니다.";
  if(reason==="noObservableMotion")return "이 셀은 내용의 세로 위치를 바꿀 수 없어 변경하지 않았습니다.";
  if(reason==="staleTicket"||reason==="ownerMismatch"||reason==="staleNativeRevision")return "셀 또는 선택이 바뀌었습니다. 속성을 다시 여세요.";
  return "이 중첩 셀의 세로 정렬은 변경할 수 없습니다.";
}
function recovery(editor:Interaction):never {
  const a=editor.adapter;
  a.scope="readonly";
  a.viewerOnlyReason="문서 원복을 확인할 수 없어 읽기 전용으로 보호했습니다.";
  throw Error(a.viewerOnlyReason);
}
export function captureNestedValign(editor:Interaction,doc:Document) {
  const fence=target(editor,doc),a=editor.adapter;
  const p=record(a.call("oneditPrivateNestedValignCaptureV1",JSON.stringify(fence.selection)));
  if(p.status==="recoveryRequired")return recovery(editor);
  if(p.status==="refused"&&text(p.reason))throw Error(refusal(p.reason));
  if(p.status!=="ready"||p.version!==1||!text(p.ownerToken)||!text(p.expectedRevision)||
    p.selectionEpoch!==fence.selection.selectionEpoch||!alignment(p.verticalAlign)||!Array.isArray(p.topology)||p.topology.length!==2||
    !Array.from(p.topology).every((v,i)=>{
      const l=record(v);return l.cellIndex===fence.selection.path.hops[i].cellIndex&&l.rowSpan===1&&l.colSpan===1&&
        l.cellProtected===false&&l.tableLocked===false&&l.sizeProtected===false&&
        Array.isArray(l.fragmentPages)&&l.fragmentPages.length===1&&l.fragmentPages[0]===0;
    })||!same(fence,target(editor,doc)))throw Error("현재 중첩 셀을 확인할 수 없습니다.");
  return Object.freeze({fence,ownerToken:p.ownerToken,expectedRevision:p.expectedRevision,verticalAlign:p.verticalAlign});
}
export type NestedValignDraft=ReturnType<typeof captureNestedValign>;

export function applyNestedValign(editor:Interaction,doc:Document,draft:NestedValignDraft,delta:Props) {
  const current=target(editor,doc);
  if(!same(draft.fence,current))throw Error("문서 또는 선택이 바뀌었습니다. 속성을 다시 여세요.");
  if(Object.keys(delta).some(x=>x!=="verticalAlign"))throw Error("중첩 셀에서는 세로 정렬만 바꿀 수 있습니다.");
  const next=delta.verticalAlign??draft.verticalAlign;
  if(!alignment(next))throw Error("세로 정렬 값이 올바르지 않습니다.");
  const a=editor.adapter;
  let outcome:"applied"|"unchanged"|"refused"|undefined, reason:unknown;
  editor.history.transact("중첩 셀 세로 정렬",editor.selection,()=>{
    const live=target(editor,doc);
    if(!same(current,live))throw Error("문서 또는 선택이 바뀌었습니다. 속성을 다시 여세요.");
    let r:Json;
    try {r=record(a.call("oneditPrivateNestedValignApplyV1",JSON.stringify({
      selection:live.selection,ownerToken:draft.ownerToken,expectedRevision:draft.expectedRevision,expectedCurrent:draft.verticalAlign,next,
    })));} catch {return recovery(editor);}
    if(r.status==="refused"&&text(r.reason)){outcome="refused";reason=r.reason;}
    else if(r.status==="applied"&&r.verticalAlign===next&&next!==draft.verticalAlign)outcome="applied";
    else if(r.status==="unchanged"&&r.verticalAlign===draft.verticalAlign&&next===draft.verticalAlign)outcome="unchanged";
    else return recovery(editor);
    return editor.selection;
  },()=>outcome!=="applied",undefined,true);
  if(outcome==="refused")throw Error(refusal(reason));
  if(outcome==="applied")editor.history.endTypingRun();
}
