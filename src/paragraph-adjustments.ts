import type { RhwpAdapter } from './adapter.js';
import { nested, paraIndex, type Position, type Props, type Command } from './model.js';
import type { FormatState } from './formatting.js';

export const paragraphAdjustmentGroup = '여백·들여쓰기 증감';
// Existing Ctrl+Shift+Backquote behavior: a fixed value, not a relative step.
export const hangingIndentCommand: Command = { type: 'paragraph', props: { indent: -2000 } };
export type ParagraphAdjustment = { metric: 'indent' | 'marginLeft' | 'marginRight'; direction: 1 | -1 };
export const paragraphAdjustmentItems = (['indent', 'marginLeft', 'marginRight'] as const).flatMap((metric, index) =>
  ([1, -1] as const).map(direction => ({ metric, direction,
    label: `${['첫 줄 들여쓰기', '왼쪽 여백', '오른쪽 여백'][index]} ${direction === 1 ? '늘리기 (+1pt)' : '줄이기 (−1pt)'}` })));

// getParaPropertiesAt rounds to 0.1px. The existing ParaShape parameter set
// exposes exact native values; never reconstruct a mixed paragraph from that display.
export function paragraphAdjustmentRaw(a: RhwpAdapter, p: Position): Props {
  a.validate(p);
  if(typeof a.doc.getParaShapeSet !== "function") throw Error("NOT_SUPPORTED: 정확한 문단 여백 조회 API가 없습니다.");
  if (nested(p)) throw Error('중첩 셀의 상대 여백 조절은 미검증입니다. 기존 문단 모양을 사용하세요.');
  let list = 0, para = p.para;
  if (p.kind === 'body') {
    for (let sec = 0; sec < p.sec; sec++) para += a.doc.getParagraphCount(sec);
  } else { list = a.list(p).listId; para = paraIndex(p); }
  return a.call('getParaShapeSet', list, para);
}

export function prepareParagraphAdjustment(a: RhwpAdapter, targets: {p: Position}[], change: ParagraphAdjustment,
  checkEditable: (p:Position)=>void = p=>a.assertEditable(p)) {
  if (!change || Object.keys(change).some(k => !['metric','direction'].includes(k)) ||
      !['indent','marginLeft','marginRight'].includes(change.metric) || ![1,-1].includes(change.direction))
    throw Error('문단 여백 증감 요청을 확인하세요.');
  const key = { indent: 'Indentation', marginLeft: 'LeftMargin', marginRight: 'RightMargin' }[change.metric];
  return targets.map(({p}) => {
    checkEditable(p);
    const old = paragraphAdjustmentRaw(a, p)[key], min = change.metric === 'indent' ? -40000 : 0, max = 200000;
    const next = Number(old) + change.direction * 200; // Existing paragraph IR: 200 units/pt.
    if (typeof old !== 'number' || !Number.isSafeInteger(old) || old < min || old > max || next < min || next > max)
      throw Error('문단 여백 범위를 벗어나 선택 전체의 증감을 취소했습니다. 여백 0~1000pt, 첫 줄 −200~1000pt.');
    return { p, props: { [change.metric]: next }, key, expected: next };
  });
}

// A draft only. The shared dialog commits the chosen operation once, or discards it.
export function mountParagraphAdjustments(container: HTMLElement, state: FormatState) {
  const panel = document.createElement('div');
  const note = document.createElement('p');note.textContent = '각 문단의 원래 값에 1pt씩 증감합니다. 다른 필드 변경과는 따로 적용하세요. 표시값은 근사치이며 계산에는 Core 원시값을 사용합니다.';
  const choice = document.createElement('select');choice.name = 'paragraphAdjustment';
  choice.add(new Option('증감 없음 / 유지', ''));
  paragraphAdjustmentItems.forEach((item, n) => choice.add(new Option(item.label, String(n))));
  const label = document.createElement('label');label.append(document.createTextNode('문단 여백·첫 줄 증감'),choice);
  panel.append(note,label);
  for (const [metric, title] of [['indent','첫 줄'],['marginLeft','왼쪽 여백'],['marginRight','오른쪽 여백']]) {
    const value = document.createElement('p');value.textContent = `${title}: ${state[metric] === undefined ? '혼합 / 유지' : state[metric] + 'pt (근사 표시)'}`;panel.append(value);
  }
  container.append(panel);
  return { panel, read: (): ParagraphAdjustment | undefined => {
    if (choice.value === '') return;
    const item = paragraphAdjustmentItems[Number(choice.value)];
    if (!item || String(Number(choice.value)) !== choice.value) throw Error('문단 증감 방식을 선택하세요.');
    return {metric:item.metric,direction:item.direction};
  }};
}
