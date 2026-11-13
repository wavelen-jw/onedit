import type { HwpDocument } from "../development/core/rhwp.js";
import { result } from "./adapter-core.js";

export const cursorMemoRawUnits = 131072;
export const cursorMemoRows = 1024;
// Reviewed on this glue + Core only. All other methods, including methods
// whose names look like reads, conservatively invalidate before execution.
const irReaders = new Set([
  "getCursorModel","getDocumentInfo","getSectionCount","getParagraphCount","getParagraphLength","getLogicalLength",
  "getTextRange","getCellParagraphCount","getCellParagraphCountByPath","getCellParagraphLength","getCellParagraphLengthByPath",
  "getTextInCell","getTextInCellByPath","textToLogicalOffset","logicalToTextOffset",
  "getCellOwnProperties","getCellProperties","getTableProperties","getPageDef","getColumnDef","getParaShapeSet",
  "getCellCharPropertiesAt","getCharPropertiesAt","getCellParaPropertiesAt",
  "getCellParaPropertiesByPath","getParaPropertiesAt","getCharShapeRuns",
  "captureCellParagraphPath","resolveCellParagraphPath","validateCellParagraphPath",
  "getPageTextLayout","getPageControlLayout","getTableCellBboxes","getTableCellBboxesByPath",
  "getCursorRect","getCursorRectInCell","getLineInfo","getCursorRectOnLine",
  "getPageInfo","getCaretStops","getControls","getObjects","getControlTextPositions","getBodyInlineTables",
  "getDpi","getShowParagraphMarks","getShowControlCodes","getShowTransparentBorders","pageCount","renderPageSvg",
  "oneditFocusedCellContextLiteV1","oneditCursorOwnerRowsBatchV1","oneditSelectionTargetContextLiteV1",
  // Exact W7b63 wasm_api -> property_projection.rs. Borrowed IR/owner
  // generations and local JSON only, including effective border and table fields.
  "oneditTablePropertyProjectionV1",
  // Exact W7b63 only. These three bindings return local values from
  // existing table/cell/format fields. In particular, the char-run API's
  // &mut path helper borrows but never writes the resolved paragraph.
  "getTableDimensions","getCellTextDirection","getCharShapeRunsInCellByPath",
  // W802e wasm_api.rs:9278 -> nested_clipboard.rs:170-205: &self exact
  // path identity only. Not canonical uniqueness or write authorization.
  "getClipboardTarget",
]);
type Key = readonly [id:string,revision:number,environment:string|number|undefined,mode:"edit"|"readonly",locked:boolean,viewer:string|undefined];
type Reason = "first"|"adapter-state"|"mutation"|"render-environment"|"command"|"guarded"|"pending"|
  "capacity"|"shape"|"late"|"closed"|"error"|"outside-read"|"retired-read";
type Counter = Readonly<{
  epoch:number; rawHits:number; parsedHits:number; nativeReads:number; parses:number;
  units:number; rows:number; reasons:Readonly<Partial<Record<Reason,number>>>;
}>;
export type CursorListRow = Readonly<{
  listId:number;isCell:boolean;hostListId:number;sectionIndex:number;hostPara:number;
  controlIndex:number;cellIndex:number;paraCount:number;
  row?:number;col?:number;rowSpan?:number;colSpan?:number;cellCount?:number;
}>;
export type CursorModelView = Readonly<{
  listCount:number;
  root:Readonly<{paraCount:number;topPos:number;endPara:number;endPos:number}>;
  lists:readonly CursorListRow[];
}>;
type Entry = {epoch:number;key:Key;raw:string;rows:number;parsed?:CursorModelView};
type DispatchObservation = {epoch:number;pagePreparations:number;unchangedFontEnvironments:number;tableTrackCaretRects:number;depth:number;closed:boolean};
type State = {
  observation?:DispatchObservation; memoEnabled:boolean; epoch:number; pagePreparations:number; depth:number; closed:boolean; loading?:boolean; entry?:Entry; next:Reason;
  read?:{retired:boolean; current?:()=>boolean};
  rawHits:number;parsedHits:number;nativeReads:number;parses:number; reasons:Partial<Record<Reason,number>>;
};
const documents = new WeakMap<HwpDocument,State>();
let retained: WeakRef<State> | undefined; // one full entry across all live documents
const reason = (s:State, why:Reason) => { s.reasons[why]=(s.reasons[why]??0)+1; };
const retire = (s:State, why:Reason, method?:string) => {
  if(s.read&&!s.read.retired) noteQaRetirement?.(why,method);
  s.entry=undefined;s.next=why;
  if(s.read)s.read.retired=true;
  if(s.epoch===Number.MAX_SAFE_INTEGER)s.closed=true;else s.epoch++;
};
const environmentMethods = new Set(["setDpi","setFontEnvironment","rebuildDerivedState","flushDeferredPagination",
  "setShowParagraphMarks","setShowControlCodes","setShowTransparentBorders"]);

