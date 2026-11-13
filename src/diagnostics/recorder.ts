/** First-party, content-free diagnostics. No DOM, Core, network or storage access. */
export type Command = 'insert'|'delete'|'enter'|'undo'|'redo'|'format'|'open'|'save'|'other';
export type Result = 'start'|'ok'|'noop'|'cancel'|'fail';
export type Selection = 'caret'|'range'|'cell'|'object'|'none';
export type Focus = 'editor'|'toolbar'|'dialog'|'other'|'none';
export type Queue = 'start'|'stop';
export type SaveState = 'start'|'success'|'cancel'|'fail';
export type Phase = 'input'|'command'|'layout'|'render'|'save';
export type ErrorCode = 'STARTUP_FAILED'|'COMMAND_FAILED'|'SAVE_FAILED'|'RENDER_FAILED'|'UNKNOWN_ERROR';
export type SourceFrame = 'workspace-startup'|'interaction'|'file-lifecycle'|'page-presenter'|'unknown';
export type DiagnosticEvent =
 | {type:'command'; command:Command; result:Result; durationMs:number}
 | {type:'selection'; selection:Selection; count:number}
 | {type:'state'; revision:number; undoCount:number; redoCount:number; dirty:boolean}
 | {type:'focus'; focus:Focus}
 | {type:'queue'; state:Queue; depth:number}
 | {type:'save'; state:SaveState}
 | {type:'phase'; phase:Phase; durationMs:number};
