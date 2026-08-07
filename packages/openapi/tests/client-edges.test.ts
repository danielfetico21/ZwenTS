import { describe, expect, it } from "vitest";
import { generateFetchClient } from "../index.js";

function docWithPaths(
  paths: Record<string, unknown>,
  schemas: Record<string, Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    paths,
    components: { schemas },
  };
}

describe("generateFetchClient anonymous and unknown schemas", () => {
  it("emits anonymous object types for inline response schemas", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/inline": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { id: { type: "string" } },
                      required: ["id"],
                    },
                  },
                },
              },
            },
          },
        },
      }),
      { clientName: "InlineClient" },
    );

    expect(source).toContain("export type getInlineResponse");
    expect(source).toContain("id: string");
  });

  it("returns unknown for top-level broken component refs in schemaToTypeExpr", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/top-ref": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/MissingTop" },
                  },
                },
              },
            },
          },
        },
      }),
    );

    expect(source).toContain("Promise<unknown>");
  });

  it("returns unknown for broken nested component refs", () => {
    const source = generateFetchClient(
      docWithPaths(
        {
          "/nested-ref": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          child: { $ref: "#/components/schemas/Gone" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        { Present: { type: "string" } },
      ),
    );

    expect(source).toContain("child?: unknown");
  });

  it("emits nested $ref types when Note is listed before User", () => {
    const source = generateFetchClient(
      docWithPaths(
        {
          "/notes": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Note" },
                    },
                  },
                },
              },
            },
          },
        },
        {
          Note: {
            type: "object",
            properties: {
              author: { $ref: "#/components/schemas/User" },
            },
            required: ["author"],
          },
          User: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      ),
    );

    expect(source).toContain("export type Note");
    expect(source).toContain("export type User");
    expect(source).toContain("author: User");
    expect(source).toContain("Promise<Note>");
  });

  it("returns unknown for unrecognized schema shapes", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/mystery": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { notARealKeyword: true },
                  },
                },
              },
            },
          },
        },
      }),
    );

    expect(source).toContain("Promise<unknown>");
  });
});
