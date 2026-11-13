// Hancom WEB v2 grouping supplied/observed 2026-11-01, not desktop HWP.
// Only reviewed existing Edit entrances. File content is out of scope.
export type WebMenuRow={separator?:boolean;label?:string;command?:string;children?:WebMenuRow[];retainUnavailable?:boolean};
const row=(label:string,command:string):WebMenuRow=>({label,command});
const sep=():WebMenuRow=>({separator:true});
export const webMenuCatalog:Record<string,WebMenuRow[]>={
 edit:[row('되돌리기','edit:undo'),row('다시 실행','edit:redo'),sep(),row('오려 두기','edit:cut'),row('복사하기','edit:copy'),row('붙이기','edit:paste'),sep(),row('모양 복사','edit:format-copy'),row('모양 붙여넣기','edit:format-paste'),sep(),row('지우기','edit:delete'),row('모두 선택','edit:all'),sep(),row('찾기','edit:find'),row('바꾸기','edit:replace'),row('찾아가기','edit:goto')],
 view:[{label:'화면 확대/축소',children:[row('쪽 맞춤','view:zoom-fit-page'),row('폭 맞춤','view:zoom-fit-width'),sep(),...[50,75,100,125,150,200,300].map(n=>row(n+'%','view:zoom-'+n))]},sep(),row('문단 부호','view:para-mark'),row('조판 부호','view:ctrl-mark'),row('투명 선','view:border-transparent')],
 insert:[{label:'도형',command:'insert:shape',retainUnavailable:true},row('글상자','insert:textbox'),row('그림','insert:image'),row('표 만들기','table:create'),row('수식','insert:equation'),sep(),row('문자표','insert:symbols'),row('필드 입력','insert:field'),sep(),row('각주','insert:footnote'),row('미주','insert:endnote')],
 format:[row('글자 모양','format:char-shape'),row('문단 모양','format:para-shape'),sep(),row('글머리표 모양','format:bullet-shape'),row('문단 번호 모양','format:para-num-shape'),row('한 수준 증가','format:level-increase'),row('한 수준 감소','format:level-decrease'),sep(),row('개체 속성','format:object-properties')],
 page:[row('편집 용지','page:setup'),sep(),row('머리말/꼬리말','page:header-create'),row('쪽 번호 넣기','page:page-number'),sep(),row('쪽 나누기','page:break'),row('단 나누기','page:column-break'),{label:'다단',children:[row('1단','page:col-1'),row('2단','page:col-2')]}],
 table:[row('표 만들기','table:create'),row('표/셀 속성','table:cell-props'),sep(),{label:'셀 테두리/배경',children:[row('각 셀마다 적용','table:border-each'),row('하나의 셀처럼 적용','table:border-one')]},sep(),row('줄/칸 추가하기…','table:insert-row-col'),row('줄/칸 지우기…','table:delete-row-col'),sep(),row('셀 나누기','table:cell-split'),row('셀 합치기','table:cell-merge'),row('셀 높이를 같게','table:cell-height-equal'),row('셀 너비를 같게','table:cell-width-equal'),
  // Explicit user cutoff/exception: retain the unconnected source entry with
  // truthful disabled state. In-place transpose is a different operation.
  {label:'행/열 바꿈 복사',command:'table:transpose-copy',retainUnavailable:true}],
 tools:[// Previously approved Edit utilities; no fake Web quick-correction/chat.
  row('환경 설정','tools:environment'),sep(),row('한/글 단축키 결과','tools:shortcut-results')],
};
