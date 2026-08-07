import { describe, expect, it } from "vitest";
import { createApp, json } from "@zwents/core";
import { idempotency, memoryIdempotencyStore } from "../index.js";

function postApp(
  options: Parameters<typeof idempotency>[0],
  handler: () => Promise<unknown> | unknown,
) {
  return createApp({ context: {} })
    .use(idempotency(options))
    .route({
      method: "POST",
      path: "/orders",
      handler: async () => handler(),
    });
}

describe("idempotency", () => {
  it("skips when header is missing", async () => {
    let calls = 0;
    const app = postApp({}, async () => {
      calls += 1;
      return { n: calls };
    });

    await app.dispatch({ method: "POST", path: "/orders" });
    await app.dispatch({ method: "POST", path: "/orders" });
    expect(calls).toBe(2);
  });

  it("requires header when configured", async () => {
    const app = postApp({ required: true }, async () => ({ ok: true }));
    const res = await app.dispatch({ method: "POST", path: "/orders" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects unsafe Idempotency-Key values", async () => {
    const app = postApp({}, async () => ({ ok: true }));
    const res = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers: {
        get: () => "bad\r\nX:1",
      } as Headers,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("replays a successful response for the same key", async () => {
    let calls = 0;
    const app = postApp({ now: () => 0 }, async () => {
      calls += 1;
      return { id: "ord_1", calls };
    });

    const headers = new Headers({ "idempotency-key": "key-1" });
    const first = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: { sku: "a" } },
    });
    const second = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: { sku: "a" } },
    });

    expect(calls).toBe(1);
    expect(first.body).toEqual({ id: "ord_1", calls: 1 });
    expect(second.body).toEqual({ id: "ord_1", calls: 1 });
    expect(second.headers["idempotent-replay"]).toBe("true");
    expect(first.headers["idempotent-replay"]).toBeUndefined();
  });

  it("conflicts when the same key is reused with a different body fingerprint", async () => {
    const app = postApp({ now: () => 0 }, async () => ({ ok: true }));
    const headers = new Headers({ "idempotency-key": "key-2" });

    await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: { sku: "a" } },
    });
    const conflict = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: { sku: "b" } },
    });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "CONFLICT" });
  });

  it("runs the handler once under concurrent same-key requests", async () => {
    let calls = 0;
    const app = postApp({ now: () => 1_000 }, async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { calls };
    });

    const headers = new Headers({ "idempotency-key": "burst" });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.dispatch({
          method: "POST",
          path: "/orders",
          headers,
          input: { body: { sku: "a" } },
        }),
      ),
    );

    expect(calls).toBe(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
    for (const res of results) {
      expect(res.body).toEqual({ calls: 1 });
    }
    const replays = results.filter(
      (r) => r.headers["idempotent-replay"] === "true",
    );
    expect(replays).toHaveLength(19);
  });

  it("does not persist 4xx; a later retry executes again", async () => {
    let calls = 0;
    const app = createApp({ context: {} })
      .use(idempotency({ now: () => 0 }))
      .route({
        method: "POST",
        path: "/orders",
        handler: async (ctx) => {
          calls += 1;
          ctx.respond(json({ err: true }, 400));
        },
      });

    const headers = new Headers({ "idempotency-key": "k4" });
    const first = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: {} },
    });
    expect(first.status).toBe(400);

    const second = await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: {} },
    });
    expect(second.status).toBe(400);
    expect(calls).toBe(2);
  });

  it("skips GET by default", async () => {
    let calls = 0;
    const app = createApp({ context: {} })
      .use(idempotency({ now: () => 0 }))
      .route({
        method: "GET",
        path: "/orders",
        handler: async () => {
          calls += 1;
          return { calls };
        },
      });

    const headers = new Headers({ "idempotency-key": "get-1" });
    await app.dispatch({ method: "GET", path: "/orders", headers });
    await app.dispatch({ method: "GET", path: "/orders", headers });
    expect(calls).toBe(2);
  });

  it("expires cached responses after ttl", async () => {
    let now = 0;
    let calls = 0;
    const store = memoryIdempotencyStore({ now: () => now });
    const app = postApp(
      { store, ttlMs: 1000, now: () => now },
      async () => {
        calls += 1;
        return { calls };
      },
    );

    const headers = new Headers({ "idempotency-key": "ttl" });
    await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: {} },
    });
    now = 1001;
    await app.dispatch({
      method: "POST",
      path: "/orders",
      headers,
      input: { body: {} },
    });
    expect(calls).toBe(2);
  });

  it("sets ctx.response so middleware can observe handler output", async () => {
    let seen: number | undefined;
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        await next();
        seen = ctx.response?.status;
      })
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({ method: "GET", path: "/" });
    expect(seen).toBe(200);
  });
});
