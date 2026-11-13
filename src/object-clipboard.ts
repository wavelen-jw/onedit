import {bodyParagraphOwners} from './adapter-position.js';
import type { RhwpAdapter } from './adapter.js';
import type { Selection } from './model.js';

// Exact live body owner/index only. These getters do not all expose persistent
// object IDs. Core owns the closed fragment graph, ID remap and resource checks.
export function bodyClipboardObjects(a: RhwpAdapter) {
  const positions = bodyParagraphOwners(a);
  return a.call<any[]>('getControls').filter(c => c.list === 0 && c.ctrlId === 'gso').flatMap(c => {
    const p = positions[c.para];
    if (!p) return [];
    let kind: 'picture' | 'textbox' | 'shape', props: Record<string, any>;
    try {
      props = a.call('getPictureProperties', p.sec, p.para, c.controlIndex);
      kind = 'picture';
    } catch {
      try {
        props = a.call('getShapeProperties', p.sec, p.para, c.controlIndex);
        // The getter and deleteShapeControl resolve the same existing Shape
        // variant. A group has no Rectangle-only roundRate/textbox fields.
        kind = Object.hasOwn(props, 'roundRate') && Object.hasOwn(props, 'tbVerticalAlign') ? 'textbox' : 'shape';
      } catch { return []; }
    }
    const textAnchor = a.call<number[]>('getControlTextPositions', p.sec, p.para)[c.controlIndex];
    if (!Number.isSafeInteger(textAnchor) || textAnchor < 0)
      throw Error('개체의 본문 문자 위치를 확인할 수 없습니다.');
    const anchor = a.doc.textToLogicalOffset(p.sec, p.para, textAnchor);
    return [{ ...p, control: c.controlIndex, anchor, kind, props, locked: !!c.props?.Lock }];
  });
}
export function selectedClipboardObject(a: RhwpAdapter, s: Selection) {
  if (s.kind !== 'object' || s.focus.kind !== 'body')
    throw Error('본문 그림·글상자·그룹 등 기존 개체 한 개를 선택하세요.');
  a.validate(s.focus);
  const row = bodyClipboardObjects(a).find(r => r.sec === s.focus.sec && r.para === s.focus.para && r.control === s.control);
  if (!row || !Number.isSafeInteger(row.anchor))
    throw Error('선택한 개체가 현재 본문에 없습니다.');
  if (row.locked) throw Error('보호된 개체입니다.');
  return row;
}

// Cell owners must have table-only ancestry. The catalog's typed getters admit
// actual Picture/Shape slots, not arbitrary descendant lists or controls.
export function selectedCutObject(a: RhwpAdapter, s: Selection) {
  if (s.focus.kind === 'body') return selectedClipboardObject(a, s);
  const row = selectedFragmentObject(a, s);
  if (row.focus.kind !== 'cell') throw Error('표 셀의 개체 한 개를 선택하세요.');
  a.assertEditable(row.focus);
  const target = a.captureParagraph(row.focus);
  return row.kind === '그림' ? { cellPicture: row, target } : { cellShape: row, target };
}
export type ClipboardObjectSource = ReturnType<typeof selectedCutObject>;

// Called only after the shared OS write succeeds. Revalidate the captured live
// owner/slot and properties; equal geometry is not a persistent object ID.
export function prepareObjectCut(a: RhwpAdapter, s: Selection, source: ClipboardObjectSource): () => Selection {
  if ('target' in source) return prepareCellObjectCut(a, s, source);
  a.assertEditable(s.focus);
  const row = selectedClipboardObject(a, s);
  if (JSON.stringify(row) !== JSON.stringify(source))
    throw Error('잘라낼 개체가 변경되었습니다. 다시 선택하세요.');
  const before = bodyClipboardObjects(a);
  const expected = before.filter(r => r.sec !== row.sec || r.para !== row.para || r.control !== row.control).map(r => {
    if (r.sec !== row.sec || r.para !== row.para) return r;
    return { ...r, control: r.control > row.control ? r.control - 1 : r.control,
      anchor: row.props.treatAsChar && r.anchor > row.anchor ? r.anchor - 1 : r.anchor };
  });
  return () => {
    a.call(row.kind === 'picture' ? 'deletePictureControl' : 'deleteShapeControl', row.sec, row.para, row.control);
    if (JSON.stringify(bodyClipboardObjects(a)) !== JSON.stringify(expected))
      throw Error('개체 삭제 후 이웃 개체가 달라져 잘라내기를 취소했습니다.');
    const focus = { kind: 'body' as const, sec: row.sec, para: row.para, offset: row.anchor };
    a.validate(focus);
    a.exportChecked();
    return { kind: 'caret', focus };
  };
}

