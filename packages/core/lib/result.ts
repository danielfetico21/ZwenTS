/**
 * Result helpers — Go-style visible errors without try/catch.
 * Shape and names inspired by neverthrow (MIT); plain objects, no dependency.
 */

/** Brand so domain JSON like `{ ok: true, value }` is not mistaken for Result. */
export const ResultBrand: unique symbol = Symbol.for("@zwents/core.Result");

type Branded = { readonly [ResultBrand]: true };

export type OkResult<T> = Branded & { ok: true; value: T };
export type ErrResult<E> = Branded & { ok: false; error: E };
export type Result<T, E = unknown> = OkResult<T> | ErrResult<E>;

export function ok<T>(value: T): Result<T, never> {
  return { [ResultBrand]: true, ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { [ResultBrand]: true, ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is OkResult<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is ErrResult<E> {
  return !result.ok;
}

/** True for values created via `ok` / `err` (branded). */
export function isResult(value: unknown): value is Result<unknown, unknown> {
  return typeof value === "object" && value !== null && ResultBrand in value;
}

export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (!result.ok) return result;
  return ok(fn(result.value));
}

export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  if (result.ok) return result;
  return err(fn(result.error));
}

export function andThen<T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  if (!result.ok) return result;
  return fn(result.value);
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

export function match<T, E, R>(
  result: Result<T, E>,
  arms: {
    ok: (value: T) => R;
    err: (error: E) => R;
  },
): R {
  return result.ok ? arms.ok(result.value) : arms.err(result.error);
}

export type MapError<E> = (cause: unknown) => E;

function defaultMapError(cause: unknown): unknown {
  return cause;
}

/** Sync: wrap a throwing function (neverthrow-inspired). Alias: `attempt`. */
export function fromThrowable<T, E = unknown>(
  fn: () => T,
  mapError: MapError<E> = defaultMapError as MapError<E>,
): Result<T, E> {
  try {
    return ok(fn());
  } catch (cause) {
    return err(mapError(cause));
  }
}

export const attempt = fromThrowable;

/**
 * Async: wrap a Promise / rejecting call — the catchAsync replacement.
 * Alias: `tryAsync`.
 */
export async function fromPromise<T, E = unknown>(
  promise: Promise<T>,
  mapError: MapError<E> = defaultMapError as MapError<E>,
): Promise<Result<T, E>> {
  try {
    return ok(await promise);
  } catch (cause) {
    return err(mapError(cause));
  }
}

export const tryAsync = fromPromise;

/** Side-effect on success; Result unchanged. */
export function tap<T, E>(
  result: Result<T, E>,
  fn: (value: T) => void,
): Result<T, E> {
  if (result.ok) fn(result.value);
  return result;
}

export const andTee = tap;

/** Recover from error with another Result. */
export function orElse<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => Result<T, F>,
): Result<T, F> {
  if (result.ok) return result;
  return fn(result.error);
}

/** First error wins. */
export function combine<T, E>(
  results: readonly Result<T, E>[],
): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}

/** Collect every error (validation-style). */
export function combineAll<T, E>(
  results: readonly Result<T, E>[],
): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];
  for (const result of results) {
    if (result.ok) values.push(result.value);
    else errors.push(result.error);
  }
  if (errors.length > 0) return err(errors);
  return ok(values);
}

export function flatten<T, E>(result: Result<Result<T, E>, E>): Result<T, E> {
  if (!result.ok) return result;
  return result.value;
}

/**
 * Escape hatch: throw the error value (for throw-based HTTP handlers).
 * Prefer `resultToResponse` when returning from routes.
 */
export function unwrapOrThrow<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

/** @deprecated Use unwrapOrThrow — kept as the loud “must” helper name. */
export const toThrowable = unwrapOrThrow;
