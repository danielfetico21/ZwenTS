# RFC 0006: Result Helpers (Go-style Errors)

- **Status:** Accepted
- **Created:** 2026-08-06
- **Accepted:** 2026-08-06
- **Depends on:** [RFC 0001](./0001-lightweight-typescript-backend.md), [RFC 0004](./0004-error-problem-details.md)
- **Supersedes proposal:** [result-helpers.md](../proposals/result-helpers.md)

---

## 1. Summary

Ship a **thin Result type** in `@zwents/core` so application code can use Go-style visible errors (`if (!r.ok) return r`) instead of try/catch or Express-style `catchAsync`. Prefer plain `{ ok, value } | { ok: false, error }` objects and free functions — **no** neverthrow/Effect dependency.

Default error type in docs/examples: `AppError`.

## 2. Shape

```ts
type Result<T, E = unknown> =
  | { ok: true; value: T }   // branded via ok()
  | { ok: false; error: E }; // branded via err()
```

Values are created with `ok` / `err` and carry a private brand so domain JSON shaped like `{ ok, value }` is not auto-unwrapped by handlers.

## 3. API (shipped)

### Tier A

`ok`, `err`, `isOk`, `isErr`, `isResult`, `map`, `mapErr`, `andThen`, `unwrapOr`, `match`, `fromThrowable` / `attempt`, `fromPromise` / `tryAsync`

### Tier B

`tap` / `andTee`, `orElse`, `combine`, `combineAll`, `flatten`, `unwrapOrThrow` / `toThrowable`

### HTTP

| Helper | Behavior |
|--------|----------|
| `resultToResponse(result)` | ok → JSON; err + `AppError` → Problem Details |
| `unwrapHandlerResult(value)` | used by `createApp` dispatch |
| Handler returns `Result` | success value is serialized; error is thrown into `onError` |

Shipped (thin): `ResultAsync` type alias, `mapAsync`, `andThenAsync`, `safeTry` (async block — not generator `yield*`).

Still deferred: method-chaining `ResultAsync` class, generator `safeTry`, `Option`.

## 4. Handler convention

```ts
handler: async (_ctx, input) => {
  const row = await fromPromise(db.find(input.params.id), (cause) =>
    appError("DB_ERROR", { status: 500, cause }),
  );
  if (!row.ok) return row;
  if (!row.value) return err(appError(ErrorCodes.NOT_FOUND));
  return ok(row.value);
}
```

Services return `Promise<Result<T, AppError>>`. Handlers may return `T` or `Result<T, AppError>`.

## 5. Non-goals

- Express `catchAsync`
- Literal Go `[T, E]` tuples as the primary API
- Peer dependency on neverthrow (API inspiration only; MIT)

## 6. Cheat sheet

| Go | ZwenTS |
|----|--------|
| `v, err := f()` | `const r = await f()` |
| `if err != nil { return err }` | `if (!r.ok) return r` |
| `return v, nil` | `return ok(v)` |
| `must(f())` (tests) | `unwrapOrThrow(r)` |
