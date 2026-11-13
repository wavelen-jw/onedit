import { isB338OwnerTrialDigest } from "./b338-focused-owner-trial.js";
import type { RhwpAdapter } from "./adapter.js";
import { coreRuntimeIdentity } from "./core-runtime.js";
import { tablePropertyProjectionRuntimeSha256 } from "./table-property-projection-binding.js";

export const tablePropertyFields = [
  "width","height","paddingLeft","paddingRight","paddingTop","paddingBottom",
  "applyInnerMargin","verticalAlign","textDirection","isHeader","cellProtect",
  "fieldName","editableInForm","borderFillId","borderLeft","borderRight","borderTop",
  "borderBottom","fillType","fillColor","patternColor","patternType","diagonalLine",
  "diagonalSlash","diagonalBackSlash","diagonalWidth","diagonalColor","centerLine",
] as const;
export type TablePropertyField = typeof tablePropertyFields[number];
export type TablePropertyPath = Readonly<{controlIndex:number;cellIndex:number;cellParaIndex:number}>;
export type TablePropertyTarget = Readonly<{
  section:number; paragraph:number; path:readonly TablePropertyPath[];
  range:Readonly<{kind:"focus"}|{kind:"rectangle";anchor:number}|{kind:"table"}>;
  selectionGeneration:number;
}>;
export type TablePropertyRequest = Readonly<{
  target:TablePropertyTarget; fields:readonly TablePropertyField[]; includeTable?:boolean;
}>;
type Scalar = string|number|boolean;
type Value = Scalar|Readonly<{type:number;width:number;color:string}>;
type Values = Readonly<Partial<Record<TablePropertyField,Value>>>;
type NativeOwner = Readonly<{instance:number;documentEpoch:string;sectionRevision:string;ownerIds:readonly number[]}>;
export type TablePropertyMember = Readonly<{
  cellIndex:number;cellId:number;row:number;col:number;rowSpan:number;colSpan:number;
  paragraphCount:number;cellProtected:boolean;values:Values;
}>;
type ProjectionData = Readonly<{
  owner:NativeOwner; members:readonly TablePropertyMember[]; common:Values;
  mixed:readonly TablePropertyField[]; table:Readonly<Record<string,unknown>>|null;
  protection:Readonly<{anyCellProtected:boolean;ancestorCellProtected:boolean;tableLocked:boolean;tableSizeProtected:boolean}>;
  work:Readonly<{pathDepth:number;tableCellVisits:number;projectedCells:number;zoneVisitUpperBound:number}>;
}>;
export type TablePropertyProjection = ProjectionData & Readonly<{
  status:"ok"; documentId:string; revision:number; selectionGeneration:number;
  documentReadonly:boolean; // Presentation only, never a write permission.
}>;
type Failure = "unsupportedRuntime"|"unsupported"|"stale"|"missing"|"budgetExceeded"|"invalidRequest"|"invalidResponse"|"unavailable";
export type TablePropertyProjectionResult = TablePropertyProjection|Readonly<{status:Failure}>;

type Fence = readonly [
  RhwpAdapter["doc"],string,number,number,number,string|number|undefined,boolean,string,boolean,string|undefined,number|undefined,
  RhwpAdapter["doc"]|undefined,number,
];
const tickets = new WeakMap<TablePropertyProjection,{fence:Fence;key:string;owner:NativeOwner}>();
const same = (a:Fence,b:Fence) => a.every((v,i)=>v===b[i]);
const nativeFailures: readonly string[] = ["unsupported","stale","missing","budgetExceeded","invalidRequest","invalidResponse"];
const own = (v:object,k:string) => Object.hasOwn(v,k);
const uint = (v:unknown):v is number => Number.isSafeInteger(v) && (v as number)>=0;
const integerText = (v:unknown) => typeof v==="string" && /^(0|[1-9]\d{0,19})$/.test(v);
const record = (v:unknown):v is Record<string,any> => !!v && typeof v==="object" && !Array.isArray(v);
const boolKeys = new Set(["applyInnerMargin","isHeader","cellProtect","editableInForm"]);
const stringKeys = new Set(["fieldName","fillType","fillColor","patternColor","diagonalColor","centerLine"]);
const borderKeys = new Set(["borderLeft","borderRight","borderTop","borderBottom"]);
function value(field:TablePropertyField,v:unknown):boolean {
  if (boolKeys.has(field)) return typeof v==="boolean";
  if (stringKeys.has(field)) return typeof v==="string";
  if (borderKeys.has(field)) return record(v)&&Object.keys(v).length===3&&
    Number.isFinite(v.type)&&Number.isFinite(v.width)&&typeof v.color==="string";
  return typeof v==="number"&&Number.isFinite(v);
}
function fieldSet(v:unknown,fields:readonly TablePropertyField[]):v is Values {
  return record(v) && Object.keys(v).length===fields.length && fields.every(f=>own(v,f)&&value(f,v[f]));
}
function validData(r:Record<string,any>, q:TablePropertyRequest):r is ProjectionData & {status:"ok"} {
  const {owner,members,mixed,common,protection,work,table}=r;
  if (!record(owner)||!uint(owner.instance)||!integerText(owner.documentEpoch)||!integerText(owner.sectionRevision)||
      !Array.isArray(owner.ownerIds)||owner.ownerIds.length!==1+2*q.target.path.length||!owner.ownerIds.every(uint)||
      !Array.isArray(members)||!members.length||members.length>512||
      !Array.isArray(mixed)||new Set(mixed).size!==mixed.length||!mixed.every(f=>q.fields.includes(f))||
      !fieldSet(common,q.fields.filter(f=>!mixed.includes(f)))||
      !record(protection)||!["anyCellProtected","ancestorCellProtected","tableLocked","tableSizeProtected"].every(k=>typeof protection[k]==="boolean")||
      !record(work)||work.pathDepth!==q.target.path.length||work.projectedCells!==members.length||
      !uint(work.tableCellVisits)||!uint(work.zoneVisitUpperBound)||
      work.tableCellVisits+work.zoneVisitUpperBound+members.length>32768||
      (q.includeTable ? !record(table) : table!==null)) return false;
  let last=-1;
  for (const m of members) {
    if (!record(m)||!["cellIndex","cellId","row","col","rowSpan","colSpan","paragraphCount"].every(k=>uint(m[k]))||
        m.cellIndex<=last||!m.rowSpan||!m.colSpan||typeof m.cellProtected!=="boolean"||!fieldSet(m.values,q.fields)) return false;
    last=m.cellIndex;
  }
  const focus=q.target.path.at(-1)!;
  const ownCell=members.find(m=>m.cellIndex===focus.cellIndex);
  const range=q.target.range;
  return !!ownCell&&ownCell.cellId===owner.ownerIds.at(-2)&&focus.cellParaIndex<ownCell.paragraphCount&&
    (range.kind!=="focus"||members.length===1)&&
    (range.kind!=="rectangle"||members.some(m=>m.cellIndex===range.anchor));
}

