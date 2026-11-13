import {activeWorkset} from './active-workset.js';
const shortNames:Record<string,string>={'text-color-apply':'글자색 선택'};
export function normalizeWorkspaceToolTitle(node:HTMLElement){const name=shortNames[node.id]??node.dataset.toolName??node.getAttribute('aria-label')??[...node.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();if(!name)return;
    if(node.title&&node.title!==name)node.setAttribute('aria-description',node.title);
    if(node.title!==name)node.title=name;
    if(node.dataset.hint)delete node.dataset.hint;
}

/** Presentation of original controls only. Command listeners, file inputs and
 * draft forms stay on their original nodes; no second command path is added. */
export function mountWorkspaceToolbarLayout(doc:Document) {
  const bar=doc.getElementById('format-bar')!,header=doc.querySelector<HTMLElement>('body > header')!,menu=doc.getElementById('main-menu')!,life=new AbortController();
  const moved:{node:HTMLElement;parent:Node;next:Node|null}[]=[];
  const move=(node:HTMLElement,parent:HTMLElement)=>{moved.push({node,parent:node.parentNode!,next:node.nextSibling});parent.append(node);};
  const icons:{node:HTMLElement;children:Node[];attributes:Map<string,string|null>}[]=[];
  const group=(id:string,name:string)=>{const e=doc.createElement('div');e.className='home-toolbar-group';e.dataset.homeGroup=id;e.setAttribute('role','group');e.setAttribute('aria-label',name);return e;};
  const files=group('files','파일'),history=group('history','실행 이력');
  for(const id of ['open','save','save-as','print-button']){const e=doc.getElementById(id);if(e)move(id==='open'?e.closest<HTMLLabelElement>('label')!:e,files);}
  for(const id of ['undo','redo']){const e=doc.getElementById(id);if(e)move(e,history);}
  bar.prepend(files,history);
  const clipboard=doc.getElementById('edit-tools')!;
  for(const id of ['cut','copy','paste','format-copy']){const e=clipboard.querySelector(`[data-edit-tool="${id}"]`);if(e)clipboard.append(e);}
  // Keep the original file input first in the toolbar and shared with menus/shortcuts.
  const omitted=[doc.getElementById('open')!.closest<HTMLLabelElement>('label')!,doc.getElementById('save-as')!,...bar.querySelectorAll<HTMLElement>('#strike,[data-quick-format=strike]')].map(node=>({node,hidden:node.hidden}));
  doc.getElementById('open')!.closest<HTMLLabelElement>('label')!.hidden=false;
  doc.getElementById('save-as')!.hidden=true;
  for(const e of bar.querySelectorAll<HTMLElement>('#strike,[data-quick-format=strike]'))e.hidden=true;
  const close=doc.getElementById('close-document')!;close.hidden=true;
  doc.getElementById('new')!.hidden=true;
  doc.getElementById('save')!.classList.remove('primary');
  for(const e of doc.querySelectorAll<HTMLElement>('#format-additions,#table-tools,#character,#paragraph,#format-bar [data-command-proxy="#character"],#format-bar [data-command-proxy="#paragraph"],[data-align=distribute],[data-align=split]'))e.hidden=true;
  const quick=doc.getElementById('workspace-quickbar')!,quickHidden=quick.hidden;quick.hidden=true;
  // These remain the same functional entrances, now in menus rather than the
  // permanent toolbar. Programmatic/keyboard references keep their IDs.
  for(const [id,parent]of [['navigation-toggle','#workspace-8 > div'],['properties-toggle','#workspace-8 > div'],['command-search-open','#workspace-8 > div']]){
    const e=doc.getElementById(id),target=doc.querySelector(parent);if(e&&target){move(e,target as HTMLElement);e.addEventListener('click',()=>{const root=e.closest<HTMLDetailsElement>('#main-menu > details');if(root&&!e.matches(':disabled')){root.open=false;root.querySelector('summary')?.setAttribute('aria-expanded','false');}},{signal:life.signal});}
  }
  const scope=bar.querySelector('[name="quickLanguage"]')?.closest('label'),scopeHidden=scope?.hidden;if(scope)scope.hidden=true;
  const paths:Record<string,string>={
    new:'M6 3h8l4 4v14H6z M14 3v5h4 M9 13h6 M9 17h6',
    open:'M3 7h7l2 2h9l-3 11H3z M3 10V5h7l2 2h7v2',
    save:'M4 3h13l4 4v14H3V3z M7 3v6h10V3 M7 21v-8h10v8',
    'save-as':'M4 3h13l4 4v6 M3 3v18h8 M7 3v6h10V3 M14 19l5-5 3 3-5 5h-3z',
    undo:'M9 5 4 10l5 5 M4 10h10a6 6 0 0 1 0 12',redo:'M15 5l5 5-5 5 M20 10H10a6 6 0 0 0 0 12',
    cut:'M9 8l11 13 M9 16 20 3 M9 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0 M9 18a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    copy:'M8 8h13v13H8z M16 8V3H3v13h5',paste:'M8 5H4v17h16V5h-4 M8 3h8v5H8z M8 12h8 M8 16h8',
    'format-copy':'M4 3h16v7H4z M8 10v4h8v-4 M12 14v8',find:'M16 16l6 6 M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0',
    replace:'M3 5h13l-3-3 M16 5l-3 3 M21 19H8l3 3 M8 19l3-3 M5 10v5 M3 12h4 M17 10h4v5h-4z',
    all:'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 7h10v10H7z',delete:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
    'print-button':'M7 8V3h10v5 M7 17H3V9h18v8h-4 M7 14h10v8H7z',
    'close-document':'M6 6l12 12 M6 18 18 6',print:'M7 8V3h10v5 M7 17H3V9h18v8h-4 M7 14h10v8H7z',
    apply:'M5 12l4 4L20 5',retry:'M19 8a8 8 0 1 0 1 9 M19 3v6h-6',
    character:'M4 20 12 3l8 17 M7 14h10',paragraph:'M14 21V3 M20 21V3H9a5 5 0 0 0 0 10h5',
    'toolbox-collapse':'M5 12h.01 M12 12h.01 M19 12h.01',
  };
  const names:Record<string,string>={new:'새 문서',open:'불러오기',save:'저장','save-as':'다른 이름으로 저장',undo:'실행 취소',redo:'다시 실행',cut:'오려두기',copy:'복사',paste:'붙이기','format-copy':'모양 복사',find:'찾기',replace:'바꾸기',all:'전체 선택',delete:'지우기','close-document':'문서 닫기',print:'인쇄','print-button':'인쇄','toolbox-collapse':'추가 도구',apply:'서식 적용',retry:'글꼴 다시 불러오기',character:'글자 모양',paragraph:'문단 모양'};
  const icon=(node:HTMLElement,id:string)=>{icons.push({node,children:[...node.childNodes],attributes:new Map(['class','aria-label','aria-description','title','data-tool-name','data-hint'].map(k=>[k,node.getAttribute(k)]))});const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[id]);svg.append(path);
    // File chooser input must remain in the original clickable label.
    for(const child of [...node.childNodes])if(!(child instanceof HTMLInputElement))child.remove();node.prepend(svg);node.classList.add('workspace-tool-icon');node.dataset.toolName=names[id];node.setAttribute('aria-label',names[id]);};
  for(const [id]of Object.entries(paths)){
    const e=doc.getElementById(id)??bar.querySelector<HTMLElement>(`[data-edit-tool="${id}"]`);if(e)icon(id==='open'?e.closest('label')!:e,id);
  }
  for(const node of bar.querySelectorAll<HTMLElement>('button')){
    const text=[...node.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
    const id=text==='적용'?'apply':text==='글꼴 다시 불러오기'?'retry':text.startsWith('글자 모양')?'character':text.startsWith('문단 모양')?'paragraph':'';
    if(id&&!node.classList.contains('workspace-tool-icon'))icon(node,id);
  }
  // Source state projection may refresh a disabled explanation/title. Keep the
  // explanation accessible while the visible tooltip remains the short name.
  const normalize=normalizeWorkspaceToolTitle;
  const buttons=()=>[...bar.querySelectorAll<HTMLElement>('button,[data-tool-name]'),close];
  for(const node of buttons())normalize(node);
  const titles=new MutationObserver(rows=>{for(const row of rows){const e=row.target as HTMLElement;if(e.matches('button,[data-tool-name]')&&(bar.contains(e)||e===close))normalize(e);}});
  if(!activeWorkset(doc)){titles.observe(bar,{subtree:true,attributes:true,attributeFilter:['title','data-hint']});titles.observe(close,{attributes:true,attributeFilter:['title']});}
  const labelRows=(surface:HTMLElement=menu)=>{
    for(const e of surface.querySelectorAll<HTMLElement>('button,details details > summary')){
      // Forms retain their own label/field layout. Root menu tabs are not rows.
      if(e.closest('form')||!e.closest('#main-menu > details')||e.parentElement===menu)continue;
      e.classList.add('menu-grid-row');
      for(const child of [...e.childNodes])if(child.nodeType===Node.TEXT_NODE&&child.textContent?.trim()){
        const span=doc.createElement('span');span.className='menu-row-label';child.before(span);span.append(child);
      }
    }
  };
  labelRows();const rows=new MutationObserver(()=>labelRows());
  if(!activeWorkset(doc))rows.observe(menu,{subtree:true,childList:true});
  else menu.addEventListener('toggle',event=>{
    const root=event.target;if(root instanceof HTMLDetailsElement&&root.parentElement===menu&&root.open)labelRows(root);
  },{capture:true,signal:life.signal});
  return{dispose(){life.abort();titles.disconnect();rows.disconnect();for(const {node,hidden}of omitted)node.hidden=hidden;
    for(const {node,children,attributes}of icons){node.replaceChildren(...children);for(const[k,v]of attributes)if(v===null)node.removeAttribute(k);else node.setAttribute(k,v);}
    for(const {node,parent,next}of moved.reverse())parent.insertBefore(node,next?.parentNode===parent?next:null);
    files.remove();history.remove();quick.hidden=quickHidden;if(scope)scope.hidden=scopeHidden!;
    for(const label of menu.querySelectorAll('.menu-row-label'))label.replaceWith(...label.childNodes);for(const row of menu.querySelectorAll('.menu-grid-row'))row.classList.remove('menu-grid-row');
  }};
}
