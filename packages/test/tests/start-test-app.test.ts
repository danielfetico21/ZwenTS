import { route } from "@zwents/schema";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { startTestApp, type TestApp } from "../index.js";

const apps: TestApp<unknown>[] = [];

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()?.close();
  }
});

describe("startTestApp", () => {
  it("hits registered routes over HTTP", async () => {
    const testApp = await startTestApp({ context: { n: 1 } }, (app) => {
      app.route(
        route({
          method: "GET",
          path: "/n",
          output: z.object({ n: z.number() }),
          handler: async (ctx) => ({ n: ctx.services.n }),
        }),
      );
    });
    apps.push(testApp as TestApp<unknown>);

    const res = await testApp.request("/n");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 1 });
  });

  it("exposes text() on the response helper", async () => {
    const testApp = await startTestApp({ context: {} }, (app) => {
      app.route({
        method: "GET",
        path: "/plain",
        handler: async (ctx) => {
          ctx.respond({
            status: 200,
            headers: { "content-type": "text/plain" },
            body: "hello",
          });
        },
      });
    });
    apps.push(testApp as TestApp<unknown>);

    const res = await testApp.request("/plain");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });
});
