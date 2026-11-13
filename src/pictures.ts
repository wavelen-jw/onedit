import {bodyParagraphOwners} from './adapter-position.js';
import type { RhwpAdapter } from './adapter.js';
import { copy, ordered, sameContainer, paraIndex, withPara, type Selection } from './model.js';
import { inlineCellPicture } from './inline-cell-picture.js';
export const cellPictureSizeNote='일반셀 단일 인라인 그림의 크기만 변경합니다. 배치·교체·삭제·설명문·자르기 편집은 이 입구에서 지원하지 않습니다. 미변경 값과 원본 자원은 유지합니다.';
export const cellPicturePropertiesHold=cellPictureSizeNote;
export type PictureFile = { bytes: Uint8Array; extension: 'png'|'jpg'; naturalWidth: number; naturalHeight: number };
export type PictureChange = { action:'insert'; file:PictureFile; width:number; height:number; placement?:string; replaceSelection?:true } | {action:'replace';file:PictureFile} | {action:'delete'} | {action:'properties';width?:number;height?:number;treatAsChar?:boolean;textWrap?:string;description?:string};
export function imageDimensions(b:Uint8Array): {width:number;height:number;extension:'png'|'jpg'} {
  if(b.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) {const v=new DataView(b.buffer,b.byteOffset,b.byteLength);return {width:v.getUint32(16),height:v.getUint32(20),extension:'png'};}
  if(b[0]===255&&b[1]===216){let i=2;while(i+4<b.length){if(b[i++]!==255)break;while(b[i]===255)i++;const marker=b[i++];if(marker===217||marker===218)break;const n=(b[i]<<8)|b[i+1];if(n<2||i+n>b.length)break;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&n>=8)return {height:(b[i+3]<<8)|b[i+4],width:(b[i+5]<<8)|b[i+6],extension:'jpg'};i+=n;}}
  throw Error('PNG/JPEG 원본 크기를 확인할 수 없습니다.');
}
export function pictureFile(file:PictureFile) {
  if (!(file.bytes instanceof Uint8Array) || !file.bytes.length || file.bytes.length>20*1024*1024) throw Error('그림 파일은 20MB 이하이어야 합니다.');
  const b=file.bytes, png=b.length>24 && [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v), jpg=b.length>4&&b[0]===255&&b[1]===216&&b[2]===255;
  if (!(file.extension==='png'&&png || file.extension==='jpg'&&jpg)) throw Error('PNG/JPEG 파일만 지원합니다. 파일 형식을 확인하세요.');
  const dimensions=imageDimensions(b);if(dimensions.width!==file.naturalWidth||dimensions.height!==file.naturalHeight||dimensions.extension!==file.extension)throw Error('그림 원본 정보가 일치하지 않습니다.');
  for(const n of [file.naturalWidth,file.naturalHeight]) if(!Number.isInteger(n)||n<1||n>20000) throw Error('그림 원본 크기가 지원 범위를 벗어났습니다.');
  if(file.naturalWidth*file.naturalHeight>40000000)throw Error('그림은 4천만 화소 이하만 지원합니다.');
}
export function pictureCatalog(a:RhwpAdapter) {
 const body=bodyParagraphOwners(a);
  return (a.call('getControls') as any[]).filter(c=>c.list===0&&c.ctrlId==='gso').flatMap(c=>{
    const p=body[c.para];if(!p)return [];
    try {const props=a.call('getPictureProperties',p.sec,p.para,c.controlIndex);return [{...p,control:c.controlIndex,props,locked:!!c.props?.Lock}];}catch{return [];}
  });
}
export function selectedPicture(a:RhwpAdapter,s:Selection) {
  if(s.kind==='object'&&s.focus.kind==='cell'&&!s.focus.ancestors?.length){
    // The existing scalar-empty, single inline picture owner only.
    const row=inlineCellPicture(a,s.focus);
    if(row&&row.control===s.control){
      const p=row.props;
      const info=a.call('getCellInfo',s.focus.sec,s.focus.para,s.focus.control,s.focus.cell);
      if(info.rowSpan!==1||info.colSpan!==1)throw Error('병합 셀 그림의 속성 변경은 이 입구에서 지원하지 않습니다. 원본을 유지합니다.');
      if(p.rotationAngle||p.horzFlip||p.vertFlip||p.cropLeft||p.cropTop||p.cropRight||p.cropBottom||p.hasCaption)
        throw Error('회전·자르기·캡션 셀 그림의 속성 변경은 미검증입니다. 원본을 유지합니다.');
      return {...row,cellPath:row.path};
    }
  }
  if(s.kind!=='object'||s.focus.kind!=='body')throw Error('본문 그림 한 개를 선택하세요. 셀·중첩·그룹 그림 편집은 미지원입니다.');
  const row=pictureCatalog(a).find(r=>r.sec===s.focus.sec&&r.para===s.focus.para&&r.control===s.control);
  if(!row)throw Error('선택한 그림이 현재 문서에 없습니다. 다시 선택하세요.');
  if(row.locked)throw Error('보호된 그림은 변경할 수 없습니다.');
  return {...row,cellPath:undefined};
}
// Canvas scope is narrower than the existing property API. Never infer an anchor.
export function pictureCanvasPlacement(p:Record<string,any>) {
  if(p.treatAsChar)return {supported:true,click:true};
  const known=['Square','TopAndBottom','BehindText','InFrontOfText'].includes(p.textWrap);
  const para=p.vertRelTo==='Para'&&p.horzRelTo==='Para'&&p.vertOffset===0&&p.horzOffset===0;
  const paper=p.vertRelTo==='Paper'&&p.horzRelTo==='Paper'&&[p.vertOffset,p.horzOffset].every(v=>Number.isSafeInteger(v)&&v>=0);
  const anchor=(para||paper)&&p.vertAlign==='Top'&&p.horzAlign==='Left';
  return {supported:known&&anchor,click:known&&anchor&&p.textWrap!=='BehindText'};
}
export type PictureLayoutBox = {page:number;x:number;y:number;w:number;h:number;sec:number;para:number;control:number;click:boolean};
// The same verified body-picture geometry supplies the canvas and selected-object
// input/reveal anchor. A picture selection is not a text caret in its empty owner.
export function pictureLayoutBoxes(a:RhwpAdapter,page:number):PictureLayoutBox[] {
  const catalog=pictureCatalog(a);
  return (a.call('getPageControlLayout',page).controls??[]).flatMap((c:any)=>{
    const row=catalog.find(r=>r.sec===c.secIdx&&r.para===c.paraIdx&&r.control===c.controlIdx),p=row?.props;
    if(!Array.isArray(c.stableIndex)||c.stableIndex.length!==3||c.stableIndex.some((v:number,i:number)=>v!==[c.secIdx,c.paraIdx,c.controlIdx][i]))return [];
    if(c.type!=='image'||!p||!pictureCanvasPlacement(p).supported||p.rotationAngle||p.horzFlip||p.vertFlip||p.cropLeft||p.cropTop||p.cropRight||p.cropBottom||c.cellPath?.length||c.path?.length)return [];
    if(!p.treatAsChar&&c.wrap!==({Square:'square',TopAndBottom:'topAndBottom',BehindText:'behindText',InFrontOfText:'inFrontOfText'} as Record<string,string>)[p.textWrap])return [];
    if(![c.x,c.y,c.w,c.h].every(Number.isFinite)||c.w<=0||c.h<=0||Math.abs(c.w-p.width/75)>.11||Math.abs(c.h-p.height/75)>.11)return [];
    return [{page,x:c.x,y:c.y,w:c.w,h:c.h,sec:row.sec,para:row.para,control:row.control,click:pictureCanvasPlacement(p).click}];
  });
}
export function pictureSelectionRect(a:RhwpAdapter,s:Selection) {
  if(s.kind!=='object'||s.focus.kind!=='body')return;
  const boxes=Array.from({length:a.pageCount},(_,page)=>pictureLayoutBoxes(a,page)).flat()
    .filter(b=>b.sec===s.focus.sec&&b.para===s.focus.para&&b.control===s.control);
  if(boxes.length>1)throw Error('선택한 그림의 표시 위치가 모호합니다.');
  const b=boxes[0];if(b)return {pageIndex:b.page,x:b.x,y:b.y,height:b.h};
}
export function preparePicture(a:RhwpAdapter,s:Selection,change:PictureChange): (()=>Selection)|undefined {
  a.assertEditable(s.focus);
  const dimension=(n:number)=>{if(!Number.isInteger(n)||n<100||n>72000)throw Error('그림 크기는 1~720pt 범위입니다.');};
  if(change.action==='insert') {
    let target=s;
    let erase:(()=>void)|undefined;
    if(s.kind==='text'&&change.replaceSelection) {
      const [from,to]=ordered(s.anchor,s.focus);
      a.validate(from);a.validate(to);a.assertEditable(from);
      a.assertTextOnly(from,paraIndex(to));
      // Reuse the existing multi-paragraph delete/owner policy, but never erase
      // an existing inline control as a side effect of replacing selected text.
      for(let i=paraIndex(from);i<=paraIndex(to);i++) {
        const p=withPara(from,i),start=i===paraIndex(from)?from.offset:0,end=i===paraIndex(to)?to.offset:a.length(p);
        if(a.textOffset(p,end)-a.textOffset(p,start)!==end-start)
          throw Error('개체가 포함된 선택은 그림으로 대체할 수 없습니다.');
      }
      target={kind:'caret',focus:copy(from)};
      erase=()=>a.remove(from,to);
    } else if(s.kind==='cells'&&change.replaceSelection) {
      if(!sameContainer(s.anchor,s.focus))throw Error('여러 셀을 한 그림으로 대체할 수 없습니다. 한 셀을 선택하세요.');
      const from={...s.focus,cellPara:0,offset:0},last={...from,cellPara:a.count(from)-1};
      const to={...last,offset:a.length(last)};
      a.validate(from);a.validate(to);a.assertTextOnly(from,to.cellPara);
      target={kind:'caret',focus:from};erase=()=>a.remove(from,to);
    }
    if(target.kind!=='caret'||(target.focus.kind==='cell'&&!change.replaceSelection))throw Error('본문·셀 입력 위치 또는 텍스트를 선택하세요.');
    pictureFile(change.file);dimension(change.width);dimension(change.height);
    const p=target.focus,f=change.file,placement=change.placement??'inline';
    if(!['inline','Square','TopAndBottom','BehindText','InFrontOfText'].includes(placement))throw Error('지원하지 않는 그림 배치입니다.');
    // Interaction owns one snapshot transaction around both operations. All
    // byte/size/target checks above complete before deleting selected text.
    return ()=>{erase?.();const cell=p.kind==='cell',r=a.call('insertPicture',p.sec,p.para,a.textOffset(p),cell?a.path(p):'[]',f.bytes,cell?change.width:f.naturalWidth*75,cell?change.height:f.naturalHeight*75,f.naturalWidth,f.naturalHeight,f.extension,'');
      // Core's documented cell path inserts a floating sibling of the host
      // table at that exact cell's paper position. Keep that actual object owner
      // and placement instead of converting it to a body-inline picture.
      const next:Selection={kind:'object',focus:{kind:'body',sec:p.sec,para:r.paraIdx,offset:0},control:r.controlIdx};
      if(!cell)a.call('setPictureProperties',p.sec,r.paraIdx,r.controlIdx,JSON.stringify({width:change.width,height:change.height,treatAsChar:placement==='inline',...(placement==='inline'?{}:{textWrap:placement})}));
      const after=selectedPicture(a,next).props;if(after.width!==change.width||after.height!==change.height||after.treatAsChar!==(cell?false:placement==='inline'))throw Error('삽입 그림 속성 재조회 실패');
      // A mixed text/table host can expose a Core control-offset round-trip
      // failure. Verify before committing this cell transaction; do not leave
      // deleted text or an unsavable picture when the existing Core rejects it.
      if(cell)a.exportChecked();
      return next;};
  }
  const r=selectedPicture(a,s),p=r.props;
  if(r.cellPath&&change.action!=='properties')throw Error(cellPicturePropertiesHold+' 다른 개체 명령은 기존 경로를 사용하세요.');
  if(change.action==='delete')return ()=>{a.call('deletePictureControl',r.sec,r.para,r.control);return {kind:'caret',focus:{...s.focus,offset:0}};};
  if(change.action==='replace') {
    pictureFile(change.file);const f=change.file;
    // Existing assign API resets crop: only the uncropped, untransformed frame is safe here.
    if(p.rotationAngle||p.horzFlip||p.vertFlip||p.cropLeft||p.cropTop||p.cropRight||p.cropBottom)throw Error('자르기·회전·대칭이 있는 그림 교체는 미지원입니다. 원본을 유지합니다.');
    const old=a.doc.getControlImageData(r.sec,r.para,'[]',r.control), original=imageDimensions(old);
    if(original.width!==f.naturalWidth||original.height!==f.naturalHeight)throw Error('현재 교체는 원본 픽셀 크기가 같은 그림만 지원합니다. 다른 크기는 별도로 삽입하세요.');
    if(old.length===f.bytes.length&&old.every((v,i)=>v===f.bytes[i]))return;
    return ()=>{a.call('assignPictureImage',r.sec,r.para,'[]',r.control,f.bytes,f.naturalWidth,f.naturalHeight,f.extension);
      const bytes=a.doc.getControlImageData(r.sec,r.para,'[]',r.control), after=selectedPicture(a,s).props;
      if(bytes.length!==f.bytes.length||bytes.some((v,i)=>v!==f.bytes[i])||after.width!==p.width||after.height!==p.height)throw Error('그림 교체 재조회 실패');return copy(s);};
  }
  if(change.action!=='properties')throw Error('지원하지 않는 그림 명령입니다.');
  const props:Record<string,unknown>={};
  for(const [key,value]of Object.entries(change)){
    if(key==='action')continue;
    if(r.cellPath&&!['width','height'].includes(key))throw Error('일반셀 그림의 배치·교체 변경은 이 창에서 지원하지 않습니다. 원본을 유지합니다.');
    if(!['width','height','treatAsChar','textWrap','description'].includes(key))throw Error('지원하지 않는 그림 속성입니다.');
    if(key==='width'||key==='height'){dimension(value as number);if(p.sizeProtect||p.rotationAngle)throw Error('크기 보호·회전 그림의 크기 변경은 미지원입니다.');}
    if(key==='treatAsChar'&&typeof value!=='boolean')throw Error('잘못된 그림 배치입니다.');
    if(key==='textWrap'&&!['Square','TopAndBottom','BehindText','InFrontOfText'].includes(String(value)))throw Error('지원하지 않는 본문 배치입니다.');
    if(key==='description'){
      if(typeof p.description!=='string')throw Error('현재 그림의 개체 설명문을 조회할 수 없습니다. 원본을 유지합니다.');
      if(typeof value!=='string'||Array.from(value).some(c=>{const n=c.codePointAt(0)!;return !(n===9||n===10||n===13||n>=32&&n<=0xd7ff||n>=0xe000&&n<=0xfffd||n>=0x10000&&n<=0x10ffff);}))throw Error('개체 설명문에 저장할 수 없는 문자가 있습니다.');
    }
    if(p[key]!==value)props[key]=value;
  }
  if(!Object.keys(props).length)return;
  if(r.cellPath)return ()=>{a.call('setCellPicturePropertiesByPath',r.sec,r.para,r.cellPath,r.control,JSON.stringify(props));const after=selectedPicture(a,s).props;
    if(Object.entries(props).some(([k,v])=>after[k]!==v))throw Error('셀 그림 크기 재조회가 일치하지 않습니다.');return copy(s);};
  return ()=>{a.call('setPictureProperties',r.sec,r.para,r.control,JSON.stringify(props));const after=selectedPicture(a,s).props;
    if(Object.entries(props).some(([k,v])=>after[k]!==v))throw Error('그림 속성 재조회가 일치하지 않습니다.');return copy(s);};
}
