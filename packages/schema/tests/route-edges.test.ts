import { createApp } from "@zwents/core";
import { route } from "@zwents/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("route() errors map", () => {
  it("stringifies numeric error status keys", () => {
    const Problem = z.object({
      code: z.string(),
      status: z.number(),
      title: z.string(),
      type: z.string(),
    });

    const statuses = new Map<number, z.ZodType>([[503, Problem]]);
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/err",
        errors: Object.fromEntries(statuses) as Record<number, typeof Problem>,
        handler: async () => ({ ok: true }),
      }),
    );

    expect(app.routes[0]?.meta?.errors?.["503"]).toBe(Problem);
  });
});
