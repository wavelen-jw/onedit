import type {Interaction} from './interaction.js';
import type {Command} from './model.js';
import {assertBoundaryTable} from './table-boundary.js';
import {sameFormatTarget} from './integration/a-format-input-guard.js';
type Resize=Extract<Command,{type:'resize'}>;
// One-use admission proof for the existing noAdjust/source check. Not a document
// cache: revision, exact selection and delta must still agree before History.
const proofs=new WeakMap<Interaction,{capture:ReturnType<Interaction['capture']>;command:string}>();
export async function authorizeLocalResize(editor:Interaction,command:Resize){
 const captured=editor.capture();
 if(captured.selection.kind!=='cells'||captured.selection.focus.kind!=='cell')throw Error('F5로 현재 셀 하나를 선택하세요.');
 await assertBoundaryTable(editor,captured.selection.focus);
 if(!sameFormatTarget(captured,editor.capture()))throw Error('표 제한 조회 중 문서·선택이 변경되어 현재 셀 조절을 취소했습니다.');
 proofs.set(editor,{capture:captured,command:JSON.stringify(command)});return captured;
}
export function assertLocalResizeProof(editor:Interaction,command:Resize,consume=false){
 const proof=proofs.get(editor);
 if(!proof||proof.command!==JSON.stringify(command)||!sameFormatTarget(proof.capture,editor.capture()))throw Error('현재 셀의 정확한 표 제한을 먼저 확인하세요.');
 if(consume)proofs.delete(editor);
}
export const localResizeCommand=(id:string):Resize|undefined=>{
 const delta=({left:[-300,0],right:[300,0],up:[0,-300],down:[0,300]}as Record<string,number[]>)[id];
 if(delta)return{type:'resize',cellOnly:true,redistribute:delta[0]?'x':'y',width:delta[0],height:delta[1]};
};
