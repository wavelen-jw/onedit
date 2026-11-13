import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {OneditHostClient,AIError,methods,events,version,schemaDocument,openApprovalDigest} from 'onedit-ai-host-sdk';
const origin='http://127.0.0.1:4080';
Object.defineProperty(globalThis,'location',{value:new URL('http://127.0.0.1:4079/'),configurable:true});
const identity={documentId:'initial',workingCopyId:'copy',documentInstanceId:'instance',mutationRevision:0,hostVersion:'v1'};
const live={binding:identity,selectionRevision:0,dirty:false,pageCount:1,hasSelection:false,composition:false,readonly:false,canUndo:false,canRedo:false};
const digest=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
test('package exports and versioned schemas match the actual runtime',async()=>{
 assert.equal(typeof OneditHostClient.connect,'function');assert.equal(Object.keys(methods).length,20);
 assert.deepEqual(version,{protocol:'onedit-host',transportVersion:2,apiVersion:'1.0'});
 assert.ok(events.includes('document-changed'));
 for(const kind of ['request','response']){
  const url=import.meta.resolve('onedit-ai-host-sdk/schema/'+kind+'.schema.json');
  assert.deepEqual(JSON.parse(await readFile(new URL(url),'utf8')),schemaDocument(kind));
 }
});
test('root entry rejects incorrect origin and uses only the exact target',async()=>{
 let attempted=0;
 const frame={src:origin+'/',contentWindow:{postMessage(){attempted++;}}};
 await assert.rejects(OneditHostClient.connect(frame,'http://127.0.0.1:4081',{sessionProof:'demo',permissions:['read']}),{code:'ORIGIN_NOT_ALLOWED'});
 await assert.rejects(OneditHostClient.connect(frame,'*',{sessionProof:'demo',permissions:['read']}),{code:'ORIGIN_NOT_ALLOWED'});
 assert.equal(attempted,0);
});
test('installed SDK validates transferable length/hash and never transfers caller bytes',async()=>{
 let received;const session='scoped';let port;
 const frame={src:origin+'/',contentWindow:{postMessage(hello,target,ports){
  assert.equal(target,origin);assert.equal(hello.feature,'checked-open-v1');port=ports[0];
  port.onmessage=({data})=>{
   if(data.type==='disconnect')return;
   received=data;
   port.postMessage({...version,type:'reply',sessionId:session,requestId:data.requestId,method:data.method,
    ok:true,result:{state:live,displayRefreshed:true}});
  };
  port.postMessage({...version,type:'connected',sessionId:session,requestId:hello.requestId,ok:true,result:{permissions:hello.permissions}});
 }}};
 const {client}=await OneditHostClient.connect(frame,origin,{sessionId:session,sessionProof:'demo',checkedOpen:true,permissions:['lifecycle']});
 try{
  const bytes=Uint8Array.of(80,75,3,4,1,2).buffer;
  const file={format:'hwpx',scope:'edit',destination:{documentId:'other',workingCopyId:'new-copy',hostVersion:'v2'},fileName:'sample.hwpx',byteLength:bytes.byteLength,sha256:await digest(bytes)};
  const expiresAt=Date.now()+1000,operationId='open';
  const approval={sessionId:session,expiresAt,digest:await openApprovalDigest(session,operationId,identity,file,expiresAt),proof:'demo'};
  assert.notEqual(approval.digest,await openApprovalDigest(session,operationId,identity,{...file,fileName:'different.hwpx'},expiresAt));
  const options={binding:identity,operationId};
  await assert.rejects(client.request('openDocument',{...file,bytes,byteLength:1,approval},options),{code:'INVALID_REQUEST'});
  await assert.rejects(client.request('openDocument',{...file,bytes,sha256:'0'.repeat(64),approval},options),{code:'INVALID_REQUEST'});
  assert.equal(received,undefined);
  assert.equal((await client.request('openDocument',{...file,bytes,approval},options)).displayRefreshed,true);
  assert.equal(received.params.bytes.byteLength,bytes.byteLength);
  assert.equal(await digest(received.params.bytes),file.sha256);
  assert.equal(received.operationId,operationId);
  assert.equal(bytes.byteLength,6);
  await assert.rejects(client.request('exportDocument',{format:'hwp'},{binding:identity}),e=>e instanceof AIError&&e.code==='INVALID_REQUEST');
 }finally{client.close();port.close();}
});
