import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startReferenceHost} from '../sample/local.mjs';
const pkg=fileURLToPath(new URL('..',import.meta.url));
const editor=JSON.parse(await fs.readFile(path.join(pkg,'sample/editor-runtime.json')));
export async function run({chromium,editorRoot,out,executablePath}){
const pin={source:editor.source,WASM:editor.wasm,fixtures:Object.fromEntries(['plain.hwp','table.hwpx'].map(n=>[n,path.join(pkg,'fixtures',n)]))};
const H=x=>createHash('sha256').update(x).digest('hex');
const R={status:'STOP',source:pin.source,checks:[],files:{},errors:[]};
function ck(label,value,want=true){assert.deepEqual(value,want,label);R.checks.push(label);}
let demo,browser,context,foreign;
let p,f;
const read=()=>f.evaluate(()=>({doc:studioNext.inspect(),files:studioNext.files()}));
const sdk=async (method,params={},options={})=>p.evaluate(async({method,params,options})=>{
 const {client}=await import('/host.mjs');
 if(method==='openDocument')params.bytes=Uint8Array.from(params.bytes).buffer;
 try{return {ok:true,value:await client.request(method,params,options)};}catch(e){return {ok:false,code:e.code??e.name};}
},{method,params,options});
const ok=async (...args)=>{const r=await sdk(...args);assert.ok(r.ok,JSON.stringify([args[0],r]));return r.value;};
const binding=async()=>(await ok('getState')).binding;
async function negative(label,code,method,params,options){
 const before=await read(),r=await sdk(method,params,options);
 ck(label+' code',[r.ok,r.code],[false,code]);ck(label+' editor unchanged',await read(),before);
}
async function setup(){
 p=await context.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>R.errors.push(String(e)));
 await p.goto(demo.hostOrigin);
 await p.frameLocator('#editor').locator('#pages .page').first().waitFor({state:'attached'});
 f=p.frames().find(x=>x.url()===demo.editorOrigin+'/');assert.ok(f);
 await f.waitForFunction(()=>window.studioNext&&!document.documentElement.hasAttribute('data-workspace-startup'));
 await p.locator('#connect').click();
 await p.getByText('연결됨',{exact:true}).waitFor();
 return p;
}
async function review(action,approval='approve'){
 await p.locator('#'+action).click();
 const dialog=p.locator('#review');await dialog.waitFor();
 const text=await dialog.locator('#preview').innerText();
 return {text,finish:async()=>{
  await dialog.locator('button[value='+approval+']').click();
  await p.getByText(approval==='approve'?action+' 완료':'취소됨',{exact:true}).waitFor();
 }};
}
async function download(tag){
 const before=await read();
 const event=p.waitForEvent('download');
 await p.locator('#download').click();
 const dl=await event;const file=path.join(out,tag+'.hwpx');
 ck(tag+' download actual HWPX name',dl.suggestedFilename(),'onedit-example.hwpx');
 await dl.saveAs(file);
 await p.getByText('download 완료',{exact:true}).waitFor();
 ck(tag+' download does not change editor state',await read(),before);
 const bytes=await fs.readFile(file);
 ck(tag+' readback ZIP signature',bytes.subarray(0,4).toString('hex'),'504b0304');
 R.files[tag]={name:path.basename(file),sha256:H(bytes),length:bytes.length};
 return {file,semantic:before.doc.semantic};
}
async function fresh(entry){
 const n=await context.newPage();n.setDefaultTimeout(8000);n.on('pageerror',e=>R.errors.push(String(e)));
 await n.goto(demo.editorOrigin);
 await n.waitForFunction(()=>window.studioNext&&!document.documentElement.hasAttribute('data-workspace-startup'));
 const chooser=n.waitForEvent('filechooser');await n.locator('#format-bar label.file:has(#open)').click();
 await(await chooser).setFiles(entry.file);
 await n.waitForFunction(name=>studioNext.files().filename===name,path.basename(entry.file));
 ck(path.basename(entry.file)+' independent full UI matches authored projection',await n.evaluate(()=>studioNext.inspect().semantic),entry.semantic);
 await n.close();
}
async function pointer(pos){
 await f.evaluate(async entry=>{
  const {Interaction}=await import('/'+entry);
  const orig=Interaction.prototype.capture;
  Interaction.prototype.capture=function(...args){window.__ob=this;return Reflect.apply(orig,this,args);};
  window.__off=()=>{Interaction.prototype.capture=orig;};
 },editor.interactionEntry);
 await f.locator('#pages .page').first().click({position:{x:95,y:110}});
 await f.waitForFunction(()=>window.__ob);await f.evaluate(()=>__off());
 const target=typeof pos==='string'?await f.evaluate(t=>{
  const a=__ob.adapter;const l=a.call('getCursorModel').lists.find(x=>x.isCell&&a.text(a.listPosition(x))===t);
  return {...a.listPosition(l),offset:4};
 },pos):pos;
 const xy=await f.evaluate(x=>{
  const r=__ob.adapter.rect(x),g=document.querySelector(`#pages [data-page="${r.pageIndex}"]`);
  g.scrollIntoView({block:'start'});const a=new DOMPoint(r.x+.2,r.y+r.height/2).matrixTransform(g.querySelector('svg').getScreenCTM());return{x:a.x,y:a.y};
 },target);
 const box=await p.locator('#editor').boundingBox();await p.mouse.click(box.x+xy.x,box.y+xy.y);
 ck('pointer resolves exact native owner',await f.evaluate(()=>studioNext.inspect().selection.focus),target);
 return target;
}
const methodSet=['getCapabilities','getState','openDocument','getLayoutReport','listTemplates','getStyleCatalog','prepareDocument','commitPreparedDocument',
 'captureSelection','readSelection','previewEdits','applyProposal','discardProposal','releaseSnapshot','getOperation','cancelOperation','undo','redo','exportDocument','acknowledgeSave'];
