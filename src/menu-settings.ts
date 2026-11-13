import { closeEditorDialog, showUtilityDialog } from "./editor-popup-focus.js";
import {activeWorkset} from './active-workset.js';
import {subscribeWhileOpen} from './ui-demand-lifetime.js';
import { browserReplacementPolicy, dialogShortcutHelp } from "./browser-shortcut-scope.js";
import { formatMenuItems, type CatalogCommand } from './integration/a-format-menu.js';
import type { KeyInput, KeyRoute } from './keyboard.js';
import { formatInputGuard, sameFormatTarget } from './integration/a-format-input-guard.js';
import type { Interaction } from './interaction.js';

// A closed catalog of existing Commands. Scope exclusions, styles, clipboard
// permissions and unsupported actions cannot be enabled by a preference.
const ids = ['char-normal','bold','italic','underline','strike','superscript','subscript','normal',
  'left','center','right','justify','distribute','split','list-Number','list-Bullet','list-Outline','list-None'] as const;
// D already exposes list Commands in format-additions rather than the A menu catalog.
const listCommands: {id:string; label:string; command:CatalogCommand; unsupported?:string}[] =
  (['Number','Bullet','Outline','None'] as const).map((mode,i)=>({id:`list-${mode}`,label:['문단 번호 적용','글머리표 적용','개요 번호 적용','번호·글머리표·개요 해제'][i],command:{type:'paragraph-list',list:{mode}}}));
export const configurableCommands = Object.freeze(ids.map(id => {
  const item = formatMenuItems.find(item => item.id === id) ?? listCommands.find(item => item.id === id);
  if (!item) throw Error('기존 명령을 찾을 수 없습니다.');
  if (!item.command || item.unsupported) throw Error('설정할 기존 명령을 확인할 수 없습니다.');
  return Object.freeze({id, label: item.label, command: item.command});
}));
export const additionalShortcuts = Object.freeze(Array.from({length:9}, (_,i) => `Control+Shift+Digit${i+1}`));
type PreferenceRoute = Extract<KeyRoute,{kind:'unsupported'}> | {kind:'command';command:CatalogCommand};
export type MenuPreference = {id:string; visible:boolean; shortcut:string};
export function defaultMenuPreferences(): MenuPreference[] {
  return configurableCommands.map(({id}) => ({id, visible:true, shortcut:''}));
}
export function validateMenuPreferences(value: readonly MenuPreference[]): MenuPreference[] {
  if (!Array.isArray(value) || value.length !== ids.length) throw Error('설정할 명령 목록이 일치하지 않습니다.');
  const seen = new Set<string>(), keys = new Set<string>();
  for (const row of value) {
    if (!row || !ids.some(id => id === row.id) || seen.has(row.id) || typeof row.visible !== 'boolean'
      || typeof row.shortcut !== 'string' || row.shortcut && !additionalShortcuts.includes(row.shortcut))
      throw Error('지원하지 않는 명령·키 조합 또는 중복 명령입니다.');
    if (row.shortcut && keys.has(row.shortcut)) throw Error('같은 추가 단축키를 두 명령에 할당할 수 없습니다.');
    seen.add(row.id); if (row.shortcut) keys.add(row.shortcut);
  }
  return ids.map(id => { const row=value.find(row => row.id===id)!; return {id,visible:row.visible,shortcut:row.shortcut}; });
}

