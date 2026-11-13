import {OneditHostClient,openApprovalDigest} from 'onedit-ai-host-sdk';
import type {Binding,Approval,Prepared,Proposal,Destination,Input,OpenMetadata,OpenApproval,Snapshot} from 'onedit-ai-host-sdk';
export type Review<T> = (draft: Readonly<T>, binding: Binding) => Promise<Approval|null>;
export function connect(frame: HTMLIFrameElement, editorOrigin: string, sessionProof: string) {
 return OneditHostClient.connect(frame,editorOrigin,{sessionProof,checkedOpen:true,permissions:['read','edit','lifecycle','save']});
}
export async function create(client:OneditHostClient,input:Input['prepareDocument'],review:Review<Prepared>,operationId:string) {
 const {binding}=await client.request('getState',{});
 return client.createFromChat(input,binding,draft=>review(draft,binding),operationId);
}
export async function open(client:OneditHostClient,bytes:ArrayBuffer,format:OpenMetadata['format'],fileName:string,destination:Destination,
 operationId:string,approve:(file:OpenMetadata,binding:Binding,digest:string,expiresAt:number)=>Promise<OpenApproval>) {
 const caps=await client.request('getCapabilities',{});
 if(!caps.methods.includes('openDocument')||!caps.formats.open.includes(format)||!caps.openPolicy?.scopes.includes('edit'))throw Error('Unsupported open');
 const fixed=bytes.slice(0),{binding}=await client.request('getState',{});
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',fixed))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const file:OpenMetadata={format,scope:'edit',fileName,destination:structuredClone(destination),byteLength:fixed.byteLength,sha256};
 const expiresAt=Date.now()+60_000;
 const digest=await openApprovalDigest(client.sessionId,operationId,binding,file,expiresAt);
 const approval=await approve(structuredClone(file),structuredClone(binding),digest,expiresAt);
 return client.request('openDocument',{...file,bytes:fixed,approval},{binding,operationId});
}
export async function capture(client:OneditHostClient) {
 const {binding}=await client.request('getState',{});
 return client.request('captureSelection',{},{binding});
}
export function revise(client:OneditHostClient,pinned:Snapshot,propose:(text:string)=>Promise<string>,review:Review<Proposal>,operationId:string) {
 return client.revisePinnedSelection(pinned,async({segmentKey,text})=>({segmentKey,replacement:await propose(text)}),
  draft=>review(draft,pinned.binding),operationId);
}
export async function exportHwpx(client:OneditHostClient) {
 const {binding}=await client.request('getState',{});
 return client.request('exportDocument',{format:'hwpx'},{binding});
}
