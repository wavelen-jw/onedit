import type { KeyInput } from "./keyboard.js";

// Not a browser/OS guarantee: this exact editor-local prefix avoids the known
// Chrome Ctrl+N reservation without Ctrl+Alt (AltGr) or an existing binding.
export const dialogShortcutPrefix = "Ctrl+;";
export const browserReplacementPolicy = "브라우저 충돌키의 새 대체키는 웹용 Word의 같은 기능에 지정된 직접 단일조합만 사용합니다. 대응키가 없거나 메뉴를 따라가는 순차키뿐이면 대체키를 지정하지 않습니다. 비충돌 원키·기존 사용자 설정·이미 제공한 편의키는 유지합니다.";
export const wordWebShortcutsURL = "https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word";
export const wordWebTableURL = "https://support.microsoft.com/en-us/accessibility/word/use-a-screen-reader-to-insert-a-table-in-word";
export const dialogShortcutHelp = "기존 편의키: 편집 영역에서 Ctrl+;를 누르고 모두 뗀 뒤 B 글상자 / H 머리말·꼬리말 / I 그림 / N 문단 번호 모양 / Space 고정폭 빈칸. Esc 취소. 웹용 Word 기준으로 새로 지정한 대체키와는 구별합니다. OS·IME가 먼저 사용하면 메뉴·명령 찾기를 사용하세요. 실제 미관측 환경은 별도입니다.";
export function isDialogShortcutPrefix(e: KeyInput): boolean {
  return !e.isComposing && e.keyCode !== 229 && !e.altGraph && e.ctrlKey &&
    !e.metaKey && !e.altKey && !e.shiftKey &&
    (e.code === "Semicolon" || !e.code && e.key === ";");
}

// Native reference sequences are not a guarantee that browser chrome delivers them.
// Keep menu access and existing configurable commands independent of these labels.
export function browserShortcutScope(key: HTMLElement, kind: "new-window" | "search") {
  const sequence = key.dataset.nativeSequence ?? key.textContent ?? "";
  const letter = sequence.split(",")[1];
  const alternative = ["B", "H", "I", "N"].includes(letter);
  key.dataset.nativeSequence = sequence;
  key.dataset.browserShortcutScope = kind;
  key.title = kind === "new-window"
    ? "연속키입니다. 일반 Chrome 탭에서는 Ctrl+N이 새 창 예약키이므로 메뉴를 사용하세요. 기존 검증은 앱 내부 입력 경로이며 물리키 수용은 미확인입니다."
    : "연속키입니다. Ctrl+K는 브라우저 검색과 충돌할 수 있습니다. 기존 검증은 앱 내부 입력 경로이며 물리키 수용은 미확인입니다. 메뉴를 사용하세요.";
  const note = key.ownerDocument.createElement("small");
  note.className = "browser-shortcut-note";
  note.textContent = `${sequence}`;
  if (alternative) {
    // One key column: a second sibling kbd squeezes the reference into a
    // vertical column in the existing narrow dropdown layout.
    key.textContent = `${dialogShortcutPrefix} → ${letter}`;
    key.dataset.dialogShortcut = letter;
    key.title += ` 기존 편의키(Word 기준 새 대체키 아님). ${dialogShortcutHelp}`;
  } else key.replaceChildren(); // A reference-only key is displayed once.
  key.append(note);
}
