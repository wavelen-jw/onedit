import {bindEditorDialogFormSubmit, closeEditorDialog, showEditorDialog} from './editor-popup-focus.js';
import {formatInputGuard, sameFormatTarget} from './integration/a-format-input-guard.js';
import type {Interaction} from './interaction.js';
import {sameTable, type Command} from './model.js';
import {UnsupportedTableOperation} from './table-capability.js';
import {hasNativeTrackResize} from './table-track-resize.js';

export function tableRangeSizeReason(editor: Interaction) {
  if(!hasNativeTrackResize(editor.adapter))return '이 버전에서는 선택 범위의 크기를 직접 조절할 수 없습니다.';
  const s=editor.selection;
  if(s.kind!=='cells'||s.phase!==2||s.anchor.kind!=='cell'||s.focus.kind!=='cell'||
      s.anchor.cell===s.focus.cell||!sameTable(s.anchor,s.focus))
    return '같은 표에서 F5를 두 번 누른 뒤 방향키로 여러 셀을 선택하세요.';
  return '';
}

export function explicitTableRangeCommand(axis: string, input: string): Extract<Command,{type:'resize'}> {
  if(!/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(input)||!['row','column'].includes(axis))
    throw Error('변경할 크기를 소수 둘째 자리까지 pt 단위로 입력하세요.');
  const delta=Math.round(Number(input)*100);
  if(!delta||!Number.isSafeInteger(delta)||Math.abs(delta)>2147483647)
    throw Error('0이 아닌 유효한 변경량을 입력하세요.');
  return {type:'resize',nativeTrackKeys:true,nativeTrackRequired:true,
    width:axis==='column'?delta:0,height:axis==='row'?delta:0};
}

export function mountTableRangeSize(doc: Document, editor: Interaction,
    actions: {busy:()=>boolean; changed:()=>void; error:(e:unknown)=>void}) {
  const dialog=doc.createElement('dialog');
  dialog.id='table-range-size-dialog';
  dialog.className='manager-dialog';
  dialog.setAttribute('aria-labelledby','table-range-size-title');
  const form=doc.createElement('form');
  form.innerHTML='<h2 id="table-range-size-title">선택 범위 크기 조절</h2>'+
    '<label>방향 <select name="axis"><option value="row">높이</option><option value="column">너비</option></select></label>'+
    '<label>전체 변경량 (pt) <input type="number" name="delta" step="0.01" required aria-describedby="table-range-size-hint"></label>'+
    '<p id="table-range-size-hint">선택한 행 또는 열 전체에 나눠 적용합니다. 줄이려면 음수를 입력하세요.</p>'+
    '<p role="alert" data-range-size-status></p><footer class="dialog-actions"><button type="button">취소</button><button type="submit">적용</button></footer>';
  dialog.append(form);doc.body.append(dialog);
  const axis=form.querySelector<HTMLSelectElement>('select')!,delta=form.querySelector<HTMLInputElement>('input')!;
  const status=form.querySelector<HTMLElement>('[data-range-size-status]')!;
  const guard=formatInputGuard(form);
  bindEditorDialogFormSubmit(form);
  let captured:{target:ReturnType<Interaction['capture']>; adapter:Interaction['adapter'];
    native:Interaction['adapter']['doc'];generation:number}|undefined;
  const close=()=>closeEditorDialog(dialog);
  form.querySelector<HTMLButtonElement>('button[type="button"]')!.onclick=close;
  form.onsubmit=event=>{
    event.preventDefault();
    if(!guard.ready()||!dialog.open||actions.busy())return;
    try {
      const live=editor.capture();
      if(!captured||editor.adapter!==captured.adapter||editor.adapter.doc!==captured.native||
          editor.currentSelectionGeneration!==captured.generation||!sameFormatTarget(captured.target,live)||
          JSON.stringify(captured.target.paths)!==JSON.stringify(live.paths))
        throw Error('문서나 선택이 바뀌었습니다. 범위를 다시 선택하세요.');
      const reason=tableRangeSizeReason(editor);
      if(reason)throw Error(reason);
      const command=explicitTableRangeCommand(axis.value,delta.value);
      const revision=editor.adapter.revision;
      editor.execute(command,captured.target);
      guard.consume();
      try { if(editor.adapter.revision!==revision)actions.changed(); }
      finally { close(); }
    } catch(error) {
      status.textContent=error instanceof UnsupportedTableOperation&&error.code==='resize-track-postLayoutTrackMismatch'
        ? '이 값으로 조절하면 표의 배치가 요청과 달라 적용하지 않았습니다. 다른 값을 입력해 보세요.'
        : error instanceof Error?error.message:String(error);
    }
  };
  dialog.addEventListener('close',()=>{
    if(!dialog.open){guard.close();captured=undefined;}
  });
  return {
    show(target?:ReturnType<Interaction['capture']>){
      if(actions.busy()||dialog.open)return;
      try {
        const reason=tableRangeSizeReason(editor);
        if(reason)throw Error(reason);
        const live=editor.capture();
        if(target&&(!sameFormatTarget(target,live)||JSON.stringify(target.paths)!==JSON.stringify(live.paths)))
          throw Error('문서나 선택이 바뀌었습니다. 범위를 다시 선택하세요.');
        const adapter=editor.adapter;
        captured={target:live,adapter,native:adapter.doc,generation:editor.currentSelectionGeneration};
        axis.value='row'; delta.value=''; status.textContent='';
        guard.open();showEditorDialog(dialog);delta.focus();
      } catch(error) { actions.error(error); }
    },
    dispose(){guard.dispose();dialog.remove();},
  };
}
