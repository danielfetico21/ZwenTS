import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  cursorPage,
  cursorPageQuery,
  cursorPageSchema,
  decodeCursor,
  encodeCursor,
  offsetPage,
  offsetPageQuery,
  offsetPageSchema,
  parseOrThrow,
  route,
} from "../index.js";
import { createApp } from "@zwents/core";

describe("offsetPageQuery", () => {
  const schema = offsetPageQuery({ defaultLimit: 10, maxLimit: 50 });

  it("applies defaults", () => {
    expect(parseOrThrow(schema, {}, "query")).toEqual({ limit: 10, offset: 0 });
  });

  it("coerces string query params", () => {
    expect(
      parseOrThrow(schema, { limit: "25", offset: "5" }, "query"),
    ).toEqual({
      limit: 25,
      offset: 5,
    });
  });

  it("rejects limit over max, zero, negative offset", () => {
    expect(() => parseOrThrow(schema, { limit: "51" }, "query")).toThrow(
      /Invalid query/,
    );
    expect(() => parseOrThrow(schema, { limit: "0" }, "query")).toThrow(
      /Invalid query/,
    );
    expect(() => parseOrThrow(schema, { offset: "-1" }, "query")).toThrow(
      /Invalid query/,
    );
  });

  it("rejects invalid construction bounds", () => {
    expect(() => offsetPageQuery({ defaultLimit: 0 })).toThrow(/defaultLimit/);
    expect(() =>
      offsetPageQuery({ defaultLimit: 20, maxLimit: 10 }),
    ).toThrow(/maxLimit/);
  });
});

describe("cursorPageQuery", () => {
  const schema = cursorPageQuery({ defaultLimit: 10, maxLimit: 50 });

  it("accepts optional cursor", () => {
    expect(parseOrThrow(schema, {}, "query")).toEqual({ limit: 10 });
    expect(
      parseOrThrow(schema, { limit: "10", cursor: "abc_DEF-123" }, "query"),
    ).toEqual({ limit: 10, cursor: "abc_DEF-123" });
  });

  it("rejects cursor with spaces / plus / slash", () => {
    expect(() => parseOrThrow(schema, { cursor: "a b" }, "query")).toThrow(
      /Invalid query/,
    );
    expect(() => parseOrThrow(schema, { cursor: "a+b" }, "query")).toThrow(
      /Invalid query/,
    );
    expect(() => parseOrThrow(schema, { cursor: "a/b" }, "query")).toThrow(
      /Invalid query/,
    );
  });
});

describe("encodeCursor / decodeCursor", () => {
  const Cursor = z.object({
    id: z.string().min(1),
    t: z.number().int(),
  });

  it("round-trips a payload", () => {
    const token = encodeCursor({ id: "u1", t: 42 });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(Cursor, token)).toEqual({ id: "u1", t: 42 });
  });

  it("rejects oversized encoded cursors as programmer Error (not AppError)", () => {
    let caught: unknown;
    try {
      encodeCursor({ blob: "x".repeat(2000) }, { maxLength: 32 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/Encoded cursor exceeds/);
    expect((caught as Error).name).not.toBe("AppError");
  });

  it("rejects invalid / injected cursor tokens", () => {
    expect(() => decodeCursor(Cursor, "")).toThrow(/Invalid cursor/);
    expect(() => decodeCursor(Cursor, "not-json-base64url$$$")).toThrow(
      /Invalid cursor/,
    );
    expect(() => decodeCursor(Cursor, "evil\n")).toThrow(/Invalid cursor/);
    expect(() => decodeCursor(Cursor, "evil\r\n")).toThrow(/Invalid cursor/);
    expect(() => decodeCursor(Cursor, encodeCursor({ id: "x" }))).toThrow(
      /Invalid cursor payload/,
    );
  });

  it("rejects non-serializable payloads", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => encodeCursor(cyclic)).toThrow(/not JSON-serializable/);
  });
});

describe("offsetPage / cursorPage builders", () => {
  it("computes hasMore from total", () => {
    expect(
      offsetPage({
        items: [1, 2],
        limit: 2,
        offset: 0,
        total: 5,
      }),
    ).toEqual({
      items: [1, 2],
      limit: 2,
      offset: 0,
      total: 5,
      hasMore: true,
    });

    expect(
      offsetPage({
        items: [1],
        limit: 2,
        offset: 4,
        total: 5,
      }).hasMore,
    ).toBe(false);
  });

  it("without total, hasMore when page is full", () => {
    expect(offsetPage({ items: [1, 2], limit: 2, offset: 0 }).hasMore).toBe(
      true,
    );
    expect(offsetPage({ items: [1], limit: 2, offset: 0 }).hasMore).toBe(false);
  });

  it("cursorPage defaults hasMore from nextCursor", () => {
    expect(
      cursorPage({
        items: [{ id: 1 }],
        limit: 1,
        nextCursor: "abc",
      }),
    ).toEqual({
      items: [{ id: 1 }],
      limit: 1,
      nextCursor: "abc",
      prevCursor: null,
      hasMore: true,
    });

    expect(cursorPage({ items: [], limit: 10 }).hasMore).toBe(false);
  });

  it("does not mutate the input items array", () => {
    const items = [1, 2];
    const page = offsetPage({ items, limit: 2, offset: 0 });
    page.items.push(3);
    expect(items).toEqual([1, 2]);
  });
});

describe("page schemas + route integration", () => {
  it("validates offset page output", () => {
    const Item = z.object({ id: z.string() });
    const output = offsetPageSchema(Item);
    const page = offsetPage({
      items: [{ id: "a" }],
      limit: 10,
      offset: 0,
      total: 1,
    });
    expect(parseOrThrow(output, page, "output")).toEqual(page);
  });

  it("works end-to-end on a list route", async () => {
    const Item = z.object({ id: z.string() });
    const all = Array.from({ length: 5 }, (_, i) => ({ id: `i${i}` }));

    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/items",
        query: offsetPageQuery({ defaultLimit: 2, maxLimit: 10 }),
        output: offsetPageSchema(Item),
        handler: async (_ctx, input) => {
          const { limit, offset } = input.query;
          const slice = all.slice(offset, offset + limit);
          return offsetPage({
            items: slice,
            limit,
            offset,
            total: all.length,
          });
        },
      }),
    );

    const res = await app.dispatch({
      method: "GET",
      path: "/items",
      input: { query: { limit: "2", offset: "2" } },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [{ id: "i2" }, { id: "i3" }],
      limit: 2,
      offset: 2,
      total: 5,
      hasMore: true,
    });
  });

  it("cursor route rejects bad cursor via query schema", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/feed",
        query: cursorPageQuery(),
        output: cursorPageSchema(z.object({ id: z.string() })),
        handler: async () =>
          cursorPage({ items: [], limit: 20, nextCursor: null }),
      }),
    );

    const res = await app.dispatch({
      method: "GET",
      path: "/feed",
      input: { query: { cursor: "not valid" } },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
