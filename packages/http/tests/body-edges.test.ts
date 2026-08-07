import { ErrorCodes, appError } from "@zwents/core";
import { describe, expect, it } from "vitest";
import {
  parseRequestBody,
  readBytesLimited,
  readJsonBody,
  readMultipartBody,
  readRawBody,
} from "../index.js";

describe("readBytesLimited edges", () => {
  it("rethrows AppError when signal.reason is AppError", async () => {
    const ac = new AbortController();
    ac.abort(appError(ErrorCodes.REQUEST_TIMEOUT, { detail: "gone" }));
    await expect(
      readBytesLimited(
        new Request("http://x", { method: "POST", body: "x" }),
        100,
        ac.signal,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT", detail: "gone" });
  });

  it("rejects invalid maxBytes at construction", async () => {
    await expect(
      readBytesLimited(new Request("http://x", { method: "POST", body: "x" }), -1),
    ).rejects.toThrow(/maxBytes must be a number/);
  });

  it("rejects positive Content-Length when maxBytes is zero", async () => {
    await expect(
      readBytesLimited(
        new Request("http://x", {
          method: "POST",
          headers: { "content-length": "5" },
          body: "hello",
        }),
        0,
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects when signal aborts inside the read race before listen", async () => {
    let aborted = false;
    const signal = {
      get aborted() {
        return aborted;
      },
      reason: undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as AbortSignal;

    const pending = readBytesLimited(
      new Request("http://x", {
        method: "POST",
        // @ts-expect-error Node fetch requires duplex for streaming request bodies
        duplex: "half",
        body: new ReadableStream({
          pull(controller) {
            aborted = true;
            controller.enqueue(new Uint8Array([1]));
          },
        }),
      }),
      100,
      signal,
    );

    await expect(pending).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });

  it("aborts mid-stream when signal fires during read", async () => {
    const ac = new AbortController();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array([97]));
        if (pulls === 1) ac.abort();
      },
    });
    const request = new Request("http://x", {
      method: "POST",
      // @ts-expect-error Node fetch requires duplex for streaming request bodies
      duplex: "half",
      body: stream,
    });

    await expect(readBytesLimited(request, 100, ac.signal)).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });

  it("rejects when signal is already aborted before the read race starts", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      readBytesLimited(
        new Request("http://x", { method: "POST", body: "hello" }),
        100,
        ac.signal,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });
});

describe("readJsonBody / readRawBody / readMultipartBody GET shortcuts", () => {
  it("returns undefined from readJsonBody on GET", async () => {
    await expect(
      readJsonBody(new Request("http://x", { method: "GET" })),
    ).resolves.toBeUndefined();
  });

  it("returns empty bytes from readRawBody on HEAD", async () => {
    const raw = await readRawBody(new Request("http://x", { method: "HEAD" }));
    expect(raw.byteLength).toBe(0);
  });

  it("returns empty multipart payload on GET", async () => {
    await expect(readMultipartBody(new Request("http://x", { method: "GET" }))).resolves.toEqual({
      body: {},
      files: [],
    });
  });
});

describe("readMultipartBody edges", () => {
  it("rejects invalid multipart bodies", async () => {
    await expect(
      readMultipartBody(
        new Request("http://x", {
          method: "POST",
          headers: {
            "content-type":
              'multipart/form-data; boundary="----bound"',
          },
          body: "not valid multipart",
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", detail: "Invalid multipart body" });
  });

  it("rejects too many non-file fields", async () => {
    const form = new FormData();
    form.set("a", "1");
    form.set("b", "2");
    await expect(
      readMultipartBody(
        new Request("http://x", { method: "POST", body: form }),
        { maxFields: 1 },
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});

describe("parseRequestBody edges", () => {
  it("returns empty parsed body when content-length is zero and type is missing", async () => {
    await expect(
      parseRequestBody(
        new Request("http://x", {
          method: "POST",
          headers: { "content-length": "0" },
        }),
      ),
    ).resolves.toEqual({});
  });
});
