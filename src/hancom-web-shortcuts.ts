import type { KeyInput, KeyRoute } from './keyboard.js';
import type { Command, Selection } from './model.js';

export type ShortcutPlatform = 'windows' | 'mac';
export function shortcutPlatform(): ShortcutPlatform {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'windows';
}

// User-supplied Hancom Web help. Lower to existing Commands/Interaction only.
// IME, AltGraph, context ownership and command validation remain authoritative.
export function hancomWebKey(e: KeyInput, s: Selection, platform = shortcutPlatform()): KeyRoute | undefined {
  if (e.isComposing || e.keyCode === 229 || e.altGraph) return;
  const k = e.key.toLowerCase(), letter = /^Key([A-Z])$/.exec(e.code)?.[1].toLowerCase() ?? k;
  const text = s.kind === 'caret' || s.kind === 'text';
  const command = (command: Command): KeyRoute => ({kind: 'command', command});
  const view = (operation: Extract<KeyRoute,{kind:'view'}>['operation'], key = e.key): KeyRoute =>
    ({kind:'view',operation,key,extend:false});
  if (!e.metaKey && e.ctrlKey && !e.altKey && !e.shiftKey && letter === 't' && text)
    return command({type:'delete-word',backward:false});
  if (!e.metaKey && e.ctrlKey && e.altKey && !e.shiftKey && letter === 'c') return {kind:'format-copy'};
  if (!e.metaKey && e.ctrlKey && e.altKey && !e.shiftKey && ['pageup','pagedown'].includes(k))
    return view('document', k === 'pagedown' ? 'End' : 'Home');
  if (!e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && k === 'f5' && s.focus.kind === 'cell' && ['caret','text','cells'].includes(s.kind))
    return view('cell-start-extend');
  const margin: Record<string, readonly ['marginLeft'|'marginRight',1|-1]> = {f5:['marginLeft',-1],f6:['marginLeft',1],f7:['marginRight',1],f8:['marginRight',-1]};
  if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey && margin[k])
    return command({type:'paragraph-relative',change:{metric:margin[k][0],direction:margin[k][1]}});
  if (e.ctrlKey && !e.altKey && !e.metaKey && e.shiftKey && ['w','q'].includes(letter))
    return command({type:'line-spacing-step',direction:letter==='w'?1:-1});
  if (platform !== 'mac') return;
  const option = e.altKey && !e.ctrlKey && !e.metaKey;
  const cmd = e.metaKey && !e.ctrlKey && !e.altKey;
  const control = e.ctrlKey && !e.metaKey && !e.altKey;
  if (cmd && ['arrowleft','arrowright'].includes(k)) {
    if (e.shiftKey && ['table','object'].includes(s.kind)) return command({type:'control-key',action:k==='arrowleft'?'inFrontOfText':'behindText'});
    if (text) return {kind:'view',operation:'move',key:k==='arrowleft'?'Home':'End',extend:e.shiftKey};
  }
  if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && ['arrowup','arrowdown'].includes(k))
    return view('page-start',k==='arrowdown'?'PageDown':'PageUp');
  if (option && e.shiftKey && text && ['arrowup','arrowdown'].includes(k))
    return {kind:'view',operation:'move',key:e.key,extend:true};
  if (option && e.shiftKey && letter==='i') return command({type:'numbering-restart',change:{mode:2,start:1}});
  if (option && !e.shiftKey && text && ['arrowleft','arrowright'].includes(k)) return view('word');
  if (cmd && !e.shiftKey && text && ['arrowup','arrowdown'].includes(k)) return view('paragraph');
  if (cmd && ((!e.shiftKey && ['pageup','pagedown'].includes(k)) || (e.shiftKey && ['arrowup','arrowdown'].includes(k))))
    return view('document', ['pagedown','arrowdown'].includes(k) ? 'End' : 'Home');
  if (cmd && !e.shiftKey && letter === 'e') {
    if (s.kind === 'cells') return command({type:'clear-cells'});
    if (s.kind === 'text' || s.kind === 'table') return command({type:'delete',backward:false});
    return {kind:'unsupported',message:'지울 내용의 블록을 선택하세요.'};
  }
  if (cmd && !e.shiftKey && k === 'f10' && text) return {kind:'existing-ui',action:'character-map'};
  if (cmd && !e.shiftKey && letter === 'l') return {kind:'format',target:'char'};
  if (cmd && !e.shiftKey && ['u','i'].includes(letter))
    return command(letter === 'u' ? {type:'underline'} : {type:'toggle-char',property:'italic'});
  if (cmd && e.shiftKey && ['e','r','k','j'].includes(letter)) return command({type:'char-relative',change:{
    metric:['e','r'].includes(letter)?'fontSize':'ratios',direction:['e','k'].includes(letter)?1:-1}});
  if (e.metaKey && e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (letter === 'p' || letter === 's') return command({type:'script',mode:letter==='p'?'superscript':'subscript'});
    if (letter === 'c') return command({type:'char',props:{bold:false,italic:false,underline:false,underlineType:'None',strikethrough:false,superscript:false,subscript:false,outlineType:0,shadowType:0,emboss:false,engrave:false}});
  }
  if (cmd && e.shiftKey && letter === 'h') return {kind:'search',replace:true};
  if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey) {
    if (letter === 'a') return {kind:'script-cycle'};
    if (s.kind === 'text' && ['f','g'].includes(letter)) return {kind:'existing-ui',action:letter==='f'?'font-next':'font-previous'};
  }
  if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) {
    if (['cells','table'].includes(s.kind) && /^arrow(left|right|up|down)$/.test(k))
      return command({type:'resize',nativeTrackKeys:true,...(['arrowleft','arrowright'].includes(k)?{trackBoundary:true}:{}),width:k==='arrowleft'?-300:k==='arrowright'?300:0,height:k==='arrowup'?-300:k==='arrowdown'?300:0});
  }
  if (control && e.shiftKey) {
    if (['w','q'].includes(letter)) return command({type:'line-spacing-step',direction:letter==='w'?1:-1});
    if (letter==='i') return {kind:'paragraph-list-toggle',mode:'Number'};
    if (k==='backspace') return {kind:'paragraph-list-toggle',mode:'Bullet'};
  }
  if (control && !e.shiftKey && letter==='d' && s.focus.kind==='cell' && ['caret','cells'].includes(s.kind))
    return command({type:'table-edit',operation:'col-delete'});
  if (control && !e.shiftKey && letter==='i' && s.focus.kind==='cell' && ['caret','cells'].includes(s.kind))
    return command({type:'table-edit',operation:'col-add'});
}

