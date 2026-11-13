// Sequential page-local menu access; never claims an OS/browser Alt chord.
export const menuAccessKeys: Readonly<Record<string, string>> = Object.freeze({
  f: "file-menu",
  e: "edit-menu",
  u: "view-menu",
  d: "insert-menu",
  j: "format-menu",
  w: "page-menu",
  r: "workspace-6",
  h: "workspace-7",
  k: "workspace-8",
});
type Key = Pick<
  KeyboardEvent,
  | "key"
  | "code"
  | "altKey"
  | "ctrlKey"
  | "metaKey"
  | "shiftKey"
  | "repeat"
  | "isComposing"
  | "keyCode"
> & { altGraph?: boolean };
type AccessAction =
  | { type: "none" }
  | { type: "hint" }
  | { type: "open"; id: string }
  | { type: "dismiss" };
export class WorkspaceAccess {
  private phase: "idle" | "alt-held" | "armed" = "idle";
  get armed() {
    return this.phase === "armed";
  }
  cancel() {
    this.phase = "idle";
  }
  keydown(e: Key, allowed: boolean): AccessAction {
    if (!allowed || e.isComposing || e.keyCode === 229 || e.altGraph) {
      this.cancel();
      return { type: "none" };
    }
    if (e.key === "Alt" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (!e.repeat) this.phase = "alt-held";
      return { type: "none" };
    }
    // Any accompanying key belongs to its existing chord, including Alt+L/T.
    if (this.phase === "alt-held") {
      this.cancel();
      return { type: "none" };
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) {
      this.cancel();
      return { type: "none" };
    }
    if (e.key === "F10") {
      this.phase = "armed";
      return { type: "open", id: "file-menu" };
    }
    if (!this.armed) return { type: "none" };
    if (e.key === "Escape") {
      this.cancel();
      return { type: "dismiss" };
    }
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End",
      ].includes(e.key)
    )
      return { type: "none" };
    const letter = /^Key[A-Z]$/.test(e.code)
      ? e.code.slice(3).toLowerCase()
      : e.key.toLowerCase();
    this.cancel();
    return menuAccessKeys[letter]
      ? { type: "open", id: menuAccessKeys[letter] }
      : { type: "none" };
  }
  keyup(e: Key, allowed: boolean): AccessAction {
    if (
      !allowed ||
      e.isComposing ||
      e.keyCode === 229 ||
      e.altGraph ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey
    ) {
      this.cancel();
      return { type: "none" };
    }
    if (e.key === "Alt" && this.phase === "alt-held") {
      this.phase = "armed";
      return { type: "hint" };
    }
    return { type: "none" };
  }
}
