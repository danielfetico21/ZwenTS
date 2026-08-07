import { appError, ErrorCodes } from "@zwents/core";
import { formatZodIssues } from "@zwents/schema";
import type { z } from "zod";

export type LoadConfigOptions = {
  /** Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
};

/**
 * Parse and validate configuration from environment variables.
 * Fails fast with `CONFIG_ERROR` (status 500) — intended for boot, not requests.
 */
export function loadConfig<T extends z.ZodType>(
  schema: T,
  options: LoadConfigOptions = {},
): z.infer<T> {
  const env = options.env ?? process.env;
  const result = schema.safeParse(env);
  if (result.success) {
    return result.data;
  }

  throw appError(ErrorCodes.CONFIG_ERROR, {
    detail: "Invalid configuration",
    extras: { issues: formatZodIssues(result.error, { rootPath: "(root)" }) },
  });
}
