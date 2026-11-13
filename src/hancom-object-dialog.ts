// UI1 reference: actual picture4/plain-textbox5 property tabs at native DPI144.
// Move existing draft inputs; only their existing Command may mutate a document.
import { objectLinePalette } from './object-line-palette.js';
import { editableShapeLineType, shapeLineTypes, editableShapeRoundRate } from './shapes.js';
type Fields = { title: HTMLElement; width: HTMLInputElement; height: HTMLInputElement;
  ratio: HTMLInputElement; placement?: HTMLSelectElement; file?: HTMLInputElement; description?: HTMLTextAreaElement;
  message: HTMLElement; note: HTMLElement; ok: HTMLButtonElement; cancel: HTMLButtonElement; remove?: HTMLButtonElement; editLine?: boolean; readOnlyReason?:string };
const lifetimes = new WeakMap<HTMLElement, () => void>();
export function resetHancomObjectDialog(form: HTMLElement) { lifetimes.get(form)?.(); lifetimes.delete(form); }
const unitMM = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? (n * 25.4 / 7200).toFixed(2) : undefined;
const color = (n: unknown) => typeof n === "number" ? `#${(n & 0xffffff).toString(16).padStart(6,"0")}` : undefined;
// Shape/picture line getters use COLORREF (low byte red), unlike CSS hex.
const lineColor = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffff
  ? '#'+[n&255,(n>>8)&255,(n>>16)&255].map(v=>v.toString(16).padStart(2,'0')).join('') : undefined;
