// Local Font Access is opt-in. Cached names are suggestions, never proof of a
// loaded face. Bytes remain in this tab and never enter document/font storage.
import {readLocalFontNames} from './local-font-names.js';
import {offeredFontFamily} from './font-offerings.js';
export type LocalFace = {family:string;fullName:string;postscriptName:string;style:string;blob?:()=>Promise<Blob>};
type Snapshot={version:1;detectedAt:string;names:string[]};
const key='rhwp-edit-local-fonts-v1',names=new Set<string>(),faces:LocalFace[]=[];
let snapshot:Snapshot|undefined,message='',job:Promise<void>|undefined;
const bytes=new Map<LocalFace,Promise<Uint8Array<ArrayBuffer>>>();
let aliases=new WeakMap<LocalFace,readonly string[]>();
export const validFontName=(n:unknown):n is string=>typeof n==='string'&&!!n.trim()&&n.length<=200&&!/[\x00-\x1f\x7f,'"\\;{}]/.test(n);
const normalize=(n:string)=>n.normalize('NFC').trim();
const changed=()=>document.dispatchEvent(new CustomEvent('rhwp:local-fonts-updated'));
function save(){try{if(snapshot)localStorage.setItem(key,JSON.stringify(snapshot));else localStorage.removeItem(key);}catch{message+=' 감지 결과를 저장하지 못했지만 이 탭에서는 사용할 수 있습니다.';}}
try{const value=JSON.parse(localStorage.getItem(key)??'null');if(value?.version===1&&typeof value.detectedAt==='string'&&Array.isArray(value.names)&&value.names.length<=10000&&value.names.every(validFontName)){snapshot=value;for(const n of value.names)names.add(normalize(n));}}catch{/* Storage is optional. */}
export function localFontNames(){return [...names].filter(offeredFontFamily).sort((a,b)=>a.localeCompare(b,'ko'));}
export function localFontState(){return{busy:!!job,supported:typeof query()==='function',count:localFontNames().length,detectedAt:snapshot?.detectedAt,message:message||(snapshot?'이전 감지 목록입니다. 실제 사용 시 설치 글꼴을 다시 확인합니다.':'저장된 감지 결과가 없습니다.')};}
function query(){return(globalThis as typeof globalThis&{queryLocalFonts?:(options?:{postscriptNames:string[]})=>Promise<LocalFace[]>}).queryLocalFonts;}
export function localFaceFor(family:string,weight:string,italic=false){
  const norm=normalize(family).toLocaleLowerCase('en-US');
  const candidates=faces.filter(f=>[f.family,f.fullName,f.postscriptName,...aliases.get(f)??[]].some(n=>normalize(n).toLocaleLowerCase('en-US')===norm));
  return candidates.find(f=>/bold|굵게|demi|semi/i.test(f.style)===(weight==='700')&&/italic|oblique|기울임/i.test(f.style)===italic);
}
/** The browser's FontData blob must identify the very face being registered. */
export function localFaceBytes(face:LocalFace){
  let pending=bytes.get(face);if(!pending){pending=(async()=>{
    if(!face.blob)throw Error('설치 글꼴 바이트를 읽을 수 없습니다.');
    const blob=await face.blob();if(blob.size<12||blob.size>32*1024*1024)throw Error('설치 글꼴 파일 크기를 확인할 수 없습니다.');
    const data=new Uint8Array(await blob.arrayBuffer()),view=new DataView(data.buffer),tag=(at:number)=>String.fromCharCode(...data.subarray(at,at+4));
    // A collection needs an independently identified face index. Do not guess 0.
    if(tag(0)==='ttcf')throw Error('글꼴 모음의 정확한 face 주소를 확인하지 못했습니다.');
    if(view.getUint32(0)!==0x00010000&&tag(0)!=='OTTO'&&tag(0)!=='true')throw Error('지원되는 SFNT 글꼴이 아닙니다.');
    const count=view.getUint16(4);if(12+count*16>data.length)throw Error('불완전한 글꼴 디렉터리입니다.');
    const found=new Set<string>();
    for(let i=0;i<count;i++){const at=12+i*16,offset=view.getUint32(at+8),length=view.getUint32(at+12);if(offset+length>data.length)throw Error('불완전한 글꼴 테이블입니다.');if(tag(at)!=='name')continue;
      if(length<6)throw Error('글꼴 이름 테이블이 불완전합니다.');const n=view.getUint16(offset+2),start=offset+view.getUint16(offset+4);if(offset+6+n*12>offset+length)throw Error('글꼴 이름 레코드가 불완전합니다.');
      for(let j=0;j<n;j++){const r=offset+6+j*12,platform=view.getUint16(r),id=view.getUint16(r+6),len=view.getUint16(r+8),from=start+view.getUint16(r+10);if(![1,4,6,16].includes(id)||from+len>offset+length)continue;let value='';
        if(platform===0||platform===3){if(len%2)continue;for(let k=0;k<len;k+=2)value+=String.fromCharCode(view.getUint16(from+k));}
        else if(platform===1&&data.subarray(from,from+len).every(b=>b<128))value=String.fromCharCode(...data.subarray(from,from+len));
        if(validFontName(value))found.add(normalize(value).toLocaleLowerCase('en-US'));
      }
    }
    if(!found.has(normalize(face.postscriptName).toLocaleLowerCase('en-US')))throw Error('설치 이름과 실제 글꼴 파일이 일치하지 않습니다.');
    return data;
  })().catch(error=>{bytes.delete(face);throw error;});bytes.set(face,pending);}return pending;
}
/** Must be called directly from the explicit button, before any await. */
export function redetectLocalFonts(candidates:readonly string[]=[]){
  if(job)return job;
  const fn=query();let request:Promise<LocalFace[]>;
  try{request=fn?fn.call(globalThis):Promise.resolve([]);}catch(error){request=Promise.reject(error);}
  job=(async()=>{try{
    const next=await request;const accepted=next.filter(f=>[f.family,f.fullName,f.postscriptName,f.style].every(n=>typeof n==='string')&&validFontName(f.family)&&validFontName(f.fullName)&&validFontName(f.postscriptName));
    const detected=new Set<string>();
    const nextAliases=new WeakMap<LocalFace,readonly string[]>();
    if(fn){
      let index=0;
      const read=async()=>{while(index<accepted.length){const face=accepted[index++],localized=await readLocalFontNames(face,validFontName);nextAliases.set(face,localized);}};
      await Promise.all(Array.from({length:Math.min(4,accepted.length)},read));
      for(const face of accepted){detected.add(normalize(face.family));detected.add(normalize(face.fullName));for(const name of nextAliases.get(face)??[])detected.add(name);}
    }
    // Enumeration can omit a requested localized name. Reuse the existing
    // exact local() probe for missing document/request candidates in either
    // browser path. This adds a name only, never fabricated FontData/bytes.
    const listed=new Set([...detected].map(n=>n.toLocaleLowerCase('en-US')));let probed=0;
    for(const name of new Set(candidates.filter(validFontName).map(normalize))){
      if(listed.has(name.toLocaleLowerCase('en-US')))continue;
      try{await new FontFace('rhwp-local-name-probe',`local(${JSON.stringify(name)})`).load();detected.add(name);listed.add(name.toLocaleLowerCase('en-US'));probed++;}
      catch{/* No claim that the OS lacks it. */}
    }
    faces.splice(0,faces.length,...accepted);aliases=nextAliases;bytes.clear();names.clear();for(const n of detected)names.add(n);
    snapshot={version:1,detectedAt:new Date().toISOString(),names:localFontNames()};message=fn?`${localFontNames().length}개 설치 글꼴 이름을 감지했습니다. 선택한 글꼴만 실제로 불러옵니다.${probed?` 추가 요청 이름 ${probed}개는 local() 확인만 완료했으며 Core 바이트 등록은 미확인입니다.`:''}`:`전체 목록을 열거할 수 없어 요청한 이름 ${localFontNames().length}개만 설치 확인했습니다. Core 바이트 등록은 미확인입니다.`;save();
  }catch(error){message=(error instanceof Error&&['NotAllowedError','SecurityError'].includes(error.name)?'글꼴 접근이 허용되지 않았습니다. 브라우저 권한을 확인한 뒤 다시 감지하세요.':'로컬 글꼴을 감지하지 못했습니다. 다시 시도할 수 있습니다.')+' 기존 목록과 문서는 유지했습니다.';}
  finally{job=undefined;changed();}})();changed();return job;
}
export function clearLocalFontNames(){if(job)return;names.clear();snapshot=undefined;message='감지 목록을 초기화했습니다. 현재 문서와 이미 사용 중인 글꼴은 유지합니다.';save();changed();}
