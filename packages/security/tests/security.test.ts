import { describe, expect, it, vi } from "vitest";
import { createApp } from "@zwents/core";
import { cors, requestId, securityHeaders } from "../index.js";

function headers(init?: Record<string, string>): Headers {
  return new Headers(init);
}

/** Fetch `Headers` rejects CR/LF; stub get() to simulate hostile proxies. */
function stubHeader(name: string, value: string): Headers {
  const key = name.toLowerCase();
  return {
    get: (headerName: string) =>
      headerName.toLowerCase() === key ? value : null,
  } as Headers;
}

describe("requestId", () => {
  it("generates and echoes an id when header is missing", async () => {
    const app = createApp({ context: {} })
      .use(requestId({ generate: () => "generated-id" }))
      .route({
        method: "GET",
        path: "/",
        handler: async (ctx) => ({ id: ctx.requestId }),
      });

    const res = await app.dispatch({ method: "GET", path: "/" });
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe("generated-id");
    expect(res.body).toEqual({ id: "generated-id" });
  });

  it("adopts a safe client id", async () => {
    const app = createApp({ context: {} })
      .use(requestId())
      .route({
        method: "GET",
        path: "/",
        handler: async (ctx) => ({ id: ctx.requestId }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/",
      headers: headers({ "x-request-id": "client-42" }),
    });
    expect(res.headers["x-request-id"]).toBe("client-42");
    expect(res.body).toEqual({ id: "client-42" });
  });

  it("rejects CR/LF/NUL injection and oversized ids", async () => {
    const app = createApp({ context: {} })
      .use(requestId({ generate: () => "safe" }))
      .route({
        method: "GET",
        path: "/",
        handler: async (ctx) => ({ id: ctx.requestId }),
      });

    for (const bad of [
      "evil\r\nX-Injected: 1",
      "evil\n",
      "evil\0x",
      "a".repeat(129),
      "has spaces",
      "  padded  ",
      "",
    ]) {
      const res = await app.dispatch({
        method: "GET",
        path: "/",
        headers: stubHeader("x-request-id", bad),
      });
      expect(res.headers["x-request-id"]).toBe("safe");
      expect(res.body).toEqual({ id: "safe" });
    }
  });

  it("echoes request id on error responses", async () => {
    const app = createApp({ context: {} }).use(
      requestId({ generate: () => "err-id" }),
    );
    const res = await app.dispatch({ method: "GET", path: "/missing" });
    expect(res.status).toBe(404);
    expect(res.headers["x-request-id"]).toBe("err-id");
  });

  it("isolates ids under concurrency", async () => {
    const app = createApp({ context: {} })
      .use(requestId())
      .route({
        method: "GET",
        path: "/",
        handler: async (ctx) => ({ id: ctx.requestId }),
      });

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        app.dispatch({
          method: "GET",
          path: "/",
          headers: headers({ "x-request-id": `req-${i}` }),
        }),
      ),
    );

    for (const [i, res] of results.entries()) {
      expect(res.headers["x-request-id"]).toBe(`req-${i}`);
      expect(res.body).toEqual({ id: `req-${i}` });
    }
  });
});

