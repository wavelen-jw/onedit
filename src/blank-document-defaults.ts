import type { RhwpAdapter } from './adapter.js';
import { toCoreCharacter } from './formatting.js';
// New-document defaults only, in HWPUNIT (7200 per inch), rounded from mm.
const pageMargins = {
  marginTop: 4252, marginBottom: 4252, // 15 mm
  marginLeft: 5669, marginRight: 5669, // 20 mm
  marginHeader: 2835, marginFooter: 2835, // 10 mm
  marginGutter: 0,
} as const;
/** Only a newly-created, isolated blank document. Never run on opened bytes. */
export function initializeBlankDocument(adapter: RhwpAdapter) {
  const p = {kind:'body',sec:0,para:0,offset:0} as const;
  if (adapter.doc.getParagraphCount(0) !== 1 || adapter.text(p) !== '')
    throw Error('빈 문서 기본 서식의 대상이 다릅니다.');
  adapter.call('setPageDef', 0, JSON.stringify(pageMargins));
  const actual = adapter.call<Record<string, number>>('getPageDef', 0);
  if (Object.entries(pageMargins).some(([key, value]) => actual[key] !== value))
    throw Error('새 문서의 용지 여백 기본값이 일치하지 않습니다.');
  adapter.format(p, 0, toCoreCharacter({fontFamily:'함초롬바탕',fontSize:15}));
}
