import { closeEditorDialog, showUtilityDialog } from "./editor-popup-focus.js";
import { browserReplacementPolicy, wordWebShortcutsURL, wordWebTableURL } from "./browser-shortcut-scope.js";
import { shortcutResultReason } from "./shortcut-result-reasons.js";
import type { MenuPreference } from './menu-settings.js';
import type { ShortcutResultRow } from './shortcut-reference-data.js';

// Read-only product help. Lazy data, no Core queries or settings mutations.
export function mountShortcutResults(doc:Document, options:{blocked:()=>boolean;preferences:()=>MenuPreference[]}) {
  const anchor=doc.getElementById('tools-shortcut-settings');
  if(!anchor)return;
  const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{
    const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;
  };
  const launch=element('button','한/글 단축키 결과…');launch.type='button';launch.id='shortcut-results-open';launch.setAttribute('role','menuitem');anchor.after(launch);
  const dialog=element('dialog');dialog.id='shortcut-results';dialog.className='manager-dialog';dialog.setAttribute('aria-labelledby','shortcut-results-title');
  const title=element('h2','한컴 단축키 · Windows / macOS');title.id='shortcut-results-title';
  const intro=element('div');intro.className='shortcut-result-intro';
  const guide=element('details');const guideTitle=element('summary','표 읽는 법 · 검증 범위');
  const note=element('p','한컴 웹 187행은 Windows/macOS 원키와 Edit 연결키를 나란히 표시합니다. 슬래시(/)로 구분된 대안 키도 모두 보존합니다. 한/글 2022 일람 330개는 별도 목록입니다. 목록 밖 제외기능·설정 69행은 별도 보기입니다. 구현은 Edit 연결 상태이며 수용 완료율이 아닙니다. 사용자 제외95개·부분제외1개 및 기존 FAIL/NV/HOLD는 유지합니다. 기능별 확인 범위가 다르며 미검증 항목은 별도로 표시합니다. 수동제외는 사용자가 별도로 구현 불필요로 지정한 항목입니다. 대체안과 실제 Edit 유효키는 구별합니다.');
  const source=element('a','한/글 2022 공식 단축키 일람');source.href='https://help.hancom.com/hoffice120/ko-KR/Hwp/view/toolbar/shortcut(table).htm';source.target='_blank';source.rel='noopener noreferrer';guide.append(guideTitle,note,source);const webSource=element('a','한컴 웹 공식 단축키');webSource.href='https://webhwp.hancomdocs.com/cloud-hwp/help/Hwp/ko_kr/shortcut/shortcut.htm';webSource.target='_blank';webSource.rel='noopener noreferrer';guide.append(webSource,element('p','웹 목록 출처: 사용자가 제공한 공식 도움말 본문. 서버 원문 버전·Mac 물리키 실행은 별도 미확인. ⌃ Control · ⌥ Option · ⌘ Command · ⇧ Shift.'));intro.append(guide);
  const controls=element('div');controls.className='shortcut-result-controls';
  const query=element('input');query.type='search';query.setAttribute('aria-label','기능·키·사유 검색');query.placeholder='기능, 단축키, 사유 검색';
  const select=(label:string,items:[string,string][])=>{const s=element('select');s.setAttribute('aria-label',label);for(const[value,text]of items){const o=element('option',text);o.value=value;s.append(o);}return s;};
  const scope=select('단축키 목록 범위',[['web','한컴 웹 단축키 (187)'],['official','한/글 2022 단축키 (330)'],['supplement','목록 밖 제외·설정 (69)'],['all','전체 대조 자료']]);
  const group=select('단축키 메뉴 분류',[['','모든 메뉴']]);
  const filter=select('단축키 결과 상태',['전체','구현','미구현','수동제외','명시제외','브라우저 제한','미검증'].map(s=>[s,s]));
  const count=element('output');count.setAttribute('aria-live','polite');controls.append(query,scope,group,filter,count);
  const totals=element('p');totals.className='shortcut-result-totals';
  const alternatives=element('details'),alternativesTitle=element('summary','브라우저 제한 · 웹용 Word 대체키 기준'),alternativesNote=element('p',browserReplacementPolicy),alternativesList=element('dl');alternatives.className='shortcut-alternatives';alternativesList.tabIndex=0;alternativesList.setAttribute('role','region');alternativesList.setAttribute('aria-label','브라우저 충돌키와 대체 여부');alternatives.append(alternativesTitle,alternativesNote,alternativesList);
  for(const [label,href]of [['Microsoft 공식 웹용 Word 단축키',wordWebShortcutsURL],['Microsoft 공식 표 삽입 안내 · Web 절',wordWebTableURL]]){const link=element('a',label);link.href=href;link.target='_blank';link.rel='noopener noreferrer';alternatives.append(link);}
  const viewport=element('div');viewport.className='shortcut-result-scroll';viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','한/글 단축키 결과표');
  const table=element('table');const caption=element('caption','한/글 공식 순서 · 문맥별 원키와 Edit 연결 상태');
  const cols=element('colgroup');for(const name of['function','native','edit','native','edit','state','reason','detail']){const col=element('col');col.className='shortcut-col-'+name;cols.append(col);}
  const head=element('thead'),row=element('tr');for(const label of['기능','한컴 Windows 원키','Edit Windows 키 · 접근','한컴 macOS 원키','Edit macOS 키 · 접근','상태 · Windows / macOS','미연결 사유','상세']){const th=element('th',label);th.scope='col';row.append(th);}head.append(row);
  const body=element('tbody');table.append(caption,cols,head,body);viewport.append(table);
  const close=element('button','닫기');close.type='button';const footer=element('div');footer.className='manager-footer';footer.append(element('span','원키가 같아도 사용 문맥에 따라 동작이 다릅니다.'),close);
  dialog.append(title,intro,controls,totals,alternatives,viewport,footer);doc.body.append(dialog);
  let entries:readonly ShortcutResultRow[]|undefined,preferences:MenuPreference[]=[];
  const official=(r:ShortcutResultRow)=>/^HK\d{3}$/.test(r.id);
  function render(){
    if(!entries)return;
    const q=query.value.trim().normalize('NFKC').toLowerCase();
    const web=(r:ShortcutResultRow)=>/^W\d{3}$/.test(r.id);
    const base=entries.filter(r=>scope.value==='all'||(scope.value==='web'?web(r):scope.value==='official'?official(r):!official(r)&&!web(r)));
    const selected=base.filter(r=>(!group.value||r.group===group.value)&&(filter.value==='전체'||r.status===filter.value||r.macStatus===filter.value)&&(!q||[r.id,r.function,r.native,r.edit,r.macNative??'',r.macEdit??'',r.reason,r.scopeId,r.context,r.group,r.menu,r.proposal,r.status==='미구현'?shortcutResultReason(r.id):''].join(' ').normalize('NFKC').toLowerCase().includes(q)));
    const fragment=doc.createDocumentFragment();let section='';
    for(const r of selected){
      const current=r.group+' · '+r.context;
      if(current!==section){const tr=element('tr');tr.className='shortcut-result-section';const th=element('th',current);th.colSpan=8;th.scope='colgroup';tr.append(th);fragment.append(tr);section=current;}
      const tr=element('tr');tr.dataset.shortcutResult=r.id;tr.dataset.shortcutState=r.status;
      const pref=r.commandId?preferences.find(p=>p.id===r.commandId):undefined;
      const extra=pref?.shortcut?` · 사용자 추가 ${pref.shortcut.replace('Control','Ctrl').replace('Digit','')}`:'';
      const name=element('td');name.append(element('span',r.function),element('small',r.id));
      const native=element('td',official(r)||web(r)?r.native:'—');native.className='shortcut-result-key';
      const edit=element('td',r.edit+extra);edit.className='shortcut-result-key';
      const macNative=element('td',r.macNative??'—'),macEdit=element('td',r.macEdit??'한컴 웹 목록에서 확인');macNative.className=macEdit.className='shortcut-result-key';
      const state=element('td');const badge=element('span',r.status+(r.macStatus?' / '+r.macStatus:''));badge.className='shortcut-result-badge';badge.dataset.state=r.status;state.append(badge);
      const reason=element('td',web(r)?(r.status==='구현'&&r.macStatus==='구현'?'—':r.reason):r.status==='미구현'?shortcutResultReason(r.id):'—');reason.className='shortcut-result-reason';
      const more=element('td');const toggle=element('button','상세');toggle.type='button';toggle.setAttribute('aria-label',`${r.id} ${r.function} 상세`);toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','shortcut-detail-'+r.id);more.append(toggle);
      const detail=element('tr');detail.id='shortcut-detail-'+r.id;detail.className='shortcut-result-detail';detail.hidden=true;
      const cell=element('td');cell.colSpan=8;const dl=element('dl');
      for(const[label,value]of(r.status==='미구현'?[['사용 문맥',r.context],['한/글 메뉴',r.menu],['Edit 연결',r.edit+extra]]:[['사용 문맥',r.context],['한/글 메뉴',r.menu],['Edit 연결',r.edit+extra],['사유 · 가능한 조작',r.reason],['대체안',r.proposal]])){dl.append(element('dt',label),element('dd',value));}cell.append(dl);detail.append(cell);
      toggle.onclick=()=>{detail.hidden=!detail.hidden;toggle.setAttribute('aria-expanded',String(!detail.hidden));toggle.textContent=detail.hidden?'상세':'접기';};
      tr.append(name,native,edit,macNative,macEdit,state,reason,more);fragment.append(tr,detail);
    }
    if(!selected.length){const tr=element('tr'),td=element('td','검색 조건에 맞는 항목이 없습니다.');td.colSpan=8;tr.append(td);fragment.append(tr);}
    body.replaceChildren(fragment);viewport.scrollTop=0;count.textContent=`${selected.length} / ${base.length}행`;
    totals.textContent=(scope.value==='web'?'한컴 웹 187행 · 키 연결 상태이며 OS 전달 수용이 아님':scope.value==='official'?'한/글 2022 330행':scope.value==='supplement'?'목록 밖 추가 69행':'전체 대조')+' · '+['구현','미구현','수동제외','명시제외','브라우저 제한','미검증'].map(s=>`${s} ${base.filter(r=>r.status===s).length}`).join('  /  ');
  }
  query.oninput=render;filter.onchange=render;group.onchange=render;
  scope.onchange=()=>{group.value='';render();};
  launch.onclick=async()=>{
    if(options.blocked()||dialog.open)return;
    doc.querySelectorAll('#main-menu details[open]').forEach(n=>n.removeAttribute('open'));preferences=options.preferences();showUtilityDialog(dialog, launch);query.focus();count.textContent='결과표 읽는 중…';
    try{
      entries=[...(await import('./shortcut-reference-data.js')).shortcutReference,...(await import('./hancom-web-shortcut-reference.js')).hancomWebShortcutReference];
      alternativesList.replaceChildren(...entries.filter(r=>r.status==='브라우저 제한'||['HK031','HK262','HK268'].includes(r.id)).flatMap(r=>[element('dt',`${r.function} (${r.native})`),element('dd',r.proposal)]));
      if(group.options.length===1)for(const name of new Set(entries.map(r=>r.group))){const o=element('option',name);o.value=name;group.append(o);}
      if(dialog.open)render();
    }catch{count.textContent='결과표를 읽지 못했습니다. 닫고 다시 여세요.';}
  };
  close.onclick=()=>closeEditorDialog(dialog);
  dialog.addEventListener('keydown',e=>{
    e.stopPropagation();if(e.isComposing||e.keyCode===229)return;
    if(e.key==='Tab'){
      const all=Array.from(dialog.querySelectorAll<HTMLElement>('input,select,button,a[href],summary,[tabindex="0"]')).filter(n=>n.getClientRects().length>0&&!n.matches(':disabled'));
      const at=all.indexOf(doc.activeElement as HTMLElement);
      if(e.shiftKey&&at<=0||!e.shiftKey&&at===all.length-1){e.preventDefault();all[e.shiftKey?all.length-1:0]?.focus();}
    }
  });
}
