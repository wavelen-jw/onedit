// Labels/order from UI1-CONTEXT-PICTURE-VERIFIED and UI1-CONTEXT-TEXTBOX.
// No source icon/image is copied. Unsupported entries retain explicit reasons.
export function objectContextItems(kind: "picture" | "textbox"): readonly (readonly [string,string,string?,boolean?])[] {
  const shared: readonly (readonly [string,string,string?,boolean?])[] = [
    ["properties","개체 속성(P)…","P"], ["cut","오려 두기(T)","Ctrl+X",true],
    ["copy","복사하기(C)","Ctrl+C"], ["delete","지우기(D)","Ctrl+E"],
  ];
  return kind==="picture" ? [...shared,
    ["front","맨 앞으로","Shift+Page Up",true],["back","맨 뒤로","Shift+Page Down"],["inFrontOfText","글 앞으로 (떠 있는 개체)","Shift+Home"],["behindText","글 뒤로 (떠 있는 개체)","Shift+End"],["line","선 속성…","L"],["ungroup","개체 풀기(U)","U",true],
    ["caption","캡션 넣기(A)","Ctrl+N,C"],["format-copy","개체 모양 복사(L)…","Alt+Shift+C"],["format-paste","개체 모양 붙이기(M)","Alt+Shift+V"],
    ["crop","자르기(H)","",true],["hyperlink","하이퍼링크(Y)…","Ctrl+K,H",true],["ocr","그림에서 글자 가져오기(I)"],
    ["register","그리기마당에 등록(R)","",true],["save-image","그림 파일로 저장(S)"],["protect","개체 보호하기(K)"],["description","개체 설명문(F)…"],["tag","태그 넣기(B)…","",true],
  ] : [...shared,
    ["fill","채우기(H)","›"],["front","맨 앞으로","Shift+Page Up",true],["back","맨 뒤로","Shift+Page Down"],["inFrontOfText","글 앞으로 (떠 있는 개체)","Shift+Home"],["behindText","글 뒤로 (떠 있는 개체)","Shift+End"],["line","선 속성…","L"],["ungroup","개체 풀기(U)","U",true],
    ["caption","캡션 넣기(A)","Ctrl+N,C"],["text","도형 안에 글자 넣기(B)"],["remove-textbox","글상자 속성 없애기(G)"],["new-style","새 그리기 속성으로(W)"],
    ["format-copy","개체 모양 복사(L)…","Alt+Shift+C"],["format-paste","개체 모양 붙이기(M)","Alt+Shift+V"],
    ["polygon","다각형 편집(I)","",true],["polygon-close","열린 다각형 닫기/닫힌 다각형 열기(V)"],["connector","연결선 종류(Z)","›"],
    ["hyperlink","하이퍼링크(Y)…","Ctrl+K,H",true],["register","그리기마당에 등록(R)","",true],["save-image","그림 파일로 저장(S)"],["protect","개체 보호하기(K)"],["description","개체 설명문(F)…"],["tag","태그 넣기(E)…","",true],
  ];
}
export function renderObjectContextItems(popup:HTMLElement,kind:"picture"|"textbox",activate:(id:string)=>void,dataName:"pictureContextAction"|"shapeContextAction") {
  popup.classList.add("object-ui1-context");popup.dataset.objectKind=kind;
  const buttons=new Map<string,HTMLButtonElement>();
  for(const [id,label,shortcut,separator]of objectContextItems(kind)) {
    const b=document.createElement("button"),text=document.createElement("span"),key=document.createElement("span");b.type="button";b.setAttribute("role","menuitem");b.dataset[dataName]=id;
    text.textContent=label;key.textContent=shortcut??"";key.className="object-menu-shortcut";b.append(text,key);if(separator)b.classList.add("object-menu-separator");b.onclick=()=>activate(id);popup.append(b);buttons.set(id,b);
  }
  return buttons;
}
