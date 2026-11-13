import {bodyParagraphOwners} from './adapter-position.js';
import { coreRuntimeHasCapability } from './core-runtime.js';
import type { RhwpAdapter } from './adapter.js';
import { copy, type Selection } from './model.js';

export type ShapeTarget = { sec: number; para: number; control: number; instanceId: number; scInstId: number };
// Line color is the existing Core COLORREF/BGR integer; width is integer HU.
export type ShapeSize = { target: ShapeTarget; width: number; height: number; borderColor?: number; borderWidth?: number; lineType?: number; roundRate?: number; fillBgColor?: number };
// The existing rectangle renderer and HWPX parser/writer agree on these codes.
// Other stored codes remain readable and are never silently mapped to solid.
export const shapeLineTypes = [[0,'없음'],[1,'실선'],[2,'파선'],[3,'점선'],[4,'일점쇄선'],[5,'이점쇄선']] as const;
export function editableShapeLineType(p: Record<string, any>): boolean {
  return shapeLineTypes.some(([v])=>v===p.lineType) && Number.isInteger(p.borderAttr) &&
    p.borderAttr >= 0 && p.borderAttr <= 0xffffffff && (p.borderAttr & 0x3f) === p.lineType;
}

// The existing rectangle paint consumes radius percent up to the semicircle (50%).
// Larger stored values are not normalized back into the document by the UI.
export function editableShapeRoundRate(p: Record<string, any>) {
  return Number.isInteger(p.roundRate) && p.roundRate >= 0 && p.roundRate <= 50;
}

// getObjects identifies Control::Shape; never probe picture/OLE/table controls
// with a shape setter. Its paragraph index spans all sections.
export function shapeCatalog(a: RhwpAdapter) {
  const body = bodyParagraphOwners(a);
  const controls = a.call<any[]>('getControls');
  return a.call<any[]>('getObjects').filter(o => o.kind === 'shape').map(o => {
    const p = body[o.para];
    if (!p || !Number.isInteger(o.controlIndex)) throw Error('개체 위치를 확인할 수 없습니다.');
    const c = controls.find(c => c.list === 0 && c.para === o.para && c.controlIndex === o.controlIndex);
    if (!c || c.ctrlId !== 'gso') throw Error('개체 종류를 확인할 수 없습니다.');
    const props = a.call('getShapeProperties', p.sec, p.para, o.controlIndex);
    const target: ShapeTarget = { ...p, control: o.controlIndex, instanceId: props.instanceId, scInstId: props.scInstId };
    const reason = shapeReason(a, props, !!c.props?.Lock);
    return { target, props, reason, name: typeof props.tbVerticalAlign === 'string' ? '글상자' : Object.hasOwn(props, 'roundRate') ? '사각형' : '미지원 도형' };
  });
}

function shapeReason(a: RhwpAdapter, p: Record<string, any>, locked: boolean) {
  if (locked || p.sizeProtect) return '보호된 개체의 크기는 변경할 수 없습니다.';
  // roundRate is returned only for Rectangle, including its textbox variant.
  // Groups/lines/curves and other unknown shapes retain their original content.
  if (!Object.hasOwn(p, 'roundRate')) return '현재는 본문의 일반 사각형 크기만 지원합니다.';
  if (Object.hasOwn(p, 'tbVerticalAlign')) {
    if (!coreRuntimeHasCapability(a.doc, 'textbox')) return '글상자 내부 폭 보존을 검증한 개발 Core가 아닙니다. 기존 글상자를 유지합니다.';
    if (p.treatAsChar !== false || p.textWrap !== 'InFrontOfText') return '글상자는 본문 글 앞으로 배치의 크기 늘리기만 지원합니다. 기존 배치는 유지합니다.';
  }
  if (p.hasCaption) return '캡션이 있는 개체는 보존만 지원합니다.';
  if (p.rotationAngle || p.horzFlip || p.vertFlip) return '회전·대칭 개체 크기 변경은 미지원입니다.';
  if (![p.instanceId, p.scInstId].every(Number.isSafeInteger) ||
      ![p.width, p.height].every(n => Number.isInteger(n) && n >= 200 && n <= 72000))
    return '개체 식별자 또는 크기가 지원 범위 밖입니다.';
  return '';
}

