import { createApp } from "@zwents/core";
import { describe, expect, it } from "vitest";

describe("createApp routes listing", () => {
  it("exposes registered routes for tooling", () => {
    const app = createApp({ context: {} })
      .route({
        method: "GET",
        path: "/a",
        handler: async () => ({ a: 1 }),
      })
      .route({
        method: "POST",
        path: "/b",
        handler: async () => ({ b: 2 }),
      });

    expect(app.routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /a",
      "POST /b",
    ]);
  });

  it("rejects double start", async () => {
    const app = createApp({ context: {} });
    await app.start();
    await expect(app.start()).rejects.toMatchObject({ code: "ALREADY_STARTED" });
    await app.stop();
  });

  it("maps unknown errors to INTERNAL_ERROR", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/boom",
      handler: async () => {
        throw new Error("surprise");
      },
    });

    const res = await app.dispatch({ method: "GET", path: "/boom" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
