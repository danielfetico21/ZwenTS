import { describe, expect, it, vi } from "vitest";
import { createApp } from "@zwents/core";
import {
  createFetchHandler,
  encodeSseEvent,
  sseResponse,
  toWebResponse,
} from "../index.js";

describe("SSE", () => {
  it("encodeSseEvent formats fields", () => {
    expect(
      encodeSseEvent({
        event: "tick",
        id: "1",
        retry: 3_000,
        data: "a\nb",
      }),
    ).toBe("event: tick\nid: 1\nretry: 3000\ndata: a\ndata: b\n\n");
  });

  it("encodeSseEvent emits data-only when optional fields omitted", () => {
    expect(encodeSseEvent({ data: "hi" })).toBe("data: hi\n\n");
  });

  it("encodeSseEvent handles empty data", () => {
    expect(encodeSseEvent({ data: "" })).toBe("data: \n\n");
  });

  it("encodeSseEvent normalizes CR in data lines", () => {
    expect(encodeSseEvent({ data: "a\r\nb\rc" })).toBe(
      "data: a\ndata: b\ndata: c\n\n",
    );
  });

  it("encodeSseEvent rejects CR/LF/NUL in event and id", () => {
    expect(() => encodeSseEvent({ data: "x", event: "bad\nevent" })).toThrow(
      /event/,
    );
    expect(() => encodeSseEvent({ data: "x", id: "1\r2" })).toThrow(/id/);
    expect(() => encodeSseEvent({ data: "x", id: "a\0b" })).toThrow(/id/);
  });

  it("encodeSseEvent rejects invalid retry", () => {
    expect(() => encodeSseEvent({ data: "x", retry: Number.NaN })).toThrow(
      /retry/,
    );
    expect(() => encodeSseEvent({ data: "x", retry: -1 })).toThrow(/retry/);
  });

  it("serves an async iterable as text/event-stream", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/events",
      handler: async (ctx) => {
        ctx.respond(
          sseResponse(
            (async function* () {
              yield { data: "one", event: "msg" };
              yield { data: "two" };
            })(),
          ),
        );
      },
    });

    const handle = createFetchHandler(app);
    const res = await handle(new Request("http://localhost/events"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
    const text = await res.text();
    expect(text).toContain("event: msg\ndata: one\n");
    expect(text).toContain("data: two\n");
  });

  it("sseResponse applies custom status and merges headers", async () => {
    const res = toWebResponse(
      sseResponse(
        (async function* () {
          yield { data: "x" };
        })(),
        { status: 202, headers: { "x-custom": "1" } },
      ),
    );
    expect(res.status).toBe(202);
    expect(res.headers.get("x-custom")).toBe("1");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("sseResponse passes through ReadableStream source", async () => {
    const bytes = new TextEncoder().encode("data: raw\n\n");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const res = toWebResponse(sseResponse(stream));
    expect(await res.text()).toBe("data: raw\n\n");
  });

  it("cancel stops the async iterable via return()", async () => {
    const returned = vi.fn<() => void>();
    const source: AsyncIterable<{ data: string }> = {
      [Symbol.asyncIterator]() {
        let n = 0;
        return {
          async next() {
            if (n >= 1) {
              await new Promise(() => undefined);
            }
            n += 1;
            return { done: false, value: { data: String(n) } };
          },
          async return() {
            returned();
            return { done: true, value: undefined };
          },
        };
      },
    };

    const body = sseResponse(source).body as ReadableStream<Uint8Array>;
    const reader = body.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    await reader.cancel();
    expect(returned).toHaveBeenCalledOnce();
  });

  it("sseResponse errors the stream when the iterable throws", async () => {
    const body = sseResponse(
      (async function* () {
        yield { data: "one" };
        throw new Error("boom");
      })(),
    ).body as ReadableStream<Uint8Array>;

    const reader = body.getReader();
    await reader.read();
    await expect(reader.read()).rejects.toThrow("boom");
  });

  it("toWebResponse does not JSON-stringify ReadableStream bodies", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("plain"));
        controller.close();
      },
    });
    const res = toWebResponse({
      status: 200,
      headers: { "content-type": "text/plain" },
      body: stream,
    });
    expect(await res.text()).toBe("plain");
  });
});
