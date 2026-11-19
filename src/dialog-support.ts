export function dialogUnit(control:HTMLInputElement|HTMLSelectElement|undefined,unit:string){
 if(!control)return;const span=document.createElement('span');span.className='dialog-unit';span.textContent=unit;control.after(span);
}
