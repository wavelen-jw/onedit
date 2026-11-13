import { closeEditorDialog, showDocumentEditingDialog, showUtilityDialog } from "./editor-popup-focus.js";
import { characterStatistics,characterCountPolicy } from './document-statistics.js';
import type {Interaction} from './interaction.js';
export function mountDocumentInfo(doc:Document,editor:Interaction,actions:{blocked:()=>boolean}){
  const dialog=doc.createElement('dialog');dialog.id='document-info';dialog.className='manager-dialog';dialog.setAttribute('aria-label','문서 정보 · 통계');
  const h=doc.createElement('h2');h.textContent='문서 정보 · 통계';const body=doc.createElement('dl'),note=doc.createElement('p');note.textContent='글자수는 문서의 본문·표·글상자 등 기존 Core Unicode 텍스트 조회 기준입니다. ' + characterCountPolicy + ' 글꼴 지정값과 실제 공급/대체 여부는 별도입니다.';
  note.className='manager-note';
  const footer=doc.createElement('div');footer.className='manager-footer';
  const close=doc.createElement('button');close.type='button';close.textContent='닫기';close.onclick=()=>closeEditorDialog(dialog);footer.append(close);dialog.append(h,body,note,footer);doc.body.append(dialog);
  const launch=doc.createElement('button');launch.type='button';launch.id='document-info-open';launch.hidden=true;launch.textContent='문서 정보…';doc.body.append(launch);
  function show(launcher:HTMLElement|null=null){if(actions.blocked()||dialog.open)return;editor.capture();const info=editor.adapter.call('getDocumentInfo');
    const statistics=characterStatistics(editor),count=statistics.sync();
    const values=[['글자수 (공백 포함)',count?count.total.toLocaleString()+'자':'집계 중'],['글자수 (공백 제외)',count?count.withoutSpaces.toLocaleString()+'자':'집계 중'],['형식 버전',typeof info.version==='string'?info.version:'미조회'],['구역 수',Number.isSafeInteger(info.sectionCount)?String(info.sectionCount):'미조회'],['쪽 수',Number.isSafeInteger(info.pageCount)?String(info.pageCount):'미조회'],['암호화',typeof info.encrypted==='boolean'?(info.encrypted?'예':'아니요'):'미조회'],['지정 글꼴',Array.isArray(info.fontsUsed)&&info.fontsUsed.every((v:unknown)=>typeof v==='string')?info.fontsUsed.join(', '):'미조회']];
    body.replaceChildren(...values.flatMap(([name,value])=>{const d=doc.createElement('dt'),v=doc.createElement('dd');d.textContent=name;v.textContent=value;return[d,v];}));doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));
    if (launcher) showUtilityDialog(dialog, launcher); else showDocumentEditingDialog(dialog);
    close.focus();}
  doc.addEventListener('rhwp:statistics',()=>{if(!dialog.open)return;const n=characterStatistics(editor).sync();if(n){const dd=body.querySelectorAll('dd');dd[0].textContent=n.total.toLocaleString()+'자';dd[1].textContent=n.withoutSpaces.toLocaleString()+'자';}});
  launch.onclick=()=>{const opener=doc.activeElement;show(opener instanceof HTMLElement?opener:null);};dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Tab'){e.preventDefault();close.focus();}});
  return{show,dispose(){dialog.remove();launch.remove();}};
}
