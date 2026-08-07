import { createApp } from "@zwents/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { route } from "../index.js";

describe("route() edge cases", () => {
  it("validates query strings", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/search",
        query: z.object({ q: z.string().min(1) }),
        handler: async (_ctx, input) => ({ q: input.query.q }),
      }),
    );

    const bad = await app.dispatch({
      method: "GET",
      path: "/search",
      input: { query: { q: "" } },
    });
    expect(bad.status).toBe(400);

    const ok = await app.dispatch({
      method: "GET",
      path: "/search",
      input: { query: { q: "zwents" } },
    });
    expect(ok.body).toEqual({ q: "zwents" });
  });

  it("fails when handler output does not match output schema", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/bad-output",
        output: z.object({ ok: z.literal(true) }),
        handler: async () => ({ ok: false as unknown as true }),
      }),
    );

    const res = await app.dispatch({ method: "GET", path: "/bad-output" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      code: "INTERNAL_ERROR",
      extras: { location: "output" },
    });
  });

  it("attaches schema meta for OpenAPI consumers", () => {
    const def = route({
      method: "GET",
      path: "/x",
      tags: ["demo"],
      params: z.object({ id: z.string() }),
      handler: async () => null,
    });

    expect(def.meta?.tags).toEqual(["demo"]);
    expect(def.meta?.schemas?.params).toBeTruthy();
  });
});
