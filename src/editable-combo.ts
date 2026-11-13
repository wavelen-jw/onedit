export type ChoiceGroup = {label: string; values: string[]; searchValues?: string[]};
/** Search presentation only: chosen values keep their original spelling. */
export function filterChoiceGroups(groups: readonly ChoiceGroup[], query: string): ChoiceGroup[] {
  const key=(value:string)=>value.normalize('NFC').replace(/\s+/g,'').toLocaleLowerCase('ko');
  const needle=key(query);
  return groups.map(group=>({label:group.label,values:(needle?group.searchValues??group.values:group.values).filter(value=>key(value).includes(needle))}));
}
/** Editable field and explicit list share the original input/draft/command.
 * List gestures keep focus on that input, including across async font loading. */
export function mountEditableCombo(control: HTMLInputElement, choices: () => ChoiceGroup[], selected?: () => void, settings: {search?: boolean} = {}) {
  const doc=control.ownerDocument, wrap=doc.createElement('span'), toggle=doc.createElement('button'), list=doc.createElement('div');
  wrap.className='editable-combo';control.before(wrap);wrap.append(control);
  toggle.type='button';toggle.textContent='▾';toggle.setAttribute('aria-label',`${control.getAttribute('aria-label')??'값'} 목록`);
  list.id=`choices-${control.name}`;list.className='editable-combo-options';list.hidden=true;list.setAttribute('role','listbox');
  control.setAttribute('role','combobox');control.setAttribute('aria-controls',list.id);control.setAttribute('aria-expanded','false');control.setAttribute('aria-autocomplete','list');
  wrap.append(toggle,list);let options:HTMLButtonElement[]=[],active=0;
  let snapshot:ChoiceGroup[]|undefined, composing=false, choosing=false, lastQuery:string|undefined;
  const close=()=>{list.hidden=true;snapshot=undefined;lastQuery=undefined;control.setAttribute('aria-expanded','false');control.removeAttribute('aria-activedescendant');};
  const mark=()=>{control.removeAttribute('aria-activedescendant');options.forEach((o,i)=>{o.setAttribute('aria-selected',String(i===active));if(i===active)control.setAttribute('aria-activedescendant',o.id);});};
  const choose=(value:string)=>{control.value=value;selected?.();close();choosing=true;try{control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));}finally{choosing=false;}};
  const open=(query='',focus=true)=>{if(control.disabled)return;
    if(!list.hidden&&lastQuery===query)return;
    // One explicit open/input session owns the inventory. Filtering keystrokes
    // never reacquire documentFontNames/layout; blur/reset/close expires it.
    snapshot??=choices().map(group=>({label:group.label,values:[...group.values],searchValues:group.searchValues?[...group.searchValues]:undefined}));
    list.replaceChildren();options=[];lastQuery=query;
    for(const group of settings.search?filterChoiceGroups(snapshot,query):snapshot) {if(!group.values.length)continue;
      if(options.length){const line=doc.createElement('div');line.className='editable-combo-divider';line.setAttribute('role','separator');line.setAttribute('aria-label',group.label);list.append(line);}
      for(const value of group.values){const b=doc.createElement('button');b.type='button';b.tabIndex=-1;b.setAttribute('role','option');b.id=`${list.id}-${options.length}`;b.textContent=value;b.onpointerdown=e=>e.preventDefault();b.onclick=()=>choose(value);options.push(b);list.append(b);}
    }
    if(!options.length&&settings.search){const empty=doc.createElement('div');empty.className='editable-combo-empty';empty.setAttribute('role','status');empty.textContent='일치하는 글꼴이 없습니다.';list.append(empty);}
    active=Math.max(0,options.findIndex(o=>o.textContent===control.value));mark();list.hidden=false;control.setAttribute('aria-expanded','true');if(focus)control.focus({preventScroll:true});
  };
  toggle.onpointerdown=e=>e.preventDefault();toggle.onclick=()=>list.hidden?open():close();
  if(settings.search){
    control.addEventListener('compositionstart',()=>{composing=true;});
    control.addEventListener('compositionend',()=>{composing=false;if(!choosing)open(control.value,false);});
    control.addEventListener('input',event=>{if(!choosing&&!composing&&!(event as InputEvent).isComposing)open(control.value,false);});
  }
  control.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();if(list.hidden)open();else if(options.length){active=(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;mark();options[active].scrollIntoView({block:'nearest'});}}
    else if(event.key==='Enter'&&!list.hidden){event.preventDefault();event.stopPropagation();if(options[active])choose(options[active].textContent!);}
    else if(event.key==='Escape'&&!list.hidden){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==='Tab')close();
  });
  wrap.addEventListener('focusout',()=>queueMicrotask(()=>{if(!wrap.contains(doc.activeElement))close();}));
  return {wrap,close};
}
