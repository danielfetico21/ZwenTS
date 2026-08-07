# What public APIs throw (happy path)

Short reference for app authors. Prefer distinguishing errors by **`code` / `instanceof AppError`**, not message strings. Full style: [api-style.md](./api-style.md).

Wire shape for request failures: RFC 7807 Problem Details (`code`, optional `detail` / `extras`). `cause` is for logs only — never on the wire. `extras` are sanitized (no `stack` / nested Error stacks).

---

## Boot / process

| API | Throws / fails with |
|-----|---------------------|
| `loadConfig(schema)` | `AppError` `CONFIG_ERROR` (invalid env) — fail fast at boot |
| `app.start()` | `AppError` `ALREADY_STARTED` if already started; rethrows hook errors |
| `app.stop()` | `AppError` `STOP_TIMEOUT` if hooks exceed timeout (`started` stays true) |
| `listen(app, opts)` | Propagates `start` failures; invalid listen options → bare `Error` |
| `installProcessSignals(app, { fatalErrors: true })` | Does not throw; on fatal → `stop` + `process.exit(1)` |

Construction-time bad options (middleware factories, pagination bounds) → bare `Error` with `@zwents/<pkg>: …` (programmer bug, not Problem Details).

---

## Request path (`dispatch` / HTTP adapter)

| Failure | How it surfaces |
|---------|-----------------|
| No matching route | `NOT_FOUND` (404) |
| Zod `params` / `query` / `body` | `VALIDATION_ERROR` (400) + `extras.issues` |
| Zod `output` mismatch | `INTERNAL_ERROR` (500) — server bug |
| Bad JSON body | `INVALID_JSON` (400) |
| Body / multipart over limit | `PAYLOAD_TOO_LARGE` (413) |
| `requestTimeoutMs` exceeded | `REQUEST_TIMEOUT` (408) |
| Draining server | `SERVICE_UNAVAILABLE` (503) |
| Auth missing / bad token | `UNAUTHORIZED` (401) via `respond` |
| Authz denied | `FORBIDDEN` (403) via `respond` |
| Rate limit | `RATE_LIMITED` (429) via `respond` |
| Idempotency conflict / overflow | `CONFLICT` / `SERVICE_UNAVAILABLE` via `respond` |
| Handler `throw appError(...)` / `err(appError)` | Mapped to Problem Details by status/code |
| Unexpected throw | `INTERNAL_ERROR` (500) — **no** exception message on the wire |

Middleware short-circuits use `ctx.respond(problemResponse(...))` (no throw). Validation/body paths typically `throw appError(...)`.

---

## Schema helpers

| API | Throws |
|-----|--------|
| `parseOrThrow` / `route()` input | `VALIDATION_ERROR` |
| `route()` output | `INTERNAL_ERROR` |
| `decodeCursor` | `VALIDATION_ERROR` (bad client token) |
| `encodeCursor` | bare `Error` (`@zwents/schema: …`) — programmer/server building token |

---

## Tooling (CLI / OpenAPI / generated client)

| API | Throws |
|-----|--------|
| `runCli` / bad args | `CliUsageError` |
| Wire codegen | `WireCodegenError` |
| `generateFetchClient` callers (generated) | `ClientError` on `!res.ok` (`status` + optional `problem`) |

---

## Distinguishing errors in app code

```ts
import { isAppError, ErrorCodes } from "@zwents/core";

try {
  await doWork();
} catch (error) {
  if (isAppError(error) && error.code === ErrorCodes.NOT_FOUND) {
    // handle
  }
  throw error;
}
```
