import { closeEditorDialog, showEditorDialog } from "./editor-popup-focus.js";
import { activeWorkset, activeMenuDemand } from "./active-workset.js";
import type { Command } from "./model.js";
import type { Interaction } from './interaction.js';
import { mountHancomObjectDialog, resetHancomObjectDialog } from './hancom-object-dialog.js';
import { pictureCatalog, selectedPicture, pictureCanvasPlacement, pictureFile, imageDimensions, cellPictureSizeNote, type PictureFile, type PictureChange } from './pictures.js';
import { sameFormatTarget, formatInputGuard } from './integration/a-format-input-guard.js';
export function mountPictures(host:HTMLElement,editor:Interaction,actions:{execute?:(command:Command,target:ReturnType<Interaction["capture"]>)=>void;busy:()=>boolean;changed:()=>void;focus:()=>void;error:(e:unknown)=>void}) {
  const menu=document.createElement('details');menu.id='picture-menu';const summary=document.createElement('summary');summary.textContent='그림';
  const insert=document.createElement('button'),properties=document.createElement('button'),list=document.createElement('select'),status=document.createElement('span');
  insert.textContent='그림 넣기…';properties.textContent='그림 속성…';properties.id='picture-properties';list.setAttribute('aria-label','본문 그림 선택');
  menu.append(summary,insert,list,properties,status);host.append(menu);
  const dialog=document.createElement('dialog'),form=document.createElement('form');form.id='picture-form';dialog.id='picture-dialog';dialog.setAttribute('aria-label','그림 속성');
  const title=document.createElement('h2');title.textContent='그림 넣기 / 속성';
  const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg';file.setAttribute('aria-label','PNG 또는 JPEG 그림');
  const label=(text:string,control:HTMLElement)=>{const l=document.createElement('label');l.textContent=text;l.append(control);return l;};
  const width=document.createElement('input'),height=document.createElement('input');for(const c of [width,height]){c.type='number';c.min='1';c.max='720';c.step='0.01';}
  const ratio=document.createElement('input');ratio.type='checkbox';ratio.checked=true;
  const placement=document.createElement('select');placement.setAttribute('aria-label','배치');for(const [v,t]of [['inline','글자처럼 취급'],['Square','어울림'],['TopAndBottom','자리 차지'],['BehindText','글 뒤로'],['InFrontOfText','글 앞으로']])placement.add(new Option(t,v));
  const description=document.createElement('textarea');description.rows=2;description.dataset.pictureDescription='true';description.setAttribute('aria-label','개체 설명문');
  const descriptionRow=label('개체 설명문',description);descriptionRow.hidden=true;
  const message=document.createElement('p');message.setAttribute('role','status');
  const note=document.createElement('p');note.textContent='본문 그림 한 개를 편집합니다. PNG/JPEG 20MB·4천만 화소 이하. 교체는 같은 픽셀 크기·자르기 없는 그림만 지원합니다. 셀·중첩·그룹과 회전·자르기는 이 창에서 편집하지 않습니다. 본문 그림의 ⋮⋮ 손잡이는 전체 선택과 지원 위치 이동에 사용합니다. 크기는 pt 단위이며 비율 유지는 현재 틀 기준입니다. 캔버스는 좌표가 확인된 글자처럼/문단 기준 배치만 지원합니다. 글 뒤로는 글 선택을 위해 목록에서 선택한 후 핸들을 사용하세요.';
  const bodyNote=note.textContent;
  const ok=document.createElement('button');ok.type='submit';ok.textContent='적용';
  const remove=document.createElement('button');remove.type='button';remove.textContent='그림 삭제';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='닫기 / 취소';
  form.append(title,file,label('너비(pt)',width),label('높이(pt)',height),label('가로 세로 비율 유지',ratio),label('배치',placement),descriptionRow,message,note,ok,remove,cancel);dialog.append(form);document.body.append(dialog);
  const guard=formatInputGuard(form);let target:ReturnType<Interaction['capture']>|undefined,mode:'insert'|'edit'='insert',draft:PictureFile|undefined,initial={width:0,height:0,placement:''},initialDescription='',factor=1,reading=false,generation=0;
  const current=()=>{if(!target||!sameFormatTarget(target,editor.capture()))throw Error('문서·선택이 변경되었습니다. 닫고 다시 여세요.');if(actions.busy())throw Error('다른 작업을 마친 후 사용하세요.');return target;};
  const sync=()=>{if(activeWorkset(document)&&!activeMenuDemand(menu))return;list.replaceChildren(new Option('본문 그림 선택',''));try{for(const r of pictureCatalog(editor.adapter))list.add(new Option(`그림 · ${r.sec+1}구역 ${r.para+1}문단 (${(r.props.width/100).toFixed(2)}pt)`,`${r.sec}:${r.para}:${r.control}`));const s=editor.selection;list.value=s.kind==='object'&&s.focus.kind==='body'?`${s.focus.sec}:${s.focus.para}:${s.control}`:'';
    insert.disabled=actions.busy()||s.kind!=='caret'||s.focus.kind!=='body'||editor.adapter.scope!=='edit'||editor.adapter.documentLocked;
    const cellPicture=s.kind==='object'&&s.focus.kind==='cell'?selectedPicture(editor.adapter,s):undefined;
    properties.disabled=actions.busy()||(!list.value&&!cellPicture);status.textContent=cellPicture?cellPictureSizeNote:'본문 입력 위치 또는 본문 그림을 선택하세요.';
    if(list.value){const p=selectedPicture(editor.adapter,s).props,canvas=pictureCanvasPlacement(p);status.textContent=!canvas.supported?'이 배치의 캔버스 좌표는 미검증입니다. 목록/그림 속성을 사용하세요.':!canvas.click?'글 뒤로: 목록 선택 후 핸들 또는 그림 속성으로 크기를 변경하세요.':'';}
  }catch(e){properties.disabled=insert.disabled=true;status.textContent=String(e);} };
  const show=(next:typeof mode)=>{try{if(actions.busy())throw Error('다른 작업을 마친 후 사용하세요.');resetHancomObjectDialog(form);editor.adapter.assertEditable(editor.selection.focus);mode=next;draft=undefined;reading=false;ok.disabled=false;generation++;file.value='';target=editor.capture();
    if(mode==='edit'){const p=selectedPicture(editor.adapter,editor.selection).props;initial={width:p.width,height:p.height,placement:p.treatAsChar?'inline':p.textWrap};if(!Array.from(placement.options).some(o=>o.value===initial.placement))throw Error('현재 그림 배치의 편집은 미지원입니다.');description.disabled=typeof p.description!=='string';description.value=description.disabled?'':p.description;description.placeholder=description.disabled?'미조회 · 원본 유지':'그림의 개체 설명문';description.title=description.disabled?'설명문 미조회 · 변경하지 않고 원본 유지':'그림에 저장하는 개체 설명문입니다. 본문이나 캡션은 바뀌지 않습니다.';}
    else{if(editor.selection.kind!=='caret'||editor.selection.focus.kind!=='body')throw Error('본문 입력 위치에서 넣으세요.');initial={width:7200,height:3600,placement:'inline'};}
    // Textarea normalizes CRLF for display. Compare the initial displayed draft,
    // so opening/no-op never writes normalized text back into the original.
    initialDescription=description.value;descriptionRow.hidden=mode!=='edit';
    const cellPicture=mode==='edit'&&editor.selection.focus.kind==='cell';
    file.disabled=placement.disabled=cellPicture;
    width.disabled=height.disabled=false;
    if(cellPicture){description.disabled=true;description.title='일반셀 그림 설명문은 이 입구에서 변경하지 않습니다. 원본 유지';}
    note.textContent=cellPicture?cellPictureSizeNote+' 일반셀의 문자 없는 문단에 있는 단일 인라인 그림만 사용합니다. 혼합·복수·중첩 그림은 이 입구에서 지원하지 않습니다.':bodyNote;
    width.value=String(initial.width/100);height.value=String(initial.height/100);factor=initial.width/initial.height;placement.value=initial.placement;ratio.checked=true;remove.disabled=mode==='insert'||cellPicture;message.dataset.error='false';message.textContent=cellPicture?cellPictureSizeNote:mode==='edit'?'파일을 선택하면 같은 틀의 그림을 교체합니다.':'그림 파일을 선택하세요.';
    const layout=mode==='edit'?mountHancomObjectDialog(form,'picture',selectedPicture(editor.adapter,editor.selection).props,{title,width,height,ratio,placement,file,description,message,note,ok,cancel,remove,readOnlyReason:cellPicture?cellPictureSizeNote:undefined}):undefined;
    guard.open();showEditorDialog(dialog);if(layout)layout.focus();else file.focus();
  }catch(e){actions.error(e);}};
  file.onchange=async()=>{const own=++generation;draft=undefined;const f=file.files?.[0];if(!f)return;reading=true;ok.disabled=true;message.textContent='그림 읽는 중…';let bitmap:ImageBitmap|undefined;
    try{current();if(f.size>20*1024*1024)throw Error('20MB 이하 그림만 지원합니다.');const bytes=new Uint8Array(await f.arrayBuffer());if(own!==generation||!dialog.open)return;current();const dims=imageDimensions(bytes);pictureFile({bytes,extension:dims.extension,naturalWidth:dims.width,naturalHeight:dims.height});bitmap=await createImageBitmap(f);if(own!==generation||!dialog.open)return;current();
      const extension=bytes[0]===137?'png':'jpg';const next:PictureFile={bytes,extension,naturalWidth:bitmap.width,naturalHeight:bitmap.height};pictureFile(next);draft=next;
      if(mode==='insert'){const scale=Math.min(1,72000/(next.naturalWidth*75),72000/(next.naturalHeight*75));initial={width:Math.max(100,Math.round(next.naturalWidth*75*scale)),height:Math.max(100,Math.round(next.naturalHeight*75*scale)),placement:'inline'};width.value=String(initial.width/100);height.value=String(initial.height/100);factor=initial.width/initial.height;}
      message.textContent=`그림 ${next.naturalWidth} × ${next.naturalHeight}px 준비됨`;
    }catch(e){if(own===generation)message.textContent=String(e);}finally{bitmap?.close();if(own===generation){reading=false;ok.disabled=false;}}};
  width.oninput=()=>{if(ratio.checked&&Number(width.value)>0)height.value=(Math.round(Number(width.value)*100/factor)/100).toString();};
  height.oninput=()=>{if(ratio.checked&&Number(height.value)>0)width.value=(Math.round(Number(height.value)*100*factor)/100).toString();};
  const finish=(changes:PictureChange[])=>{const captured=current();if(reading||!guard.ready())return;
    // The command receives one composite operation, never multiple History entries.
    (actions.execute??((command,target)=>editor.execute(command,target)))({type:'picture',change:changes[0]},captured);guard.consume();closeEditorDialog(dialog);actions.changed();};
  form.onsubmit=e=>{e.preventDefault();try{if(reading||!guard.ready())return;const w=Math.round(Number(width.value)*100),h=Math.round(Number(height.value)*100);
    if(mode==='insert'){if(!draft)throw Error('그림 파일을 먼저 선택하세요.');finish([{action:'insert',file:draft,width:w,height:h,placement:placement.value}]);}
    else if(draft){if(w!==initial.width||h!==initial.height||placement.value!==initial.placement||description.value!==initialDescription)throw Error('그림 교체와 크기·배치·설명문은 각각 적용하세요. 초안은 유지됩니다.');finish([{action:'replace',file:draft}]);}
    else {const c:Extract<PictureChange,{action:'properties'}>={action:'properties'};if(w!==initial.width)c.width=w;if(h!==initial.height)c.height=h;if(placement.value!==initial.placement){c.treatAsChar=placement.value==='inline';if(!c.treatAsChar)c.textWrap=placement.value;}if(!description.disabled&&description.value!==initialDescription)c.description=description.value;finish([c]);}
  }catch(e){message.dataset.error='true';message.textContent=String(e);}};
  remove.onclick=()=>{try{finish([{action:'delete'}]);}catch(e){message.textContent=String(e);}};
  cancel.onclick=()=>closeEditorDialog(dialog);dialog.addEventListener('close',()=>{if(dialog.open)return;generation++;draft=undefined;target=undefined;reading=false;guard.close();sync();});
  dialog.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeEditorDialog(dialog);}if(e.key==='Tab'){const controls=Array.from(form.querySelectorAll<HTMLElement>('input,textarea,select,button')).filter(c=>!(c as HTMLInputElement).disabled&&c.tabIndex>=0&&c.getClientRects().length>0);const i=controls.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&i<=0){e.preventDefault();controls.at(-1)?.focus();}else if(!e.shiftKey&&i===controls.length-1){e.preventDefault();controls[0]?.focus();}}});
  insert.onclick=()=>show('insert');properties.onclick=()=>show('edit');list.onchange=()=>{try{if(actions.busy())throw Error('현재 작업을 마친 후 선택하세요.');const [sec,para,control]=list.value.split(':').map(Number);const next={kind:'object' as const,focus:{kind:'body' as const,sec,para,offset:0},control};selectedPicture(editor.adapter,next);editor.selection=next;actions.changed();actions.focus();}catch(e){actions.error(e);sync();}};
  menu.addEventListener("rhwp:menu-opening",()=>{menu.dataset.activeWorksetDemand="true";try{sync();}finally{delete menu.dataset.activeWorksetDemand;}});
  sync();return {sync,showInsert:()=>show('insert'),showProperties:()=>show('edit'),get open(){return dialog.open;}};
}