// No localStorage, configuration file, OS hook or remote preference writes.
export class MenuPreferences {
  #rows = defaultMenuPreferences();
  read() { return this.#rows.map(row => ({...row})); }
  apply(rows: readonly MenuPreference[]) { this.#rows = validateMenuPreferences(rows); }
  route(e: KeyInput & {repeat?:boolean}, reason: (id:string)=>string): PreferenceRoute | undefined {
    if (e.isComposing || e.keyCode===229 || e.altGraph || e.repeat || !e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
    const key=`Control+Shift+${e.code}`;
    if (!additionalShortcuts.includes(key)) return;
    const row=this.#rows.find(row => row.shortcut===key); if(!row)return;
    const blocked=reason(row.id);
    return blocked ? {kind:'unsupported',message:blocked}
      : {kind:'command',command:configurableCommands.find(item => item.id===row.id)!.command};
  }
}

export function mountMenuSettings(doc: Document, actions: {
  busy:()=>boolean; reason:(id:string)=>string; capture:()=>ReturnType<Interaction['capture']>;
}) {
  const preferences=new MenuPreferences(), dialog=doc.createElement('dialog'), form=doc.createElement('form');
  form.id='menu-settings-form';
  dialog.id='menu-settings';dialog.className='manager-dialog';dialog.setAttribute('aria-label','이 탭의 메뉴·단축키 설정');
  const heading=doc.createElement('h2');heading.textContent='이 탭의 메뉴·단축키 설정';
  const note=doc.createElement('p');note.className='manager-note';note.textContent='이번 편집 탭에서만 적용합니다. 새로고침하면 기본값으로 돌아갑니다. 서식 메뉴 항목 표시와 추가 단축키만 설정하며 기본 단축키·도구상자·문서는 바꾸지 않습니다. Ctrl+Shift+숫자 1~9 중 중복되지 않는 키를 선택하세요. OS·브라우저가 먼저 사용하는 키는 보장하지 않습니다. Ctrl+N 연속키는 일반 Chrome 탭의 새 창 예약키와 겹치며 Ctrl+K는 검색과 충돌할 수 있습니다. 기존 편의 연속키는 아래 안내를 참고하세요. 추가 키 설정 대상은 아래 목록의 기존 서식 명령이며 그림·글상자·머리말 창은 포함하지 않습니다.';
  note.textContent+=' '+browserReplacementPolicy;
  note.textContent+=' 원키의 문맥별 지원·제한은 도움말의 한/글 단축키 결과표에서 확인하세요. 사용자 추가 키가 원키 연결보다 먼저 적용됩니다.';
  const shortcutHelp=doc.createElement('p');shortcutHelp.className='manager-note';shortcutHelp.dataset.dialogShortcutHelp='';shortcutHelp.textContent=dialogShortcutHelp;
  const help=doc.createElement('details'), helpTitle=doc.createElement('summary');help.className='settings-help';helpTitle.textContent='설정 범위와 단축키 안내';help.append(helpTitle,note,shortcutHelp);
  const brief=doc.createElement('p');brief.className='manager-note';brief.textContent='이 편집 탭에만 적용됩니다. 새로고침하면 기본값으로 돌아갑니다.';
  const tabs=doc.createElement('nav');tabs.className='manager-tabs';tabs.setAttribute('aria-label','설정 종류');
  const panels=[doc.createElement('section'),doc.createElement('section')], controls=new Map<string,{visible:HTMLInputElement;shortcut:HTMLSelectElement}>();
  const status=doc.createElement('p');status.className='manager-status';status.setAttribute('role','status');
  let captured:ReturnType<Interaction['capture']>|undefined;
  const tabButtons=new Map<string,HTMLButtonElement>();
  const activate=(part:string)=>{panels.forEach((p,n)=>p.hidden=part!==(n===0?'menu-settings':'shortcut-settings'));
    for(const[id,b]of tabButtons){b.setAttribute('aria-pressed',String(id===part));}};
  for(const [id,label]of [['menu-settings','메뉴 표시'],['shortcut-settings','추가 단축키']]){
    const b=doc.createElement('button');b.type='button';b.textContent=label;b.dataset.settingsTab=id;b.onclick=()=>activate(id);tabs.append(b);tabButtons.set(id,b);
  }
  panels.forEach((p,n)=>{p.className='settings-fields';p.setAttribute('aria-label',n===0?'서식 메뉴 표시':'기존 명령 추가 단축키');});
  for(const {id,label}of configurableCommands){
    const visible=doc.createElement('input');visible.type='checkbox';visible.name=`visible-${id}`;
    const text=doc.createElement('label');text.className='settings-visible';text.append(visible,doc.createTextNode(label));panels[0].append(text);
    const shortcut=doc.createElement('select');shortcut.name=`shortcut-${id}`;
    for(const value of ['',...additionalShortcuts]){const option=doc.createElement('option');option.value=value;option.textContent=value?value.replace('Control','Ctrl').replace('Digit',''):'추가 키 없음';shortcut.append(option);}
    const field=doc.createElement('label');field.append(doc.createTextNode(label),shortcut);panels[1].append(field);controls.set(id,{visible,shortcut});
  }
  const footer=doc.createElement('div');footer.className='manager-footer';
  const button=(id:string,label:string)=>{const b=doc.createElement('button');b.type='button';b.id=id;b.textContent=label;footer.append(b);return b;};
  const reset=button('menu-settings-reset','기본값 복원'),apply=button('menu-settings-apply','설정'),cancel=button('menu-settings-cancel','취소');apply.type='submit';
  form.append(heading,brief,help,tabs,...panels,status,footer);dialog.append(form);doc.body.append(dialog);
  const guard=formatInputGuard(form), launchers=[...doc.querySelectorAll<HTMLButtonElement>('[data-menu-scope-id="U24"][data-menu-scope-part]:not([data-menu-scope-part="toolbar-settings"])')];
  const draft=(rows:MenuPreference[])=>{for(const row of rows){const c=controls.get(row.id)!;c.visible.checked=row.visible;c.shortcut.value=row.shortcut;}};
  const project=()=>{for(const row of preferences.read()){
    const source=doc.querySelector<HTMLButtonElement>(`[data-format-action="${row.id}"],[data-format-addition="${row.id}"]`);if(!source)continue;
    source.hidden=!row.visible;
    let key=source.querySelector<HTMLElement>('[data-additional-shortcut]');
    if(!key){key=doc.createElement('kbd');key.dataset.additionalShortcut='';source.append(key);}
    key.textContent=row.shortcut.replace('Control','Ctrl').replace('Digit','');key.hidden=!row.shortcut;
    const native=source.dataset.nativeShortcut??source.getAttribute('aria-keyshortcuts')??'';source.dataset.nativeShortcut=native;
    if(native||row.shortcut)source.setAttribute('aria-keyshortcuts',[native,row.shortcut.replace('Digit','')].filter(Boolean).join(' '));
    else source.removeAttribute('aria-keyshortcuts');
  }};
  const close=()=>{guard.close();captured=undefined;closeEditorDialog(dialog);};
  const show=(part:string, launcher:HTMLButtonElement)=>{if(dialog.open||actions.busy())return;captured=actions.capture();draft(preferences.read());status.textContent='';activate(part);guard.open();showUtilityDialog(dialog, launcher);
    (panels[part==='shortcut-settings'?1:0].querySelector<HTMLElement>('input,select')??cancel).focus();};
  for(const b of launchers){b.textContent=b.dataset.ui1Label??(b.dataset.menuScopePart==='menu-settings'?'메뉴 사용자 설정…':'단축키 사용자 설정…');b.onclick=()=>{
    doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));show(b.dataset.menuScopePart!, b);
  };}
  const sync=()=>{for(const b of launchers){b.disabled=actions.busy();b.title=b.disabled?'입력·저장·열린 대화상자를 먼저 마치세요.':'이번 편집 탭의 서식 메뉴 표시·추가 단축키를 설정합니다.';b.setAttribute('aria-disabled',String(b.disabled));b.setAttribute('aria-description',b.title);}
    if(dialog.open){const stale=!captured||!sameFormatTarget(captured,actions.capture());apply.disabled=reset.disabled=stale||actions.busy();if(stale)status.textContent='문서·리비전·선택이 변경되었습니다. 취소 후 다시 여세요.';}};
  form.onsubmit=e=>{e.preventDefault();if(!guard.ready())return;
    try{if(actions.busy()||!captured||!sameFormatTarget(captured,actions.capture()))throw Error('문서·선택 또는 처리 상태가 변경되었습니다. 취소 후 다시 여세요.');
      const rows=configurableCommands.map(({id})=>({id,visible:controls.get(id)!.visible.checked,shortcut:controls.get(id)!.shortcut.value}));
      preferences.apply(rows);guard.consume();project();close();
    }catch(error){status.textContent=String(error).replace(/^Error: /,'');}};
  reset.onclick=()=>{if(guard.ready()&&!actions.busy()&&captured&&sameFormatTarget(captured,actions.capture())){draft(defaultMenuPreferences());status.textContent='기본값 초안입니다. 설정을 눌러 반영하거나 취소할 수 있습니다.';}};
  cancel.onclick=close;dialog.addEventListener('cancel',e=>{if(e.defaultPrevented)return;e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(dialog.open)return;guard.close();captured=undefined;sync();});
  form.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.isComposing&&e.keyCode!==229){const all=[...form.querySelectorAll<HTMLElement>('summary,button,input,select')].filter(n=>n.tabIndex>=0&&!(n as HTMLInputElement).disabled&&!!n.getClientRects().length),at=all.indexOf(doc.activeElement as HTMLElement);if(all.length&&(at<0||(e.shiftKey?at===0:at===all.length-1))){e.preventDefault();all[e.shiftKey?all.length-1:0].focus();}}e.stopPropagation();});
  const observer=new MutationObserver(sync);
  if(!activeWorkset(doc))observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open']});
  else {
    subscribeWhileOpen(doc,dialog,sync);
    const tools=doc.getElementById('workspace-8');
    if(tools instanceof HTMLDetailsElement){
      tools.querySelector(':scope>summary')?.addEventListener('click',sync);
      subscribeWhileOpen(doc,tools,sync);
    }
  }
  project();sync();
  return {sync,read:()=>preferences.read(),route:(e:KeyInput & {repeat?:boolean})=>preferences.route(e,actions.reason)};
}
