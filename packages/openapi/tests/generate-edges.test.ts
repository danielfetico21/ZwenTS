import { createApp } from "@zwents/core";
import { route } from "@zwents/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateOpenApi, stringifyOpenApi } from "../index.js";

describe("generateOpenApi edges", () => {
  it("rewrites params/query $defs refs onto components.schemas", () => {
    const NoteId = z.string().uuid().meta({ id: "NoteId" });
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/notes/:id",
        params: z.object({ id: NoteId }),
        query: z.object({ cursor: NoteId.optional() }),
        output: z.object({ id: NoteId }),
        handler: async (_ctx, input) => ({ id: input.params.id }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Params", version: "0.0.0" },
    });
    const op = (doc["paths"] as Record<string, Record<string, unknown>>)[
      "/notes/{id}"
    ]?.["get"] as {
      parameters: Array<{ name: string; schema: Record<string, unknown> }>;
    };
    const idParam = op.parameters.find((p) => p.name === "id");
    const cursorParam = op.parameters.find((p) => p.name === "cursor");
    expect(idParam?.schema).toEqual({ $ref: "#/components/schemas/NoteId" });
    expect(cursorParam?.schema).toEqual({ $ref: "#/components/schemas/NoteId" });
    expect(JSON.stringify(op.parameters)).not.toContain("#/$defs/");
    const schemas = (doc["components"] as { schemas: Record<string, unknown> })
      .schemas;
    expect(schemas["NoteId"]).toBeTruthy();
  });

  it("inlines params $defs when schemaRefs is false", () => {
    const NoteId = z.string().uuid().meta({ id: "NoteIdInline" });
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/notes/:id",
        params: z.object({ id: NoteId }),
        output: z.object({ id: z.string() }),
        handler: async (_ctx, input) => ({ id: input.params.id }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Inline", version: "0.0.0" },
      schemaRefs: false,
    });
    const op = (doc["paths"] as Record<string, Record<string, unknown>>)[
      "/notes/{id}"
    ]?.["get"] as {
      parameters: Array<{ name: string; schema: Record<string, unknown> }>;
    };
    const idParam = op.parameters.find((p) => p.name === "id");
    expect(JSON.stringify(idParam)).not.toContain("#/$defs/");
    expect(idParam?.schema["$ref"]).toBeUndefined();
    expect(idParam?.schema["type"]).toBe("string");
  });

  it("rewrites $defs component refs onto components.schemas", () => {
    const Inner = z.object({ id: z.string() }).meta({ id: "InnerDef" });
    const Outer = z.object({ inner: Inner }).meta({ id: "OuterDef" });

    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/nested",
        output: Outer,
        handler: async () => ({ inner: { id: "1" } }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Nested", version: "0.0.0" },
    });
    const schemas = (doc["components"] as { schemas: Record<string, unknown> })
      .schemas;
    expect(schemas["OuterDef"]).toBeTruthy();
    expect(schemas["InnerDef"]).toBeTruthy();
    expect(JSON.stringify(schemas)).not.toContain("#/$defs/");
  });

  it("deduplicates component schema names when error hints collide", () => {
    const E400 = z.object({ code: z.literal("400") });
    const E404 = z.object({ code: z.literal("404") });

    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/err",
        output: z.object({ ok: z.boolean() }),
        errors: {
          400: E400,
          404: E404,
        },
        handler: async () => ({ ok: true }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Dupes", version: "0.0.0" },
    });
    const schemas = (doc["components"] as { schemas: Record<string, unknown> })
      .schemas;
    expect(schemas["Problem"]).toBeTruthy();
    expect(schemas["Problem2"]).toBeTruthy();
  });

  it("emits description-only error responses when schema is not Zod", () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/fail",
      handler: async () => ({ ok: true }),
      meta: {
        errors: {
          500: { not: "zod" },
        },
      },
    });

    const doc = generateOpenApi(app, {
      info: { title: "Errors", version: "0.0.0" },
    });
    const op = (doc["paths"] as Record<string, Record<string, unknown>>)[
      "/fail"
    ]?.["get"] as { responses: Record<string, unknown> };
    expect(op.responses["500"]).toEqual({ description: "Error 500" });
  });

  it("includes global security requirements when configured", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Sec", version: "0.0.0" },
      securitySchemes: {
        apiKey: { type: "apiKey", name: "x-key", in: "header" },
      },
      security: [{ apiKey: [] }],
    });

    expect(doc["security"]).toEqual([{ apiKey: [] }]);
  });
});

describe("stringifyOpenApi", () => {
  it("pretty-prints JSON with a trailing newline", () => {
    const text = stringifyOpenApi({ openapi: "3.1.0", info: { title: "T", version: "1" } }, 2);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('"openapi": "3.1.0"');
  });
});
