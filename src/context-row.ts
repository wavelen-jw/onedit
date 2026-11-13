/** Context presentation only; source command guards and captured owners remain authoritative. */
export function contextRow(button:HTMLButtonElement,id:string,label:string,key='') {
  if(button.dataset.contextLabel===label&&button.dataset.contextKey===key)return;
  button.dataset.contextLabel=label;button.dataset.contextKey=key;
  const doc=button.ownerDocument, icon=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS(icon.namespaceURI,'path');
  const paths:Record<string,string>={copy:'M8 8h13v13H8z M16 8V3H3v13h5',cut:'M9 8l11 13M9 16 20 3M9 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0M9 18a3 3 0 1 0-6 0 3 3 0 0 0 6 0',paste:'M8 5H4v17h16V5h-4M8 3h8v5H8z',undo:'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',redo:'M15 5l5 5-5 5M20 10H10a6 6 0 0 0 0 12',delete:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15',character:'M4 20 12 3l8 17M7 14h10',paragraph:'M14 21V3M20 21V3H9a5 5 0 0 0 0 10h5',find:'M16 16l6 6M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0',properties:'M3 4h18v16H3zM3 9h18M10 9v11'};
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('context-icon');path.setAttribute('d',paths[id.replace(/^(edit|format)-/,'')]??'M5 5h14M5 12h14M5 19h14');icon.append(path);
  const text=doc.createElement('span'),shortcut=doc.createElement('kbd');text.className='context-label';text.textContent=label;shortcut.textContent=key;button.replaceChildren(icon,text,shortcut);button.setAttribute('aria-label',label);
}
