# Errors & Problem Details

Blessed wire shape: **RFC 7807** `application/problem+json`.

## Create errors

```ts
import { appError, ErrorCodes } from "@zwents/core";

throw appError(ErrorCodes.NOT_FOUND, {
  detail: "Note not found",
  extras: { id },
});
```

Prefer `appError` over `new AppError` so statuses come from `DefaultStatus`.

## On the wire

| Field | Notes |
|-------|--------|
| `type` | `https://zwents.dev/problems/{code}` |
| `code` / `title` | Stable machine id |
| `status` | HTTP status |
| `detail` | Optional human text — don't put secrets |
| `extras` | Structured bag (e.g. Zod `issues`) |
| `cause` | **Logs only** — never serialized |

`toProblemDetails` runs `sanitizeExtras` (strips `stack` / `cause` keys and `Error` values). Unexpected throws become `INTERNAL_ERROR` without leaking the exception message.

## Distinguishing failures

```ts
import { isAppError, ErrorCodes } from "@zwents/core";

if (isAppError(error) && error.code === ErrorCodes.NOT_FOUND) {
  // …
}
```

See the full matrix: [What APIs throw](/reference/throws).
