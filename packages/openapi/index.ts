export { generateOpenApi, stringifyOpenApi } from "./lib/generate.js";
export type { GenerateOpenApiOptions, OpenApiInfo } from "./lib/generate.js";
export { generateFetchClient } from "./lib/client.js";
export { sanitizeIdent, uniqueIdent } from "./lib/idents.js";
export {
  inlineLocalRefs,
  isZodType,
  localDefs,
  normalizeComponentRef,
  rewriteSchemaRefs,
  sanitizeSchemaName,
  stripSchemaNoise,
  zodToInlineSchema,
} from "./lib/json-schema.js";
export type { JsonSchema } from "./lib/json-schema.js";
