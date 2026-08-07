# Redis-backed stores (rate limit + idempotency)

In-memory stores are **single-process**. For multi-instance production, pass a Redis (or similar) implementation of the existing interfaces — no Redis client ships in `@zwents/*`.

## Rate limit — `RateLimitStore`

Interface: `hit(key, windowMs, now) → { count, resetAt }`.

Fixed-window sketch with `ioredis` / `redis` (app dependency):

```ts
import type { RateLimitStore } from "@zwents/ratelimit";
import Redis from "ioredis";

export function redisRateLimitStore(redis: Redis): RateLimitStore {
  return {
    async hit(key, windowMs, now) {
      const resetAt = Math.floor(now / windowMs) * windowMs + windowMs;
      const bucket = `rl:${key}:${resetAt}`;
      const count = await redis.incr(bucket);
      if (count === 1) {
        // Expire shortly after window end
        await redis.pexpire(bucket, resetAt - now + 1_000);
      }
      return { count, resetAt };
    },
  };
}

// app.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisRateLimitStore(redis) }))
```

## Idempotency — `IdempotencyStore`

Interface: `start` / `complete` / `fail` (see `@zwents/idempotency`). Cross-node **waiters** need coordination (Redis key + polling, or pub/sub). Minimal pattern:

1. `SET idem:{key} {fingerprint,status} NX PX ttl` — first request proceeds  
2. Same key + same fingerprint + complete → replay stored response JSON  
3. Same key + different fingerprint → conflict  
4. In-flight → poll / wait with short backoff until complete or TTL  

Full fencing (leases) should mirror `memoryIdempotencyStore` semantics — prefer a battle-tested shared store if you need strong multi-node guarantees.

## Wiring

```ts
const redis = new Redis(process.env.REDIS_URL!);
const app = createApp({
  context: services,
  onStop: [() => redis.quit()],
})
  .use(rateLimit({ limit: 100, windowMs: 60_000, store: redisRateLimitStore(redis) }))
  .use(idempotency({ store: /* your IdempotencyStore */ }));
```

See also: [deploy-notes.md](./deploy-notes.md), [security-checklist.md](./security-checklist.md).
