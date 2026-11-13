import type { RhwpAdapter } from './adapter.js';
import { copy, type Selection } from './model.js';
export type HeaderFooterTarget = {section:number; isHeader:boolean; applyTo:number};
export type HeaderFooterView = {target:HeaderFooterTarget; exists:boolean; owner?:{para:number;control:number}; paragraphs:{text:string;charCount:number}[]};
export type HeaderFooterChange = {action:'create'|'append'; target:HeaderFooterTarget; expected:HeaderFooterView; text:string};
export const headerFooterPages = [[0,'양 쪽'],[1,'짝수 쪽'],[2,'홀수 쪽']] as const;
export const headerFooterCreationHold = '새 머리말·꼬리말은 저장 시 다른 문단 정보 보존 검사가 실패해 생성을 보류합니다. 기존 정의의 조회·평문 추가는 지원합니다.';
export const headerFooterLimit = '기존 정의 조회·마지막 문단에 평문 덧붙이기를 지원합니다. 새 정의 생성은 저장 보존 검사 실패로 보류합니다. 전체/부분 치환·삭제·서식·내부 개체·캔버스 직접 편집은 보존 검증 전 미지원입니다.';
const key=(t:HeaderFooterTarget)=>`${t.section}:${t.isHeader}:${t.applyTo}`;
function valid(a:RhwpAdapter,t:HeaderFooterTarget){
  if(!t||!Number.isSafeInteger(t.section)||t.section<0||t.section>=a.doc.getSectionCount()||typeof t.isHeader!=='boolean'||![0,1,2].includes(t.applyTo))throw Error('머리말·꼬리말 소유 구역/적용 쪽이 올바르지 않습니다.');
}
export function headerFooterView(a:RhwpAdapter,target:HeaderFooterTarget):HeaderFooterView {
  valid(a,target);const raw=a.call('getHeaderFooter',target.section,target.isHeader,target.applyTo);
  if(typeof raw.exists!=='boolean')throw Error('머리말·꼬리말 조회 응답을 확인할 수 없습니다.');
  if(!raw.exists)return{target:{...target},exists:false,paragraphs:[]};
  if(raw.kind!==(target.isHeader?'header':'footer')||raw.applyTo!==target.applyTo)throw Error('조회된 머리말·꼬리말 종류/적용 쪽이 요청과 일치하지 않습니다.');
  if(!Number.isSafeInteger(raw.paraIndex)||raw.paraIndex<0||raw.paraIndex>=a.doc.getParagraphCount(target.section)||!Number.isSafeInteger(raw.controlIndex)||raw.controlIndex<0||!Number.isSafeInteger(raw.paraCount)||raw.paraCount<1||raw.paraCount>256)throw Error('머리말·꼬리말 소유 문단/컨트롤을 확인할 수 없습니다.');
  const paragraphs=Array.from({length:raw.paraCount},(_,index)=>{
    const p=a.call('getHeaderFooterParaInfo',target.section,target.isHeader,target.applyTo,index);
    if(p.paraCount!==raw.paraCount||typeof p.text!=='string'||!Number.isSafeInteger(p.charCount)||p.charCount<0)throw Error('머리말·꼬리말 문단 조회가 일치하지 않습니다.');
    return{text:p.text,charCount:p.charCount};
  });
  return{target:{...target},exists:true,owner:{para:raw.paraIndex,control:raw.controlIndex},paragraphs};
}
export function headerFooterCatalog(a:RhwpAdapter):HeaderFooterView[]{
  const raw=a.call('getHeaderFooterList',0,true,0),seen=new Set<string>();
  if(!Array.isArray(raw.items))throw Error('머리말·꼬리말 목록을 확인할 수 없습니다.');
  return raw.items.map((row:any)=>{
    const t={section:row.sectionIdx,isHeader:row.isHeader,applyTo:row.applyTo};valid(a,t);
    if(seen.has(key(t)))throw Error('같은 구역·적용 쪽의 중복 정의는 편집하지 않습니다.');seen.add(key(t));
    const v=headerFooterView(a,t);if(!v.exists)throw Error('머리말·꼬리말 목록의 대상이 없습니다.');return v;
  });
}
export function headerFooterEditReason(a:RhwpAdapter,s:Selection,v:HeaderFooterView){
  try{
    if(s.kind!=='caret'||s.focus.kind!=='body')throw Error('본문에 커서를 놓은 뒤 사용하세요. 셀·복수 범위에서는 조회만 지원합니다.');
    a.assertEditable(s.focus);valid(a,v.target);
    if(v.owner)a.assertEditable({kind:'body',sec:v.target.section,para:v.owner.para,offset:0});
    const globalPara=v.owner&&Array.from({length:v.target.section},(_,sec)=>a.doc.getParagraphCount(sec)).reduce((x,y)=>x+y,0)+v.owner.para;
    const c=v.owner&&a.call<any[]>('getControls').find(c=>c.list===0&&c.para===globalPara&&c.controlIndex===v.owner!.control);
    if(v.exists&&(!c||c.ctrlId!==(v.target.isHeader?'head':'foot')))throw Error('머리말·꼬리말의 실제 소유 컨트롤이 일치하지 않습니다.');
    if(c?.props?.Lock)throw Error('보호된 머리말·꼬리말은 편집할 수 없습니다.');
    if(!v.exists)throw Error(headerFooterCreationHold);
    if(v.paragraphs.some(p=>[...p.text].length!==p.charCount))throw Error('문자 위치 계약이 불명확하여 조회만 지원합니다.');
    return '';
  }catch(error){return String(error).replace(/^Error: /,'');}
}
export function prepareHeaderFooter(a:RhwpAdapter,s:Selection,c:HeaderFooterChange):(()=>Selection)|undefined{
  if(!c||!['create','append'].includes(c.action)||typeof c.text!=='string'||[...c.text].length>2000||/[\u0000-\u001f\u007f]/.test(c.text))throw Error('평문 2000자 이내만 지원합니다. 줄바꿈·탭·제어문자는 지원하지 않습니다.');
  if(c.action==='create')throw Error(headerFooterCreationHold);
  const view=headerFooterView(a,c.target),reason=headerFooterEditReason(a,s,view);if(reason)throw Error(reason);
  if(JSON.stringify(c.expected)!==JSON.stringify(view))throw Error('머리말·꼬리말 대상/내용이 변경되었습니다. 다시 여세요.');
  if(!view.exists)throw Error('기존 머리말·꼬리말을 선택하세요.');
  if(c.action==='append'&&!c.text)return;
  const others=headerFooterCatalog(a).filter(v=>key(v.target)!==key(c.target));
  return()=>{
    const t=c.target;
    const index=view.paragraphs.length-1,previous=view.paragraphs[index];
    if(c.text)a.call('insertTextInHeaderFooter',t.section,t.isHeader,t.applyTo,index,previous.charCount,c.text);
    const after=headerFooterView(a,t),expected=view.paragraphs.map((p,n)=>n===index?{text:p.text+c.text,charCount:p.charCount+[...c.text].length}:p);
    if(!after.exists||JSON.stringify(after.paragraphs)!==JSON.stringify(expected)||view.exists&&JSON.stringify(after.owner)!==JSON.stringify(view.owner))throw Error('머리말·꼬리말 입력 재조회가 일치하지 않습니다.');
    if(JSON.stringify(headerFooterCatalog(a).filter(v=>key(v.target)!==key(t)))!==JSON.stringify(others))throw Error('비선택 머리말·꼬리말이 변경되었습니다.');
    return copy(s);
  };
}
