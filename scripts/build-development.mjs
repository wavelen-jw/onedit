// Unified A development build. Installed public/core and product dist are never written.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundleDevelopment} from './bundle-development.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile('development-runtime.json','utf8'));
for(const [name,pin]of Object.entries(manifest.files)){
 if(!['rhwp.js','rhwp.d.ts','rhwp_bg.wasm','rhwp_bg.wasm.d.ts'].includes(name)||!/^[a-f0-9]{64}$/.test(pin))throw Error('Invalid fixed development runtime manifest');
 const target=path.join(root,'development/core',name);let bytes;
 try{if((await fs.lstat(target)).isSymbolicLink())throw Error('Runtime symlink refused');bytes=await fs.readFile(target);}
 catch(e){if(e.code!=='ENOENT')throw e;bytes=await fs.readFile(path.join(manifest.source,name));if(sha(bytes)!==pin)throw Error('Fixed source runtime hash mismatch: '+name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});}
 if(sha(bytes)!==pin)throw Error('Development runtime hash mismatch: '+name);
}
if(process.argv.includes('--typecheck')){
 execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],{stdio:'inherit'});process.exit(0);
}
const selected=manifest.rev10FormatSnapshot;
const runtimeNames=['rhwp.js','rhwp.d.ts','rhwp_bg.wasm','rhwp_bg.wasm.d.ts'];
if(selected?.sha256!==manifest.files['rhwp_bg.wasm'] ||
   !runtimeNames.every(n=>selected.matched4?.[n]===manifest.files[n]))
 throw Error('Private format snapshot Core mismatch');
const files=[];
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Source symlink refused: '+p);if(e.isDirectory())await walk(p);else files.push(p);}}
await walk('src');files.push('index.html','style.css','workspace-ui.css','development-runtime.json','scripts/build-development.mjs','scripts/bundle-development.mjs','scripts/prepare-build-tools.mjs','scripts/static-asset-policy.mjs','build-tools/package.json','build-tools/package-lock.json');
const inputs={};for(const p of files.sort())inputs[p]=sha(await fs.readFile(p));
const source=sha(Buffer.from(JSON.stringify(inputs))),out=path.join(root,'output/unified-development',source.slice(0,16));
try{const prior=JSON.parse(await fs.readFile(path.join(out,'development-build.json'),'utf8'));if(prior.source!==source)throw Error('Existing candidate differs');for(const[p,pin]of Object.entries(prior.outputs))if(sha(await fs.readFile(path.join(out,p)))!==pin)throw Error('Existing candidate changed: '+p);console.log(JSON.stringify({status:'PASS',runtime:out,source,reused:true,WASM:manifest.files['rhwp_bg.wasm']}));process.exit(0);}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(out,{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json','--outDir',path.join(out,'src')],{stdio:'inherit'});
// Fixed parser and its MIT notice are source-hashed inputs; tsc does not emit JS vendors.
await fs.mkdir(path.join(out,'src/vendor'),{recursive:true});
for(const name of ['marked.js','marked.LICENSE.md'])await fs.copyFile(path.join(root,'src/vendor',name),path.join(out,'src/vendor',name));
await fs.mkdir(path.join(out,'development/core'),{recursive:true});for(const name of Object.keys(manifest.files))await fs.copyFile(path.join(root,'development/core',name),path.join(out,'development/core',name));
await fs.mkdir(path.join(out,'public'),{recursive:true});for(const e of await fs.readdir('public',{withFileTypes:true}))if(e.name!=='core')await fs.cp(path.join('public',e.name),path.join(out,'public',e.name),{recursive:true});
for(const name of ['index.html','style.css','workspace-ui.css'])await fs.copyFile(name,path.join(out,name));
await bundleDevelopment(root,out,source,manifest);
const outputs={};async function hashOutputs(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await hashOutputs(p);else outputs[path.relative(out,p)]=sha(await fs.readFile(p));}}await hashOutputs(out);
await fs.writeFile(path.join(out,'development-build.json'),JSON.stringify({scope:'A non-product development; no release/candidate replacement',source,inputs,outputs,runtime:manifest},null,2)+'\n');
console.log(JSON.stringify({status:'PASS',runtime:out,source,WASM:manifest.files['rhwp_bg.wasm']}));
