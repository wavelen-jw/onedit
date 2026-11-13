// Loopback-only demonstration. Ephemeral proof issuer, no login or persistence.
// Serve only the pinned Onedit runtime, and permit only the two bundled test inputs.
import http from 'node:http';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve,extname} from 'node:path';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';

const here=fileURLToPath(new URL('.',import.meta.url));
const packageRoot=resolve(here,'..');
const runtimePin=JSON.parse(await fs.readFile(join(here,'editor-runtime.json')));
const H=b=>createHash('sha256').update(b).digest('hex');
const pack=x=>Array.isArray(x)?'['+x.map(pack).join(',')+']':
 x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+pack(x[k])).join(',')+'}':JSON.stringify(x);
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
const CSP="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'";
const scopes=['read','edit','save','lifecycle'];
const safeRead=new Set(['getCapabilities','getState','getCatalog','getLayoutReport','prepareDocument','captureSelection','readSelection',
 'previewEdits','releaseSelection','discardProposal','undo','redo','exportDocument','getOperation','cancelOperation']);
const readJSON=async req=>{
 const chunks=[];let len=0;
 for await(const chunk of req){len+=chunk.length;if(len>8192)throw Error('request too large');chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString());
};
const json=(res,data,code=200)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
export async function startReferenceHost({editorRoot}){
 if(typeof editorRoot!=='string'||!editorRoot)throw Error('An authorized prebuilt editor directory is required');
 const runtime=resolve(editorRoot);
 const servers=[];
 const start=fn=>new Promise((ok,no)=>{
  const server=http.createServer((req,res)=>void Promise.resolve(fn(req,res)).catch(()=>{if(!res.headersSent)res.writeHead(400);res.end();}));
  servers.push(server);server.on('error',no);server.listen(0,'127.0.0.1',()=>ok('http://127.0.0.1:'+server.address().port));
 });
 const close=()=>Promise.all(servers.map(s=>new Promise(ok=>{s.closeAllConnections();s.close(ok);})));
 try{
  const manifest=JSON.parse(await fs.readFile(join(packageRoot,'MANIFEST.json')));
  const allowedFiles=new Map(await Promise.all(['plain.hwp','table.hwpx'].map(async n=>{
   const name='fixtures/'+n,bytes=await fs.readFile(join(packageRoot,name));
   if(H(bytes)!==manifest[name])throw Error('Synthetic fixture pin mismatch: '+name);
   return [H(bytes),{format:n.split('.').at(-1),length:bytes.length}];
  })));
  // Fail early on a missing or incompatible editor, before either server listens.
  for(const [name,pin] of Object.entries(runtimePin.files)){
   if(H(await fs.readFile(join(runtime,name)))!==pin)throw Error('Editor artifact mismatch: '+name);
  }
  const sessionId=randomUUID(),sessionProof=randomUUID(),secret=randomBytes(32);
  const sign=x=>createHmac('sha256',secret).update(pack(x)).digest('hex');
  const verify=(x,proof)=>typeof proof==='string'&&/^[0-9a-f]{64}$/.test(proof)&&timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(sign(x),'hex'));
  const counts={connect:0,authorizedOpen:0,approved:0};let hostOrigin,editorOrigin;
  async function asset(res,name,bytes,csp=CSP){
   res.writeHead(200,{'content-type':mime[extname(name)]??'application/octet-stream','content-security-policy':csp,'x-content-type-options':'nosniff'});
   res.end(bytes);
  }
  async function pinned(name){
   if(!Object.hasOwn(runtimePin.files,name))return;
   const bytes=await fs.readFile(join(runtime,name));
   if(H(bytes)!==runtimePin.files[name])throw Error('Onedit asset pin mismatch');
   return bytes;
  }
  editorOrigin=await start(async(req,res)=>{
   const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   if(req.method==='POST'&&pathname==='/api/onedit-ai/authorize'){
    const r=await readJSON(req);
    if(r.method==='connect')counts.connect++;
    let allowed=r.origin===hostOrigin&&r.sessionProof===sessionProof&&r.sessionId===sessionId&&r.protocol==='onedit-host'&&r.transportVersion===2&&r.apiVersion==='1.0';
    if(r.method==='connect')allowed&&=Array.isArray(r.permissions)&&r.permissions.every(p=>scopes.includes(p));
    else if(r.method==='openDocument'){
     const {proof,...approval}=r.open?.approval??{};
     const f=r.open?.file, fixture=allowedFiles.get(f?.sha256);
     allowed&&=!!fixture&&fixture.format===f.format&&fixture.length===f.byteLength&&verify(approval,proof)&&approval.expiresAt>Date.now();
     if(allowed)counts.authorizedOpen++;
    }else if(r.method==='applyProposal'||r.method==='commitPreparedDocument'){
     const {proof,...approval}=r.approval??{};
     allowed&&=verify(approval,proof)&&approval.expiresAt>Date.now()&&approval.kind===(r.method==='applyProposal'?'edit':'create');
    }else allowed&&=safeRead.has(r.method); // No acknowledgeSave in this download-only example.
    return json(res,{allowed});
   }
   if(req.method!=='GET'){res.writeHead(405);return res.end();}
   const name=pathname==='/'?'index.html':pathname.slice(1);
   let bytes=await pinned(name);
   if(!bytes){res.writeHead(404);return res.end();}
   if(pathname==='/')bytes=Buffer.from(bytes.toString().replace('<head>','<head><meta name="onedit-host-origins" content="'+hostOrigin+'">'));
   return asset(res,name,bytes,CSP+'; frame-ancestors '+hostOrigin);
  });
  hostOrigin=await start(async(req,res)=>{
   const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   if(pathname==='/approve'&&req.method==='POST'&&req.headers.origin===hostOrigin){
    const p=await readJSON(req);
    if(p.sessionId!==sessionId||typeof p.digest!=='string'||!/^[0-9a-f]{64}$/.test(p.digest)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=Date.now())return json(res,{},400);
    counts.approved++;return json(res,{proof:sign(p)});
   }
   if(req.method!=='GET'){res.writeHead(405);return res.end();}
   if(pathname==='/configuration')return json(res,{editorOrigin,sessionId,sessionProof});
   if(pathname==='/')return asset(res,'index.html',await fs.readFile(join(here,'index.html')),CSP+'; frame-src '+editorOrigin);
   if(pathname==='/host.mjs')return asset(res,'host.mjs',await fs.readFile(join(here,'host.mjs')));
   if(pathname.startsWith('/sdk/')){
    const name='dist/'+pathname.slice(5);
    if(Object.hasOwn(manifest,name)&&name.endsWith('.js')){
     const bytes=await fs.readFile(join(packageRoot,name));
     if(H(bytes)!==manifest[name])throw Error('SDK artifact mismatch: '+name);
     return asset(res,name,bytes);
    }
   }
   res.writeHead(404);res.end();
  });
  return {hostOrigin,editorOrigin,sessionId,sessionProof,counts,close};
 }catch(e){await close();throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const local=await startReferenceHost({editorRoot:process.argv[2]});
 console.log(local.hostOrigin);
 process.once('SIGINT',()=>void local.close());
 process.once('SIGTERM',()=>void local.close());
}
