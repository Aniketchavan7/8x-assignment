import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request', () => {
    const limiter = createRateLimiter(3, 10_000);
    const result = limiter.check('user1');
    expect(result.allowed).toBe(true);
  });

  it('allows requests up to the max', () => {
    const limiter = createRateLimiter(3, 10_000);
    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('blocks the request after max is reached', () => {
    const limiter = createRateLimiter(3, 10_000);
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeDefined();
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows requests again after the window expires', () => {
    const limiter = createRateLimiter(3, 10_000);
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);

    vi.advanceTimersByTime(10_001);

    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('tracks different keys independently', () => {
    const limiter = createRateLimiter(1, 10_000);
    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);
    expect(limiter.check('user2').allowed).toBe(true);
  });

  it('reset clears the count for a key', () => {
    const limiter = createRateLimiter(1, 10_000);
    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);

    limiter.reset('user1');

    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('returns retryAfterMs as time remaining in window', () => {
    const limiter = createRateLimiter(1, 10_000);
    limiter.check('user1');

    vi.advanceTimersByTime(3_000);

    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeLessThanOrEqual(7_000);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });
});
