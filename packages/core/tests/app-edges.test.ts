import { describe, expect, it } from "vitest";
import {
  AppError,
  createApp,
  ErrorCodes,
  json,
  mergeResponseHeaders,
  type Middleware,
} from "../index.js";

describe("createApp getters and hooks", () => {
  it("exposes registered middleware for OpenAPI discovery", () => {
    const mw: Middleware = async (_ctx, next) => {
      await next();
    };
    const app = createApp({ context: {} }).use(mw);
    expect(app.middleware).toEqual([mw]);
  });

  it("exposes compiled route definitions via routes getter", () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/x",
      handler: async () => ({ ok: true }),
    });
    expect(app.routes).toHaveLength(1);
    expect(app.routes[0]?.path).toBe("/x");
  });

  it("rejects a second start() with ALREADY_STARTED", async () => {
    const app = createApp({ context: {} });
    await app.start();
    await expect(app.start()).rejects.toMatchObject({
      code: ErrorCodes.ALREADY_STARTED,
    });
  });

  it("rejects stop() that exceeds timeout with STOP_TIMEOUT", async () => {
    const app = createApp({ context: {} }).onStop(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await app.start();
    await expect(app.stop({ timeoutMs: 1 })).rejects.toBeInstanceOf(AppError);
    await expect(app.stop({ timeoutMs: 1 })).rejects.toMatchObject({
      code: ErrorCodes.STOP_TIMEOUT,
    });
  });

  it("uses a custom onError handler", async () => {
    const app = createApp({ context: {} })
      .onError(() => json({ handled: true }, 418))
      .route({
        method: "GET",
        path: "/fail",
        handler: async () => {
          throw new Error("boom");
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/fail" });
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ handled: true });
  });

  it("falls back when a custom onError handler throws", async () => {
    const app = createApp({ context: {} })
      .onError(() => {
        throw new Error("handler failed");
      })
      .route({
        method: "GET",
        path: "/fail",
        handler: async () => {
          throw new Error("boom");
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/fail" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("resumes start hooks after a partial failure", async () => {
    const order: string[] = [];
    let failOnce = true;
    const app = createApp({
      context: {},
      onStart: [
        async () => {
          order.push("a");
        },
        async () => {
          order.push("b");
          if (failOnce) {
            failOnce = false;
            throw new Error("b failed");
          }
        },
        async () => {
          order.push("c");
        },
      ],
    });

    await expect(app.start()).rejects.toThrow(/b failed/);
    expect(order).toEqual(["a", "b"]);
    expect(app.started).toBe(false);

    await app.start();
    expect(order).toEqual(["a", "b", "b", "c"]);
    expect(app.started).toBe(true);
  });

  it("runs start hooks once under concurrent start()", async () => {
    let hooks = 0;
    const app = createApp({
      context: {},
      onStart: [
        async () => {
          hooks += 1;
          await new Promise((r) => setTimeout(r, 20));
        },
      ],
    });

    await Promise.all([app.start(), app.start(), app.start()]);
    expect(hooks).toBe(1);
    expect(app.started).toBe(true);
    await expect(app.start()).rejects.toMatchObject({
      code: ErrorCodes.ALREADY_STARTED,
    });
  });

  it("returns 404 for malformed percent-encoding in path params", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/items/:id",
      handler: async () => ({ ok: true }),
    });

    const res = await app.dispatch({ method: "GET", path: "/items/%zz" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("mergeResponseHeaders", () => {
  it("merges middleware response headers onto the final response", () => {
    const merged = mergeResponseHeaders(
      json({ ok: true }),
      { "x-request-id": "abc" },
    );
    expect(merged.headers["x-request-id"]).toBe("abc");
    expect(merged.headers["content-type"]).toContain("application/json");
  });
});
