import type {RhwpAdapter} from './adapter.js';
import {copy, type Selection} from './model.js';
import {preparePicture} from './pictures.js';
import {shapeCatalog,prepareShapeSize} from './shapes.js';
export type ControlKey = 'front'|'back'|'inFrontOfText'|'behindText'|'left'|'right'|'up'|'down'|'widen'|'narrow'|'taller'|'shorter';
// A pointer delta uses the existing typed offset setter, which recomposes the
// page. moveControlAt changes stored offsets without updating live layout in
// the current Core; it cannot serve a pointer's actual placement preview.
export function prepareControlOffset(a:RhwpAdapter,s:Selection,dx:number,dy:number) {
  if(s.kind!=='object'&&s.kind!=='table')throw Error('옮길 개체를 선택하세요.');
  const p=s.focus;
  if(s.kind==='object'&&p.kind!=='body'||p.kind==='cell'&&p.ancestors?.length)throw Error('셀·중첩 개체의 위치 이동은 이 경로에서 지원하지 않습니다.');
  a.validate(p);a.assertEditable(p);
  if(![dx,dy].every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=72000))throw Error('이동 거리를 확인할 수 없습니다.');
  let root=p.para;for(let sec=0;sec<p.sec;sec++)root+=a.doc.getParagraphCount(sec);
  const control=s.kind==='table'?s.focus.control:s.control,controls=()=>a.call<any[]>('getControls'),before=controls();
  const row=before.find(c=>c.list===0&&c.para===root&&c.controlIndex===control);
  if(!row||!['gso','tbl'].includes(row.ctrlId)||row.props?.Lock)throw Error('개체 소유권·보호 상태를 확인할 수 없습니다.');
  const props=row.props;
  if(props.TreatAsChar)throw Error('글자처럼 취급 개체는 본문 삽입 위치로 옮기세요.');
  if(!['HorzOffset','VertOffset'].every(k=>Number.isSafeInteger(props[k])&&props[k]>=0))throw Error('기존 개체 위치를 확인할 수 없습니다.');
  const getter=row.ctrlId==='tbl'?'getTableProperties':'getPictureProperties',setter=row.ctrlId==='tbl'?'setTableProperties':'setPictureProperties';
  const typed=a.call<any>(getter,p.sec,p.para,control);
  if(typed.horzAlign!=='Left'||typed.vertAlign!=='Top'||typed.horzOffset!==props.HorzOffset||typed.vertOffset!==props.VertOffset)
    throw Error('왼쪽·위 기준 위치가 확인된 떠 있는 개체만 이 손잡이로 옮길 수 있습니다.');
  const expected=structuredClone(before),next=expected.find(c=>c.list===0&&c.para===root&&c.controlIndex===control)!;
  next.props.HorzOffset=props.HorzOffset+dx;next.props.VertOffset=props.VertOffset+dy;
  if([next.props.HorzOffset,next.props.VertOffset].some(v=>v<0||v>2147483647))throw Error('현재 배치 기준의 시작점 밖에는 놓을 수 없습니다.');
  if(next.props.HorzOffset===props.HorzOffset&&next.props.VertOffset===props.VertOffset)return;
  const expectedTyped={...typed,horzOffset:next.props.HorzOffset,vertOffset:next.props.VertOffset};
  const boxes=()=>Array.from({length:a.pageCount},(_,page)=>(a.call('getPageControlLayout',page).controls??[])
    .filter((c:any)=>c.secIdx===p.sec&&c.paraIdx===p.para&&c.controlIdx===control&&JSON.stringify(c.stableIndex)===JSON.stringify([p.sec,p.para,control]))
    .map((c:any)=>({page,x:c.x,y:c.y,w:c.w,h:c.h}))).flat();
  const oldBoxes=boxes();if(oldBoxes.length!==1)throw Error('한 쪽 안의 정확한 개체 배치를 확인할 수 없습니다.');
  const ref=a.captureSelection(s);
  return()=>{a.call(setter,p.sec,p.para,control,JSON.stringify({horzOffset:next.props.HorzOffset,vertOffset:next.props.VertOffset}));
    if(JSON.stringify(controls())!==JSON.stringify(expected))throw Error('개체 이동 후 대상·배치 또는 비대상 개체가 달라 취소했습니다.');
    if(JSON.stringify(a.call(getter,p.sec,p.para,control))!==JSON.stringify(expectedTyped))throw Error('개체 이동 후 비대상 속성이 달라 취소했습니다.');
    const after=boxes();if(after.length!==1||after[0].page!==oldBoxes[0].page||Math.abs(after[0].x-oldBoxes[0].x-dx/75)>.11||Math.abs(after[0].y-oldBoxes[0].y-dy/75)>.11||after[0].w!==oldBoxes[0].w||after[0].h!==oldBoxes[0].h)
      throw Error('실제 표시 위치가 이동 요청과 달라 원문을 복원했습니다.');
    a.exportChecked();return a.resolveSelection(ref);};
}
// Existing native query/setter pair. Root paragraph indices are global, never
// inferred from a scalar offset. Cell/group owners keep their separate guards.
export function prepareControlKey(a:RhwpAdapter,s:Selection,action:ControlKey) {
  if(s.kind!=='object'&&s.kind!=='table')throw Error('본문의 정확한 개체를 먼저 선택하세요.');
  const p=s.focus;if(s.kind==='object'&&p.kind!=='body'||p.kind==='cell'&&(s.kind!=='table'||p.ancestors?.length))throw Error('본문 개체만 지원합니다. 셀·중첩 개체는 기존 값을 유지합니다.');
  a.validate(p);a.assertEditable(p);const control=s.kind==='table'?s.focus.control:s.control;
  let root=p.para;for(let i=0;i<p.sec;i++)root+=a.doc.getParagraphCount(i);
  const controls=()=>a.call<any[]>('getControls').filter(c=>c.list===0),before=controls(),row=before.find(c=>c.para===root&&c.controlIndex===control);
  if(!row||!['gso','tbl'].includes(row.ctrlId)||row.props?.Lock)throw Error('선택 개체의 종류·보호·소유 경로를 확인할 수 없습니다.');
  const props=row.props;
  if(!['Width','Height','HorzOffset','VertOffset','TextWrap','TreatAsChar'].every(k=>Number.isSafeInteger(props[k])))throw Error('개체 원값을 조회할 수 없습니다.');
  const reference=a.captureSelection(s),expected=structuredClone(before),current=expected.find(c=>c.para===root&&c.controlIndex===control)!;
  let apply:()=>void,changed=false;
  if(['front','back'].includes(action)) {
    const cycle=a.call<any[]>('getObjectCycle'),start=root-p.para,end=start+a.doc.getParagraphCount(p.sec),group=cycle.filter(c=>c.para>=start&&c.para<end);
    const item=group.find(c=>c.para===root&&c.controlIndex===control);
    // The matched cumulative Core resolves identity by paragraph/control slot,
    // even when imported controls share z. Keep whole-cycle postvalidation below.
    if(!item||group.some(c=>!Number.isSafeInteger(c.z)))throw Error('개체 순서 값을 조회할 수 없어 기존 순서를 유지합니다.');
    const edge=(action==='front'?Math.max:Math.min)(...group.map(c=>c.z));if(item.z===edge)return;
    const desired=cycle.map(c=>({...c,z:c.para<start||c.para>=end?c.z:c.para===root&&c.controlIndex===control?edge:action==='front'&&c.z>item.z?c.z-1:action==='back'&&c.z<item.z?c.z+1:c.z}));
    // Moving another locked object in the stack is not silently admitted.
    for(const c of group)if(c.z!==desired.find(d=>d.para===c.para&&d.controlIndex===c.controlIndex)!.z&&before.find(r=>r.para===c.para&&r.controlIndex===c.controlIndex)?.props.Lock)throw Error('보호된 이웃 개체의 순서는 유지합니다.');
    apply=()=>{a.call('setControlZOrderAt',root,control,action);if(JSON.stringify(a.call('getObjectCycle'))!==JSON.stringify(desired))throw Error('개체 순서 재조회가 요청과 다릅니다.');};changed=true;
  } else if(action==='inFrontOfText'||action==='behindText') {
    if(props.TreatAsChar)throw Error('이 입구는 떠 있는 개체의 배치만 변경합니다. 글자처럼 취급은 기존 그림 속성에서 명시적으로 변경하세요.');
    const wrap=action==='inFrontOfText'?3:2;changed=props.TextWrap!==wrap;current.props.TextWrap=wrap;
    apply=()=>{a.call('setControlZOrderAt',root,control,action);};
  } else if(['left','right','up','down'].includes(action)) {
    // Native moveControlAt documents 56HU and an inline no-op.
    if(props.TreatAsChar)return;
    const dx=action==='right'?56:action==='left'?-56:0,dy=action==='down'?56:action==='up'?-56:0;
    current.props.HorzOffset=Math.max(0,props.HorzOffset+dx);current.props.VertOffset=Math.max(0,props.VertOffset+dy);
    changed=current.props.HorzOffset!==props.HorzOffset||current.props.VertOffset!==props.VertOffset;
    apply=()=>{a.call('moveControlAt',root,control,dx,dy);};
  } else {
    if(s.kind!=='object'||p.kind!=='body')throw Error('표 전체의 크기를 셀 기하와 분리해 변경하지 않습니다. 기존 표 크기 명령을 사용하세요.');
    const dw=action==='widen'?283:action==='narrow'?-283:0,dh=action==='taller'?283:action==='shorter'?-283:0;
    const width=props.Width+dw,height=props.Height+dh;
    const objects=a.call<any[]>('getObjects'),kind=objects.find(c=>c.para===root&&c.controlIndex===control)?.kind;
    if(kind==='picture')preparePicture(a,s,{action:'properties',width,height});
    else if(kind==='shape'){
      const shape=shapeCatalog(a).find(r=>r.target.sec===p.sec&&r.target.para===p.para&&r.target.control===control);
      if(!shape)throw Error('기존 도형 대상 조회 실패');prepareShapeSize(a,s,{target:shape.target,width,height});
    }else throw Error('이 개체의 기존 크기 변경 계약이 없습니다.');
    current.props.Width=width;current.props.Height=height;changed=true;
    apply=()=>{a.call('resizeControlAt',root,control,dw,dh);};
  }
  if(!changed)return;
  return ()=>{apply();if(JSON.stringify(controls())!==JSON.stringify(expected))throw Error('개체 원값·이웃 개체 재조회가 요청과 다릅니다. 변경을 취소합니다.');return a.resolveSelection(reference)??copy(s);};
}
