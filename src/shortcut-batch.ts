import type { RhwpAdapter } from './adapter.js';
import { nested, paraIndex, withPara, samePosition, type Position, type Selection } from './model.js';
import { wordPosition } from './word-navigation.js';
import { paragraphPosition } from './paragraph-navigation.js';
import { listPlan } from './paragraph-lists.js';

// Existing list/caret queries only; no virtual scalar or cross-owner fallback.
export function wordAcrossPosition(a: RhwpAdapter,p: Position,direction: -1|1): Position {
  const local=wordPosition(a,p,direction);
  if(!samePosition(local,p))return local;
  const at=paraIndex(p)+direction;
  if(at<0||at>=a.count(p))return {...p};
  const start=paragraphPosition(a,p,direction);
  const target=direction>0?start:{...withPara(p,at),offset:a.length(start)};
  // Validate the preceding paragraph through the same Core word oracle.
  wordPosition(a,target,direction);a.validate(target);return target;
}
export function paragraphStepPlan(a:RhwpAdapter,targets:{p:Position}[],type:'list-level'|'line-spacing-step',direction:-1|1,
  checkEditable:(p:Position)=>void=p=>a.assertEditable(p)) {
  const catalog=type==='list-level'?a.paragraphListCatalog():undefined;
  return targets.map(({p})=>{
    checkEditable(p);
    const raw=a.paraProps(p);
    if(type==='list-level') {
      if(nested(p))throw Error('중첩 셀 문단 번호 변경은 기존 미지원 경계를 유지합니다.');
      if(!['Number','Outline'].includes(String(raw.headType)))throw Error('문단 번호·개요를 적용한 문단에서만 수준을 변경합니다. 글머리표·미조회 값은 유지합니다.');
      const level=Number(raw.paraLevel),next=level+direction;
      if(!Number.isSafeInteger(level))throw Error('문단 번호 수준을 조회할 수 없습니다.');
      if(next<0||next>6)return {p,props:{}};
      return {p,props:listPlan(raw,{level:next},catalog!).props};
    }
    // Native shortcut step is 10 percentage points, never a pt conversion.
    if(raw.lineSpacingType!=='Percent'||typeof raw.lineSpacing!=='number'||!Number.isFinite(raw.lineSpacing))
      throw Error('줄 간격 증감은 조회된 글자에 따라(%) 문단에서만 지원합니다. 고정/여백/미조회 값은 유지합니다.');
    const next=raw.lineSpacing+10*direction;
    if(next<=0||next>500)throw Error('줄 간격 범위를 벗어나 선택 전체의 변경을 취소했습니다.');
    return {p,props:{lineSpacing:next}};
  }).filter(t=>Object.keys(t.props).length);
}
export function textSelection(s:Selection) {
  if(s.kind!=='caret'&&s.kind!=='text')throw Error('본문·셀 텍스트 커서/선택에서 사용하세요. 기존 선택은 유지합니다.');
  return s;
}
