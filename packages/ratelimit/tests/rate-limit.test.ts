import { describe, expect, it } from "vitest";
import { createApp } from "@zwents/core";
import {
  memoryRateLimitStore,
  rateLimit,
  type RateLimitStore,
} from "../index.js";

function appWithLimit(
  options: Parameters<typeof rateLimit>[0],
  handler?: () => Promise<unknown> | unknown,
) {
  return createApp({ context: {} })
    .use(rateLimit(options))
    .route({
      method: "GET",
      path: "/",
      handler: async () => handler?.() ?? ({ ok: true }),
    });
}

describe("rateLimit construction", () => {
  it("rejects invalid limit / windowMs", () => {
    expect(() => rateLimit({ limit: 0, windowMs: 1000 })).toThrow(/limit/);
    expect(() => rateLimit({ limit: 1, windowMs: 0 })).toThrow(/windowMs/);
    expect(() => rateLimit({ limit: Number.NaN, windowMs: 1 })).toThrow(
      /limit/,
    );
  });
});

describe("rateLimit", () => {
  it("allows requests under the limit and sets RateLimit headers", async () => {
    let now = 1_000_000;
    const app = appWithLimit({
      limit: 3,
      windowMs: 60_000,
      now: () => now,
      key: () => "u1",
    });

    const first = await app.dispatch({ method: "GET", path: "/" });
    expect(first.status).toBe(200);
    expect(first.headers["ratelimit-limit"]).toBe("3");
    expect(first.headers["ratelimit-remaining"]).toBe("2");
    // Fixed window ends at next multiple of windowMs (here +20s).
    expect(first.headers["ratelimit-reset"]).toBe("20");

    const second = await app.dispatch({ method: "GET", path: "/" });
    expect(second.headers["ratelimit-remaining"]).toBe("1");

    const third = await app.dispatch({ method: "GET", path: "/" });
    expect(third.status).toBe(200);
    expect(third.headers["ratelimit-remaining"]).toBe("0");
  });

  it("returns 429 Problem Details with Retry-After when exceeded", async () => {
    let now = 5_000_000;
    const app = appWithLimit({
      limit: 1,
      windowMs: 10_000,
      now: () => now,
      key: () => "u1",
    });

    await app.dispatch({ method: "GET", path: "/" });
    const limited = await app.dispatch({ method: "GET", path: "/" });

    expect(limited.status).toBe(429);
    expect(limited.headers["content-type"]).toContain("problem+json");
    expect(limited.headers["retry-after"]).toBe("10");
    expect(limited.headers["ratelimit-remaining"]).toBe("0");
    expect(limited.body).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      detail: "Rate limit exceeded",
    });
  });

  it("resets after the window elapses", async () => {
    let now = 0;
    const app = appWithLimit({
      limit: 1,
      windowMs: 1000,
      now: () => now,
      key: () => "u1",
    });

    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      429,
    );

    now = 1000;
    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
  });

  it("isolates buckets by key", async () => {
    const app = appWithLimit({
      limit: 1,
      windowMs: 60_000,
      key: (ctx) => ctx.req.headers.get("x-api-key"),
    });

    const a = await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({ "x-api-key": "a" }),
    });
    const b = await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({ "x-api-key": "b" }),
    });
    const a2 = await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({ "x-api-key": "a" }),
    });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a2.status).toBe(429);
  });

  it("skips when key returns null", async () => {
    const app = appWithLimit({
      limit: 1,
      windowMs: 60_000,
      key: () => null,
    });

    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
  });

  it("skips when key contains control characters", async () => {
    const app = appWithLimit({
      limit: 1,
      windowMs: 60_000,
      key: () => "bad\nkey",
    });

    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
  });

  it("skips OPTIONS by default", async () => {
    const store = memoryRateLimitStore({ now: () => 0 });
    const app = createApp({ context: {} }).use(
      rateLimit({
        limit: 1,
        windowMs: 60_000,
        store,
        key: () => "all",
        now: () => 0,
      }),
    );

    const preflight = await app.dispatch({ method: "OPTIONS", path: "/" });
    expect(preflight.status).toBe(404);

    const appGet = createApp({ context: {} })
      .use(
        rateLimit({
          limit: 1,
          windowMs: 60_000,
          store,
          key: () => "all",
          now: () => 0,
        }),
      )
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    expect((await appGet.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
    expect((await appGet.dispatch({ method: "GET", path: "/" })).status).toBe(
      429,
    );
  });

  it("uses auth userId before forwarded IP", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key, _windowMs, _now) {
        keys.push(key);
        return { count: 1, resetAt: 60_000 };
      },
    };

    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        ctx.auth = { userId: "42", roles: [] };
        await next();
      })
      .use(
        rateLimit({
          limit: 10,
          windowMs: 60_000,
          store,
        }),
      )
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({
        "x-forwarded-for": "9.9.9.9",
      }),
    });

    expect(keys).toEqual(["user:42"]);
  });

  it("ignores X-Forwarded-For unless trustProxy is enabled", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key) {
        keys.push(key);
        return { count: 1, resetAt: 60_000 };
      },
    };

    const app = appWithLimit({
      limit: 5,
      windowMs: 60_000,
      store,
    });

    await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({
        "x-forwarded-for": " 1.2.3.4 , 5.6.7.8",
      }),
    });

    expect(keys).toEqual(["anonymous"]);
  });

  it("takes the first X-Forwarded-For hop when trustProxy is enabled", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key) {
        keys.push(key);
        return { count: 1, resetAt: 60_000 };
      },
    };

    const app = appWithLimit({
      limit: 5,
      windowMs: 60_000,
      store,
      trustProxy: true,
    });

    await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({
        "x-forwarded-for": " 1.2.3.4 , 5.6.7.8",
      }),
    });

    expect(keys).toEqual(["ip:1.2.3.4"]);
  });

  it("does not hit the store for unsafe keys (no strip-into-shared-bucket)", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key) {
        keys.push(key);
        return { count: 1, resetAt: 60_000 };
      },
    };

    const app = appWithLimit({
      limit: 5,
      windowMs: 60_000,
      store,
      key: () => "evil\r\nX:1\0tail",
    });

    const res = await app.dispatch({ method: "GET", path: "/" });
    expect(res.status).toBe(200);
    expect(keys).toEqual([]);
  });

  it("enforces the limit under concurrent requests", async () => {
    const store = memoryRateLimitStore({ now: () => 1_000_000 });
    const app = appWithLimit({
      limit: 10,
      windowMs: 60_000,
      store,
      key: () => "burst",
      now: () => 1_000_000,
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        app.dispatch({ method: "GET", path: "/" }),
      ),
    );

    const ok = results.filter((r) => r.status === 200);
    const limited = results.filter((r) => r.status === 429);
    expect(ok).toHaveLength(10);
    expect(limited).toHaveLength(40);
  });

  it("does not share mutable request state across concurrent keys", async () => {
    const app = appWithLimit({
      limit: 1,
      windowMs: 60_000,
      key: (ctx) => ctx.req.headers.get("x-id"),
      now: () => 0,
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        app.dispatch({
          method: "GET",
          path: "/",
          headers: new Headers({ "x-id": `k-${i}` }),
        }),
      ),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it("honors custom skip", async () => {
    const app = appWithLimit({
      limit: 1,
      windowMs: 60_000,
      key: () => "x",
      skip: () => true,
    });

    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
    expect((await app.dispatch({ method: "GET", path: "/" })).status).toBe(
      200,
    );
  });
});

describe("memoryRateLimitStore", () => {
  it("prunes expired buckets when over maxKeys", async () => {
    let now = 0;
    const store = memoryRateLimitStore({
      now: () => now,
      maxKeys: 2,
    });

    store.hit("a", 1000, now);
    store.hit("b", 1000, now);
    store.hit("c", 1000, now);

    now = 1000;
    // New window + prune path
    const hit = store.hit("d", 1000, now);
    expect(hit.count).toBe(1);
  });
});
