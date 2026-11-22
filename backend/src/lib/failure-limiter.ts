/**
 * Counts failures per key (the client IP) and blocks a key that fails too often (NFR-3).
 * Used against guessing share links. State lives in memory: the backend is a single process.
 * A success never clears the count, so mixing in a known valid link does not help an attacker.
 */
interface Entry {
  failures: number;
  windowStart: number;
  blockedUntil: number;
}

export class FailureLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxFailures: number,
    /** Both the counting window and the block duration. */
    private readonly periodMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000,
  ) {}

  /** Seconds before this key may try again; 0 when it is not blocked. */
  retryAfterSec(key: string): number {
    const entry = this.entries.get(key);
    const left = entry ? entry.blockedUntil - this.now() : 0;
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  fail(key: string): void {
    if (this.maxFailures <= 0) return;
    const now = this.now();
    let entry = this.entries.get(key);
    if (!entry || now - entry.windowStart > this.periodMs) entry = { failures: 0, windowStart: now, blockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.blockedUntil = now + this.periodMs;
      entry.failures = 0;
      entry.windowStart = now;
    }
    // Re-insert so that the Map stays ordered by last failure; drop the oldest beyond maxEntries.
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }
}
