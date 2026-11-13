type Context = { documentId: string; revision: number; selection: unknown };

// The first physical press remains one ordinary command. Only an observed
// native repeat supplies ONE replaceable frame credit, never a self-running loop.
// Dropped/old repeat events do not become debt. Every frame is reauthenticated
// by the receiver and uses the unchanged HU step.
export class ResizeKeyHold {
  private held?: { key: string; context: string; completed: number; step?: () => void };
  private frame = 0;
  cancel() {
    this.held = undefined;
    if (this.frame) { cancelAnimationFrame(this.frame); }
    this.frame = 0;
  }
  release(key: string) {
    if (key === this.held?.key || ['Control', 'Meta', 'Alt', 'Shift'].includes(key)) this.cancel();
  }
  matches(key: string, context: Context) {
    return !!this.held && this.held.key === key && this.held.context === JSON.stringify(context);
  }
  accepts(key: string, repeat: boolean, timestamp: number, context: Context): boolean {
    if (!repeat) {
      this.cancel();
      this.held = {key, context:JSON.stringify(context), completed:performance.now()};
      return true;
    }
    if (!this.matches(key, context)) { this.cancel(); return false; }
    return timestamp >= this.held!.completed;
  }
  repeat(key: string, timestamp: number, context: Context, step: () => void) {
    // Already-armed native notifications carry no additional command. They must
    // still match the current owner/revision, but need not accumulate or replay.
    if (!this.matches(key, context)) { this.cancel(); return; }
    if (timestamp < this.held!.completed) return;
    this.held!.step = step;
    this.schedule();
  }
  completed(key: string, context: Context) {
    // A synchronous focus/owner cancellation must not be rearmed on return.
    if (!this.held || this.held.key !== key) return;
    if (JSON.parse(this.held.context).documentId !== context.documentId) { this.cancel(); return; }
    this.held.context = JSON.stringify(context);
    this.held.completed = performance.now();
  }
  private schedule() {
    if (this.frame || !this.held?.step) return;
    const held = this.held;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.held !== held) return;
      const step = held.step;
      held.step = undefined;
      step?.(); // Only a subsequent fresh native repeat can schedule again.
    });
  }
}
