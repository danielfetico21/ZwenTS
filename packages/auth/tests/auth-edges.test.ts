import { createApp, createRequestContext } from "@zwents/core";
import { describe, expect, it } from "vitest";
import {
  authorize,
  bearerAuth,
  getSecurityMeta,
  requireAuth,
  withSecurityMeta,
} from "../index.js";

async function noopHandler() {
  return undefined;
}

describe("bearerAuth edges", () => {
  it("allows missing token when required is false", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          required: false,
          verify: async () => ({ userId: "u1", roles: [] }),
        }),
      )
      .route({
        method: "GET",
        path: "/public",
        handler: async (ctx) => ({ auth: ctx.auth }),
      });

    const res = await app.dispatch({ method: "GET", path: "/public" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ auth: null });
  });

  it("rejects invalid token by default even when required is false", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          required: false,
          verify: async () => null,
        }),
      )
      .route({
        method: "GET",
        path: "/public",
        handler: async (ctx) => ({ auth: ctx.auth }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/public",
      headers: new Headers({ authorization: "Bearer bad" }),
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("ignores invalid tokens when invalidToken is ignore", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          required: false,
          invalidToken: "ignore",
          verify: async () => null,
        }),
      )
      .route({
        method: "GET",
        path: "/public",
        handler: async (ctx) => ({ auth: ctx.auth }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/public",
      headers: new Headers({ authorization: "Bearer bad" }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ auth: null });
  });

  it("accepts lowercase bearer scheme", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          verify: async () => ({ userId: "u1", roles: [] }),
        }),
      )
      .route({
        method: "GET",
        path: "/me",
        handler: async (ctx) => ({ userId: ctx.auth?.userId }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/me",
      headers: new Headers({ authorization: "bearer tok" }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "u1" });
  });

  it("rejects empty bearer token when required", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          verify: async () => ({ userId: "u1", roles: [] }),
        }),
      )
      .route({
        method: "GET",
        path: "/me",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/me",
      headers: new Headers({ authorization: "Bearer   " }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects wrong scheme prefix", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          verify: async () => ({ userId: "u1", roles: [] }),
        }),
      )
      .route({
        method: "GET",
        path: "/me",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/me",
      headers: new Headers({ authorization: "Basic abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects when verify returns null and required", async () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          verify: async () => null,
        }),
      )
      .route({
        method: "GET",
        path: "/me",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/me",
      headers: new Headers({ authorization: "Bearer tok" }),
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ detail: "Invalid credentials" });
  });

  it("honors custom header, scheme, securityName, and bearerFormat false", async () => {
    const mw = bearerAuth({
      header: "X-Api-Token",
      scheme: "Token",
      securityName: "apiToken",
      bearerFormat: false,
      verify: async (token) =>
        token === "abc" ? { userId: "u1", roles: [] } : null,
    });

    expect(getSecurityMeta(mw)).toEqual({
      schemes: {
        apiToken: { type: "http", scheme: "bearer" },
      },
      require: [{ apiToken: [] }],
    });

    const app = createApp({ context: {} })
      .use(mw)
      .route({
        method: "GET",
        path: "/me",
        handler: async (ctx) => ({ userId: ctx.auth?.userId }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/me",
      headers: new Headers({ "x-api-token": "Token abc" }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "u1" });
  });

  it("tags optional bearerAuth without require", () => {
    const mw = bearerAuth({
      required: false,
      verify: async () => null,
    });
    const meta = getSecurityMeta(mw);
    expect(meta?.schemes?.["bearerAuth"]).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    expect(meta?.require).toBeUndefined();
  });
});

describe("requireAuth edges", () => {
  it("calls next when auth is present", async () => {
    const mw = requireAuth({ securityName: "custom" });
    expect(getSecurityMeta(mw)).toEqual({
      require: [{ custom: [] }],
    });

    let nextCalled = false;
    const ctx = createRequestContext({
      services: {},
      method: "GET",
      path: "/x",
      auth: { userId: "u1", roles: [] },
    });
    await mw(ctx, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });
});

describe("authorize edges", () => {
  it("returns 401 when auth is missing", async () => {
    const app = createApp({ context: {} })
      .use(authorize(["admin"]))
      .route({
        method: "GET",
        path: "/admin",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({ method: "GET", path: "/admin" });
    expect(res.status).toBe(401);
  });

  it("returns false from role policy when auth is missing", async () => {
    // Role-array policy branch when ctx.auth is null (before authorize guard).
    const policyRoles = ["admin"] as const;
    const mw = authorize(policyRoles);
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

  it("allows custom policy function", async () => {
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        ctx.auth = { userId: "u1", roles: ["user"] };
        await next();
      })
      .use(authorize((ctx) => ctx.auth?.userId === "u1"))
      .route({
        method: "GET",
        path: "/ok",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({ method: "GET", path: "/ok" });
    expect(res.status).toBe(200);
  });

  it("forbids when custom policy returns false", async () => {
    const app = createApp({ context: {} })
      .use(async (ctx, next) => {
        ctx.auth = { userId: "u1", roles: ["user"] };
        await next();
      })
      .use(authorize(async () => false))
      .route({
        method: "GET",
        path: "/no",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({ method: "GET", path: "/no" });
    expect(res.status).toBe(403);
  });

  it("documents custom securityName on authorize", () => {
    const mw = authorize(["admin"], { securityName: "apiToken" });
    expect(getSecurityMeta(mw)).toEqual({
      require: [{ apiToken: [] }],
    });
  });
});

describe("security-meta", () => {
  it("returns undefined for non-functions", () => {
    expect(getSecurityMeta(null)).toBeUndefined();
    expect(getSecurityMeta({})).toBeUndefined();
    expect(getSecurityMeta("x")).toBeUndefined();
  });

  it("attaches and reads meta via withSecurityMeta", () => {
    const tagged = withSecurityMeta(noopHandler, {
      require: [{ bearerAuth: [] }],
    });
    expect(getSecurityMeta(tagged)).toEqual({
      require: [{ bearerAuth: [] }],
    });
  });
});
