import { createApp } from "@zwents/core";
import { describe, expect, it, vi } from "vitest";
import {
  createFetchHandler,
  createTimeoutSignal,
  readJsonBody,
  readTextLimited,
} from "../index.js";

function jsonRequest(
  body: string,
  init: {
    contentLength?: string | null;
    maxHeaderOnly?: boolean;
  } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.contentLength !== undefined && init.contentLength !== null) {
    headers.set("content-length", init.contentLength);
  }
  return new Request("http://127.0.0.1/echo", {
    method: "POST",
    headers,
    body,
  });
}

describe("readTextLimited / readJsonBody", () => {
  it("parses JSON under the limit", async () => {
    const body = await readJsonBody(jsonRequest('{"a":1}'), { maxBytes: 100 });
    expect(body).toEqual({ a: 1 });
  });

  it("rejects when Content-Length exceeds maxBytes without reading", async () => {
    const request = jsonRequest("{}", { contentLength: "999" });
    await expect(readJsonBody(request, { maxBytes: 10 })).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects when streamed bytes exceed maxBytes even if Content-Length is low", async () => {
    // Undici may overwrite Content-Length from the body; stream still enforces the cap.
    await expect(
      readTextLimited(
        new Request("http://x", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "y".repeat(40),
        }),
        10,
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("allows a body of exactly maxBytes", async () => {
    const text = "a".repeat(16);
    const got = await readTextLimited(
      new Request("http://x", { method: "POST", body: text }),
      16,
    );
    expect(got).toBe(text);
  });

  it("rejects maxBytes + 1", async () => {
    const text = "a".repeat(17);
    await expect(
      readTextLimited(
        new Request("http://x", { method: "POST", body: text }),
        16,
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("returns undefined for non-JSON content types", async () => {
    const request = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hi",
    });
    await expect(readJsonBody(request, { maxBytes: 100 })).resolves.toBe(
      undefined,
    );
  });

  it("maps invalid JSON to INVALID_JSON", async () => {
    await expect(
      readJsonBody(jsonRequest("{bad"), { maxBytes: 100 }),
    ).rejects.toMatchObject({ code: "INVALID_JSON", status: 400 });
  });

  it("aborts body read when signal aborts", async () => {
    const { signal, clear } = createTimeoutSignal(1);
    await new Promise((r) => setTimeout(r, 5));
    await expect(
      readTextLimited(
        new Request("http://x", { method: "POST", body: "hello" }),
        1000,
        signal,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    clear();
  });
});

describe("createTimeoutSignal", () => {
  it("rejects invalid timeout", () => {
    expect(() => createTimeoutSignal(-1)).toThrow(/requestTimeoutMs/);
  });

  it("aborts with REQUEST_TIMEOUT after timeoutMs", async () => {
    vi.useFakeTimers();
    const { signal, clear } = createTimeoutSignal(50);
    const aborted = new Promise<unknown>((resolve) => {
      signal.addEventListener("abort", () => resolve(signal.reason), {
        once: true,
      });
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(aborted).resolves.toMatchObject({
      code: "REQUEST_TIMEOUT",
      status: 408,
    });
    clear();
    vi.useRealTimers();
  });

  it("propagates parent abort", async () => {
    const parent = new AbortController();
    const { signal, clear } = createTimeoutSignal(60_000, parent.signal);
    parent.abort();
    expect(signal.aborted).toBe(true);
    clear();
  });
});

describe("createFetchHandler", () => {
  it("returns 413 for oversized JSON bodies", async () => {
    const app = createApp({ context: {} }).route({
      method: "POST",
      path: "/echo",
      handler: async (_ctx, input) =>
        (input as { body: unknown }).body ?? null,
    });
    const handler = createFetchHandler(app, {
      maxBodyBytes: 8,
      requestTimeoutMs: 0,
    });

    const res = await handler(
      new Request("http://127.0.0.1/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "too-large-payload" }),
      }),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("returns 408 when the handler exceeds requestTimeoutMs", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/slow",
      handler: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true };
      },
    });
    const handler = createFetchHandler(app, {
      requestTimeoutMs: 5,
      maxBodyBytes: Infinity,
    });

    const res = await handler(new Request("http://127.0.0.1/slow"));
    expect(res.status).toBe(408);
    expect(await res.json()).toMatchObject({ code: "REQUEST_TIMEOUT" });
  });

  it("does not emit unhandledRejection when timeout wins and work later rejects", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const app = createApp({ context: {} }).route({
        method: "GET",
        path: "/slow-throw",
        handler: async (ctx) => {
          await new Promise((r) => setTimeout(r, 40));
          if (ctx.signal.aborted) {
            throw ctx.signal.reason ?? new Error("aborted");
          }
          return { ok: true };
        },
      });
      const handler = createFetchHandler(app, {
        requestTimeoutMs: 5,
        maxBodyBytes: Infinity,
      });

      const res = await handler(new Request("http://127.0.0.1/slow-throw"));
      expect(res.status).toBe(408);
      // Allow orphaned work to settle.
      await new Promise((r) => setTimeout(r, 60));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("completes successfully under the timeout", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/fast",
      handler: async () => ({ ok: true }),
    });
    const handler = createFetchHandler(app, { requestTimeoutMs: 1_000 });
    const res = await handler(new Request("http://127.0.0.1/fast"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("disables timeout when requestTimeoutMs is 0", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/slow",
      handler: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true };
      },
    });
    const handler = createFetchHandler(app, { requestTimeoutMs: 0 });
    const res = await handler(new Request("http://127.0.0.1/slow"));
    expect(res.status).toBe(200);
  });

  it("passes abort signal into ctx for cooperative cancel", async () => {
    let sawAbort = false;
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/watch",
      handler: async (ctx) => {
        await new Promise<void>((resolve) => {
          if (ctx.signal.aborted) {
            sawAbort = true;
            resolve();
            return;
          }
          ctx.signal.addEventListener(
            "abort",
            () => {
              sawAbort = true;
              resolve();
            },
            { once: true },
          );
        });
        return { sawAbort };
      },
    });
    const handler = createFetchHandler(app, { requestTimeoutMs: 5 });
    const res = await handler(new Request("http://127.0.0.1/watch"));
    expect(res.status).toBe(408);
    expect(sawAbort).toBe(true);
  });
});
