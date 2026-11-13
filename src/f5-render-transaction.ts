import type {CellBox,Position,Selection} from "./model.js";

export type F5Epoch = Readonly<{
  docId:string; revision:number; selectionGen:number; layoutGen:number; fontEpoch:number;
  state:string; native?:number;
}>;
type Cell=Extract<Position,{kind:"cell"}>;
type Rect=Readonly<{pageIndex:number;x:number;y:number;height:number}>;
type Band=Readonly<{pageIndex:number;x:number;y:number;width:number;height:number}>;
type EpochCheck=()=>F5Epoch|undefined;
export type ActionReceipt=Readonly<{id:number;epoch:F5Epoch;phase:1|2|3;anchor:Readonly<Cell>;owner:Readonly<Cell>;
  caret:Rect;block:readonly Band[];cells:readonly number[]}>;
type Projection = {receipt:ActionReceipt; mounted:()=>boolean; live:EpochCheck};
type Delivery = "scheduled"|"first-use"|"fallback";
type Settlement = Readonly<{id:number; selectionGen:number; outcome:Delivery|"retired"|"failed"}>;
type Job = {value:Projection; cancel?:()=>void; revoked?:boolean; refresh:(delivery:Delivery)=>boolean};
type Modal = {dialog:object; value?:Projection; armed:boolean};
const same=(a:F5Epoch|undefined,b:F5Epoch|undefined)=>!!a&&!!b&&a.docId===b.docId&&a.revision===b.revision&&
  a.selectionGen===b.selectionGen&&a.layoutGen===b.layoutGen&&a.fontEpoch===b.fontEpoch&&a.native===b.native&&a.state===b.state;

export function qaF5SliceFlag(url:string){
  try {
    const u=new URL(url);
    return u.protocol==="http:" && u.hostname==="127.0.0.1" &&
      u.searchParams.getAll("oneditQaF5Slice").length===1 && u.searchParams.get("oneditQaF5Slice")==="1";
  } catch {return false;}
}
export const f5SliceEnabled=typeof window!=="undefined"&&window.parent===window&&qaF5SliceFlag(window.location.href);
const traceEnabled=f5SliceEnabled && new URL(window.location.href).searchParams.getAll("oneditQaReadLifetimes").join("/")==="1";

const int=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const usableEpoch=(e:F5Epoch)=>typeof e.docId==="string"&&e.docId.length>0&&
  [e.revision,e.selectionGen,e.layoutGen,e.fontEpoch].every(int)&&typeof e.state==="string"&&e.state.length>0;
const flat=(p:Cell)=>!p.ancestors?.length&&[p.sec,p.para,p.control,p.cell,p.cellPara,p.offset].every(int);
export function ordinaryF5Grid(s:Selection,boxes:readonly CellBox[]){
  if(s.kind!=="cells"||!flat(s.anchor)||!flat(s.focus)||s.anchor.sec!==s.focus.sec||
    s.anchor.para!==s.focus.para||s.anchor.control!==s.focus.control||boxes.length!==12)return false;
  const page=boxes[0].pageIndex, cells=new Set(boxes.map(x=>x.cellIdx));
  return int(page)&&cells.size===12&&cells.has(s.anchor.cell)&&cells.has(s.focus.cell)&&
    new Set(boxes.map(x=>x.row+":"+x.col)).size===12&&boxes.every(b=>b.pageIndex===page&&b.rowSpan===1&&
      b.colSpan===1&&[b.row,b.col,b.cellIdx].every(int)&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>0&&b.h>0);
}

/** Presentation-only transaction. Product commands never consume it. The
 * owned synchronous writer commits geometry before the existing state event;
 * the same action owns one replaceable passive projection ticket. */
