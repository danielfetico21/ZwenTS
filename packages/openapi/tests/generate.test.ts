import { bearerAuth, requireAuth } from "@zwents/auth";
import { createApp } from "@zwents/core";
import { route } from "@zwents/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateFetchClient, generateOpenApi } from "../index.js";

const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.string(),
});

describe("generateOpenApi", () => {
  it("emits paths, params, query, body, output, and error responses", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/users/:id",
        tags: ["users"],
        params: z.object({ id: z.uuid() }),
        query: z.object({ dryRun: z.enum(["true", "false"]).optional() }),
        body: z.object({ name: z.string().min(1) }),
        output: z.object({ id: z.uuid(), name: z.string() }),
        errors: {
          404: Problem,
          400: Problem,
        },
        handler: async (_ctx, input) => ({
          id: input.params.id,
          name: input.body.name,
        }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "ZwenTS", version: "0.0.0" },
    });

    expect(doc["openapi"]).toBe("3.1.0");
    const paths = doc["paths"] as Record<string, Record<string, unknown>>;
    expect(paths["/users/{id}"]?.["post"]).toMatchObject({
      tags: ["users"],
    });

    const op = paths["/users/{id}"]?.["post"] as {
      parameters: unknown[];
      requestBody: unknown;
      responses: Record<string, unknown>;
    };
    expect(op.parameters.length).toBeGreaterThanOrEqual(1);
    expect(op.requestBody).toBeTruthy();
    expect(op.responses["200"]).toBeTruthy();
    expect(op.responses["404"]).toBeTruthy();
    expect(op.responses["400"]).toBeTruthy();

    const components = doc["components"] as {
      schemas: Record<string, unknown>;
    };
    expect(components.schemas["PostUsersByIdBody"]).toBeTruthy();
    expect(components.schemas["PostUsersByIdResponse"]).toBeTruthy();
    expect(components.schemas["Problem"]).toBeTruthy();
    expect(op.requestBody).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/PostUsersByIdBody" },
        },
      },
    });
    expect(op.responses["200"]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/PostUsersByIdResponse" },
        },
      },
    });
    expect(op.responses["404"]).toMatchObject({
      content: {
        "application/problem+json": {
          schema: { $ref: "#/components/schemas/Problem" },
        },
      },
    });
  });

  it("uses Zod meta id for component schema names and nested $ref", () => {
    const User = z.object({ id: z.string() }).meta({ id: "User" });
    const Note = z
      .object({ title: z.string(), author: User })
      .meta({ id: "Note" });

    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/notes/:id",
        params: z.object({ id: z.string() }),
        output: Note,
        handler: async () => ({
          title: "t",
          author: { id: "u1" },
        }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Notes", version: "0.0.0" },
    });
    const components = doc["components"] as {
      schemas: Record<string, Record<string, unknown>>;
    };
    expect(components.schemas["Note"]).toBeTruthy();
    expect(components.schemas["User"]).toBeTruthy();
    expect(components.schemas["Note"]?.["properties"]).toMatchObject({
      author: { $ref: "#/components/schemas/User" },
    });
  });

  it("inlines schemas when schemaRefs is false", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/ping",
        output: z.object({ ok: z.boolean() }),
        handler: async () => ({ ok: true }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Inline", version: "0.0.0" },
      schemaRefs: false,
    });
    expect(
      (doc["components"] as { schemas?: unknown } | undefined)?.schemas,
    ).toBeUndefined();
    const op = (doc["paths"] as Record<string, Record<string, unknown>>)[
      "/ping"
    ]?.["get"] as {
      responses: Record<string, { content: Record<string, { schema: unknown }> }>;
    };
    expect(op.responses["200"]?.content["application/json"]?.schema).toMatchObject({
      type: "object",
      properties: { ok: { type: "boolean" } },
    });
  });

  it("emits securitySchemes and operation security from app-level bearerAuth", () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          verify: async () => ({ id: "u1", roles: [] }),
        }),
      )
      .route(
        route({
          method: "GET",
          path: "/me",
          output: z.object({ id: z.string() }),
          handler: async () => ({ id: "u1" }),
        }),
      );

    const doc = generateOpenApi(app, {
      info: { title: "Auth", version: "0.0.0" },
    });

    const components = doc["components"] as {
      securitySchemes: Record<string, unknown>;
      schemas: Record<string, unknown>;
    };
    expect(components.securitySchemes).toEqual({
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    });
    expect(components.schemas).toBeTruthy();
    const paths = doc["paths"] as Record<string, Record<string, unknown>>;
    expect(paths["/me"]?.["get"]).toMatchObject({
      security: [{ bearerAuth: [] }],
    });
  });

  it("emits schemes from route middleware and requireAuth without schemes", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/secret",
        middleware: [
          bearerAuth({
            required: false,
            verify: async () => ({ id: "u1", roles: [] }),
          }),
          requireAuth(),
        ],
        output: z.object({ ok: z.boolean() }),
        handler: async () => ({ ok: true }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Auth", version: "0.0.0" },
    });
    const components = doc["components"] as {
      securitySchemes: Record<string, unknown>;
    };
    expect(components.securitySchemes["bearerAuth"]).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    const paths = doc["paths"] as Record<string, Record<string, unknown>>;
    expect(paths["/secret"]?.["get"]).toMatchObject({
      security: [{ bearerAuth: [] }],
    });
  });

  it("omits operation security when route sets security: false", () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          verify: async () => ({ id: "u1", roles: [] }),
        }),
      )
      .route(
        route({
          method: "GET",
          path: "/health",
          security: false,
          output: z.object({ ok: z.boolean() }),
          handler: async () => ({ ok: true }),
        }),
      );

    const doc = generateOpenApi(app, {
      info: { title: "Auth", version: "0.0.0" },
    });
    const op = (doc["paths"] as Record<string, Record<string, unknown>>)[
      "/health"
    ]?.["get"] as Record<string, unknown>;
    expect(op["security"]).toBeUndefined();
    expect(doc["components"]).toBeTruthy();
  });

  it("honors explicit route security over middleware inference", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/alt",
        security: [{ apiKey: [] }],
        output: z.object({ ok: z.boolean() }),
        handler: async () => ({ ok: true }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Auth", version: "0.0.0" },
      securitySchemes: {
        apiKey: { type: "apiKey", name: "x-api-key", in: "header" },
      },
    });

    const components = doc["components"] as {
      securitySchemes: Record<string, unknown>;
    };
    expect(components.securitySchemes).toEqual({
      apiKey: { type: "apiKey", name: "x-api-key", in: "header" },
    });
    const paths = doc["paths"] as Record<string, Record<string, unknown>>;
    expect(paths["/alt"]?.["get"]).toMatchObject({
      security: [{ apiKey: [] }],
    });
  });

  it("does not emit components.securitySchemes when none are discovered", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/",
        handler: async () => ({ ok: true }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Public", version: "0.0.0" },
    });
    expect(doc["components"]).toBeUndefined();
  });

  it("does not attach require when bearerAuth is optional and no requireAuth", () => {
    const app = createApp({ context: {} })
      .use(
        bearerAuth({
          required: false,
          verify: async () => ({ id: "u1", roles: [] }),
        }),
      )
      .route(
        route({
          method: "GET",
          path: "/optional",
          handler: async () => ({ ok: true }),
        }),
      );

    const doc = generateOpenApi(app, {
      info: { title: "Auth", version: "0.0.0" },
    });
    expect(doc["components"]).toBeTruthy();
    const op = (doc["paths"] as Record<string, Record<string, unknown>>)[
      "/optional"
    ]?.["get"] as Record<string, unknown>;
    expect(op["security"]).toBeUndefined();
  });
});

