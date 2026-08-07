import { describe, expect, it } from "vitest";
import { createApp } from "@zwents/core";
import { createFetchHandler, parseSearchParams } from "../index.js";

describe("parseSearchParams", () => {
  it("keeps single values as strings", () => {
    const params = new URLSearchParams("q=hello&limit=10");
    expect(parseSearchParams(params)).toEqual({ q: "hello", limit: "10" });
  });

  it("collects repeated keys as string arrays", () => {
    const params = new URLSearchParams("tag=a&tag=b&tag=c&solo=1");
    expect(parseSearchParams(params)).toEqual({
      tag: ["a", "b", "c"],
      solo: "1",
    });
  });
});

describe("createFetchHandler query parsing", () => {
  it("passes multi-value query keys to dispatch as arrays", async () => {
    let seen: unknown;
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/search",
      handler: async (_ctx, input) => {
        seen = (input as { query?: unknown }).query;
        return { ok: true };
      },
    });

    const handler = createFetchHandler(app, { requestTimeoutMs: 0 });
    const res = await handler(
      new Request("http://127.0.0.1/search?tag=a&tag=b"),
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual({ tag: ["a", "b"] });
  });
});