describe("securityHeaders", () => {
  it("applies defaults on success and 404", async () => {
    const app = createApp({ context: {} })
      .use(securityHeaders())
      .route({
        method: "GET",
        path: "/ok",
        handler: async () => ({ ok: true }),
      });

    const ok = await app.dispatch({ method: "GET", path: "/ok" });
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    expect(ok.headers["x-frame-options"]).toBe("DENY");
    expect(ok.headers["referrer-policy"]).toBe("no-referrer");
    expect(ok.headers["strict-transport-security"]).toContain("max-age=");

    const missing = await app.dispatch({ method: "GET", path: "/nope" });
    expect(missing.status).toBe(404);
    expect(missing.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("allows opting out of individual headers", async () => {
    const app = createApp({ context: {} })
      .use(
        securityHeaders({
          strictTransportSecurity: false,
          frameOptions: false,
          extras: { "x-custom": "1" },
        }),
      )
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({}),
      });

    const res = await app.dispatch({ method: "GET", path: "/" });
    expect(res.headers["strict-transport-security"]).toBeUndefined();
    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-custom"]).toBe("1");
  });

  it("rejects extras values containing CR/LF/NUL", () => {
    expect(() =>
      securityHeaders({
        extras: { "x-evil": "ok\r\nX-Injected: 1" },
      }),
    ).toThrow(/must not contain CR, LF, or NUL/);
  });
});

describe("cors", () => {
  it("throws when credentials combine with wildcard origin", () => {
    expect(() => cors({ origin: "*", credentials: true })).toThrow(
      /credentials cannot be used/,
    );
  });

  it("allows wildcard without credentials", async () => {
    const app = createApp({ context: {} })
      .use(cors({ origin: "*" }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/",
      headers: headers({ origin: "https://evil.example" }),
    });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["vary"]).toBeUndefined();
  });

  it("reflects only allowlisted origins and sets Vary", async () => {
    const app = createApp({ context: {} })
      .use(cors({ origin: ["https://app.example"] }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    const allowed = await app.dispatch({
      method: "GET",
      path: "/",
      headers: headers({ origin: "https://app.example" }),
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://app.example",
    );
    expect(allowed.headers["vary"]).toBe("Origin");

    const denied = await app.dispatch({
      method: "GET",
      path: "/",
      headers: headers({ origin: "https://evil.example" }),
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("handles OPTIONS preflight without a matching route", async () => {
    const app = createApp({ context: {} }).use(
      cors({
        origin: ["https://app.example"],
        allowHeaders: ["Content-Type", "X-Custom"],
        maxAge: 120,
      }),
    );

    const res = await app.dispatch({
      method: "OPTIONS",
      path: "/anything",
      headers: headers({
        origin: "https://app.example",
        "access-control-request-method": "POST",
      }),
    });

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://app.example",
    );
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toContain("X-Custom");
    expect(res.headers["access-control-max-age"]).toBe("120");
  });

  it("does not leak ACAO on preflight for disallowed origin", async () => {
    const app = createApp({ context: {} }).use(
      cors({ origin: ["https://app.example"] }),
    );

    const res = await app.dispatch({
      method: "OPTIONS",
      path: "/x",
      headers: headers({ origin: "https://evil.example" }),
    });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-methods"]).toBeUndefined();
  });

  it("supports predicate origins and credentials", async () => {
    const predicate = vi.fn<(origin: string) => boolean>((o) =>
      o.endsWith(".trusted.test"),
    );
    const app = createApp({ context: {} })
      .use(
        cors({
          origin: predicate,
          credentials: true,
          exposeHeaders: ["X-Request-Id"],
        }),
      )
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/",
      headers: headers({ origin: "https://a.trusted.test" }),
    });
    expect(predicate).toHaveBeenCalledWith("https://a.trusted.test");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://a.trusted.test",
    );
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-expose-headers"]).toBe("X-Request-Id");
  });

  it("keeps CORS headers on handler errors", async () => {
    const app = createApp({ context: {} })
      .use(cors({ origin: ["https://app.example"] }))
      .route({
        method: "GET",
        path: "/boom",
        handler: async () => {
          throw new Error("nope");
        },
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/boom",
      headers: headers({ origin: "https://app.example" }),
    });
    expect(res.status).toBe(500);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://app.example",
    );
  });

  it("short-circuits OPTIONS so route handlers are not called", async () => {
    let called = false;
    const app = createApp({ context: {} })
      .use(cors({ origin: "*" }))
      .route({
        method: "OPTIONS",
        path: "/x",
        handler: async () => {
          called = true;
          return {};
        },
      });

    await app.dispatch({
      method: "OPTIONS",
      path: "/x",
      headers: headers({ origin: "https://a.test" }),
    });
    expect(called).toBe(false);
  });
});
