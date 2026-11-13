/** Private display-only contract; no A product binding or command admission. */
export type Hop = Readonly<{controlIndex:number; cellIndex:number; cellParaIndex:number}>;
export type NativeOwner = Readonly<{documentInstance:number; rootParagraph:number; cell:number; paragraph:number}>;
export type Request = Readonly<{
  section:0; paragraph:number; offset:number; path:readonly [Hop];
  expectedTargetId:string; expectedOwner?:NativeOwner;
}>;
export type Success = Readonly<{
  status:'ok'; kind:'cell'; length:number; paraCount:number; owner:NativeOwner;
  grid:Readonly<{row:number; col:number; rowSpan:1; colSpan:1; cellCount:number}>;
}>;
export type Failure = 'invalidRequest'|'budgetExceeded'|'missing'|'unsupported'|'staleTarget'|'offsetOutOfRange';
export type Reply = Success | Readonly<{status:Failure}>;
export type PrivateWasm = {oneditFocusedCellContextLiteV1(inputJson:string):string};

export type Port = Readonly<{owns(doc:object):boolean; read(doc:object,inputJson:string):string}>;
/**
 * Fill only from the existing synchronous A owner fence and its resolved
 * reference, never with placeholder epoch numbers. 'safe' also requires the
 * existing single-page ordinary grid, edit scope/unlocked, fonts settled,
 * no IME, pending flow or invalidated screen, and no reentry.
 */
export type Stamp = Readonly<{
  doc:object; documentId:string; reference:object; safe:boolean;
  revision:number; readEpoch:number; selectionGeneration:number;
  viewAndFont:string; dpi:number; selectionKey:string; targetId:string;
  undoTop:unknown; redoTop:unknown; undoDepth:number; redoDepth:number;
}>;
const u32=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=0xffffffff;
const positive=(v:unknown):v is number=>u32(v)&&v>0;
const stamps=['doc','documentId','reference','safe','revision','readEpoch','selectionGeneration',
  'viewAndFont','dpi','selectionKey','targetId','undoTop','redoTop','undoDepth','redoDepth'] as const;
const ownerKeys=['documentInstance','rootParagraph','cell','paragraph'] as const;
const current=(a:Stamp,b:Stamp|undefined)=>!!b&&b.safe&&stamps.every(k=>Object.is(a[k],b[k]));
function validStamp(s:Stamp|undefined):s is Stamp {
  return !!s && s.safe && !!s.doc && !!s.reference && !!s.documentId && !!s.viewAndFont &&
    !!s.selectionKey && !!s.targetId && [s.revision,s.readEpoch,s.selectionGeneration,s.undoDepth,s.redoDepth].every(u32)
    && Number.isFinite(s.dpi) && s.dpi>0;
}
/** Bind the request to the native-resolved, exact single endpoint. */
export function focusedSelectionKey(r:Request):string {
  const h=r.path[0];
  return [r.section,r.paragraph,h.controlIndex,h.cellIndex,h.cellParaIndex,r.offset].join('/');
}
function validReply(r:Success, req:Request, token:number) {
  const g=r?.grid,o=r?.owner,h=req.path[0];
  return r?.status==='ok'&&r.kind==='cell'&&Object.keys(r).length===6&&
    u32(r.length)&&positive(r.paraCount)&&h.cellParaIndex<r.paraCount&&req.offset<=r.length&&
    !!g&&Object.keys(g).length===5&&u32(g.row)&&u32(g.col)&&g.rowSpan===1&&g.colSpan===1&&
    positive(g.cellCount)&&h.cellIndex<g.cellCount&&
    !!o&&Object.keys(o).length===4&&ownerKeys.every(k=>positive(o[k]))&&o.paragraph===token&&
    (!req.expectedOwner||ownerKeys.every(k=>o[k]===req.expectedOwner![k]));
}
/**
 * Supply a fresh known native reference obtained under the SAME stamp by A.
 * Undefined means continue the unchanged authoritative fallback. A retains
 * existing native resolve, protection, permission and actual write checks.
 * Publish cannot return an executable lookup: finally retires it.
 */
export function withFocusedCellDisplay<T>(
  port:Port|undefined, capture:()=>Stamp|undefined, stamp:Stamp|undefined, request:Request,
  publish:(read:()=>Success|undefined)=>T,
):T {
  let open=true, used=false;
  const initial=stamp&&Object.freeze({...stamp});
  try {
    return publish(()=>{
      if(!open||used||!port||!validStamp(initial)) return;
      used=true;
      try {
        if(!current(initial,capture())||!port.owns(initial.doc))return;
        if(request.section!==0||request.path.length!==1||![request.paragraph,request.offset].every(u32))return;
        const {controlIndex,cellIndex,cellParaIndex}=request.path[0];
        if(![controlIndex,cellIndex,cellParaIndex].every(u32))return;
        const m=/^cell-para-([1-9][0-9]{0,9})$/.exec(request.expectedTargetId);
        const token=Number(m?.[1]);if(!positive(token))return;
        // Do not let a caller mutating the original object after dispatch affect comparison.
        const copy:Request={...request,path:[{controlIndex,cellIndex,cellParaIndex}],
          ...(request.expectedOwner?{expectedOwner:{...request.expectedOwner}}:{})};
        if(copy.expectedTargetId!==initial.targetId||focusedSelectionKey(copy)!==initial.selectionKey||
           !current(initial,capture()))return;
        const raw=port.read(initial.doc,JSON.stringify(copy));
        if(typeof raw!=='string'||raw.length>=1024||!current(initial,capture())||!port.owns(initial.doc))return;
        const parsed=JSON.parse(raw);
        if(!validReply(parsed,copy,token)||!current(initial,capture()))return;
        return Object.freeze({...parsed,grid:Object.freeze({...parsed.grid}),owner:Object.freeze({...parsed.owner})});
      } catch { return; } // Caller runs existing fallback; its exceptions remain observable.
    });
  } finally { open=false; }
}
