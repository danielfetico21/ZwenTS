import { z } from "zod";

/**
 * Zod mirror of the RFC 0004 Problem Details profile for OpenAPI `errors` maps.
 * Registered as component `Problem` when `schemaRefs` is enabled.
 */
export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    code: z.string(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    extras: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: "Problem" });
