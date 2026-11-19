export function objectContextItems(kind: "picture" | "textbox"): readonly (readonly [string, string, string?, boolean?])[] {
  const shared: readonly (readonly [string, string, string?, boolean?])[] = [
    ["properties", "개체 속성…", "P"],
    ["cut", "잘라내기", "Ctrl+X"],
    ["copy", "복사", "Ctrl+C"],
    ["front", "맨 앞으로", "Shift+Page Up", true],
    ["back", "맨 뒤로", "Shift+Page Down"],
    ["inFrontOfText", "글 앞으로", "Shift+Home"],
    ["behindText", "글 뒤로", "Shift+End"],
    ["line", "선 속성…", "L"],
    ["caption", "캡션 넣기…", "Ctrl+N,C"],
  ];
  return kind === "picture"
    ? [...shared, ["description", "그림 설명…"], ["delete", "그림 지우기", "Ctrl+E", true]]
    : shared;
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
