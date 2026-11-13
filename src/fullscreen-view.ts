// Explicit View action only. Browser/user activation and embedding policy own
// admission; no keyboard lock, automatic entry, host mutation or new Core API.
export function mountEditorFullscreen(root:HTMLDetailsElement,busy:()=>boolean,error:(e:unknown)=>void){
  const doc=root.ownerDocument,button=doc.createElement('button');button.type='button';button.dataset.viewAction='fullscreen';button.textContent='전체 화면';button.setAttribute('role','menuitemcheckbox');let pending=false;
  const refresh=()=>{const reason=!doc.fullscreenEnabled||!doc.documentElement.requestFullscreen?'현재 브라우저/호스트가 전체 화면 API를 허용하지 않습니다. 메뉴와 문서 편집은 유지됩니다.':busy()?'현재 입력·대화상자를 마친 뒤 사용하세요.':pending?'전체 화면 전환 중입니다.':'';button.disabled=!!reason;button.title=reason||'명시적으로 전체 화면 전환 · Esc로 해제 · 키보드 잠금 없음';button.setAttribute('aria-disabled',String(!!reason));button.setAttribute('aria-pressed',String(doc.fullscreenElement===doc.documentElement));button.setAttribute('aria-checked',button.getAttribute('aria-pressed')!);};
  const changed=()=>{refresh();if(!doc.querySelector('dialog[open]'))doc.getElementById('input')?.focus({preventScroll:true});};
  button.onclick=()=>{refresh();if(button.disabled)return;root.open=false;pending=true;refresh();let request:Promise<void>;try{request=doc.fullscreenElement===doc.documentElement?doc.exitFullscreen():doc.documentElement.requestFullscreen();}catch(e){pending=false;refresh();error(e);return;}void request.catch(e=>error(Error('브라우저 전체 화면 전환이 거절되었습니다. 문서는 변경하지 않았습니다. '+String(e)))).finally(()=>{pending=false;changed();});};
  doc.addEventListener('fullscreenchange',changed);refresh();return{button,refresh,dispose(){doc.removeEventListener('fullscreenchange',changed);button.remove();}};
}
