import { z } from "zod";
import { uniqueIdent } from "./idents.js";
import {
  rewriteSchemaRefs,
  sanitizeSchemaName,
  stripSchemaNoise,
  type JsonSchema,
} from "./json-schema.js";

export class ComponentSchemaRegistry {
  private readonly registry = z.registry<{ id?: string }>();
  private readonly bySchema = new WeakMap<object, string>();
  private readonly usedNames = new Set<string>();
  private readonly rawExtras = new Map<string, JsonSchema>();
  private count = 0;

  ref(schema: z.ZodType, hint: string): { $ref: string } {
    const existing = this.bySchema.get(schema);
    if (existing) {
      return { $ref: `#/components/schemas/${existing}` };
    }

    const meta = schema.meta() as { id?: string } | undefined;
    const name = uniqueIdent(
      sanitizeSchemaName(
        typeof meta?.id === "string" && meta.id.length > 0 ? meta.id : hint,
      ),
      this.usedNames,
    );
    this.bySchema.set(schema, name);
    this.registry.add(schema, { id: name });
    this.count += 1;
    return { $ref: `#/components/schemas/${name}` };
  }

  /** Promote JSON Schema `$defs` entries into `components.schemas`. */
  ensureRaw(name: string, schema: JsonSchema): string {
    const safe = sanitizeSchemaName(name);
    if (!this.rawExtras.has(safe)) {
      this.rawExtras.set(safe, stripSchemaNoise(schema));
    }
    return safe;
  }

  build(): Record<string, JsonSchema> {
    if (this.count === 0 && this.rawExtras.size === 0) return {};

    const components: Record<string, JsonSchema> = {};

    if (this.count > 0) {
      const result = z.toJSONSchema(this.registry, {
        uri: (id) => `#/components/schemas/${id}`,
      }) as { schemas: Record<string, JsonSchema> };

      const shared = result.schemas["__shared"] as
        | {
            $defs?: Record<string, JsonSchema>;
            definitions?: Record<string, JsonSchema>;
          }
        | undefined;
      const sharedDefs = shared?.$defs ?? shared?.definitions;
      if (sharedDefs) {
        for (const [name, schema] of Object.entries(sharedDefs)) {
          components[name] = stripSchemaNoise(schema);
        }
      }

      for (const [name, schema] of Object.entries(result.schemas)) {
        if (name === "__shared") continue;
        components[name] = stripSchemaNoise(schema);
      }
    }

    for (const [name, schema] of this.rawExtras) {
      if (!(name in components)) {
        components[name] = schema;
      }
    }

    return rewriteSchemaRefs(components) as Record<string, JsonSchema>;
  }
}
