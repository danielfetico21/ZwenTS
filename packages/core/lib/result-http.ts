import { isAppError, toProblemDetails } from "./errors.js";
import { json, problemJson, type AppResponse } from "./response.js";
import { isErr, isResult, type Result } from "./result.js";

/**
 * Map a Result to an HTTP response.
 * - ok → JSON 200 (or custom status)
 * - err + AppError → Problem Details
 * - err + other → INTERNAL_ERROR Problem Details
 */
export function resultToResponse<T, E>(
  result: Result<T, E>,
  options: { okStatus?: number } = {},
): AppResponse {
  if (result.ok) {
    return json(result.value, options.okStatus ?? 200);
  }

  if (isAppError(result.error)) {
    const details = result.error.toProblemDetails();
    return problemJson(details, details.status);
  }

  const details = toProblemDetails(result.error);
  return problemJson(details, details.status);
}

/**
 * If `value` is a Result, unwrap to the success value or convert failure
 * into a thrown AppError / unknown for the default error handler.
 */
export function unwrapHandlerResult(value: unknown): unknown {
  if (!isResult(value)) return value;
  if (isErr(value)) {
    throw value.error;
  }
  return value.value;
}
