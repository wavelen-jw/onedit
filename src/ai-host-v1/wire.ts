import {AIError,errorCodes,limits,validateValue,isObject,type Binding,type ErrorBody,type Approval} from '../ai-integration/contract.js';
import type {GridSpec,HostDocumentSpec} from '../ai-integration/document-spec.js';
import {checkedOpenFeature,type FileFormat,type OpenScope,type OpenMetadata,type OpenApproval,type OpenedSource} from './open.js';

export const version={protocol:'onedit-host',transportVersion:2,apiVersion:'1.0'} as const;
export type Destination=Pick<Binding,'documentId'|'workingCopyId'|'hostVersion'>;
export type FileTransfer={bytes:ArrayBuffer;byteLength:number;sha256:string};
export type Scope='read'|'edit'|'save'|'lifecycle';
export const methods={
 getCapabilities:['getCapabilities','read'],getState:['getState','read'],openDocument:['openDocument','lifecycle'],
 getLayoutReport:['getLayoutReport','read'],listTemplates:['getCatalog','read'],getStyleCatalog:['getCatalog','read'],
 prepareDocument:['prepareDocument','lifecycle'],commitPreparedDocument:['commitPreparedDocument','lifecycle'],
 captureSelection:['captureSelection','read'],readSelection:['readSelection','read'],previewEdits:['previewEdits','edit'],
 applyProposal:['applyProposal','edit'],discardProposal:['discardProposal','edit'],releaseSnapshot:['releaseSelection','read'],
 getOperation:['getOperation','read'],cancelOperation:['cancelOperation','edit'],undo:['undo','edit'],redo:['redo','edit'],
 exportDocument:['exportDocument','save'],acknowledgeSave:['acknowledgeSaved','save'],
} as const;
export type Method=keyof typeof methods;
export type State={binding:Binding;selectionRevision:number;dirty:boolean;pageCount:number;hasSelection:boolean;composition:boolean;readonly:boolean;canUndo:boolean;canRedo:boolean;source?:OpenedSource};
export type Snapshot={snapshotId:string;targetId:string;binding:Binding;selectionRevision:number;expiresAt:number;
 start:number;end:number;sourceSha256:string;formatDigest:string};
export type Layout={pageCount:number;overflow:boolean|null;fontWarnings:string[]};
export type Prepared={candidateId:string;previewDigest:string;expiresAt:number;bytesHash:string;layout:Layout;warnings:string[];
 blocks:({kind:'paragraph';text:string}|{kind:'table';rows:string[][]}|{kind:'table';grid:GridSpec})[];destination:Destination;replaceDirty:boolean};
export type Proposal={proposalId:string;previewDigest:string;expiresAt:number;targetId:string;before:string;after:string;
 sourceSha256:string;formatDigest:string;
 layout:{beforePages:number;afterPages:number;overflow:boolean}};
export type Export=FileTransfer&{format:'hwpx';exportId:string;binding:Binding;exportRevision:number;warnings:string[]};
export type ReadSelection={segmentKey:string;text:string;format:{bold:boolean;italic:boolean;underline:boolean;fontSize:number|null};
 context?:{before:string;after:string;readOnly:true;truncatedBefore:boolean;truncatedAfter:boolean}};
export type Receipt={ok:false;error:ErrorBody}|{ok:true;result:{state:State;displayRefreshed:boolean;applied?:boolean}};
export type Operation={operationId:string;status:'pending'|'committed'|'failed'|'cancelled';receipt?:Receipt}|{code:'ALREADY_COMMITTED';receipt:Receipt};
export type Capabilities={methods:Method[];formats:{open:FileFormat[];export:('hwpx')[]};selection:string;limits:typeof limits;notes:string[];
 openPolicy?:{availability:'guarded'|'unavailable';scopes:OpenScope[];editRequiresCheckedExport:true;hwpOverwrite:false}};