try{
 demo=await startReferenceHost({editorRoot});
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),chromiumSandbox:true});
 context=await browser.newContext({viewport:{width:1450,height:1100},acceptDownloads:true});
 let foreignOrigin;
 await context.route('**/*',r=>[demo.hostOrigin,demo.editorOrigin,foreignOrigin].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
 R.phase='SDK example Markdown and structured generation';
 await setup();
 ck('served SDK example identifies the Onedit editor WASM',await f.evaluate(async entry=>{const a=await import('/'+entry);return a.coreRuntimeSha256;},editor.coreRuntimeEntry),pin.WASM);
 const caps=await ok('getCapabilities');
 ck('exact 20-method runtime capability surface',[...caps.methods].sort(),methodSet.sort());
 ck('editable native capabilities and no HWP overwrite',[caps.formats,caps.openPolicy.hwpOverwrite],[{open:['hwp','hwpx'],export:['hwpx']},false]);
 ck('template discovery',(await ok('listTemplates')).templates,[{templateId:'public-report',templateVersion:'1'}]);
 ck('style catalog',(await ok('getStyleCatalog',{templateId:'public-report',templateVersion:'1'})).styles,['title','subtitle','body','bullet','table']);
 ck('layout exposes nullable overflow',(await ok('getLayoutReport',{},{binding:await binding()})).overflow,null);
 for(const [mode,title] of [['markdown','예제 보고서'],['spec','구조화 보고서']]){
  const before=await read(),draft=await review(mode);
  ck(mode+' preview contains source title',draft.text.includes(title));
  ck(mode+' prepare/review does not modify the current editor',await read(),before);
  if(mode==='spec')ck('structured preview carries actual merge topology',JSON.parse(draft.text.split('\n').slice(draft.text.startsWith('승인하면')?1:0).join('\n')).blocks.some(x=>x.grid?.cells[0].colSpan===2));
  await draft.finish();
  ck(mode+' explicit commit creates editable fresh instance',(await read()).doc.documentId!==before.doc.documentId);
  await fresh(await download(mode));
 }
 await p.close();

 R.phase='SDK example actual HWP and HWPX open and partial edit';
 for(const [name,tag,oldText,newText] of [['plain.hwp','hwp','A base safe paragraph','A Base safe paragraph'],['table.hwpx','hwpx','abc def ghi','abc Xef ghi']]){
  await setup();const original=pin.fixtures[name],raw=await fs.readFile(original);
  if(tag==='hwp'){
   const b=await binding(),op=crypto.randomUUID();
   const input={format:'hwp',scope:'edit',destination:{documentId:'other',workingCopyId:'other-copy',hostVersion:'initial'},fileName:name,
    bytes:[...raw],byteLength:raw.length,sha256:H(raw),approval:{sessionId:demo.sessionId,expiresAt:Date.now()+50000,digest:'a'.repeat(64),proof:'test'}};
   await negative('unsupported HWP write format','INVALID_REQUEST','exportDocument',{format:'hwp'},{binding:b});
   const calls=demo.counts.authorizedOpen;
   await negative('declared byte-length mismatch','INVALID_REQUEST','openDocument',{...input,byteLength:raw.length-1},{binding:b,operationId:op});
   await negative('SHA mismatch','INVALID_REQUEST','openDocument',{...input,sha256:'0'.repeat(64)},{binding:b,operationId:op});
   await negative('wrong format','FORMAT_MISMATCH','openDocument',{...input,format:'hwpx',fileName:'false.hwpx'},{binding:b,operationId:op});
   ck('length/hash/format did not pass mock open policy',demo.counts.authorizedOpen,calls);
  }
  await p.locator('#source').setInputFiles(original);const ready=await review('open');
  ck('review shows exact file name',ready.text.includes(name));await ready.finish();
  ck('open source format and filename',[(await ok('getState')).source.format,(await read()).files.filename],[tag,name]);
  const pos=await pointer(tag==='hwp'?{kind:'body',sec:0,para:0,offset:3}:oldText);
  await p.keyboard.press(tag==='hwp'?'Shift+ArrowLeft':'Shift+ArrowRight');
  const before=await read(),b=await binding();
  if(tag==='hwp'){
   const snap=await ok('captureSelection',{},{binding:b});
   const selected=await ok('readSelection',{snapshotId:snap.snapshotId},{binding:b});
   ck('selected original and SHA are exact',[selected.text,snap.sourceSha256],['b',H('b')]);
   await negative('target outside snapshot','SOURCE_MISMATCH','previewEdits',{snapshotId:snap.snapshotId,targetId:'not-target',replacement:'B'},{binding:b});
   const draft=await ok('previewEdits',{snapshotId:snap.snapshotId,targetId:snap.targetId,replacement:'B'},{binding:b});
   await negative('tampered approval digest','INVALID_APPROVAL','applyProposal',{proposalId:draft.proposalId,approval:{
    subjectId:draft.proposalId,digest:'0'.repeat(64),kind:'edit',binding:b,sessionId:demo.sessionId,expiresAt:draft.expiresAt,proof:'tampered',
   }},{binding:b,operationId:crypto.randomUUID()});
   await ok('discardProposal',{proposalId:draft.proposalId},{binding:b});
   await ok('releaseSnapshot',{snapshotId:snap.snapshotId},{binding:b});
  }
  await p.locator('#capture').click();await p.getByText('capture 완료',{exact:true}).waitFor();
  const proposal=await review('suggest');
  ck('chat focus moved out of editor after snapshot',await p.evaluate(()=>document.activeElement.closest('#review')!==null));
  ck('pinned selection preview leaves editor untouched',await read(),before);
  ck('mock edits exactly the pinned source',proposal.text.includes(tag==='hwp'?'b → B':'d → X'));
  await proposal.finish();
  const expected=structuredClone(before.doc.semantic);
  const range=tag==='hwp'?expected.body.find(x=>x.text===oldText):expected.cells.find(x=>x.paragraphs[0].text===oldText)?.paragraphs[0];
  assert.ok(range);range.text=newText;
  const after=await read();
  ck('apply changes exactly target and adds one Undo',[after.doc.semantic,after.doc.undo],[expected,before.doc.undo+1]);
  if(tag==='hwp')await negative('stale capture revision after edit','STALE_DOCUMENT','captureSelection',{}, {binding:b});
  await p.locator('#undo').click();await p.getByText('undo 완료',{exact:true}).waitFor();
  ck('one Undo restores all content and exposes Redo',[(await read()).doc.semantic,(await read()).doc.redo],[before.doc.semantic,1]);
  await p.locator('#redo').click();await p.getByText('redo 완료',{exact:true}).waitFor();
  ck('Redo restores only approved change',(await read()).doc.semantic,expected);
  await fresh(await download(tag));
  ck('input fixture unchanged after export',H(await fs.readFile(original)),H(raw));
  await p.close();
 }
 R.phase='origin and session negatives';
 await setup();
 await p.evaluate(origin=>{
  const frame=document.createElement('iframe');frame.id='security-frame';frame.src=origin;document.body.append(frame);
 },demo.editorOrigin);
 await p.frameLocator('#security-frame').locator('#pages .page').first().waitFor({state:'attached'});
 const match=await p.evaluate(async({editorOrigin,sessionId,sessionProof})=>{
  const frame=document.querySelector('#security-frame');
  const {port1,port2}=new MessageChannel();
  const header={protocol:'onedit-host',transportVersion:2,apiVersion:'1.0'};
  const out=[];
  const result=new Promise((ok,no)=>{
   const timer=setTimeout(()=>no(Error('session probe timed out')),4000);
   port1.onmessage=({data})=>{
    if(data.type==='connected'&&data.ok){
     for(const [sid,id] of [['invalid-session','wrong'],[sessionId,'right']])port1.postMessage({...header,type:'request',sessionId:sid,requestId:id,method:'getState',params:{}});
    }
    if(data.type==='reply'){out.push(data.requestId);if(data.requestId==='right')setTimeout(()=>{clearTimeout(timer);ok(out);},120);}
   };
  });
  frame.contentWindow.postMessage({...header,type:'connect',sessionId,sessionProof,requestId:'session-probe',permissions:['read']},editorOrigin,[port2]);
  try{return await result;}finally{port1.close();frame.remove();}
 },{editorOrigin:demo.editorOrigin,sessionId:demo.sessionId,sessionProof:demo.sessionProof});
 ck('valid port rejects wrong session and answers right session',match,['right']);
 foreign=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<iframe src="'+demo.editorOrigin+'"></iframe>');});
 await new Promise(resolve=>foreign.listen(0,'127.0.0.1',resolve));foreignOrigin='http://127.0.0.1:'+foreign.address().port;
 const outsider=await context.newPage(),blocked=[];outsider.on('console',m=>{if(m.text().includes('frame-ancestors'))blocked.push(m.text());});
 const n=demo.counts.connect;await outsider.goto(foreignOrigin);
 ck('unlisted origin is blocked by editor CSP',blocked.length>0);
 ck('foreign origin never reaches connect policy',demo.counts.connect,n);
 await outsider.close();
 ck('no browser application exceptions',R.errors,[]);
 const sdkInfo=await p.evaluate(async()=>{const e=await import('/sdk/index.js');return [e.version,e.methods.openDocument];});
 ck('browser imports installed ESM barrel',sdkInfo,[{protocol:'onedit-host',transportVersion:2,apiVersion:'1.0'},['openDocument','lifecycle']]);
 R.status='PASS_INSTALLED_RC_BROWSER';
}catch(e){R.error=String(e.stack??e).slice(0,5000);process.exitCode=1;}
finally{
 await browser?.close();
 if(foreign)await new Promise(ok=>{foreign.closeAllConnections();foreign.close(ok);});
 await demo?.close();R.gates='RELEASED';
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(R,null,2)+'\n');
 console.log(JSON.stringify({status:R.status,phase:R.phase,checks:R.checks.length,error:R.error?.split('\n')[0],gates:R.gates}));
}

return R;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {chromium}=await import('playwright');
 const [, , editorRoot, out, executablePath]=process.argv;
 if(!editorRoot||!out)throw Error('Usage: browser.mjs <prebuilt-editor-dir> <new-evidence-dir> [chromium-executable]');
 await fs.mkdir(out);
 await run({chromium,editorRoot,out,executablePath});
}
