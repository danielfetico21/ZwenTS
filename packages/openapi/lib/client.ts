import { sanitizeIdent, uniqueIdent } from "./idents.js";
import { operationName } from "./path-names.js";

type JsonSchema = Record<string, unknown>;

/**
 * Emit a typed TypeScript fetch client from an OpenAPI 3.x document
 * produced by `generateOpenApi`. Resolves `components.schemas` `$ref`s into
 * exported types for JSON request bodies and 200 response payloads.
 *
 * On `!res.ok`, methods throw `ClientError` with `status` and optional
 * `problem` when the body is JSON Problem Details (`application/problem+json`
 * or a JSON object with `status`).
 */
export function generateFetchClient(
  document: Record<string, unknown>,
  options: { clientName?: string; baseUrlType?: string } = {},
): string {
  const clientName = sanitizeIdent(options.clientName ?? "ApiClient", "ApiClient");
  const paths = (document["paths"] ?? {}) as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  const components = (document["components"] ?? {}) as {
    schemas?: Record<string, JsonSchema>;
  };
  const schemas = components.schemas ?? {};
  const schemaAlias = new Map<string, string>();
  const usedTypeNames = new Set<string>();

  const typeDecls: string[] = [];
  const emittedTypes = new Set<string>();
  const methods: string[] = [];
  const usedMethodNames = new Set<string>();

  for (const [name, schema] of Object.entries(schemas)) {
    const safe = uniqueIdent(sanitizeIdent(name, "Schema"), usedTypeNames);
    schemaAlias.set(name, safe);
    emitSchemaType(safe, schema, schemas, schemaAlias, typeDecls, emittedTypes);
  }

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!isHttpMethod(method)) continue;
      const fnName = uniqueIdent(
        sanitizeIdent(operationName(method, path, operation), method),
        usedMethodNames,
      );
      const pathParams = pathParamsFromPath(path).map((p) =>
        sanitizeIdent(p, "param"),
      );
      const queryParams = queryParameters(operation);
      const bodySchema = requestBodySchema(operation);
      const responseSchema = successResponseSchema(operation);

      const bodyType = bodySchema
        ? schemaToType(
            bodySchema,
            schemas,
            schemaAlias,
            typeDecls,
            emittedTypes,
            `${fnName}Body`,
          )
        : null;
      const responseType = responseSchema
        ? schemaToType(
            responseSchema,
            schemas,
            schemaAlias,
            typeDecls,
            emittedTypes,
            `${fnName}Response`,
          )
        : "unknown";

      const args: string[] = [];
      if (pathParams.length > 0) {
        args.push(
          `params: { ${pathParams.map((p) => `${p}: string`).join("; ")} }`,
        );
      }
      if (queryParams.length > 0) {
        const fields = queryParams.map((p) => {
          const safeKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name)
            ? p.name
            : JSON.stringify(p.name);
          const optional = p.required ? "" : "?";
          const t = schemaToTypeExpr(
            p.schema,
            schemas,
            schemaAlias,
            typeDecls,
            emittedTypes,
          );
          return `${safeKey}${optional}: ${t}`;
        });
        const queryRequired = queryParams.some((p) => p.required);
        args.push(
          `${queryRequired ? "query" : "query?"}: { ${fields.join("; ")} }`,
        );
      }
      if (bodyType) {
        args.push(`body: ${bodyType}`);
      }
      args.push("init?: RequestInit");

      const urlExpr =
        pathParams.length === 0
          ? `\`${path}\``
          : (() => {
              let i = 0;
              return `\`${path.replace(/\{([^}]+)\}/g, () => `\${params.${pathParams[i++]}}`)}\``;
            })();

      const queryBlock =
        queryParams.length === 0
          ? ""
          : `    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          for (const item of v) url.searchParams.append(k, String(item));
        } else {
          url.searchParams.set(k, String(v));
        }
      }
    }
`;

      const methodLiteral = method.toUpperCase();
      const fetchBlock =
        method === "get" || method === "head"
          ? `    const res = await this.fetch(url, { ...init, method: "${methodLiteral}" });`
          : bodyType
            ? `    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    const res = await this.fetch(url, {
      ...init,
      method: "${methodLiteral}",
      headers,
      body: JSON.stringify(body),
    });`
            : `    const res = await this.fetch(url, { ...init, method: "${methodLiteral}" });`;

      methods.push(`  async ${fnName}(${args.join(", ")}): Promise<${responseType}> {
    const url = new URL(${urlExpr}, this.baseUrl);
${queryBlock}${fetchBlock}
    await throwIfNotOk(res, ${JSON.stringify(fnName)});
    return res.json() as Promise<${responseType}>;
  }`);
    }
  }

  const typesBlock =
    typeDecls.length > 0 ? `${typeDecls.join("\n\n")}\n\n` : "";

  return `/* Generated by @zwents/openapi — do not edit by hand. */
${typesBlock}export type ProblemDetails = {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  extras?: Record<string, unknown>;
};

export class ClientError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;

  constructor(
    message: string,
    options: { status: number; problem: ProblemDetails | null },
  ) {
    super(message);
    this.name = "ClientError";
    this.status = options.status;
    this.problem = options.problem;
  }
}

async function throwIfNotOk(res: Response, op: string): Promise<void> {
  if (res.ok) return;
  const ct = res.headers.get("content-type") ?? "";
  let problem: ProblemDetails | null = null;
  if (ct.includes("json")) {
    try {
      const body: unknown = await res.json();
      if (
        body !== null &&
        typeof body === "object" &&
        "status" in body &&
        typeof (body as { status: unknown }).status === "number"
      ) {
        problem = body as ProblemDetails;
      }
    } catch {
      // ignore unreadable bodies
    }
  }
  const detail = problem?.detail ?? problem?.title;
  throw new ClientError(
    detail
      ? \`\${op} failed: \${res.status} \${detail}\`
      : \`\${op} failed: \${res.status} \${res.statusText}\`,
    { status: res.status, problem },
  );
}

export type ${clientName}Options = {
  baseUrl: string;
  fetch?: typeof fetch;
};

export class ${clientName} {
  readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: ${clientName}Options) {
    this.baseUrl = options.baseUrl.replace(/\\/$/, "");
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

${methods.join("\n\n")}
}
`;
}

