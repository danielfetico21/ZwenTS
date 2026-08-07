import type { HttpMethod, Middleware, RouteDefinition } from "@zwents/core";
import type { ComponentSchemaRegistry } from "./components.js";
import {
  inlineLocalRefs,
  isZodType,
  localDefs,
  rewriteSchemaRefs,
  schemaNameHint,
  zodToInlineSchema,
  type JsonSchema,
} from "./json-schema.js";

/** Must match `@zwents/auth` `Symbol.for("@zwents/auth.security")`. */
const SECURITY_META = Symbol.for("@zwents/auth.security");

type MiddlewareSecurityMeta = {
  schemes?: Record<string, Record<string, unknown>>;
  require?: readonly Record<string, string[]>[];
};

function getSecurityMeta(middleware: unknown): MiddlewareSecurityMeta | undefined {
  if (typeof middleware !== "function") return undefined;
  return (middleware as unknown as Record<
    symbol,
    MiddlewareSecurityMeta | undefined
  >)[SECURITY_META];
}

export function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
}

export function methodKey(method: HttpMethod): string {
  return method.toLowerCase();
}

function materializeParameterSchema(
  propertySchema: JsonSchema,
  parentSchema: JsonSchema,
  components: ComponentSchemaRegistry | null,
): JsonSchema {
  const defs = localDefs(parentSchema);
  if (components) {
    for (const [name, def] of Object.entries(defs)) {
      components.ensureRaw(name, def);
    }
    return rewriteSchemaRefs(propertySchema) as JsonSchema;
  }
  return inlineLocalRefs(propertySchema, defs) as JsonSchema;
}

function appendObjectParams(
  parameters: unknown[],
  objectSchema: JsonSchema | undefined,
  options: {
    in: "path" | "query";
    required: "all" | ReadonlySet<string>;
  },
  components: ComponentSchemaRegistry | null,
): void {
  if (!objectSchema || objectSchema["type"] !== "object") return;
  const properties = (objectSchema["properties"] ?? {}) as Record<
    string,
    JsonSchema
  >;
  for (const [name, schema] of Object.entries(properties)) {
    parameters.push({
      name,
      in: options.in,
      required:
        options.required === "all" ? true : options.required.has(name),
      schema: materializeParameterSchema(schema, objectSchema, components),
    });
  }
}

function buildParameters(
  route: RouteDefinition<unknown>,
  components: ComponentSchemaRegistry | null,
): unknown[] {
  const parameters: unknown[] = [];
  const paramsSchema = zodToInlineSchema(route.meta?.schemas?.params);
  appendObjectParams(
    parameters,
    paramsSchema,
    { in: "path", required: "all" },
    components,
  );

  const querySchema = zodToInlineSchema(route.meta?.schemas?.query);
  appendObjectParams(
    parameters,
    querySchema,
    {
      in: "query",
      required: new Set(
        (querySchema?.["required"] as string[] | undefined) ?? [],
      ),
    },
    components,
  );

  return parameters;
}

function resolveSchema(
  value: unknown,
  hint: string,
  components: ComponentSchemaRegistry | null,
): JsonSchema | undefined {
  if (!isZodType(value)) return undefined;
  if (components) {
    return components.ref(value, hint);
  }
  return zodToInlineSchema(value);
}

function buildResponses(
  route: RouteDefinition<unknown>,
  components: ComponentSchemaRegistry | null,
): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  const hintBase = schemaNameHint(route.method, route.path, "");

  const outputSchema = resolveSchema(
    route.meta?.schemas?.output,
    `${hintBase}Response`,
    components,
  );
  if (outputSchema) {
    responses["200"] = {
      description: "OK",
      content: {
        "application/json": {
          schema: outputSchema,
        },
      },
    };
  } else {
    responses["200"] = { description: "OK" };
  }

  const errors = route.meta?.errors;
  if (errors) {
    for (const [status, schemaValue] of Object.entries(errors)) {
      const schema = resolveSchema(schemaValue, "Problem", components);
      responses[status] = {
        description: `Error ${status}`,
        content: schema
          ? {
              "application/problem+json": { schema },
              "application/json": { schema },
            }
          : undefined,
      };
      if (!schema) {
        responses[status] = { description: `Error ${status}` };
      }
    }
  }

  return responses;
}

function dedupeRequirements(
  requirements: readonly Record<string, string[]>[],
): Record<string, string[]>[] {
  const seen = new Set<string>();
  const out: Record<string, string[]>[] = [];
  for (const req of requirements) {
    const key = JSON.stringify(req);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(req);
  }
  return out;
}

export function collectSecurity(
  middlewareLists: ReadonlyArray<readonly Middleware[] | undefined>,
): {
  schemes: Record<string, Record<string, unknown>>;
  require: Record<string, string[]>[];
} {
  const schemes: Record<string, Record<string, unknown>> = {};
  const require: Record<string, string[]>[] = [];

  for (const list of middlewareLists) {
    if (!list) continue;
    for (const mw of list) {
      const meta = getSecurityMeta(mw);
      if (!meta) continue;
      if (meta.schemes) {
        Object.assign(schemes, meta.schemes);
      }
      if (meta.require) {
        require.push(...meta.require);
      }
    }
  }

  return { schemes, require: dedupeRequirements(require) };
}

export function buildOperation(
  route: RouteDefinition<unknown>,
  appRequire: readonly Record<string, string[]>[],
  components: ComponentSchemaRegistry | null,
): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    responses: buildResponses(route, components),
  };

  if (route.meta?.tags?.length) {
    operation["tags"] = [...route.meta.tags];
  }

  const parameters = buildParameters(route, components);
  if (parameters.length > 0) {
    operation["parameters"] = parameters;
  }

  const bodySchema = resolveSchema(
    route.meta?.schemas?.body,
    schemaNameHint(route.method, route.path, "Body"),
    components,
  );
  if (bodySchema) {
    operation["requestBody"] = {
      required: true,
      content: {
        "application/json": {
          schema: bodySchema,
        },
      },
    };
  }

  const routeSecurity = route.meta?.security;
  if (routeSecurity === false) {
    // explicitly public — omit operation security
  } else if (routeSecurity) {
    operation["security"] = [...routeSecurity];
  } else {
    const fromRoute = collectSecurity([route.middleware]).require;
    const security = dedupeRequirements([...appRequire, ...fromRoute]);
    if (security.length > 0) {
      operation["security"] = security;
    }
  }

  return operation;
}
