/** CSS pixels and event timestamps only. Ordinary movement never edits. */
export class TouchIntent {
  private down?: { id: number; x: number; y: number; time: number; key: string; moved: boolean; held: boolean };
  private tap?: { x: number; y: number; time: number; key: string };
  selecting = false;
  reset() { this.down = this.tap = undefined; this.selecting = false; }
  start(id: number, x: number, y: number, time: number, key: string) {
    if (this.down) { this.down = this.tap = undefined; return false; }
    this.down = { id, x, y, time, key, moved: false, held: false }; return true;
  }
  move(id: number, x: number, y: number) {
    const d = this.down; if (!d || d.id !== id) return false;
    if (Math.hypot(x - d.x, y - d.y) > 10) { d.moved = true; this.tap = undefined; }
    return d.moved; // Caller cancels the hold; page movement is always scrolling.
  }
  hold(id: number, time: number, key: string) {
    const d = this.down;
    if (!d || d.id !== id || d.key !== key || d.moved || d.held || time - d.time < 500) return false;
    d.held = true; this.tap = undefined; this.selecting = true; return true;
  }
  holding() { return !!this.down?.held; }
  active() { return !!this.down; }
  acceptTap() { this.selecting = false; }
  rejectHold() { this.selecting = false; }
  isCurrent(id: number, key: string) {
    return this.down?.id === id && this.down.key === key && !this.down.moved;
  }
  end(id: number, x: number, y: number, time: number, key: string) {
    const d = this.down; this.down = undefined;
    if (d?.id === id && d.held) return d.key === key ? 'held' : 'none';
    if (!d || d.id !== id || d.key !== key || d.moved || time < d.time || time - d.time > 500 ||
        Math.hypot(x - d.x, y - d.y) > 10) return 'none';
    const double = this.tap && this.tap.key === key && time - this.tap.time <= 350 &&
      Math.hypot(x - this.tap.x, y - this.tap.y) <= 24;
    this.tap = double ? undefined : { x, y, time, key };
    return double ? 'zoom' : 'caret';
  }
  cancel() { this.down = this.tap = undefined; }
}