function isHttpMethod(value: string): boolean {
  return ["get", "post", "put", "patch", "delete", "head", "options"].includes(
    value,
  );
}

function pathParamsFromPath(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!).filter(Boolean);
}

function queryParameters(
  operation: Record<string, unknown>,
): Array<{ name: string; required: boolean; schema: JsonSchema }> {
  const parameters = operation["parameters"];
  if (!Array.isArray(parameters)) return [];
  const out: Array<{ name: string; required: boolean; schema: JsonSchema }> = [];
  for (const param of parameters) {
    if (typeof param !== "object" || param === null) continue;
    const entry = param as {
      in?: string;
      name?: string;
      required?: boolean;
      schema?: JsonSchema;
    };
    if (entry.in !== "query" || typeof entry.name !== "string") continue;
    out.push({
      name: entry.name,
      required: entry.required === true,
      schema: entry.schema ?? {},
    });
  }
  return out;
}

function requestBodySchema(
  operation: Record<string, unknown>,
): JsonSchema | undefined {
  const body = operation["requestBody"] as
    | {
        content?: Record<string, { schema?: JsonSchema }>;
      }
    | undefined;
  return body?.content?.["application/json"]?.schema;
}

function successResponseSchema(
  operation: Record<string, unknown>,
): JsonSchema | undefined {
  const responses = operation["responses"] as
    | Record<string, { content?: Record<string, { schema?: JsonSchema }> }>
    | undefined;
  // Prefer 200, then 201, then 202. When multiple exist, the client return
  // type is a single schema (MVP) — document both responses in OpenAPI but
  // generate the primary (usually 200) type.
  for (const code of ["200", "201", "202"]) {
    const schema = responses?.[code]?.content?.["application/json"]?.schema;
    if (schema) return schema;
  }
  return undefined;
}

