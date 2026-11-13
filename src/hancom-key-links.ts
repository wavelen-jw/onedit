import type { KeyInput, KeyRoute } from './keyboard.js';
import type { Selection } from './model.js';
import type { Interaction } from './interaction.js';
import { formatValueState } from './format-value-state.js';

// UI lowering only; the existing explicit character Commands own the edit.
export function hancomScriptCycle(editor: Interaction) {
  const state=editor.formatState('char');
  return scriptCycleFromState(state);
}
export function scriptCycleFromState(state: ReturnType<Interaction['formatState']>) {
  for(const key of ['superscript','subscript']) {
    const kind=formatValueState(state,key);
    if(kind!=='common'||typeof state[key]!=='boolean')
      throw Error(kind==='mixed'?'첨자 상태가 혼합입니다. 위 첨자·아래 첨자·첨자 해제를 명시적으로 선택하세요.':'첨자 상태를 조회할 수 없습니다. 기존 값을 유지합니다.');
  }
  if(state.superscript&&state.subscript)throw Error('첨자 상태가 일치하지 않습니다. 기존 값을 유지합니다.');
  return {type:'script' as const,mode:state.superscript?'subscript' as const:state.subscript?'normal' as const:'superscript' as const};
}


// Han/word 2022 official key table. These are aliases of existing Commands,
// never alternative defaults or a new editing operation.
export const hancomColorKeys = [
  ['K','#000000'], ['R','#ff0000'], ['B','#0000ff'], ['D','#ff00ff'],
  ['G','#008000'], ['Y','#ffff00'], ['C','#00ffff'], ['W','#ffffff'],
] as const;
export function hancomKeyLink(e: KeyInput, s: Selection): KeyRoute | undefined {
  if (e.isComposing || e.keyCode === 229 || e.altGraph || e.metaKey) return;
  const key=e.key.toLowerCase(), letter=/^Key([A-Z])$/.exec(e.code)?.[1].toLowerCase()??key;
  const text=s.kind==='caret'||s.kind==='text';
  if(e.ctrlKey&&!e.altKey&&e.shiftKey&&s.focus.kind==='cell'&&(s.kind==='caret'||s.kind==='cells')){
    const choices:Partial<Record<string,readonly string[]>>=s.kind==='cells'?{s:['row','SUM'],a:['row','AVG'],p:['row','PRODUCT']}:{h:['row','SUM'],v:['column','SUM'],j:['row','AVG'],b:['column','AVG'],k:['row','PRODUCT'],n:['column','PRODUCT']};
    const found=choices[letter];if(found)return {kind:'table-calculation',axis:found[0] as 'row'|'column',operation:found[1] as 'SUM'|'AVG'|'PRODUCT'};
  }
  if(!e.ctrlKey&&!e.altKey&&e.shiftKey&&s.kind==='cells'&&/^arrow(left|right|up|down)$/.test(key))return {kind:'existing-ui',action:('local-'+key.slice(5)) as 'local-left'|'local-right'|'local-up'|'local-down'};
  if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&key==='f10'&&text)return {kind:'existing-ui',action:'character-map'};
  if(e.ctrlKey&&!e.altKey&&e.shiftKey&&text&&(e.code==='Minus'||!e.code&&['-','_'].includes(key)))return {kind:'command',command:{type:'insert',text:'\u00ad'}};
  if(e.ctrlKey&&e.altKey&&!e.shiftKey&&key===' '&&text)return {kind:'command',command:{type:'insert',text:'\u00a0'}};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&s.kind==='table'&&['t','l','c'].includes(letter))return {kind:'existing-ui',action:letter==='t'?'table-transpose':letter==='l'?'table-object-line':'table-object-background'};

  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&letter==='g'&&s.kind==='object')return {kind:'existing-ui',action:'object-group'};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&letter==='u'&&s.kind==='object')return {kind:'command',command:{type:'object-ungroup'}};
  if(!e.ctrlKey&&e.altKey&&e.shiftKey&&text&&(key==='arrowup'||key==='arrowdown'))return {kind:'command',command:{type:'paragraph-move',direction:key==='arrowup'?-1:1}};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&s.kind==='cells'&&(letter==='h'||letter==='w'))return {kind:'existing-ui',action:letter==='w'?'equal-width':'equal-height'};
  if(e.ctrlKey&&e.altKey&&!e.shiftKey&&(key==='arrowleft'||key==='arrowright')&&text)return {kind:'view',operation:'column',key:e.key,extend:false};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&key==='f7'&&s.kind!=='cells')return {kind:'existing-ui',action:'paper'};
  if(!e.ctrlKey&&e.altKey&&e.shiftKey&&(letter==='f'||letter==='g')&&s.kind==='text')return {kind:'existing-ui',action:letter==='f'?'font-next':'font-previous'};
  if(e.altKey&&e.shiftKey&&!e.ctrlKey&&['arrowleft','arrowright'].includes(key)&&text)
    return {kind:'view',operation:'word-across',key:e.key,extend:false};
  if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&text&&(key==='delete'||key==='backspace'&&s.focus.kind==='body'))return {kind:'command',command:{type:'delete-word',backward:key==='backspace'}};
  if(e.altKey&&!e.shiftKey&&!e.ctrlKey&&letter==='y'&&text)
    return {kind:'command',command:{type:'delete-line-end'}};
  if(e.altKey&&!e.ctrlKey&&!e.shiftKey&&letter==='g')return {kind:'existing-ui',action:'page-goto'};
  if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&key==='f1')return {kind:'existing-ui',action:'toolbox'};
  if(e.ctrlKey&&e.altKey&&!e.shiftKey&&letter==='v')return {kind:'existing-ui',action:'paste-choose'};
  if(!e.ctrlKey&&!e.altKey&&(s.kind==='table'||s.kind==='object'&&s.focus.kind==='body')) {
    if(e.shiftKey&&['pageup','pagedown','home','end'].includes(key))return {kind:'command',command:{type:'control-key',action:({pageup:'front',pagedown:'back',home:'inFrontOfText',end:'behindText'}as const)[key as 'pageup'|'pagedown'|'home'|'end']}};
    if(s.kind==='object'&&['arrowleft','arrowright','arrowup','arrowdown'].includes(key))return {kind:'command',command:{type:'control-key',action:(e.shiftKey?{arrowleft:'narrow',arrowright:'widen',arrowup:'shorter',arrowdown:'taller'}:{arrowleft:'left',arrowright:'right',arrowup:'up',arrowdown:'down'})[key] as import('./control-shortcuts.js').ControlKey}};
  }
  if(!e.ctrlKey&&!e.altKey&&key==='tab'&&(s.kind==='table'||s.kind==='object'&&s.focus.kind==='body'))return {kind:'view',operation:'object-next',key:e.key,extend:e.shiftKey};
  if(e.altKey&&!e.ctrlKey&&!e.shiftKey&&s.focus.kind==='cell'&&(key==='insert'||key==='delete'))return {kind:'existing-ui',action:key==='insert'?'table-add':'table-delete'};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&letter==='s'&&s.kind==='cells')return {kind:'existing-ui',action:'cell-split'};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&key==='f7'&&s.kind==='cells')
    return {kind:'view',operation:'cell-columns',key:e.key,extend:false};
  if(!e.ctrlKey&&!e.altKey&&e.shiftKey&&key==='escape'&&s.focus.kind==='cell')
    return {kind:'view',operation:'table-exit',key:e.key,extend:false};
  if(e.altKey&&!e.ctrlKey&&!e.shiftKey&&/^arrow(left|right|up|down)$/.test(key)&&text&&s.focus.kind==='cell')
    return {kind:'view',operation:'cell-neighbour',key:e.key,extend:false};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&letter==='c'&&s.kind==='object')return {kind:'existing-ui',action:'object-background'};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&letter==='l'&&s.kind==='object')
    return {kind:'existing-ui',action:'object-line'};
  if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&letter==='e'&&s.kind==='table')return {kind:'command',command:{type:'delete',backward:false}};
  // Numbering depth: level0 is the highest. Outline restored by user on 2026-10-26.
  if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&['NumpadAdd','NumpadSubtract'].includes(e.code))
    return {kind:'command',command:{type:'list-level',direction:e.code==='NumpadAdd'?1:-1}};
  if(!e.ctrlKey&&e.altKey&&e.shiftKey&&(letter==='z'||letter==='a'))
    return {kind:'command',command:{type:'line-spacing-step',direction:letter==='z'?1:-1}};
  // Ctrl+Shift+W/Q browser/window ownership is not overridden; Z/A are the native non-conflicting aliases.
  if(!e.ctrlKey&&e.altKey&&e.shiftKey&&letter==='c')return {kind:'command',command:{type:'char',props:{bold:false,italic:false,underline:false,underlineType:"None",strikethrough:false,superscript:false,subscript:false,outlineType:0,shadowType:0,emboss:false,engrave:false}}};
  if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&(key==='arrowleft' ||key==='arrowright')&&
      (s.kind==='caret'||s.kind==='text'))
    return {kind:'view',operation:'word',key:e.key,extend:false};
  if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&(key==='arrowup'||key==='arrowdown')&&
      (s.kind==='caret'||s.kind==='text'))
    return {kind:'view',operation:'paragraph',key:e.key,extend:false};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&s.kind==='cells'&&(key==='f8'||key==='f3'))
    return {kind:'view',operation:key==='f8'?'cell-rows':'cell-extend',key:e.key,extend:false};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&s.kind==='cells'&&letter==='a')return {kind:'existing-ui',action:'table-autofill'};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&s.kind==='cells'&&(letter==='b'||letter==='f'))
    return {kind:'cell-block-format',background:letter==='f'};
  if(e.altKey&&!e.ctrlKey&&!e.shiftKey&&key==='home'&&(s.kind==='caret'||s.kind==='text'))
    return {kind:'view',operation:'paragraph-start',key:e.key,extend:false};
  if(e.altKey&&!e.ctrlKey&&!e.shiftKey&&['end','pageup','pagedown'].includes(key))return {
    kind:'view',operation:key==='end'?'paragraph-end':'page-start',key:e.key,extend:false};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&key==='enter'&&s.kind==='cells')return {kind:'view',operation:'escape',key:e.key,extend:false};
  if(e.ctrlKey&&e.altKey&&!e.shiftKey&&letter==='a')return {kind:'script-cycle'};
  if(!e.ctrlKey&&e.altKey&&e.shiftKey&&key==='insert')return {kind:'command',command:{type:'numbering-restart',change:{mode:2,start:1}}};
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey&&key==='f2')return {kind:'search',replace:false};
  if(e.altKey&&!e.ctrlKey&&!e.shiftKey&&letter==='p')return {kind:'print'};
  if(e.ctrlKey&&!e.altKey&&!e.shiftKey){
    if(e.key==='Enter'&&s.focus.kind==='cell')return {kind:'command',command:{type:'table-edit',operation:'row-add'}};
    if(e.key==='Backspace'&&s.focus.kind==='cell')return {kind:'command',command:{type:'table-edit',operation:'row-delete'}};
    if(letter==='e'&&s.focus.kind==='body'&&(s.kind==='caret'||s.kind==='text'))return {kind:'command',command:{type:'delete',backward:false}};
    if(letter==='i')return {kind:'command',command:{type:'toggle-char',property:'italic'}};
    if(letter==='u')return {kind:'command',command:{type:'underline'}};
    if(letter==='j')return {kind:'command',command:{type:'page-break'}};
    const direction=e.code==='BracketRight'||!e.code&&key===']'?1:e.code==='BracketLeft'||!e.code&&key==='['?-1:0;
    if(direction)return {kind:'command',command:{type:'char-relative',change:{metric:'fontSize',direction}}};
  }
  // Ctrl+Shift+T restores a browser tab and is deliberately not added.
  if(e.ctrlKey&&!e.altKey&&e.shiftKey){
    const margins={e:['marginLeft',-1],g:['marginLeft',1],d:['marginRight',1],f:['marginRight',-1]}as const;
    const change=margins[letter as keyof typeof margins];
    if(change)return {kind:'command',command:{type:'paragraph-relative',change:{metric:change[0],direction:change[1]}}};
  }
  if(e.ctrlKey&&!e.altKey&&e.shiftKey&&['c','r','m'].includes(letter))return {
    kind:'command',command:{type:'paragraph',props:{alignment:({c:'center',r:'right',m:'justify'}as const)[letter as 'c'|'r'|'m']}}};
}