function prepareCellObjectCut(a: RhwpAdapter, s: Selection, source: Extract<ClipboardObjectSource, {target: unknown}>): () => Selection {
  const current = selectedCutObject(a, s);
  if (!('target' in current) || JSON.stringify(current) !== JSON.stringify(source))
    throw Error('잘라낼 셀 개체가 변경되었습니다. 다시 선택하세요.');
  a.resolveParagraph(source.target);
  const row = current.cellPicture ?? current.cellShape!, owner = JSON.parse(row.path);
  const before = fragmentClipboardObjects(a);
  const expected = before.filter(r => !(r.sec === row.sec && r.para === row.para && r.path === row.path && r.control === row.control)).map(r => {
    if (r.sec !== row.sec || r.para !== row.para || r.focus.kind !== 'cell') return r;
    if (r.path === row.path) return {...r, control: r.control > row.control ? r.control - 1 : r.control};
    const path = JSON.parse(r.path);
    if (path.length <= owner.length || JSON.stringify(path.slice(0, owner.length)) !== JSON.stringify(owner)) return r;
    // A following nested table's slot shifts too; its text and owner remain the
    // same. Cell character indices exclude the removed 8-unit control gap.
    if (path[owner.length].controlIndex > row.control) path[owner.length].controlIndex--;
    const focus = a.fromPath(r.sec, r.para, path, r.anchor);
    return {...r, path: a.path(focus), focus};
  });
  return () => {
    if (current.cellPicture) {
      a.call('deleteCellPictureControlByPath', row.sec, row.para, row.path, row.control);
    } else {
      // Numeric list IDs are transient. Resolve the captured paragraph identity
      // and exact live selection again, then obtain its current ID immediately
      // before mutation. Neither clipboard bytes nor History store a list ID.
      const target = a.resolveParagraph(source.target);
      const focus = a.fromPath(target.sectionIndex, target.parentParaIndex, target.path, row.anchor);
      const pathKey = (path: string) => JSON.stringify(JSON.parse(path).map((p: any) => [p.controlIndex, p.cellIndex, p.cellParaIndex]));
      if (focus.sec !== row.sec || focus.para !== row.para || pathKey(a.path(focus)) !== pathKey(row.path) ||
          JSON.stringify(selectedFragmentObject(a, s)) !== JSON.stringify(row))
        throw Error('잘라낼 셀 소유 문단이나 개체가 변경되었습니다.');
      const listId = a.list(focus).listId;
      a.call('deleteControlAt', listId, row.focus.kind === 'cell' ? row.focus.cellPara : -1, row.control);
    }
    if (JSON.stringify(fragmentClipboardObjects(a)) !== JSON.stringify(expected))
      throw Error('셀 개체 삭제 후 이웃 개체가 달라져 잘라내기를 취소했습니다.');
    const focus = {...row.focus, offset: row.anchor};
    a.validate(focus);
    a.exportChecked();
    return {kind: 'caret', focus};
  };
}

