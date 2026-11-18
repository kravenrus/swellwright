/**
 * A fixed-window counter per key, in memory. It slows down guessing from one address and is lost on restart;
 * the per-account lockout in the database is the durable control.
 */
export class WindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt. Returns false when the key is over its limit for the current window. */
  hit(key: string): boolean {
    const now = this.now();
    this.prune(now);
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }

  private prune(now: number): void {
    if (this.windows.size < 1024) {
      return;
    }
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
