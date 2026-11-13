import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import type {Interaction} from './interaction.js';
import {formatInputGuard,sameFormatTarget} from './integration/a-format-input-guard.js';
import {formatValueState} from './format-value-state.js';
import {visibleManagerControls} from './manager-layout.js';
import {allowedCharacter,unicodeCharacter,characterCatalog,characterCategories,characterCode,describeCharacter,searchCharacters,type CharacterEntry} from './character-map-data.js';

type Actions={blocked:()=>boolean;inFlight:()=>boolean;focus:()=>void;changed:()=>void};
const recentKey='rhwp.character-map.recent.v1';
export function characterMapAdmission(editor:Interaction){
  if(editor.selection.kind!=='caret'&&editor.selection.kind!=='text')throw Error('본문·지원 셀 문자 위치 또는 텍스트 블록을 선택하세요.');
  for(const t of editor.targets()){editor.adapter.assertEditable(t.p);editor.adapter.assertTextOnly(t.p);}
}
export function mountCharacterMap(doc:Document,editor:Interaction,actions:Actions){
  const dialog=doc.createElement('dialog');dialog.id='remaining-character-map';dialog.className='manager-dialog character-map-dialog';dialog.setAttribute('aria-label','문자표');
  const form=doc.createElement('form');form.dataset.ui2Draft='';
  const heading=doc.createElement('h2');heading.textContent='문자표';
  const search=doc.createElement('input');search.type='search';search.placeholder='이름·별칭·문자·U+코드 검색';search.setAttribute('aria-label','문자 검색');search.autocomplete='off';
  const fontNote=doc.createElement('p');fontNote.className='character-font-note';
  const tools=doc.createElement('div');tools.className='character-tools';
  const areas=doc.createElement('select');areas.setAttribute('aria-label','문자 분류');
  for(const name of characterCategories)areas.add(new Option(name,'category:'+name));
  const ranges=[['기본 라틴',0x20],['라틴 확장',0xa0],['그리스',0x370],['키릴',0x400],['일반 문장부호',0x2000],['통화',0x20a0],['화살표 영역',0x2190],['수학 연산',0x2200],['괘선',0x2500],['도형',0x25a0],['기호',0x2600],['한글 자모',0x1100],['가나',0x3040],['한글 음절',0xac00],['한자',0x4e00]]as const;
  for(const[name,n]of ranges)areas.add(new Option('Unicode · '+name,'range:'+n));
  const code=doc.createElement('input');code.type='text';code.placeholder='U+203B';code.setAttribute('aria-label','문자 코드 (16진수)');code.autocomplete='off';
  const makeButton=(label:string,run:()=>void)=>{const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=run;return b;};
  const jump=makeButton('코드로 찾기',()=>{
    if(!guard.ready())return;
    const match=/^(?:U\+|0x)?([0-9a-f]{1,6})$/i.exec(code.value.trim()),s=match&&unicodeCharacter(parseInt(match[1],16));
    if(!s){status.textContent='삽입 가능한 Unicode 코드가 아닙니다. 제어문자·잘못된 코드는 사용할 수 없습니다.';return;}
    search.value='';drawRange(s.codePointAt(0)!);select(s);focusSelected();
  });
  tools.append(areas,code,jump);
  const recentBox=doc.createElement('div');recentBox.className='character-recent';recentBox.setAttribute('role','group');recentBox.setAttribute('aria-label','최근 사용 문자');
  const content=doc.createElement('div');content.className='character-content';
  const gridHost=doc.createElement('div'),count=doc.createElement('p'),grid=doc.createElement('div');
  count.className='character-count';grid.className='unicode-grid';grid.setAttribute('role','listbox');grid.setAttribute('aria-label','문자 선택');
  gridHost.append(count,grid);
  const detail=doc.createElement('div');detail.className='character-detail';
  const preview=doc.createElement('output'),name=doc.createElement('strong'),unicode=doc.createElement('code'),tip=doc.createElement('p');
  preview.className='character-preview';preview.setAttribute('aria-label','선택 문자 미리보기');
  tip.textContent='방향키·Enter로 선택 문자 넣기 · 더블클릭으로 모으기';detail.append(preview,name,unicode,tip);content.append(gridHost,detail);
  const queue=doc.createElement('input');queue.setAttribute('aria-label','문자 모으기');queue.placeholder='문자를 더블클릭해 모으세요. 직접 수정할 수 있습니다.';queue.autocomplete='off';
  const queueTools=doc.createElement('div');queueTools.className='character-queue';queueTools.append(queue);
  const status=doc.createElement('p');status.setAttribute('role','status');status.className='character-status';
  const footer=doc.createElement('footer'),help=doc.createElement('span'),ok=doc.createElement('button'),close=makeButton('닫기',()=>{if(guard.ready())closeEditorDialog(dialog);});
  help.textContent='방향키로 이동 · Esc로 닫기';ok.type='submit';ok.textContent='넣기';ok.dataset.remainingApply='';footer.append(help,ok,close);
  form.append(heading,search,fontNote,tools,recentBox,content,queueTools,status,footer);dialog.append(form);doc.body.append(dialog);
  const guard=formatInputGuard(form);
  let target:ReturnType<Interaction['capture']>|undefined,last='★',recent:string[]=[];
  try{const value=JSON.parse(doc.defaultView!.localStorage.getItem(recentKey)??'[]');if(Array.isArray(value))recent=[...new Set(value.filter((s):s is string=>typeof s==='string'&&allowedCharacter(s)))].slice(0,16);}catch{/* Storage failure never prevents the character picker. */}
  function select(s:string){
    last=s;code.value=characterCode(s);preview.textContent=s;name.textContent=describeCharacter(s).name;unicode.textContent=characterCode(s);
    for(const b of grid.querySelectorAll<HTMLButtonElement>('button')){const selected=b.dataset.character===s;b.setAttribute('aria-selected',String(selected));b.setAttribute('aria-pressed',String(selected));b.tabIndex=selected?0:-1;}
  }
  function focusSelected(){grid.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus({preventScroll:true});}
  function render(entries:CharacterEntry[]){
    grid.replaceChildren();status.textContent='';count.textContent=entries.length?`${entries.length}개 문자`:'검색 결과 없음 · 다른 이름이나 U+코드를 입력하세요.';syncQueue();
    for(const entry of entries){const s=entry.character,b=makeButton(s,()=>select(s));b.dataset.character=s;b.setAttribute('role','option');b.setAttribute('aria-label',`${entry.name} ${characterCode(s)}`);b.title=`${entry.name} · ${characterCode(s)}`;b.ondblclick=e=>{e.preventDefault();e.stopPropagation();collect(s);};grid.append(b);}
    if(entries.length)select(entries.some(e=>e.character===last)?last:entries[0].character);
    else{preview.textContent='—';name.textContent='문자를 선택하세요';unicode.textContent='';}
  }
  function drawRange(at:number){
    const start=Math.floor(at/128)*128;
    areas.querySelector('[data-code-page]')?.remove();
    const range=ranges.find(([,n])=>n===at);
    if(range)areas.value='range:'+at;
    else{const option=new Option(`Unicode · ${characterCode(String.fromCodePoint(start))} 영역`,'range:'+start);option.dataset.codePage='';areas.add(option);areas.value=option.value;}
    const entries:CharacterEntry[]=[];
    for(let n=start;n<Math.min(start+128,0x110000);n++){const s=unicodeCharacter(n);if(s)entries.push(describeCharacter(s));}
    render(entries);
  }
  function refresh(){
    if(search.value.trim()){render(searchCharacters(search.value));return;}
    if(areas.value.startsWith('range:'))drawRange(Number(areas.value.slice(6)));
    else {
      const category=areas.value.slice(9);
      render(characterCatalog.filter(e=>e.category===category||
        category==='화살표'&&'←↑→↓'.includes(e.character)||
        category==='숫자'&&'①②③④⑤⑥⑦⑧⑨'.includes(e.character)));
    }
  }
  function refreshRecent(){
    const label=doc.createElement('span');label.textContent='최근 사용';recentBox.replaceChildren(label);
    if(!recent.length){const empty=doc.createElement('span');empty.textContent='넣은 문자가 여기에 표시됩니다.';recentBox.append(empty);}
    for(const s of recent){const b=makeButton(s,()=>{search.value='';drawRange(s.codePointAt(0)!);select(s);focusSelected();});b.title=describeCharacter(s).name+' · '+characterCode(s);b.setAttribute('aria-label','최근 '+b.title);b.ondblclick=e=>{e.preventDefault();e.stopPropagation();collect(s);};recentBox.append(b);}
  }
  search.oninput=refresh;
  areas.onchange=()=>{search.value='';refresh();};
  function syncQueue(){const chars=Array.from(queue.value);ok.disabled=!chars.length||chars.length>256||chars.some(s=>!allowedCharacter(s));}
  function collect(s:string){if(!guard.ready())return;select(s);if(Array.from(queue.value).length>=256){status.textContent='한 번에 256자까지 모을 수 있습니다.';return;}queue.value+=s;syncQueue();}
  queue.addEventListener('input',syncQueue);
  function insert(closeAfter=false, text=queue.value){
    if(!guard.ready())return;
    try{
      if(actions.inFlight())throw Error('입력·저장 작업을 마친 뒤 넣으세요.');
      if(!target||!sameFormatTarget(target,editor.capture()))throw Error('문서·리비전·선택이 변경되었습니다. 닫은 뒤 다시 여세요.');
      characterMapAdmission(editor);
      if(!text){status.textContent='넣을 문자를 먼저 모으세요.';return;}
      if(Array.from(text).length>256||Array.from(text).some(s=>!allowedCharacter(s)))throw Error('지원되는 Unicode 문자 256자 이내로 입력하세요.');
      const revision=editor.adapter.revision;
      editor.execute({type:'insert',text},target);
      target=editor.capture(); // Only this successful command advances the continuation target.
      if(editor.adapter.revision!==revision){
        recent=[...new Set([...Array.from(text).reverse(),...recent])].slice(0,16);
        try{doc.defaultView!.localStorage.setItem(recentKey,JSON.stringify(recent));}catch{/* Keep session recents if storage is unavailable. */}
        refreshRecent();
      }
      queue.value='';syncQueue();actions.changed();status.textContent=editor.adapter.revision!==revision?`${text} 넣음 · 계속 넣거나 닫으세요.`:'변경 없음 · 계속 넣거나 닫으세요.';
      if(closeAfter)closeEditorDialog(dialog);else focusSelected();
    }catch(error){status.textContent=String(error).replace(/^Error: /,'');}
  }
  form.onsubmit=e=>{
    e.preventDefault();if(!guard.ready())return;
    // Search Enter only selects a result; it never inserts into the document.
    if(doc.activeElement===search){focusSelected();return;}
    insert(true);
  };
  grid.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229||e.getModifierState('AltGraph')||e.ctrlKey||e.altKey||e.metaKey||!e.cancelable||!guard.ready())return;
    const rows=[...grid.querySelectorAll<HTMLButtonElement>('button')],at=rows.indexOf(doc.activeElement as HTMLButtonElement),cols=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const delta=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-cols,ArrowDown:cols}as Record<string,number>)[e.key];
    if(delta!==undefined||e.key==='Home'||e.key==='End'){
      e.preventDefault();const next=rows[e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,at+delta))];
      if(next){select(next.dataset.character!);next.focus();}
    }else if(e.key==='Enter'&&!e.repeat){e.preventDefault();insert(true,last);}
  });
  form.addEventListener('keydown',e=>{
    e.stopPropagation();if(e.defaultPrevented||e.isComposing||e.keyCode===229||!e.cancelable)return;
    if(e.key==='Escape'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();if(guard.ready())closeEditorDialog(dialog);}
    else if(e.key==='Enter'&&doc.activeElement===code){e.preventDefault();if(guard.ready()&&!e.repeat)jump.click();}
    else if(e.key==='Enter'&&(e.target===ok||e.target===queue)&&!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();insert(true);}
    else if(e.key==='Tab'){
      const all=visibleManagerControls(form),at=all.indexOf(doc.activeElement as HTMLElement);
      if(all.length&&(at<0||(e.shiftKey?at===0:at===all.length-1))){e.preventDefault();all[e.shiftKey?all.length-1:0].focus();}
    }
  });
  dialog.addEventListener('cancel',e=>{if(!guard.ready())e.preventDefault();});
  dialog.addEventListener('close',()=>{if(!dialog.open){
    guard.close();target=undefined;
    // Native dialog restoration can already report the textarea as focused
    // while its editing caret still belongs to the closed dialog. Reacquire
    // that control's native input focus; the logical selection is untouched.
    const input=doc.getElementById('input');if(doc.activeElement===input)input?.blur();
    actions.focus();
  }});
  return{show(){
    if(actions.blocked()||doc.querySelector('dialog[open]'))return;
    characterMapAdmission(editor);target=editor.capture();
    const state=editor.formatState('char'),kind=formatValueState(state,'fontFamily'),font=kind==='common'&&typeof state.fontFamily==='string'?state.fontFamily:undefined;
    grid.style.fontFamily=preview.style.fontFamily=font??'';
    fontNote.textContent=font?'현재 글꼴: '+font+' · 문서 서식을 그대로 사용합니다.':'글꼴 '+(kind==='mixed'?'혼합':'미조회')+' · 문서 서식을 유지합니다. 미리보기 글꼴은 다를 수 있습니다.';
    fontNote.title='이름 검색은 제공 기호·별칭 목록을 사용합니다. 다른 문자는 기존 Unicode 영역/코드로 찾으세요. HNC/KS·개인용 문자·옛한글 조합은 미제공이며 없는 글리프는 대체될 수 있습니다.';
    search.value='';queue.value='';areas.value='category:공문서 기호';refresh();refreshRecent();
    // Preserve the original picker’s selected-body-character code lookup.
    if(editor.selection.kind==='text'){
      const {anchor,focus}=editor.selection;
      if(anchor.kind==='body'&&focus.kind==='body'&&anchor.sec===focus.sec&&anchor.para===focus.para){
        const s=Array.from(editor.adapter.text(anchor))[Math.min(editor.adapter.textOffset(anchor),editor.adapter.textOffset(focus))];
        if(s&&allowedCharacter(s)){drawRange(s.codePointAt(0)!);select(s);}
      }
    }
    doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));
    guard.open();showEditorDialog(dialog);focusSelected();
  },dispose(){guard.close();dialog.remove();}};
}
