import { z } from "zod";
import { sanitizeIdent } from "./idents.js";

export type JsonSchema = Record<string, unknown>;
export { pascalCase, schemaNameHint } from "./path-names.js";

export function isZodType(value: unknown): value is z.ZodType {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { safeParse?: unknown }).safeParse === "function"
  );
}

export function stripSchemaNoise(schema: JsonSchema): JsonSchema {
  const {
    $schema: _schema,
    $id: _id,
    id: _legacyId,
    ...rest
  } = schema;
  return rest;
}

export function zodToInlineSchema(value: unknown): JsonSchema | undefined {
  if (!isZodType(value)) return undefined;
  const schema = z.toJSONSchema(value) as JsonSchema;
  return stripSchemaNoise(schema);
}

export function sanitizeSchemaName(name: string): string {
  return sanitizeIdent(name, "Schema");
}

export function rewriteSchemaRefs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(rewriteSchemaRefs);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key === "$ref" && typeof child === "string") {
      out[key] = normalizeComponentRef(child);
      continue;
    }
    out[key] = rewriteSchemaRefs(child);
  }
  return out;
}

/** Map Zod registry / $defs pointer shapes onto OpenAPI components. */
export function normalizeComponentRef(ref: string): string {
  const shared = ref.match(
    /^#\/components\/schemas\/__shared#\/(?:\$defs|definitions)\/(.+)$/,
  );
  if (shared?.[1]) {
    return `#/components/schemas/${shared[1]}`;
  }
  const defs = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
  if (defs?.[1]) {
    return `#/components/schemas/${defs[1]}`;
  }
  return ref;
}

export function localDefs(schema: JsonSchema): Record<string, JsonSchema> {
  const defs = schema["$defs"] ?? schema["definitions"];
  if (!defs || typeof defs !== "object") return {};
  return defs as Record<string, JsonSchema>;
}

export function inlineLocalRefs(
  value: unknown,
  defs: Record<string, JsonSchema>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => inlineLocalRefs(item, defs));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj["$ref"] === "string") {
    const match = obj["$ref"].match(/^#\/(?:\$defs|definitions)\/(.+)$/);
    if (match?.[1] && defs[match[1]]) {
      return inlineLocalRefs(defs[match[1]], defs);
    }
    return { ...obj, $ref: normalizeComponentRef(obj["$ref"]) };
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key === "$defs" || key === "definitions") continue;
    out[key] = inlineLocalRefs(child, defs);
  }
  return out;
}
