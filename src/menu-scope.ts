// User's final 2026-10-16 19:34 decision. Scope is not a Core capability:
// retained/unselected entries must never be presented as implemented support.
export const excludedMenuIds: readonly string[] = Object.freeze([
  'F03','F04','F05','F06','F07','F12','F13','F14','F16','F17','F18','F19','F20',
  'E06','E12','E13','E14','E15','E17','E18',
  'V11','V12','V13','V14','V15','V16','V17','V18','V19','V20',
  'I03','I04','I05','I07','I09','I11','I13','I14','I15','I17','I18','I20','I21','I27','I28','I29','I30','I31','I32','I34','I36','I37','I38',
  'N08','N09','L02','L14','L15','L16','L17','T06','T30','O25','O26',
  'S02','S03','S04','S05','S06','R01','R02','R03','R04','R05','R06',
  'U01','U02','U03','U04','U05','U06','U07','U08','U09','U10','U11','U12','U13','U14','U15','U16','U18','U19','U20','U23',
]);
// Latest explicit manual exclusions, kept separate from the original95 IDs.
export const manuallyExcludedMenuIds: readonly string[] = Object.freeze([
  'HK034','HK041','HK075','HK078','HK087','HK097','HK098','HK204','HK205',
  'HK206','HK207','HK230','HK231','HK232','HK233','HK323','HK329',
]);
export type ScopePart = 'menu-settings' | 'shortcut-settings' | 'toolbar-settings';
export function menuScope(id: string, part?: ScopePart): 'excluded' | 'retained' | 'unclassified' {
  if (id === 'U24') return part === 'toolbar-settings' ? 'excluded'
    : part === 'menu-settings' || part === 'shortcut-settings' ? 'retained' : 'unclassified';
  if (excludedMenuIds.includes(id) || manuallyExcludedMenuIds.includes(id)) return 'excluded';
  // 2026-10-19 08:35 explicit inclusion of this existing editor command only.
  // The 272-choice source ID is not asserted from an absent catalog row.
  return ['R07','I35','V07','format-copy'].includes(id) ? 'retained' : 'unclassified';
}
export function excludedMenuReason(id: string, part?: ScopePart): string {
  return menuScope(id, part) === 'excluded'
    ? '사용자 결정으로 제공하지 않는 기능입니다. 문서에 저장된 기존 내용과 설정은 유지합니다.' : '';
}

// Only bind exact, reviewed menu entries. No label substring matching or
// parent-category filtering that could remove retained common functions.
export function unavailableMenuButton(doc: Document, id: string, label: string, unsupported: string,
  part?: ScopePart): HTMLButtonElement {
  const b = doc.createElement('button'), excluded = excludedMenuReason(id, part);
  b.type = 'button'; b.disabled = true; b.dataset.menuScopeId = id;
  if (part) b.dataset.menuScopePart = part;
  b.dataset.menuScope = menuScope(id, part);
  b.textContent = label + (excluded ? ' · 제공 안 함' : ' · 미지원');
  b.title = excluded || unsupported;
  b.setAttribute('aria-disabled', 'true');
  b.setAttribute('aria-description', b.title);
  return b;
}
