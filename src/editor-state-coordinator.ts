import type { Interaction } from "./interaction.js";
import type { WidthEvent } from "./width-preview-reads.js";
import { OwnerProjection } from "./owner-projection.js";
import { samePosition, type ParagraphTarget } from "./model.js";
import { coreRuntimeHasUpdateReadProvenance } from "./core-runtime.js";

type View = () => string | undefined;
type Consumer = "selection" | "toolbar" | "toolbar-status" | "quick-values" | "quick-format" | "edit-format" | "cell-modal" | "selection-status";
type Reader<T> = (owners?:OwnerProjection, retry?:boolean)=>T;
type Proof = { documentId:string; revision:number; selectionGeneration:number; targetId:string; view:string };
type Receipt = {owners:OwnerProjection; current:()=>boolean; proof:Proof};
type Frame = {reading:boolean; retired:boolean; receipt?:Receipt; used?:Set<Consumer>; changedApply:boolean};
type Ledger = {width:(WidthEvent&{scope:number})[];entries:number; captures:number; fallbacks:number; cohorts:Consumer[][]; changedApply: {proof?:Proof; consumers:Consumer[]; live:boolean}[]; consumers:Partial<Record<Consumer,number>>};
const counters=():Ledger=>({width:[],entries:0,captures:0,fallbacks:0,cohorts:[],changedApply:[],consumers:{}});
const coordinators=new WeakMap<Interaction,EditorStateCoordinator>();

/** One read-only structural publication. No geometry, format value, native
 * document, positive permission or executable ticket crosses the callback. */
export class EditorStateCoordinator {
  private frame?:Frame;
  private meter?:Ledger;
  constructor(private editor:Interaction,private view:View,trace=false,readonly groupChangedApply=false, readonly syncDisplay=false) {
    if(trace)this.meter=counters();
  }
  widthRead(scope:number,event:WidthEvent) {
    if(this.meter&&this.meter.width.length<256)this.meter.width.push({scope,...event});
  }
  observedView() {return this.view();}
  observation(reset=false) {
    const r=this.meter&&structuredClone(this.meter);
    if(reset&&this.meter)this.meter=counters();
    return r;
  }
  private retire(f:Frame) {f.retired=true;f.receipt?.owners.close();}
  changedApplyReady() {
    const f=this.frame,r=f?.receipt;
    return !!(f?.changedApply&&r?.current()&&r.owners.isCurrent(this.editor.adapter)&&
      f.used?.has("selection")&&f.used.has("toolbar")&&f.used.has("quick-format"));
  }
  publish<T>(run:()=>T,changedApply=false):T {
    const outer=this.frame;
    if(outer){
      // A managed render can contain a nested named publisher; a reentrant
      // callback during a native reader cannot use that publication.
      if(outer.reading)this.retire(outer);
      return run();
    }
    const f:Frame={reading:false,retired:false,changedApply:changedApply&&this.groupChangedApply};this.frame=f;
    if(this.meter)this.meter.entries++;
    try{return run();}
    finally{
      if(f.used?.size&&this.meter&&this.meter.cohorts.length<256)this.meter.cohorts.push([...f.used]);
      if(f.changedApply&&this.meter&&this.meter.changedApply.length<64)
        this.meter.changedApply.push({proof:f.receipt?.proof,consumers:[...(f.used??[])],live:this.changedApplyReady()});
      this.retire(f);this.frame=undefined;
    }
  }
  private capture(f:Frame):Receipt|undefined {
    const e=this.editor,a=e.adapter;
    if(!a.heightCandidateIdentified||!coreRuntimeHasUpdateReadProvenance(a.doc))return;
    const safeView=()=>{try{return this.view();}catch{return undefined;}};
    const view=safeView(),owner=e.tableDisplayGridOwner("caret");
    if(view===undefined||!owner||!owner.current())return;
    const current=()=>!f.retired&&safeView()===view&&owner.current();
    let target:ParagraphTarget|undefined;
    const selection=a.resolveSelection(owner.ref,t=>{target=t;});
    if(selection.kind!=="caret"||selection.focus.kind!=="cell"||!samePosition(selection.focus,e.selection.focus)||
       !current()||!owner.matches(selection.focus,target)||a.readStructural("getSectionCount")!==1)return;
    const owners=new OwnerProjection(a,current,this.syncDisplay?{focus:{...selection.focus}}:undefined);
    // Existing bounded, validated DTO, with first-match semantics. Focused
    // Lite is kept for its previous callers; it cannot replace global rows.
    const rows=owners.lists(a),p=selection.focus;
    if(!owners.isCurrent(a)||!current()){owners.close();return;}
    const selected=owners.findCell(a,rows,p.sec,0,p.para,p.control,p.cell);
    if(!selected||p.cellPara>=selected.paraCount||
       rows.some(r=>r.isCell&&r.sectionIndex===p.sec&&r.hostListId===0&&
         r.hostPara===p.para&&r.controlIndex===p.control&&(r.rowSpan!==1||r.colSpan!==1))){
      owners.close();return;
    }
    if(this.meter)this.meter.captures++;
    return {owners,current,proof:{documentId:a.documentId,revision:a.revision,
      selectionGeneration:e.currentSelectionGeneration,targetId:target!.targetId,view}};
  }
  read<T>(consumer:Consumer,run:Reader<T>,legacy:()=>T):T {
    const f=this.frame;
    if(!f||f.retired){if(f?.changedApply&&this.meter)this.meter.fallbacks++;return legacy();}
    if(f.reading){this.retire(f);if(f.changedApply&&this.meter)this.meter.fallbacks++;return legacy();}
    const a=this.editor.adapter;
    f.reading=true;
    try {
      if(!f.receipt){
        try{f.receipt=this.capture(f);}
        catch{this.retire(f);}
      }
      const r=f.receipt;
      if(!r||!r.current()||!r.owners.isCurrent(a)){
        this.retire(f);if(this.meter)this.meter.fallbacks++;return legacy();
      }
      const result=a.withOwnerReads(()=>run(r.owners),r.owners);
      if(!r.current()||!r.owners.isCurrent(a)){
        this.retire(f);if(this.meter)this.meter.fallbacks++;
        return run(undefined,true);
      }
      if(this.meter){
        this.meter.consumers[consumer]=(this.meter.consumers[consumer]??0)+1;
      }
      if(this.meter||f.changedApply)(f.used??=new Set()).add(consumer);
      return result;
    }catch(error){this.retire(f);throw error;}
    finally{f.reading=false;}
  }
}