// Shared labels for menu kbd/title/ARIA and the live shortcut-results view.
// Old convenience aliases remain valid unless a Hancom Web context takes priority.
export function hancomShortcutLabel(value: string, platform = shortcutPlatform()): string {
  const labels: Record<string,string> = platform === 'mac' ? {
    'Alt+C':'Option+C','Ctrl+Alt+C':'Option+C','Ctrl+H':'Command+Shift+H',
    'Ctrl+E':'Command+E','Ctrl+F10':'Command+F10','Alt+L':'Command+L',
    'Alt+Shift+E':'Command+Shift+E','Alt+Shift+R':'Command+Shift+R',
    'Alt+Shift+K':'Command+Shift+K','Alt+Shift+J':'Command+Shift+J',
    'Alt+Shift+U':'Command+U','Alt+Shift+I':'Command+I',
    'Alt+Shift+P':'Command+Control+P','Alt+Shift+S':'Command+Control+S','Alt+Shift+C':'Command+Control+C',
    'Alt+Shift+F':'Command+Option+F','Alt+Shift+G':'Command+Option+G','Ctrl+Alt+A':'Command+Option+A',
    'Ctrl+Shift+E':'Control+Option+F5','Ctrl+Shift+G':'Control+Option+F6',
    'Ctrl+Shift+D':'Control+Option+F7','Ctrl+Shift+F':'Control+Option+F8',
    'Alt+Shift+Z':'Control+Shift+W','Alt+Shift+A':'Control+Shift+Q',
    'Alt+Shift+Insert':'Option+Shift+I','Ctrl+Shift+Insert':'Control+Shift+I','Ctrl+Shift+Delete':'Control+Shift+Backspace',
  } : {'Alt+C':'Ctrl+Alt+C'};
  const pattern=Object.keys(labels).sort((a,b)=>b.length-a.length).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  return value.replace(new RegExp(`(?<![\\w+])(?:${pattern})(?![\\w+])`,'g'), key=>labels[key]);
}
