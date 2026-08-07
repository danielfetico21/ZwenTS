import { createApp } from "@zwents/core";
import { route } from "@zwents/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createFetchHandler,
  parseRequestBody,
  readMultipartBody,
  readRawBody,
} from "../index.js";

function jsonRequest(body: string): Request {
  return new Request("http://127.0.0.1/hook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("raw body", () => {
  it("preserves exact JSON bytes on parseRequestBody", async () => {
    const payload = '{"id":1,"ok":true}';
    const parsed = await parseRequestBody(jsonRequest(payload));
    expect(parsed.body).toEqual({ id: 1, ok: true });
    expect(new TextDecoder().decode(parsed.raw!)).toBe(payload);
  });

  it("reads non-JSON bodies as raw bytes", async () => {
    const raw = await readRawBody(
      new Request("http://x", {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
      { maxBytes: 100 },
    );
    expect([...raw]).toEqual([1, 2, 3, 4]);
  });

  it("exposes utf8 rawBody to webhook handlers", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/webhooks/stripe",
        rawBody: "utf8",
        output: z.object({ ok: z.literal(true), len: z.number() }),
        handler: async (_ctx, input) => {
          expect(typeof input.raw).toBe("string");
          expect(input.raw).toBe('{"type":"ping"}');
          return { ok: true as const, len: input.raw.length };
        },
      }),
    );

    const handler = createFetchHandler(app, { requestTimeoutMs: 0 });
    const res = await handler(
      new Request("http://127.0.0.1/webhooks/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"type":"ping"}',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, len: 15 });
  });

  it("exposes bytes rawBody", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/bin",
        rawBody: "bytes",
        output: z.object({ n: z.number() }),
        handler: async (_ctx, input) => ({ n: input.raw.byteLength }),
      }),
    );
    const handler = createFetchHandler(app, { requestTimeoutMs: 0 });
    const res = await handler(
      new Request("http://127.0.0.1/bin", {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array([9, 8, 7]),
      }),
    );
    expect(await res.json()).toEqual({ n: 3 });
  });
});

function multipartRequest(parts: {
  fields?: Record<string, string>;
  files?: Array<{ field: string; name: string; type: string; data: string }>;
}): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(parts.fields ?? {})) {
    form.set(k, v);
  }
  for (const file of parts.files ?? []) {
    form.set(file.field, new File([file.data], file.name, { type: file.type }));
  }
  return new Request("http://127.0.0.1/upload", {
    method: "POST",
    body: form,
  });
}

describe("multipart", () => {
  it("parses fields and files", async () => {
    const parsed = await readMultipartBody(
      multipartRequest({
        fields: { title: "doc" },
        files: [
          {
            field: "file",
            name: "a.txt",
            type: "text/plain",
            data: "hello",
          },
        ],
      }),
    );
    expect(parsed.body).toEqual({ title: "doc" });
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]?.filename).toBe("a.txt");
    expect(new TextDecoder().decode(parsed.files[0]!.bytes)).toBe("hello");
  });

  it("rejects oversized text fields by maxFieldBytes", async () => {
    await expect(
      readMultipartBody(
        multipartRequest({
          fields: { title: "x".repeat(100) },
        }),
        { maxFieldBytes: 10 },
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects streamed multipart that exceeds maxBytes without Content-Length", async () => {
    const boundary = "----zwenbound";
    const payload =
      `--${boundary}\r\nContent-Disposition: form-data; name="f"\r\n\r\n` +
      `${"x".repeat(200)}\r\n--${boundary}--\r\n`;
    const request = new Request("http://127.0.0.1/upload", {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: payload,
    });

    await expect(
      readMultipartBody(request, { maxBytes: 50 }),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects oversized files", async () => {
    await expect(
      readMultipartBody(
        multipartRequest({
          files: [
            {
              field: "file",
              name: "big.bin",
              type: "application/octet-stream",
              data: "x".repeat(100),
            },
          ],
        }),
        { maxFileBytes: 10 },
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects too many files", async () => {
    await expect(
      readMultipartBody(
        multipartRequest({
          files: [
            { field: "a", name: "1.txt", type: "text/plain", data: "1" },
            { field: "b", name: "2.txt", type: "text/plain", data: "2" },
            { field: "c", name: "3.txt", type: "text/plain", data: "3" },
          ],
        }),
        { maxFiles: 2 },
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("serves multipart through createFetchHandler + route body schema", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/upload",
        body: z.object({ title: z.string().min(1) }),
        output: z.object({
          title: z.string(),
          files: z.number(),
          bytes: z.number(),
        }),
        handler: async (_ctx, input) => ({
          title: input.body.title,
          files: input.files.length,
          bytes: input.files[0]?.size ?? 0,
        }),
      }),
    );

    const handler = createFetchHandler(app, { requestTimeoutMs: 0 });
    const res = await handler(
      multipartRequest({
        fields: { title: "report" },
        files: [
          {
            field: "file",
            name: "r.txt",
            type: "text/plain",
            data: "abc",
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      title: "report",
      files: 1,
      bytes: 3,
    });
  });

  it("rejects non-multipart content type for readMultipartBody", async () => {
    await expect(
      readMultipartBody(
        new Request("http://x", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
