import { closeEditorDialog, showUtilityDialog } from "./editor-popup-focus.js";
import {localFontNames,localFontState,redetectLocalFonts,clearLocalFontNames} from './local-font-access.js';
import {configuredFontFamilies,requestedFontDescriptions,allFontSupply,localFontCoreStatus} from './font-provider.js';
import type {Interaction} from './interaction.js';

export function mountLocalFontSettings(doc:Document,editor:Interaction,actions:{busy:()=>boolean}){
  const launchers=[...doc.querySelectorAll<HTMLButtonElement>('[data-local-font-settings]')];if(!launchers.length)return;
  for(const launch of launchers){launch.disabled=false;launch.setAttribute('aria-disabled','false');launch.title='설치 글꼴 감지와 목록 갱신';launch.setAttribute('aria-description',launch.title);}
  const dialog=doc.createElement('dialog');dialog.id='local-font-settings';dialog.className='manager-dialog';dialog.setAttribute('aria-label','환경 설정');
  const body=doc.createElement('div'),title=doc.createElement('h2'),heading=doc.createElement('h3'),note=doc.createElement('p'),status=doc.createElement('p'),list=doc.createElement('ul'),footer=doc.createElement('div');
  title.textContent='환경 설정';heading.textContent='로컬 글꼴';note.textContent='PC에 설치된 글꼴을 목록에 추가합니다. 브라우저에서 허용한 글꼴만 읽으며, 글꼴 파일은 서버로 보내지 않습니다. 원본 글꼴 지정과 문서는 바꾸지 않습니다.';note.className='manager-note';status.setAttribute('role','status');list.setAttribute('aria-label','감지한 설치 글꼴');list.style.cssText='max-height:240px;overflow:auto';footer.className='manager-footer';
  const button=(id:string,label:string)=>{const b=doc.createElement('button');b.id=id;b.type='button';b.textContent=label;footer.append(b);return b;};
  const detect=button('local-font-redetect','로컬 글꼴 재감지'),clear=button('local-font-clear','감지 결과 초기화'),close=button('local-font-close','닫기');
  const sync=()=>{const state=localFontState();detect.disabled=clear.disabled=state.busy;status.textContent=state.busy?'글꼴 감지 중…':state.message;list.replaceChildren(...localFontNames().map(name=>{const item=doc.createElement('li');item.textContent=name;return item;}));};
  detect.onclick=()=>{const candidates=[...configuredFontFamilies,'HY헤드라인M',...requestedFontDescriptions(editor.adapter).map(n=>n.split(' — ')[0])];void redetectLocalFonts(candidates);};
  clear.onclick=()=>{clearLocalFontNames();sync();};close.onclick=()=>closeEditorDialog(dialog);
  doc.addEventListener('rhwp:local-fonts-updated',sync);
  const diagnostics=doc.createElement('details'),summary=doc.createElement('summary'),data=doc.createElement('pre');summary.textContent='글꼴 진단';data.style.cssText='white-space:pre-wrap;max-height:240px;overflow:auto';diagnostics.append(summary,data);
  diagnostics.ontoggle=()=>{if(diagnostics.open)data.textContent=JSON.stringify({requested:requestedFontDescriptions(editor.adapter),supply:allFontSupply(),registeredCSS:[...doc.fonts].map(f=>({family:f.family,weight:f.weight,style:f.style,status:f.status})),localCore:localFontNames().map(family=>({family,status:localFontCoreStatus(family,editor.adapter.doc)})),actualFaceAndGlyphCoverage:'별도 관측 필요'},null,2);};
  body.append(title,heading,note,status,list,diagnostics,footer);dialog.append(body);doc.body.append(dialog);
  for(const launch of launchers)launch.onclick=()=>{if(actions.busy()||doc.querySelector('dialog[open]'))return;doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));sync();showUtilityDialog(dialog, launch);detect.focus();};
}