export function prepareShapeSize(a: RhwpAdapter, s: Selection, change: ShapeSize): (() => Selection) | undefined {
  const t = change.target;
  if (!t || ![t.sec, t.para, t.control, t.instanceId, t.scInstId].every(n => Number.isSafeInteger(n) && n >= 0))
    throw Error('잘못된 개체 대상입니다.');
  if (Object.keys(change).some(k => !['target', 'width', 'height', 'borderColor', 'borderWidth', 'lineType', 'roundRate', 'fillBgColor'].includes(k))) throw Error('지원하지 않는 개체 속성입니다.');
  if (!['caret','object'].includes(s.kind) || s.focus.kind !== 'body' || s.focus.sec !== t.sec || s.focus.para !== t.para || (s.kind === 'object' && s.control !== t.control))
    throw Error('본문 개체의 소유 문단에서 다시 선택하세요. 셀·범위 편집은 미지원입니다.');
  a.assertEditable(s.focus);
  const row = shapeCatalog(a).find(r => r.target.sec === t.sec && r.target.para === t.para && r.target.control === t.control);
  if (!row || row.target.instanceId !== t.instanceId || row.target.scInstId !== t.scInstId)
    throw Error('개체 대상이 변경되었습니다. 다시 여세요.');
  if (row.reason) throw Error(row.reason);
  for (const n of [change.width, change.height])
    if (!Number.isInteger(n) || n < 200 || n > 72000) throw Error('개체 크기는 2~720pt 범위입니다.');
  if (Object.hasOwn(row.props, 'tbVerticalAlign') && (change.width < row.props.width || change.height < row.props.height)) throw Error('글상자 축소는 내용 보존 검증 전 미지원입니다. 현재 크기를 유지하세요.');
  const props: Record<string, number> = {};
  if (change.width !== row.props.width) props.width = change.width;
  if (change.height !== row.props.height) props.height = change.height;
  for (const name of ['borderColor','borderWidth'] as const) if (change[name] !== undefined) {
    const value = change[name]!;
    if (row.name !== '글상자' || !Number.isInteger(row.props[name]) || row.props[name] < 0 ||
        row.props[name] > (name === 'borderColor' ? 0xffffff : 7200))
      throw Error('이 개체의 선 속성은 조회·변경 범위가 확인되지 않았습니다. 원본을 유지합니다.');
    if (!Number.isInteger(value) || value < 0 || value > (name === 'borderColor' ? 0xffffff : 7200))
      throw Error(name === 'borderColor' ? '선 색은 #RRGGBB로 입력하세요.' : '선 굵기는 0~25.4mm 범위입니다.');
    if (value !== row.props[name]) props[name] = value;
  }
  if (change.lineType !== undefined) {
    if (row.name !== '글상자' || !editableShapeLineType(row.props))
      throw Error('이 개체의 선 종류는 조회·변경 범위가 확인되지 않았습니다. 원본을 유지합니다.');
    if (!shapeLineTypes.some(([v])=>v===change.lineType)) throw Error('지원하는 선 종류를 선택하세요.');
    if (change.lineType !== row.props.lineType) props.lineType = change.lineType;
  }
  if (change.roundRate !== undefined) {
    if (row.name !== '글상자' || !editableShapeRoundRate(row.props))
      throw Error('이 개체의 곡률은 조회·변경 범위가 확인되지 않았습니다. 원본을 유지합니다.');
    if (!Number.isInteger(change.roundRate) || change.roundRate < 0 || change.roundRate > 50)
      throw Error('곡률은 0~50% 정수로 입력하세요.');
    if (change.roundRate !== row.props.roundRate) props.roundRate = change.roundRate;
  }
  if(change.fillBgColor!==undefined){
    if(row.name!=='글상자'||row.props.fillType!=='solid'||row.props.fillPatType!==-1||!Number.isInteger(row.props.fillBgColor)||row.props.fillBgColor<0||row.props.fillBgColor>0xffffff)throw Error('무늬 없는 단색 글상자 배경만 변경합니다. 나머지 채우기는 원본을 유지합니다.');
    if(!Number.isInteger(change.fillBgColor)||change.fillBgColor<0||change.fillBgColor>0xffffff)throw Error('배경색은 #RRGGBB로 입력하세요.');
    if(change.fillBgColor!==row.props.fillBgColor)props.fillBgColor=change.fillBgColor;
  }
  if (!Object.keys(props).length) return;
  return () => {
    a.call('setShapeProperties', t.sec, t.para, t.control, JSON.stringify(props));
    const after = a.call('getShapeProperties', t.sec, t.para, t.control);
    const expected = { ...row.props, ...props };
    // lineType occupies only bits0..5; all cap/arrow/fill bits must stay exact.
    if (props.lineType !== undefined) expected.borderAttr = ((row.props.borderAttr & ~0x3f) | props.lineType) >>> 0;
    if (Object.entries(props).some(([k,v]) => after[k] !== v) ||
        Object.keys(expected).some(k => JSON.stringify(expected[k]) !== JSON.stringify(after[k])))
      throw Error('개체 크기·선 또는 보존 속성 재조회가 일치하지 않습니다.');
    return copy(s);
  };
}

