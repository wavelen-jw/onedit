import type { RhwpAdapter } from './adapter.js';
import { printSnapshot } from './print-preview.js';
import { createPrintSurface } from './print-surface.js';
import { allFontSupply } from './font-provider.js';

/** Direct browser print settings; reuse the verified vector/font/resource path. */
export function mountNativePrint(doc: Document, adapter: RhwpAdapter, done: () => void, error: (e: unknown) => void) {
  const status = doc.createElement('div');status.id = 'native-print-status';status.hidden = true;
  const label = doc.createElement('span');label.setAttribute('role', 'status');
  const cancel = doc.createElement('button');cancel.type = 'button';cancel.textContent = '준비 취소';status.append(label, cancel);
  const stage = doc.createElement('div');stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none';
  doc.body.append(status, stage);
  let generation = 0, disposed = false, identity: string | undefined;
  let surface: ReturnType<typeof createPrintSurface> | undefined, unbind: (() => void) | undefined;
  const currentIdentity = () => `${adapter.documentId}:${adapter.revision}`;
  const release = () => { generation++;identity=undefined;unbind?.();unbind=undefined;surface?.dispose();surface=undefined;status.hidden=true;done(); };
  cancel.onclick = release;
  const esc = (e: KeyboardEvent) => {
    if (identity && !cancel.hidden && e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();e.stopPropagation();release();
    }
  };
  doc.addEventListener('keydown', esc, true);
  return {
    get busy() { return identity !== undefined; },
    sync() { if (identity && identity !== currentIdentity()) release(); },
    async print() {
      if (disposed || identity) return;
      const ticket = ++generation;identity=currentIdentity();status.hidden=false;cancel.hidden=false;label.textContent='인쇄 자료 준비 중…';
      try {
        // Yield only a paint opportunity; no second application settings dialog.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if (disposed || ticket !== generation) return;
        const snapshot = printSnapshot(adapter, '');
        const first=snapshot.pages[0];
        if(snapshot.pages.some(p=>p.width!==first.width||p.height!==first.height)) throw Error('혼합 용지 크기 출력은 아직 지원하지 않습니다.');
        const prepared=createPrintSurface(stage,snapshot.pages);surface=prepared;
        await prepared.ready;
        if(disposed || ticket!==generation || surface!==prepared) return;
        if(identity!==currentIdentity()) { release();return; }
        if(allFontSupply().some(f=>f.status==='loading')) throw Error('글꼴을 준비하는 중입니다. 잠시 후 다시 인쇄하세요.');
        const win=prepared.frame.contentWindow!;
        const after=()=>{if(surface===prepared)release();};
        win.addEventListener('afterprint',after);unbind=()=>win.removeEventListener('afterprint',after);
        cancel.hidden=true;label.textContent='인쇄 창에서 프린터·쪽 범위·매수·PDF 저장을 선택하세요.';
        prepared.print();
        // Some browsers return before afterprint; retain the output until that
        // event (or document replacement/disposal), never dispose on a timer.
      } catch(e) {
        if(ticket===generation&&!disposed){release();error(e);}
      }
    },
    dispose() { disposed=true;doc.removeEventListener('keydown',esc,true);release();status.remove();stage.remove(); },
  };
}
