// Tiny in-memory fixed-window rate limiter for the free routes. Clock is injectable for tests.
export interface RateLimiter {
  /** Returns null when allowed, or the seconds to wait when the key is over its limit. */
  hit(key: string): number | null;
}

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, { start: number; count: number }>();
  let lastSweep = now();
  return {
    hit(key) {
      const t = now();
      if (t - lastSweep >= windowMs) {
        for (const [k, b] of buckets) if (t - b.start >= windowMs) buckets.delete(k);
        lastSweep = t;
      }
      let b = buckets.get(key);
      if (!b || t - b.start >= windowMs) {
        b = { start: t, count: 0 };
        buckets.set(key, b);
      }
      if (b.count >= limit) return Math.max(1, Math.ceil((b.start + windowMs - t) / 1000));
      b.count++;
      return null;
    },
  };
}
