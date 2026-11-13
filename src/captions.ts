import type {RhwpAdapter} from './adapter.js';
import {copy,type Selection} from './model.js';
import {captionView,type CaptionTarget} from './caption-preservation.js';
export {captionView} from './caption-preservation.js';
export type CaptionChange={kind:'caption';target:CaptionTarget;expected:unknown;paragraph:number;text:string};
export function captionTarget(a:RhwpAdapter,s:Selection){
 let t:CaptionTarget;
 if(s.kind==='table'&&!s.focus.ancestors?.length)t={kind:'table',sec:s.focus.sec,para:s.focus.para,control:s.focus.control};
 else if(s.kind==='object'&&s.focus.kind==='body'&&!s.textbox){let global=s.focus.para;for(let sec=0;sec<s.focus.sec;sec++)global+=a.doc.getParagraphCount(sec);const object=a.call<any[]>('getObjects').find(o=>o.para===global&&o.controlIndex===s.control);if(!object||!['picture','shape'].includes(object.kind))throw Error('본문 그림 또는 일반 글상자 개체를 선택하세요.');t={kind:object.kind,sec:s.focus.sec,para:s.focus.para,control:s.control};}
 else throw Error('본문 그림·표·일반 글상자 개체를 선택하세요. 그룹·중첩 캡션은 미지원입니다.');
 a.assertEditable(s.focus);const view=captionView(a,t);if(view.locked||view.props.sizeProtect)throw Error('보호된 개체의 캡션은 변경하지 않습니다.');return view;
}
export function prepareCaption(a:RhwpAdapter,s:Selection,c:CaptionChange):(()=>Selection)|undefined{
 const v=captionTarget(a,s);if(JSON.stringify(v.target)!==JSON.stringify(c.target)||JSON.stringify(v)!==JSON.stringify(c.expected))throw Error('캡션 대상·내용이 변경되었습니다. 다시 여세요.');
 if(typeof c.text!=='string'||[...c.text].length>8000||/[\u0000-\u001f\u007f]/.test(c.text))throw Error('캡션은 한 문단에 평문 8000자 이내로 추가하세요.');
 if(!Number.isSafeInteger(c.paragraph)||c.paragraph<0||c.paragraph>=(v.props.hasCaption?v.paragraphs.length:1))throw Error('캡션 문단 범위를 확인하세요.');
 if(v.props.hasCaption&&!c.text)return;
 return()=>{const t=v.target;if(!v.props.hasCaption){if(t.kind==='shape'){let global=t.para;for(let sec=0;sec<t.sec;sec++)global+=a.doc.getParagraphCount(sec);a.call('attachCaptionAt',global,t.control);}else a.call(t.kind==='table'?'setTableProperties':'setPictureProperties',t.sec,t.para,t.control,JSON.stringify({hasCaption:true}));}
  const made=captionView(a,t);if(!made.props.hasCaption)throw Error('캡션 생성 결과를 확인할 수 없습니다.');
  const para=made.paragraphs[c.paragraph];if(c.text)a.call('insertTextInCell',t.sec,t.para,t.control,made.cell,c.paragraph,[...para.text].length,c.text);
  const after=captionView(a,t);for(const[k,value]of Object.entries(v.props))if(k!=='hasCaption'&&!k.startsWith('caption')&&JSON.stringify(value)!==JSON.stringify(after.props[k]))throw Error('캡션 밖의 개체 속성이 변경되었습니다.');
  if(after.paragraphs.length!==made.paragraphs.length||after.paragraphs.some((p,i)=>p.text!==made.paragraphs[i].text+(i===c.paragraph?c.text:'')))throw Error('캡션 문자·문단 순서가 요청과 다릅니다.');
  for(let i=0;i<made.paragraphs.length;i++){const p=made.paragraphs[i],n=after.paragraphs[i];if(JSON.stringify(p.properties)!==JSON.stringify(n.properties)||JSON.stringify(p.chars)!==JSON.stringify(n.chars.slice(0,p.chars.length)))throw Error('기존 캡션의 명시 서식이 변경되었습니다.');}
  return copy(s);
 };
}
