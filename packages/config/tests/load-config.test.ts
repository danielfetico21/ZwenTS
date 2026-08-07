import { AppError } from "@zwents/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "../index.js";

describe("loadConfig", () => {
  it("parses and coerces env values", () => {
    const config = loadConfig(
      z.object({
        PORT: z.coerce.number().int().positive(),
        NODE_ENV: z.enum(["development", "test", "production"]),
      }),
      { env: { PORT: "3000", NODE_ENV: "test" } },
    );

    expect(config).toEqual({ PORT: 3000, NODE_ENV: "test" });
  });

  it("throws CONFIG_ERROR with issues when invalid", () => {
    let caught: unknown;
    try {
      loadConfig(z.object({ DATABASE_URL: z.string().min(1) }), { env: {} });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({ code: "CONFIG_ERROR", status: 500 });
  });
});
