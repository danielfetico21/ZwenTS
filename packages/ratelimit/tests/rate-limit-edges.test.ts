import { describe, expect, it } from "vitest";
import { createApp } from "@zwents/core";
import {
  memoryRateLimitStore,
  rateLimit,
  type RateLimitStore,
} from "../index.js";

describe("rateLimit default key resolution", () => {
  it("falls back to X-Real-Ip when trustProxy is enabled", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key) {
        keys.push(key);
        return { count: 1, resetAt: 60_000 };
      },
    };

    const app = createApp({ context: {} })
      .use(rateLimit({ limit: 5, windowMs: 60_000, store, trustProxy: true }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({ "x-real-ip": " 10.0.0.1 " }),
    });

    expect(keys).toEqual(["ip:10.0.0.1"]);
  });

  it("ignores X-Real-Ip when trustProxy is disabled", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key) {
        keys.push(key);
        return { count: 1, resetAt: 60_000 };
      },
    };

    const app = createApp({ context: {} })
      .use(rateLimit({ limit: 5, windowMs: 60_000, store }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({ "x-real-ip": "10.0.0.1" }),
    });

    expect(keys).toEqual(["anonymous"]);
  });

  it("evicts oldest buckets to honor maxKeys", () => {
    const store = memoryRateLimitStore({ now: () => 0, maxKeys: 2 });
    expect(store.hit("a", 60_000, 0).count).toBe(1);
    expect(store.hit("b", 60_000, 0).count).toBe(1);
    expect(store.hit("c", 60_000, 0).count).toBe(1);
    // "a" was evicted when "c" arrived; "c" remains and increments.
    expect(store.hit("a", 60_000, 0).count).toBe(1);
    expect(store.hit("c", 60_000, 0).count).toBe(2);
  });

  it("uses anonymous when no identity headers are present", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key) {
        keys.push(key);
        return { count: 1, resetAt: 60_000 };
      },
    };

    const app = createApp({ context: {} })
      .use(rateLimit({ limit: 5, windowMs: 60_000, store }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({ method: "GET", path: "/" });
    expect(keys).toEqual(["anonymous"]);
  });
});
