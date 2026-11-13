/** RHW67 user comment 73bc86c7-5fad-4ffe-a3a9-8758c4f60084.
 * These are exact presentation identities, separate from capability exclusions.
 * A menu removal must not remove a command, source, shortcut or document data.
 * The four comparison bundles have undecided children: no recursive exclusion.
 */
export const userExcludedMenuEntries: readonly { group: string; label: string; selector: string; slot?: string; companion?: string }[] = [
  {group:'파일',label:'문서 정보(I)… · 지원 조회',selector:'#file-menu [data-file-entry="i"]'},
  {group:'파일',label:'최근 문서 목록',selector:'#file-menu [data-file-entry="recent"]'},
  {group:'파일',label:'문서 닫기(C)',selector:'#file-menu [data-file-entry="c"]'},
  {group:'편집',label:'골라 붙이기(S)…',selector:'#edit-menu [data-edit-choose-paste]'},
  {group:'편집',label:'조판 부호 지우기(Y)…',selector:'#edit-menu [data-edit-held="y"]'},
  {group:'편집',label:'거꾸로 찾기…',selector:'#edit-menu [data-edit-previous-find]'},
  {group:'편집',label:'정렬(B)…',selector:'#edit-menu [data-edit-held="b"]'},
  {group:'편집',label:'고치기(M)…',selector:'#edit-menu [data-edit-held="m"]'},
  {group:'편집',label:'OLE 연결(L)…',selector:'#edit-menu [data-edit-held="l"]'},
  {group:'편집',label:'OLE 개체 속성(E)…',selector:'#edit-menu [data-edit-held="e"]'},
  {group:'편집',label:'텍스트만 붙이기(V)',selector:'#edit-menu [data-edit-entry="paste-special"]',companion:'#paste-policy-help'},
  {group:'편집',label:'선택 셀 내용 지우기(H)',selector:'#edit-menu [data-edit-entry="clear"]'},
  {group:'편집',label:'블록 설정(K)',selector:'#edit-menu [data-edit-entry="block"]'},
  {group:'편집',label:'현재 줄 글자 지우기',selector:'#edit-menu [data-pending-shortcut="delete-current-line"]'},
  {group:'편집',label:'개체 묶기…',selector:'#edit-menu [data-remaining-entry="object-group"]'},
  {group:'편집',label:'글상자 내용 편집…',selector:'#edit-menu #textbox-edit-open'},
  {group:'보기',label:'메모(E)',selector:'#view-menu [data-menu-scope-id="V07"]'},
  {group:'보기',label:'한자 발음(P)',selector:'#view-menu [data-view-held="p"]'},
  {group:'보기',label:'격자(G)',selector:'#view-menu [data-view-held="g"]'},
  {group:'보기',label:'개체 이동 안내선(D)',selector:'#view-menu [data-view-held="d"]'},
  {group:'보기',label:'작업 창(W)',selector:'#view-menu [data-view-entry="sidebar"]',slot:'#view-menu [data-view-slot="sidebar"]'},
  {group:'보기',label:'문서 창(N)',selector:'#view-menu [data-view-entry="window"]',slot:'#view-menu [data-view-slot="window"]'},
  {group:'보기',label:'편집 화면 나누기(B)',selector:'#view-menu [data-view-held="b"]'},
  {group:'보기',label:'창 배열(O)',selector:'#view-menu [data-view-held="o"]'},
  {group:'보기',label:'창 목록(F)…',selector:'#view-menu [data-view-held="f"]'},
  {group:'보기',label:'1 현재 문서',selector:'#view-menu [data-view-held="1"]'},
  {group:'보기',label:'선택 도구',selector:'#view-menu #selection-tools-toggle'},
  ...(['first','previous','next','last'] as const).map((id,i)=>({group:'보기',label:['첫 쪽','이전 쪽','다음 쪽','마지막 쪽'][i],selector:`#view-menu [data-view-action="${id}"]`})),
  {group:'입력',label:'캡션 넣기·내용 추가…',selector:'#insert-menu [data-remaining-entry="caption"]'},
  {group:'입력',label:'입력 도우미(N)',selector:'#insert-menu [data-insert-held="n"]'},
  {group:'입력',label:'채우기(I)',selector:'#insert-menu [data-insert-held="i"]'},
  {group:'입력',label:'묶음 빈칸',selector:'#insert-menu [data-insert-entry="nbsp"]'},
  {group:'입력',label:'무른 하이픈',selector:'#insert-menu [data-insert-entry="soft-hyphen"]'},
  {group:'입력',label:'한자 입력(H)',selector:'#insert-menu [data-insert-held="h"]'},
  {group:'입력',label:'메모(U)',selector:'#insert-menu [data-menu-scope-id="I35"]'},
  {group:'입력',label:'고정폭 빈칸 · Ctrl+; → Space',selector:'#insert-menu [data-fixed-space]'},
  {group:'서식',label:'문단 첫 글자 장식(D)…',selector:'#format-menu [data-format-held="d"]'},
  {group:'쪽',label:'바탕쪽(F)…',selector:'#page-menu [data-page-held="f"]'},
  {group:'쪽',label:'앞 단 설정 이어 나누기',selector:'#page-menu #column-definition-break'},
  {group:'쪽',label:'쪽 복사하기(K)',selector:'#page-menu [data-page-held="k"]'},
  {group:'쪽',label:'쪽 붙이기(O)',selector:'#page-menu [data-page-held="o"]'},
  {group:'쪽',label:'쪽 지우기(R)',selector:'#page-menu [data-page-held="r"]'},
  {group:'검토',label:'메모 · 미지원',selector:'#workspace-7 [data-menu-scope-id="R07"]'},
  ...(['table-transpose','table-object-line','table-object-background'] as const).map((id,i)=>({group:'표',label:['표 뒤집기 · 줄/칸 전치…','표 개체 테두리…','표 개체 채우기…'][i],selector:`#table-menu [data-table-action="${id}"]`})),
  {group:'표',label:'표 나누기…',selector:'#table-menu [data-remaining-entry="split-table"]'},
  {group:'표',label:'표 붙이기…',selector:'#table-menu [data-remaining-entry="join-table"]'},
  {group:'표',label:'표 자동 채우기…',selector:'#table-menu [data-autofill-entry]'},
  {group:'표',label:'표 안에 탭 삽입',selector:'#table-menu [data-pending-shortcut="cell-tab"]'},
  {group:'표',label:'현재 셀 선택 · 방향키로 블록 확장',selector:'#table-menu [data-pending-shortcut="cell-extension"]'},
  ...(['row-SUM','row-AVG','row-PRODUCT','column-SUM','column-AVG','column-PRODUCT','formula'] as const).map((id,i)=>({group:'표',label:['가로 합계 · 현재 값…','가로 평균 · 현재 값…','가로 곱 · 현재 값…','세로 합계 · 현재 값…','세로 평균 · 현재 값…','세로 곱 · 현재 값…','계산식 · 현재 값…'][i],selector:`#table-menu [data-calculation-entry="${id}"]`})),
  {group:'도구',label:'단축키 사용자 설정…',selector:'#workspace-8 #tools-shortcut-settings'},
];

