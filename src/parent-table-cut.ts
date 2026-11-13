import type {RhwpAdapter} from './adapter.js';
import {cellPath,nested,type Selection} from './model.js';
import {selectedTableObject} from './table-object-command.js';
import {tableCaptureRefusal,UnsupportedTableOperation} from './table-capability.js';

// Only the missing root-object Cut path. Existing cell blocks, child-table Cut,
// normal root-table editing and cohabiting hosts keep their separate contracts.
export function captureParentTableCut(a:RhwpAdapter,s:Selection){
 if(s.kind!=='table'||s.focus.kind!=='cell'||nested(s.focus))return;
 const p=s.focus,model=a.call<any>('getCursorModel'),lists=model.lists as any[];
 const owned=new Set(lists.filter(l=>l.isCell&&l.hostListId===0&&l.sectionIndex===p.sec&&l.hostPara===p.para&&l.controlIndex===p.control).map(l=>l.listId));
 const controls=a.call<any[]>('getControls');
 if(!controls.some(c=>c.ctrlId==='tbl'&&owned.has(c.list)))return;
 selectedTableObject(a,s);
 const refusal=tableCaptureRefusal(a,p);if(refusal)throw refusal;
 if(!a.inline(p).some(t=>t.controlIndex===p.control))throw new UnsupportedTableOperation('parent-table-cut-placement','이 부모표 잘라내기는 기존 복사가 지원하는 독립 글자취급 표에서만 지원합니다.');
 for(let size=-1;size!==owned.size;){size=owned.size;for(const l of lists)if(owned.has(l.hostListId))owned.add(l.listId);}
 if(controls.some(c=>owned.has(c.list)&&(c.ctrlId!=='tbl'||c.props?.Lock)))throw new UnsupportedTableOperation('parent-table-cut-descendants','이 부모표 잘라내기는 보호되지 않은 표·텍스트 하위 그래프만 지원합니다.');
 const path=(l:any,seen=new Set<number>()):any[]=>{
  if(seen.has(l.listId)||seen.size>=12)throw Error('표 소유 경로가 순환하거나 너무 깊습니다.');seen.add(l.listId);
  const step={controlIndex:l.controlIndex,cellIndex:l.cellIndex,cellParaIndex:0};
  if(l.hostListId===0)return[step];
  const parent=lists.find(e=>e.listId===l.hostListId);if(!parent?.isCell)throw Error('표의 실제 부모 셀을 확인할 수 없습니다.');
  const prefix=path(parent,seen);prefix[prefix.length-1]={...prefix.at(-1),cellParaIndex:l.hostPara};return[...prefix,step];
 };
 for(const l of lists.filter(l=>owned.has(l.listId))){
  if(!l.isCell||l.row===undefined)throw Error('표가 아닌 하위 소유자는 이 잘라내기 경로에서 지원하지 않습니다.');
  const q=a.fromPath(p.sec,p.para,path(l),0);a.assertEditable(q);
  if(a.call('getCellPropertiesByPath',p.sec,p.para,a.path(q),l.cellIndex).cellProtect)throw Error('보호된 하위 셀을 포함한 표는 잘라내지 않습니다.');
 }
 const target=a.captureSelection(s),semantic=a.semantic();
 const expected=structuredClone(semantic) as any;
 expected.body.find((v:any)=>v.sec===p.sec&&v.para===p.para).inlineTables=[];
 expected.cells=expected.cells.filter((v:any)=>v.sec!==p.sec||v.para!==p.para);
 expected.tables=expected.tables.filter((v:any)=>v.sec!==p.sec||v.para!==p.para);
 if(expected.nestedCells){expected.nestedCells=expected.nestedCells.filter((v:any)=>v.position.sec!==p.sec||v.position.para!==p.para);if(!expected.nestedCells.length)delete expected.nestedCells;}
 return{target,focus:structuredClone(p),controls,semantic,expected};
}
export type ParentTableCut=NonNullable<ReturnType<typeof captureParentTableCut>>;
export function prepareParentTableCut(a:RhwpAdapter,s:Selection,source:ParentTableCut):()=>Selection{
 const current=captureParentTableCut(a,s);
 if(!current||JSON.stringify(current)!==JSON.stringify(source))throw Error('잘라낼 부모표·소유 문단·내용이 변경되었습니다.');
 a.resolveSelection(source.target);
 return()=>{
  a.call('deleteTableControl',source.focus.sec,source.focus.para,source.focus.control);
  if(JSON.stringify(a.semantic())!==JSON.stringify(source.expected))throw Error('부모표 삭제 후 비대상 내용·서식·소유 그래프가 달라 원문을 복원합니다.');
  const focus={kind:'body' as const,sec:source.focus.sec,para:source.focus.para,offset:0};a.validate(focus);a.exportChecked();
  return{kind:'caret',focus};
 };
}
