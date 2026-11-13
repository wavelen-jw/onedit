// Existing Core accepts seven documented formats; no arbitrary enum or lossy
// in-place clone: the getter does not expose each level's number format code.
export type NumberDefinition = { levelFormats: string[]; numberFormats: number[]; startNumber: number };
export const numberCodes = [[0,"1, 2, 3"],[8,"가, 나, 다"],[1,"①, ②, ③"],[5,"a, b, c"]] as const;
export function defaultNumberDefinition(): NumberDefinition {
  return {levelFormats:["^1.","^2)","^3)","^4)","^5)","^6)","^7)"],numberFormats:[0,8,0,8,1,0,5],startNumber:1};
}
export function validateNumberDefinition(raw: NumberDefinition) {
  if(!raw || Object.keys(raw).sort().join(',')!=='levelFormats,numberFormats,startNumber' ||
     !Number.isSafeInteger(raw.startNumber) || raw.startNumber<1 || raw.startNumber>65535 ||
     !Array.isArray(raw.levelFormats) || raw.levelFormats.length!==7 ||
     !Array.isArray(raw.numberFormats) || raw.numberFormats.length!==7)
    throw Error('사용자 번호는 7수준과 시작값 1~65535가 필요합니다.');
  raw.levelFormats.forEach((f,i)=>{
    // Core's existing parser splits on commas/brackets, not a full JSON array.
    // Accept a bounded literal plus existing ^1..^7 / ^n / ^N level placeholders only.
    if(typeof f!=='string'||f.length>32||(!f.includes(`^${i+1}`)&&!f.includes('^n')&&!f.includes('^N'))||
       /[\u0000-\u001f\u007f,\[\]"\\]/u.test(f)||f.replace(/\^(?:[1-7]|n|N)/g,'').includes('^'))
      throw Error(`${i+1}수준: ^${i+1} 또는 ^n/^N과 쉼표·괄호 배열·제어문자를 제외한 32자 이내 모양을 사용하세요.`);
    if(!numberCodes.some(([code])=>code===raw.numberFormats[i]))throw Error('지원하지 않는 번호 문자 종류입니다.');
  });
}
export const numberRestartHold='문단별 새 시작·이전 번호 이어가기는 설치 Core에서 재조회·저장 보존이 확인되지 않아 보류합니다. 기존 값은 유지됩니다.';