export function tablePropertyProjectionSupported(adapter:RhwpAdapter):boolean {
  const digest=coreRuntimeIdentity(adapter.doc)?.sha256;
  return digest===tablePropertyProjectionRuntimeSha256||isB338OwnerTrialDigest(digest);
}

/** A supplies the authoritative UI selection serial. No async/DOM work in getFence. */
export function readTablePropertyProjection(
  adapter:RhwpAdapter, q:TablePropertyRequest, getFence:()=>Fence, prior?:TablePropertyProjection,
):TablePropertyProjectionResult {
  if (!tablePropertyProjectionSupported(adapter)) return {status:"unsupportedRuntime"};
  const start=getFence();
  if (start[6]) return {status:"unavailable"}; // Active transient/IME; old path owns the policy.
  const t=q.target;
  if (!uint(t.selectionGeneration)||t.selectionGeneration!==start[4]) return {status:"stale"};
  if (!uint(t.section)||!uint(t.paragraph)||!Array.isArray(t.path)||!t.path.length||
      !t.path.every(p=>uint(p?.controlIndex)&&uint(p?.cellIndex)&&uint(p?.cellParaIndex))||
      !Array.isArray(q.fields)||new Set(q.fields).size!==q.fields.length||
      !["focus","rectangle","table"].includes(t.range?.kind)||
      (t.range.kind==="rectangle"&&!uint(t.range.anchor))) return {status:"invalidRequest"};
  if (t.path.length>64||q.fields.length>tablePropertyFields.length) return {status:"budgetExceeded"};
  if (!q.fields.every(f=>tablePropertyFields.includes(f))) return {status:"unsupported"};
  const path=t.path.map(({controlIndex,cellIndex,cellParaIndex})=>({controlIndex,cellIndex,cellParaIndex}));
  const range=t.range.kind==="rectangle"?{kind:"rectangle",anchor:t.range.anchor}:{kind:t.range.kind};
  const key=JSON.stringify([t.section,t.paragraph,path,range]);
  const ticket=prior&&tickets.get(prior);
  if (prior&&(!ticket||!same(ticket.fence,start)||ticket.key!==key)) return {status:"stale"};
  const input=JSON.stringify({section:t.section,paragraph:t.paragraph,path,range,fields:q.fields,
    includeTable:q.includeTable===true,expected:ticket?.owner});
  if (input.length>16384) return {status:"budgetExceeded"};
  // A real verified loader binding is necessary. Method presence alone never grants support.
  const doc=start[0] as RhwpAdapter["doc"] & {oneditTablePropertyProjectionV1?: (input:string)=>string};
  if (typeof doc.oneditTablePropertyProjectionV1!=="function") return {status:"invalidResponse"};
  let reply:unknown;
  try {
    const raw=doc.oneditTablePropertyProjectionV1(input);
    if (typeof raw!=="string"||raw.length>262144) return {status:"invalidResponse"};
    reply=JSON.parse(raw);
  } catch { return {status:"invalidResponse"}; }
  if (!same(start,getFence())) return {status:"stale"};
  if (!record(reply)) return {status:"invalidResponse"};
  if (nativeFailures.includes(reply.status)&&Object.keys(reply).length===1) return {status:reply.status as Failure};
  if (reply.status!=="ok"||!validData(reply,q)) return {status:"invalidResponse"};
  const out:TablePropertyProjection={...reply,documentId:start[1],revision:start[2],selectionGeneration:start[4],
    documentReadonly:start[7]!=="edit"||start[8]||!!start[9]};
  const owner={...out.owner,ownerIds:[...out.owner.ownerIds]};
  tickets.set(out,{fence:start,key,owner});
  return out;
}