export function mountHancomObjectDialog(form: HTMLFormElement, kind: "picture" | "textbox", props: Record<string, any>, f: Fields) {
  resetHancomObjectDialog(form);
  const original = [...form.childNodes], life = new AbortController(), signal = life.signal, dialog = form.closest("dialog")!;
  const oldTitle = f.title.textContent, oldOK = f.ok.textContent, oldCancel = f.cancel.textContent, oldNoValidate=f.ok.formNoValidate;
  dialog.classList.add("object-ui1-dialog"); dialog.dataset.objectKind = kind;
  f.title.textContent = "개체 속성"; f.ok.textContent = "설정(D)"; f.cancel.textContent = "취소";
  const tabs = document.createElement("nav"), body = document.createElement("div"), buttons = document.createElement("menu");
  tabs.className = "object-tabs"; tabs.setAttribute("role","tablist"); tabs.setAttribute("aria-label","개체 속성 탭");
  body.className = "object-panels"; buttons.append(f.ok, f.cancel);
  const labels = kind === "picture" ? ["기본","여백/캡션","선","그림","그림자","반사","네온","옅은 테두리"] : ["기본","여백/캡션","선","채우기","글상자","그림자"];
  const panels: HTMLElement[] = [], tabButtons: HTMLButtonElement[] = [];
  let current = 0;
  let closePalette: (() => void) | undefined, openPalette: (() => void) | undefined;
  const switchTab = (i: number) => {
    closePalette?.();
    current = i;
    panels.forEach((p,n) => p.hidden = n !== i);
    tabButtons.forEach((b,n) => { b.setAttribute("aria-selected",String(n===i)); b.tabIndex = n===i ? 0 : -1; });
  };
  labels.forEach((text,i) => {
    const b = document.createElement("button"); b.type="button"; b.textContent=text; b.setAttribute("role","tab"); b.dataset.objectTab=String(i); b.id=`${kind}-property-tab-${i}`;
    const p = document.createElement("section"); p.className="object-tab-panel"; p.setAttribute("role","tabpanel"); p.id=b.id+"-panel"; p.setAttribute("aria-labelledby",b.id); b.setAttribute("aria-controls",p.id);
    b.disabled = i >= (kind==="picture" ? 4 : 5); b.title = b.disabled ? "탭 이름만 관측됨 · 효과 상세 미관측/편집 미지원 · 원본 유지" : text;
    b.onclick=()=>switchTab(i); b.onkeydown=e=>{ if(e.isComposing||e.altKey||e.ctrlKey||e.metaKey||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
      e.preventDefault(); const available=tabButtons.filter(x=>!x.disabled),at=available.indexOf(b),n=e.key==="Home"?0:e.key==="End"?available.length-1:(at+(e.key==="ArrowLeft"?-1:1)+available.length)%available.length;
      available[n].click();available[n].focus(); };
    tabs.append(b);body.append(p);panels.push(p);tabButtons.push(b);
  });
  const group=(p:HTMLElement,title:string,cls="")=>{const g=document.createElement("fieldset"),l=document.createElement("legend");g.className=cls;l.textContent=title;g.append(l);p.append(g);return g;};
  function field(g:HTMLElement, caption:string, value:unknown, key:string, type="text", unit="") {
    const row=document.createElement("label"), text=document.createElement("span"), c=document.createElement("input"); text.textContent=caption;c.type=type;c.disabled=true;c.dataset.objectRead=key;
    const known=value!==undefined&&value!==null;c.title=known?"기존 Core 조회값 · 이 속성의 변경 UI 미연결 · 원본 유지":"조회 미연결 · 값을 추정하지 않고 원본 유지";
    row.title=c.title;row.className="object-readonly";
    if(type==="checkbox"){c.checked=value===true;c.indeterminate=!known;row.append(c,text);}else{c.value=known?String(value):"";c.placeholder=known?"":"미조회";row.append(text,c);if(unit)row.append(document.createTextNode(unit));}
    g.append(row);return c;
  }
  const numeric=(g:HTMLElement,label:string,key:string,unit="mm")=>field(g,label,unit==="mm"?unitMM(props[key]):props[key],key,"text",unit);
  const size=group(panels[0],"크기","object-size");
  const proxies: {source:HTMLInputElement; input:HTMLInputElement; initialPt:string; initialMM:string}[]=[];
  for(const [label,source,key]of [["너비",f.width,"width"],["높이",f.height,"height"]] as const){
    const row=document.createElement("label"),text=document.createElement("span"),mode=document.createElement("select"),input=document.createElement("input");text.textContent=label;mode.add(new Option("고정값","fixed"));mode.disabled=true;mode.title="상대 크기 방식은 조회·변경 미연결 · 기존 절대 크기만 사용";
    source.closest("label")!.hidden=true;source.dataset.objectBacking="true";
    input.type="number";input.disabled=source.disabled;input.step="any";input.min=String(Number(source.min)*25.4/72);input.max=String(Number(source.max)*25.4/72);input.dataset.objectSize=key;input.setAttribute("aria-label",`${label} (mm)`);input.value=(Number(source.value)*25.4/72).toFixed(2);input.title=source.disabled?`현재 값 ${source.value}pt · 조회 전용 · 원본 유지`:`원래 값 ${source.value}pt · 명시 변경할 때만 0.01pt로 적용`;
    const proxy={source,input,initialPt:source.value,initialMM:input.value};proxies.push(proxy);
    input.oninput=()=>{source.value=input.value===proxy.initialMM?proxy.initialPt:input.value.trim()===""?"":String(Math.round(Number(input.value)*72/25.4*100)/100);source.dispatchEvent(new Event("input",{bubbles:true}));};
    row.append(text,mode,input,document.createTextNode("mm"));size.append(row);
  }
  const refreshSize=(source:HTMLInputElement)=>{for(const p of proxies)if(p.source!==source)p.input.value=p.source.value===""?"":(Number(p.source.value)*25.4/72).toFixed(2);};
  for(const source of [f.width,f.height]){source.addEventListener("input",()=>refreshSize(source),{signal});source.addEventListener("invalid",()=>{switchTab(0);proxies.find(p=>p.source===source)!.input.focus();},{signal});}
  // Hidden backing controls still use the unchanged Command's pt validation.
  // Validate the visible mm fields explicitly so an invalid value on a hidden
  // tab can be focused; do not ask the browser to focus a hidden pt backing.
  f.ok.formNoValidate=true;
  form.addEventListener("submit",e=>{const invalid=proxies.find(p=>(p.source.value!==p.initialPt||p.input.value!==p.initialMM)&&!p.input.checkValidity());if(invalid){e.preventDefault();e.stopImmediatePropagation();switchTab(0);invalid.input.reportValidity();}},{capture:true,signal});
  field(size,"크기 고정",props.sizeProtect,"sizeProtect","checkbox");
  const ratio=f.ratio.closest("label")!;ratio.classList.add("object-ratio");ratio.prepend(f.ratio);size.append(ratio);f.ratio.title="기존 Edit 크기 비율 유지 초안 · 원본 속성을 변경하지 않음";
  const position=group(panels[0],"위치","object-position");
  let syncPlacement=()=>{};
  if(f.placement){
    const source=f.placement;source.closest("label")!.hidden=true;source.dataset.objectBacking="true";
    const row=document.createElement("label"),inline=document.createElement("input");inline.type="checkbox";inline.dataset.objectInline="true";row.append(inline,document.createTextNode("글자처럼 취급"));position.append(row);
    const wrap=document.createElement("div");wrap.className="object-wrap";const note=document.createElement("p");note.textContent="본문과의 배치";wrap.append(note);
    const wraps:HTMLButtonElement[]=[];
    for(const [v,t]of [["Square","어울림"],["TopAndBottom","자리 차지"],["BehindText","글 뒤로"],["InFrontOfText","글 앞으로"]]){
      const b=document.createElement("button");b.type="button";b.dataset.objectWrap=v;b.setAttribute("aria-label",t);b.title=t;const icon=document.createElement("span");icon.className=`object-wrap-icon wrap-${v}`;icon.setAttribute("aria-hidden","true");icon.textContent="▣";b.append(icon);b.onclick=()=>{source.value=v;source.dispatchEvent(new Event("change",{bubbles:true}));};wraps.push(b);wrap.append(b);
    }
    position.append(wrap);inline.onchange=()=>{source.value=inline.checked?"inline":props.textWrap;source.dispatchEvent(new Event("change",{bubbles:true}));};
    syncPlacement=()=>{inline.checked=source.value==="inline";wraps.forEach(b=>{b.disabled=inline.checked;b.setAttribute("aria-pressed",String(source.value===b.dataset.objectWrap));});};source.addEventListener("change",syncPlacement,{signal});syncPlacement();
  }else{field(position,"글자처럼 취급",props.treatAsChar,"treatAsChar","checkbox");field(position,"본문과의 배치",({Square:"어울림",TopAndBottom:"자리 차지",BehindText:"글 뒤로",InFrontOfText:"글 앞으로"}as Record<string,string>)[props.textWrap]??props.textWrap,"textWrap");}
  for(const [label,rel,align,offset]of [["가로","horzRelTo","horzAlign","horzOffset"],["세로","vertRelTo","vertAlign","vertOffset"]]){
    const row=document.createElement("div");row.className="object-coordinate";position.append(row);field(row,label,({Paper:"종이",Page:"쪽",Para:"문단",Column:"단"}as Record<string,string>)[props[rel]]??props[rel],rel);field(row,"의",({Left:"왼쪽",Right:"오른쪽",Top:"위",Bottom:"아래",Center:"가운데",Inside:"안쪽",Outside:"바깥쪽"}as Record<string,string>)[props[align]]??props[align],align);numeric(row,"기준",offset);
  }
  field(position,"쪽 영역 안으로 제한",props.restrictInPage,"restrictInPage","checkbox");field(position,"서로 겹침 허용",props.allowOverlap,"allowOverlap","checkbox");field(position,"개체와 조판부호를 항상 같은 쪽에 놓기",undefined,"samePage","checkbox");
  const transform=document.createElement("div");transform.className="object-transform";panels[0].append(transform);numeric(group(transform,"개체 회전"),"회전각","rotationAngle","°");const skew=group(transform,"기울이기");field(skew,"가로",undefined,"skewX","text","°");field(skew,"세로",undefined,"skewY","text","°");
  const other=group(panels[0],"기타");field(other,"번호 종류",undefined,"numbering");if(kind==='picture'&&f.description)other.append(f.description.closest('label')!);else field(other,"개체 설명문",props.description,"description");field(other,"개체 보호하기",undefined,"objectProtect","checkbox");
  const margins=(parent:HTMLElement,title:string,prefix:string)=>{const g=group(parent,title,"object-margins");for(const [side,label]of [["Left","왼쪽"],["Top","위쪽"],["Right","오른쪽"],["Bottom","아래쪽"]])numeric(g,label,prefix+side);return g;};
  margins(panels[1],"바깥 여백","outerMargin");const caption=group(panels[1],"캡션","object-caption");
  const spots=document.createElement("div");spots.className="object-caption-spots";for(let i=0;i<9;i++){const b=document.createElement("button");b.type="button";b.disabled=true;b.title="캡션 편집 UI 미연결 · 원본 유지";b.textContent=["#1▣","#1\n▣","▣#1","#1▣","▣","▣#1","▣#1","▣\n#1","▣#1"][i];b.setAttribute("aria-label",`캡션 위치 ${i+1} · 변경 미지원`);b.setAttribute("aria-pressed",String(!props.hasCaption&&i===4));spots.append(b);}caption.append(spots);
  field(caption,"캡션 있음",props.hasCaption,"hasCaption","checkbox");numeric(caption,"크기","captionWidth");numeric(caption,"개체와의 간격","captionSpacing");field(caption,"여백 부분까지 너비 확대",props.captionIncludeMargin,"captionIncludeMargin","checkbox");field(caption,"한 줄로 입력",undefined,"captionSingleLine","checkbox");
  const line=group(panels[2],"선");
  let readLine: () => { borderColor?: number; borderWidth?: number; lineType?: number; roundRate?: number; fillBgColor?: number } = () => ({});
  let focusLineType: (() => void) | undefined;
  const editableLine = kind === 'textbox' && f.editLine &&
    Number.isInteger(props.borderColor) && props.borderColor >= 0 && props.borderColor <= 0xffffff &&
    Number.isInteger(props.borderWidth) && props.borderWidth >= 0 && props.borderWidth <= 7200;
  if (editableLine) {
    line.classList.add('object-line-editor');
    const palette=objectLinePalette(lineColor(props.borderColor)!,signal);
    closePalette=()=>palette.close(false);openPalette=()=>{switchTab(2);palette.open();};
    line.append(palette.row);
    let readType: () => { lineType?: number } = () => ({});
    if (editableShapeLineType(props)) {
      const typeRow=document.createElement('label'),typeLabel=document.createElement('span'),type=document.createElement('select');
      typeLabel.textContent='종류';type.dataset.objectLineType='true';type.setAttribute('aria-label','선 종류');
      for(const [v,label]of shapeLineTypes)type.add(new Option(label,String(v)));
      type.value=String(props.lineType);type.title='기존 Core 지원 선 종류 · 설정 전에는 초안만 변경';
      type.title+=' · Alt+L';focusLineType=()=>{switchTab(2);type.focus();};
      const sample=document.createElement('span');sample.className='object-line-sample';sample.setAttribute('aria-hidden','true');
      const paint=()=>{sample.dataset.lineType=type.value;};type.addEventListener('change',paint,{signal});paint();
      readType=()=>{const value=Number(type.value);if(!shapeLineTypes.some(([v])=>v===value)||type.value===''){switchTab(2);type.focus();throw Error('지원하는 선 종류를 선택하세요.');}return value===props.lineType?{}:{lineType:value};};
      typeRow.append(typeLabel,type,sample);line.append(typeRow);
    }else field(line,'종류',props.lineType,'lineType');
    field(line,"끝 모양",props.lineEndShape,"lineEndShape");
    const widthRow=document.createElement('label'),widthLabel=document.createElement('span'),width=document.createElement('input');widthLabel.textContent='굵기';width.type='number';width.min='0';width.max='25.4';width.step='0.01';width.value=unitMM(props.borderWidth)!;width.dataset.objectLineWidth='true';width.setAttribute('aria-label','선 굵기 (mm)');width.title='Edit 지원 범위 0~25.4mm · 원래 HU는 명시 변경할 때만 변환';const initialWidth=width.value;widthRow.append(widthLabel,width,document.createTextNode('mm'));line.append(widthRow);
    readLine=()=>{
      const validColor=palette.read();
      if(!width.value.trim()||!width.checkValidity()){switchTab(2);width.focus();width.reportValidity();throw Error('선 굵기는 0~25.4mm 범위로 입력하세요.');}
      const rgb=parseInt(validColor.slice(1),16),borderColor=((rgb&255)<<16)|(rgb&0xff00)|((rgb>>16)&255),borderWidth=width.value===initialWidth?props.borderWidth:Math.round(Number(width.value)*7200/25.4);
      return {...(borderColor!==props.borderColor?{borderColor}:{}),...(borderWidth!==props.borderWidth?{borderWidth}:{}),...readType()};
    };
  } else {
    field(line,"색",lineColor(props.borderColor),"borderColor");field(line,"종류",kind==="picture"?undefined:props.lineType===1?"실선":props.lineType,"lineType");field(line,"끝 모양",props.lineEndShape,"lineEndShape");numeric(line,"굵기","borderWidth");
  }
  const arrow=group(panels[2],"화살표");for(const [l,k]of [["시작 모양","arrowStart"],["끝 모양","arrowEnd"],["시작 크기","arrowStartSize"],["끝 크기","arrowEndSize"]])field(arrow,l,props[k],k);
  // The plain rectangle has no cap/arrow paint consumer in its ShapeStyle.
  // Existing stored values remain query-only; this does not disable line objects.
  if(kind==='textbox')for(const key of ['lineEndShape','arrowStart','arrowEnd','arrowStartSize','arrowEndSize']){
    const fieldInput=panels[2].querySelector<HTMLInputElement>(`[data-object-read="${key}"]`);
    if(fieldInput){fieldInput.title='일반 사각형은 이 끝모양/화살표의 표시 소비가 없습니다. 저장된 원본을 유지합니다.';fieldInput.closest('label')!.title=fieldInput.title;}
  }
  const corners=group(panels[2],"사각형 모서리 곡률","object-options");
  const editableRound=kind==='textbox'&&f.editLine===true&&editableShapeRoundRate(props);
  let readRound:()=>{roundRate?:number}=()=>({});
  if(editableRound){
    const row=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');
    caption.textContent='곡률 지정';input.type='number';input.min='0';input.max='50';input.step='1';input.value=String(props.roundRate);
    input.dataset.objectRoundRate='true';input.setAttribute('aria-label','곡률 (%)');input.title='기존 Core 반지름 비율 0~50% · 원본은 명시 변경할 때만 적용';
    const presetButtons:HTMLButtonElement[]=[];
    const paint=()=>{for(const button of presetButtons)button.setAttribute('aria-pressed',String(input.value!==''&&Number(input.value)===Number(button.dataset.objectCorner)));};
    for(const [value,label]of [[0,'직각'],[20,'둥근 모양 (20%)'],[50,'반원 (50%)']]as const){
      const button=document.createElement('button');button.type='button';button.dataset.objectCorner=String(value);button.textContent=label;
      button.title='기존 Core 비율 초안 · 한컴 펼침/프리셋 정확값 동등성은 미확인';
      button.addEventListener('click',()=>{input.value=String(value);paint();},{signal});presetButtons.push(button);corners.append(button);
    }
    input.addEventListener('input',paint,{signal});input.addEventListener('change',paint,{signal});paint();row.append(caption,input,document.createTextNode('%'));corners.append(row);
    readRound=()=>{if(!input.value.trim()||!input.checkValidity()){switchTab(2);input.focus();input.reportValidity();throw Error('곡률은 0~50% 정수로 입력하세요.');}const value=Number(input.value);return value===props.roundRate?{}:{roundRate:value};};
  }else{
    for(const [value,label]of [[0,'직각'],[20,'둥근 모양'],[50,'반원']]as const){const b=document.createElement('button');b.type='button';b.disabled=true;b.textContent=label;b.dataset.objectCorner=String(value);b.setAttribute('aria-pressed',String(props.roundRate===value));b.title='미조회·지원 범위 밖 또는 이 개체의 변경 미지원 · 원본 유지';corners.append(b);}
    const held=field(corners,'곡률 지정',props.roundRate,'roundRate','text','%');held.title='이 개체의 곡률은 조회·변경 범위가 확인되지 않았습니다. 원본을 유지합니다.';held.closest('label')!.title=held.title;
  }
  const readExistingLine=readLine;readLine=()=>({...readExistingLine(),...readRound()});
  const arc=group(panels[2],"호 테두리");for(const l of ["호","부채꼴","활 모양"])field(arc,l,undefined,"arc"+l,"checkbox");const lineOther=group(panels[2],"투명도 설정 · 기타");field(lineOther,"투명도",undefined,"lineAlpha","text","%");field(lineOther,"선 굵기 내부 적용",undefined,"lineInside","checkbox");
  if(kind==="picture"){
    const image=panels[3],fileGroup=group(image,"파일 이름","object-file");if(f.file)fileGroup.append(f.file);field(fileGroup,"문서에 포함",props.externalPath===undefined,"embedded","checkbox");
    const scale=group(image,"확대/축소 비율");field(scale,"가로",props.originalWidth>0?(props.width/props.originalWidth*100).toFixed(2):undefined,"scaleX","text","%");field(scale,"세로",props.originalHeight>0?(props.height/props.originalHeight*100).toFixed(2):undefined,"scaleY","text","%");scale.append(ratio);
    margins(image,"그림 자르기","crop");margins(image,"그림 여백","padding");const effect=group(image,"그림 효과");field(effect,"효과",({RealPic:"효과 없음",GrayScale:"회색조",BlackWhite:"흑백",Pattern8x8:"무늬"}as Record<string,string>)[props.effect]??props.effect,"effect");numeric(effect,"밝기","brightness","%");numeric(effect,"대비","contrast","%");field(effect,"워터마크 효과",undefined,"watermark","checkbox");field(effect,"그림 반전",undefined,"imageInvert","checkbox");numeric(group(image,"투명도 설정"),"투명도","transparency","%");
  }else{
    const fill=group(panels[3],"채우기");field(fill,"색 채우기 없음",props.fillType==="none","fillNone","checkbox");field(fill,"색",props.fillType==="solid","fillSolid","checkbox");if(f.editLine&&props.fillType==='solid'&&props.fillPatType===-1&&lineColor(props.fillBgColor)){
      const row=document.createElement('label'),input=document.createElement('input');input.type='text';input.value=lineColor(props.fillBgColor)!;input.dataset.objectFillColor='';input.setAttribute('aria-label','글상자 배경색');input.title='무늬 없는 단색 채우기 · #RRGGBB · 설정 전 초안';row.append('면 색 ',input);fill.append(row);const priorRead=readLine;readLine=()=>{const value=input.value.trim();if(!/^#[0-9a-fA-F]{6}$/.test(value)){switchTab(3);input.focus();throw Error('배경색을 #RRGGBB로 입력하세요.');}const v=parseInt(value.slice(1,3),16)|(parseInt(value.slice(3,5),16)<<8)|(parseInt(value.slice(5,7),16)<<16);return{...priorRead(),...(v===props.fillBgColor?{}:{fillBgColor:v})};};
    }else field(fill,"면 색",lineColor(props.fillBgColor),"fillBgColor");field(fill,"무늬 색",color(props.fillPatColor),"fillPatColor");field(fill,"무늬 모양",props.fillPatType,"fillPatType");field(fill,"그라데이션",props.fillType==="gradient","fillGradient","checkbox");for(const [l,k]of [["유형","gradientType"],["기울임","gradientAngle"],["가로 중심","gradientCenterX"],["세로 중심","gradientCenterY"],["번짐 정도","gradientBlur"]])field(fill,l,props[k],k);field(fill,"그림",props.fillType==="image","fillImage","checkbox");field(fill,"그림 파일",undefined,"fillImageFile");field(fill,"문서에 포함",undefined,"fillImageEmbedded","checkbox");field(group(panels[3],"투명도 설정"),"투명도",props.fillAlpha,"fillAlpha","text","/255");
    margins(panels[4],"안쪽 여백","tbMargin");const text=group(panels[4],"속성");field(text,"세로 정렬",({Top:"위",Center:"가운데",Bottom:"아래"}as Record<string,string>)[props.tbVerticalAlign]??props.tbVerticalAlign,"tbVerticalAlign");field(text,"글자 방향 설정",undefined,"tbDirection","checkbox");field(text,"한 줄로 입력",undefined,"tbSingleLine","checkbox");const fieldGroup=group(panels[4],"필드");field(fieldGroup,"필드 이름",undefined,"tbFieldName");field(fieldGroup,"양식 모드에서 편집 가능",undefined,"tbForm","checkbox");
  }
  const note=document.createElement("p");note.className="object-scope-note";note.textContent=f.readOnlyReason??("크기"+(kind==="picture"?"·본문 배치·개체 설명문·지원 그림 교체":" 늘리기"+(editableLine?"·지원 단색 배경/선 색/굵기"+(focusLineType?"/종류":""):"")+(editableRound?"·모서리 곡률":""))+"는 기존 명령으로 적용합니다. 비활성 값은 조회만 하며 미조회 속성은 추정하지 않습니다. 원본 유지.");
  const backing=document.createElement("div");backing.hidden=true;for(const source of [f.width,f.height,f.placement])if(source)backing.append(source.closest("label")!);
  const close=document.createElement("button");close.type="button";close.className="object-close";close.textContent="×";close.setAttribute("aria-label","개체 속성 닫기");close.onclick=()=>f.cancel.click();
  const extras=document.createElement("div");extras.className="object-extras";extras.append(f.message,f.note);if(f.remove)extras.append(f.remove);
  form.replaceChildren(f.title,tabs,body,buttons,note,extras,backing,close);f.title.id=kind+"-properties-title";dialog.setAttribute("aria-labelledby",f.title.id);
  dialog.addEventListener("keydown",e=>{if(e.isComposing||e.keyCode===229||e.repeat)return;if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){const key=e.key.toLowerCase();if(key==='d'){e.preventDefault();e.stopPropagation();f.ok.click();}else if(key==='c'&&openPalette){e.preventDefault();e.stopPropagation();openPalette();}else if(key==='l'&&focusLineType){e.preventDefault();e.stopPropagation();focusLineType();}}},{signal});
  switchTab(current);
  lifetimes.set(form,()=>{life.abort();form.replaceChildren(...original);dialog.classList.remove("object-ui1-dialog");delete dialog.dataset.objectKind;dialog.removeAttribute("aria-labelledby");f.title.textContent=oldTitle;f.ok.textContent=oldOK;f.cancel.textContent=oldCancel;f.ok.formNoValidate=oldNoValidate;for(const source of [f.width,f.height,f.placement])if(source){source.closest("label")!.hidden=false;delete source.dataset.objectBacking;} });
  return {focus:()=>tabButtons[0].focus(),line:readLine};
}
