# Result helpers

Handlers may return `Result` — `createApp` unwraps success and maps `AppError` failures to Problem Details.

```ts
import { ok, err, appError, ErrorCodes } from "@zwents/core";

handler: async (_ctx, input) => {
  if (!found) {
    return err(appError(ErrorCodes.NOT_FOUND, { detail: "missing" }));
  }
  return ok({ id: input.params.id, name: "Ada" });
}
```

## Dual names (intentional)

RFC 0006 keeps neverthrow-style aliases:

| Canonical | Alias |
|-----------|--------|
| `fromThrowable` | `attempt` |
| `fromPromise` | `tryAsync` |
| `tap` | `andTee` |
| `unwrapOrThrow` | `toThrowable` (deprecated) |

Don't drop aliases — they're part of the public surface.

More: [Result recipe](/recipes/result) (same content as repo `docs/result-recipe.md`).
