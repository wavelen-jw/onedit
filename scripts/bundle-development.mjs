import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {esbuild} from './prepare-build-tools.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function bundleDevelopment(root,out,source,runtime){
 const coreFile=runtime.files['rhwp.js']+'-rhwp.js',assets=path.join(out,'assets');await fs.mkdir(assets,{recursive:true});
 // Never bundle wasm-bindgen's singleton closure into the UI/shared chunks.
 // The byte-exact hash-named glue still receives a private UUID per instance.
 await fs.copyFile(path.join(root,'development/core/rhwp.js'),path.join(assets,coreFile));
 const wasmFile=runtime.files['rhwp_bg.wasm']+'-rhwp_bg.wasm';
 await fs.copyFile(path.join(root,'development/core/rhwp_bg.wasm'),path.join(assets,wasmFile));
 const entries=['workspace-startup','ui','interaction','core-runtime','font-provider','verified-asset-cache','cursor-model-memo'];
 const result=await esbuild.build({absWorkingDir:root,entryPoints:Object.fromEntries(entries.map(name=>[name,'rhwp-entry:'+name])),bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',outdir:assets,entryNames:source+'-[name]-[hash]',chunkNames:source+'-chunk-[hash]',minifyWhitespace:true,minifySyntax:true,keepNames:true,sourcemap:false,metafile:true,write:true,legalComments:'none',plugins:[{
  name:'exact-private-core',setup(build){
   // A canonical virtual module path keeps chunk identities independent of the
   // temporary tsc/output directory while consuming the exact checked JS emit.
   build.onResolve({filter:/.*/},args=>{
    if(args.path.startsWith('rhwp-entry:'))return{path:'/src/'+args.path.slice(11)+'.js',namespace:'rhwp-compiled'};
    if(args.namespace!=='rhwp-compiled')return;
    const resolved=path.posix.resolve(path.posix.dirname(args.importer),args.path);
    if(resolved==='/development/core/rhwp.js')return{path:'./'+coreFile,external:true};
    if(resolved.startsWith('/src/')&&resolved.endsWith('.js'))return{path:resolved,namespace:'rhwp-compiled'};
    throw Error('Unexpected bundled import: '+args.path);
   });
   build.onLoad({filter:/.*/,namespace:'rhwp-compiled'},async args=>{
    let contents=await fs.readFile(path.join(out,args.path.slice(1)),'utf8');
    if(args.path==='/src/core-runtime.js'){
     const before="new URL('../development/core/rhwp.js', import.meta.url)";
     if(!contents.includes(before))throw Error('Private Core glue URL contract changed');
     contents=contents.replace(before,"new URL('./"+coreFile+"', import.meta.url)");
    }
    return{contents,loader:'js'};
   });
  }
 }]});
 const emitted={};for(const[name,info]of Object.entries(result.metafile.outputs)){if(info.entryPoint){const base=path.basename(info.entryPoint,'.js');if(entries.includes(base))emitted[base]=path.relative(out,path.resolve(root,name)).replaceAll(path.sep,'/');}}
 if(entries.some(name=>!emitted[name]))throw Error('Bundle entry missing');
 // Preserve existing internal inspection paths with facades to the SAME modules,
 // not duplicate compiled Interaction/WeakMap/font-provider copies.
 for(const name of entries)await fs.writeFile(path.join(out,'src',name+'.js'),`export * from ${JSON.stringify('../'+emitted[name])};\n`);
 let html=await fs.readFile(path.join(out,'index.html'),'utf8');
 for(const name of ['workspace-startup','ui']){const old='src/'+name+'.js';if(!html.includes(old))throw Error('HTML entry missing: '+old);html=html.replaceAll(old,emitted[name]);}
 for(const file of ['style.css','workspace-ui.css']){const bytes=await fs.readFile(path.join(out,file)),rel='assets/'+sha(bytes)+'-'+file;await fs.writeFile(path.join(out,rel),bytes);html=html.replace('href="'+file+'"','href="'+rel+'"');}
 await fs.writeFile(path.join(out,'index.html'),html);
 const files={};for(const name of(await fs.readdir(assets)).sort())files['assets/'+name]=sha(await fs.readFile(path.join(assets,name)));
 await fs.writeFile(path.join(out,'asset-manifest.json'),JSON.stringify({version:1,app:source,files},null,2)+'\n');
 const meta={...result.metafile}; // Build-local attribution, not shipped script/source maps.
 await fs.writeFile(path.join(out,'bundle-analysis.json'),JSON.stringify({entries:emitted,coreGlue:'assets/'+coreFile,metafile:meta},null,2)+'\n');
 return emitted;
}
