import type { z } from "zod";

export type ZodIssueExtra = {
  path: string;
  message: string;
  code: string;
};

export type FormatZodIssuesOptions = {
  /**
   * Path used when `issue.path` is empty.
   * Defaults to `""` (empty string). Config boot uses `"(root)"`.
   */
  rootPath?: string;
};

/** Map a Zod error into the `extras.issues` shape used by AppError. */
export function formatZodIssues(
  error: z.ZodError,
  options: FormatZodIssuesOptions = {},
): ZodIssueExtra[] {
  const rootPath = options.rootPath ?? "";
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : rootPath,
    message: issue.message,
    code: issue.code,
  }));
}