function emitSchemaType(
  name: string,
  schema: JsonSchema,
  schemas: Record<string, JsonSchema>,
  alias: Map<string, string>,
  decls: string[],
  emitted: Set<string>,
): void {
  if (emitted.has(name)) return;
  emitted.add(name);
  const body = schemaToTypeExpr(schema, schemas, alias, decls, emitted);
  decls.push(`export type ${name} = ${body};`);
}

function schemaToType(
  schema: JsonSchema,
  schemas: Record<string, JsonSchema>,
  alias: Map<string, string>,
  decls: string[],
  emitted: Set<string>,
  anonymousName: string,
): string {
  const ref = schema["$ref"];
  if (typeof ref === "string") {
    const name = refName(ref);
    if (name && schemas[name]) {
      const safe = alias.get(name) ?? sanitizeIdent(name, "Schema");
      alias.set(name, safe);
      emitSchemaType(safe, schemas[name]!, schemas, alias, decls, emitted);
      return safe;
    }
    return "unknown";
  }

  if (schema["type"] === "object" || schema["properties"]) {
    const safeAnon = sanitizeIdent(anonymousName, "Anon");
    if (!emitted.has(safeAnon)) {
      emitted.add(safeAnon);
      decls.push(
        `export type ${safeAnon} = ${schemaToTypeExpr(schema, schemas, alias, decls, emitted)};`,
      );
    }
    return safeAnon;
  }

  return schemaToTypeExpr(schema, schemas, alias, decls, emitted);
}

function schemaToTypeExpr(
  schema: JsonSchema,
  schemas: Record<string, JsonSchema>,
  alias: Map<string, string>,
  decls: string[],
  emitted: Set<string>,
): string {
  const ref = schema["$ref"];
  if (typeof ref === "string") {
    const name = refName(ref);
    if (name && schemas[name]) {
      const safe = alias.get(name) ?? sanitizeIdent(name, "Schema");
      alias.set(name, safe);
      emitSchemaType(safe, schemas[name]!, schemas, alias, decls, emitted);
      return safe;
    }
    return "unknown";
  }

  if (Array.isArray(schema["enum"])) {
    return schema["enum"]
      .map((v) => (typeof v === "string" ? JSON.stringify(v) : String(v)))
      .join(" | ");
  }

  const type = schema["type"];
  if (type === "string") return "string";
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  if (type === "null") return "null";
  if (type === "array") {
    const items = (schema["items"] as JsonSchema | undefined) ?? {};
    return `Array<${schemaToTypeExpr(items, schemas, alias, decls, emitted)}>`;
  }

  if (type === "object" || schema["properties"]) {
    const properties = (schema["properties"] ?? {}) as Record<string, JsonSchema>;
    const required = new Set(
      (schema["required"] as string[] | undefined) ?? [],
    );
    const fields = Object.entries(properties).map(([key, prop]) => {
      const optional = required.has(key) ? "" : "?";
      const safeKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
        ? key
        : JSON.stringify(key);
      return `  ${safeKey}${optional}: ${schemaToTypeExpr(prop, schemas, alias, decls, emitted)};`;
    });
    if (fields.length === 0) {
      return "Record<string, unknown>";
    }
    return `{\n${fields.join("\n")}\n}`;
  }

  if (Array.isArray(schema["anyOf"])) {
    return (schema["anyOf"] as JsonSchema[])
      .map((s) => schemaToTypeExpr(s, schemas, alias, decls, emitted))
      .join(" | ");
  }
  if (Array.isArray(schema["oneOf"])) {
    return (schema["oneOf"] as JsonSchema[])
      .map((s) => schemaToTypeExpr(s, schemas, alias, decls, emitted))
      .join(" | ");
  }
  if (Array.isArray(schema["allOf"])) {
    return (schema["allOf"] as JsonSchema[])
      .map((s) => schemaToTypeExpr(s, schemas, alias, decls, emitted))
      .join(" & ");
  }

  return "unknown";
}

function refName(ref: string): string | undefined {
  const match = /^#\/components\/schemas\/([^/]+)$/.exec(ref);
  return match?.[1];
}
