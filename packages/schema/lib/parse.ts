import { appError, ErrorCodes } from "@zwents/core";
import type { z } from "zod";
import { formatZodIssues } from "./zod-issues.js";

export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  value: unknown,
  location: "params" | "query" | "body" | "output",
): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const issues = formatZodIssues(result.error);

  // Output mismatch is a server bug; request input stays VALIDATION_ERROR.
  if (location === "output") {
    throw appError(ErrorCodes.INTERNAL_ERROR, {
      detail: "Handler returned data that failed output validation",
      extras: { location, issues },
    });
  }

  throw appError(ErrorCodes.VALIDATION_ERROR, {
    detail: `Invalid ${location}`,
    extras: { location, issues },
  });
}