export function configureEditorDisplay(editor:Interaction, view:View, url:string,standalone:boolean) {
  const u=new URL(url), local=standalone&&u.protocol==="http:"&&u.hostname==="127.0.0.1";
  const flag=(name:string)=>local&&u.searchParams.getAll(name).length===1&&u.searchParams.get(name)==="1";
  const enabled=flag("oneditQaEditorCoordinator"),trace=flag("oneditQaEditorCoordinatorTrace");
  const synchronous=flag("oneditQaSynchronousDisplay");
  const c=enabled?new EditorStateCoordinator(editor,view,trace,flag("oneditQaChangedApplyDisplay")&&!synchronous,synchronous):undefined;
  if(c)coordinators.set(editor,c);
  return trace?(reset=false)=>c?.observation(reset)??counters():undefined;
}
export const changedApplyDisplayEnabled=(editor:Interaction)=>coordinators.get(editor)?.groupChangedApply===true;
export const noteWidthRead=(editor:Interaction,scope:number,event:WidthEvent)=>coordinators.get(editor)?.widthRead(scope,event);
export const observedDisplayView=(editor:Interaction)=>coordinators.get(editor)?.observedView();
export const synchronousDisplayEnabled=(editor:Interaction)=>coordinators.get(editor)?.syncDisplay===true;
export const changedApplyDisplayReady=(editor:Interaction)=>coordinators.get(editor)?.changedApplyReady()===true;
export function publishEditorDisplay<T>(editor:Interaction,run:()=>T,changedApply=false):T {
  const c=coordinators.get(editor);
  return c?c.publish(run,changedApply):run();
}
export function readEditorDisplay<T>(editor:Interaction,consumer:Consumer,read:Reader<T>,legacy:()=>T=()=>read()):T {
  const c=coordinators.get(editor);
  return c?c.read(consumer,read,legacy):legacy();
}
