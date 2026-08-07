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

describe("generateFetchClient schema edges", () => {
  it("types enums, null, arrays, and empty objects", () => {
    const source = generateFetchClient(
      docWithPaths(
        {
          "/meta": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Meta" },
                    },
                  },
                },
              },
            },
          },
        },
        {
          Meta: {
            type: "object",
            properties: {
              mode: { enum: ["a", "b", 1] },
              empty: { type: "object", properties: {} },
              tags: { type: "array", items: { type: "string" } },
              note: { type: "null" },
            },
            required: ["mode"],
          },
        },
      ),
      { clientName: "MetaClient" },
    );

    expect(source).toContain('"a" | "b" | 1');
    expect(source).toContain("Record<string, unknown>");
    expect(source).toContain("Array<string>");
    expect(source).toContain("null");
  });

  it("types anyOf, oneOf, and allOf on inline response schemas", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/union": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      anyOf: [{ type: "string" }, { type: "number" }],
                    },
                  },
                },
              },
            },
          },
        },
        "/one": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      oneOf: [{ type: "boolean" }, { type: "null" }],
                    },
                  },
                },
              },
            },
          },
        },
        "/all": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      allOf: [
                        { type: "object", properties: { id: { type: "string" } } },
                        { type: "object", properties: { n: { type: "number" } } },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );

    expect(source).toContain("string | number");
    expect(source).toContain("boolean | null");
    expect(source).toContain(" & ");
  });

  it("quotes unsafe property keys on object schemas", () => {
    const source = generateFetchClient(
      docWithPaths(
        {
          "/weird": {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Weird" },
                  },
                },
              },
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
        {
          Weird: {
            type: "object",
            properties: {
              "weird-key": { type: "string" },
            },
          },
        },
      ),
    );

    expect(source).toContain('"weird-key"');
  });

  it("uses operationId when present and omits body on GET", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/items/{id}": {
          get: {
            operationId: "fetchItem",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "string" },
                  },
                },
              },
            },
          },
        },
      }),
      { clientName: "ItemsClient" },
    );

    expect(source).toContain("async fetchItem(");
    expect(source).toContain("params: { id: string }");
    expect(source).not.toContain("JSON.stringify(body)");
  });

  it("spreads init before method/body and uses Headers for content-type", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/items": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { n: { type: "number" } } },
                },
              },
            },
            responses: {
              "200": {
                content: {
                  "application/json": { schema: { type: "object" } },
                },
              },
            },
          },
        },
      }),
    );

    expect(source).toContain("const headers = new Headers(init?.headers);");
    expect(source).toContain('headers.set("content-type", "application/json");');
    expect(source).toContain("...init");
    expect(source).toContain('method: "POST"');
    expect(source).toContain("body: JSON.stringify(body)");
    // init must not win over generated method/body (spread comes first).
    const fetchCall = source.slice(source.indexOf("this.fetch(url"));
    expect(fetchCall.indexOf("...init")).toBeLessThan(fetchCall.indexOf('method: "POST"'));
    expect(fetchCall.indexOf("...init")).toBeLessThan(
      fetchCall.indexOf("body: JSON.stringify(body)"),
    );
  });

  it("sanitizes hostile operationId and schema names", () => {
    const source = generateFetchClient({
      openapi: "3.1.0",
      info: { title: "t", version: "0" },
      paths: {
        "/x": {
          get: {
            operationId: "fetch(){return 1}; async evil",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Bad-Name!" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          "Bad-Name!": { type: "string" },
        },
      },
    });

    expect(source).toContain("async fetchreturn1asyncevil(");
    expect(source).toContain("export type BadName = string;");
    expect(source).not.toContain("return 1");
    expect(source).not.toMatch(/async evil\(/);
  });

  it("returns unknown for broken component refs", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/broken": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Missing" },
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

  it("types success JSON from 201 when 200 is absent", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/items": {
          post: {
            responses: {
              "201": {
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
    );
    expect(source).toContain("Promise<postItemsResponse>");
    expect(source).toContain("export type postItemsResponse");
  });

  it("prefers 200 schema over 201 when both exist", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/items": {
          post: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { ok: { type: "boolean" } },
                      required: ["ok"],
                    },
                  },
                },
              },
              "201": {
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
    );
    expect(source).toContain("ok: boolean");
    expect(source).not.toContain("id: string");
  });

  it("types success JSON from 202 when 200/201 absent", () => {
    const source = generateFetchClient(
      docWithPaths({
        "/jobs": {
          post: {
            responses: {
              "202": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { jobId: { type: "string" } },
                      required: ["jobId"],
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
    expect(source).toContain("jobId: string");
  });
});


