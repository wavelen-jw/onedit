import type {Interaction} from './interaction.js';
import {copy,ordered,sameContainer,paraIndex,type Command} from './model.js';
import {toCoreCharacter,toCoreParagraph} from './formatting.js';
import {formatValueState,formatToggleState,markFormatToggle} from './format-value-state.js';
import {formatMenuItems} from './integration/a-format-menu.js';
import {mountFormatHoverPreview} from './format-hover-preview.js';
import {mountTextColorSplit} from './text-color-split.js';

export function mountSelectionFormatControls(doc:Document,editor:Interaction,character:HTMLElement,paragraph:HTMLElement,actions:{valid:()=>boolean;blocked:()=>boolean;target:()=>ReturnType<Interaction['capture']>|undefined;execute:(command:Command)=>void;focus:()=>void}){
  const life=new AbortController(),signal=life.signal,preview=mountFormatHoverPreview(doc,editor),note=doc.createElement('output');note.setAttribute('aria-live','polite');paragraph.append(note);
  const buttons:{button:HTMLButtonElement;command:()=>Command|undefined}[]=[],numbers=new Map<string,HTMLElement>();
  const projections=new Map<string,ReturnType<Interaction['formatState']>>();
  let commandNotice = '';
  const run=(factory:()=>Command|undefined)=>{
    preview.clear();projections.clear();
    if(!actions.valid()||actions.blocked())return;
    commandNotice = note.textContent = '';
    try{const c=factory();if(c){actions.execute(c);sync();actions.focus();}}
    catch(e){commandNotice = note.textContent = e instanceof Error ? e.message : String(e);}
  };
  const button=(parent:HTMLElement,text:string,label:string,factory:()=>Command|undefined)=>{const b=doc.createElement('button');b.type='button';b.className='selection-icon-button';b.textContent=text;b.setAttribute('aria-label',label);b.title=label;b.dataset.hint=label;parent.append(b);buttons.push({button:b,command:factory});b.addEventListener('pointerenter',()=>{if(b.disabled||!actions.valid()||actions.blocked())return;try{projections.clear();const c=factory(),target=actions.target();if(c&&target)preview.show(c,target);}catch(e){note.textContent=String(e);}},{signal});b.addEventListener('pointerleave',preview.clear,{signal});b.addEventListener('click',()=>run(factory),{signal});return b;};
  const readState=(kind:'char'|'paragraph')=>{
    const result=editor.formatState(kind);if(kind!=='paragraph')return result;
    const a=editor.adapter,s=editor.selection,end=s.kind==='text'?ordered(s.anchor,s.focus)[1]:undefined;
    const targets=editor.targets().filter(t=>!(end&&end.offset===0&&sameContainer(t.p,end)&&paraIndex(t.p)===paraIndex(end)&&'anchor'in s&&paraIndex(s.anchor)!==paraIndex(s.focus)));
    // Rounded CSS-pixel getters can display 1pt as 1.01 and accumulate that
    // error on every +/- click. Existing ParaShapeSet has exact stored HU.
    const metrics=targets.map(({p})=>{try{let list=0,index=p.para;if(p.kind==='body')for(let sec=0;sec<p.sec;sec++)index+=a.readStructural('getParagraphCount',sec);else{list=a.list(p).listId;index=paraIndex(p);}return {raw:a.call('getParaShapeSet',list,index),scale:Number(a.paraProps(p).spacingUnitScale??1)};}catch{return undefined;}});
    for(const [key,rawKey]of [['spacingBefore','PrevSpacing'],['spacingAfter','NextSpacing']] as const){
      const values=metrics.map(v=>{const raw=v?.raw[rawKey],scale=v?.scale;return Number.isSafeInteger(raw)&&scale!==undefined&&[1,2].includes(scale)?raw/scale/100:undefined;});
      const unknown=!values.length||values.some(v=>v===undefined),mixed=!unknown&&values.some(v=>v!==values[0]);
      result[key]=unknown||mixed?undefined:values[0];result.__mixedFields=(result.__mixedFields as string[]??[]).filter(k=>k!==key);result.__unavailableFields=(result.__unavailableFields as string[]??[]).filter(k=>k!==key);
      if(unknown)(result.__unavailableFields as string[]).push(key);else if(mixed)(result.__mixedFields as string[]).push(key);
    }return result;
  };
  const state=(kind:'char'|'paragraph')=>{if(!projections.has(kind))projections.set(kind,readState(kind));return projections.get(kind)!;};
  const num=(kind:'char'|'paragraph',key:string)=>{const s=state(kind);return formatValueState(s,key)==='common'&&typeof s[key]==='number'?Number(s[key]):undefined;};
  const metric=(parent:HTMLElement,key:string,label:string,kind:'char'|'paragraph',step:number,min:number,max=Infinity)=>{
    const group=doc.createElement('span');group.className='selection-stepper';group.setAttribute('role','group');group.setAttribute('aria-label',label);parent.append(group);
    if(key==='spacingBefore'||key==='spacingAfter'||key==='lineSpacing'){
      const caption=doc.createElement('span'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS('http://www.w3.org/2000/svg','path');
      caption.className='selection-metric-label';caption.title=label;caption.setAttribute('aria-label',label);caption.setAttribute('role','img');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.dataset.paragraphGap=key;
      // A bounded gap above/below three paragraph lines, with opposing arrows.
      path.setAttribute('d',key==='lineSpacing'?'M11 5H22M11 12H22M11 19H22M5 4V20M2 7L5 4L8 7M2 17L5 20L8 17':key==='spacingBefore'?'M3 2H21M3 14H21M3 18H21M3 22H15M12 5V11M9 7L12 4L15 7M9 9L12 12L15 9':'M3 2H21M3 6H21M3 10H15M3 22H21M12 13V19M9 15L12 12L15 15M9 17L12 20L15 17');
      svg.append(path);caption.append(svg);group.append(caption);
    }
    const change=(direction:-1|1):Command|undefined=>{const current=num(kind,key);if(current===undefined)return;const next=current+direction*step;if(next<min||next>max)return;return kind==='char'?{type:'char',props:toCoreCharacter({[key]:next})}:{type:'paragraph',props:toCoreParagraph({[key]:next,...(key==='lineSpacing'?{lineSpacingType:'Percent'}:{})})};};
    const minus=button(group,'−',label+' 줄이기',()=>change(-1)),display=doc.createElement('span');display.className='selection-value';display.dataset.metric=key;numbers.set(key,display);group.append(display);const plus=button(group,'+',label+' 늘리기',()=>change(1));
    return()=>{const value=num(kind,key);display.textContent=value===undefined?(formatValueState(state(kind),key)==='mixed'?'±':'?'):String(value)+(key==='lineSpacing'?'%':key==='fontSize'||key.startsWith('spacing')?'pt':'');display.setAttribute('aria-label',label+' '+display.textContent);minus.disabled=value===undefined||value-step<min||value-step>max;plus.disabled=value===undefined||value+step>max||value+step<min;};
  };
  const fontGroup=doc.createElement('span');fontGroup.className='selection-font';character.append(fontGroup);
  const font=doc.createElement('button');font.type='button';font.setAttribute('aria-label','글꼴 선택');font.setAttribute('aria-expanded','false');fontGroup.append(font);
  const fontChoices=doc.createElement('span');fontChoices.className='selection-font-choices';fontChoices.hidden=true;fontGroup.append(fontChoices);
  font.onclick=()=>{preview.clear();fontChoices.hidden=!fontChoices.hidden;font.setAttribute('aria-expanded',String(!fontChoices.hidden));};
  for(const name of ['함초롬바탕','함초롬돋움','맑은 고딕']){const b=button(fontChoices,name.replace('맑은 고딕','맑은고딕'),name+' 적용',()=>({type:'char',props:toCoreCharacter({fontFamily:name})}));b.dataset.selectionFont=name;b.addEventListener('click',()=>{fontChoices.hidden=true;font.setAttribute('aria-expanded','false');},{signal});}
  const sizeSync=metric(character,'fontSize','글자 크기','char',1,10,15);
  const bold=button(character,'B','선택 진하게',()=>({type:'bold'}));bold.classList.add('selection-bold');
  const color=mountTextColorSplit(doc,editor,doc.createElement('input'),{
    idPrefix:'selection-text-color',busy:()=>!actions.valid()||actions.blocked(),readBusy:()=>!actions.valid()||actions.blocked(),focus:actions.focus,
    apply:props=>{preview.clear();projections.clear();if(!actions.valid()||actions.blocked())throw Error('문서·선택이 바뀌었습니다. 다시 선택하세요.');actions.execute({type:'char',props});sync();},
  });character.append(color.row);
  const trackingIcon=(b:HTMLButtonElement,wide:boolean)=>{
    const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS('http://www.w3.org/2000/svg','path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.dataset.trackingIcon=wide?'wide':'narrow';
    path.setAttribute('d',wide?'M1 12H23M4 9L1 12L4 15M20 9L23 12L20 15':'M7 12H17M10 9L7 12L10 15M14 9L17 12L14 15');
    svg.append(path);b.replaceChildren(svg);
  };
  const trackingGroup=doc.createElement('span');trackingGroup.className='selection-tracking';trackingGroup.setAttribute('role','group');trackingGroup.setAttribute('aria-label','자간');character.append(trackingGroup);
  const narrow=button(trackingGroup,'','자간 좁게',()=>({type:'char-relative',change:{metric:'spacings',direction:-1}})),tracking=doc.createElement('span');tracking.dataset.metric='spacings';trackingGroup.append(tracking);const wider=button(trackingGroup,'','자간 넓게',()=>({type:'char-relative',change:{metric:'spacings',direction:1}}));
  trackingIcon(narrow,false);trackingIcon(wider,true);

  const alignments=['justify','left','center','right'].map(id=>{
    const item=formatMenuItems.find(i=>i.id===id)!;const b=button(paragraph,'',id==='justify'?'양쪽 정렬':item.label,()=>copy(item.command!) as Command);b.dataset.selectionAlign=id;
    // Reuse the actual existing paragraph toolbar icon rather than invent a
    // second icon/command meaning. User confirmed 혼합 = 양쪽 정렬.
    const svg=doc.querySelector(`[data-align="${id}"] svg`);if(svg)b.append(svg.cloneNode(true));else b.textContent=item.label;return b;
  });
  const lineSync=metric(paragraph,'lineSpacing','줄 간격','paragraph',5,5);
  const gaps=doc.createElement('span');gaps.className='selection-paragraph-spacing';paragraph.append(gaps);
  const beforeSync=metric(gaps,'spacingBefore','문단 위 간격','paragraph',1,0),afterSync=metric(gaps,'spacingAfter','문단 아래 간격','paragraph',1,0);
  // Restore hover BEFORE save/print/selection/IME and every unrelated action.
  // No live preview mutation survives this synchronous renderer.
  doc.addEventListener('pointerdown',preview.clear,{capture:true,signal});doc.addEventListener('keydown',preview.clear,{capture:true,signal});doc.addEventListener('compositionstart',preview.clear,{capture:true,signal});doc.addEventListener('scroll',preview.clear,{capture:true,passive:true,signal});doc.defaultView!.addEventListener('blur',preview.clear,{signal});
  function sync(){
    projections.clear();
    const c=state('char'),p=state('paragraph'),family=typeof c.fontFamily==='string'?c.fontFamily:'';font.textContent=formatValueState(c,'fontFamily')==='mixed'?'글꼴 혼합 ▾':family?family.replace('맑은 고딕','맑은고딕')+' ▾':'글꼴 미조회 ▾';
    markFormatToggle(bold,formatToggleState(c,'bold'));color.sync(c);tracking.textContent=num('char','spacings')===undefined?(formatValueState(c,'spacings')==='mixed'?'±':'?'):String(c.spacings)+'%';sizeSync();lineSync();beforeSync();afterSync();
    for(const b of alignments)markFormatToggle(b,formatToggleState(p,'alignment',b.dataset.selectionAlign));
    const type=p.lineSpacingType;if(type!=='Percent'){numbers.get('lineSpacing')!.textContent=type?'비율 아님':'미조회';numbers.get('lineSpacing')!.title=type?'현재는 고정·최소·여백 간격입니다. 문단 속성에서 글자에 따라(%)로 바꾸세요.':'현재 줄 간격 유형을 조회하지 못했습니다.';for(const {button:b}of buttons)if(b.getAttribute('aria-label')?.startsWith('줄 간격'))b.disabled=true;}
    // The popup refreshes during the same click. Keep the command's refusal
    // visible until the user changes the target or attempts another command.
    note.textContent=commandNotice;
  }
  return{sync,clear(){commandNotice = note.textContent = '';preview.clear();color.close(false);fontChoices.hidden=true;font.setAttribute('aria-expanded','false');},dispose(){preview.clear();color.dispose();life.abort();}};
}