export type Input={
 getCapabilities:{};getState:{};openDocument:FileTransfer&OpenMetadata&{approval:OpenApproval};
 getLayoutReport:{};listTemplates:{};getStyleCatalog:{templateId:'public-report';templateVersion:'1'};
 prepareDocument:({spec:HostDocumentSpec}|{markdown:string})&{destination:Destination;replaceDirty?:boolean};
 commitPreparedDocument:{candidateId:string;approval?:Approval};captureSelection:{};
 readSelection:{snapshotId:string;context?:{before:number;after:number}};
 previewEdits:{snapshotId:string;targetId:string;replacement:string};applyProposal:{proposalId:string;approval?:Approval};
 discardProposal:{proposalId:string};releaseSnapshot:{snapshotId:string};getOperation:{operationId:string};
 cancelOperation:{operationId:string};undo:{operationId?:string};redo:{};exportDocument:{format:'hwpx'};
 acknowledgeSave:{exportId:string;sha256:string;hostVersion:string;proof:string};
};
export type Output={
 getCapabilities:Capabilities;getState:State;openDocument:{state:State;displayRefreshed:boolean};getLayoutReport:Layout;
 listTemplates:{templates:DestinationTemplate[]};getStyleCatalog:DestinationTemplate&{styles:('title'|'subtitle'|'body'|'bullet'|'table')[]};
 prepareDocument:Prepared;commitPreparedDocument:{state:State;displayRefreshed:boolean};captureSelection:Snapshot;
 readSelection:ReadSelection;previewEdits:Proposal;applyProposal:{applied:boolean;state:State;displayRefreshed:boolean};
 discardProposal:{discarded:boolean};releaseSnapshot:{released:boolean};getOperation:Operation;cancelOperation:Operation;
 undo:{changed:boolean;state:State;displayRefreshed:boolean};redo:Output['undo'];exportDocument:Export;
 acknowledgeSave:{state:State;savedRevision:number;displayRefreshed:boolean};
};
type DestinationTemplate={templateId:'public-report';templateVersion:'1'};
type Schema={type?:string;const?:unknown;enum?:readonly unknown[];anyOf?:readonly Schema[];pattern?:string;minimum?:number;maximum?:number;
 minLength?:number;maxLength?:number;items?:Schema;minItems?:number;maxItems?:number;properties?:Record<string,Schema>;required?:string[];additionalProperties?:false;not?:Schema;'x-transferable'?:true};