// Empty body textbox insertion only; no content editor, placement or new Core API.
export type TextboxInsert = { width: number; height: number; inline?: true };
export function textboxInsertReason(a: RhwpAdapter, s: Selection): string {
  try {
    if (!coreRuntimeHasCapability(a.doc, 'textbox')) throw Error('글상자 저장 보존을 검증한 개발 Core가 아닙니다.');
    if (s.kind !== 'caret' || s.focus.kind !== 'body') throw Error('본문 입력 위치에서 글상자를 넣으세요. 셀·범위·개체 선택은 미지원입니다.');
    a.validate(s.focus); a.assertEditable(s.focus);
    const p = s.focus, para = p.para + Array.from({ length:p.sec }, (_,sec)=>a.doc.getParagraphCount(sec)).reduce((x,y)=>x+y,0);
    if (a.call<any[]>('getControls').some(c=>c.list===0 && c.para===para && !['secd','cold'].includes(c.ctrlId)))
      throw Error('다른 개체·필드가 없는 본문 문단에서 넣으세요. 기존 개체는 유지합니다.');
    return '';
  } catch(error) { return String(error).replace(/^Error: /,''); }
}
export function shapeSizeHu(text: string): number {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) throw Error('크기는 소수 둘째 자리까지 pt 단위로 입력하세요.');
  const [whole, fraction=''] = text.split('.'), hu=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(hu) || hu<200 || hu>72000) throw Error('개체 크기는 2~720pt 범위입니다.');
  return hu;
}
export function prepareTextboxInsert(a: RhwpAdapter, s: Selection, change: TextboxInsert): ()=>Selection {
  const reason=textboxInsertReason(a,s); if(reason)throw Error(reason);
  if (!change || Object.keys(change).some(k=>!['width','height','inline'].includes(k)) ||
      ![change.width,change.height].every(n=>Number.isSafeInteger(n)&&n>=200&&n<=72000) || change.width<=1020)
    throw Error('빈 글상자의 너비는 10.2pt 초과, 높이는 2~720pt로 입력하세요.');
  if(change.inline!==undefined&&change.inline!==true)throw Error('글상자의 글자처럼 취급 값이 올바르지 않습니다.');
  const p=copy(s.focus), before=shapeCatalog(a);
  return ()=>{
    const r=a.call('createShapeControl',JSON.stringify({sectionIdx:p.sec,paraIdx:p.para,charOffset:a.textOffset(p),shapeType:'textbox',width:change.width,height:change.height,treatAsChar:change.inline===true,textWrap:change.inline?'Square':'InFrontOfText'}));
    if(r.ok!==true || r.paraIdx!==p.para || !Number.isSafeInteger(r.controlIdx)) throw Error('글상자 삽입 대상을 확인할 수 없습니다.');
    const rows=shapeCatalog(a), row=rows.find(v=>v.target.sec===p.sec&&v.target.para===r.paraIdx&&v.target.control===r.controlIdx);
    if(rows.length!==before.length+1 || !row || (!change.inline&&row.reason) || row.name!=='글상자' || row.props.width!==change.width || row.props.height!==change.height || row.props.treatAsChar!==(change.inline===true) || row.props.textWrap!==(change.inline?'Square':'InFrontOfText'))
      throw Error('삽입한 글상자의 종류·크기 재조회가 일치하지 않습니다.');
    return copy(s);
  };
}
