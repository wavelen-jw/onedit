import type {DiagnosticSnapshot,ErrorCode,SourceFrame} from './recorder.js';
// Error-only snapshots: no live ring, normal-command clock, expiry/detail timer
// or editor-state subscription runs while the user is editing.
const snapshots:DiagnosticSnapshot[]=[];
export const diagnostics={listSnapshots:():readonly DiagnosticSnapshot[]=>[...snapshots],clear(){snapshots.length=0;current=undefined;}};
let current:WeakRef<DiagnosticSnapshot>|undefined;
const capturedAt=new WeakMap<DiagnosticSnapshot,number>();
export const diagnosticCapturedAt=(snapshot:DiagnosticSnapshot|null)=>snapshot?capturedAt.get(snapshot)??null:null;
const failures=new WeakMap<object,WeakRef<DiagnosticSnapshot>>();
export function freezeDiagnostic(code:ErrorCode='UNKNOWN_ERROR',frame:SourceFrame='unknown'){
 try{
  if(!['STARTUP_FAILED','COMMAND_FAILED','SAVE_FAILED','RENDER_FAILED','UNKNOWN_ERROR'].includes(code)||
     !['workspace-startup','interaction','file-lifecycle','page-presenter','unknown'].includes(frame))return null;
  const snapshot:DiagnosticSnapshot=Object.freeze({version:1,occurredAt:new Date().toISOString(),code,
   frames:Object.freeze([frame]),events:Object.freeze([]),detail:false});
  if(snapshots.length===3)snapshots.shift();snapshots.push(snapshot);
  capturedAt.set(snapshot,performance.now());current=new WeakRef(snapshot);return snapshot;
 }catch{return null;}
}
export function currentDiagnostic(){try{const s=current?.deref();return s&&diagnostics.listSnapshots().includes(s)?s:null;}catch{return null;}}
/** Associate only object identity with a safe snapshot; never inspect message, stack or cause. */
export function freezeDiagnosticFor(error:unknown,code:ErrorCode,frame:SourceFrame){const s=freezeDiagnostic(code,frame);if(s&&error!==null&&(typeof error==='object'||typeof error==='function'))failures.set(error,new WeakRef(s));return s;}
export function knownDiagnosticError(error:unknown){try{const s=error!==null&&(typeof error==='object'||typeof error==='function')?failures.get(error)?.deref():undefined;if(s&&diagnostics.listSnapshots().includes(s)){current=new WeakRef(s);return s;}}catch{}return freezeDiagnostic();}