export function applyUserMenuDecisions(doc: Document) {
  const main=doc.getElementById('main-menu'); if(!main)return;
  // Remove only the four approved comparison titles. Keep the original command
  // nodes/handlers in the same parent menu, including hidden backing sources.
  for(const id of ['input-existing-tools','format-supported-menu','page-supported-menu','table-supported-menu']){
    const bundle=main.querySelector<HTMLDetailsElement>('#'+id),panel=bundle?.querySelector(':scope>div');
    if(bundle&&panel)bundle.replaceWith(...panel.childNodes);
  }

  const park=(node:HTMLElement)=>{
    if(node.closest('[data-user-menu-sources]'))return;
    const parent=node.parentElement!;
    let sources=parent.querySelector<HTMLElement>(':scope>[data-user-menu-sources]');
    if(!sources){sources=doc.createElement('div');sources.dataset.userMenuSources='';sources.hidden=true;
      sources.setAttribute('aria-hidden','true');sources.style.setProperty('display','none','important');parent.append(sources);}
    // Leave identities and handlers in their original menu/panel scope. Finder,
    // toolbar, settings and shortcut routes may still use these shared sources.
    sources.append(node);
  };
  for(const row of userExcludedMenuEntries){
    for(const node of main.querySelectorAll<HTMLElement>(row.selector)){
      if(row.slot){const slot=main.querySelector<HTMLElement>(row.slot);
        // Removing a category does not exclude its undecided child commands.
        // Existing closeGroups can keep hiding the now-empty slot safely.
        if(slot)slot.before(...slot.childNodes);
      }
      if(node.id==='column-definition-break'&&node.nextElementSibling?.matches('.ui2-command-reason'))park(node.nextElementSibling as HTMLElement);
      park(node);
    }
    if(row.companion)for(const node of main.querySelectorAll<HTMLElement>(row.companion))park(node);
  }
  // Ignore backing sources when cleaning separators/empty categories. Do not
  // touch other menus, context menus, toolbars, user preferences or document UI.
  const exposed=(node:Element)=>!node.closest('[data-user-menu-sources]');
  for(const panel of main.querySelectorAll<HTMLElement>('[role="menu"],details>div')){
    if(!exposed(panel))continue;
    const rows=[...panel.children].filter(exposed).filter(n=>!n.matches('[data-view-slot="sidebar"],[data-view-slot="window"]'));
    rows.forEach((n,i)=>{if(n.tagName==='HR'&&(!i||i===rows.length-1||rows[i-1].tagName==='HR'))n.remove();});
  }
  for(const root of main.querySelectorAll<HTMLDetailsElement>(':scope>details')){
    if([...root.querySelectorAll('button,input,select,textarea,a')].some(exposed))continue;
    root.open=false;root.hidden=true;root.style.setProperty('display','none','important');
  }
}