export type TimedEvent = Readonly<DiagnosticEvent & {atMs:number}>;
export interface DiagnosticSnapshot {readonly version:1; readonly occurredAt:string; readonly code:ErrorCode; readonly frames:readonly SourceFrame[]; readonly events:readonly TimedEvent[]; readonly detail:boolean}
export interface RecorderOptions {enabled?:boolean; now?:()=>number; wallNow?:()=>number; schedule?:(fn:()=>void,ms:number)=>unknown; cancel?:(id:unknown)=>void}
const TTL=180_000, MAX_EVENTS=2000, MAX_BYTES=1_048_576, EVENT_BUDGET=256, MAX_SNAPSHOTS=3;
const commands:readonly string[]=['insert','delete','enter','undo','redo','format','open','save','other'];
const results:readonly string[]=['start','ok','noop','cancel','fail'];
const selections:readonly string[]=['caret','range','cell','object','none'];
const focuses:readonly string[]=['editor','toolbar','dialog','other','none'];
const queues:readonly string[]=['start','stop'];
const saves:readonly string[]=['start','success','cancel','fail'];
const phases:readonly string[]=['input','command','layout','render','save'];
const codes:readonly string[]=['STARTUP_FAILED','COMMAND_FAILED','SAVE_FAILED','RENDER_FAILED','UNKNOWN_ERROR'];
const framesAllowed:readonly string[]=['workspace-startup','interaction','file-lifecycle','page-presenter','unknown'];
const contains=(a:readonly string[],x:unknown):x is string=>typeof x==='string'&&a.includes(x);
const number=(x:unknown,max:number):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max;
const integer=(x:unknown):x is number=>number(x,1_000_000_000)&&Number.isSafeInteger(x);
/** Explicit field-by-field projection: never retain arbitrary fields or stringify input. */
function project(raw:DiagnosticEvent):DiagnosticEvent|null {
 if (!raw || typeof raw!=='object') return null;
 switch(raw.type){
  case 'command': return contains(commands,raw.command)&&contains(results,raw.result)&&number(raw.durationMs,3_600_000)?{type:'command',command:raw.command,result:raw.result,durationMs:Math.round(raw.durationMs)}:null;
  case 'selection': return contains(selections,raw.selection)&&integer(raw.count)?{type:'selection',selection:raw.selection,count:raw.count}:null;
  case 'state': return integer(raw.revision)&&integer(raw.undoCount)&&integer(raw.redoCount)&&typeof raw.dirty==='boolean'?{type:'state',revision:raw.revision,undoCount:raw.undoCount,redoCount:raw.redoCount,dirty:raw.dirty}:null;
  case 'focus': return contains(focuses,raw.focus)?{type:'focus',focus:raw.focus}:null;
  case 'queue': return contains(queues,raw.state)&&integer(raw.depth)?{type:'queue',state:raw.state,depth:raw.depth}:null;
  case 'save': return contains(saves,raw.state)?{type:'save',state:raw.state}:null;
  case 'phase': return contains(phases,raw.phase)&&number(raw.durationMs,3_600_000)?{type:'phase',phase:raw.phase,durationMs:Math.round(raw.durationMs)}:null;
  default: return null;
 }
}
/** Bounded in-memory ring and bounded frozen error snapshots. Local recording enabled by default; automatic upload is outside this module. */
export class DiagnosticsRecorder {
 private enabled:boolean; private readonly now:()=>number; private readonly wallNow:()=>number; private readonly schedule:(fn:()=>void,ms:number)=>unknown; private readonly cancel:(id:unknown)=>void; private timer:unknown=null;
 private ring:(TimedEvent|undefined)[]=new Array(MAX_EVENTS); private head=0; private size=0; private lastTime=0;
 private snapshots:DiagnosticSnapshot[]=[]; private detailUntil=0; private capturing=false; private recording=false;
 constructor(options:RecorderOptions={}) {this.enabled=options.enabled!==false;this.now=options.now??(()=>performance.now());this.wallNow=options.wallNow??(()=>Date.now());this.schedule=options.schedule??((fn,ms)=>{const id=setTimeout(fn,ms);(id as unknown as {unref?:()=>void}).unref?.();return id;});this.cancel=options.cancel??(id=>clearTimeout(id as ReturnType<typeof setTimeout>));}
 private time():number {const v=this.now();if(!Number.isFinite(v)||v<0)throw Error('CLOCK_INVALID');this.lastTime=Math.max(this.lastTime,v);return this.lastTime;}
 private prune(t:number):void {while(this.size){const e=this.ring[this.head]!;if(t-e.atMs<=TTL)break;this.ring[this.head]=undefined;this.head=(this.head+1)%MAX_EVENTS;this.size--;}}
 private arm(t:number):void {if(this.timer!==null||!this.size)return;const delay=Math.max(1,this.ring[this.head]!.atMs+TTL-t+1);
  this.timer=this.schedule(()=>{this.timer=null;try{const now=this.time();this.prune(now);this.arm(now);}catch{this.clear();}},delay);}
 setEnabled(on:boolean):void {this.enabled=on===true;if(!this.enabled)this.clear();}
 isEnabled():boolean {return this.enabled;}
 clear():void {if(this.timer!==null){try{this.cancel(this.timer);}catch{}this.timer=null;}this.ring.fill(undefined);this.head=0;this.size=0;this.snapshots=[];this.detailUntil=0;}
 /** Explicit user-triggered optional detail window; it never permits text or additional fields. */
 startDetail():boolean {if(!this.enabled)return false;try {this.detailUntil=this.time()+60_000;return true;}catch{return false;}}
 record(event:DiagnosticEvent):boolean {
  if(!this.enabled||this.capturing||this.recording)return false;this.recording=true;
  try {const e=project(event);if(!e)return false;const t=this.time();this.prune(t);if(e.type==='phase'&&this.detailUntil<=t)return false;
   while(this.size>=MAX_EVENTS||(this.size+1)*EVENT_BUDGET>MAX_BYTES){this.ring[this.head]=undefined;this.head=(this.head+1)%MAX_EVENTS;this.size--;}
   this.ring[(this.head+this.size)%MAX_EVENTS]=Object.freeze({...e,atMs:t}) as TimedEvent;this.size++;this.arm(t);return true;
  } catch {this.clear();return false;} finally {this.recording=false;}
 }
 /** Only fixed code/frame identifiers are admitted. Error.message/stack are never accepted. */
 captureError(code:ErrorCode,frames:readonly SourceFrame[]=[]):DiagnosticSnapshot|null {
  if(!this.enabled||this.capturing||this.recording)return null;this.capturing=true;
  try {if(!contains(codes,code)||!Array.isArray(frames)||frames.length>8||!frames.every(f=>contains(framesAllowed,f)))return null;
   const t=this.time();this.prune(t);const wall=this.wallNow();if(!Number.isFinite(wall))return null;
   const events:TimedEvent[]=[];for(let i=0;i<this.size;i++)events.push(this.ring[(this.head+i)%MAX_EVENTS]!);
   const snap:DiagnosticSnapshot=Object.freeze({version:1,occurredAt:new Date(wall).toISOString(),code,frames:Object.freeze([...frames] as SourceFrame[]),events:Object.freeze(events),detail:this.detailUntil>t});
   if(this.snapshots.length===MAX_SNAPSHOTS)this.snapshots.shift();this.snapshots.push(snap);return snap;
  } catch {return null;} finally {this.capturing=false;}
 }
 listSnapshots():readonly DiagnosticSnapshot[] {return Object.freeze([...this.snapshots]);}
 /** Explicit caller action only. Return null on failure; no logging or automatic upload. */
 exportSnapshot(snapshot:DiagnosticSnapshot):string|null {try {if(!this.snapshots.includes(snapshot))return null;const json=JSON.stringify(snapshot);return new TextEncoder().encode(json).byteLength<=MAX_BYTES?json:null;}catch{return null;}}
}
