import { isAppError } from "@zwents/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  cursorPageQuery,
  decodeCursor,
  encodeCursor,
  offsetPageQuery,
} from "../index.js";

describe("pagination construction edges", () => {
  it("rejects invalid defaultOffset for offsetPageQuery", () => {
    expect(() => offsetPageQuery({ defaultOffset: -1 })).toThrow(/defaultOffset/);
  });

  it("rejects invalid cursorMaxLength for cursorPageQuery", () => {
    expect(() => cursorPageQuery({ cursorMaxLength: 0 })).toThrow(/cursorMaxLength/);
  });
});

describe("encodeCursor / decodeCursor edges", () => {
  const Cursor = z.object({ id: z.string() });

  it("rejects undefined payloads that stringify to undefined", () => {
    let caught: unknown;
    try {
      encodeCursor(undefined);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/not JSON-serializable/);
    expect(isAppError(caught)).toBe(false);
  });

  it("rejects invalid base64url decoding", () => {
    const fromSpy = vi.spyOn(Buffer, "from").mockImplementationOnce(() => {
      throw new Error("bad encoding");
    });
    expect(() => decodeCursor(Cursor, "ValidToken1")).toThrow(
      /Invalid cursor encoding/,
    );
    fromSpy.mockRestore();
  });

  it("rejects JSON that does not parse", () => {
    const token = Buffer.from("{not-json", "utf8").toString("base64url");
    expect(() => decodeCursor(Cursor, token)).toThrow(/Invalid cursor payload/);
  });
});