const obj=(props:Record<string,Schema>,opt:readonly string[]=[]):Schema=>({type:'object',properties:props,required:Object.keys(props).filter(k=>!opt.includes(k)),additionalProperties:false});
const str=(maxLength:number,minLength=0):Schema=>({type:'string',maxLength,minLength});
const int=(maximum=Number.MAX_SAFE_INTEGER):Schema=>({type:'integer',minimum:0,maximum});
const literal=(value:unknown):Schema=>({const:value});
const pick=(...v:unknown[]):Schema=>({enum:v});
const one=(...v:Schema[]):Schema=>({anyOf:v});
const arr=(items:Schema,maxItems:number,minItems=0):Schema=>({type:'array',items,maxItems,minItems});
const b:Schema={type:'boolean'},none=obj({}),id:Schema={...str(128,1),pattern:'^[A-Za-z0-9_.:-]+$'},sha:Schema={...str(64,64),pattern:'^[a-f0-9]{64}$'};
const template={templateId:literal('public-report'),templateVersion:literal('1')},styles=pick('title','subtitle','body','bullet','table');
const dest={documentId:id,workingCopyId:id,hostVersion:id};
const binding=obj({...dest,documentInstanceId:id,mutationRevision:int()});
const approval=obj({subjectId:id,digest:sha,kind:pick('create','edit'),binding,sessionId:id,expiresAt:int(),proof:str(2048,1)});
const format=pick('hwp','hwpx'),openScope=pick('edit','readonly');
const fileName=str(255,5);
const source=obj({format,scope:openScope,exportFormats:arr(literal('hwpx'),1),conversionRequired:b,fileName},['fileName']);
const state=obj({binding,selectionRevision:int(),dirty:b,pageCount:int(),hasSelection:b,composition:b,readonly:b,canUndo:b,canRedo:b,source},['source']);
const openApproval=obj({digest:sha,sessionId:id,expiresAt:int(),proof:str(2048,1)});
const openPolicy=obj({availability:pick('guarded','unavailable'),scopes:arr(openScope,2),editRequiresCheckedExport:literal(true),hwpOverwrite:literal(false)});
const warning=arr(str(256),32),layout=obj({pageCount:int(),overflow:one(b,literal(null)),fontWarnings:warning});
const error=obj({code:pick(...errorCodes,'OUTCOME_UNKNOWN'),message:str(512),retryable:b,recovery:pick('none','resync','recapture','check-operation','reopen-copy')});
const scope=pick('read','edit','save','lifecycle');
const limitsSchema=obj(Object.fromEntries(Object.entries(limits).map(([k,v])=>[k,literal(v)])));
const transfer={bytes:{'x-transferable':true} as Schema,byteLength:{...int(limits.fileBytes),minimum:1},sha256:sha};
const documentText=str(limits.characters);
const positive=(maximum:number):Schema=>({...int(maximum),minimum:1});
// Exact shape at the transport; B's branded validator proves coverage, non-overlap and actual spans.
const grid=obj({rowCount:positive(limits.cells),colCount:positive(limits.columns),cells:arr(obj({
 row:int(limits.cells-1),col:int(limits.columns-1),rowSpan:positive(limits.cells),colSpan:positive(limits.columns),text:documentText,
}),limits.cells,1)});
const spec=obj({...template,blocks:arr(one(
 obj({kind:literal('heading'),styleId:pick('title','subtitle'),text:documentText}),
 obj({kind:literal('paragraph'),styleId:literal('body'),text:documentText}),
 obj({kind:literal('list'),styleId:literal('bullet'),items:arr(documentText,limits.blocks,1)}),
 obj({kind:literal('table'),styleId:literal('table'),rows:arr(arr(documentText,limits.columns,1),limits.cells,1)}),
 obj({kind:literal('table'),styleId:literal('table'),grid}),
),limits.blocks,1)});
const prepareBase={destination:obj(dest),replaceDirty:b};
const methodFields:Record<Method,Schema>={
 getCapabilities:none,getState:none,openDocument:obj({format,scope:openScope,destination:obj(dest),approval:openApproval,fileName,...transfer},['fileName']),getLayoutReport:none,
 listTemplates:none,getStyleCatalog:obj(template),
 prepareDocument:one(obj({...prepareBase,spec},['replaceDirty']),obj({...prepareBase,markdown:str(limits.characters,1)},['replaceDirty'])),
 commitPreparedDocument:obj({candidateId:id,approval},['approval']),captureSelection:none,
 readSelection:obj({snapshotId:id,context:obj({before:int(limits.context),after:int(limits.context)})},['context']),
 previewEdits:obj({snapshotId:id,targetId:id,replacement:str(2*limits.selection)}),
 applyProposal:obj({proposalId:id,approval},['approval']),discardProposal:obj({proposalId:id}),releaseSnapshot:obj({snapshotId:id}),
 getOperation:obj({operationId:id}),cancelOperation:obj({operationId:id}),undo:obj({operationId:id},['operationId']),redo:none,
 exportDocument:obj({format:literal('hwpx')}),acknowledgeSave:obj({exportId:id,sha256:sha,hostVersion:id,proof:str(2048,1)}),
};
const adopt=obj({state,displayRefreshed:b}),apply=obj({state,displayRefreshed:b,applied:b});
const receipt=one(obj({ok:literal(true),result:one(adopt,apply)}),obj({ok:literal(false),error}));
const op=one(obj({operationId:id,status:pick('pending','committed','failed','cancelled'),receipt},['receipt']),obj({code:literal('ALREADY_COMMITTED'),receipt}));
const resultFields:Record<Method,Schema>={
 getCapabilities:obj({methods:arr(pick(...Object.keys(methods)),20),formats:obj({open:arr(format,2),export:arr(literal('hwpx'),1)}),
  selection:str(256),limits:limitsSchema,notes:warning,openPolicy},['openPolicy']),getState:state,openDocument:adopt,getLayoutReport:layout,
 listTemplates:obj({templates:arr(obj(template),16)}),getStyleCatalog:obj({...template,styles:arr(styles,16)}),
 prepareDocument:obj({candidateId:id,previewDigest:sha,expiresAt:int(),bytesHash:sha,layout,warnings:warning,blocks:arr(one(
  obj({kind:literal('paragraph'),text:documentText}),obj({kind:literal('table'),rows:arr(arr(documentText,limits.columns,1),limits.cells,1)}),
  obj({kind:literal('table'),grid})),limits.blocks),destination:obj(dest),replaceDirty:b}),
 commitPreparedDocument:adopt,captureSelection:obj({snapshotId:id,targetId:id,binding,selectionRevision:int(),expiresAt:int(),start:int(),end:int(),sourceSha256:sha,formatDigest:sha}),
 readSelection:obj({segmentKey:id,text:str(2*limits.selection),format:obj({bold:b,italic:b,underline:b,fontSize:one({type:'number'},literal(null))}),
  context:obj({before:str(2*limits.context),after:str(2*limits.context),readOnly:literal(true),truncatedBefore:b,truncatedAfter:b})},['context']),
 previewEdits:obj({proposalId:id,previewDigest:sha,expiresAt:int(),targetId:id,before:str(2*limits.selection),after:str(2*limits.selection),
  sourceSha256:sha,formatDigest:sha,
  layout:obj({beforePages:int(),afterPages:int(),overflow:b})}),
 applyProposal:apply,discardProposal:obj({discarded:b}),releaseSnapshot:obj({released:b}),getOperation:op,cancelOperation:op,
 undo:obj({changed:b,state,displayRefreshed:b}),redo:obj({changed:b,state,displayRefreshed:b}),
 exportDocument:obj({...transfer,format:literal('hwpx'),exportId:id,binding,exportRevision:int(),warnings:warning}),
 acknowledgeSave:obj({state,savedRevision:int(),displayRefreshed:b}),
};
const header=Object.fromEntries(Object.entries(version).map(([k,v])=>[k,literal(v)]));
const ids={sessionId:id,requestId:id};
export const connectSchema=obj({...header,...ids,type:literal('connect'),permissions:arr(scope,4),sessionProof:str(2048,1),feature:literal(checkedOpenFeature)},['feature']);
export const disconnectSchema=obj({...header,sessionId:id,type:literal('disconnect')});
const connected=obj({permissions:arr(scope,4),state},['state']);
export const connectedSchema=one(obj({...header,...ids,type:literal('connected'),ok:literal(true),result:connected}),
 obj({...header,...ids,type:literal('connected'),ok:literal(false),error}));
