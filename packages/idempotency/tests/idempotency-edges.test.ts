import { createApp } from "@zwents/core";
import { describe, expect, it, vi } from "vitest";
import {
  idempotency,
  memoryIdempotencyStore,
  type IdempotencyStore,
} from "../index.js";

function postApp(
  options: Parameters<typeof idempotency>[0],
  configure?: (app: ReturnType<typeof createApp>) => ReturnType<typeof createApp>,
) {
  let app = createApp({ context: {} }).use(idempotency(options)).route({
    method: "POST",
    path: "/orders",
    handler: async () => ({ ok: true }),
  });
  if (configure) app = configure(app);
  return app;
}

describe("idempotency edges", () => {
  it("uses [unserializable] when body fingerprint cannot stringify", async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    const app = postApp({ now: () => 0 });
    const headers = new Headers({ "idempotency-key": "cyc-1" });
    await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: cyclic },
    });
    const conflict = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: { other: true } },
    });
    expect(conflict.status).toBe(409);
  });

  it("honors a custom methods list", async () => {
    let calls = 0;
    const app = createApp({ context: {} })
      .use(idempotency({ methods: ["GET"], now: () => 0 }))
      .route({
        method: "GET",
        path: "/items",
        handler: async () => {
          calls += 1;
          return { calls };
        },
      });

    const headers = new Headers({ "idempotency-key": "get-key" });
    await app.dispatch({ method: "GET", path: "/items", headers });
    await app.dispatch({ method: "GET", path: "/items", headers });
    expect(calls).toBe(1);
  });

  it("rejects invalid ttlMs at construction", () => {
    expect(() => idempotency({ ttlMs: 0 })).toThrow(/ttlMs must be a number/);
  });

  it("returns CONFLICT when a waiting peer fails", async () => {
    let rejectWait!: (error: unknown) => void;
    const waitPromise = new Promise<import("@zwents/core").AppResponse>(
      (_resolve, reject) => {
        rejectWait = reject;
      },
    );
    let starts = 0;
    const store: IdempotencyStore = {
      async start() {
        starts += 1;
        if (starts === 1) return { type: "proceed", lease: 1 };
        return { type: "wait", promise: waitPromise };
      },
      async complete() {},
      async fail(_key, error) {
        rejectWait(error ?? new Error("failed"));
      },
    };

    const app = createApp({ context: {} })
      .use(idempotency({ store, now: () => 0 }))
      .route({
        method: "POST",
        path: "/orders",
        handler: async () => {
          throw new Error("handler failed");
        },
      });

    const headers = new Headers({ "idempotency-key": "wait-fail" });
    await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: {} },
    });

    const waiting = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: {} },
    });

    expect(waiting.status).toBe(409);
    expect(waiting.body).toMatchObject({
      code: "CONFLICT",
      detail: expect.stringContaining("Concurrent idempotent request failed"),
    });
  });

  it("releases the lock when next completes without a response", async () => {
    const store = memoryIdempotencyStore({ now: () => 0 });
    const app = createApp({ context: {} })
      .use(idempotency({ store, now: () => 0 }))
      .use(async (ctx, next) => {
        await next();
        ctx.response = undefined;
      })
      .route({
        method: "POST",
        path: "/orders",
        handler: async () => ({ ok: true }),
      });

    const headers = new Headers({ "idempotency-key": "no-resp" });
    await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: {} },
    });
    const retry = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: {} },
    });
    expect(retry.status).toBe(200);
  });

  it("calls store.fail and rethrows when the handler throws", async () => {
    const fail = vi.fn<
      (
        key: string,
        error?: unknown,
        response?: import("@zwents/core").AppResponse,
        lease?: number,
      ) => Promise<void>
    >(async () => undefined);
    const store: IdempotencyStore = {
      ...memoryIdempotencyStore({ now: () => 0 }),
      fail,
    };

    const app = createApp({ context: {} })
      .use(idempotency({ store, now: () => 0 }))
      .route({
        method: "POST",
        path: "/orders",
        handler: async () => {
          throw new Error("boom");
        },
      });

    const res = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers: new Headers({ "idempotency-key": "throw-key" }),
      input: { body: {} },
    });
    expect(res.status).toBe(500);
    expect(fail).toHaveBeenCalledWith(
      "throw-key",
      expect.any(Error),
      undefined,
      expect.any(Number),
    );
  });

  it("scopes store keys by authenticated user", async () => {
    let calls = 0;
    const store = memoryIdempotencyStore({ now: () => 0 });
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        const userId = ctx.req.headers.get("x-user") ?? "anon";
        ctx.auth = { userId, roles: [] };
        await next();
      })
      .use(idempotency({ store, now: () => 0 }))
      .route({
        method: "POST",
        path: "/orders",
        handler: async () => {
          calls += 1;
          return { calls };
        },
      });

    const key = "shared-key";
    const ada = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers: new Headers({ "idempotency-key": key, "x-user": "ada" }),
      input: { body: { sku: "a" } },
    });
    const grace = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers: new Headers({ "idempotency-key": key, "x-user": "grace" }),
      input: { body: { sku: "a" } },
    });

    expect(calls).toBe(2);
    expect(ada.body).toEqual({ calls: 1 });
    expect(grace.body).toEqual({ calls: 2 });
    expect(grace.headers["idempotent-replay"]).toBeUndefined();
  });

  it("returns 503 when the store reports overflow", async () => {
    const store: IdempotencyStore = {
      async start() {
        return { type: "overflow" };
      },
      async complete() {},
      async fail() {},
    };
    const app = postApp({ store, now: () => 0 });
    const res = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers: new Headers({ "idempotency-key": "overflow" }),
      input: { body: {} },
    });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
