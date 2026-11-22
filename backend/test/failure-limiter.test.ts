import { describe, expect, it } from 'vitest';
import { FailureLimiter } from '../src/lib/failure-limiter.js';

describe('NFR-3: FailureLimiter', () => {
  it('blocks after maxFailures within the period, then lets the key try again', () => {
    let now = 0;
    const limiter = new FailureLimiter(3, 60_000, () => now);
    limiter.fail('ip');
    limiter.fail('ip');
    expect(limiter.retryAfterSec('ip')).toBe(0);
    limiter.fail('ip');
    expect(limiter.retryAfterSec('ip')).toBe(60);
    now = 30_000;
    expect(limiter.retryAfterSec('ip')).toBe(30);
    now = 60_001;
    expect(limiter.retryAfterSec('ip')).toBe(0);
  });

  it('forgets old failures and keeps keys apart', () => {
    let now = 0;
    const limiter = new FailureLimiter(2, 1_000, () => now);
    limiter.fail('a');
    now = 5_000;
    limiter.fail('a');
    expect(limiter.retryAfterSec('a')).toBe(0);
    limiter.fail('b');
    limiter.fail('b');
    expect(limiter.retryAfterSec('b')).toBe(1);
    expect(limiter.retryAfterSec('a')).toBe(0);
  });

  it('is off with maxFailures = 0', () => {
    const limiter = new FailureLimiter(0, 1_000);
    for (let i = 0; i < 100; i++) limiter.fail('ip');
    expect(limiter.retryAfterSec('ip')).toBe(0);
  });
});
