import { describe, expect, it } from "vitest";
import { createApp } from "@zwents/core";
import { cors, isSafeToken, requestId, setResponseHeader } from "../index.js";

describe("isSafeToken", () => {
  it("accepts token charset within max length", () => {
    expect(isSafeToken("abc.def:1@x-y")).toBe(true);
    expect(isSafeToken("a".repeat(128))).toBe(true);
    expect(isSafeToken("a".repeat(129))).toBe(false);
    expect(isSafeToken("bad\n")).toBe(false);
    expect(isSafeToken("has space")).toBe(false);
  });
});

describe("requestId custom maxLength", () => {
  it("accepts ids up to a raised max length", async () => {
    const longId = `a${"b".repeat(200)}`;
    const app = createApp({ context: {} })
      .use(requestId({ maxLength: 256 }))
      .route({
        method: "GET",
        path: "/",
        handler: async (ctx) => ({ id: ctx.requestId }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({ "x-request-id": longId }),
    });
    expect(res.body).toEqual({ id: longId });
  });
});

describe("setResponseHeader", () => {
  it("writes lowercase keys into ctx.responseHeaders", async () => {
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        setResponseHeader(ctx, "X-Custom", "1");
        await next();
      })
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({ method: "GET", path: "/" });
    expect(res.headers["x-custom"]).toBe("1");
  });

  it("rejects header values containing CR/LF", () => {
    expect(() =>
      setResponseHeader(
        {
          responseHeaders: {},
        } as never,
        "x-custom",
        "1\r\nX: y",
      ),
    ).toThrow(/must not contain CR, LF, or NUL/);
  });
});

describe("cors hostile Origin", () => {
  it("does not reflect Origin values containing CR/LF", async () => {
    const app = createApp({ context: {} })
      .use(cors({ origin: () => true }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    // Fetch Headers rejects CR/LF; simulate a hostile carrier.
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === "origin"
          ? "https://evil.example\r\nX-Injected: 1"
          : null,
    } as Headers;

    const res = await app.dispatch({
      method: "GET",
      path: "/",
      headers,
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("cors appendVary", () => {
  it("does not duplicate Origin in Vary", async () => {
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        ctx.responseHeaders["vary"] = "Origin, Accept-Encoding";
        await next();
      })
      .use(cors({ origin: ["https://app.example"] }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({ origin: "https://app.example" }),
    });
    expect(res.headers["vary"]).toBe("Origin, Accept-Encoding");
  });

  it("returns no ACAO when request has no Origin header", async () => {
    const app = createApp({ context: {} })
      .use(cors({ origin: ["https://app.example"] }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({ method: "GET", path: "/" });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("appends Origin to Vary when it is not already listed", async () => {
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        ctx.responseHeaders["vary"] = "Accept-Encoding";
        await next();
      })
      .use(cors({ origin: ["https://app.example"] }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/",
      headers: new Headers({ origin: "https://app.example" }),
    });
    expect(res.headers["vary"]).toBe("Accept-Encoding, Origin");
  });
});
