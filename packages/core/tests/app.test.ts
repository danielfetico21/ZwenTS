import { describe, expect, it } from "vitest";
import {
  AppError,
  createApp,
  json,
  type Middleware,
} from "../index.js";

type Services = {
  ping: () => string;
};

describe("createApp", () => {
  it("runs app middleware then route middleware then handler, in order", async () => {
    const order: string[] = [];
    const appMw: Middleware<Services> = async (_ctx, next) => {
      order.push("app");
      await next();
    };
    const routeMw: Middleware<Services> = async (_ctx, next) => {
      order.push("route");
      await next();
    };

    const app = createApp({
      context: { ping: () => "pong" },
    })
      .use(appMw)
      .route({
        method: "GET",
        path: "/ping",
        middleware: [routeMw],
        handler: async (ctx) => {
          order.push("handler");
          return { value: ctx.services.ping() };
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/ping" });

    expect(order).toEqual(["app", "route", "handler"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ value: "pong" });
  });

  it("lets middleware short-circuit without calling the handler", async () => {
    let handlerCalled = false;
    const app = createApp({ context: {} })
      .use(async (ctx, _next) => {
        ctx.respond(json({ denied: true }, 401));
      })
      .route({
        method: "GET",
        path: "/secret",
        handler: async () => {
          handlerCalled = true;
          return { ok: true };
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/secret" });

    expect(handlerCalled).toBe(false);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ denied: true });
  });

  it("maps AppError via the default error handler", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/users/:id",
      handler: async (_ctx, input) => {
        const params = (input as { params: { id: string } }).params;
        throw new AppError("USER_NOT_FOUND", 404, {
          detail: `User ${params.id} missing`,
        });
      },
    });

    const res = await app.dispatch({ method: "GET", path: "/users/42" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: "USER_NOT_FOUND",
      status: 404,
      detail: "User 42 missing",
    });
  });

  it("returns 404 Problem Details when no route matches", async () => {
    const app = createApp({ context: {} });
    const res = await app.dispatch({ method: "GET", path: "/missing" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
  });

  it("runs start hooks in order and stop hooks in reverse", async () => {
    const order: string[] = [];
    const app = createApp({ context: {} })
      .onStart(() => {
        order.push("start-a");
      })
      .onStart(() => {
        order.push("start-b");
      })
      .onStop(() => {
        order.push("stop-a");
      })
      .onStop(() => {
        order.push("stop-b");
      });

    await app.start();
    expect(app.started).toBe(true);
    await app.stop();
    expect(app.started).toBe(false);
    expect(order).toEqual(["start-a", "start-b", "stop-b", "stop-a"]);
  });
});
