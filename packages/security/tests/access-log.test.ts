import { describe, expect, it, vi } from "vitest";
import { appError, createApp, ErrorCodes } from "@zwents/core";
import { accessLog } from "../index.js";

describe("accessLog", () => {
  it("logs method path status duration and requestId on success", async () => {
    const log = vi.fn();
    const app = createApp({ context: {} })
      .use(accessLog({ log }))
      .route({
        method: "GET",
        path: "/hello",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/hello",
      requestId: "req-1",
    });
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      method: "GET",
      path: "/hello",
      status: 200,
      requestId: "req-1",
    });
    expect(log.mock.calls[0]?.[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs error status after handler failure", async () => {
    const log = vi.fn();
    const app = createApp({ context: {} })
      .use(accessLog({ log }))
      .route({
        method: "GET",
        path: "/boom",
        handler: async () => {
          throw appError(ErrorCodes.NOT_FOUND, { detail: "missing" });
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/boom" });
    expect(res.status).toBe(404);
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      method: "GET",
      path: "/boom",
      status: 404,
    });
  });

  it("skips when skip predicate matches", async () => {
    const log = vi.fn();
    const app = createApp({ context: {} })
      .use(accessLog({ log, skip: (ctx) => ctx.req.path === "/health" }))
      .route({
        method: "GET",
        path: "/health",
        handler: async () => ({ status: "ok" }),
      });

    await app.dispatch({ method: "GET", path: "/health" });
    expect(log).not.toHaveBeenCalled();
  });

  it("uses ctx.logger.info by default", async () => {
    const info = vi.fn();
    const app = createApp({
      context: {},
    })
      .use(async (ctx, next) => {
        ctx.logger = {
          debug: vi.fn(),
          info,
          warn: vi.fn(),
          error: vi.fn(),
          child: () => ctx.logger,
        };
        await next();
      })
      .use(accessLog())
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({ method: "GET", path: "/" });
    expect(info).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ method: "GET", path: "/", status: 200 }),
    );
  });

  it("logs when skip returns false", async () => {
    const log = vi.fn();
    const app = createApp({ context: {} })
      .use(accessLog({ log, skip: () => false }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({ method: "GET", path: "/" });
    expect(log).toHaveBeenCalledOnce();
  });

  it("logs status 500 for non-AppError throws", async () => {
    const log = vi.fn();
    const app = createApp({ context: {} })
      .use(accessLog({ log }))
      .route({
        method: "GET",
        path: "/boom",
        handler: async () => {
          throw new Error("raw");
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/boom" });
    expect(res.status).toBe(500);
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      path: "/boom",
      status: 500,
    });
  });

  it("custom log receives ctx as second argument", async () => {
    const log = vi.fn();
    const app = createApp({ context: {} })
      .use(accessLog({ log }))
      .route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({ method: "GET", path: "/", requestId: "r-ctx" });
    expect(log.mock.calls[0]?.[1]).toMatchObject({ requestId: "r-ctx" });
  });

  it("does not mask handler errors when log sink throws", async () => {
    const app = createApp({ context: {} })
      .use(
        accessLog({
          log: () => {
            throw new Error("sink");
          },
        }),
      )
      .route({
        method: "GET",
        path: "/boom",
        handler: async () => {
          throw appError(ErrorCodes.NOT_FOUND, { detail: "missing" });
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/boom" });
    expect(res.status).toBe(404);
  });
});

