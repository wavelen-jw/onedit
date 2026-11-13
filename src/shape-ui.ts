import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import type { Command } from "./model.js";
import type { Interaction } from './interaction.js';
import { mountHancomObjectDialog, resetHancomObjectDialog } from './hancom-object-dialog.js';
import { shapeCatalog, textboxInsertReason, shapeSizeHu, type ShapeTarget } from './shapes.js';
import { formatInputGuard, sameFormatTarget } from './integration/a-format-input-guard.js';

export function mountShapes(host: HTMLElement, editor: Interaction, actions: {
  execute?:(command:Command,target:ReturnType<Interaction["capture"]>)=>void;
  busy: () => boolean; changed: () => void; focus: () => void; error: (e: unknown) => void;
  copy?:()=>void; cut?:()=>void;
}) {
  const menu = document.createElement('details'); menu.id = 'shape-menu';
  const summary = document.createElement('summary'); summary.textContent = '도형·글상자';
  const list = document.createElement('select'); list.setAttribute('aria-label', '기존 본문 도형 선택');
  const properties = document.createElement('button'); properties.textContent = '개체 속성…'; properties.id = 'shape-properties';
  const copyButton=document.createElement('button');copyButton.textContent='글상자 복사';copyButton.id='shape-copy';
  const cutButton=document.createElement('button');cutButton.textContent='글상자 잘라내기';cutButton.id='shape-cut';
  const insert = document.createElement('button'); insert.id = 'textbox-insert-open'; insert.textContent = '글상자 넣기…';
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  menu.append(summary, insert, list, properties, copyButton, cutButton, status); host.append(menu);
  const dialog = document.createElement('dialog'); dialog.id = 'shape-dialog'; dialog.className = 'manager-dialog'; dialog.setAttribute('aria-label', '기존 개체 크기');
  const form = document.createElement('form'); form.id = 'shape-form';
  const title = document.createElement('h2'); title.textContent = '기존 개체 크기';
  const width = document.createElement('input'), height = document.createElement('input');
  for (const field of [width, height]) { field.type = 'number'; field.min = '2'; field.max = '720'; field.step = '0.01'; }
  width.name = 'shapeWidth'; height.name = 'shapeHeight';
  const ratio = document.createElement('input'); ratio.type = 'checkbox'; ratio.name = 'shapeRatio';
  const label = (text: string, field: HTMLElement) => { const l = document.createElement('label'); l.textContent = text; l.append(field); return l; };
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  const note = document.createElement('p'); note.textContent = '본문 빈 글상자 넣기와 글 앞으로 배치 글상자의 크기 늘리기를 지원합니다(1pt=100HU). 일반 글상자 내용은 선택 후 Enter 또는 내용 편집 메뉴에서 편집합니다. 축소·배치·캡션·그룹·셀 내부·OLE·글맵시는 미지원이며 기존 내용은 보존합니다. 기존 사각형 크기 편집은 유지합니다. 캔버스 선택·이동은 미지원입니다.';
  const ok = document.createElement('button'); ok.type = 'submit'; ok.id = 'shape-apply'; ok.textContent = '적용';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.id = 'shape-cancel'; cancel.textContent = '취소';
  form.append(title, label('너비(pt)', width), label('높이(pt)', height), label('가로 세로 비율 유지', ratio), message, note, ok, cancel);
  dialog.append(form); document.body.append(dialog);
  const guard = formatInputGuard(form);
  let localComposing = false;
  form.addEventListener('compositionstart', () => { localComposing = true; });
  form.addEventListener('compositionend', () => { localComposing = false; });
  let inserting = false;
  let selected: ShapeTarget | undefined, ownerDocument = '', capture: ReturnType<Interaction['capture']> | undefined, factor = 1;
  let lineDraft: (() => { borderColor?: number; borderWidth?: number; lineType?: number; roundRate?: number; fillBgColor?: number }) | undefined;
  const key = (t: ShapeTarget) => `${t.sec}:${t.para}:${t.control}:${t.instanceId}:${t.scInstId}`;
  // Structural visibility only: no computed-style/layout read on native input.
  const listVisible = () => {
    for (let n: HTMLElement | null = list; n; n = n.parentElement) {
      if (n.hidden || n instanceof HTMLDetailsElement && !n.open) return false;
    }
    return true;
  };
  const projectOptions = (rows: ReturnType<typeof shapeCatalog>) => {
    const options = list.options;
    const same = (o: HTMLOptionElement, value: string, text: string) =>
      o.parentNode === list && o.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
      o.localName === 'option' && o.attributes.length === 1 && o.getAttribute('value') === value &&
      o.value === value && o.childNodes.length === 1 && o.firstChild?.nodeType === 3 && o.firstChild.nodeValue === text;
    if (options.length === rows.length + 1 && list.childNodes.length === options.length &&
        same(options[0], '', '기존 본문 도형 선택') && rows.every((r, i) =>
          same(options[i + 1], key(r.target), `${r.name} · ${r.target.sec + 1}구역 ${r.target.para + 1}문단${r.reason ? ' (편집 제한)' : ''}`))) return;
    list.replaceChildren(new Option('기존 본문 도형 선택', ''));
    for (const r of rows) list.add(new Option(`${r.name} · ${r.target.sec + 1}구역 ${r.target.para + 1}문단${r.reason ? ' (편집 제한)' : ''}`, key(r.target)));
  };
  const busy = () => actions.busy() || Array.from(document.querySelectorAll('dialog[open]')).some(d => d !== dialog);
  const sync = (eagerList = false, command = false) => {
    try {
      if (ownerDocument !== editor.adapter.documentId) { selected = undefined; ownerDocument = editor.adapter.documentId; list.replaceChildren(); }
      const s = editor.selection;
      if (selected && (!['caret','object'].includes(s.kind) || s.focus.kind !== 'body' ||
          s.focus.sec !== selected.sec || s.focus.para !== selected.para || (s.kind === 'object' && s.control !== selected.control))) selected = undefined;
      const showList = eagerList || listVisible();
      // Hidden, untargeted options are not command admission. Existing explicit
      // objects/drafts stay fresh; textbox insertion keeps its independent guard.
      const rows = showList || command || dialog.open || selected || s.kind === 'object' ? shapeCatalog(editor.adapter) : [];
      if (showList) projectOptions(rows);
      // An exact existing object selection is a property target as well. Never
      // infer a shape from an ordinary caret in a shared owner paragraph.
      if (s.kind === 'object' && s.focus.kind === 'body') selected = rows.find(r => r.target.sec === s.focus.sec && r.target.para === s.focus.para && r.target.control === s.control)?.target;
      const row = rows.find(r => selected && key(r.target) === key(selected));
      if (!row || !['caret','object'].includes(s.kind) || s.focus.kind !== 'body' || s.focus.sec !== row.target.sec || s.focus.para !== row.target.para || (s.kind==='object'&&s.control!==row.target.control)) selected = undefined;
      list.value = selected ? key(selected) : '';
      const reason = busy() ? '현재 입력·대화상자·파일 작업을 마친 후 사용하세요.' :
        editor.adapter.scope !== 'edit' || editor.adapter.documentLocked ? '읽기 전용 문서입니다.' : row?.reason || (!selected ? '목록에서 기존 본문 개체를 선택하세요.' : '');
      const insertReason = busy() ? '현재 입력·대화상자·파일 작업을 마친 후 사용하세요.' : textboxInsertReason(editor.adapter, s);
      insert.disabled = !!insertReason; insert.title = insertReason;
      list.disabled = busy(); properties.disabled = !!reason; properties.title = reason; status.textContent = reason;
      copyButton.disabled=busy()||!selected||row?.name!=='글상자'||!actions.copy;
      cutButton.disabled=copyButton.disabled||!actions.cut||editor.adapter.scope!=='edit'||editor.adapter.documentLocked;
    } catch (e) { selected = undefined; insert.disabled = properties.disabled = list.disabled = copyButton.disabled = cutButton.disabled = true; insert.title = String(e); status.textContent = String(e); }
  };
  const menuToggle = (event: Event) => {
    if (event.target instanceof Element && event.target.contains(menu)) sync();
  };
  document.addEventListener('toggle', menuToggle, true);
  summary.addEventListener('pointerdown', () => sync(true));
  summary.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.isComposing && e.keyCode !== 229) sync(true);
  });
  for (const event of ['focus', 'pointerdown', 'keydown']) list.addEventListener(event, () => sync(true));
  copyButton.onclick=()=>{try{
    sync(false,true);if(copyButton.disabled||!selected)return;
    editor.selection={kind:'object',focus:{kind:'body',sec:selected.sec,para:selected.para,offset:0},control:selected.control};
    actions.changed();actions.focus();actions.copy?.();
  }catch(e){actions.error(e);}};
  cutButton.onclick=()=>{try{
    sync(false,true);if(cutButton.disabled||!selected)return;
    editor.selection={kind:'object',focus:{kind:'body',sec:selected.sec,para:selected.para,offset:0},control:selected.control};
    actions.changed();actions.focus();actions.cut?.();
  }catch(e){actions.error(e);}};
  list.onchange = () => {
    try {
      if (busy()) throw Error('현재 작업을 마친 후 선택하세요.');
      const row = shapeCatalog(editor.adapter).find(r => key(r.target) === list.value);
      if (!row) { selected = undefined; sync(); return; }
      selected = row.target; ownerDocument = editor.adapter.documentId;
      // The list selects a property target, not an unverified canvas hit region.
      editor.point({ kind: 'body', sec: selected.sec, para: selected.para, offset: 0 });
      actions.changed(); actions.focus(); sync();
    } catch (e) { actions.error(e); sync(); }
  };
  insert.onclick = () => {
    try {
      sync(false,true); if (insert.disabled) throw Error(insert.title);
      resetHancomObjectDialog(form); lineDraft = undefined; inserting = true; capture = editor.capture(); title.textContent = '글상자 넣기';
      width.min = '10.21'; height.min = '2'; width.value = '72'; height.value = '36'; factor = 2; ratio.checked = true; message.textContent = '';
      guard.open(); showEditorDialog(dialog); width.focus();
    } catch(e) { actions.error(e); }
  };
  properties.onclick = () => {
    try {
      sync(false,true); if (properties.disabled || !selected) throw Error(status.textContent || '개체를 다시 선택하세요.');
      const row = shapeCatalog(editor.adapter).find(r => key(r.target) === key(selected!))!;
      resetHancomObjectDialog(form); editor.adapter.assertEditable(editor.selection.focus); capture = editor.capture(); inserting = false; title.textContent = row.name + ' 크기';
      width.min = String(row.name === '글상자' ? row.props.width / 100 : 2); height.min = String(row.name === '글상자' ? row.props.height / 100 : 2);
      width.value = String(row.props.width / 100); height.value = String(row.props.height / 100);
      factor = row.props.width / row.props.height; ratio.checked = true; message.dataset.error='false'; message.textContent = '';
      const layout=row.name==='글상자'?mountHancomObjectDialog(form,'textbox',row.props,{title,width,height,ratio,message,note,ok,cancel,editLine:true}):undefined;
      lineDraft = layout?.line;
      guard.open(); showEditorDialog(dialog);if(layout)layout.focus();else width.focus();
    } catch (e) { actions.error(e); }
  };
  width.oninput = () => { if (ratio.checked && Number(width.value) > 0) height.value = (Math.round(Number(width.value) * 100 / factor) / 100).toString(); };
  height.oninput = () => { if (ratio.checked && Number(height.value) > 0) width.value = (Math.round(Number(height.value) * 100 * factor) / 100).toString(); };
  form.onsubmit = e => {
    e.preventDefault();
    try {
      if (!guard.ready()) return;
      if (busy()) throw Error('현재 작업을 마친 후 사용하세요.');
      if (!capture || (!inserting && !selected) || !sameFormatTarget(capture, editor.capture())) throw Error('문서·선택이 변경되었습니다. 다시 여세요.');
      if (!width.value.trim() || !height.value.trim()) throw Error('너비와 높이를 입력하세요.');
      const size = { width: shapeSizeHu(width.value), height: shapeSizeHu(height.value) };
      if (inserting) {
        const before = new Set(shapeCatalog(editor.adapter).map(r=>key(r.target)));
        (actions.execute??((command,target)=>editor.execute(command,target)))({ type: 'textbox-insert', change: size }, capture);
        selected = shapeCatalog(editor.adapter).find(r=>!before.has(key(r.target)))?.target;
      } else (actions.execute??((command,target)=>editor.execute(command,target)))({ type: 'shape-size', change: { target: selected!, ...size, ...lineDraft?.() } }, capture);
      guard.consume(); closeEditorDialog(dialog); actions.changed();
    } catch (e) { message.dataset.error='true'; message.textContent = String(e); }
  };
  cancel.onclick = () => closeEditorDialog(dialog);
  dialog.addEventListener('close', () => { if (dialog.open) return; capture = undefined; lineDraft = undefined; inserting = false; localComposing = false; guard.close(); sync(); });
  dialog.addEventListener('cancel', e => { if (localComposing) e.preventDefault(); });
  dialog.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229 || localComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEditorDialog(dialog); }
    if (e.key === 'Tab') {
      const controls = [...form.querySelectorAll<HTMLElement>('input,select,button')].filter(c=>!(c as HTMLInputElement).disabled&&c.tabIndex>=0&&c.getClientRects().length>0), at = controls.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); controls.at(-1)?.focus(); }
      else if (!e.shiftKey && at === controls.length - 1) { e.preventDefault(); controls[0]?.focus(); }
    }
  });
  // Presentation consumers may read only the existing explicit list target.
  // A caret in an object-owning paragraph never creates a property selection.
  const readSelected = () => {
    const s = editor.selection;
    if (!selected || ownerDocument !== editor.adapter.documentId || !['caret','object'].includes(s.kind) || s.focus.kind !== 'body'
      || s.focus.sec !== selected.sec || s.focus.para !== selected.para || (s.kind==='object'&&s.control!==selected.control)) return;
    return shapeCatalog(editor.adapter).find(row => key(row.target) === key(selected!));
  };
  sync(); return { sync, readSelected, showProperties:()=>{sync(false,true);properties.click();}, get open() { return dialog.open; }, dispose() { document.removeEventListener('toggle',menuToggle,true); selected = undefined; guard.close();resetHancomObjectDialog(form); dialog.remove(); menu.remove(); } };
}
