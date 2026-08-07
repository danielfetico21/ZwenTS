# Result helpers (Go-style)

Use `Result` from `@zwents/core` instead of try/catch for expected failures.

```ts
import {
  ErrorCodes,
  appError,
  err,
  fromPromise,
  ok,
  type AppError,
  type Result,
} from "@zwents/core";

async function loadUser(id: string): Promise<Result<User, AppError>> {
  const row = await fromPromise(
    db.user.find(id),
    (cause) => appError("DB_ERROR", { status: 500, cause }),
  );
  if (!row.ok) return row;
  if (!row.value) {
    return err(appError(ErrorCodes.NOT_FOUND, { detail: "user missing" }));
  }
  return ok(row.value);
}
```

| Go | ZwenTS |
|----|--------|
| `v, err := f()` | `const r = await f()` |
| `if err != nil { return err }` | `if (!r.ok) return r` |
| `return v, nil` | `return ok(v)` |

Handlers may return `Result` — `createApp` unwraps success and routes `AppError` failures through Problem Details (`resultToResponse` / default `onError`).

See [RFC 0006](./rfcs/0006-result-helpers.md).
