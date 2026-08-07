import { AppError, createApp, err, ok } from "@zwents/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { route } from "../index.js";

describe("route() result and rawBody paths", () => {
  it("returns Err results without output validation", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/err",
        output: z.object({ ok: z.boolean() }),
        handler: async () =>
          err(new AppError("NOT_FOUND", 404, { detail: "missing" })),
      }),
    );

    const res = await app.dispatch({ method: "GET", path: "/err" });
    expect(res.status).toBe(404);
  });

  it("validates Ok result values against output schema", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/ok-result",
        output: z.object({ ok: z.literal(true) }),
        handler: async () => ok({ ok: true as const }),
      }),
    );

    const res = await app.dispatch({ method: "GET", path: "/ok-result" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("decodes utf8 rawBody from dispatch input", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/hook",
        rawBody: "utf8",
        handler: async (_ctx, input) => ({ raw: input.raw }),
      }),
    );

    const payload = new TextEncoder().encode('{"x":1}');
    const res = await app.dispatch({
      method: "POST",
      path: "/hook",
      input: { raw: payload },
    });
    expect(res.body).toEqual({ raw: '{"x":1}' });
  });

  it("fails closed when rawBody is set but raw bytes are missing", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/bin",
        rawBody: "bytes",
        handler: async (_ctx, input) => ({
          len: input.raw instanceof Uint8Array ? input.raw.byteLength : -1,
        }),
      }),
    );

    const res = await app.dispatch({ method: "POST", path: "/bin", input: {} });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      code: "INTERNAL_ERROR",
      extras: { location: "raw" },
    });
  });

  it("returns Ok results without an output schema", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/plain-ok",
        handler: async () => ok({ value: 1 }),
      }),
    );

    const res = await app.dispatch({ method: "GET", path: "/plain-ok" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ value: 1 });
  });
});
