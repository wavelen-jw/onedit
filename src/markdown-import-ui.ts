import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import {analyzeMarkdown,decodeMarkdownFile,markdownLimits,type MarkdownPlan} from './markdown-import.js';
import type {FileLifecycle} from './file-lifecycle.js';
import type {NextHostAdapter} from './host.js';
import {sameFormatTarget} from './integration/a-format-input-guard.js';
import type {Interaction} from './interaction.js';

/** One draft dialog for text and files; the existing generator/lifecycle owns adoption. */
export function installMarkdownImport(host:NextHostAdapter,files:FileLifecycle){
  if(!files.ui.standalone||document.getElementById('markdown-import-open'))return;
  const doc=document,button=doc.createElement('button');button.id='markdown-import-open';button.type='button';button.textContent='마크다운 가져오기';button.setAttribute('role','menuitem');
  queueMicrotask(()=>doc.querySelector('#file-menu [data-file-entry="o"]')?.after(button));
  const open=doc.querySelector<HTMLInputElement>('#open');
  if(open){const sync=()=>{button.disabled=open.disabled;};sync();new MutationObserver(sync).observe(open,{attributes:true,attributeFilter:['disabled']});}
  const inputFocus=()=>doc.getElementById('input')?.focus({preventScroll:true});
  const show=(captured=host.editor.capture())=>{
    if(button.disabled||files.busy||doc.querySelector('dialog[open]')||!sameFormatTarget(captured,host.editor.capture()))return;
    const context={documentId:host.adapter.documentId,expectedRevision:host.adapter.revision};
    const current=()=>sameFormatTarget(captured,host.editor.capture())&&host.adapter.documentId===context.documentId&&host.adapter.revision===context.expectedRevision;
    const dialog=doc.createElement('dialog');dialog.id='markdown-import-dialog';dialog.className='markdown-import';dialog.setAttribute('aria-label','마크다운 가져오기');
    const form=doc.createElement('form'),title=doc.createElement('h2');title.textContent='마크다운 가져오기';
    const label=doc.createElement('label'),source=doc.createElement('textarea');label.textContent='마크다운 내용';source.id='markdown-source';source.name='markdown';source.rows=10;source.placeholder='여기에 마크다운을 붙여넣으세요.';label.className='markdown-source-label';label.htmlFor=source.id;
    const picker=doc.createElement('input');picker.id='markdown-file';picker.type='file';picker.accept='.md,.markdown,text/markdown';picker.hidden=true;
    const status=doc.createElement('p');status.id='markdown-status';status.setAttribute('role','status');status.hidden=true;
    const footer=doc.createElement('footer');footer.className='markdown-import-footer';
    const attach=doc.createElement('button');attach.type='button';attach.id='markdown-attach';attach.textContent='.md 파일 선택';attach.className='markdown-file-choose';
    const cancel=doc.createElement('button');cancel.type='button';cancel.id='markdown-cancel';cancel.textContent='취소';
    const submit=doc.createElement('button');submit.type='submit';submit.id='markdown-import-apply';submit.className='primary';submit.textContent='가져오기';
    const confirm=doc.createElement('button');confirm.type='button';confirm.id='markdown-confirm-literals';confirm.textContent='원문 표기를 유지하여 가져오기';confirm.hidden=true;
    let busy=false,choice:{source:string;plan:MarkdownPlan}|undefined;
    const message=(s:string)=>{status.textContent=s;status.hidden=!s;};
    const lock=(value:boolean)=>{busy=value;source.disabled=attach.disabled=submit.disabled=cancel.disabled=confirm.disabled=value;};
    const create=async(text:string,plan:MarkdownPlan)=>{
      if(busy)return;lock(true);
      try{
        if(!current())throw Error('문서가 변경되었습니다. 다시 가져오세요.');
        // The normal file transition owns preflight and atomic replacement.
        // Ordinary editor commands retain one live import Undo entry.
        closeEditorDialog(dialog, false);if(await files.openMarkdownCommands({source:text,mode:'report',acceptedDiagnostics:plan.diagnostics.map(d=>d.id),fitShortLastLine:true},context))host.binding=null;
      }catch(error){if(dialog.open){message(String(error).replace(/^Error: /,''));lock(false);}else files.ui.error(error);}
      finally{if(!doc.querySelector('dialog[open]')&&!files.busy)inputFocus();}
    };
    const select=(text:string)=>{
      if(busy)return;
      try{
        if(!current())throw Error('문서가 변경되었습니다. 다시 가져오세요.');
        if(text.length>markdownLimits.characters)throw Error('마크다운은 100,000자 이하만 지원합니다.');
        const plan=analyzeMarkdown({source:text,mode:'report'}),error=plan.diagnostics.find(d=>d.severity==='error');if(error)throw Error(error.message);
        const presentation=new Set(['HEADING_PRESENTATION','LITERAL_LIST_MARKERS','REPORT_PRESENTATION','RULE_LITERAL']);
        if(plan.diagnostics.some(d=>!presentation.has(d.code))){
          choice={source:text,plan};confirm.hidden=false;
          message('그림·링크·HTML 등 지원하지 않는 요소는 실행하거나 내려받지 않고 원문 표기로 보존합니다. 확인 후 가져오세요.');confirm.focus();return;
        }
        void create(text,plan);
      }catch(error){message(String(error).replace(/^Error: /,''));}
    };
    source.addEventListener('input',()=>{choice=undefined;confirm.hidden=true;message('');});
    form.onsubmit=e=>{e.preventDefault();select(source.value);};
    attach.onclick=()=>{if(!busy)picker.click();};
    picker.oncancel=()=>{if(!busy&&dialog.open)source.focus();};
    const acceptFile=async(file:File|undefined)=>{if(!file||busy)return;lock(true);
      try{
        if(!/\.(md|markdown)$/i.test(file.name)||file.size>400000)throw Error('400KB 이하의 UTF-8 .md 파일을 선택하세요.');
        const text=decodeMarkdownFile(new Uint8Array(await file.arrayBuffer()));
        if(!dialog.open)return;if(!current())throw Error('문서가 변경되었습니다. 다시 가져오세요.');
        source.value=text;choice=undefined;confirm.hidden=true;lock(false);select(text);
      }catch(error){if(dialog.open){message(String(error).replace(/^Error: /,''));lock(false);}}
    };
    picker.onchange=()=>{const file=picker.files?.[0];picker.value='';void acceptFile(file);};
    dialog.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
    dialog.addEventListener('drop',e=>{const files=e.dataTransfer?.files;if(!files?.length)return;e.preventDefault();if(busy)return;if(files.length!==1){message('마크다운 파일을 하나만 선택하세요.');return;}void acceptFile(files[0]);});
    confirm.onclick=()=>{if(choice&&source.value===choice.source)void create(choice.source,choice.plan);};
    cancel.onclick=()=>closeEditorDialog(dialog);dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    form.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'&&!e.isComposing&&!busy){e.preventDefault();closeEditorDialog(dialog);}});
    dialog.addEventListener('close',()=>{dialog.remove();if(!busy&&current()&&!files.busy&&!doc.querySelector('dialog[open]'))inputFocus();});
    footer.append(attach,cancel,submit);form.append(title,label,source,picker,status,confirm,footer);dialog.append(form);doc.body.append(dialog);
    doc.querySelectorAll('#main-menu details[open]').forEach(d=>d.removeAttribute('open'));showEditorDialog(dialog);source.focus();
  };
  button.onclick=()=>show();doc.addEventListener('rhwp:markdown-import',event=>{const e=event as CustomEvent<ReturnType<Interaction['capture']>>;if(e.detail)show(e.detail);});
}
