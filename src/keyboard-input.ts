import { ResizeKeyHold } from "./resize-key-hold.js";
import { routeKey } from "./keyboard.js";
import { isDialogShortcutPrefix } from "./browser-shortcut-scope.js";
import { hancomColorKeys, hancomScriptCycle } from "./hancom-key-links.js";
import { textboxInsertReason } from "./shapes.js";
import { lowerMenuCommand } from "./menu-command-lowering.js";
import { runHistory } from "./command-state-integration.js";
import { formatMenuState } from "./integration/a-format-menu.js";
import type { Interaction } from "./interaction.js";
import type { F5Epoch } from "./f5-render-transaction.js";
import type { RhwpAdapter } from "./adapter.js";
import type { FileLifecycle } from "./file-lifecycle.js";
import type { FormatKind } from "./formatting.js";
import type { mountMenuSettings } from "./menu-settings.js";
import type { mountHeaderFooter } from "./header-footer-ui.js";

type KeyboardInputContext = {
  input: HTMLTextAreaElement; pages: HTMLElement; viewport: HTMLElement; dialog: HTMLDialogElement;
  document: Document; window: Window; editor: Interaction; adapter: RhwpAdapter; files: FileLifecycle;
  readonly composing: boolean; readonly clipboardBusy: boolean;
  readonly f5ReadEpoch?: () => F5Epoch | undefined;
  readonly menuSettings: ReturnType<typeof mountMenuSettings> | undefined;
  readonly headerFooter: ReturnType<typeof mountHeaderFooter> | undefined;
  $: (id: string) => HTMLElement; render: () => void; focus: () => void; revealCursor: () => void;
  safe: (action: () => void, visibleBodyEdit?: boolean, resizing?: boolean) => void;
  updateView: (action: () => void, afterF5?: () => void, trustedF5?: boolean) => void; format: (target: FormatKind) => void;
  save: (as?: boolean) => Promise<void>;
  clipboardAction: (kind: "copy" | "cut" | "paste" | "paste-text") => Promise<void>;
};

