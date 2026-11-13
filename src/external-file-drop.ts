import type {FileLifecycle} from './file-lifecycle.js';
import type {Interaction} from './interaction.js';
import {copy,type Position} from './model.js';
import {sameFormatTarget} from './integration/a-format-input-guard.js';
import {pagePoint} from './integration/a-view-menu.js';
import {clipboardPicture,clipboardPictureSize,pasteFiles} from './clipboard-image.js';

type Body=Extract<Position,{kind:'body'}>;
type Actions={blocked:()=>boolean;imageBusy:(value:boolean)=>void;focus:()=>void};
// External File objects only. Internal object handles, text drags and URI lists
// never enter this route; no path/URL reads, OS clipboard calls or browser navigation.
export function mountExternalFileDrop(doc:Document,pages:HTMLElement,files:FileLifecycle,editor:Interaction,actions:Actions){
  const win=doc.defaultView!;
  let image:object|undefined;
  const isFile=(e:DragEvent)=>!!e.dataTransfer&&Array.from(e.dataTransfer.types).includes('Files');
  const pageAt=(e:DragEvent)=>{
    const page=(e.target instanceof Element?e.target.closest<HTMLElement>('.page'):null);
    return page&&pages.contains(page)?page:undefined;
  };
  const bodyAt=(e:DragEvent):Body=>{
    const page=pageAt(e);if(!page||page.hasAttribute('data-render-pending'))throw Error('그림은 표시된 본문 글줄에 놓으세요.');
    const index=Number(page.dataset.page),{x,y}=pagePoint(page,e.clientX,e.clientY),a=editor.adapter,info=a.call('getPageInfo',index);
    if(x<info.bodyLeft||x>info.bodyRight||y<info.headerArea.y+info.headerArea.height||y>=info.footerArea.y)
      throw Error('그림은 쪽 여백이 아닌 본문 글줄에 놓으세요.');
    if((a.call('getPageControlLayout',index).controls??[]).some((c:any)=>x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h))
      throw Error('표·개체 위 파일 드롭은 지원하지 않습니다. 본문 글줄에 놓으세요.');
    const p=a.hit(index,x,y);a.assertEditable(p);
    if(p.kind!=='body'||a.hasBodyLayoutObject(p))throw Error('그림 파일 드롭은 개체 없는 본문 문단에서 지원합니다.');
    const rect=a.rect(p);
    if(rect.pageIndex!==index||y<rect.y||y>rect.y+rect.height)throw Error('실제 본문 글줄에 놓으세요. 빈 영역에 새 문단을 만들지 않습니다.');
    return p;
  };
  const cancel=()=>{if(!image)return;image=undefined;actions.imageBusy(false);};
  const over=(e:DragEvent)=>{
    if(!isFile(e))return;e.preventDefault();
    if(e.dataTransfer)e.dataTransfer.dropEffect=!image&&!actions.blocked()&&!!pageAt(e)?'copy':'none';
  };
  const drop=(e:DragEvent)=>{
    if(!isFile(e))return;e.preventDefault();e.stopImmediatePropagation();
    // Snapshot Files synchronously: the native DataTransfer becomes protected
    // after this event returns. Exactly one file, never partial mixed batches.
    const incoming=pasteFiles(e.dataTransfer);
    if(image||actions.blocked()||files.state().transition)return;
    try{
      if(!pageAt(e))throw Error('파일은 문서 페이지 위에 놓으세요.');
      if(incoming.length!==1)throw Error('파일은 한 번에 한 개만 놓으세요. 혼합·복수 파일은 열거나 삽입하지 않습니다.');
      const file=incoming[0];
      if(/\.(hwp|hwpx)$/i.test(file.name)){
        doc.getElementById('error')?.setAttribute('hidden','');
        // Existing lifecycle owns input preflight, Save/Discard/Cancel,
        // checked save acknowledgment, stale-request rejection and replacement.
        void files.open(file).then(()=>actions.focus());return;
      }
      if(!/\.(png|jpe?g)$/i.test(file.name))throw Error('HWP/HWPX 문서 또는 PNG/JPEG 그림 한 개만 지원합니다.');
      const position=bodyAt(e),captured=editor.capture(),ticket={};image=ticket;actions.imageBusy(true);
      void(async()=>{
        try{
          const fileData=await clipboardPicture(file); // shared validated bytes/decode; no clipboard transport
          if(image!==ticket)return;
          if(!sameFormatTarget(captured,editor.capture())||editor.adapter.transientEdit||doc.querySelector('dialog[open]'))
            throw Error('파일을 읽는 동안 문서·선택이 변경되어 그림 삽입을 취소했습니다.');
          editor.adapter.assertEditable(position);
          const command={type:'picture' as const,change:{action:'insert' as const,file:fileData,...clipboardPictureSize(fileData),placement:'inline'}};
          const before={selection:copy(editor.selection),block:editor.block,typing:copy(editor.typing),preferredX:editor.preferredX};
          try{
            editor.selection=editor.history.atomic('file-picture-drop',before.selection,()=>{
              editor.point(position); // exact drop owner, inside the same rollback/History boundary
              editor.execute(command,{documentId:captured.documentId,revision:captured.revision,selection:{kind:'caret',focus:position}});
              editor.adapter.exportChecked();
              return copy(editor.selection);
            });
          }catch(error){Object.assign(editor,before);throw error;}
          doc.getElementById('error')?.setAttribute('hidden','');files.ui.change(true);actions.focus();
        }catch(error){if(image===ticket)files.ui.error(error);}
        finally{if(image===ticket){image=undefined;actions.imageBusy(false);}}
      })();
    }catch(error){files.ui.error(error);}
  };
  const escape=(e:KeyboardEvent)=>{if(!image||e.key!=='Escape'||e.isComposing)return;e.preventDefault();e.stopImmediatePropagation();cancel();actions.focus();};
  win.addEventListener('dragover',over,true);win.addEventListener('drop',drop,true);
  win.addEventListener('keydown',escape,true);win.addEventListener('blur',cancel);
  return()=>{cancel();win.removeEventListener('dragover',over,true);win.removeEventListener('drop',drop,true);win.removeEventListener('keydown',escape,true);win.removeEventListener('blur',cancel);};
}