// Installs only on the dynamically imported private module, before publishing
// ANY document. Observation-only enrollment never enables model memoization.
// Default fence captures generic calls and direct native writers/aliases alike.
export function installCursorMemoFence(prototype:object, mode:"memo"|"observe"="memo", observeTableTrackCaret=false):((doc:HwpDocument)=>void)|undefined {
  if ((mode==="memo" && typeof WeakRef!=="function") || Object.getPrototypeOf(prototype)!==Object.prototype) return;
  const observation:DispatchObservation|undefined=mode==="observe"
    ? {epoch:0,pagePreparations:0,unchangedFontEnvironments:0,tableTrackCaretRects:0,depth:0,closed:false} : undefined;
  const plan: PropertyDescriptorMap = Object.create(null);
  const all=Object.getOwnPropertyDescriptors(prototype);
  if([...irReaders].some(name=>typeof all[name]?.value!=="function"))return;
  for (const name of Reflect.ownKeys(all)) {
    if(name==="constructor")continue;
    const descriptor=Reflect.get(all,name) as PropertyDescriptor;
    if (typeof descriptor.value!=="function" || !descriptor.configurable) return;
    if(typeof name==="string"&&irReaders.has(name))continue;
    const method=descriptor.value as Function;
    plan[name]={...descriptor,value:function(this:HwpDocument,...args:unknown[]){
      const s=documents.get(this);
      const terminal=name==="free"||name==="__destroy_into_raw"||name===Symbol.dispose;
      // A different JS wrapper for the same private native pointer may not be
      // enrolled. Observe this prototype's writes BEFORE delegation anyway.
      // There is no per-pointer rebinding and no iteration of live documents.
      if(observation){
        if(observation.epoch===Number.MAX_SAFE_INTEGER)observation.closed=true;
        else observation.epoch++;
        if(name==="oneditPrepareScreenPageReceiptV1")observation.pagePreparations++;
        if(terminal&&!s)observation.closed=true; // unknown alias may free a bound owner
        observation.depth++;
      }
      if(s){
        if(name==="oneditPrepareScreenPageReceiptV1")s.pagePreparations++;
        retire(s,typeof name==="string"&&environmentMethods.has(name)?"render-environment":"mutation",String(name));
        if(terminal)s.closed=true;
        s.depth++;
      }
      try{
        const value:unknown=Reflect.apply(method,this,args);
        // W802e observe only. Core returns false on the equality branch
        // before any font/layout write. Do not reclassify other return values,
        // throws, unowned aliases, or any nested dispatches as harmless.
        if(name==="setFontEnvironment" && value===false && observation && s?.observation===observation)
          observation.unchangedFontEnvironments++;
        // The pinned Core's successful nested caret query reads the already
        // paginated document and may populate only derived render caches.
        // Count it separately for the drag consumer; other epochs still see it.
        if(observeTableTrackCaret && name==="getCursorRectByPath" && typeof value==="string" &&
            observation && s?.observation===observation)
          observation.tableTrackCaretRects++;
        return value;
      }
      finally{if(s)s.depth--;if(observation)observation.depth--;}
    }};
  }
  Object.defineProperties(prototype,plan);
  return doc=>{
    if(Object.getPrototypeOf(doc)!==prototype||documents.has(doc))return;
    documents.set(doc,{observation,memoEnabled:mode==="memo",epoch:0,pagePreparations:0,depth:0,closed:false,next:"first",rawHits:0,parsedHits:0,nativeReads:0,parses:0,reasons:{}});
  };
}
// A private optimization, never a lease for a scheduled continuation.
export function withCursorModelReadTransaction<T>(doc:HwpDocument,run:()=>T,current?:()=>boolean):T {
  const s=documents.get(doc);
  if(!s||!s.memoEnabled||s.closed||s.depth||s.loading||s.read)return run();
  const read={retired:false,current};s.read=read;
  try{return run();}finally{
    read.retired=true;
    s.entry=undefined;s.read=undefined;s.next="first";
    if(retained?.deref()===s)retained=undefined;
  }
}
/** The original OwnerProjection still owns selection, ref, and render validity.
 * This adds only the document/write witness for a projection born in an M read. */
