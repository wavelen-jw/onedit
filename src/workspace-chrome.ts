/** Existing workspace chrome only. No document, selection, Command or History
 * writes; callers provide the current file identity without querying Core. */
export function mountWorkspaceChrome(doc: Document, readDocument: () => {name: string; dirty: boolean}) {
  const header = doc.querySelector<HTMLElement>("body > header")!,
    toolbar = doc.getElementById("toolbar")!, menu = doc.getElementById("main-menu")!,
    footer = doc.querySelector<HTMLElement>("body > footer")!;
  if (header.dataset.mainChrome) return;
  header.dataset.mainChrome = "true"; header.classList.add("workspace-main-titlebar");
  const title = doc.createElement("span"); title.id = "workspace-document-title";
  title.setAttribute("role", "status"); header.append(title);
  const fileTools = header.querySelector<HTMLElement>(":scope > nav")!;
  const quick = doc.createElement("div"); quick.id = "workspace-quickbar";
  quick.setAttribute("role", "group"); quick.setAttribute("aria-label", "기본 문서 도구");
  quick.append(fileTools);
  const undoGroup = doc.getElementById("undo")?.closest(".tool-group");
  if (undoGroup) quick.append(undoGroup);
  toolbar.prepend(quick);

  footer.classList.add("workspace-main-status");
  const line = doc.createElement("div"); line.id = "workspace-status-line";
  for (const id of ["selection", "status"]) { const node=doc.getElementById(id);if(node)line.append(node); }
  footer.prepend(line);
  // Preserve original notification/live-region owners outside the compact bar.
  // Failure notices have no expiry. Passive capability text is not a toast.
  const body=doc.createElement('aside');body.id='workspace-status-notice-body';body.setAttribute('aria-label','편집 안내');
  for(const id of ['font-notice','clipboard-status','paste-result']){const node=doc.getElementById(id);if(node)body.append(node);}
  doc.body.append(body);
  // Keep the existing node/owner, without restoring the excluded Help menu.
  const help=doc.getElementById('clipboard-support');if(help){help.hidden=true;doc.body.append(help);}
  const clipboard=doc.getElementById('clipboard-status');let lastNotice='';
  const timers=new Map<HTMLElement,ReturnType<typeof setTimeout>>();
  const transient=(node:HTMLElement)=>{const prior=timers.get(node);if(prior)clearTimeout(prior);node.hidden=!node.textContent;const value=node.textContent;if(value)timers.set(node,setTimeout(()=>{timers.delete(node);if(node.textContent===value)node.hidden=true;},3000));};
  doc.addEventListener('rhwp:transient-notice',e=>{const node=(e as CustomEvent).detail;if(node instanceof HTMLElement&&node.matches('#paste-result'))transient(node);});
  const notice=()=>{const value=clipboard?.textContent??'';if(value===lastNotice)return;lastNotice=value;if(clipboard){if(/붙이기|붙여넣기|복사|클립보드/.test(value)&&!/실패|오류|거절|보류|지원하지|필요|없습/.test(value))clipboard.hidden=true;else transient(clipboard);}};
  const error=doc.getElementById('error');let lastError='';
  if(clipboard)new MutationObserver(()=>{lastNotice='';notice();}).observe(clipboard,{subtree:true,childList:true,characterData:true});
  if(error)new MutationObserver(records=>{if(error.hidden){lastError='';return;}const value=error.textContent??'';if(value&&(value!==lastError||records.some(r=>r.type!=='attributes'))){lastError=value;transient(error);}}).observe(error,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});
  const sync = () => {
    const state = readDocument(), text = state.name;
    if (title.textContent !== text) title.textContent = text;
    if (doc.title !== text) doc.title = text;
    title.title = text; title.dataset.dirty = String(state.dirty);
    // Full status and notice text remains accessible even when visually elided.
    for (const id of ["status", "selection", "clipboard-status"]) {
      const node = doc.getElementById(id); if (node && node.title !== node.textContent) node.title = node.textContent ?? "";
    }
    notice();
  };
  const observer=new MutationObserver(sync);
  observer.observe(line,{childList:true,subtree:true,characterData:true});
  observer.observe(body,{childList:true,subtree:true,characterData:true});
  doc.addEventListener("rhwp:editor-state",sync);
  sync();
}
