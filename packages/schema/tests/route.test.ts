import { createApp } from "@zwents/core";
import { createRoute, route } from "@zwents/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("createRoute()", () => {
  it("pins services while keeping schema inference", async () => {
    type Services = { greet: (name: string) => string };
    const typedRoute = createRoute<Services>();
    const app = createApp({
      context: { greet: (name: string) => `hi ${name}` },
    }).route(
      typedRoute({
        method: "GET",
        path: "/hi/:name",
        params: z.object({ name: z.string() }),
        output: z.object({ message: z.string() }),
        handler: async (ctx, input) => ({
          message: ctx.services.greet(input.params.name),
        }),
      }),
    );

    const res = await app.dispatch({ method: "GET", path: "/hi/Ada" });
    expect(res.body).toEqual({ message: "hi Ada" });
  });
});

describe("route()", () => {
  it("validates params and types the handler input", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/users/:id",
        params: z.object({ id: z.uuid() }),
        output: z.object({ id: z.uuid() }),
        handler: async (_ctx, input) => ({ id: input.params.id }),
      }),
    );

    const id = "123e4567-e89b-12d3-a456-426614174000";
    const res = await app.dispatch({ method: "GET", path: `/users/${id}` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id });
  });

  it("returns VALIDATION_ERROR for invalid params", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/users/:id",
        params: z.object({ id: z.uuid() }),
        handler: async (_ctx, input) => input.params,
      }),
    );

    const res = await app.dispatch({ method: "GET", path: "/users/not-a-uuid" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "VALIDATION_ERROR",
      extras: { location: "params" },
    });
  });

  it("validates JSON body on POST", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/users",
        body: z.object({
          email: z.email(),
          name: z.string().min(1),
        }),
        output: z.object({ email: z.email(), name: z.string() }),
        handler: async (_ctx, input) => ({
          email: input.body.email,
          name: input.body.name,
        }),
      }),
    );

    const ok = await app.dispatch({
      method: "POST",
      path: "/users",
      input: { body: { email: "a@b.co", name: "Ada" } },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ email: "a@b.co", name: "Ada" });

    const bad = await app.dispatch({
      method: "POST",
      path: "/users",
      input: { body: { email: "nope", name: "" } },
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
