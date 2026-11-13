// Isolated build dependencies: never reify shared UI/QA node_modules or user settings.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url)),manifest=await fs.readFile(path.join(root,'build-tools/package.json')),lock=await fs.readFile(path.join(root,'build-tools/package-lock.json'));
const sha=createHash('sha256').update(manifest).update(lock).digest('hex');
export const toolsDirectory=path.join(root,'.tools/build-'+sha.slice(0,16));
const entry=path.join(toolsDirectory,'node_modules/esbuild/lib/main.js');
try{await fs.access(entry);}catch{
 await fs.mkdir(toolsDirectory,{recursive:true});
 await fs.writeFile(path.join(toolsDirectory,'package.json'),manifest);await fs.writeFile(path.join(toolsDirectory,'package-lock.json'),lock);
 execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(root,'.cache/build-npm')],{cwd:toolsDirectory,stdio:'inherit'});
}
export const esbuild=await import(pathToFileURL(entry).href);
if(esbuild.version!=='0.25.12')throw Error('Unexpected isolated bundler version');