export function cursorModelReadWitness(doc:HwpDocument):(()=>boolean)|undefined {
  const s=documents.get(doc),read=s?.read,epoch=s?.epoch;
  const o=s?.observation,dispatch=o?.epoch;
  return s ? ()=>!s.closed&&!s.depth&&s.epoch===epoch&&
    (!o||!o.closed&&!o.depth&&o.epoch===dispatch)&&
    (!read||(s.read===read&&!read.retired&&(!read.current||read.current()))) : undefined;
}
export function cursorModelMemoEnabled(doc:HwpDocument) { return documents.get(doc)?.memoEnabled===true; }
/** Enrollment is not loader ownership; only core-runtime can certify that. */
export function cursorModelFenceEnrolled(doc:HwpDocument) { return documents.has(doc); }
/** Conservative pre-delegate dispatch counter, NOT native IR/layout revision. */
export function cursorModelDispatchEpoch(doc:HwpDocument):number|undefined {
  const s=documents.get(doc),o=s?.observation;
  if(!s||s.closed||s.depth||o?.closed||o?.depth)return;
  return o?o.epoch:s.epoch;
}
/** Object clipboard admission is stable across verified no-op font refreshes.
 * Keep the full dispatch fence for every other caller and all other methods. */
export function objectClipboardDispatchEpoch(doc:HwpDocument):number|undefined {
  const observation=documents.get(doc)?.observation,dispatch=cursorModelDispatchEpoch(doc);
  if(!observation||dispatch===undefined)return;
  return dispatch-observation.unchangedFontEnvironments;
}
/** Only the verified table drag uses this scope. Unknown, failed or in-flight
 * calls are still invalidating, as are all writes and font/layout changes. */
export function tableTrackDragDispatchEpoch(doc:HwpDocument):number|undefined {
  const observation=documents.get(doc)?.observation,dispatch=cursorModelDispatchEpoch(doc);
  if(!observation||dispatch===undefined)return;
  return dispatch-observation.tableTrackCaretRects;
}
export function cursorModelMemoEpoch(doc:HwpDocument) { return documents.get(doc)?.epoch; }
/** Page rendering has one expected Core cache preparation. It still fences
 * normal read transactions. This stamp is only for checking SVG finalization,
 * where that preparation cannot change model, owner or render inputs. All
 * other unknown, real, in-flight or terminal dispatches fail closed. */
