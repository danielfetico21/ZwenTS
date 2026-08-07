import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatZodIssues } from "../index.js";

describe("formatZodIssues", () => {
  it("maps path, message, and code", () => {
    const result = z.object({ name: z.string().min(1) }).safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatZodIssues(result.error)).toEqual([
      expect.objectContaining({
        path: "name",
        message: expect.any(String),
        code: expect.any(String),
      }),
    ]);
  });

  it("uses rootPath when issue path is empty", () => {
    const result = z.string().safeParse(1);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatZodIssues(result.error, { rootPath: "(root)" })[0]?.path).toBe(
      "(root)",
    );
  });
});
