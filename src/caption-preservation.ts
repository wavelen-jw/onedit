import {bodyParagraphOwners} from './adapter-position.js';
import type {RhwpAdapter} from './adapter.js';
export type CaptionTarget={kind:'table'|'picture'|'shape';sec:number;para:number;control:number};
export function captionView(a:RhwpAdapter,t:CaptionTarget){
 if(!t||!['picture','table','shape'].includes(t.kind)||![t.sec,t.para,t.control].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('캡션 소유 위치를 확인하세요.');
 a.validate({kind:'body',sec:t.sec,para:t.para,offset:0});let global=t.para;for(let sec=0;sec<t.sec;sec++)global+=a.doc.getParagraphCount(sec);
 const object=a.call<any[]>('getObjects').find(o=>o.para===global&&o.controlIndex===t.control);
 const owner=a.call<any[]>('getControls').find(o=>o.list===0&&o.para===global&&o.controlIndex===t.control);
 if(!object||object.kind!==t.kind||!owner)throw Error('선택한 캡션 개체가 변경되었습니다.');
 const props=a.call(t.kind==='table'?'getTableProperties':t.kind==='picture'?'getPictureProperties':'getShapeProperties',t.sec,t.para,t.control);
 if(t.kind==='shape'&&(typeof props.tbVerticalAlign!=='string'||!Object.hasOwn(props,'roundRate')))throw Error('그룹·중첩·일반 도형의 캡션은 아직 연결되지 않았습니다.');
 if(typeof props.hasCaption!=='boolean')throw Error('실제 캡션 상태를 조회할 수 없습니다.');
 // Core's existing table-caption sentinel and Picture-caption owner are API
 // addresses, never fake cell selections. A caption keeps its real object owner.
 const cell=t.kind==='table'?65534:t.kind==='shape'?1:0;
 const count=props.hasCaption?a.doc.getCellParagraphCount(t.sec,t.para,t.control,cell):0;
 if(!Number.isSafeInteger(count)||count<0||count>256||props.hasCaption&&count===0)throw Error('캡션 문단을 확인할 수 없습니다.');
 const paragraphs=Array.from({length:count},(_,i)=>{const n=a.doc.getCellParagraphLength(t.sec,t.para,t.control,cell,i),text=a.doc.getTextInCell(t.sec,t.para,t.control,cell,i,0,n);if([...text].length!==n)throw Error('캡션 문자 범위가 일치하지 않습니다.');return{text,properties:a.call('getCellParaPropertiesAt',t.sec,t.para,t.control,cell,i),chars:[...text].map((_,offset)=>a.call('getCellCharPropertiesAt',t.sec,t.para,t.control,cell,i,offset))};});
 return{target:{...t},cell,props,locked:!!owner.props?.Lock,paragraphs};
}
export function captionCatalog(a:RhwpAdapter){
 const body=bodyParagraphOwners(a);
 return a.call<any[]>('getObjects').filter(o=>['table','picture'].includes(o.kind)||o.kind==='shape'&&(()=>{const p=body[o.para],v=a.call('getShapeProperties',p.sec,p.para,o.controlIndex);return typeof v.tbVerticalAlign==='string'&&Object.hasOwn(v,'roundRate');})()).map(o=>captionView(a,{...body[o.para],kind:o.kind,control:o.controlIndex})).filter(v=>v.props.hasCaption);
}
