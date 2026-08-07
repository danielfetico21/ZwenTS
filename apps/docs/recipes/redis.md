# Redis stores

In-memory rate limit / idempotency stores are single-process. For multi-node, implement the package interfaces with Redis in **your app** (no Redis client in `@zwents/*`).

```ts
import type { RateLimitStore } from "@zwents/ratelimit";
import Redis from "ioredis";

export function redisRateLimitStore(redis: Redis): RateLimitStore {
  return {
    async hit(key, windowMs, now) {
      const resetAt = Math.floor(now / windowMs) * windowMs + windowMs;
      const bucket = `rl:${key}:${resetAt}`;
      const count = await redis.incr(bucket);
      if (count === 1) await redis.pexpire(bucket, resetAt - now + 1_000);
      return { count, resetAt };
    },
  };
}
```

Idempotency needs `SET NX` + stored response + wait coordination — see monorepo `docs/redis-stores-recipe.md`.
