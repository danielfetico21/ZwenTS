import { createApp } from "@zwents/core";
import { listen } from "../index.js";
import { route } from "@zwents/schema";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

const handles: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (handles.length > 0) {
    const handle = handles.pop();
    await handle?.close();
  }
});

describe("listen()", () => {
  it("serves a validated route over HTTP", async () => {
    const app = createApp({
      context: { greet: (name: string) => `hello ${name}` },
    }).route(
      route({
        method: "GET",
        path: "/hello/:name",
        params: z.object({ name: z.string().min(1) }),
        query: z.object({ shout: z.enum(["true", "false"]).optional() }),
        output: z.object({ message: z.string() }),
        handler: async (ctx, input) => {
          const message = ctx.services.greet(input.params.name);
          return {
            message:
              input.query?.shout === "true" ? message.toUpperCase() : message,
          };
        },
      }),
    );

    const handle = await listen(app, { port: 0, host: "127.0.0.1" });
    handles.push(handle);

    const res = await fetch(
      `http://127.0.0.1:${handle.port}/hello/zwents?shout=true`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "HELLO ZWENTS" });
  });

  it("returns 400 for invalid JSON bodies", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/echo",
        body: z.object({ value: z.string() }),
        handler: async (_ctx, input) => input.body,
      }),
    );

    const handle = await listen(app, { port: 0, host: "127.0.0.1" });
    handles.push(handle);

    const res = await fetch(`http://127.0.0.1:${handle.port}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_JSON" });
  });
});
