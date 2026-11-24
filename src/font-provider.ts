import { fontFamilyKey } from './font-name.js';
import {fontFamilyValues} from './font-family-values.js';
import {finishResponsiveWork,yieldToBrowser} from './responsive-work.js';
// Font supply is session rendering state. Only an explicit formatting Command
// changes document font references; availability and substitution never do.
import type { RhwpAdapter } from './adapter.js';
import { verifiedAssetBytes } from './verified-asset-cache.js';
import {localFontNames,localFaceFor,localFaceBytes,knownLocalNames,restoreLocalFaces,type LocalFace} from './local-font-access.js';
import {readLocalGlyphWidths} from './local-font-widths.js';
import {bundledWebFonts} from './bundled-web-fonts.js';
import {TEST_FONT_ACCESS_PATH,testServiceFonts} from './test-service-fonts.js';
// Byte-backed FontFace construction can decode synchronously. Separate
// adjacent faces so queued font completions do not monopolize one task.
async function decodeFont(...args: ConstructorParameters<typeof FontFace>) {
  await yieldToBrowser();
  return new FontFace(...args).load();
}
export type FontSupply = { family:string; status:'loading'|'loaded'|'unavailable'|'unknown'; source:'web'|'service'|'local'|'document'; label:string; weights:string[] };
const bundledHCR = [
  {file:'HANBatang.woff',SHA256:'b3192018e3bd4da76b29b0530f71c79fb6f465a2b7cd41308bc38f9a4ae09a6c'},
  {file:'HCRDotum.woff',SHA256:'49bf312aec309ba88c3eb612c591c2d8e28b765c156c808691850137431bb1bf'},
];
const verifiedHcrRegular = new WeakSet<FontFace>();
const fontBytes=new Map<string,Promise<Uint8Array<ArrayBuffer>>>();
const failedFontFiles=new Set<string>();
// All Korean/English registrations share a single verified response per asset.
function verifiedFont(file:string,digest:string,restricted=false){
  const url=new URL((restricted?TEST_FONT_ACCESS_PATH:'../public/fonts/')+file,import.meta.url);
  let job=fontBytes.get(url.href);
  if(!job){job=verifiedAssetBytes(url,digest,'font',AbortSignal.timeout(10000),!restricted)
    .catch(error=>{failedFontFiles.add(url.href);throw error;});fontBytes.set(url.href,job);}
  return job;
}
const catalog = bundledWebFonts;
const aliases = [
  ['함초롬바탕','함초롬 바탕','HCR Batang','HCRBatang'],
  ['함초롬돋움','함초롬 돋움','HCR Dotum','HCRDotum'],
  ['맑은 고딕','맑은고딕','Malgun Gothic'],
];
// User-selected startup families. Other definitions stay demand-loaded.
const startupFamilies = ['함초롬바탕','함초롬돋움','맑은 고딕'];
// Offering a configured name is not evidence that its bytes or local face loaded.
export const configuredFontFamilies:readonly string[]=[...startupFamilies,...catalog.flatMap(f=>[f.family,...f.aliases]),...testServiceFonts.map(f=>f.family)];
const serviceFont=(family:string)=>testServiceFonts.find(f=>!hftFamilies.has(f.family)&&[f.family,...f.aliases].some(n=>familyKey(n)===familyKey(family)));
const substitutedHanyang = '한양신명조';
const hanyangDisplayFace = 'Noto Serif KR';
const fallbackFamily=(family:string)=>/(?:고딕|돋움|dotum|gothic|sans|굴림|gulim|arial|맑은)/i.test(family)?'Noto Sans KR':'Noto Serif KR';
const safe=(n:string)=>!!n.trim()&&n.length<=200&&!/[\x00-\x1f,'"\\;{}]/.test(n);
const css=(n:string)=>JSON.stringify(n);
const records=new Map<string,FontSupply>(),pending=new Map<string,Promise<void>>();
type PrintFontSource = string | {bytes:Uint8Array<ArrayBuffer>;format:'woff'|'woff2'|'truetype'|'opentype'};
const faces:{family:string;weight:string;src:PrintFontSource;face:FontFace}[]=[];
const scopedFamilies=[
  ['맑은 고딕','맑은고딕','Malgun Gothic'],
  ['함초롬바탕','함초롬 바탕','HCR Batang','HCRBatang'],
  ['함초롬돋움','함초롬 돋움','HCR Dotum','HCRDotum'],
  ['바탕','Batang'],
  ['HY헤드라인M','HYHeadLine-Medium','HYHeadLine M','HYHeadLine Medium'],
];
const exactNominal=new Map<string,Map<string,ReturnType<typeof readLocalGlyphWidths>>>();
// W1c's existing internal environment shape requires a 64-hex field.
// The zero value means unverified local metrics, not a font fingerprint.
// Widths and source character styles drive fitting; no provenance check.
const unverifiedLocalMetricTag='0'.repeat(64);
type NominalMetrics={family:string;bold:boolean;italic:boolean;sourceSha256:string;unitsPerEm:number;advances:Record<number,number>};
let nominalGeneration=0, localSourceGeneration=0;
const checkedLocalSources=new WeakMap<object,number>();
const waitingSymbolAsset=new WeakMap<object,number>();
const measuredOpenMetrics=new WeakMap<object,{revision:number;generation:number;metrics:NominalMetrics[]}>();
const localOpenDocs=new WeakSet<object>();
const attemptedLocal=new Map<string,LocalFace>();
const appliedEnvironment=new WeakMap<object,string>();
const rejectedScopedEnvironment=new WeakMap<object,string>();
const embeddedFontFamilies=new WeakMap<object,ReadonlySet<string>>();
const appliedSubstitutions=new WeakMap<object,ReadonlySet<string>>();

/** Document-level family substitution already selected by the font lifecycle. */
export function isSubstitutedFont(doc:object, family:string) {
  return appliedSubstitutions.get(doc)?.has(family) === true &&
    embeddedFontFamilies.get(doc)?.has(family) === false;
}
// Isolated trial only. Reuse the existing SRI asset fetch and local face
// permission; never ask the browser to substitute a family through CSS.
const trialSymbolFont={file:'NotoSansSymbols2-Regular.ttf',
  sha256:'7d5fb73b7ca67a6798101741f5d280a3d016a56a197afcd4199dbb57b4b82a21'};
let readySymbolTrialAsset:{bytes:Uint8Array<ArrayBuffer>;widths:ReturnType<typeof readLocalGlyphWidths>}|undefined;
const symbolTrialActive=new WeakSet<object>();
const initializedSymbolTrial=new WeakSet<object>();
const trialSymbol=(c:number)=>(c>=0x2190&&c<=0x22ff)||(c>=0x2460&&c<=0x24ff)||(c>=0x2500&&c<=0x25ff);
const covered=(widths:ReturnType<typeof readLocalGlyphWidths>,cp:number)=>{
  const w=widths.lookup(cp);return w>0&&w!==65535;
};
const unknownSymbolCoverage=new WeakMap<object,readonly string[]>();
export function unverifiedSymbolFonts(a:RhwpAdapter):readonly string[]{
  // This notice concerns availability of the named display face. A loaded
  // bundled or authenticated server face doesn't require an OS font lookup.
  return (unknownSymbolCoverage.get(a.doc)??[]).filter(name=>{
    const face=fontSupply(name);
    return face?.status!=='loaded'||!face.weights.some(weight=>weight==='400'||weight==='normal');
  });
}
type SymbolMisses = Map<number,{bytes:Uint8Array<ArrayBuffer>;cps:Set<number>}>;
const openingSymbolProbe = new WeakMap<RhwpAdapter['doc'], {generation:number; misses:SymbolMisses | undefined}>();

function publishUnknownCoverage(a:RhwpAdapter, unknown:Set<string>) {
  if(unknown.size)unknownSymbolCoverage.set(a.doc,[...unknown]);
  else unknownSymbolCoverage.delete(a.doc);
}
function symbolTrialMisses(a:RhwpAdapter){
  const unknown=new Set<string>();
  try{
    const work=collectSymbolTrialMisses(a,unknown);
    let part=work.next();
    while(!part.done)part=work.next();
    return part.value;
  } finally {
    publishUnknownCoverage(a,unknown);
  }
}
type SymbolSlot = [shape: number, face: string, codePoint: number];
type OpenPageFonts = {hftFamilies: string[]; symbols: SymbolSlot[]};

function* legacySymbolSlots(a:RhwpAdapter, page:number, symbols:FontRecord[]):Generator<SymbolSlot> {
  let runs:ReturnType<RhwpAdapter['runs']>|undefined;
  for(const r of symbols){
      const x=r.source,f=r.document,cp=Number(x?.codePoint),id=Number(x?.charShapeId);
      if(!trialSymbol(cp)||x?.status!=='complete'||!Number.isSafeInteger(id)||f?.embedded!==false
        ||f.languageSlot!==5||typeof f.face!=='string'||f.face===substitutedHanyang||x.charOffset==null)continue;
      const run=(runs??=a.runs(page)).find(t=>(t as typeof t & {charShapeId?:number}).charShapeId===id&&
        x.charOffset>=t.charStart&&t.text&&[...t.text][x.charOffset-t.charStart]?.codePointAt(0)===cp);
      if(!run)continue;
      const props=a.charProps(a.position(run,x.charOffset));
      if(props.bold===true||props.italic===true||Number(props.charShapeId)!==id)continue;
      yield [id,f.face,cp];
  }
}

// The detached document has no edits or font-environment changes between
// this scan and byte registration. Hold only source slots across font loads.
function* scanOpeningFonts(a:RhwpAdapter, authored:readonly string[], pages:SymbolSlot[][]) {
  const eligible=new Set<string>();
  for(let page=0;page<a.doc.pageCount();page++){
    const result:OpenPageFonts=JSON.parse(a.doc.getPageOpenFontSources(page));
    for(const name of result.hftFamilies)if(hftFamilies.has(name)&&authored.includes(name))eligible.add(name);
    pages.push(result.symbols);
    yield;
  }
  hftByDocument.set(a.doc,eligible);
}

function* collectSymbolTrialMisses(a:RhwpAdapter,unknown:Set<string>,opening?:SymbolSlot[][]):Generator<void,SymbolMisses | undefined> {
  const doc=a.doc;
  const missed:SymbolMisses=new Map();
  const metrics=new Map<Uint8Array<ArrayBuffer>,ReturnType<typeof readLocalGlyphWidths>>();
  for(let page=0;page<doc.pageCount();page++){
    yield;
    let slots: Iterable<SymbolSlot>;
    if(opening)slots=opening[page];
    else if(typeof doc.getPageOpenFontSources==='function'){
      const result:OpenPageFonts=JSON.parse(doc.getPageOpenFontSources(page));
      slots=result.symbols;
    }else{
      const records=pageFontSources(a,page,false);
      if(!records)return;
      slots=legacySymbolSlots(a,page,records);
    }
    for(const [id,face,cp] of slots){
      if(face===substitutedHanyang)continue;
      const bytes=localSources.get(face)?.find(e=>e.weight==='400')?.bytes;
      if(!bytes){unknown.add(face);continue;}
      let widths=metrics.get(bytes);
      if(!widths){
        try{widths=readLocalGlyphWidths(bytes);metrics.set(bytes,widths);}
        catch(error){unknown.add(face);throw error;}
      }
      if(covered(widths,cp))continue;
      const m=missed.get(id);
      if(m&&m.bytes!==bytes)return;
      if(m)m.cps.add(cp);else missed.set(id,{bytes,cps:new Set([cp])});
      if(missed.size>64)return;
    }
  }
  return missed;
}
// Converted HFT sources have private paint families. Keep native document
// layout and authored name/type resolution independent of web font supply.
export const hftFamilies = new Map([['HCI Poppy','Onedit HFT Poppy'],['휴먼명조','Onedit HFT Human Myeongjo']]);
type FontSourceIdentity = {status:string;codePoint:number;charShapeId:number;runIndex:number;sectionIndex:number;paragraphIndex:number;charOffset:number;character:string};
type FontRecord = {source:FontSourceIdentity;document:{face:string;altType:number;languageSlot:number;embedded:boolean}};
export function pageFontSources(a:RhwpAdapter,page:number,hft:boolean):FontRecord[]|undefined {
  if(typeof a.doc.getPageFontSources==='function')return JSON.parse(a.doc.getPageFontSources(page,hft));
  // Separately pinned older hosts still use the original bounded query.
  const trace=JSON.parse(a.doc.getFontDecisionTrace(page,'{"maxCharacters":4096}'));
  return trace.status==='complete'&&Array.isArray(trace.records)?trace.records:undefined;
}
const hftByDocument = new WeakMap<object,Set<string>>();
function inspectHft(a:RhwpAdapter, authored:readonly string[]){
  for (const _ of inspectHftParts(a, authored)) { /* Drain the rare synchronous fallback. */ }
}
function* inspectHftParts(a:RhwpAdapter, authored:readonly string[]){
  const wanted=authored.filter(name=>hftFamilies.has(name));
  const eligible=new Set<string>();
  hftByDocument.set(a.doc,eligible);
  if(!wanted.length)return;
  for(let page=0;page<a.doc.pageCount()&&eligible.size<wanted.length;page++){
    yield;
    for(const {source,document:face} of pageFontSources(a,page,true)??[]){
      if(source?.status==='complete'&&face?.altType===2&&face.embedded===false&&wanted.includes(face.face))
        eligible.add(face.face);
    }
  }
}
const hftLoads = new Map<string,Promise<void>>();
function loadHft(name:string):Promise<void> {
  const pending=hftLoads.get(name);
  if(pending)return pending;
  const alias=hftFamilies.get(name);
  const config=testServiceFonts.find(f=>f.family===name);
  if(!alias||!config)return Promise.resolve();
  const job=Promise.all(config.files.map(async ({file,SHA256,weight})=>{
    const bytes=await verifiedFont(file,SHA256,!!config.restricted);
    const face=await decodeFont(alias,bytes,{weight,style:'normal'});
    registerManagedFace(alias,weight,face,{bytes,format:file.endsWith('.ttf')?'truetype':'opentype'});
  })).then(()=>{changed();}).catch(()=>{/* The native paint remains usable. */});
  hftLoads.set(name,job);
  return job;
}
export function hftPaintFamilies(a:RhwpAdapter): ReadonlyMap<string,string> {
  return new Map([...(hftByDocument.get(a.doc)??[])].flatMap(name=>{
    const alias=hftFamilies.get(name);
    return alias&&loadedFaces(alias).length?[[name,alias] as const]:[];
  }));
}
async function loadSymbolTrialAsset(){
  if(readySymbolTrialAsset)return;
  const bytes=await verifiedFont(trialSymbolFont.file,trialSymbolFont.sha256);
  readySymbolTrialAsset={bytes,widths:readLocalGlyphWidths(bytes)};
}

function nominalFamily(name:string){
  return scopedFamilies.find(group=>group.some(n=>familyKey(n)===familyKey(name)))?.[0];
}
function rememberNominal(family:string,weight:string,bytes:Uint8Array<ArrayBuffer>){
  const name=nominalFamily(family);
  if(!name)return;
  try{
    const widths=readLocalGlyphWidths(bytes);
    const faces=exactNominal.get(name)??new Map();
    faces.set(weight,widths);exactNominal.set(name,faces);nominalGeneration++;
  }catch{/* A face can load in the browser without usable standalone metrics. */}
}
// A missing font's alternate is part of the document, not a property of
// the family name. Conflicting declarations cannot be projected into the
// Core's family-wide environment; keep its slot-specific chains in that case.
const declaredFontAlternates=new WeakMap<object,Map<string,string|null>>();
function authoredFonts(a:RhwpAdapter){
  if(sourceRevisions.get(a.doc)!==a.revision){
    const info=JSON.parse(a.doc.getDocumentInfo());
    originalNames.set(a.doc,new Set<string>((info.fontsUsed??[])
      .filter((n:unknown):n is string=>typeof n==='string'&&safe(n))));
    const alternates=new Map<string,string|null>();
    for(const pair of Array.isArray(info.fontSubstitutions)?info.fontSubstitutions:[]){
      if(!Array.isArray(pair)||pair.length!==2)continue;
      const [name,face]=pair;
      if(typeof name!=='string'||typeof face!=='string'||!safe(name)||!safe(face))continue;
      const prior=alternates.get(name);
      alternates.set(name,prior===undefined||prior===face?face:null);
    }
    declaredFontAlternates.set(a.doc,alternates);
    if(Array.isArray(info.embeddedFontFamilies))
      embeddedFontFamilies.set(a.doc,new Set<string>(info.embeddedFontFamilies));
    sourceRevisions.set(a.doc,a.revision);
  }
  return originalNames.get(a.doc)!;
}
export async function loadOpenFonts(a:RhwpAdapter){
  const authored=[...authoredFonts(a)];
  let openingSlots:SymbolSlot[][] | undefined;
  try{
    if(typeof a.doc.getPageOpenFontSources==='function'){
      const pages:SymbolSlot[][]=[];
      await finishResponsiveWork(scanOpeningFonts(a,authored,pages));
      openingSlots=pages;
    }else await finishResponsiveWork(inspectHftParts(a,authored));
  }catch{hftByDocument.delete(a.doc);}
  await restoreLocalFaces(authored.filter(name=>name!==substitutedHanyang));
  await Promise.all([...(hftByDocument.get(a.doc)??[])].map(loadHft));
  const alternates=declaredFontAlternates.get(a.doc);
  const names=authored.filter(n=>nominalFamily(n)||serviceFont(n)||localFaceFor(n,'400')||
    alternates?.has(n)||n===substitutedHanyang);
  // Reuse the source-backed style query on a cold server-font decision.
  // A missing or incomplete inventory keeps the existing preload behavior.
  let usage: Map<string, boolean> | undefined;
  if (names.some(name=>serviceFont(name)&&!pending.has(name)) &&
      typeof a.doc.getVisibleFontStyles==='function') {
    try {
      const styles: BindingStyle[]|null=JSON.parse(a.doc.getVisibleFontStyles(
        Uint32Array.from({length:a.pageCount},(_,page)=>page)));
      if (styles?.length) {
        const verified=new Map<string,boolean>();
        for (const style of styles) {
          if(typeof style.bold!=='boolean'||!Array.isArray(style.fontFamilies)||style.fontFamilies.length!==7)
            throw Error('Incomplete source font styles');
          for (const name of style.fontFamilies) {
            if(typeof name!=='string'||!safe(name))continue;
            const key=familyKey(name);
            verified.set(key,verified.get(key)===true||style.bold);
          }
        }
        usage=verified;
      }
    } catch { /* Keep the complete preload for ambiguous content. */ }
  }
  await Promise.all(names.map(async name=>{
    const service=serviceFont(name);
    const usesBold=usage?.get(familyKey(name));
    if(service&&usage&&usesBold===undefined&&!localFaceFor(name,'400'))return;
    const regular=service?.files.find(file=>file.weight==='400');
    const bold=service?.files.find(file=>file.weight==='700');
    const regularOnly=usesBold===false&&!!regular&&!!bold&&regular.file!==bold.file;
    // Exact Core slots cannot switch files within an open document. Prefer a
    // newly detected installation when resolving the next document instead.
    if(records.get(name)?.source==='service'&&needsInstalledFace(name))pending.delete(name);
    await ensureFontFaces(name,regularOnly);
    if(name===substitutedHanyang)return;
    const face=localFaceFor(name,'400');
    if(face&&!localSources.has(name)&&attemptedLocal.get(name)!==face){
      attemptedLocal.set(name,face);pending.delete(name);await ensureFont(name);
    }
    if(fontSupply(name)?.status==='unavailable'){
      const alternate=alternates?.get(name);
      if(alternate)await ensureFont(alternate);
      if(alternate===undefined||(alternate&&fontSupply(alternate)?.status!=='loaded'))
        await ensureFont(fallbackFamily(name));
    }
  }));
  await document.fonts.ready;
  // The detached document cannot be edited by the UI. If an installed face
  // changes during the read, discard the mixed result and sample again.
  try{
    let generation: number, misses: SymbolMisses | undefined, unknown: Set<string>;
    do {
      generation=localSourceGeneration;
      unknown=new Set();
      misses=await finishResponsiveWork(collectSymbolTrialMisses(a,unknown,openingSlots));
    } while(generation!==localSourceGeneration);
    publishUnknownCoverage(a,unknown);
    openingSymbolProbe.set(a.doc,{generation,misses});
    if(misses?.size)await loadSymbolTrialAsset();
  }catch{/* Unknown coverage or asset integrity failure: keep existing display. */}
}
export function prepareLocalOpenDisplay(a:RhwpAdapter){
  const doc=a.doc;
  localOpenDocs.add(doc);
  if(!hftByDocument.has(doc))try{inspectHft(a,[...authoredFonts(a)]);}catch{hftByDocument.delete(doc);}
  const asset=readySymbolTrialAsset;
  if(initializedSymbolTrial.has(doc))return applyFontEnvironment(a);
  const opening=openingSymbolProbe.get(doc);
  openingSymbolProbe.delete(doc);
  try{
    // The open-time result was sampled from these same detached slots.
    const misses=opening?.generation===localSourceGeneration ? opening.misses : symbolTrialMisses(a);
    if (misses && (asset || !misses.size)) checkedLocalSources.set(doc,localSourceGeneration);
    if(!asset)return applyFontEnvironment(a);
    const plan=new Map([...(misses??[])].filter(([,m])=>[...m.cps].some(cp=>covered(asset.widths,cp)))
      .map(([id,m])=>[id,m.bytes]));
    if(!plan.size)return applyFontEnvironment(a);
    initializedSymbolTrial.add(doc);
    symbolTrialActive.add(doc);
    applyFontEnvironment(a);
    for(const [id,primary] of plan){
      const r=JSON.parse(doc.registerExactFontSource(id,5,primary,0));
      if(!r.ok||r.role==='pinnedSymbolFallback')throw Error('trial original source declined');
    }
    const id=plan.keys().next().value!;
    const r=JSON.parse(doc.registerExactFontSource(id,5,asset.bytes,0));
    if(!r.ok||r.role!=='pinnedSymbolFallback'||r.handle?.fontSourceSha256!==trialSymbolFont.sha256)
      throw Error('trial asset declined');
    a.invalidateUpdateReads();
    return true;
  }catch{
    symbolTrialActive.delete(doc);
    return applyFontEnvironment(a);
  }
}
// The user may permit installed-font access after opening the file. Reuse
// the first-open probe on the adopted document. Until the pinned asset
// settles, keep the current presentation; the
// next safe UI refresh publishes exactly one new layout for this result.
export function refreshLocalOpenDisplay(a:RhwpAdapter, onAssetReady:()=>void):boolean{
  const doc=a.doc, generation=localSourceGeneration;
  if(!localOpenDocs.has(doc)||a.transientEdit||initializedSymbolTrial.has(doc)||generation===0)
    return applyFontEnvironment(a);
  if(waitingSymbolAsset.get(doc)===generation)return false;
  if(checkedLocalSources.get(doc)!==generation){
    checkedLocalSources.set(doc,generation);
    if(readySymbolTrialAsset)return prepareLocalOpenDisplay(a);
    let hasMiss=false;
    try{ hasMiss=!!symbolTrialMisses(a)?.size; }
    catch{/* Unknown coverage does not grant a fallback. */}
    if(hasMiss){
      waitingSymbolAsset.set(doc,generation);
      void loadSymbolTrialAsset().then(()=>{
        if(checkedLocalSources.get(doc)===generation)checkedLocalSources.delete(doc);
      }).catch(()=>{/* Asset invalid or unavailable: ordinary font supply only. */}).finally(()=>{
        if(waitingSymbolAsset.get(doc)===generation)waitingSymbolAsset.delete(doc);
        if(a.doc===doc)onAssetReady();
      });
      return false;
    }
  }
  return applyFontEnvironment(a);
}
function scopedMetrics(a:RhwpAdapter, names:Set<string>){
  const cached=measuredOpenMetrics.get(a.doc);
  if(cached?.revision===a.revision&&cached.generation===nominalGeneration)return cached.metrics;
  const available=new Set([...names].map(nominalFamily)
    .filter((n):n is string=>!!n&&exactNominal.has(n)));
  if(!available.size)return [];
  const chars=new Set<number>(),families=new Set<string>();
  // Declared font tables may contain unused faces. Feed metrics only for
  // authored runs, never for a paint-time CSS fallback of another family.
  if (typeof a.doc.getNominalFontDemand === 'function') {
    const demand: {families:string[]; characters:number[]} = JSON.parse(a.doc.getNominalFontDemand());
    for (const name of demand.families) {
      const family = nominalFamily(name);
      if (family && available.has(family)) families.add(family);
    }
    for (const cp of demand.characters) chars.add(cp);
  } else {
    for(let page=0;page<a.doc.pageCount();page++){
      const trace=JSON.parse(a.doc.getFontDecisionTrace(page,'{"maxCharacters":4096}')).records as
        {document:{face?:string}}[];
      for(const r of trace){
        const f=r.document.face&&nominalFamily(r.document.face);
        if(f&&available.has(f))families.add(f);
      }
      for(const run of JSON.parse(a.doc.getPageTextLayout(page)).runs)for(const c of run.text as string){
          const cp=c.codePointAt(0)!;
          if(cp===0xb7||(cp>=0xac00&&cp<=0xd7a3)||/^[0-9A-Za-z]$/.test(c))chars.add(cp);
        }
    }
  }
  const metrics=chars.size>4096?[]:[...families].flatMap(family=>[...exactNominal.get(family)!].flatMap(([weight,face])=>{
    const advances:Record<number,number>={};
    for(const cp of chars){const width=face.lookup(cp);if(width>0&&width!==65535)advances[cp]=width;}
    return Object.keys(advances).length?[{family,bold:weight==='700',italic:false,
      sourceSha256:unverifiedLocalMetricTag,unitsPerEm:face.unitsPerEm,advances}]:[];
  }));
  measuredOpenMetrics.set(a.doc,{revision:a.revision,generation:nominalGeneration,metrics});
  return metrics;
}
const localSources=new Map<string,{weight:string;bytes:Uint8Array<ArrayBuffer>;installed:boolean}[]>();
const localCore=new WeakMap<object,Map<string,string>>(),boundLocalSlots=new WeakMap<object,Map<string,Uint8Array<ArrayBuffer>>>();
const rejectedLocalSlots=new WeakMap<object,Map<string,Uint8Array<ArrayBuffer>>>();
const bindingSupply=new WeakMap<RhwpAdapter['doc'],number>();
let bindingSupplyRevision=0;
// verifiedFont shares the immutable byte object across aliases. Keep print-only
// encoding lazy and share its completed CSS source, without retaining extra bytes.
const printSources=new WeakMap<Uint8Array<ArrayBuffer>,Map<string,string>>();
const originalNames=new WeakMap<object,Set<string>>(),sourceRevisions=new WeakMap<object,number>();
const cssFallbacksByDocument=new WeakMap<object,Map<string,string[]>>();
let revision=0, started=false;
const familyKey = fontFamilyKey;
function loadedFaces(family:string){return typeof document==='undefined'?[]:[...document.fonts].filter(f=>familyKey(f.family)===familyKey(family)&&f.status==='loaded');}
export function fontSupply(family:string):FontSupply|undefined{
  const r=records.get(family)??[...records.values()].find(r=>familyKey(r.family)===familyKey(family));
  const loaded=loadedFaces(family);
  // CSS family matching is case-insensitive. A stale local lookup or differently
  // quoted name must not override a loaded, exactly named document/web face.
  // This proves named CSS supply only, never glyph coverage or Core registration.
  if(loaded.length&&r?.status!=='loaded')return{family,status:'loaded',source:'document',weights:[...new Set(loaded.map(f=>f.weight))],label:'등록 FontFace 로드됨 · 실제 글리프/face는 별도 확인'};
  return r;
}
export function availableFontSupply(){return [...records.keys()].map(n=>fontSupply(n)!).filter(r=>r.status==='loaded');}
export function allFontSupply(){return [...records.keys()].map(n=>fontSupply(n)!);}
export function localFontCoreStatus(family:string,doc:object){return localCore.get(doc)?.get(family)??'Core 등록 전';}
export function fontSupplyRevision(){return revision;}
function changed(){revision++;document.dispatchEvent(new CustomEvent('rhwp:fonts-updated'));}
function record(family:string,status:FontSupply['status'],source:FontSupply['source'],weights:string[]=[],detail=''){
  const hasBold=weights.some(w=>w==='100 900'||Number(w)>=700);
  records.set(family,{family,status,source,weights,label:status==='loaded'?`${source==='service'?'테스트 서버 글꼴':source==='web'?'기본 웹폰트':source==='document'?'문서 등록 글꼴':'설치 글꼴 확인'} · ${weights.join('/')} ${hasBold?'':'· 굵게는 합성 가능'} · 모든 문자 보장 아님${detail?' · '+detail:''}`:status==='loading'?'글꼴 로딩 중':status==='unavailable'?(source==='web'?'기본 글꼴 로딩 실패 · '+detail+' · 다시 불러오기 가능 · 시스템 대체':`${detail||'원본 글꼴 확인 불가'} · 대체 표시`):'글꼴 확인 미완료'});changed();
}
function dataURL(bytes:Uint8Array,format='woff2'){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:font/'+format+';base64,'+btoa(s);}
function printSource(src:PrintFontSource):string{
  if(typeof src==='string')return src;
  let formats=printSources.get(src.bytes);
  if(!formats){formats=new Map();printSources.set(src.bytes,formats);}
  let value=formats.get(src.format);
  if(value===undefined){
    value=`url(${css(dataURL(src.bytes,src.format))}) format(${css(src.format)})`;
    formats.set(src.format,value);
  }
  return value;
}
let fontSupplyInFlight=0;
export function hasPendingFontSupply(){return fontSupplyInFlight!==0;}
function needsInstalledFace(family:string){
  return ['400','700'].some(weight=>localFaceFor(family,weight)&&!localSources.get(family)?.some(f=>f.weight===weight&&f.installed));
}
function registerManagedFace(family:string,weight:string,face:FontFace,src:PrintFontSource,data?:{bytes:Uint8Array<ArrayBuffer>;installed:boolean}){
  const index=faces.findIndex(f=>f.family===family&&f.weight===weight);
  if(index!==-1){document.fonts.delete(faces[index].face);faces.splice(index,1);}
  document.fonts.add(face);faces.push({family,weight,face,src});
  const list=(localSources.get(family)??[]).filter(f=>f.weight!==weight);
  if(data){list.push({weight,...data});rememberNominal(family,weight,data.bytes);if(weight==='400')localSourceGeneration++;}
  if(list.length)localSources.set(family,list);else localSources.delete(family);
  bindingSupplyRevision++;
}
// An explicit formatting or an unclassified visible run can upgrade an
// earlier regular-only preload without refetching its registered face.
const regularOnlyPending=new Set<string>();
export function ensureFont(family:string):Promise<void>{
  return ensureFontFaces(family,false);
}
function ensureFontFaces(family:string,regularOnly:boolean):Promise<void>{
  if(!safe(family))return Promise.resolve();
  const previous=pending.get(family);
  const upgrade=!!previous&&regularOnlyPending.has(family)&&!regularOnly;
  if(previous&&!upgrade)return previous;
  if(regularOnly)regularOnlyPending.add(family);
  else regularOnlyPending.delete(family);
  // Reserve before dispatch: open font fields synchronously refresh on status.
  fontSupplyInFlight++;
  const job=(previous??Promise.resolve()).then(async()=>{
    const existing=loadedFaces(family);
    if(existing.some(face=>!faces.some(f=>f.face===face))){record(family,'loaded','document',existing.map(f=>f.weight));return;}
    if(family===substitutedHanyang){
      record(family,'unavailable','local',[],'원본 지정 유지 · Noto Serif KR 사용');
      await ensureFont(hanyangDisplayFace);
      return;
    }
    const web=catalog.find(f=>[f.family,...f.aliases].some(n=>familyKey(n)===familyKey(family)));
    const registered=upgrade?records.get(family):undefined;
    const weights=registered?.status==='loaded'?[...registered.weights]:[];
    if(!weights.length)record(family,'loading',web?'web':'local');
    let source:FontSupply['source']=registered?.source??(web?'web':'local'),detail='',stage='설치 이름 확인';
    try{
      if(web){
        for(const{file,SHA256,weight}of web.files){
          stage='다운로드';const bytes=await verifiedFont(file,SHA256);stage='브라우저 글꼴 디코딩';
          const face=await decodeFont(family,bytes,{weight,style:'normal',display:'swap'});
          document.fonts.add(face);faces.push({family,weight,face,src:{bytes,format:'woff2'}});weights.push(weight);
        }
      }else{
        const alias=aliases.findIndex(a=>a.some(n=>n.toLowerCase()===family.toLowerCase()));
        const group=aliases[alias]??[family],bundled=bundledHCR[alias],service=serviceFont(family);
        for(const weight of regularOnly?['400']:['400','700']){
          if(weights.includes(weight))continue;
          const local=localFaceFor(family,weight);
          if(local){
            try{
              const bytes=await localFaceBytes(local);
              const face=await decodeFont(family,bytes,{weight,style:'normal'});
              const format=String.fromCharCode(...bytes.subarray(0,4))==='OTTO'?'opentype':'truetype';
              registerManagedFace(family,weight,face,{bytes,format},{bytes,installed:true});
              weights.push(weight);detail='설치 파일 확인';continue;
            }catch{/* The operating system may still render this name. */}
          }
          // Resolve real local names, never masquerade a different font as HCR.
          const names=weight==='700'?group.flatMap(n=>[n+' Bold',n.replaceAll(' ','')+'-Bold',n+' 굵게']):group;
          const src=[...new Set([...knownLocalNames(family,weight),...names])].map(n=>`local(${css(n)})`).join(',');
          try{
            const face=await decodeFont(family,src,{weight});
            registerManagedFace(family,weight,face,src);weights.push(weight);continue;
          }catch{/* Keep looking for a service font at the requested weight. */}
          const file=service?.files.find(file=>file.weight===weight);
          if(file){
            try{
              const bytes=await verifiedFont(file.file,file.SHA256,service?.restricted);
              const face=await decodeFont(family,bytes,{weight,style:'normal'});
              registerManagedFace(family,weight,face,{bytes,format:'truetype'},{bytes,installed:false});
              weights.push(weight);source='service';
            }catch{stage='테스트 서버 글꼴을 불러오지 못했습니다';}
          }
        }
        if(bundled&&!weights.includes('400')){
          source='web';
          stage='다운로드';const bytes=await verifiedFont(bundled.file,bundled.SHA256),weight='400';stage='브라우저 글꼴 디코딩';
          const face=await decodeFont(family,bytes,{weight,style:'normal',display:'swap'});
          document.fonts.add(face);verifiedHcrRegular.add(face);faces.push({family,weight,face,src:{bytes,format:'woff'}});weights.unshift(weight);
          detail=weights.includes('700')?'함초롬 웹 Regular / 설치 Bold':'함초롬 웹 Regular · 별도 Bold 파일 없음';
        }
      }
      if(!weights.length)throw Error(stage);
      record(family,'loaded',source,weights,detail);
    }catch(error){
      const failure=error instanceof Error?error.message:String(error);
      record(family,weights.length?'loaded':'unavailable',source,weights,weights.length?detail:
        failure.includes('font source identity mismatch')?'원본 SHA 검산 실패':`${stage} 실패`);
      // A missing local/bundled face requests the existing fallback lazily.
      // Never mark the requested source family as loaded by a different font.
      if(!web&&!weights.length)void ensureFont(fallbackFamily(family));
    }
  }).finally(()=>{fontSupplyInFlight--;});pending.set(family,job);return job;
}
let recovery:Promise<void>|undefined;
/** Explicit user retry only. Successful verified bytes stay shared and intact. */
export function retryFailedFontSupply():Promise<void>{
  if(recovery)return recovery;
  const failed=[...records.values()].filter(r=>r.status==='unavailable'&&r.family!==substitutedHanyang).map(r=>r.family);
  for(const file of failedFontFiles){fontBytes.delete(file);}failedFontFiles.clear();
  for(const family of failed)pending.delete(family);
  recovery=Promise.all(failed.map(ensureFont)).then(()=>{}).finally(()=>{recovery=undefined;});
  return recovery;
}
export function startFontSupply(){
  if(started)return;started=true;
  for(const family of startupFamilies)void ensureFont(family);
  document.addEventListener('rhwp:local-fonts-updated',()=>{
    // A failed lookup must not permanently mask a subsequently permitted face.
    // Successful supplied faces and document-owned sources stay untouched.
    for(const family of localFontNames()){
      const r=records.get(family),upgrade=r?.source==='local'&&needsInstalledFace(family);
      if(r?.status==='unavailable'||upgrade)pending.delete(family);
      if(upgrade)void ensureFont(family);
    }
    changed();
  });
  document.fonts.addEventListener('loadingdone',()=>{
    for(const[family,r]of records){const loaded=[...document.fonts].filter(f=>!faces.some(x=>x.face===f)&&f.family.replace(/^(['"])(.*)\1$/,'$2')===family&&f.status==='loaded');
      if(loaded.length&&(r.source!=='document'||r.status!=='loaded'))record(family,'loaded','document',loaded.map(f=>f.weight));}
  });
}
export function displayFont(family:string):string|undefined{
  if(fontSupply(family)?.status==='loaded')return family;
  if(family===substitutedHanyang&&fontSupply(hanyangDisplayFace)?.status==='loaded')return hanyangDisplayFace;
  const fallback=fallbackFamily(family);
  return fontSupply(fallback)?.status==='loaded'?fallback:undefined;
}
function usesHanyangFallback(family:string){
  return family===substitutedHanyang&&fontSupply(family)?.status==='unavailable'&&fontSupply(hanyangDisplayFace)?.status==='loaded';
}
export function fontDisplayDescription(family:string){
  if(usesHanyangFallback(family))return '한양신명조 · Noto Serif KR로 표시 (원본 지정 유지)';
  const r=fontSupply(family),display=displayFont(family);
  return r?.status==='loaded'?`${family} — ${r.label}`:r?.status==='unavailable'?`원본 ${family} → 대체 후보 ${display??'시스템 글꼴(실제 face 미확인)'} · ${r.label}; 원본 지정 유지`:`${family} — ${r?.status==='loading'?'로딩 중':'사용 가능 여부 미확인'} · 실제 대체 미판정; 원본 지정 유지`;
}
/** User-facing only for an actionable failure. Details remain in diagnostics. */
export function fontActionFailure(family:string){return !usesHanyangFallback(family)&&fontSupply(family)?.status==='unavailable'?'글꼴을 불러오지 못했습니다. 다른 글꼴을 선택하거나 다시 불러오세요.':'';}
export function requestPageFonts(a:RhwpAdapter,pages:HTMLElement,presentedOnly=false, changedPages?: readonly HTMLElement[]){
  // Source names come from the source-facing Core query, not mapped paint CSS.
  // Re-read only after document edits/replacement, including explicit font edits.
  if(sourceRevisions.get(a.doc)!==a.revision){
    const info=JSON.parse(a.doc.getDocumentInfo());
    const names=new Set<string>((info.fontsUsed??[]).filter((n:unknown):n is string=>typeof n==='string'&&safe(n)));
    originalNames.set(a.doc,names);sourceRevisions.set(a.doc,a.revision);
    // The font table includes unused definitions (even in a blank document).
    // Preserve source identity without fetching every declared family.
  }
  // Renderer fallback chains guide the display candidate, never source identity.
  // Glyphs commonly repeat the exact family chain. Reuse only its pure parsing
  // within this synchronous scan; still apply every occurrence in DOM order so
  // A/B/A chains for the same requested family retain the existing last-wins rule.
  // No parsed result survives an edit, document replacement or font transition.
  const parsed=new Map<string,{name:string;fallbacks:string[]}|null>();
  // ensureFont reserves a family in pending synchronously; repeating the same
  // request in this scan cannot change supply. Keep fallback assignment in DOM
  // order below, but resolve/request each family only once per synchronous scan.
  // This set never survives a render, edit, font transition or document change.
  const requested=new Map<string,boolean>();
  const request=(name:string,regularText=false)=>{
    const regularOnly=regularText&&regularOnlyPending.has(name);
    const previous=requested.get(name);
    if(previous===undefined||previous&&!regularOnly){
      requested.set(name,regularOnly);
      void ensureFontFaces(name,regularOnly);
    }
  };
  const fallbackRequests=new Set<string>();
  const primaryCoverage = new Map<string,boolean>();
  function hasVerifiedBasicCoverage(name:string){
    if(!primaryCoverage.has(name)){
      const key=familyKey(name);
      const matches=[...document.fonts].filter(f=>familyKey(f.family)===key);
      primaryCoverage.set(name,matches.length===1 && matches[0].status==='loaded' &&
        verifiedHcrRegular.has(matches[0]));
    }
    return primaryCoverage.get(name);
  }
  const fontUse = (value: string) => {
    if(!parsed.has(value)){
      const match=/^\s*(?:'([^']+)'|"([^"]+)"|([^,]+))/.exec(value);
      const n=(match?.[1]??match?.[2]??match?.[3]??'').trim();
      // The remaining CSS chain is fallback policy, not additional original IR names.
      parsed.set(value,safe(n)&&!['serif','sans-serif','monospace','system-ui'].includes(n)
        ?{name:n,fallbacks:value.split(',').slice(1).map(x=>x.trim().replace(/^(['"])(.*)\1$/,'$2'))}:null);
    }
    return parsed.get(value);
  };
  let cssFallbacks=cssFallbacksByDocument.get(a.doc);
  if(!cssFallbacks){cssFallbacks=new Map();cssFallbacksByDocument.set(a.doc,cssFallbacks);}
  let fontValues = changedPages ? changedPages.flatMap(page => fontFamilyValues(page)) : fontFamilyValues(pages);
  // A changed chain may also appear on an untouched page. In that case keep
  // the established document-order fallback resolution.
  if (changedPages && fontValues.some(({ value }) => {
    const chain = fontUse(value);
    if (!chain) return false;
    const previous = cssFallbacks.get(chain.name);
    return previous && (previous.length !== chain.fallbacks.length ||
      previous.some((item, i) => item !== chain.fallbacks[i]));
  })) fontValues = fontFamilyValues(pages);
  for (const {value,basicRegularText} of fontValues) {
    const chain = fontUse(value);
    if(chain){
      cssFallbacks.set(chain.name,chain.fallbacks);
      request(chain.name,basicRegularText);
      // The loaded primary already supplies every character of this plain run.
      if(basicRegularText && hasVerifiedBasicCoverage(chain.name))continue;
      for(const n of chain.fallbacks){
        if(fallbackRequests.has(n))continue;
        fallbackRequests.add(n);
        if(catalog.some(f=>f.family===n||(f.aliases as readonly string[]).includes(n))||aliases.some(group=>group.some(a=>a.toLowerCase()===n.toLowerCase())))request(n);
      }
    }
  }
  const scopedLocalOpen=localOpenDocs.has(a.doc);
  if([...localSources.keys()].some(family=>!scopedLocalOpen||!nominalFamily(family)))
    bindLocalFontSources(a,pages,presentedOnly);
}
type BindingStyle = {charShapeId:number; bold:boolean; italic:boolean; fontFamilies:unknown[]};
function* visibleBindingStyles(a:RhwpAdapter,numbers:readonly number[]):Generator<BindingStyle>{
  if(!a.hasPendingLocalBodyFlow()&&typeof a.doc.getVisibleFontStyles==='function'){
    const styles:BindingStyle[]|null=JSON.parse(a.doc.getVisibleFontStyles(Uint32Array.from(numbers)));
    if(styles!==null){yield* styles;return;}
  }
  const seen=new Set<number>();
  for(const page of numbers)for(const run of a.runs(page)){
    if(!run.text)continue;
    const runShape=(run as typeof run&{charShapeId?:number}).charShapeId;
    if(runShape!==undefined&&seen.has(runShape))continue;
    const raw=a.charProps(a.position(run,run.charStart)),shape=Number(raw.charShapeId);
    if(!Number.isSafeInteger(shape)||seen.has(shape)||!Array.isArray(raw.fontFamilies)||raw.fontFamilies.length!==7)continue;
    seen.add(shape);
    yield {charShapeId:shape,bold:raw.bold===true,italic:raw.italic===true,fontFamilies:raw.fontFamilies};
  }
}
function bindLocalFontSources(a:RhwpAdapter,pages:HTMLElement,presentedOnly:boolean){
  if(!localSources.size||a.transientEdit)return;
  let slots=boundLocalSlots.get(a.doc);if(!slots){slots=new Map();boundLocalSlots.set(a.doc,slots);}
  let rejected=rejectedLocalSlots.get(a.doc);if(!rejected){rejected=new Map();rejectedLocalSlots.set(a.doc,rejected);}
  let status=localCore.get(a.doc);if(!status){status=new Map();localCore.set(a.doc,status);}
  const doc=a.doc,revision=a.revision,supply=bindingSupplyRevision;
  // A new document or source needs a complete admission pass because adding a
  // font can move content across pages. On ordinary renders hidden pages still
  // carry a previous revision. Read their new styles when they are rendered.
  const selector=presentedOnly && bindingSupply.get(doc)===supply?'[data-page]:not([data-render-pending])':'[data-page]';
  const numbers=Array.from(pages.querySelectorAll<HTMLElement>(selector),p=>Number(p.dataset.page));
  if(!numbers.length)return;
  const requests:{shape:number;language:number;family:string;bytes:Uint8Array<ArrayBuffer>}[]=[];let registered=false;
  for(const raw of visibleBindingStyles(a,numbers)){
    const shape=raw.charShapeId;
    raw.fontFamilies.forEach((family:unknown,language:number)=>{
      if(typeof family!=='string'||raw.italic===true||family===substitutedHanyang||hftFamilies.has(family))return;
      if(localOpenDocs.has(a.doc)&&nominalFamily(family))return;
      const source=localSources.get(family)?.find(f=>f.weight===(raw.bold===true?'700':'400'));if(!source)return;
      const key=shape+':'+language;if(slots!.get(key)===source.bytes||rejected!.get(key)===source.bytes)return;
      requests.push({shape,language,family,bytes:source.bytes});
    });
  }
  // Exact-source registration can repaginate. Resolve all source slots from one
  // stable layout first; never continue reading old page indices after a bind.
  if(requests.length && typeof doc.registerExactFontSlots==='function'){
    const faces=new Map<Uint8Array<ArrayBuffer>,number>();
    const bindings=new Uint32Array(requests.length*3);
    for(const [index,{shape,language,bytes}] of requests.entries()){
      if(!faces.has(bytes))faces.set(bytes,faces.size);
      bindings.set([shape,language,faces.get(bytes)!],index*3);
    }
    if(a.doc!==doc||a.revision!==revision||a.transientEdit)return;
    let applied:boolean|undefined;
    a.invalidateUpdateReads();
    try{applied=doc.registerExactFontSlots(bindings,[...faces.keys()]);}
    catch{/* A rejected batch is atomic. Retain independent per-slot admission below. */}
    if(applied!==undefined){
      for(const {shape,language,family,bytes} of requests){
        slots.set(shape+':'+language,bytes);
        status.set(family,'Core 정확 슬롯 등록됨');
      }
      bindingSupply.set(doc,supply);
      if(applied)changed();
      return;
    }
  }
  for(const {shape,language,family,bytes}of requests){
      if(a.doc!==doc||a.revision!==revision||a.transientEdit)return;
      const key=shape+':'+language;
      try{
        a.invalidateUpdateReads();
        const result=JSON.parse(doc.registerExactFontSource(shape,language,bytes,0));
        if(!result.ok||!['registered','already-registered'].includes(result.status))throw Error('정확 슬롯 등록 거절');
        slots!.set(key,bytes);status!.set(family,'Core 정확 슬롯 등록됨');registered||=result.status==='registered';
      }catch(error){rejected!.set(key,bytes);status!.set(family,'Core 등록 실패: '+String(error));console.warn('설치 글꼴 Core 슬롯 등록 실패',family,shape,language,error);}
  }
  bindingSupply.set(doc,supply);
  if(registered)changed();
}
export function applyFontEnvironment(a:RhwpAdapter, source = a):boolean{
  const substitutions:Record<string,string>={};
  const alternates=declaredFontAlternates.get(source.doc);
  for(const name of originalNames.get(source.doc)??[]){
    // Pending or verified local/document faces keep priority. Core independently
    // protects embedded sources; a supplied family is not a glyph-coverage claim.
    if(name===substitutedHanyang&&fontSupply(hanyangDisplayFace)?.status==='loaded'){
      substitutions[name]=hanyangDisplayFace;
      continue;
    }
    if(hftByDocument.get(source.doc)?.has(name)||fontSupply(name)?.status!=='unavailable')continue;
    const alternate=alternates?.get(name);
    if(alternate===null)continue;
    const target=alternate&&fontSupply(alternate)?.status==='loaded'?alternate:displayFont(name);
    if(target&&target!==name)substitutions[name]=target;
  }
  // Detached layout checks need the live document's display substitutions,
  // but an empty mapping leaves the sibling's default environment alone.
  // Reuse the verified face before a replacement document is first laid out.
  // Preparing a new document never requests permission again.
  if(source!==a&&!Object.keys(substitutions).length)return false;
  // A changed font generation invalidates derived Core measurements/page trees,
  // not document fonts/saved lines. Never call reflowLinesegs for supply changes.
  const localOpen=localOpenDocs.has(a.doc);
  const scopedGlyphMetrics=localOpen?scopedMetrics(a,authoredFonts(a)):[];
  const selected=new Set(scopedGlyphMetrics.map(f=>f.family));
  const scopedSubstitutions=Object.fromEntries(Object.entries(substitutions)
    .filter(([name])=>!selected.has(nominalFamily(name)??'')));
  const base={id:localOpen?'edit-fonts-local-open':'edit-fonts-'+revision,substitutions,
    registeredSymbolFallbackSourceSha256:symbolTrialActive.has(a.doc)?trialSymbolFont.sha256:undefined};
  const selectedEnv=JSON.stringify(scopedGlyphMetrics.length?{...base,substitutions:scopedSubstitutions,scopedGlyphMetrics}:base);
  let env=rejectedScopedEnvironment.get(a.doc)===selectedEnv?JSON.stringify(base):selectedEnv;
  if(localOpen&&appliedEnvironment.get(a.doc)===env)return false;
  let changed:boolean;
  try{changed=a.doc.setFontEnvironment(env);}
  catch(error){
    if(!scopedGlyphMetrics.length||!String(error).includes('scoped metrics cannot fit'))throw error;
    // Its transaction is atomic. Keep the old/font fallback rule when a
    // verified face cannot be fitted without changing the authored envelope.
    rejectedScopedEnvironment.set(a.doc,selectedEnv);
    env=JSON.stringify(base);
    changed=appliedEnvironment.get(a.doc)===env?false:a.doc.setFontEnvironment(env);
  }
  appliedSubstitutions.set(a.doc,new Set(Object.keys(
    env===selectedEnv && scopedGlyphMetrics.length ? scopedSubstitutions : substitutions)));
  if(changed)a.invalidateUpdateReads();
  if(localOpen)appliedEnvironment.set(a.doc,env);
  return changed;
}
// A standalone print image cannot share FontFace objects with the editor. Web
// aliases can, however, name the same verified bytes at every supplied weight.
// Use one such family in this image only, avoiding another full embedded font
// for its aliases. Local faces and incomplete/different weight sets stay distinct.
function printWebAliases(svg:string,loaded:typeof faces):{svg:string;eliminated:Set<string>}{
  const unchanged={svg,eliminated:new Set<string>()};
  const families=new Map<string,typeof faces>();
  for(const f of loaded){const group=families.get(f.family)??[];group.push(f);families.set(f.family,group);}
  const canonical:typeof faces[]=[];const aliases=new Map<string,string>();
  for(const group of families.values()){
    if(group.some(f=>typeof f.src==='string'))continue;
    const same=canonical.find(other=>other.length===group.length&&group.every(f=>other.some(g=>
      g.weight===f.weight&&typeof f.src!=='string'&&typeof g.src!=='string'&&
      f.src.bytes===g.src.bytes&&f.src.format===g.src.format)));
    if(same)aliases.set(group[0].family,same[0].family);else canonical.push(group);
  }
  // Embedded/user CSS has its own font resolution contract. Do not rewrite it,
  // unusual entities/declarations, or CSS shorthand from an unproven source.
  if(!aliases.size||/<style\b|<!|\bfont(?:-family)?\s*:/i.test(svg))return unchanged;
  const values=new Map<string,string>();let complete=true;
  const rewritten=svg.replace(/<(?:"[^"]*"|'[^']*'|[^'">])*?>/g,tag=>tag.replace(
    /\s+([^\s=/'"<>]+)\s*=\s*("[^"]*"|'[^']*')/g,(all,name,quoted)=>{
      if(name!=='font-family')return all;
      if(!values.has(quoted)){
        const doc=new DOMParser().parseFromString(`<svg font-family=${quoted}/>`,"image/svg+xml");
        const value=doc.documentElement.getAttribute('font-family');
        let next=quoted;
        if(value!==null&&!doc.getElementsByTagName('parsererror').length){
          const parts=value.split(',');let valid=true,changed=false;
          const mapped=parts.map(part=>{
            const trimmed=part.trim(),match=/^(['"])(.*)\1$/.exec(trimmed),family=match?match[2]:trimmed;
            if(!safe(family)){valid=false;complete=false;return part;}
            const target=aliases.get(family);if(!target)return part;
            changed=true;return `'${target}'`;
          });
          if(valid&&changed)next='"'+mapped.join(',').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')+'"';
        }else complete=false;
        values.set(quoted,next);
      }
      return all.slice(0,all.length-quoted.length)+values.get(quoted);
    }));
  // Exact family tokens were rewritten above. A remaining substring such as
  // "HCR Batang Ext" is a different font, not a use of the "HCR Batang" alias.
  return complete?{svg:rewritten,eliminated:new Set(aliases.keys())}:unchanged;
}
export function fontSvgForPrint(svg:string):string{
  const loaded=faces.filter(f=>f.face.status==='loaded').map(f=>({...f,family:f.face.family}));
  const print=printWebAliases(svg,loaded);svg=print.svg;
  const rules=loaded.filter(f=>!print.eliminated.has(f.family)&&svg.includes(f.family)).map(f=>`@font-face{font-family:${css(f.family)};font-weight:${f.weight};font-style:normal;src:${printSource(f.src)};}`).join('');
  // Inert SVG image contexts do not inherit document FontFace registrations.
  // Embed supplied bytes, not remote URLs. local aliases stay local, no extraction.
  return svg.replace(/(<svg\b[^>]*>)/,(_,tag)=>tag+'<style>'+rules.replaceAll('&','&amp;').replaceAll('<','&lt;')+'</style>');
}

// One print document has one FontFaceSet. Supply the same verified sources and
// alias/weight policy once, before page-local embedded-font CSS. Parent faces
// are not implicitly inherited; local faces remain local (no extraction).
export function sharedPrintFonts(pages:readonly string[]):{pages:string[];faces:FontFace[];readonly css:string}{
  const loaded=faces.filter(f=>f.face.status==='loaded').map(f=>({...f,family:f.face.family}));
  const prints=pages.map(svg=>printWebAliases(svg,loaded));
  const used=loaded.filter(f=>prints.some(p=>!p.eliminated.has(f.family)&&p.svg.includes(f.family)));
  return {
    pages:prints.map(p=>p.svg),
    // These are provider-created, already loaded faces, never CSS-connected
    // document faces. Explicitly register them in each output FontFaceSet;
    // there is no automatic inheritance and no new byte decoding/fetch.
    faces:used.map(f=>f.face),
    // Preserve CSS ordering for pages with embedded face declarations. Keep
    // encoding lazy so ordinary output does not reconstruct the loaded fonts.
    get css(){return used.map(f=>`@font-face{font-family:${css(f.family)};font-weight:${f.weight};font-style:normal;src:${printSource(f.src)};}`).join('');},
  };
}

/** Called on explicit font-list/dialog entry only; never a per-key inventory. */
export function documentFontNames(a:RhwpAdapter):string[]{
  // Page layout may name a PAINT fallback. Resolve each used source shape via
  // its current authenticated owner, just as local-font source binding does.
  // A shape's seven requested families are independent of that fallback.
  return a.withUpdateReads(()=>{
    const names=new Set<string>(),seen=new Set<number>();
    for(let page=0;page<a.pageCount;page++)for(const run of a.runs(page)){
      if(!run.text)continue;
      const shape=(run as typeof run&{charShapeId?:number}).charShapeId;
      if(shape!==undefined&&seen.has(shape))continue;
      const raw=a.charProps(a.position(run,run.charStart)),id=Number(raw.charShapeId);
      if(!Number.isSafeInteger(id)||shape!==undefined&&shape!==id||!Array.isArray(raw.fontFamilies))continue;
      seen.add(id);
      for(const family of raw.fontFamilies)if(typeof family==='string'&&safe(family))names.add(family);
    }
    return [...names];
  });
}
export function requestedFontDescriptions(a:RhwpAdapter){return [...(originalNames.get(a.doc)??[])].map(fontDisplayDescription);}
// Status notifications report actual failures; loaded-face/capability details
// remain in the existing font controls, rather than a permanent bottom notice.
export function requestedFontFailures(a:RhwpAdapter){return [...(originalNames.get(a.doc)??[])].filter(name=>fontSupply(name)?.status==='unavailable'&&!usesHanyangFallback(name)).map(fontDisplayDescription);}