export function screenInputDispatchEpoch(doc:HwpDocument):number|undefined {
  const s=documents.get(doc);
  if(!s||s.closed||s.depth)return;
  const o=s.observation;
  if(o)return o.closed||o.depth?undefined:o.epoch-o.pagePreparations;
  return s.epoch-s.pagePreparations;
}
export function cursorModelMemoStats(doc:HwpDocument): Counter | undefined {
  const s=documents.get(doc);if(!s)return;
  return {epoch:s.epoch,rawHits:s.rawHits,parsedHits:s.parsedHits,nativeReads:s.nativeReads,parses:s.parses,
    units:s.entry?.raw.length??0,rows:s.entry?.rows??0,reasons:{...s.reasons}};
}
export function withFreshCursorModel<T>(doc:HwpDocument,run:()=>T):T {
  const s=documents.get(doc);if(!s)return run();
  retire(s,"command");s.depth++;
  try{return run();}finally{s.depth--;}
}
function same(a:Key,b:Key) {return a.every((v,i)=>Object.is(v,b[i]));}
const uint = (v:unknown) => typeof v==="number" && Number.isSafeInteger(v) && v>=0;
const rootKeys=["paraCount","topPos","endPara","endPos"];
const rowKeys=["listId","isCell","hostListId","sectionIndex","hostPara","controlIndex","cellIndex","paraCount"];
const gridKeys=["row","col","rowSpan","colSpan","cellCount"];
function valid(v:any) {
  const record=(r:any, keys:string[])=>r!==null&&typeof r==="object"&&!Array.isArray(r)&&
    Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k));
  return record(v,["listCount","root","lists"]) && uint(v.listCount) &&
    record(v.root,rootKeys) && rootKeys.every(k=>uint(v.root[k])) && Array.isArray(v.lists) &&
    v.lists.every((r:any)=>r && record(r,Object.hasOwn(r,"row")?rowKeys.concat(gridKeys):rowKeys) &&
      Object.entries(r).every(([k,x])=>k==="isCell"?typeof x==="boolean":uint(x)));
}
function freeze(v:any) {
  for (const row of v.lists) Object.freeze(row);
  Object.freeze(v.root);Object.freeze(v.lists);return Object.freeze(v);
}
// Adapter only. Generic callers retain their own mutable JSON tree; only the
// audited lookup consumers use the immutable tree. Errors keep native meaning.
export function readCursorModelMemo(doc:HwpDocument, key:()=>Key|undefined, immutable:boolean, native:()=>string):
  {raw:string;value:any;admitted:boolean} {
  const pack=(raw:string,value:any,admitted=false)=>({raw,value,admitted});
  const s=documents.get(doc);
  if(!s||!s.memoEnabled){const raw=native();return pack(raw,result(raw));}
  const parse=(raw:string)=>{s.parses++;return result(raw);};
  const fetch=()=>{s.nativeReads++;return native();};
  const read=s.read;
  if(read&&!read.retired&&read.current&&!read.current())retire(s,"adapter-state");
  const stamp=key(), epoch=s.epoch;
  if(s.closed||s.depth||s.loading||!read||read.retired||!stamp){
    if(!stamp&&read&&!read.retired)retire(s,"pending");
    reason(s,s.closed?"closed":s.depth||s.loading?"guarded":!read?"outside-read":
      !stamp?"pending":"retired-read");
    const raw=fetch();return pack(raw,parse(raw));
  }
  let e=s.entry;
  if(e&&(e.epoch!==epoch||!same(e.key,stamp))){
    retire(s,"adapter-state");reason(s,"adapter-state");const raw=fetch();return pack(raw,parse(raw));
  }
  if(e){
    if(immutable&&e.parsed){s.parsedHits++;return pack(e.raw,e.parsed,true);}
    s.rawHits++;
    const v=parse(e.raw);
    if(immutable)e.parsed=freeze(v);
    return pack(e.raw,v,true);
  }
  reason(s,s.next);s.loading=true;
  try{
    const raw=fetch(), v=parse(raw);
    const now=key();
    if(s.read!==read||read.retired||s.epoch!==epoch||s.depth||s.closed||!now||!same(now,stamp)||read.current&&!read.current()){
      reason(s,"late");throw Error("Cursor model changed during synchronous acquisition.");
    }
    if(raw.length>cursorMemoRawUnits||v?.lists?.length>cursorMemoRows){reason(s,"capacity");return pack(raw,v);}
    if(!valid(v)){reason(s,"shape");return pack(raw,v);}
    const old=retained?.deref();
    if(old&&old!==s&&old.entry){old.entry=undefined;old.next="first";}
    s.entry={epoch,key:stamp,raw,rows:v.lists.length,parsed:immutable?freeze(v):undefined};
    retained=new WeakRef(s);
    return pack(raw,v,true);
  }catch(error){reason(s,"error");throw error;}finally{s.loading=false;}
}

// Diagnostic-only local cohort. No added native calls, timestamps or document
// data; each retained row accounts for one original synchronous boundary.
const qaReadPhases=(()=>{
  if(typeof window==="undefined"||window.parent!==window)return;
  const u=new URL(window.location.href);
  if(u.protocol!=="http:"||u.hostname!=="127.0.0.1"||
     u.searchParams.getAll("oneditQaReadLifetimes").join("/")!=="1")return;
  type Phase={phase:string;depth:number;before?:Counter;after?:Counter;retired:{reason:Reason;method?:string}[]};
  const stack:Phase[]=[];
  let rows:Phase[]=[],dropped=0;
  return {
    record<T>(doc:HwpDocument,phase:string,run:()=>T):T {
      const row:Phase={phase,depth:stack.length,before:cursorModelMemoStats(doc),retired:[]};
      if(rows.length<512)rows.push(row);else dropped++;
      stack.push(row);
      try{return run();}finally{stack.pop();row.after=cursorModelMemoStats(doc);}
    },
    retire(why:Reason,method?:string){
      const row=stack.at(-1);if(row&&row.retired.length<16)row.retired.push({reason:why,method});
    },
    snapshot(reset=false){
      const value=structuredClone({rows,dropped});
      if(reset){rows=[];dropped=0;}
      return value;
    },
  };
})();
const noteQaRetirement=qaReadPhases?.retire;
export const qaReadPhaseSnapshot=qaReadPhases?.snapshot;
export function withQaReadPhase<T>(doc:HwpDocument,phase:string,run:()=>T):T {
  return qaReadPhases?qaReadPhases.record(doc,phase,run):run();
}