// Prefixes and held-key admission are private to this one existing receiver.
export function mountKeyboardInput(context: KeyboardInputContext) {
  const {input, pages, viewport, dialog, document, window, editor, adapter, files, $, render, focus, revealCursor, safe, updateView, format, save, clipboardAction} = context;
  // Sequential entrances open existing drafts, never edits. All
  // editor-local prefixes are mutually exclusive; no timer or input queue.
  let listDialogPrefix: ReturnType<Interaction["capture"]> | undefined;
  let insertionPrefixLabel = 'Alt+N,';
  let headerDialogPrefix: ReturnType<Interaction["capture"]> | undefined;
  let alternativeDialogPrefix: ReturnType<Interaction["capture"]> | undefined;
  let queryPrefix: ReturnType<Interaction["capture"]> | undefined;
  let colorPrefix: ReturnType<Interaction["capture"]> | undefined;
  const cancelListDialogPrefix = () => { listDialogPrefix = undefined; headerDialogPrefix = undefined; alternativeDialogPrefix = undefined; colorPrefix=undefined; queryPrefix=undefined; };
  // Read-only internal arbitration; no capture or document mutation in the probe.
  input.addEventListener('rhwp:editor-sequence-pending',e=>{if(listDialogPrefix||headerDialogPrefix||alternativeDialogPrefix||colorPrefix||queryPrefix)e.preventDefault();});
  const openSequenceTarget = (letter: string, captured: ReturnType<Interaction["capture"]>, sequence: string) => {
    try {
      const current = editor.capture();
      if (captured.documentId !== current.documentId || captured.revision !== current.revision ||
          JSON.stringify(captured.selection) !== JSON.stringify(current.selection))
        throw Error(`문서·리비전·선택이 변경되었습니다. ${sequence}를 다시 실행하세요.`);
      const insertionSequence = /^(Ctrl|Alt)\+N,/.test(sequence);
      if(insertionSequence&&letter==='t'){document.dispatchEvent(new CustomEvent('rhwp:table-insert'));
      }else if(insertionSequence&&letter==='f'){document.dispatchEvent(new CustomEvent('rhwp:table-calculation',{detail:{axis:'formula'}}));
      }else if(letter===' '){safe(()=>editor.execute({type:'insert',text:'\u2007'},captured));
      }else if(insertionSequence&&['n','e'].includes(letter)){document.dispatchEvent(new CustomEvent('rhwp:remaining-open',{detail:letter==='n'?'footnote':'endnote'}));
      }else if(['a','z','m','s','c'].includes(letter)){document.dispatchEvent(new CustomEvent('rhwp:remaining-open',{detail:({a:'split-table',z:'join-table',m:'equation',s:'page-hide',c:'caption'}as Record<string,string>)[letter]}));
      } else if (letter === "b") {
        const reason = textboxInsertReason(adapter, current.selection);
        if (reason) throw Error(reason);
        const launch = document.getElementById("textbox-insert-open") as HTMLButtonElement | null;
        if (!launch) throw Error("현재 화면에는 빈 글상자 삽입 입구가 없습니다.");
        if (launch.disabled) throw Error(launch.title || "현재 선택에서는 글상자를 넣을 수 없습니다.");
        launch.click(); // Existing admission, captured draft and Command/History.
      } else if (letter === "i") {
        if (!document.getElementById("picture-dialog")) throw Error("현재 화면에는 그림 넣기 입구가 없습니다.");
        document.dispatchEvent(new CustomEvent("rhwp:picture-insert"));
      } else if (letter === "n") {
        const state = formatMenuState(editor).get("paragraph-lists")!;
        if (state.disabled) throw Error(state.reason);
        document.dispatchEvent(new CustomEvent("rhwp:paragraph-lists"));
      } else {
        if (!context.headerFooter) throw Error("현재 화면에는 머리말·꼬리말 입구가 없습니다.");
        context.headerFooter.open();
      }
    } catch (error) { files.ui.error(error); }
  };
  window.addEventListener("blur", cancelListDialogPrefix);
  document.addEventListener("pointerdown", cancelListDialogPrefix, true);
  document.addEventListener("compositionstart", cancelListDialogPrefix, true);
  document.addEventListener("focusin", (e) => { if (e.target !== input) { cancelListDialogPrefix(); editor.resetBlockSequence(); } });
  let cellBlockEnter=false;
  const resizeKeyHold = new ResizeKeyHold();
  const resizeKeyContext = () => ({ documentId: adapter.documentId, revision: adapter.revision, selection: editor.selection });
  window.addEventListener('keyup',e=>{if(e.key==='Enter')cellBlockEnter=false;resizeKeyHold.release(e.key);},true);
  window.addEventListener('blur',()=>{cellBlockEnter=false;editor.resetBlockSequence();resizeKeyHold.cancel();});
  document.addEventListener('pointerdown',()=>resizeKeyHold.cancel(),true);
  document.addEventListener('focusin',e=>{if(e.target!==input)resizeKeyHold.cancel();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)resizeKeyHold.cancel();});
  window.addEventListener("keydown", (e) => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !e.key.startsWith('Arrow')) resizeKeyHold.cancel();
    if (e.key !== "F3" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing || e.keyCode === 229 || e.getModifierState("AltGraph")) editor.resetBlockSequence();
    if (!context.composing && pages.querySelector("[data-ime-canvas]")) render();
    if (document.querySelector("dialog[open]") || context.composing || context.clipboardBusy || files.busy || e.isComposing || e.keyCode === 229) {
      resizeKeyHold.cancel();
      cancelListDialogPrefix(); return;
    }
    const target = e.target as HTMLElement;
    if (target !== input) { cancelListDialogPrefix(); editor.resetBlockSequence(); }
    if (target !== input) {
      if (target.closest("input,select,textarea,[contenteditable=true]")) return;
      // Buttons and native disclosure titles own their plain keys, while exact global editor
      // shortcuts (save/undo/format) remain available on the toolbar.
      if (target.closest("button,a,summary") && !e.ctrlKey && !e.metaKey && !e.altKey)
        return;
    }
    const configured = context.menuSettings?.route({key:e.key,code:e.code,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,
      shiftKey:e.shiftKey,isComposing:e.isComposing,keyCode:e.keyCode,altGraph:e.getModifierState("AltGraph"),repeat:e.repeat});
    if (configured || e.getModifierState("AltGraph")) cancelListDialogPrefix();
    const pendingQuery=queryPrefix;
    if(!configured&&pendingQuery&&!['Control','Alt','Shift','Meta'].includes(e.key)) {
      cancelListDialogPrefix();
      const letter=/^Key([FALID])$/.exec(e.code)?.[1].toLowerCase()??e.key.toLowerCase();
      if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&(['f','a','l','i','d'].includes(letter)||e.key==='Escape')) {
        if(!e.cancelable)return;e.preventDefault();
        if(!e.repeat&&e.key!=='Escape')try{
          const now=editor.capture();
          if(now.documentId!==pendingQuery.documentId||now.revision!==pendingQuery.revision||JSON.stringify(now.selection)!==JSON.stringify(pendingQuery.selection))throw Error('문서·리비전·선택이 변경되었습니다. Ctrl+Q 연속키를 다시 실행하세요.');
          document.dispatchEvent(new CustomEvent('rhwp:query-shortcut',{detail:letter}));
        }catch(error){files.ui.error(error);}return;
      }
    }
    if(!configured&&target===input&&e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.getModifierState('AltGraph')&&e.code==='KeyQ') {
      if(!e.cancelable)return;e.preventDefault();cancelListDialogPrefix();
      if(!e.repeat){try{queryPrefix=editor.capture();}catch(error){files.ui.error(error);}}else queryPrefix=pendingQuery;
      return;
    }
    const pendingColor=colorPrefix;
    if(!configured&&pendingColor&&!["Control","Shift","Alt","Meta"].includes(e.key)){
      cancelListDialogPrefix();
      const letter=/^Key([A-Z])$/.exec(e.code)?.[1]??e.key.toUpperCase(),item=hancomColorKeys.find(([k])=>k===letter);
      if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&(item||e.key==='Escape')){
        if(!e.cancelable)return;e.preventDefault();
        if(!e.repeat&&item)safe(()=>{
          const now=editor.capture();
          if(now.documentId!==pendingColor.documentId||now.revision!==pendingColor.revision||JSON.stringify(now.selection)!==JSON.stringify(pendingColor.selection))throw Error('문서·리비전·선택이 변경되었습니다. Ctrl+M 연속키를 다시 실행하세요.');
          editor.execute({type:'char',props:{textColor:item[1]}},pendingColor);
        });
        return;
      }
    }
    if(!configured&&target===input&&e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&e.code==='KeyM'){
      if(!e.cancelable)return;e.preventDefault();cancelListDialogPrefix();
      if(!e.repeat){try{colorPrefix=editor.capture();}catch(error){files.ui.error(error);}}else colorPrefix=pendingColor;
      return;
    }
    const alternativePrefix = alternativeDialogPrefix;
    if (!configured && alternativePrefix && !["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      cancelListDialogPrefix();
      // Same physical letters as menu keytips, independent of layout text.
      // Composition/229/AltGraph were already refused above; never consume IME.
      const letter = /^Key([BHIN])$/.exec(e.code)?.[1].toLowerCase() ?? e.key.toLowerCase();
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
          (["b", "h", "i", "n", " "].includes(letter) || e.key === "Escape")) {
        if (!e.cancelable) return;
        e.preventDefault();
        if (!e.repeat && e.key !== "Escape")
          openSequenceTarget(letter, alternativePrefix, `Ctrl+; → ${letter.toUpperCase()}`);
        return;
      }
    }
    if (!configured && target === input && isDialogShortcutPrefix({
      key:e.key,code:e.code,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,
      shiftKey:e.shiftKey,isComposing:e.isComposing,keyCode:e.keyCode,altGraph:e.getModifierState("AltGraph"),
    })) {
      if (!e.cancelable) return;
      e.preventDefault();
      cancelListDialogPrefix();
      if (!e.repeat) {
        try { alternativeDialogPrefix = editor.capture(); } catch (error) { files.ui.error(error); }
      } else alternativeDialogPrefix = alternativePrefix;
      return;
    }
    const prefix = listDialogPrefix;
    const headerPrefix = headerDialogPrefix;
    if (!configured && headerPrefix && !["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      cancelListDialogPrefix();
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
          (["h", "b", "i", "a", "z", "m", "s", "n", "e", "f", "c", "t"].includes(/^Key([A-Z])$/.exec(e.code)?.[1].toLowerCase() ?? e.key.toLowerCase()) || e.key === "Escape")) {
        if(!e.cancelable)return;
        e.preventDefault();
        if (e.repeat || e.key === "Escape") return;
        openSequenceTarget(/^Key([A-Z])$/.exec(e.code)?.[1].toLowerCase() ?? e.key.toLowerCase(), headerPrefix, `${insertionPrefixLabel}${e.key.toUpperCase()}`);
        return;
      }
    }
    if (!configured && prefix && !["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      cancelListDialogPrefix();
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (plain && ["n", "o", "Escape"].includes(e.key === "Escape" ? e.key : e.key.toLowerCase())) {
        e.preventDefault();
        if (e.repeat || e.key === "Escape") return;
        try {
          const current = editor.capture();
          if (prefix.documentId !== current.documentId || prefix.revision !== current.revision ||
              JSON.stringify(prefix.selection) !== JSON.stringify(current.selection))
            throw Error("문서·리비전·선택이 변경되었습니다. Ctrl+K,N을 다시 실행하세요.");

          const state = formatMenuState(editor).get("paragraph-lists")!;
          if (state.disabled) throw Error(state.reason);
          document.dispatchEvent(new CustomEvent("rhwp:paragraph-lists",{detail:e.key.toLowerCase()==='o'?'Outline':undefined}));
        } catch (error) { files.ui.error(error); }
        return;
      }
      // Every unrelated key keeps its original route and order below.
    }
    if (!configured && target === input && (e.ctrlKey !== e.altKey) && !e.metaKey && !e.shiftKey &&
        !e.getModifierState("AltGraph") && (e.code === "KeyK" || e.key.toLowerCase() === "k")) {
      e.preventDefault();
      headerDialogPrefix = undefined;
      if (!e.repeat) {
        try { listDialogPrefix = editor.capture(); } catch (error) { files.ui.error(error); }
      }
      else if (prefix) listDialogPrefix = prefix;
      return;
    }
    // Ctrl+N is browser-owned. Only Alt+N starts the editor insertion sequence.
    if (!configured && target === input && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
        !e.getModifierState("AltGraph") && (e.code === "KeyN" || e.key.toLowerCase() === "n")) {
      if(!e.cancelable)return;
      e.preventDefault();
      listDialogPrefix = undefined;
      if (!e.repeat) {
        try { headerDialogPrefix = editor.capture(); insertionPrefixLabel = e.altKey ? 'Alt+N,' : 'Ctrl+N,'; } catch (error) { files.ui.error(error); }
      } else if (headerPrefix) headerDialogPrefix = headerPrefix;
      return;
    }
    const route = configured ?? routeKey(
      {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        isComposing: e.isComposing,
        keyCode: e.keyCode,
        altGraph: e.getModifierState("AltGraph"),
      },
      editor.selection,
    );
    if(route.kind==='table-calculation'&&target!==input)return;
    if (route.kind === 'view' && ['cell-start-extend', 'paragraph-start', 'paragraph-end', 'page-start', 'cell-rows', 'cell-extend', 'block', 'word', 'paragraph', 'word-across', 'cell-columns', 'cell-neighbour', 'table-exit', 'object-next', 'column'].includes(route.operation) && target !== input) return;
    if (route.kind === 'view' && route.operation === 'paragraph-start' && !e.cancelable) return;
    if ((route.kind === 'cell-block-format' || route.kind === 'existing-ui') && target !== input) return;
    if(route.kind==='command'&&route.command.type==='insert'&&route.command.text==='\u00ad'&&target!==input)return;
    if(e.key==='Enter'){
      if(e.repeat&&cellBlockEnter){e.preventDefault();return;}
      cellBlockEnter=route.kind==='view'&&route.operation==='escape'&&!route.extend;
    }else cellBlockEnter=false;
    if (route.kind === "input" || route.kind === "browser") return;
    // A new native intent must not run alongside an uncancelable browser default.
    if(!e.cancelable&&(route.kind==='paragraph-list-toggle'||route.kind==='table-calculation'||route.kind==='existing-ui'||route.kind==='view'&&['word-across','cell-columns','cell-neighbour','table-exit','object-next','column'].includes(route.operation)||route.kind==='command'&&(['delete-word','delete-line-end','list-level','line-spacing-step','control-key','table-split','paragraph-move','paper','cell-equal'].includes(route.command.type)||route.command.type==='insert'&&['\u00a0','\u00ad'].includes(route.command.text)||route.command.type==='resize'&&route.command.cellOnly||route.command.type==='char'&&e.altKey&&e.shiftKey&&e.code==='KeyC'||route.command.type==='delete'&&editor.selection.kind==='table')))return;
    // Standalone Save As uses the same guarded lifecycle as the toolbar.
    if (route.kind === "save" && route.as && window.parent !== window) return;
    // Let the browser deliver its real paste DataTransfer/File on the editor.
    // The paste listener prevents native textarea edits and owns exactly one
    // transaction. Menu/toolbar paste still uses the existing Clipboard API.
    if (route.kind === "clipboard" && route.operation === "paste" && target === input) return;
    e.preventDefault();
    const heldResize=e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&
      e.key.startsWith('Arrow')&&route.kind==='command'&&route.command.type==='resize';
    if(heldResize){
      if(target!==input||!e.cancelable){resizeKeyHold.cancel();return;}
      if(e.repeat&&route.kind==='command'){
        const key=e.key,command=route.command;
        resizeKeyHold.repeat(key,e.timeStamp,resizeKeyContext(),()=>{
          if(!resizeKeyHold.matches(key,resizeKeyContext())||document.hidden||document.activeElement!==input||
            document.querySelector('dialog[open]')||context.composing||context.clipboardBusy||files.busy){resizeKeyHold.cancel();return;}
          const revision=adapter.revision;
          safe(()=>editor.execute(lowerMenuCommand(editor,command)),false,true);
          if(adapter.revision!==revision&&$("error").hidden){resizeKeyHold.completed(key,resizeKeyContext());revealCursor();}
          else resizeKeyHold.cancel(); // actual floor/refusal is terminal, never a spin
        });
        return;
      }
      if(!resizeKeyHold.accepts(e.key,false,e.timeStamp,resizeKeyContext()))return;
    }else resizeKeyHold.cancel();
    const resizeRevision=adapter.revision;
    if(route.kind==='existing-ui'){if(!e.repeat||route.action.startsWith('local-'))document.dispatchEvent(new CustomEvent('rhwp:shortcut-ui',{detail:route.action}));return;}
    // Holding F5 is one press, not several explicit cell-selection stages.
    if (route.kind === "view" && ['f5', 'cell-rows', 'cell-extend', 'block'].includes(route.operation) && e.repeat) return;
    if(route.kind==='script-cycle'&&e.repeat)return;
    if(route.kind==='table-calculation'){if(target!==input||e.repeat)return;document.dispatchEvent(new CustomEvent('rhwp:table-calculation',{detail:route}));return;}
    if (route.kind === "paragraph-list-toggle") {
      if (!e.repeat) input.dispatchEvent(new CustomEvent("rhwp:paragraph-list-toggle", {
        detail: { mode: route.mode, captured: editor.capture() },
      }));
      return;
    }
    if (route.kind === "format-copy") {
      if (!e.repeat) input.dispatchEvent(new Event("rhwp:format-copy"));
      return;
    }
    if (route.kind === "clipboard") {
      void clipboardAction(route.operation);
      return;
    }
    // Last-cell Tab mutates through the ordinary guarded Command/History route
    // and needs a full render, unlike caret-only Tab traversal.
    if (route.kind === "view" && route.operation === "tab" && editor.tabAddsRow(route.extend)) {
      safe(() => editor.tab(route.extend));
      return;
    }
    if (route.kind === "view")
      updateView(() => {
        switch (route.operation) {
          case "all":
            editor.selectAll();
            break;
          case "f5":
            editor.f5(e.isTrusted && !e.repeat && !e.isComposing && e.keyCode !== 229 ? context.f5ReadEpoch : undefined);
            break;
          case 'object-next':
            editor.nextBodyObject(route.extend);
            break;
          case 'cell-columns':
            editor.selectCellRows(true);
            break;
          case 'cell-neighbour':
            editor.moveCellNeighbour(route.key);
            break;
          case 'table-exit':
            editor.leaveTable();
            break;
          case 'cell-rows':
            editor.selectCellRows();
            break;
          case 'cell-start-extend':
            editor.startCellExtension();
            break;
          case 'cell-extend':
            editor.extendCells();
            break;
          case "block":
            editor.advanceBlock();
            break;
          case "escape":
            editor.cancelBlock();
            break;
          case "tab":
            editor.tab(route.extend);
            break;
          case "move":
            editor.move(route.key, route.extend, viewport.clientHeight - 50);
            break;
          case "column":
            editor.moveColumn(route.key==='ArrowRight'?1:-1);break;
          case "paragraph":
            editor.moveParagraph(route.key === "ArrowDown" ? 1 : -1);
            break;
          case "word-across":
          case "word":
            editor.moveWord(route.key === "ArrowRight" ? 1 : -1,route.operation==='word-across');
            break;
          case "document":
            if (files.busy || context.clipboardBusy || files.state().transition)
              throw Error("문서 작업이 끝난 뒤 처음·끝으로 이동하세요.");
            editor.documentBoundary(route.key === "End", route.extend);
            break;
          case "paragraph-start":
          case "paragraph-end":
          case "page-start":
            editor.navigateBoundary(route.operation, route.key === "PageDown");
            break;
        }
      }, route.operation === "f5" ? () => { if (!dialog.open) revealCursor(); } : undefined,
        route.operation === "f5" && e.isTrusted && !e.repeat && !e.isComposing && e.keyCode!==229);
    else
      safe(() => {
        switch (route.kind) {
          case 'cell-block-format':
            document.dispatchEvent(new CustomEvent('rhwp:cell-block-format',{detail:route.background}));
            break;
          case "script-cycle":
            editor.execute(lowerMenuCommand(editor,hancomScriptCycle(editor)));
            break;
          case "command":
            editor.execute(lowerMenuCommand(editor, route.command));
            break;
          case "history":
            runHistory(editor, route.redo, context.clipboardBusy || files.busy);
            break;
          case "format":
            format(route.target);
            break;
          case "print":
            document.getElementById("print-button")?.click();break;
          case "search":
            document.querySelector<HTMLButtonElement>(`[data-edit-action="${route.replace?"replace":"find"}"]`)?.click();break;
          case "save":
            if (!e.repeat) void save(route.as === true);
            break;
          case "unsupported":
            throw Error(route.message);
        }
      }, route.kind === "history" || route.kind === "command" && ["insert", "delete", "break"].includes(route.command.type),
        route.kind === "command" && route.command.type === "resize");
    if(heldResize){
      if(adapter.revision!==resizeRevision&&$("error").hidden)resizeKeyHold.completed(e.key,resizeKeyContext());
      else resizeKeyHold.cancel(); // content floor/refusal/error must not spin
    }
    if (!dialog.open) {
      if (!(route.kind === "view" && ["all", "block", "f5"].includes(route.operation))) revealCursor();
      if (route.kind === "view" && ["document", "paragraph-start", "paragraph-end", "page-start", "word", "paragraph"].includes(route.operation))
        document.dispatchEvent(new CustomEvent("rhwp:reveal-selection"));
      focus();
    }
  });
}
