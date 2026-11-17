import {fontFamilyValues} from './font-family-values.js';
// Font supply is session rendering state. Only an explicit formatting Command
// changes document font references; availability and substitution never do.
import type { RhwpAdapter } from './adapter.js';
import { verifiedAssetBytes } from './verified-asset-cache.js';
import {localFontNames,localFaceFor,localFaceBytes,type LocalFace} from './local-font-access.js';
import {readLocalGlyphWidths} from './local-font-widths.js';
import {bundledWebFonts} from './bundled-web-fonts.js';
export type FontSupply = { family:string; status:'loading'|'loaded'|'unavailable'|'unknown'; source:'web'|'local'|'document'; label:string; weights:string[] };
const bundledHCR = [
  {file:'HANBatang.woff',SHA256:'b3192018e3bd4da76b29b0530f71c79fb6f465a2b7cd41308bc38f9a4ae09a6c'},
  {file:'HCRDotum.woff',SHA256:'49bf312aec309ba88c3eb612c591c2d8e28b765c156c808691850137431bb1bf'},
];
const fontBytes=new Map<string,Promise<Uint8Array<ArrayBuffer>>>();
const failedFontFiles=new Set<string>();
// All Korean/English registrations share a single verified response per asset.
function verifiedFont(file:string,digest:string){
  let job=fontBytes.get(file);
  if(!job){job=verifiedAssetBytes(new URL('../public/fonts/'+file,import.meta.url),digest,'font',AbortSignal.timeout(10000))
    .catch(error=>{failedFontFiles.add(file);throw error;});fontBytes.set(file,job);}
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
export const configuredFontFamilies:readonly string[]=[...startupFamilies,...catalog.flatMap(f=>[f.family,...f.aliases])];
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
function symbolTrialMisses(a:RhwpAdapter){
  const doc=a.doc;
  // No installed-face bytes means no verified miss. Do not fetch the asset.
  if(!localSources.size)return;
  const missed=new Map<number,{bytes:Uint8Array<ArrayBuffer>;cps:Set<number>}>();
  const metrics=new Map<Uint8Array<ArrayBuffer>,ReturnType<typeof readLocalGlyphWidths>>();
  for(let page=0;page<doc.pageCount();page++){
    const raw=JSON.parse(doc.getFontDecisionTrace(page,'{"maxCharacters":4096}'));
    if(raw.status!=='complete')return;
    const runs=a.runs(page);
    for(const r of raw.records){
      const x=r.source,f=r.document,cp=Number(x?.codePoint),id=Number(x?.charShapeId);
      if(!trialSymbol(cp)||x?.status!=='complete'||!Number.isSafeInteger(id)||f?.embedded!==false
        ||f.languageSlot!==5||typeof f.face!=='string'||x.charOffset==null)continue;
      const run=runs.find(t=>(t as typeof t & {charShapeId?:number}).charShapeId===id&&
        x.charOffset>=t.charStart&&t.text&&[...t.text][x.charOffset-t.charStart]?.codePointAt(0)===cp);
      if(!run)continue;
      const props=a.charProps(a.position(run,x.charOffset));
      if(props.bold===true||props.italic===true||Number(props.charShapeId)!==id)continue;
      const bytes=localSources.get(f.face)?.find(e=>e.weight==='400')?.bytes;
      if(!bytes)continue;
      let widths=metrics.get(bytes);
      if(!widths){widths=readLocalGlyphWidths(bytes);metrics.set(bytes,widths);}
      if(covered(widths,cp))continue;
      const m=missed.get(id);
      if(m&&m.bytes!==bytes)return;
      if(m)m.cps.add(cp);else missed.set(id,{bytes,cps:new Set([cp])});
      if(missed.size>64)return;
    }
  }
  return missed;
}
async function loadSymbolTrialAsset(a:RhwpAdapter, verifiedMiss?:boolean){
  if(readySymbolTrialAsset||!(verifiedMiss??!!symbolTrialMisses(a)?.size))return;
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
function authoredFonts(a:RhwpAdapter){
  if(sourceRevisions.get(a.doc)!==a.revision){
    const info=JSON.parse(a.doc.getDocumentInfo());
    originalNames.set(a.doc,new Set<string>((info.fontsUsed??[])
      .filter((n:unknown):n is string=>typeof n==='string'&&safe(n))));
    sourceRevisions.set(a.doc,a.revision);
  }
  return originalNames.get(a.doc)!;
}
export async function loadOpenFonts(a:RhwpAdapter){
  // Reuse the installed faces already available to this tab. No permission
  // prompt on file open; out-of-scope families keep their existing resolver.
  const names=[...authoredFonts(a)].filter(n=>nominalFamily(n));
  await Promise.all(names.map(async name=>{
    await ensureFont(name);
    const face=localFaceFor(name,'400');
    if(face&&!localSources.has(name)&&attemptedLocal.get(name)!==face){
      attemptedLocal.set(name,face);pending.delete(name);await ensureFont(name);
    }
    if(fontSupply(name)?.status==='unavailable')await ensureFont(fallbackFamily(name));
  }));
  await document.fonts.ready;
  try{await loadSymbolTrialAsset(a);}catch{/* Unknown coverage or asset integrity failure: keep existing display. */}
}
export function prepareLocalOpenDisplay(a:RhwpAdapter){
  const doc=a.doc;
  localOpenDocs.add(doc);
  const asset=readySymbolTrialAsset;
  if(!asset||initializedSymbolTrial.has(doc))return applyFontEnvironment(a);
  try{
    // FileLifecycle discards the validation document. Bind only fresh,
    // re-read source slots in the actual replacement before its first SVG.
    const misses=symbolTrialMisses(a);
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
// the first-open probe on the adopted document, not on the discarded parser
// probe. Until the pinned asset settles, keep the current presentation; the
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
      void loadSymbolTrialAsset(a,true).then(()=>{
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
  const metrics=chars.size>4096?[]:[...families].flatMap(family=>[...exactNominal.get(family)!].flatMap(([weight,face])=>{
    const advances:Record<number,number>={};
    for(const cp of chars){const width=face.lookup(cp);if(width>0&&width!==65535)advances[cp]=width;}
    return Object.keys(advances).length?[{family,bold:weight==='700',italic:false,
      sourceSha256:unverifiedLocalMetricTag,unitsPerEm:face.unitsPerEm,advances}]:[];
  }));
  measuredOpenMetrics.set(a.doc,{revision:a.revision,generation:nominalGeneration,metrics});
  return metrics;
}
const localSources=new Map<string,{weight:string;bytes:Uint8Array<ArrayBuffer>}[]>();
const localCore=new WeakMap<object,Map<string,string>>(),boundLocalSlots=new WeakMap<object,Map<string,Uint8Array<ArrayBuffer>>>();
const rejectedLocalSlots=new WeakMap<object,Map<string,Uint8Array<ArrayBuffer>>>();
// verifiedFont shares the immutable byte object across aliases. Keep print-only
// encoding lazy and share its completed CSS source, without retaining extra bytes.
const printSources=new WeakMap<Uint8Array<ArrayBuffer>,Map<string,string>>();
const originalNames=new WeakMap<object,Set<string>>(),sourceRevisions=new WeakMap<object,number>();
const cssFallbacks=new Map<string,string[]>();
let revision=0, started=false;
const familyKey=(family:string)=>family.trim().replace(/^(['"])(.*)\1$/,'$2').normalize('NFC').toLowerCase();
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
  records.set(family,{family,status,source,weights,label:status==='loaded'?`${source==='web'?'기본 웹폰트':source==='document'?'문서 등록 글꼴':'설치 글꼴 확인'} · ${weights.join('/')} ${hasBold?'':'· 굵게는 합성 가능'} · 모든 문자 보장 아님${detail?' · '+detail:''}`:status==='loading'?'글꼴 로딩 중':status==='unavailable'?(source==='web'?'기본 글꼴 로딩 실패 · '+detail+' · 다시 불러오기 가능 · 시스템 대체':'브라우저에서 설치 이름 확인 불가 · 대체 표시'):'글꼴 확인 미완료'});changed();
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
export function ensureFont(family:string):Promise<void>{
  if(!safe(family)||pending.has(family))return pending.get(family)??Promise.resolve();
  // Reserve before dispatch: open font fields synchronously refresh on status.
  fontSupplyInFlight++;
  const job=Promise.resolve().then(async()=>{
    const existing=loadedFaces(family);
    if(existing.length&&(!localFaceFor(family,'400')||localSources.has(family))){record(family,'loaded','document',existing.map(f=>f.weight));return;}
    const web=catalog.find(f=>[f.family,...f.aliases].some(n=>familyKey(n)===familyKey(family)));record(family,'loading',web?'web':'local');
    const weights:string[]=[];let source:FontSupply['source']=web?'web':'local',detail='',stage='설치 이름 확인';
    try{
      if(web){
        for(const{file,SHA256,weight}of web.files){
          stage='다운로드';const bytes=await verifiedFont(file,SHA256);stage='브라우저 글꼴 디코딩';
          const face=await new FontFace(family,bytes,{weight,style:'normal',display:'swap'}).load();
          document.fonts.add(face);faces.push({family,weight,face,src:{bytes,format:'woff2'}});weights.push(weight);
        }
      }else{
        const alias=aliases.findIndex(a=>a.some(n=>n.toLowerCase()===family.toLowerCase()));
        const group=aliases[alias]??[family],bundled=bundledHCR[alias];
        for(const weight of ['400','700']){
          const local=localFaceFor(family,weight);
          if(local){
            stage='설치 글꼴 파일 확인';const bytes=await localFaceBytes(local);stage='브라우저 글꼴 디코딩';
            const face=await new FontFace(family,bytes,{weight,style:'normal'}).load();document.fonts.add(face);
            const format=String.fromCharCode(...bytes.subarray(0,4))==='OTTO'?'opentype':'truetype';
            faces.push({family,weight,face,src:{bytes,format}});weights.push(weight);
            rememberNominal(family,weight,bytes);
            const list=localSources.get(family)??[];list.push({weight,bytes});localSources.set(family,list);if(weight==='400')localSourceGeneration++;detail='설치 파일 이름·디코딩 확인 · Core는 정확 언어 슬롯별 별도 등록';continue;
          }
          // Resolve real local names, never masquerade a different font as HCR.
          const names=weight==='700'?group.flatMap(n=>[n+' Bold',n.replaceAll(' ','')+'-Bold',n+' 굵게']):group;
          const src=names.map(n=>`local(${css(n)})`).join(',');
          try{const face=await new FontFace(family,src,{weight}).load();document.fonts.add(face);faces.push({family,weight,face,src});weights.push(weight);}catch(error){if(weight==='400'&&!bundled)throw error;}
        }
        if(bundled&&!weights.includes('400')){
          source='web';
          stage='다운로드';const bytes=await verifiedFont(bundled.file,bundled.SHA256),weight='400';stage='브라우저 글꼴 디코딩';
          const face=await new FontFace(family,bytes,{weight,style:'normal',display:'swap'}).load();
          document.fonts.add(face);faces.push({family,weight,face,src:{bytes,format:'woff'}});weights.unshift(weight);
          detail=weights.includes('700')?'함초롬 웹 Regular / 설치 Bold':'함초롬 웹 Regular · 별도 Bold 파일 없음';
        }
      }
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
  const failed=[...records.values()].filter(r=>r.status==='unavailable').map(r=>r.family);
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
      const r=records.get(family),upgrade=r&&r.source==='local'&&localFaceFor(family,'400')&&!localSources.has(family);
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
  const supplied=(cssFallbacks.get(family)??[]).find(n=>fontSupply(n)?.status==='loaded');
  if(supplied)return supplied;
  const fallback=fallbackFamily(family);
  return fontSupply(fallback)?.status==='loaded'?fallback:undefined;
}
export function fontDisplayDescription(family:string){
  const r=fontSupply(family),display=displayFont(family);
  return r?.status==='loaded'?`${family} — ${r.label}`:r?.status==='unavailable'?`원본 ${family} → 대체 후보 ${display??'시스템 글꼴(실제 face 미확인)'} · ${r.label}; 원본 지정 유지`:`${family} — ${r?.status==='loading'?'로딩 중':'사용 가능 여부 미확인'} · 실제 대체 미판정; 원본 지정 유지`;
}
/** User-facing only for an actionable failure. Details remain in diagnostics. */
export function fontActionFailure(family:string){return fontSupply(family)?.status==='unavailable'?'글꼴을 불러오지 못했습니다. 다른 글꼴을 선택하거나 다시 불러오세요.':'';}
export function requestPageFonts(a:RhwpAdapter,pages:HTMLElement){
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
  const requested=new Set<string>();
  const request=(name:string)=>{if(!requested.has(name)){requested.add(name);void ensureFont(name);}};
  const fallbackRequests=new Set<string>();
  for(const value of fontFamilyValues(pages)){
    if(!parsed.has(value)){
      const match=/^\s*(?:'([^']+)'|"([^"]+)"|([^,]+))/.exec(value);
      const n=(match?.[1]??match?.[2]??match?.[3]??'').trim();
      // The remaining CSS chain is fallback policy, not additional original IR names.
      parsed.set(value,safe(n)&&!['serif','sans-serif','monospace','system-ui'].includes(n)
        ?{name:n,fallbacks:value.split(',').slice(1).map(x=>x.trim().replace(/^(['"])(.*)\1$/,'$2'))}:null);
    }
    const chain=parsed.get(value);
    if(chain){
      cssFallbacks.set(chain.name,chain.fallbacks);
      request(chain.name);
      // Preserve every chain's last-wins fallback assignment, including A/B/A.
      // Request all eligible fallbacks seen anywhere, in their original order.
      for(const n of chain.fallbacks){
        if(fallbackRequests.has(n))continue;
        fallbackRequests.add(n);
        if(catalog.some(f=>f.family===n||(f.aliases as readonly string[]).includes(n))||aliases.some(group=>group.some(a=>a.toLowerCase()===n.toLowerCase())))request(n);
      }
    }
  }
  const scopedLocalOpen=localOpenDocs.has(a.doc);
  if([...localSources.keys()].some(family=>!scopedLocalOpen||!nominalFamily(family)))
    bindLocalFontSources(a,pages);
}
function bindLocalFontSources(a:RhwpAdapter,pages:HTMLElement){
  if(!localSources.size||a.transientEdit)return;
  let slots=boundLocalSlots.get(a.doc);if(!slots){slots=new Map();boundLocalSlots.set(a.doc,slots);}
  let rejected=rejectedLocalSlots.get(a.doc);if(!rejected){rejected=new Map();rejectedLocalSlots.set(a.doc,rejected);}
  let status=localCore.get(a.doc);if(!status){status=new Map();localCore.set(a.doc,status);}
  const doc=a.doc,revision=a.revision,seen=new Set<number>(),requests:{shape:number;language:number;family:string;bytes:Uint8Array<ArrayBuffer>}[]=[];let registered=false;
  for(const page of pages.querySelectorAll<HTMLElement>('[data-page]'))for(const run of a.runs(Number(page.dataset.page))){
    if(!run.text)continue;
    const runShape=(run as typeof run&{charShapeId?:number}).charShapeId;if(runShape!==undefined&&seen.has(runShape))continue;
    const raw=a.charProps(a.position(run,run.charStart)),shape=Number(raw.charShapeId);
    if(!Number.isSafeInteger(shape)||seen.has(shape)||!Array.isArray(raw.fontFamilies)||raw.fontFamilies.length!==7)continue;seen.add(shape);
    raw.fontFamilies.forEach((family:unknown,language:number)=>{
      if(typeof family!=='string'||raw.italic===true)return;
      if(localOpenDocs.has(a.doc)&&nominalFamily(family))return;
      const source=localSources.get(family)?.find(f=>f.weight===(raw.bold===true?'700':'400'));if(!source)return;
      const key=shape+':'+language;if(slots!.get(key)===source.bytes||rejected!.get(key)===source.bytes)return;
      requests.push({shape,language,family,bytes:source.bytes});
    });
  }
  // Exact-source registration can repaginate. Resolve all source slots from one
  // stable layout first; never continue reading old page indices after a bind.
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
  if(registered)changed();
}
export function applyFontEnvironment(a:RhwpAdapter, source = a):boolean{
  const substitutions:Record<string,string>={};
  for(const name of originalNames.get(source.doc)??[]){
    // Pending or verified local/document faces keep priority. Core independently
    // protects embedded sources; a supplied family is not a glyph-coverage claim.
    if(fontSupply(name)?.status!=='unavailable')continue;
    const target=displayFont(name);if(target&&target!==name)substitutions[name]=target;
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
  const loaded=faces.filter(f=>f.face.status==='loaded');
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
  const loaded=faces.filter(f=>f.face.status==='loaded');
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
export function requestedFontFailures(a:RhwpAdapter){return [...(originalNames.get(a.doc)??[])].filter(name=>fontSupply(name)?.status==='unavailable').map(fontDisplayDescription);}