// Separate copy catalog: keep the accepted body cut deletion contract above
// unchanged. Every cell owner is resolved from Core's actual list ancestry.
export function fragmentClipboardObjects(a: RhwpAdapter) {
  const roots=bodyParagraphOwners(a);
  const lists=a.call<any>('getCursorModel').lists as any[];
  const locate=(list:number,para:number,seen=new Set<number>()):import('./model.js').Position|undefined=>{
    if(list===0){const p=roots[para];return p?{kind:'body',...p,offset:0}:undefined;}
    const e=lists.find(e=>e.listId===list);
    if(!e?.isCell||seen.has(list)||seen.size>=12)return;
    seen.add(list);
    const parent=e.hostListId===0?{kind:'body' as const,sec:e.sectionIndex,para:e.hostPara,offset:0}:locate(e.hostListId,e.hostPara,seen);
    if(!parent)return;
    const path=parent.kind==='cell'?JSON.parse(a.path(parent)):[];
    return a.fromPath(parent.sec,parent.para,[...path,{controlIndex:e.controlIndex,cellIndex:e.cellIndex,cellParaIndex:para}],0);
  };
  return a.call<any[]>('getControls').filter(c=>c.ctrlId==='gso').flatMap(c=>{
    const focus=locate(c.list,c.para);if(!focus)return[];
    const path=focus.kind==='cell'?a.path(focus):'[]';
    let props:Record<string,any>,kind:string;
    try{props=focus.kind==='cell'?a.call('getCellPicturePropertiesByPath',focus.sec,focus.para,path,c.controlIndex):a.call('getPictureProperties',focus.sec,focus.para,c.controlIndex);kind='그림';}
    catch{try{props=focus.kind==='cell'?a.call('getCellShapePropertiesByPath',focus.sec,focus.para,path,c.controlIndex):a.call('getShapeProperties',focus.sec,focus.para,c.controlIndex);kind=c.userDesc||'개체';}catch{return[];}}
    const textAnchor=focus.kind==='cell'?a.call<any>('getCharIndexAtStreamPos',c.list,c.para,c.pos).charIndex:a.call<number[]>('getControlTextPositions',focus.sec,focus.para)[c.controlIndex];
    const anchor=focus.kind==='cell'?textAnchor:a.doc.textToLogicalOffset(focus.sec,focus.para,textAnchor);
    if(!Number.isSafeInteger(anchor)||anchor<0||anchor>a.length(focus))throw Error('개체의 정확한 문자 경계를 확인할 수 없습니다.');
    const at={...focus,offset:anchor};a.validate(at);
    return [{focus:at,path,sec:focus.sec,para:focus.para,control:c.controlIndex,anchor,kind,props,locked:!!c.props?.Lock}];
  });
}
export function selectedFragmentObject(a:RhwpAdapter,s:Selection){
  if(s.kind!=='object')throw Error('복사할 개체 한 개를 선택하세요.');
  a.validate(s.focus);
  const path=s.focus.kind==='cell'?a.path(s.focus):'[]';
  // Persistent Core paths and UI paths may serialize their keys in a different
  // order. Compare the actual path coordinates, not JSON property order.
  const key=(path:string)=>JSON.stringify(JSON.parse(path).map((p:any)=>[p.controlIndex,p.cellIndex,p.cellParaIndex]));
  const row=fragmentClipboardObjects(a).find(r=>r.sec===s.focus.sec&&r.para===s.focus.para&&key(r.path)===key(path)&&r.control===s.control);
  if(!row)throw Error('선택한 개체가 현재 소유 문단에 없습니다.');
  if(row.locked)throw Error('보호된 개체입니다.');
  if(row.kind==='차트')throw Error('표차트는 사용자 제외 범위입니다.');
  return row;
}

// Existing closed graph capture is also a preservation projection for objects
// whose descendants have no editable table-only Position. It does not grant
// those descendants a synthetic cell path or an editing capability.
export function captureFragmentObject(a:RhwpAdapter,row:ReturnType<typeof fragmentClipboardObjects>[number]){
  a.call('copyControl',row.sec,row.para,row.path,row.control);
  if(row.focus.kind==='cell'){
    const target=a.clipboardTarget(row.focus),p=row.focus.cellPara;
    return a.doc.captureNestedClipboard(row.sec,row.para,row.path,target.expectedTargetId,JSON.stringify({kind:'paragraphs',startParagraph:p,endParagraph:p,startOffset:row.anchor,endOffset:row.anchor}));
  }
  return a.doc.captureBodyClipboard(row.sec,row.para,row.anchor,row.para,row.anchor+(row.props.treatAsChar?1:0));
}
