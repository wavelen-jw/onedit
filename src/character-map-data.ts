export type CharacterEntry = { character: string; name: string; aliases: string; category: string };
export const characterCategories = ['공문서 기호', '화살표', '괄호', '숫자', '수학', '기타 기호'] as const;
const groups: [string, [string, string, string?][]][] = [
  ['공문서 기호', [
    ['※','참고표','참고 주의 참조 reference'], ['○','흰 원','동그라미 원형 circle'], ['●','검은 원','동그라미 원형 bullet'],
    ['□','흰 사각형','네모 상자 square'], ['■','검은 사각형','네모 상자 square'], ['△','흰 위쪽 삼각형','세모 triangle'],
    ['▲','검은 위쪽 삼각형','세모 triangle'], ['▽','흰 아래쪽 삼각형','역삼각형 triangle'], ['▼','검은 아래쪽 삼각형','역삼각형 triangle'],
    ['▷','흰 오른쪽 삼각형','우측 세모 triangle right'], ['▶','검은 오른쪽 삼각형','우측 세모 triangle right'],
    ['▴','검은 작은 위쪽 삼각형','작은 삼각형 작은 세모 상향 small triangle up'], ['▵','흰 작은 위쪽 삼각형','작은 삼각형 작은 세모 상향 small triangle up'],
    ['▸','검은 작은 오른쪽 삼각형','작은 삼각형 작은 세모 우측 small triangle right'], ['▹','흰 작은 오른쪽 삼각형','작은 삼각형 작은 세모 우측 small triangle right'],
    ['▾','검은 작은 아래쪽 삼각형','작은 삼각형 작은 세모 하향 small triangle down'], ['▿','흰 작은 아래쪽 삼각형','작은 삼각형 작은 세모 하향 small triangle down'],
    ['◂','검은 작은 왼쪽 삼각형','작은 삼각형 작은 세모 좌측 small triangle left'], ['◃','흰 작은 왼쪽 삼각형','작은 삼각형 작은 세모 좌측 small triangle left'],
    ['←','왼쪽 화살표','좌측 arrow left'], ['↑','위쪽 화살표','상향 arrow up'], ['→','오른쪽 화살표','우측 arrow right'], ['↓','아래쪽 화살표','하향 arrow down'], ['①','동그라미 숫자 1','원문자 일 1 circled one'], ['②','동그라미 숫자 2','원문자 이 2 circled two'],
    ['③','동그라미 숫자 3','원문자 삼 3 circled three'], ['④','동그라미 숫자 4','원문자 사 4 circled four'], ['⑤','동그라미 숫자 5','원문자 오 5 circled five'],
    ...Array.from('⑥⑦⑧⑨', (s,i):[string,string,string]=>[s,`동그라미 숫자 ${i+6}`,`원문자 circled number ${i+6}`]),
    ['·','가운뎃점','가운데점 중간점 middle dot'], ['•','글머리표','불릿 bullet'], ['★','검은 별','별표 star'], ['☆','흰 별','별표 star'],
    ['✓','확인 표시','체크 check'], ['✔','굵은 확인 표시','체크 check'], ['☑','확인된 상자','체크박스 check box'], ['☐','빈 상자','체크박스 box'],
    ['◇','흰 마름모','다이아 diamond'], ['◆','검은 마름모','다이아 diamond'], ['◎','이중 원','동그라미 double circle'], ['◉','채워진 이중 원','동그라미 circle'],
  ]],
  ['화살표', [
    ['↔','양방향 화살표','좌우 arrow left right'], ['↕','위아래 화살표','상하 arrow up down'], ['↖','왼쪽 위 화살표','arrow north west'],
    ['↗','오른쪽 위 화살표','arrow north east'], ['↘','오른쪽 아래 화살표','arrow south east'], ['↙','왼쪽 아래 화살표','arrow south west'],
    ['⇒','오른쪽 이중 화살표','arrow double right'], ['⇐','왼쪽 이중 화살표','arrow double left'], ['⇔','양방향 이중 화살표','arrow double'],
    ['⇧','위쪽 흰 화살표','arrow up'], ['➜','굵은 오른쪽 화살표','arrow right'],
  ]],
  ['괄호', [
    ['(','여는 소괄호','왼쪽 괄호 parenthesis'], [')','닫는 소괄호','오른쪽 괄호 parenthesis'],
    ['[','여는 대괄호','왼쪽 괄호 bracket'], [']','닫는 대괄호','오른쪽 괄호 bracket'], ['{','여는 중괄호','왼쪽 괄호 brace'], ['}','닫는 중괄호','오른쪽 괄호 brace'],
    ['〈','여는 홑화살괄호','왼쪽 꺾쇠 괄호 bracket'], ['〉','닫는 홑화살괄호','오른쪽 꺾쇠 괄호 bracket'],
    ['《','여는 겹화살괄호','왼쪽 꺾쇠 괄호 bracket'], ['》','닫는 겹화살괄호','오른쪽 꺾쇠 괄호 bracket'],
    ['「','여는 홑낫표','왼쪽 괄호 quote'], ['」','닫는 홑낫표','오른쪽 괄호 quote'], ['『','여는 겹낫표','왼쪽 괄호 quote'], ['』','닫는 겹낫표','오른쪽 괄호 quote'],
    ['【','여는 검은 괄호','왼쪽 bracket'], ['】','닫는 검은 괄호','오른쪽 bracket'],
  ]],
  ['숫자', [
    ...Array.from('⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳', (s,i):[string,string,string]=>[s,`동그라미 숫자 ${i+10}`,`원문자 circled number ${i+10}`]),
    ...Array.from('ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ', (s,i):[string,string,string]=>[s,`로마 숫자 ${i+1}`,`roman number ${i+1}`]),
    ...Array.from('₀₁₂₃₄₅₆₇₈₉', (s,i):[string,string,string]=>[s,`아래첨자 숫자 ${i}`,`subscript number ${i}`]),
    ['¼','4분의 1','분수 fraction quarter'], ['½','2분의 1','분수 fraction half'], ['¾','4분의 3','분수 fraction'],
  ]],
  ['수학', [
    ['±','플러스 마이너스','더하기 빼기 plus minus'], ['×','곱하기','곱셈 multiplication'], ['÷','나누기','나눗셈 division'],
    ['−','빼기','마이너스 minus'], ['≠','같지 않음','부등호 not equal'], ['≤','작거나 같음','부등호 less equal'], ['≥','크거나 같음','부등호 greater equal'],
    ['≈','거의 같음','근사 approximately'], ['∞','무한대','infinity'], ['√','제곱근','루트 square root'], ['∑','합 기호','시그마 sigma sum'],
    ['∫','적분','integral'], ['∴','그러므로','therefore'], ['∵','왜냐하면','because'], ['∠','각','angle'], ['°','도 기호','각도 degree'],
    ['π','파이','원주율 pi'], ['‰','천분율','퍼밀 per mille'], ['‱','만분율','basis point'], ['∅','공집합','empty set'],
  ]],
  ['기타 기호', [
    ['§','절 기호','섹션 section'], ['¶','문단 기호','단락 paragraph'], ['…','줄임표','말줄임표 ellipsis'], ['—','긴 줄표','em dash'], ['–','짧은 줄표','en dash'],
    ['“','여는 큰따옴표','quote'], ['”','닫는 큰따옴표','quote'], ['‘','여는 작은따옴표','quote'], ['’','닫는 작은따옴표','quote'],
    ['©','저작권 기호','copyright'], ['®','등록 상표','registered'], ['™','상표','trademark'], ['₩','원 기호','화폐 won'], ['€','유로 기호','화폐 euro'],
  ]],
];
export const characterCatalog: CharacterEntry[] = groups.flatMap(([category, rows])=>rows.map(([character,name,aliases=''])=>({character,name,aliases,category})));
// Existing Unicode safety boundary: no controls, format/bidi characters, lone
// surrogates, private-use or unassigned scalars; no paragraph separators.
export function allowedCharacter(s:string) {
  return Array.from(s).length===1 && !/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\u2028\u2029]/u.test(s);
}
export function unicodeCharacter(value:number):string|undefined {
  if(!Number.isInteger(value)||value<0||value>0x10ffff)return;
  const s=String.fromCodePoint(value);return allowedCharacter(s)?s:undefined;
}
export const characterCode=(s:string)=>'U+'+s.codePointAt(0)!.toString(16).toUpperCase().padStart(4,'0');
export function describeCharacter(s:string):CharacterEntry {
  return characterCatalog.find(e=>e.character===s)??{character:s,name:s===' '?'공백':'Unicode 문자',aliases:'',category:'Unicode 영역'};
}
export function searchCharacters(query:string):CharacterEntry[] {
  const q=query.trim().normalize('NFC').toLocaleLowerCase();
  if(!q)return [];
  const code=/^(?:u\+|0x)([0-9a-f]{1,6})$/i.exec(q)??/^([0-9a-f]{4,6})$/i.exec(q);
  if(code){const s=unicodeCharacter(parseInt(code[1],16));return s?[describeCharacter(s)]:[];}
  const results=characterCatalog.filter(e=>[e.character,e.name,e.aliases,e.category,characterCode(e.character)].join(' ').toLocaleLowerCase().includes(q));
  const literal=allowedCharacter(query.trim())?query.trim():undefined;
  if(literal&&!results.some(e=>e.character===literal))results.unshift(describeCharacter(literal));
  return results;
}
