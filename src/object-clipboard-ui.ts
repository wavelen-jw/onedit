import {activeWorkset} from './active-workset.js';
import {coreRuntimeObjectClipboardEpoch} from './core-runtime.js';
import {subscribeWhileOpen} from './ui-demand-lifetime.js';
import {menuControlDemanded, registerPopupLifetime} from './menu-lifetime.js';
import type {Interaction} from './interaction.js';
import {fragmentClipboardObjects} from './object-clipboard.js';

// Explicit object selection is not a guessed canvas hit or a new shape editor.
export function mountObjectClipboard(host:HTMLElement,editor:Interaction,actions:{busy:()=>boolean;changed:()=>void;focus:()=>void;copy:()=>void;error:(e:unknown)=>void}){
  const menu=document.createElement('details');menu.id='object-clipboard-menu';
  const title=document.createElement('summary');title.textContent='개체 복사';
  const list=document.createElement('select');list.id='object-clipboard-select';list.setAttribute('aria-label','본문·셀 개체 선택');
  const copy=document.createElement('button');copy.id='object-clipboard-copy';copy.textContent='선택 개체 복사';
  const note=document.createElement('span');note.textContent='기존 개체와 자원을 함께 복사합니다. 붙여넣기는 본문 또는 셀 문단 경계에서 실행하세요. 표차트·셀필드/양식은 제외합니다.';
  menu.append(title,list,copy,note);host.append(menu);
  const key=(r:ReturnType<typeof fragmentClipboardObjects>[number])=>JSON.stringify([r.sec,r.para,r.path,r.control]);
  const doc=host.ownerDocument,demand=activeWorkset(doc);
  if(demand)list.disabled=copy.disabled=true;
  let owner='';
  const stamp=()=>{const a=editor.adapter;return {core:a.doc,id:a.documentId,revision:a.revision,native:coreRuntimeObjectClipboardEpoch(a.doc)};};
  let issued:ReturnType<typeof stamp>|undefined;
  const checkIssued=()=>{
    if(!demand)return;
    const current=stamp();
    if(!menuControlDemanded(list)||!issued||issued.native===undefined||issued.core!==current.core||
      issued.id!==current.id||issued.revision!==current.revision||issued.native!==current.native)
      throw Error('개체 목록을 열었을 때의 문서 상태가 바뀌었습니다. 다시 열어 선택하세요.');
  };
  function sync(){
    if(!menu.open||demand&&!menuControlDemanded(list))return;
    issued=undefined;
    try{
      const s=editor.selection;
      const rows=fragmentClipboardObjects(editor.adapter);
      list.replaceChildren(new Option('복사할 개체 선택',''));
      for(const r of rows){const o=new Option(`${r.kind} · ${r.sec+1}구역 ${r.para+1}문단${r.focus.kind==='cell'?` · ${JSON.parse(r.path).map((p:any)=>`${p.cellIndex+1}번 셀`).join(' 안 ')} ${r.focus.cellPara+1}문단`:''} · 개체 ${r.control+1}`,key(r));o.disabled=r.locked||r.kind==='차트';list.add(o);}
      const row=rows.find(r=>s.kind==='object'&&s.focus.sec===r.sec&&s.focus.para===r.para&&(s.focus.kind==='cell'?editor.adapter.path(s.focus):'[]')===r.path&&s.control===r.control);
      list.value=row?key(row):'';owner=editor.adapter.documentId;
      if(demand)issued=stamp();
      list.disabled=actions.busy();copy.disabled=actions.busy()||!row||row.locked||row.kind==='차트';
    }catch(e){copy.disabled=list.disabled=true;note.textContent=String(e);}
  }
  if(!demand)menu.addEventListener('toggle',sync);
  list.onchange=()=>{try{
    if(actions.busy()||owner!==editor.adapter.documentId)throw Error('문서·작업 상태가 변경되었습니다. 다시 선택하세요.');
    checkIssued();
    const row=fragmentClipboardObjects(editor.adapter).find(r=>key(r)===list.value);if(!row)return;
    if(demand){
      // Re-reading rows can itself conservatively advance the wrapper epoch.
      // Check the catalogue at activation, then use this synchronous fresh
      // row before yielding. Actual clipboard execution validates again.
      const now=stamp();
      if(issued!.core!==now.core||issued!.id!==now.id||issued!.revision!==now.revision||!menuControlDemanded(list))
        throw Error('개체 선택 상태가 변경되었습니다. 목록을 다시 여세요.');
    }
    if(row.locked||row.kind==='차트')throw Error('현재 복사 지원 범위 밖의 개체입니다.');
    editor.selection={kind:'object',focus:row.focus,control:row.control};
    actions.changed();
    // ON's outside-focus owner closes disclosures; keep the select focused
    // until the user actually presses Copy or closes the menu.
    if(!demand)actions.focus();
    sync();
  }catch(e){actions.error(e);sync();}};
  copy.onclick=()=>{try{checkIssued();sync();if(copy.disabled)return;actions.focus();actions.copy();}catch(e){actions.error(e);}};
  const stop=demand?subscribeWhileOpen(doc,menu,sync,true,list):undefined;
  const unregister=demand?registerPopupLifetime(doc,{root:menu,close:()=>{menu.open=false;owner='';issued=undefined;},focus:actions.focus}):undefined;
  if(!demand)doc.addEventListener('rhwp:editor-state',sync);
  return {dispose(){stop?.();unregister?.();doc.removeEventListener('rhwp:editor-state',sync);menu.remove();}};
}
