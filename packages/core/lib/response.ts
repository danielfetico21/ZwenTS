import {
  appError,
  type AppErrorOptions,
  type ErrorCode,
  type ProblemDetails,
} from "./errors.js";

export type AppResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export function json(body: unknown, status = 200): AppResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

export function problemJson(
  body: ProblemDetails,
  status = body.status,
): AppResponse {
  return {
    status,
    headers: {
      "content-type": "application/problem+json; charset=utf-8",
    },
    body,
  };
}

/**
 * Build a Problem Details `AppResponse` from an error code + optional path.
 * Preferred helper for middleware short-circuits (auth, ratelimit, …).
 */
export function problemResponse(
  code: ErrorCode,
  instance?: string,
  options: AppErrorOptions = {},
): AppResponse {
  const details = appError(code, options).toProblemDetails(instance);
  return problemJson(details, details.status);
}

/** Merge middleware `responseHeaders` onto a response (lowercase keys win). */
export function mergeResponseHeaders(
  response: AppResponse,
  headers: Readonly<Record<string, string>>,
): AppResponse {
  const keys = Object.keys(headers);
  if (keys.length === 0) return response;
  return {
    ...response,
    headers: { ...response.headers, ...headers },
  };
}
