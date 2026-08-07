import {
  ErrorCodes,
  problemResponse,
  type Middleware,
  type RequestContext,
} from "@zwents/core";
import { isSafeToken } from "@zwents/security";
import {
  memoryRateLimitStore,
  type RateLimitStore,
} from "./store.js";

export type RateLimitOptions<S = unknown> = {
  /** Max requests per window. Must be ≥ 1. */
  limit: number;
  /** Window length in milliseconds. Must be ≥ 1. */
  windowMs: number;
  /** Defaults to an in-memory fixed-window store (single process). */
  store?: RateLimitStore;
  /**
   * Bucket key. Return `null` to skip limiting for this request.
   * Unsafe keys (CR/LF/NUL, non-token charset, over-long) are also skipped —
   * they are not stripped into a shared bucket.
   * Default: auth userId → (when `trustProxy`) first `X-Forwarded-For` /
   * `X-Real-Ip` → `"anonymous"`.
   */
  key?: (ctx: RequestContext<S>) => string | null;
  /**
   * When true, the default key may use `X-Forwarded-For` / `X-Real-Ip`.
   * Defaults to false — only enable behind a trusted reverse proxy.
   */
  trustProxy?: boolean;
  /** Skip limiting when true. Defaults to skipping `OPTIONS`. */
  skip?: (ctx: RequestContext<S>) => boolean;
  /** Emit `RateLimit-*` headers. Defaults to true. */
  standardHeaders?: boolean;
  /** Emit `Retry-After` on 429. Defaults to true. */
  retryAfter?: boolean;
  /** Injected clock (tests). */
  now?: () => number;
};

const MAX_KEY_LENGTH = 256;

function defaultKey(ctx: RequestContext, trustProxy: boolean): string {
  if (ctx.auth?.userId) return `user:${ctx.auth.userId}`;
  if (trustProxy) {
    const forwarded = ctx.req.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return `ip:${first}`;
    }
    const realIp = ctx.req.headers.get("x-real-ip")?.trim();
    if (realIp) return `ip:${realIp}`;
  }
  return "anonymous";
}

function setLimitHeaders(
  ctx: RequestContext,
  limit: number,
  remaining: number,
  resetAt: number,
  now: number,
  options: { standardHeaders: boolean; retryAfter: boolean; limited: boolean },
): void {
  if (options.standardHeaders) {
    ctx.responseHeaders["ratelimit-limit"] = String(limit);
    ctx.responseHeaders["ratelimit-remaining"] = String(Math.max(0, remaining));
    ctx.responseHeaders["ratelimit-reset"] = String(
      Math.max(0, Math.ceil((resetAt - now) / 1000)),
    );
  }
  if (options.limited && options.retryAfter) {
    ctx.responseHeaders["retry-after"] = String(
      Math.max(1, Math.ceil((resetAt - now) / 1000)),
    );
  }
}

/**
 * Fixed-window rate limit middleware.
 * Uses Problem Details `RATE_LIMITED` (429) when exceeded.
 */
export function rateLimit<S = unknown>(
  options: RateLimitOptions<S>,
): Middleware<S> {
  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error("@zwents/ratelimit: limit must be a number ≥ 1");
  }
  if (!Number.isFinite(options.windowMs) || options.windowMs < 1) {
    throw new Error("@zwents/ratelimit: windowMs must be a number ≥ 1");
  }

  const store = options.store ?? memoryRateLimitStore({ now: options.now });
  const trustProxy = options.trustProxy ?? false;
  const resolveKey =
    options.key ?? ((ctx: RequestContext<S>) => defaultKey(ctx, trustProxy));
  const skip =
    options.skip ?? ((ctx: RequestContext<S>) => ctx.req.method === "OPTIONS");
  const standardHeaders = options.standardHeaders ?? true;
  const retryAfter = options.retryAfter ?? true;
  const clock = options.now ?? Date.now;

  return async (ctx, next) => {
    if (skip(ctx)) {
      await next();
      return;
    }

    const rawKey = resolveKey(ctx);
    if (rawKey === null || !isSafeToken(rawKey, { maxLength: MAX_KEY_LENGTH })) {
      await next();
      return;
    }

    const key = rawKey;
    const now = clock();
    const hit = await store.hit(key, options.windowMs, now);
    const remaining = options.limit - hit.count;

    if (hit.count > options.limit) {
      setLimitHeaders(ctx, options.limit, 0, hit.resetAt, now, {
        standardHeaders,
        retryAfter,
        limited: true,
      });
      ctx.respond(
        problemResponse(ErrorCodes.RATE_LIMITED, ctx.req.path, {
          detail: "Rate limit exceeded",
          extras: {
            limit: options.limit,
            windowMs: options.windowMs,
            resetAt: hit.resetAt,
          },
        }),
      );
      return;
    }

    setLimitHeaders(ctx, options.limit, remaining, hit.resetAt, now, {
      standardHeaders,
      retryAfter,
      limited: false,
    });
    await next();
  };
}
