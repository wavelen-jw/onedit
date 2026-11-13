import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const requireMatch=(actual,expected,label)=>{
 if(actual!==expected) throw Error('Integrity mismatch: '+label);
};
const [runtimeArg,...rest]=process.argv.slice(2);
if(!runtimeArg||rest.length) throw Error('Usage: node scripts/replay-public-release.mjs <extracted-runtime-directory>');
const runtimeRoot=path.resolve(runtimeArg);
const recipe=JSON.parse(await fs.readFile(path.join(root,'RELEASE-BUILD-RECIPE.json'),'utf8'));
const appConfig=JSON.parse(await fs.readFile(path.join(root,'development-runtime.json'),'utf8'));
const tools=['rhwp.js','rhwp.d.ts','rhwp_bg.wasm','rhwp_bg.wasm.d.ts'];
if(recipe.schema!==1||recipe.kind!=='onedit-public-app-replay'||! /^[0-9a-f]{64}$/.test(recipe.sourcePin))throw Error('Unsupported release recipe');
requireMatch(process.versions.node,recipe.toolchain.node,'Node');
const npm=execFileSync('npm',['--version'],{encoding:'utf8'}).trim();
requireMatch(npm,recipe.toolchain.npm,'npm');
for(const [n,digest] of Object.entries(recipe.inputs)){
 if(n.split('/').some(p=>!p||p==='..')||n.includes('\\')||path.isAbsolute(n))throw Error('Unsafe build input');
 requireMatch(sha(await fs.readFile(path.join(root,n))),digest,n);
}
const assetManifest=JSON.parse(await fs.readFile(path.join(runtimeRoot,'runtime/asset-manifest.json'),'utf8'));
requireMatch(assetManifest.app,recipe.sourcePin,'runtime asset identity');
const coreDir=path.join(root,'development/core');
await fs.mkdir(coreDir,{recursive:true});
for(const n of tools){
 const p=path.join(runtimeRoot,'build-inputs/core',n),target=path.join(coreDir,n),expected=recipe.core[n];
 if(!/^[0-9a-f]{64}$/.test(expected))throw Error('Invalid pinned Core hash');
 requireMatch(appConfig.files[n],expected,n+' source configuration');
 const bytes=await fs.readFile(p);
 requireMatch(sha(bytes),expected,n);
 try{
  if((await fs.lstat(target)).isSymbolicLink())throw Error('Symlink refused: '+n);
  requireMatch(sha(await fs.readFile(target)),expected,n+' installed');
 }catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(target,bytes,{flag:'wx'});}
}
const build=path.join(root,'scripts/build-development.mjs');
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','-p','tsconfig.json','--skipLibCheck','false'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[build],{cwd:root,stdio:'inherit'});
const out=path.join(root,'output','unified-development',recipe.sourcePin.slice(0,16));
const emitted=JSON.parse(await fs.readFile(path.join(out,'development-build.json'),'utf8'));
requireMatch(emitted.source,recipe.sourcePin,'build source identity');
const inputSet=Object.keys(emitted.inputs).sort();
requireMatch(JSON.stringify(inputSet),JSON.stringify(Object.keys(recipe.inputs).sort()),'build input set');
for(const n of inputSet)requireMatch(emitted.inputs[n],recipe.inputs[n],n+' manifest');
const expectedNames=Object.keys(recipe.generatedRuntimeFiles).sort();
const actualNames=Object.keys(assetManifest.files).sort();
requireMatch(JSON.stringify(expectedNames.filter(n=>n.startsWith('assets/'))),JSON.stringify(actualNames),'asset path set');
for(const n of expectedNames){
 if(n.split('/').some(p=>!p||p==='..')||n.includes('\\')||path.isAbsolute(n))throw Error('Unsafe runtime output path');
 const digest=recipe.generatedRuntimeFiles[n];
 requireMatch(emitted.outputs[n],digest,n+' build inventory');
 requireMatch(sha(await fs.readFile(path.join(out,n))),digest,n+' regenerated');
 requireMatch(sha(await fs.readFile(path.join(runtimeRoot,'runtime',n))),digest,n+' packaged');
}
console.log(JSON.stringify({status:'PASS_APP_RELEASE_BYTES',sourcePin:recipe.sourcePin,buildOutputs:Object.keys(emitted.outputs).length,verifiedGeneratedRuntimeFiles:expectedNames.length,core:'verified supplied binary; no Rust rebuild'}));
