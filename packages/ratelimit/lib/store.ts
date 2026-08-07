/**
 * Pluggable rate-limit counter store.
 * In-memory is single-process only — use Redis (or similar) behind this interface in multi-node deploys.
 */
export type RateLimitHit = {
  /** Count in the current window after this hit (inclusive). */
  count: number;
  /** Unix timestamp (ms) when the window ends. */
  resetAt: number;
};

export type RateLimitStore = {
  /**
   * Record one hit for `key` in a fixed window of `windowMs`.
   * Implementations should be safe under concurrent callers within one process
   * (sync Map updates are fine on the Node event loop).
   */
  hit: (
    key: string,
    windowMs: number,
    now: number,
  ) => RateLimitHit | Promise<RateLimitHit>;
};

export type MemoryRateLimitStoreOptions = {
  /** Injected clock for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Hard max tracked buckets. Defaults to 10_000. */
  maxKeys?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
  seq: number;
};

/**
 * Fixed-window in-memory store. Not shared across processes/instances.
 */
export function memoryRateLimitStore(
  options: MemoryRateLimitStoreOptions = {},
): RateLimitStore {
  const buckets = new Map<string, Bucket>();
  const maxKeys = options.maxKeys ?? 10_000;
  const clock = options.now ?? Date.now;
  let seq = 0;

  const pruneExpired = (now: number): void => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  const evictOldest = (): boolean => {
    let oldestKey: string | undefined;
    let oldestSeq = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of buckets) {
      if (bucket.seq < oldestSeq) {
        oldestSeq = bucket.seq;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) return false;
    buckets.delete(oldestKey);
    return true;
  };

  return {
    hit(key, windowMs, now = clock()) {
      pruneExpired(now);

      const resetAt = Math.floor(now / windowMs) * windowMs + windowMs;
      const bucketKey = `${key}\0${resetAt}`;
      const existing = buckets.get(bucketKey);
      if (existing && existing.resetAt > now) {
        existing.count += 1;
        return { count: existing.count, resetAt: existing.resetAt };
      }

      while (buckets.size >= maxKeys) {
        if (!evictOldest()) break;
      }

      buckets.set(bucketKey, { count: 1, resetAt, seq: ++seq });
      return { count: 1, resetAt };
    },
  };
}
