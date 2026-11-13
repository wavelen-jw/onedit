import type { Interaction } from "./interaction.js";
import type { Command } from "./model.js";
import { formatInputGuard, sameFormatTarget } from "./integration/a-format-input-guard.js";

/** Local controls only. Capture exact owner/revision before any user draft;
 * execute is the existing Command/History path, never a preview mutation. */
export function bindPanelDraft<T>(form: HTMLFormElement, editor: Interaction, options: {
  read: () => T; reset: (state:T) => void; reason: () => string;
  command: (initial:T) => Command | undefined;
  execute: (command:Command,target:ReturnType<Interaction["capture"]>) => void;
  focus: () => void; note: HTMLOutputElement; cancel: HTMLButtonElement; clear?: () => void;
}) {
  form.noValidate = true; form.dataset.ui2Draft = "";
  const guard = formatInputGuard(form);
  let initial: T, captured: ReturnType<Interaction["capture"]> | undefined, invalidated=false, applying=false;
  // A result belongs to one exact document/revision/selection, not a later owner.
  const resultKey=()=>JSON.stringify([editor.adapter.documentId,editor.adapter.revision,editor.selection]);
  let result: {key:string; text:string; kind:string} | undefined;
  const feedback = (text:string,kind:string) => {
    result={key:resultKey(),text,kind};
    options.note.textContent=text;options.note.dataset.result=kind;
  };
  const controls = [...form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>("input,select,button")];
  const titles = new Map(controls.map(c => [c,c.title]));
  const reset = () => { initial = options.read(); options.reset(initial); options.clear?.(); };
  const current = () => !!captured && sameFormatTarget(captured,editor.capture());
  const sync = () => {
    let reason="";
    try {
      if(result&&result.key!==resultKey()){
        result=undefined;options.note.textContent="대상이 바뀌었습니다. 현재 선택 값을 확인한 뒤 설정하세요.";
      }
      reason=options.reason();
      if (captured && !applying && (!current() || reason)) {
        captured=undefined; invalidated=true;guard.close();reset();options.note.textContent="선택·문서가 바뀌어 초안을 취소했습니다. 다시 선택하세요.";
      }
      if (!captured && !invalidated && !applying) reset();
    } catch(error) { reason=String(error);options.clear?.(); }
    for(const control of controls) { control.disabled=!!reason;control.title=reason||control.dataset.hint||titles.get(control)||"변경한 값만 설정 · Esc 취소"; }
    if(reason){options.note.textContent=reason;options.note.dataset.result="unavailable";}
    else if(result){options.note.textContent=result.text;options.note.dataset.result=result.kind;}
    else options.note.dataset.result=captured?"draft":"idle";
    options.note.title=options.note.textContent??"";
    return reason;
  };
  const cancel = (focus=true) => { captured=undefined;invalidated=false;guard.close();try{reset();}catch{options.clear?.();}feedback("초안을 취소했습니다. 원문은 유지됩니다.","cancelled");sync();if(focus)options.focus(); };
  form.addEventListener("rhwp:cancel-panel-draft",()=>cancel(false));
  form.addEventListener("focusin",e=>{
    if(e.relatedTarget instanceof Node&&form.contains(e.relatedTarget))return;
    if(sync())return;
    try{result=undefined;captured=editor.capture();invalidated=false;guard.open();options.note.textContent="초안 · 설정 전에는 문서를 변경하지 않습니다.";options.note.dataset.result="draft";}catch(error){options.note.textContent=String(error);}
  });
  form.addEventListener("focusout",e=>{if(!(e.relatedTarget instanceof Node&&form.contains(e.relatedTarget))&&(captured||invalidated))cancel(false);});
  form.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&!e.isComposing&&e.keyCode!==229){e.preventDefault();e.stopPropagation();cancel();}
    if(e.key==="Enter"&&(e.isComposing||e.keyCode===229||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey)){e.preventDefault();e.stopPropagation();}
  });
  form.onsubmit=e=>{
    e.preventDefault();
    let attempted=false;
    try {
      if(!guard.ready())return;
      if(invalidated||!current())throw Error("선택·문서가 바뀌었습니다. 편집기에서 다시 선택하세요.");
      const reason=options.reason();if(reason)throw Error(reason);
      const bad=controls.find(c=>c instanceof HTMLInputElement&&c.validity.badInput);if(bad){bad.focus();throw Error("숫자를 끝까지 입력하세요.");}
      const command=options.command(initial),target=captured!;
      const revision=editor.adapter.revision;
      if(command){attempted=true;applying=true;try{options.execute(command,target);}finally{applying=false;}}
      const changed=editor.adapter.revision!==revision;
      guard.consume();captured=undefined;invalidated=false;reset();feedback(changed?"설정했습니다. 실행 취소로 되돌릴 수 있습니다.":"변경 없음 · 기존 이력 유지",changed?"applied":"unchanged");options.focus();sync();
    }catch(error){feedback((attempted?"결과 확인 필요 · ":"적용하지 않았습니다 · ")+String(error),attempted?"unknown":"rejected");options.note.title=options.note.textContent??"";}
  };
  options.cancel.onclick=()=>cancel();
  return {sync, target:()=>{if(!current())throw Error("선택이 바뀌었습니다.");return captured!;},dispose(){guard.close();options.clear?.();}};
}
