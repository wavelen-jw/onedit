// An explicit missing-contract presentation; never a writable draft or default.
export function dialogGap(parent:HTMLElement,label:string,reason:string,kind:'select'|'number'|'checkbox'='select'){
 const row=document.createElement('label'),caption=document.createElement('span');caption.textContent=label;row.className='dialog-gap';row.dataset.dialogGap=label;
 const control=kind==='select'?document.createElement('select'):document.createElement('input');
 if(control instanceof HTMLSelectElement)control.add(new Option('미지원 · 원본 유지',''));
 else{control.type=kind;control.placeholder='조회 미지원';if(kind==='checkbox')control.indeterminate=true;}
 control.disabled=true;control.title=reason;control.setAttribute('aria-label',label+' · '+reason);row.append(caption,control);parent.append(row);return row;
}
export function dialogUnit(control:HTMLInputElement|HTMLSelectElement|undefined,unit:string){
 if(!control)return;const span=document.createElement('span');span.className='dialog-unit';span.textContent=unit;control.after(span);
}