export function createF5RenderTransaction(){
  let serial=0, retired=0, completed=0, discarded=0, reusedCloses=0, fallbacks=0, failed=0;
  let draft:{id:number; epoch:F5Epoch; live:EpochCheck; writing:boolean; value?:Projection}|undefined;
  let latest:Projection|undefined, pending:Job|undefined, running:Job|undefined, modal:Modal|undefined;
  let lastSettled:Settlement|undefined;
  let ambiguousClose=false;
  type Trace={stage:string;id?:number;expected?:F5Epoch;actual?:F5Epoch;fields?:string[]};
  const trace:Trace[]=[];
  const mark=(stage:string,id?:number,expected?:F5Epoch,actual?:F5Epoch)=>{
    if(!traceEnabled)return;
    if(trace.length===96)trace.shift();
    const fields=expected&&actual?["docId","revision","selectionGen","layoutGen","fontEpoch","native","state"]
      .filter(k=>expected[k as keyof F5Epoch]!==actual[k as keyof F5Epoch]):undefined;
    trace.push({stage,id,expected,actual,fields});
  };
  const stable=(epoch:F5Epoch,live:EpochCheck,stage="valid",id?:number)=>{
    try {
      const actual=live();
      const ok=same(epoch,actual);
      if(!ok)mark(stage,id,epoch,actual);
      return ok;
    }catch{mark(stage+"-error",id,epoch);return false;}
  };
  const valid=(value:Projection,stage="valid")=>{
    const {id,epoch}=value.receipt;
    if(!stable(epoch,value.live,stage,id))return false;
    try{if(value.mounted())return true;}catch{/* stale DOM */}
    mark(stage+"-mount",id,epoch);return false;
  };
  const note=(job:Job,outcome:Settlement["outcome"])=>{
    const {id,epoch}=job.value.receipt;
    lastSettled=Object.freeze({id,selectionGen:epoch.selectionGen,outcome});
    mark("settled-"+outcome,id,epoch);
  };
  const forget=(value:Projection)=>{if(latest===value)latest=undefined;};
  // Even if cancellation races an already-dispatched callback, ownership of
  // the job has already been revoked. Cancellation is only resource cleanup.
  const cancel=(job:Job)=>{try{job.cancel?.();}catch{/* callback is fenced by pending identity */}};
  const retire=()=>{
    if(running)running.revoked=true;
    if(pending){const p=pending;pending=undefined;retired++;forget(p.value);note(p,"retired");cancel(p);}
  };
  const clear=()=>{retire();latest=undefined;draft=undefined;if(modal)modal.armed=false;};
  function publish(job:Job,delivery:Delivery){
    if(running){retired++;forget(job.value);note(job,"retired");return;}
    running=job;
    mark("running-"+delivery,job.value.receipt.id);
    try {
      if(delivery==="fallback")fallbacks++;
      const published=job.refresh(delivery);
      if(delivery==="fallback"){note(job,"fallback");return;}
      if(published===true&&!job.revoked&&valid(job.value,"after-publish")){
        completed++;note(job,delivery);
      }else{
        retired++;forget(job.value);note(job,"retired");
      }
    } catch(error) {
      failed++;forget(job.value);note(job,"failed");throw error;
    } finally {running=undefined;}
  }
  function deliver(job:Job,firstUse=false){
    if(pending!==job){discarded++;return;}
    pending=undefined;
    // Invalidate before invoking a fresh authority refresh. A stale ticket
    // cannot be certified by whatever the current UI now happens to show.
    if(!valid(job.value,"before-publish")){
      retired++;forget(job.value);
      if(firstUse)cancel(job);
      publish(job,"fallback");
    }else{
      if(firstUse)cancel(job);
      publish(job,firstUse?"first-use":"scheduled");
    }
  }
  function finish(id:number,ok:boolean){
    if(draft?.id!==id)return;
    draft=undefined;
    if(!ok||!latest||!valid(latest,"finish")){
      const job=pending?.value.receipt.id===id?pending:undefined;
      clear();
      if(job)publish(job,"fallback");
    }
  }
  return {
    begin(epoch:F5Epoch,live:EpochCheck){
      if(running||draft||!usableEpoch(epoch)||!stable(epoch,live,"begin"))return undefined;
      retire();latest=undefined;
      draft={id:++serial,epoch:Object.freeze({...epoch}),live,writing:false};
      mark("begun",draft.id,draft.epoch);
      return draft.id;
    },
    write(id:number,publish:()=>void){
      if(draft?.id!==id||draft.writing)return false;
      if(!stable(draft.epoch,draft.live,"write",id)){finish(id,false);return false;}
      draft.writing=true;
      try { publish(); }
      catch(error) {
        try { finish(id,false); } catch {/* preserve the authoritative writer error */}
        throw error;
      }
      finish(id,true);
      return true;
    },
    collecting(){return draft?.writing===true;},
    visual(id:number,selection:Selection,caret:Rect,block:readonly Band[],cells:readonly number[],mounted:()=>boolean){
      if(!draft?.writing||draft.id!==id||draft.value||selection.kind!=="cells"||!stable(draft.epoch,draft.live,"visual",id)||
        !flat(selection.anchor)||!flat(selection.focus)||
        selection.anchor.sec!==selection.focus.sec||selection.anchor.para!==selection.focus.para||
        selection.anchor.control!==selection.focus.control||
        (selection.phase!==1&&selection.phase!==2&&selection.phase!==3)||
        !cells.includes(selection.anchor.cell)||!cells.includes(selection.focus.cell)||
        (selection.phase===3&&cells.length!==12)||!mounted()||
        ![caret.x,caret.y,caret.height].every(Number.isFinite)||!int(caret.pageIndex)||caret.height<=0||
        !block.length||block.length>12||!block.every(b=>b.pageIndex===caret.pageIndex&&[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0)||
        !cells.length||cells.length>12||new Set(cells).size!==cells.length||!cells.every(int))return;
      const pos=({kind,sec,para,control,cell,cellPara,offset}:Cell)=>Object.freeze({kind,sec,para,control,cell,cellPara,offset});
      const receipt=Object.freeze({id,epoch:draft.epoch,phase:selection.phase,anchor:pos(selection.anchor),owner:pos(selection.focus),
        caret:Object.freeze({pageIndex:caret.pageIndex,x:caret.x,y:caret.y,height:caret.height}),
        block:Object.freeze(block.map(({pageIndex,x,y,width,height})=>Object.freeze({pageIndex,x,y,width,height}))),
        cells:Object.freeze([...cells])});
      draft.value={receipt,mounted,live:draft.live};
      mark("visual-mounted",id,draft.epoch);
    },
    commitVisual(){
      if(draft?.value&&valid(draft.value,"commit-visual")){latest=draft.value;mark("visual-committed",latest.receipt.id);}
    },
    offer(schedule:(f:()=>void)=>()=>void,refresh:Job["refresh"]){
      if(!draft?.writing||!latest||latest.receipt.id!==draft.id||running||!valid(latest))return false;
      if(pending?.value===latest)return true;
      retire();
      const job:Job={value:latest,refresh};
      pending=job;
      mark("queued",job.value.receipt.id);
      let armed=false,inline=false;
      try{
        job.cancel=schedule(()=>{
          if(!armed){inline=true;return;}
          deliver(job);
        });
        if(inline||pending!==job){
          if(pending===job)retire();else cancel(job);
          return false;
        }
        armed=true;
        return true;
      }catch{if(pending===job)retire();return false;}
    },
    /** A first user interaction never waits for a queued passive projection. */
    flush(){
      const job=pending;
      if(!job)return false;
      deliver(job,true);return true;
    },
    retire,
    clear,
    replaceDocument(documentId: string){
      // A historical settlement is useful diagnostic evidence. It must not
      // leave a retained projection, pending callback or armed old modal.
      if ([latest?.receipt.epoch.docId, draft?.epoch.docId,
          pending?.value.receipt.epoch.docId, running?.value.receipt.epoch.docId,
          modal?.value?.receipt.epoch.docId].some(id=>id!==undefined&&id!==documentId)) {
        clear();modal=undefined;ambiguousClose=false;
      }
    },
    open(dialog:object){
      if(modal)ambiguousClose=true;
      modal={dialog,value:latest&&valid(latest)?latest:undefined,armed:false};
    },
    armClose(dialog:object){
      if(modal?.dialog===dialog&&modal.value&&!ambiguousClose&&latest===modal.value&&valid(modal.value))modal.armed=true;
    },
    closed(dialog:object,stillOpen:boolean){
      const m=modal;
      if(stillOpen){ambiguousClose=true;return false;}
      modal=undefined;
      const ambiguous=ambiguousClose;ambiguousClose=false;
      return !ambiguous&&m?.dialog===dialog&&m.armed&&!!m.value&&latest===m.value&&valid(m.value);
    },
    isCurrent(){return !!latest&&valid(latest);},
    reusedClose(){reusedCloses++;},
    counters(){return {retired,completed,discarded};},
    snapshot(observed?:F5Epoch){
      let mounted=false;
      if(traceEnabled&&latest)try{mounted=latest.mounted();}catch{/* QA evidence only */}
      return {receipt:latest?.receipt,pending:pending?.value.receipt.id,running:running?.value.receipt.id,lastSettled,
        retired,completed,discarded,reusedCloses,fallbacks,failed,
        ...(traceEnabled?{trace:trace.map(x=>({...x,fields:x.fields?.slice()})),observed,
          mounted,receiptCurrent:mounted&&same(latest?.receipt.epoch,observed),
          uiCompleted:!!latest&&lastSettled?.id===latest.receipt.id&&
            (lastSettled.outcome==="scheduled"||lastSettled.outcome==="first-use")}:{} )};
    },
  };
}
export const f5Render=createF5RenderTransaction();
