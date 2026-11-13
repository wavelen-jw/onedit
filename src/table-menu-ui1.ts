import { mountDropdownKeys } from "./workspace-menu-navigation.js";

// Observed table-only groups in UI1-CONTEXT-CELL-CARET/BLOCK. The received
// TABLE-DESIGN-MENU image is not expanded: top-level/native submenu parity NV.
export function mountTableMenuUI1(root: HTMLDetailsElement, buttons: Map<string,HTMLButtonElement>, busy: () => boolean) {
  const doc=root.ownerDocument,panel=root.querySelector<HTMLElement>('[data-table-panel]')!;
  const extra=doc.createElement('details'),extraSummary=doc.createElement('summary'),more=doc.createElement('div');
  extra.id='table-supported-menu';extraSummary.textContent='기존 선택·이동·크기 도구';extra.append(extraSummary,more);more.append(...panel.childNodes);panel.classList.add('ui1-table-panel');
  const layouts:{button:HTMLButtonElement;label:string;letter?:string;key?:string;reference?:boolean}[]=[];
  const live=(parent:HTMLElement,id:string,label:string,letter?:string,key?:string,reference=false)=>{
    const b=buttons.get(id)!;b.setAttribute('role','menuitem');if(letter)b.dataset.menuLetter=letter;
    layouts.push({button:b,label,letter,key,reference});parent.append(b);
  };
  const separator=()=>{const hr=doc.createElement('hr');hr.setAttribute('role','separator');panel.append(hr);};
  const referenceKey=(parent:HTMLElement,key:string)=>{const k=doc.createElement('kbd');k.textContent=key;k.title='원캡처의 참조키이며 현재 직접 키 연결은 없습니다.';parent.append(k);};
  const held=(letter:string,label:string,reason:string,key?:string)=>{const b=doc.createElement('button');b.type='button';b.textContent=label;b.disabled=true;b.dataset.tableHeld=letter;b.dataset.menuLetter=letter;b.title=reason;b.setAttribute('role','menuitem');b.setAttribute('aria-disabled','true');b.setAttribute('aria-description',reason);if(key)referenceKey(b,key);panel.append(b);};
  const make=(id:string,label:string,letter?:string)=>{const d=doc.createElement('details'),s=doc.createElement('summary'),p=doc.createElement('div');d.id=id;s.textContent=label;if(letter)s.dataset.tableSubkey=letter;d.append(s,p);panel.append(d);return{d,s,p};};
  live(panel,'properties','표/셀 속성(Q)…','q','P',true);
  const border=make('table-border-submenu','셀 테두리/배경(B)','b');live(border.p,'border-properties','셀 테두리/배경…');
  live(border.p,'block-border','하나의 셀처럼 · 테두리…',undefined,'B');
  live(border.p,'block-background','하나의 셀처럼 · 배경…',undefined,'F');
  separator();live(panel,'equal-height','셀 높이를 같게(R)','r','H');
  live(panel,'equal-width','셀 너비를 같게(W)','w','W');
  live(panel,'range-size','선택 범위 크기 조절…');
  live(panel,'merge','셀 합치기(J)','j','M');live(panel,'split-dialog','셀 나누기(V)…','v','S');
  const add=make('table-add-submenu','줄/칸 추가하기(I)…','i');live(add.p,'add-dialog','줄/칸 추가하기…',undefined,'Alt+Insert');live(add.p,'row-add','아래 행 추가');live(add.p,'col-add','오른쪽 열 추가');
  const remove=make('table-delete-submenu','줄/칸 지우기(E)…','e');live(remove.p,'delete-dialog','줄/칸 지우기…',undefined,'Alt+Delete');live(remove.p,'row-delete','현재 행 삭제 (내용 포함)');live(remove.p,'col-delete','현재 열 삭제 (내용 포함)');
  for(const [s,key]of [[add.s,'Alt+Insert'],[remove.s,'Alt+Delete']]as const){const k=doc.createElement('kbd');k.textContent=key;k.title='기존 Command의 줄/칸 선택 창';s.append(k);}
  separator();held('a','채우기(A)','연속 데이터 채우기 명령은 미연결입니다. 지원하는 셀 배경색은 테두리/배경 창에서 변경합니다.');held('k','블록 계산식(K)','셀 계산식 편집은 연결돼 있지 않습니다. 기존 표 내용은 유지합니다.');
  separator();live(panel,'table-transpose','표 뒤집기 · 줄/칸 전치…',undefined,'T');live(panel,'table-object-line','표 개체 테두리…',undefined,'L');live(panel,'table-object-background','표 개체 채우기…',undefined,'C');separator();panel.append(extra);
  const menus=[border.d,add.d,remove.d,extra],disposers:(()=>void)[]=[];
  const close=()=>menus.forEach(d=>d.open=false);
  const rootRows=()=>[...panel.querySelectorAll<HTMLElement>(':scope>button:not(:disabled),:scope>details>summary')].filter(e=>!!e.getClientRects().length&&e.getAttribute('aria-disabled')!=='true');
  const openers=new Map<string,()=>void>();
  const flyout=(d:HTMLDetailsElement)=>{
    const s=d.querySelector<HTMLElement>(':scope>summary')!,p=d.querySelector<HTMLElement>(':scope>div')!;p.classList.add('ui1-table-subpanel');p.id||=d.id+'-panel';
    s.setAttribute('role','menuitem');s.setAttribute('aria-haspopup','menu');s.setAttribute('aria-controls',p.id);
    const rows=()=>[...p.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(b=>b.closest('details')===d&&!!b.getClientRects().length);
    const focus=(e?:HTMLElement)=>{e?.focus();e?.scrollIntoView({block:'nearest',inline:'nearest'});};
    const position=()=>{s.setAttribute('aria-expanded',String(d.open));if(!d.open||!root.open)return;const r=s.getBoundingClientRect(),a=panel.getBoundingClientRect(),b=p.getBoundingClientRect(),w=doc.defaultView!;const left=a.right+b.width+2<w.innerWidth-8?a.right+1:a.left-b.width-1;p.style.left=`${Math.max(8,Math.min(left,w.innerWidth-b.width-8))}px`;p.style.top=`${Math.max(8,Math.min(r.top,w.innerHeight-b.height-8))}px`;};
    const open=()=>{if(s.getAttribute('aria-disabled')==='true')return;for(const other of menus)if(other!==d)other.open=false;d.open=true;position();focus(rows()[0]??s);};
    if(s.dataset.tableSubkey)openers.set(s.dataset.tableSubkey,open);
    const key=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.isComposing||e.keyCode===229||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||!(e.target instanceof HTMLElement)||e.target.closest('details')!==d)return;
      if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End','Enter','Escape'].includes(e.key)||e.target!==s&&['Enter','ArrowRight'].includes(e.key)||e.key==='Escape'&&!d.open)return;
      e.preventDefault();e.stopPropagation();if(busy())return;
      if(e.target===s&&!d.open&&['Home','End','ArrowUp','ArrowDown'].includes(e.key)){const a=rootRows(),at=a.indexOf(s);focus(a[e.key==='Home'?0:e.key==='End'?a.length-1:(at+(e.key==='ArrowUp'?-1:1)+a.length)%a.length]);return;}
      if(['ArrowLeft','Escape'].includes(e.key)){d.open=false;focus(s);return;}
      if(e.target===s&&['ArrowRight','Enter','ArrowDown'].includes(e.key)){open();return;}
      d.open=true;position();const a=rows(),at=a.indexOf(e.target as HTMLButtonElement);focus(a[e.key==='Home'?0:e.key==='End'||e.target===s&&e.key==='ArrowUp'?a.length-1:(at+(e.key==='ArrowUp'?-1:1)+a.length)%a.length]??s);
    };
    const click=(e:MouseEvent)=>{if(s.contains(e.target as Node)&&s.getAttribute('aria-disabled')==='true')e.preventDefault();};
    d.addEventListener('keydown',key);d.addEventListener('toggle',position);s.addEventListener('click',click);position();disposers.push(()=>{d.removeEventListener('keydown',key);d.removeEventListener('toggle',position);s.removeEventListener('click',click);});
  };
  menus.forEach(flyout);
  const rootToggle=()=>{if(!root.open)close();};
  const key=(e:KeyboardEvent)=>{if(e.defaultPrevented||e.isComposing||e.keyCode===229||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||!(e.target instanceof HTMLElement)||e.target.closest('details')!==root)return;const open=openers.get(e.key.toLowerCase());if(open){e.preventDefault();e.stopPropagation();if(!busy())open();}};
  root.addEventListener('toggle',rootToggle);root.addEventListener('keydown',key);doc.defaultView!.addEventListener('resize',close);doc.getElementById('viewport')!.addEventListener('scroll',close);disposers.push(mountDropdownKeys(root,busy));
  return{owns:(id:string)=>layouts.some(item=>item.button.dataset.tableAction===id),sync(isNested:boolean){
    for(const item of layouts){const label=item.button.dataset.tableAction==='split'&&isNested?'병합 해제 (원래 그리드)':item.label;
      if(item.button.firstChild?.textContent!==label||(item.button.querySelector('kbd')?.textContent??'')!==(item.key??'')){item.button.textContent=label;if(item.key){const k=doc.createElement('kbd');k.textContent=item.key;k.title=item.reference?'한컴 참조키이며 현재 직접 키 연결은 없습니다. 메뉴의 기존 지원 범위만 실행합니다.':`기존 셀 블록 ${item.key} 입구`;item.button.append(k);}}
      const disabled=String(item.button.disabled);if(item.button.getAttribute('aria-disabled')!==disabled)item.button.setAttribute('aria-disabled',disabled);
    }
    for(const d of [border.d,add.d,remove.d]){const s=d.querySelector('summary')!,a=[...d.querySelectorAll<HTMLButtonElement>('button')],disabled=a.every(b=>b.disabled);s.setAttribute('aria-disabled',String(disabled));s.title=disabled?a.map(b=>b.title).filter(Boolean).join(' / '):'현재 선택의 기존 지원 명령만 실행합니다.';if(disabled)d.open=false;}
  },dispose(){close();for(const f of disposers)f();root.removeEventListener('toggle',rootToggle);root.removeEventListener('keydown',key);doc.defaultView!.removeEventListener('resize',close);doc.getElementById('viewport')!.removeEventListener('scroll',close);}};
}
