# RFC 0004: Error Codes and Problem Details Profile

- **Status:** Accepted
- **Created:** 2026-08-06
- **Accepted:** 2026-08-06
- **Depends on:** [RFC 0001](./0001-lightweight-typescript-backend.md)

---

## 1. Summary

Define the stable **error code registry**, HTTP status defaults, and **RFC 7807 Problem Details** JSON profile used by `@zwents/core` and adapters.

## 2. Problem Details profile

Successful JSON responses use `application/json`.

Error responses produced from `AppError` (and the default `onError` handler) use:

| Field | Rule |
|-------|------|
| `Content-Type` | `application/problem+json; charset=utf-8` |
| `type` | `https://zwents.dev/problems/{code}` |
| `title` | Same as `code` (machine id; humans use `detail`) |
| `status` | HTTP status |
| `detail` | Optional human-readable explanation |
| `instance` | Optional request path / URI |
| `code` | Stable machine code (duplicate of path segment in `type` for clients that ignore `type`) |
| `extras` | Optional structured bag (e.g. validation `issues`) — **never** stack traces (`sanitizeExtras` strips `stack`/`cause` keys and Error values) |

Unhandled non-`AppError` exceptions map to:

```json
{
  "type": "https://zwents.dev/problems/INTERNAL_ERROR",
  "title": "INTERNAL_ERROR",
  "status": 500,
  "code": "INTERNAL_ERROR"
}
```

`cause` stays on the `Error` for logs only — not serialized.

## 3. Framework error code registry

| Code | Default status | Meaning |
|------|----------------|---------|
| `VALIDATION_ERROR` | 400 | Schema / input validation failed |
| `INVALID_JSON` | 400 | Malformed JSON body |
| `UNAUTHORIZED` | 401 | Missing or invalid credentials |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Route or resource missing |
| `CONFLICT` | 409 | State conflict (reserved for apps) |
| `RATE_LIMITED` | 429 | Rate limit exceeded (`@zwents/ratelimit`) |
| `PAYLOAD_TOO_LARGE` | 413 | Body exceeds `maxBodyBytes` (`@zwents/http`) |
| `REQUEST_TIMEOUT` | 408 | Exceeded `requestTimeoutMs` (`@zwents/http`) |
| `SERVICE_UNAVAILABLE` | 503 | Draining / shutting down (`@zwents/http` listen) |
| `CONFIG_ERROR` | 500 | Boot-time config invalid (not for request path normally) |
| `INTERNAL_ERROR` | 500 | Unexpected failure |
| `ALREADY_STARTED` | 500 | `App.start()` called twice |
| `STOP_TIMEOUT` | 500 | `App.stop()` exceeded timeout |

Application domains **add** codes (`USER_NOT_FOUND`, `ORDER_CANCELLED`, …) using the same `AppError` / `type` URI pattern. Framework codes above are reserved.

## 4. API surface (`@zwents/core`)

```ts
ErrorCodes          // const object of framework codes
DefaultStatus       // code → status
appError(code, opts?)
problemJson(details) // AppResponse with problem+json content-type
toProblemDetails(error, instance?)
```

Prefer `appError(ErrorCodes.NOT_FOUND, { detail: "..." })` over stringly `new AppError("NOT_FOUND", 404)`.

## 5. Observability interaction

`@zwents/otel` records exceptions on the active span; it must **not** put `detail`/`extras` into span attributes when they may contain PII. Safe defaults: `error.code`, `http.response.status_code`, `zwents.request_id`.

## 6. Compatibility

Renaming a framework `code` or changing its default status is a **breaking** change. Adding new reserved codes is non-breaking.

## Revision history

| Date | Change |
|------|--------|
| 2026-08-06 | Accepted |
