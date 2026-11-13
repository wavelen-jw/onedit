import {activeWorkset} from './active-workset.js';
import {subscribeWhileOpen} from './ui-demand-lifetime.js';
import type {EditAction} from './integration/a-edit-menu.js';
import { cellDialogFor, cellDialogMode, type CellDialogMode } from "./cell-dialog-command.js";
import {registerMenuDemand} from './menu-lifetime.js';
import {webMenuCatalog as studioMenuCatalog,type WebMenuRow as StudioRow} from './web-menu-catalog.js';
import {mountDropdownKeys} from './workspace-menu-navigation.js';
import {formatToggleState} from './format-value-state.js';
import type {FormatState} from './formatting.js';

// Existing owners remain connected, with all of their admission and target checks.
// A menu row is never evidence that its feature is implemented.
const selectors:Record<string,string>={
 'edit:undo':'[data-edit-entry="undo"]','edit:redo':'[data-edit-entry="redo"]','edit:cut':'[data-edit-entry="cut"]','edit:copy':'[data-edit-entry="copy"]','edit:paste':'[data-edit-entry="paste"]',
 'edit:delete':'[data-edit-entry="delete"]','edit:all':'[data-edit-entry="all"]','edit:find':'[data-edit-entry="find"]','edit:replace':'[data-edit-entry="replace"]','edit:format-copy':'[data-edit-entry="format-copy"]','edit:format-paste':'[data-edit-entry="format-paste"]',
 'tools:settings':'#tools-user-settings','tools:environment':'[data-local-font-settings]','tools:shortcut-results':'#shortcut-results-open','tools:properties':'#properties-toggle',
 'tools:navigation':'#navigation-toggle','edit:goto':'#status-page','tools:command-search':'#command-search-open',
 'view:zoom-in':'[data-view-action="in"]','view:zoom-out':'[data-view-action="out"]','view:zoom-dialog':'[data-view-entry="zoom"]',
 'view:zoom-fit-page':'[data-view-action="page"]','view:zoom-fit-width':'[data-view-action="width"]','view:zoom-100':'[data-view-action="actual"]',
 'view:ctrl-mark':'[data-view-action="control-codes"]','view:para-mark':'[data-view-action="paragraph-marks"]','view:border-transparent':'[data-view-action="transparent-borders"]',
 'view:toolbox-basic':'[data-toolbox-view="toolbar"]','view:toolbox-format':'[data-toolbox-view="format-bar"]',
 'insert:image':'#picture-menu button','insert:textbox':'[data-insert-entry="textbox"]',
 'insert:equation':'[data-remaining-entry="equation"]','insert:field':'#field-insert-open','insert:footnote':'[data-remaining-entry="footnote"]','insert:endnote':'[data-remaining-entry="endnote"]','insert:symbols':'[data-remaining-entry="character-map"]',
 'format:bold':'[data-format-action="bold"]','format:italic':'[data-format-action="italic"]','format:underline':'[data-format-action="underline"]',
 'format:char-shape':'[data-format-action="character"]','format:para-shape':'[data-format-action="paragraph"]',
 'format:para-num-shape':'[data-format-action="paragraph-lists"]','format:bullet-shape':'[data-format-action="paragraph-lists"]',
 'format:level-increase':'[data-format-action="number-level--1"]','format:level-decrease':'[data-format-action="number-level-1"]',
 'format:font-size-increase':'[data-format-action="relative-fontSize-1"]','format:font-size-decrease':'[data-format-action="relative-fontSize--1"]',
 'format:align-left':'[data-format-action="left"]','format:align-center':'[data-format-action="center"]','format:align-right':'[data-format-action="right"]','format:align-justify':'[data-format-action="justify"]','format:align-distribute':'[data-format-action="distribute"]',
 'format:line-spacing-increase':'[data-format-action="line-spacing-1"]','format:line-spacing-decrease':'[data-format-action="line-spacing--1"]','format:object-properties':'[data-format-entry="object-properties"]',
 'page:setup':'[data-page-entry="j"]','page:header-create':'#header-footer-open','page:footer-create':'#header-footer-open','page:page-number':'#page-number-open','page:break':'#page-break','page:column-break':'#column-break','page:col-settings':'#columns-open',
 'page:col-1':'[data-column-preset="1"]','page:col-2':'[data-column-preset="2"]',
 'table:create':'#table-menu [data-table-insert-entry]','table:cell-props':'[data-table-action="properties"]','table:border-each':'[data-table-action="border-properties"]','table:border-one':'[data-table-action="block-border"]',
 'table:insert-row-col':'[data-table-action="add-dialog"]','table:delete-row-col':'[data-table-action="delete-dialog"]',
 'table:cell-split':'[data-table-action="split-dialog"]','table:cell-merge':'[data-table-action="merge"]','table:cell-height-equal':'[data-table-action="equal-height"]','table:cell-width-equal':'[data-table-action="equal-width"]','table:range-size':'[data-table-action="range-size"]',
 'table:block-sum':'[data-table-action="calc-SUM"]','table:block-avg':'[data-table-action="calc-AVG"]','table:block-product':'[data-table-action="calc-PRODUCT"]',
};
type CommandPorts={
 edit:()=>ReadonlyMap<EditAction,string>;table:()=>ReadonlyMap<string,string>;tablePressed:(id:string)=>string|null;
 paragraphDisplay:()=>FormatState;
 invokeEdit:(id:EditAction)=>void;invokeTable:(id:string)=>void;
};
export function mountStudioMenus(doc:Document,busy:()=>boolean,focus:()=>void,openCellDialog?: (mode: CellDialogMode) => boolean,ports?:CommandPorts){
 const active=activeWorkset(doc),disposers:(()=>void)[]=[];
 const nativeAction=(source:HTMLButtonElement|null)=>active&&ports&&source
   ? source.dataset.editAction ? {kind:'edit' as const,id:source.dataset.editAction as EditAction}
   : source.dataset.tableAction ? {kind:'table' as const,id:source.dataset.tableAction} : undefined : undefined;
 const cellCommand = cellDialogFor(doc);
 for(const n of [50,75,125,150,200,300])selectors['view:zoom-'+n]='[data-view-action="zoom-go"]';
 const sources=new Map(Object.entries(selectors).map(([id,sel])=>[id,doc.querySelector<HTMLButtonElement>(sel)]));
 type Binding={button:HTMLButtonElement;source:HTMLButtonElement|null;command:string};
 const bindings:Binding[]=[];
 for(const[name,rows]of Object.entries(studioMenuCatalog)){
  const root=doc.getElementById(name==='tools'?'workspace-8':name+'-menu') as HTMLDetailsElement;
  if(!root)continue;const panel=root.querySelector<HTMLElement>(':scope>div')!;
  const retained=doc.createElement('div');retained.hidden=true;retained.dataset.menuSources=name;retained.append(...panel.childNodes);panel.append(retained);root.dataset.studioMenu=name;
  const start=bindings.length;let refreshRoot=()=>refresh(bindings);
  const build=(parent:HTMLElement,list:StudioRow[])=>{for(const original of list){
   // User-approved Edit support boundary, independent of the reference catalog.
   const row=name==='page'&&original.children?.some(c=>c.command==='page:col-1')?{...original,label:'다단',children:original.children.filter(c=>c.command==='page:col-1'||c.command==='page:col-2').map(c=>({...c,label:c.command==='page:col-1'?'1단':'2단'}))}:original;
   if(row.separator){const hr=doc.createElement('hr');hr.setAttribute('role','separator');parent.append(hr);continue;}
   if(row.children){const d=doc.createElement('details'),s=doc.createElement('summary'),p=doc.createElement('div');s.textContent=row.label!;s.setAttribute('role','menuitem');s.setAttribute('aria-haspopup','menu');d.id='studio-submenu-'+name+'-'+parent.querySelectorAll('.studio-submenu').length+'-'+bindings.length;d.className='studio-submenu';p.className='studio-subpanel';d.append(s,p);build(p,row.children);if(!p.children.length)continue;parent.append(d);mountDropdownKeys(d,busy);
    const position=()=>{s.setAttribute('aria-expanded',String(d.open));if(!d.open)return;const a=s.getBoundingClientRect(),b=p.getBoundingClientRect(),w=doc.defaultView!;p.style.left=Math.max(8,Math.min(a.right,w.innerWidth-b.width-8))+'px';p.style.top=Math.max(8,Math.min(a.top,w.innerHeight-b.height-8))+'px';};
    d.addEventListener('toggle',position);s.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='Enter'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();d.open=true;position();p.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}else if(e.key==='Escape'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();d.open=false;s.focus();}});
    d.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||e.keyCode===229||e.ctrlKey||e.altKey||e.metaKey)return;if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&!(e.target instanceof HTMLInputElement)){e.preventDefault();e.stopPropagation();const rows=[...p.querySelectorAll<HTMLElement>(':scope>button:not(:disabled),:scope>details>summary')];const i=rows.indexOf(e.target as HTMLElement);rows[e.key==='Home'?0:e.key==='End'?rows.length-1:(i+(e.key==='ArrowUp'?-1:1)+rows.length)%rows.length]?.focus();}else if(e.key==='Escape'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();d.open=false;s.focus();}});continue;}
   const command=row.command??'',source=sources.get(command)??null,b=doc.createElement('button');b.type='button';b.textContent=row.label!;b.dataset.studioCommand=command;b.setAttribute('role','menuitem');
   const cellMode = openCellDialog && cellCommand && cellDialogMode(command);
   if(!cellMode&&!source&&!row.retainUnavailable)continue;
   // Use Edit's real shortcut where different; Studio reference chords are not bindings.
   const key=source?.querySelector('kbd')?.textContent;if(key){const k=doc.createElement('kbd');k.textContent=key;b.append(k);}
   if (cellMode && cellCommand) {
     cellCommand.bind(b, cellMode, row.label!);
     b.onclick = () => openCellDialog!(cellMode);
     parent.append(b);
     continue;
   }
   bindings.push({button:b,source,command});if(source)registerMenuDemand(source,b);parent.append(b);
   b.onclick=()=>{refreshRoot();if(b.disabled||busy())return;
    const action=nativeAction(source);
    if(action?.kind==='edit'){ports!.invokeEdit(action.id);return;}
    if(action?.kind==='table'){ports!.invokeTable(action.id);return;}if(command==='edit:goto'){root.open=false;source!.click();return;}if(command==='view:zoom-dialog'){root.open=true;source!.click();const slot=root.querySelector<HTMLElement>('[data-view-slot="zoom"]')!;retained.after(slot);slot.hidden=false;slot.dataset.studioZoom='';slot.querySelector<HTMLInputElement>('input[aria-label="문서 배율 (%)"]')?.focus();return;}
    const preset=/^view:zoom-(50|75|125|150|200|300)$/.exec(command);if(preset){const input=root.querySelector<HTMLInputElement>('input[aria-label="문서 배율 (%)"]')!;input.value=preset[1];}
    source!.click();if(!doc.querySelector('dialog[open]')&&!root.querySelector('[data-studio-zoom]:not([hidden])')){root.open=false;focus();}};
  }
   // No leading, repeated or trailing separators after capability filtering.
   const visible=[...parent.children].filter(e=>e!==retained);
   for(let i=0;i<visible.length;i++)if(visible[i].tagName==='HR'&&(!i||i===visible.length-1||visible[i-1].tagName==='HR'))visible[i].remove();
  };
  const range=name==='table'?sources.get('table:range-size'):null;
  build(panel,range&&!range.hidden?[...rows,{label:'선택 범위 크기 조절…',command:'table:range-size'}]:rows);
  // Keep the actual supported object selector reachable on demand. The
  // Studio static catalog has no proxy for this disclosure (it is not a button).
  if(active&&name==='insert'){const clipboard=retained.querySelector('#object-clipboard-menu');if(clipboard)panel.append(clipboard);}
  const entries=bindings.slice(start);
  if(active){
    const reflect=()=>refresh(entries);
    // Backing DOM is never observed for the logical edit/table commands.
    // Other legacy sources remain compatible, observed only during disclosure.
    let observer:MutationObserver|undefined;
    refreshRoot=reflect;
    const watch=()=>{
      observer?.disconnect();observer=undefined;
      if(!root.open||root.hidden)return;
      const nodes=new Set(entries.map(e=>e.source).filter(s=>s&&!nativeAction(s)));
      if(nodes.size){observer=new MutationObserver(()=>{if(root.open)reflect();});for(const node of nodes)observer.observe(node!,{attributes:true,attributeFilter:['disabled','title','aria-pressed']});}
      reflect();
    };
    const summary=root.querySelector(':scope>summary')!;
    const before=()=>{if(!root.open){if(name==='edit')root.dispatchEvent(new Event('rhwp:menu-opening'));else reflect();}};
    root.addEventListener('rhwp:menu-opening',reflect);
    summary.addEventListener('click',before);root.addEventListener('toggle',watch);
    const stop=subscribeWhileOpen(doc,root,reflect,false);
    disposers.push(()=>{stop();observer?.disconnect();summary.removeEventListener('click',before);root.removeEventListener('toggle',watch);root.removeEventListener('rhwp:menu-opening',reflect);});
    watch();
  }
  const toggle=()=>{if(!active)refresh(bindings);if(!root.open){for(const d of panel.querySelectorAll<HTMLDetailsElement>('.studio-submenu'))d.open=false;const zoom=panel.querySelector<HTMLElement>('[data-studio-zoom]');if(zoom){retained.append(zoom);zoom.hidden=true;}}};root.addEventListener('toggle',toggle);disposers.push(()=>root.removeEventListener('toggle',toggle));
 }
 // Empty unsupported top menus are not placeholder features. Preserve their
 // backing nodes/handlers; File is never projected or filtered here.
 for(const id of ['workspace-6','workspace-7','workspace-help-menu']){const root=doc.getElementById(id) as HTMLDetailsElement|null;if(root){root.open=false;root.hidden=true;root.style.setProperty('display','none','important');}}
 const main=doc.getElementById('main-menu'),tools=doc.getElementById('workspace-8');
 if(main&&tools)for(const id of ['file-menu','edit-menu','view-menu','insert-menu','format-menu','page-menu','table-menu','workspace-7','workspace-8']){const root=doc.getElementById(id);if(root&&root.parentElement===main)main.append(root);}
 function refresh(rows:Binding[]){let edits:ReturnType<CommandPorts['edit']>|undefined,tables:ReturnType<CommandPorts['table']>|undefined,paragraph:FormatState|undefined;
 for(const{button,source,command}of rows){const action=nativeAction(source);
 const reason=action?(action.kind==='edit'?(edits??=ports!.edit()).get(action.id):(tables??=ports!.table()).get(action.id))||'':!source?(command==='insert:shape'?'Studio는 도형 그리기를 지원하지만 현재 Edit에는 연결되어 있지 않습니다. 글상자는 별도 메뉴를 사용하세요.':'현재 Edit에서 지원하지 않는 명령입니다.'):source.disabled?source.title||'현재 선택에서 사용할 수 없습니다.':busy()?'열린 작업을 마친 뒤 사용하세요.':'';const disabled=!!reason;if(button.disabled!==disabled)button.disabled=disabled;if(button.getAttribute('aria-disabled')!==String(disabled))button.setAttribute('aria-disabled',String(disabled));if(button.title!==reason)button.title=reason;const alignment = active && ports && command.startsWith('format:align-') ? command.slice('format:align-'.length) : undefined;
   if (alignment && paragraph === undefined) {
     try { paragraph = ports!.paragraphDisplay(); } catch { paragraph = {}; }
   }
   const checked = alignment ? formatToggleState(paragraph ?? {}, 'alignment', alignment).pressed
     : action?.kind === 'table' ? ports!.tablePressed(action.id) : source?.getAttribute('aria-pressed');
   const role = checked == null ? 'menuitem' : 'menuitemcheckbox';
   if (button.getAttribute('role') !== role) button.setAttribute('role', role);
   if (checked == null) button.removeAttribute('aria-checked');
   else if (button.getAttribute('aria-checked') !== checked) button.setAttribute('aria-checked', checked);
  }
 }
 if(!active){const observer=new MutationObserver(()=>refresh(bindings));for(const source of new Set(bindings.map(binding=>binding.source)))if(source)observer.observe(source,{attributes:true,attributeFilter:['disabled','title','aria-pressed']});refresh(bindings);disposers.push(()=>observer.disconnect());}
 return {dispose(){for(const stop of disposers)stop();}};
}
