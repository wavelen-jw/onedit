import type { Interaction } from './interaction.js';
import { wholeBodySection } from './body-selection.js';
import { characterDelta, countCharacters, type Count } from './character-count-delta.js';
export { countCharacters } from './character-count-delta.js';
import { ordered, paraIndex, withPara, sameContainer, samePosition, type Position, type ParagraphTarget } from './model.js';

// Unicode scalars, including spaces/tabs/NBSP; paragraph/line separators are not
// letters. Do not normalize NFC/NFD or count a surrogate pair twice.
export const characterCountPolicy = '공백·탭 포함, 개행·문단 구분 제외 · Unicode 문자 단위(😀 1자, 결합문자는 각각 집계). 한글 조합은 확정 후 반영합니다.';
const noTextChange=new Set(['resize','char','paragraph','cell','char-relative','paragraph-relative','format-copy','paper','columns','shape-size','control-offset','control-key','table-object','cell-equal','paragraph-list','numbering-restart','style','style-manage']);
const key=(p:Position)=>JSON.stringify(p.kind==='body'?['body',p.sec,p.para]:['cell',p.sec,p.para,p.ancestors??[],p.control,p.cell,p.cellPara]);
const instances=new WeakMap<Interaction,CharacterStatistics>();
export function characterStatistics(editor:Interaction){let v=instances.get(editor);if(!v){v=new CharacterStatistics(editor);instances.set(editor,v);}return v;}
class CharacterStatistics {
  private id='';
  private coreDocument?: Interaction["adapter"]["doc"];private revision=-1;private value?:Count;private timer?:ReturnType<typeof setTimeout>;
  private undo?:Interaction['history']['undoStack'][number];private redo?:Interaction['history']['redoStack'][number];
  private snapshots=new WeakMap<object,{before:Count;after?:Count}>();
  private paragraphs=new Map<string,{length:number;breaks:number[]}>();
  private tableTargets?:ParagraphTarget[];
  error='';onchange=()=>{};
  // The existing native textbox form owns its draft/selection, not Core text.
  selectionOverride:()=>string|undefined=()=>undefined;
  constructor(private editor:Interaction){}
  private paragraph(p:Position){const id=key(p);let value=this.paragraphs.get(id);if(!value){const text=this.editor.adapter.text(p),breaks:number[]=[];let length=0;for(const ch of text){if(/[\r\n\u2028\u2029]/u.test(ch))breaks.push(length);length++;}value={length,breaks};this.paragraphs.set(id,value);}return value;}
  sync():Count|undefined{
    const e=this.editor,a=e.adapter,u=e.history.undoStack.at(-1),r=e.history.redoStack.at(-1);
    if(this.id!==a.documentId||this.coreDocument!==a.doc){
      this.coreDocument = a.doc;clearTimeout(this.timer);this.timer=undefined;this.id=a.documentId;this.revision=-1;this.value=undefined;this.paragraphs.clear();this.tableTargets=undefined;this.snapshots=new WeakMap();this.undo=this.redo=undefined;}
    // Live IME and hover previews are uncommitted. Never publish them as saved text.
    if(a.transientEdit)return this.value;
    if(this.revision!==a.revision){
      clearTimeout(this.timer);this.timer=undefined;
      const before=this.value,oldUndo=this.undo,oldRedo=this.redo;
      const previousRevision=this.revision;
      this.revision=a.revision;this.undo=u;this.redo=r;this.error='';
      const travel=a.revision!==previousRevision+1?undefined:r===oldUndo&&r?this.snapshots.get(r)?.before:u===oldRedo&&u?this.snapshots.get(u)?.after:undefined;
      let next=travel;
      const delta=before&&characterDelta(a,previousRevision);
      if(!next&&before&&delta)
        next={total:before.total+delta.total,withoutSpaces:before.withoutSpaces+delta.withoutSpaces};
      if(!next&&before&&u&&u!==oldUndo&&a.revision===previousRevision+1&&noTextChange.has(u.label))next=before;
      this.paragraphs.clear();this.tableTargets=undefined;this.value=next;
      if(next&&before&&u&&u!==oldRedo){
        if(u!==oldUndo&&a.revision===previousRevision+1)this.snapshots.set(u,{before,after:next});
        else if(u===oldUndo&&delta){
          const group=this.snapshots.get(u);
          if(group)this.snapshots.set(u,{before:group.before,after:next});
        }
      }
      if(!next){
        // A grouped edit with no certified delta can have changed the recorded
        // endpoint; keep the original Undo count but invalidate the Redo count.
        if(u&&u===oldUndo&&u!==oldRedo){
          const group=this.snapshots.get(u);
          if(group)this.snapshots.set(u,{before:group.before});
        }
        const id=this.id,revision=this.revision,coreDocument=a.doc;
        // Coalesce structural edits/key repeats; never scan a document on drag,
        // selection changes, formatting or repeated resize commands.
        this.timer=setTimeout(()=>{this.timer=undefined;if(a.documentId!==id||a.doc!==coreDocument||a.revision!==revision||a.transientEdit)return;
          try{this.value=countCharacters(a.call<string>('getTextFileUnicode'));this.error='';if(u&&before&&u!==oldUndo&&u!==oldRedo&&revision===previousRevision+1)this.snapshots.set(u,{before,after:this.value});else if(u&&u===oldUndo&&u!==oldRedo){const group=this.snapshots.get(u);if(group)this.snapshots.set(u,{before:group.before,after:this.value});}}
          catch(error){this.error=String(error);console.warn('문서 글자수 조회 실패',error);}
          this.onchange();
        },120);
      }
    }
    // A pending initial read can meet live composition. Cancellation need not
    // change revision, so let the next committed/cancelled projection retry it.
    if(!this.value&&!this.timer&&!this.error){this.revision=-1;return this.sync();}
    return this.value;
  }
  selection(){
    const override=this.selectionOverride();if(override!==undefined)return override;
    const e=this.editor,s=e.selection,a=e.adapter;
    if(s.kind==='cells')return `${e.presentationCellCount(s)}개 셀 선택 · Esc/Enter로 입력`;
    if(s.kind==='table')return `표 선택 · ${e.presentationCellCount(s)}개 셀`;
    if(s.kind==='object'){
      if(s.textbox){const t=a.resolveParagraph(s.textbox.target),lo=Math.min(s.textbox.anchor,s.textbox.offset),hi=Math.max(s.textbox.anchor,s.textbox.offset);
        if(hi>lo){const text=a.doc.getTextInCellByPath(t.sectionIndex,t.parentParaIndex,JSON.stringify(t.path),lo,hi-lo);return `글상자 선택 ${countCharacters(text).total}자`;}}
      return '개체 선택';
    }
    if(s.kind!=='text')return '';
    if(a.doc.getSectionCount()===1&&wholeBodySection(a,s)&&this.value)
      return `선택 ${this.value.total}자`;
    const [from,to]=ordered(s.anchor,s.focus);let count=0;
    if(!sameContainer(from,to))throw Error('선택 텍스트 소유 범위가 다릅니다.');
    for(let i=paraIndex(from);i<=paraIndex(to);i++){
      const p=withPara(from,i),text=this.paragraph(p);
      const start=i===paraIndex(from)?a.textOffset(from):0,end=i===paraIndex(to)?a.textOffset(to):text.length;
      count+=end-start-text.breaks.filter(n=>n>=start&&n<end).length;
      if(p.kind==='body'){
        const lo=i===paraIndex(from)?from.offset:0,hi=i===paraIndex(to)?to.offset:a.length(p),all=lo===0&&i<paraIndex(to);
        const controls=new Set<number>();
        if(all||hi-lo>end-start){
          const targets=this.tableTargets??=(a.call<{targets:ParagraphTarget[]}>('getCellParagraphPaths').targets);
          if(all){for(const t of targets)if(t.sectionIndex===p.sec&&t.parentParaIndex===p.para)controls.add(t.path[0].controlIndex);}
          else {for(const table of a.inline(p))if(table.offset>=lo&&table.offset<hi)controls.add(table.controlIndex);}
          // One root table range includes its nested paragraphs once each.
          const seen=new Set<string>();for(const t of targets){if(t.sectionIndex!==p.sec||t.parentParaIndex!==p.para||!controls.has(t.path[0].controlIndex)||seen.has(t.targetId))continue;seen.add(t.targetId);
            const leaf=t.path.at(-1)!,cell:Position={kind:'cell',sec:t.sectionIndex,para:t.parentParaIndex,control:leaf.controlIndex,cell:leaf.cellIndex,cellPara:leaf.cellParaIndex,offset:0,...(t.path.length>1?{ancestors:t.path.slice(0,-1)}:{})};
            const value=this.paragraph(cell);count+=value.length-value.breaks.length;
          }
        }
      }
    }
    return !samePosition(from,to)?`선택 ${count}자`:'';
  }
}
