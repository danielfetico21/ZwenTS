import { createApp, json } from "@zwents/core";
import { describe, expect, it } from "vitest";
import { createFetchHandler } from "../index.js";

describe("createFetchHandler response shaping", () => {
  it("sets application/json when body is object and content-type is missing", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/obj",
      handler: async (ctx) => {
        ctx.respond({ status: 200, headers: {}, body: { ok: true } });
      },
    });
    const handler = createFetchHandler(app, { requestTimeoutMs: 0 });
    const res = await handler(new Request("http://127.0.0.1/obj"));
    expect(res.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
  });

  it("returns null body for 204 responses", async () => {
    const app = createApp({ context: {} }).route({
      method: "DELETE",
      path: "/gone",
      handler: async (ctx) => {
        ctx.respond(json(null, 204));
      },
    });
    const handler = createFetchHandler(app, { requestTimeoutMs: 0 });
    const res = await handler(new Request("http://127.0.0.1/gone", { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("passes string bodies through without JSON.stringify", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/text",
      handler: async (ctx) => {
        ctx.respond({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: "hello",
        });
      },
    });
    const handler = createFetchHandler(app, { requestTimeoutMs: 0 });
    const res = await handler(new Request("http://127.0.0.1/text"));
    expect(await res.text()).toBe("hello");
  });
});
