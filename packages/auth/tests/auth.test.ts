import { createApp, createRequestContext } from "@zwents/core";
import { describe, expect, it } from "vitest";
import { authorize, bearerAuth, requireAuth } from "../index.js";

describe("bearerAuth", () => {
  it("rejects missing bearer when required", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          verify: async () => ({ userId: "u1", roles: ["admin"] }),
        }),
      )
      .route({
        method: "GET",
        path: "/me",
        handler: async (ctx) => ({ userId: ctx.auth?.userId }),
      });

    const res = await app.dispatch({ method: "GET", path: "/me" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("sets ctx.auth when verify succeeds", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          verify: async (token) =>
            token === "good"
              ? { userId: "u1", roles: ["user"] }
              : null,
        }),
      )
      .route({
        method: "GET",
        path: "/me",
        handler: async (ctx) => ({
          userId: ctx.auth?.userId,
          roles: ctx.auth?.roles,
        }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/me",
      headers: new Headers({ authorization: "Bearer good" }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "u1", roles: ["user"] });
  });
});

describe("authorize", () => {
  it("returns 403 when roles are missing", async () => {
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        ctx.auth = { userId: "u1", roles: ["user"] };
        await next();
      })
      .use(authorize(["admin"]))
      .route({
        method: "GET",
        path: "/admin",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({ method: "GET", path: "/admin" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows when policy passes", async () => {
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        ctx.auth = { userId: "u1", roles: ["admin"] };
        await next();
      })
      .use(authorize(["admin"]))
      .route({
        method: "GET",
        path: "/admin",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({ method: "GET", path: "/admin" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("requireAuth", () => {
  it("blocks anonymous requests", async () => {
    const mw = requireAuth();
    let responded: unknown;
    const ctx = createRequestContext({
      services: {},
      method: "GET",
      path: "/x",
      respond: (r) => {
        responded = r;
      },
    });
    await mw(ctx, async () => undefined);
    expect(responded).toMatchObject({ status: 401 });
  });
});
