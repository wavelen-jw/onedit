// Copies only reviewed runtime files from a separately authorized prebuilt editor.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw Error('Usage: stage-editor.mjs <prebuilt-editor-dir> <new-dir>');
const pins=JSON.parse(await fs.readFile(new URL('./editor-runtime.json',import.meta.url)));
await fs.mkdir(target);
for(const [name,expected] of Object.entries(pins.files)){
 const src=path.join(source,name),dst=path.join(target,name);
 const data=await fs.readFile(src);
 if(createHash('sha256').update(data).digest('hex')!==expected)throw Error('Editor asset hash mismatch: '+name);
 await fs.mkdir(path.dirname(dst),{recursive:true});
 await fs.writeFile(dst,data,{flag:'wx'});
}
console.log(JSON.stringify({status:'PASS',source:pins.source,files:Object.keys(pins.files).length}));
