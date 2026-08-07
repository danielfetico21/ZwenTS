import {
  err,
  ok,
  type MapError,
  type Result,
} from "./result.js";

/**
 * Async Result — a Promise that resolves to a branded Result.
 * Prefer free functions over a method-chaining class (keeps core small).
 */
export type ResultAsync<T, E = unknown> = Promise<Result<T, E>>;

function defaultMapError(cause: unknown): unknown {
  return cause;
}

/**
 * Map the success value of a ResultAsync.
 * Mapper throws reject the Promise (same as sync `map`); use `safeTry` to catch.
 */
export async function mapAsync<T, U, E>(
  result: ResultAsync<T, E>,
  fn: (value: T) => U | Promise<U>,
): Promise<Result<U, E>> {
  const r = await result;
  if (!r.ok) return r;
  return ok(await fn(r.value));
}

/**
 * Chain another Result / ResultAsync on success.
 * `fn` throws reject the Promise (same as sync `andThen`); use `safeTry` to catch.
 */
export async function andThenAsync<T, U, E, F>(
  result: ResultAsync<T, E>,
  fn: (value: T) => Result<U, F> | ResultAsync<U, F>,
): Promise<Result<U, E | F>> {
  const r = await result;
  if (!r.ok) return r;
  return fn(r.value);
}

/**
 * Run an async block that returns Result; thrown exceptions become `err`.
 * Not a generator `safeTry` — use early `if (!r.ok) return r` inside `fn`.
 */
export async function safeTry<T, E = unknown>(
  fn: () => Promise<Result<T, E>>,
  mapError: MapError<E> = defaultMapError as MapError<E>,
): Promise<Result<T, E>> {
  try {
    return await fn();
  } catch (cause) {
    return err(mapError(cause));
  }
}
