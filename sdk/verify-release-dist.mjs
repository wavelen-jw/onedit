import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const manifest=JSON.parse(await readFile(path.join(root,'SDK-DIST-SHA256.json'),'utf8'));
async function list(dir,prefix=''){
 const out=[];
 for(const e of await readdir(dir,{withFileTypes:true})){
  if(e.isSymbolicLink()||(!e.isFile()&&!e.isDirectory()))throw Error('Unexpected member type: '+e.name);
  const name=prefix+e.name;
  if(e.isDirectory())out.push(...await list(path.join(dir,e.name),name+'/'));
  else out.push(name);
 }
 return out;
}
const dist=path.join(root,'dist');
const expected=Object.keys(manifest).sort();
const extraTypeOnly=new Set(['ai-merged-grid.js','ai-integration/document-spec.js']);
const actual=(await list(dist)).sort();
for(const n of actual)if(!Object.hasOwn(manifest,n)){
 if(!extraTypeOnly.has(n)||(await readFile(path.join(dist,n),'utf8')).trim()!=='export {};')
  throw Error('Unexpected JS or declaration: '+n);
}
for(const n of expected){
 const got=createHash('sha256').update(await readFile(path.join(dist,n))).digest('hex');
 if(got!==manifest[n])throw Error('Release SDK file mismatch: '+n);
}
console.log(JSON.stringify({status:'PASS_SDK_DIST_BYTES',verified:expected.length,extraTypeOnlyModules:actual.filter(n=>!Object.hasOwn(manifest,n))}));
