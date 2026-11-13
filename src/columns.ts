import type { RhwpAdapter } from './adapter.js';
import { coreRuntimeHasCapability } from './core-runtime.js';
import { copy, type Selection } from './model.js';

export type ColumnView = { section:number; columnCount:number; columnType:number; sameWidth:boolean; spacing:number; owner:{para:number;control:number} };
export type ColumnChange = { expected:ColumnView; count:1|2; spacing:number };
export const columnLimit = '기존 한 구역의 일반·같은 너비 1단/2단과 단 간격만 지원합니다. 구역 생성·나누기, 배분·평행·서로 다른 너비·다중 구역 편집은 미지원입니다.';

export function columnView(a:RhwpAdapter,section:number):ColumnView {
  if(!Number.isSafeInteger(section)||section<0||section>=a.readStructural('getSectionCount'))throw Error('다단 소유 구역을 확인할 수 없습니다.');
  const d=a.call('getColumnDef',section);
  if(!Number.isSafeInteger(d.columnCount)||d.columnCount<1||![0,1,2].includes(d.columnType)||typeof d.sameWidth!=='boolean'||!Number.isSafeInteger(d.spacing)||d.spacing<0)throw Error('다단 조회 응답을 확인할 수 없습니다.');
  const start=Array.from({length:section},(_,s)=>a.doc.getParagraphCount(s)).reduce((x,y)=>x+y,0),end=start+a.readStructural('getParagraphCount',section);
  const controls=a.call<any[]>('getControls').filter(c=>c.list===0&&c.para>=start&&c.para<end&&c.ctrlId==='cold');
  if(controls.length!==1)throw Error('기존 단 정의가 한 개일 때만 지원합니다. 새 정의를 만들거나 여러 단 정의를 합치지 않습니다.');
  const c=controls[0];
  if(!Number.isSafeInteger(c.controlIndex)||c.controlIndex<0||c.props?.Lock)throw Error('단 정의의 소유 컨트롤을 확인할 수 없거나 보호되어 있습니다.');
  return{section,columnCount:d.columnCount,columnType:d.columnType,sameWidth:d.sameWidth,spacing:d.spacing,owner:{para:c.para-start,control:c.controlIndex}};
}
export function columnEditReason(a:RhwpAdapter,s:Selection,v:ColumnView) {
  try{
    if(!coreRuntimeHasCapability(a.doc, 'columns'))throw Error('다단 저장·재열기를 검증한 개발 Core가 아닙니다. 기존 설정은 유지합니다.');
    if(s.kind!=='caret'||s.focus.kind!=='body'||s.focus.sec!==v.section)throw Error('적용할 본문 구역에 커서를 놓으세요. 셀·범위 선택은 변경하지 않습니다.');
    a.assertEditable(s.focus);
    if(a.readStructural('getSectionCount')!==1)throw Error('다중 구역 다단 편집은 보존 검증 전 미지원입니다. 기존 설정을 유지합니다.');
    if(v.columnType!==0||!v.sameWidth||![1,2].includes(v.columnCount))throw Error('기존 배분·평행·다른 너비·3단 이상 설정은 조회만 지원합니다.');
    a.assertEditable({kind:'body',sec:v.section,para:v.owner.para,offset:0});
    return '';
  }catch(error){return String(error).replace(/^Error: /,'');}
}
export function columnSpacingHu(value:string):number {
  if(!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))throw Error('간격은 0 이상, 소수 둘째 자리까지 입력하세요.');
  const [whole,fraction='']=value.split('.'),hu=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(hu))throw Error('단 간격 범위를 초과했습니다.');
  return hu;
}
export function prepareColumns(a:RhwpAdapter,s:Selection,c:ColumnChange):(()=>Selection)|undefined {
  if(!c||Object.keys(c).some(k=>!['expected','count','spacing'].includes(k))||![1,2].includes(c.count)||!Number.isSafeInteger(c.spacing)||c.spacing<0)throw Error('단 수와 간격을 확인하세요. 간격은 0.01pt 단위입니다.');
  const view=columnView(a,c.expected?.section),reason=columnEditReason(a,s,view);if(reason)throw Error(reason);
  if(JSON.stringify(c.expected)!==JSON.stringify(view))throw Error('단 정의가 변경되었습니다. 다시 여세요.');
  if(c.count===view.columnCount&&c.spacing===view.spacing)return;
  const page=a.call('getPageDef',view.section),width=page.width-page.marginLeft-page.marginRight;
  if(![page.width,page.marginLeft,page.marginRight,width].every(n=>Number.isSafeInteger(n)&&n>=0)||width<=0||page.landscape||page.marginGutter!==0)throw Error('현재 용지의 단 너비 계약이 미확인입니다. 설정을 유지합니다.');
  const available=(width-c.spacing*(c.count-1))/c.count;
  if(available<=0)throw Error('단 간격이 본문 너비를 초과합니다.');
  for(const row of a.call<any[]>('getControls').filter(c=>c.list===0&&['tbl','gso'].includes(c.ctrlId))){
    const props=row.props;
    if(props?.Lock||props?.TreatAsChar!==1||!Number.isFinite(props.Width)||props.Width<=0)throw Error('보호·부동 개체가 있는 다단 변경은 미검증입니다. 기존 배치를 유지합니다.');
    const extra=row.ctrlId==='tbl'?a.call('getTableProperties',view.section,row.para,row.controlIndex):{outerLeft:0,outerRight:0};
    if(![extra.outerLeft,extra.outerRight].every(n=>Number.isFinite(n)&&n>=0)||props.Width+extra.outerLeft+extra.outerRight>available)throw Error('기존 표·그림이 변경 후 단 너비를 넘습니다. 개체 크기를 자동 보정하지 않습니다.');
  }
  return()=>{
    a.call('setColumnDef',view.section,c.count,0,1,c.spacing);
    const after=columnView(a,view.section),expected={...view,columnCount:c.count,spacing:c.spacing};
    if(JSON.stringify(after)!==JSON.stringify(expected))throw Error('단 설정의 실제 재조회가 일치하지 않습니다.');
    return copy(s);
  };
}
