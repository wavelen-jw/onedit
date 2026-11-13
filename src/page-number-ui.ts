import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import {menuControlDemanded} from './menu-lifetime.js';
import type { Interaction } from './interaction.js';
import { formatInputGuard, sameFormatTarget } from './integration/a-format-input-guard.js';
import { visibleManagerControls } from './manager-layout.js';
import { pageNumberLimit, pageNumberReason, type PageNumberKind } from './page-number.js';

export function mountPageNumber(doc: Document, editor: Interaction, actions: {
  busy: () => boolean; page: () => number; changed: () => void; focus: () => void; error: (e: unknown) => void;
}) {
  const launch = doc.getElementById('page-number-open') as HTMLButtonElement;
  const dialog = doc.createElement('dialog'); dialog.id = 'page-number-dialog'; dialog.className = 'manager-dialog'; dialog.setAttribute('aria-label', '쪽 번호 필드 넣기');
  const form = doc.createElement('form'); form.id = 'page-number-form';
  const title = doc.createElement('h2'); title.textContent = '쪽 번호 필드 넣기';
  const label = doc.createElement('label'); label.textContent = '자동 번호 종류';
  const kind = doc.createElement('select'); kind.name = 'pageNumberKind';
  for (const [value, text] of [['page', '현재 쪽 번호'], ['total', '전체 쪽 수']]) {
    const option = doc.createElement('option'); option.value = value; option.textContent = text; kind.append(option);
  }
  label.append(kind);
  const preview = doc.createElement('p'); preview.setAttribute('role', 'status');
  const note = doc.createElement('p'); note.className = 'manager-note'; note.textContent = pageNumberLimit + ' 숫자는 본문 글자가 아니라 문서 쪽수에 따라 표시되는 필드입니다.';
  const footer = doc.createElement('div'); footer.className = 'manager-footer';
  const ok = doc.createElement('button'); ok.type = 'submit'; ok.id = 'page-number-apply'; ok.textContent = '넣기';
  const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소'; cancel.id = 'page-number-cancel'; footer.append(ok, cancel);
  form.append(title, label, preview, note, footer); dialog.append(form); doc.body.append(dialog);
  const guard = formatInputGuard(form);
  let captured: ReturnType<Interaction['capture']> | undefined;
  const blocked = () => actions.busy() || !!doc.querySelector('dialog[open]:not(#page-number-dialog)');
  const stale = () => !captured || !sameFormatTarget(captured, editor.capture());
  const sync = (force=false) => {
    if(!force&&!dialog.open&&!menuControlDemanded(launch)){launch.disabled=blocked();launch.title=pageNumberLimit;return;}
    const reason = blocked() ? '입력·저장·열린 대화상자를 먼저 마치세요.' : pageNumberReason(editor.adapter, editor.selection);
    launch.disabled = !!reason; launch.title = reason || pageNumberLimit;
    if (!dialog.open) return;
    const message = stale() ? '문서·리비전·선택이 변경되었습니다. 취소 후 다시 여세요.' : reason;
    ok.disabled = kind.disabled = !!message; ok.title = message;
    preview.textContent = message || `현재 ${actions.page() + 1}쪽 / 전체 ${editor.adapter.pageCount}쪽 · 본문 커서 위치에 삽입`;
  };
  launch.onclick = () => {
    sync(true); if (launch.disabled || dialog.open) return;
    try {
      captured = editor.capture(); kind.value = 'page'; guard.open();
      doc.querySelectorAll('#main-menu details[open]').forEach(d => d.removeAttribute('open'));
      showEditorDialog(dialog); sync(); kind.focus();
    } catch (error) { actions.error(error); }
  };
  const close = () => { guard.close(); captured = undefined; closeEditorDialog(dialog); };
  cancel.onclick = close;
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (dialog.open) return; guard.close(); captured = undefined; sync(); });
  form.onsubmit = e => {
    e.preventDefault(); if (!guard.ready()) return;
    try {
      if (blocked() || stale()) throw Error('문서·선택 또는 처리 상태가 변경되었습니다. 다시 여세요.');
      editor.execute({ type: 'page-number', kind: kind.value as PageNumberKind }, captured);
      guard.consume(); close(); actions.changed();
    } catch (error) { preview.textContent = String(error).replace(/^Error: /, ''); }
  };
  form.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.isComposing && e.keyCode !== 229) {
      const controls = visibleManagerControls(form), at = controls.indexOf(doc.activeElement as HTMLElement);
      if (controls.length && (at < 0 || (e.shiftKey ? at === 0 : at === controls.length - 1))) {
        e.preventDefault(); controls[e.shiftKey ? controls.length - 1 : 0].focus();
      }
    }
    e.stopPropagation();
  });
  const observer = new MutationObserver(()=>sync()); observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  sync(); return { sync };
}