describe("generateFetchClient", () => {
  it("emits a TypeScript client class with path methods", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/hello/:name",
        output: z.object({ message: z.string() }),
        handler: async (_ctx, input) => ({ message: input.params.name }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Demo", version: "0.0.0" },
    });
    const source = generateFetchClient(doc, { clientName: "DemoClient" });
    expect(source).toContain("export class DemoClient");
    expect(source).toContain("getHelloByName");
    expect(source).toContain("params: { name: string }");
    expect(source).toContain("export type GetHelloByNameResponse");
    expect(source).toContain("Promise<GetHelloByNameResponse>");
  });

  it("emits typed query args and URLSearchParams wiring", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/items",
        query: z.object({
          q: z.string(),
          dryRun: z.enum(["true", "false"]).optional(),
        }),
        output: z.object({ ok: z.boolean() }),
        handler: async () => ({ ok: true }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Demo", version: "0.0.0" },
    });
    const source = generateFetchClient(doc, { clientName: "DemoClient" });
    expect(source).toContain('query: { q: string; dryRun?: "true" | "false" }');
    expect(source).toContain("url.searchParams.set");
    expect(source).toContain("url.searchParams.append");
  });

  it("emits ClientError that can carry Problem Details", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/hello",
        output: z.object({ message: z.string() }),
        handler: async () => ({ message: "hi" }),
      }),
    );
    const doc = generateOpenApi(app, {
      info: { title: "Demo", version: "0.1.0" },
    });
    const source = generateFetchClient(doc, { clientName: "DemoClient" });
    expect(source).toContain("export class ClientError");
    expect(source).toContain("export type ProblemDetails");
    expect(source).toContain("await throwIfNotOk");
    expect(source).toContain('ct.includes("json")');
  });

  it("types request bodies from component schema $refs", () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "POST",
        path: "/items",
        body: z.object({ name: z.string() }).meta({ id: "CreateItem" }),
        output: z.object({ id: z.string(), name: z.string() }).meta({ id: "Item" }),
        handler: async (_ctx, input) => ({ id: "1", name: input.body.name }),
      }),
    );

    const doc = generateOpenApi(app, {
      info: { title: "Demo", version: "0.0.0" },
    });
    const source = generateFetchClient(doc, { clientName: "DemoClient" });
    expect(source).toContain("export type CreateItem");
    expect(source).toContain("export type Item");
    expect(source).toContain("body: CreateItem");
    expect(source).toContain("Promise<Item>");
  });
});