export const events=['ready','document-changed','selection-changed','dirty-changed','operation-progress','proposal-ready','saved','session-closed'] as const;
export const eventSchema=obj({...header,sessionId:id,type:literal('event'),event:pick(...events),sequence:{...int(),minimum:1},state},['state']);
const sessionOnly=new Set<Method>(['getCapabilities','getState','listTemplates','getStyleCatalog','getOperation','cancelOperation']);
export const mutatingReceipt=(m:Method)=>m==='commitPreparedDocument'||m==='applyProposal'||m==='openDocument';
export const requests=Object.fromEntries((Object.keys(methods) as Method[]).map(m=>[m,obj({...header,...ids,type:literal('request'),method:literal(m),params:methodFields[m],
 ...(sessionOnly.has(m)?{}:{binding}),...(mutatingReceipt(m)?{operationId:id}:{})})])) as Record<Method,Schema>;
export const replies=Object.fromEntries((Object.keys(methods) as Method[]).map(m=>[m,one(
 obj({...header,...ids,type:literal('reply'),method:literal(m),ok:literal(true),result:resultFields[m]}),
 obj({...header,...ids,type:literal('reply'),method:literal(m),ok:literal(false),error}))])) as Record<Method,Schema>;
const unsupportedReply=obj({...header,...ids,type:literal('reply'),method:literal('unsupported'),ok:literal(false),error});

function matches(s:Schema,x:unknown):boolean{
 if(s.not&&matches(s.not,x))return false;
 if(s.anyOf&&!s.anyOf.some(y=>matches(y,x)))return false;
 if(Object.hasOwn(s,'const')&&x!==s.const||s.enum&&!s.enum.includes(x))return false;
 if(s['x-transferable'])return x instanceof ArrayBuffer&&x.byteLength>0&&x.byteLength<=limits.fileBytes;
 if(s.type==='string')return typeof x==='string'&&[...x].length>=(s.minLength??0)&&[...x].length<=(s.maxLength??Infinity)&&(!s.pattern||new RegExp(s.pattern,'u').test(x));
 if(s.type==='boolean')return typeof x==='boolean';
 if(s.type==='integer'||s.type==='number')return typeof x==='number'&&Number.isFinite(x)&&(s.type!=='integer'||Number.isSafeInteger(x))&&x>=(s.minimum??-Infinity)&&x<=(s.maximum??Infinity);
 if(s.type==='array')return Array.isArray(x)&&x.length>=(s.minItems??0)&&x.length<=(s.maxItems??Infinity)&&x.every(v=>matches(s.items!,v));
 if(s.type==='object')return isObject(x)&&s.required!.every(k=>Object.hasOwn(x,k))&&Object.entries(x).every(([k,v])=>Object.hasOwn(s.properties!,k)&&matches(s.properties![k],v));
 return true;
}
export function check(s:Schema,x:unknown,bytes?:ArrayBuffer){
 validateValue(x,bytes);
 if(!matches(s,x))throw new AIError('INVALID_REQUEST','요청이나 응답 형식이 올바르지 않습니다.');
}
export function methodOf(x:unknown):Method|undefined{
 return typeof x==='string'&&Object.hasOwn(methods,x)?x as Method:undefined;
}
export function versionMatches(x:unknown){
 return isObject(x)&&Object.entries(version).every(([k,v])=>x[k]===v);
}
export function schemaDocument(kind:'request'|'response'){
 return {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Onedit Host 1.0 '+kind,
  description:'Structured clone wire. x-transferable requires an owned, nonempty ArrayBuffer; length and SHA-256 are checked at the SDK boundary.',
  anyOf:kind==='request'?[connectSchema,disconnectSchema,...Object.values(requests)]:[connectedSchema,eventSchema,unsupportedReply,...Object.values(replies)]};
}
