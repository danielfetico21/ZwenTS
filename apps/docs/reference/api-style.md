# API style (framework authors & app authors)

Short conventions from the monorepo API design review (`docs/reviews/api-review.md`). Complements [Semver contract](./semver). Throws cheat-sheet: [What APIs throw](./throws).

## Errors

| Kind | Pattern |
|------|---------|
| Request / handler failures | `throw appError(ErrorCodes.*, { detail, extras, cause })` |
| Middleware expected HTTP short-circuit | `ctx.respond(problemResponse(code, path, { detail }))` — **do not** call `next()` |
| Boot config | `loadConfig` → `CONFIG_ERROR` |
| Factory / option bugs (programmer) | bare `Error` with `@zwents/<pkg>: …` |
| Cursor **decode** (client token) | `VALIDATION_ERROR` |
| Cursor **encode** (server building token) | bare `Error` (`@zwents/schema: …`) |

Prefer `appError(...)` over `new AppError(code, status, …)` so statuses stay on `DefaultStatus`.

**Wire safety:** `cause` is never serialized. `toProblemDetails` runs `sanitizeExtras` (drops `stack` / `cause` keys and Error values). Do not put secrets in `detail` / `extras`.

## Absence: `null` vs `undefined`

- **`null`** — explicit empty / skip sentinel (`ctx.auth`, cursor `nextCursor`/`prevCursor`, `rateLimit` `key → null`).
- **`undefined` / omitted** — optional field not present (`query?`, `body?`, optional middleware options).

## Auth stack

1. `bearerAuth` — authenticate (sets `ctx.auth`)
2. `requireAuth` / `authorize` — authorize (or use `bearerAuth({ required: true })` alone)

## Routes

```ts
const notesRoute = createRoute<AppServices>();
app.route(notesRoute({ method: "GET", path: "/notes", /* … */ }));
```

`app.route` registers; `@zwents/schema` `route` / `createRoute` builds the definition (RFC 0003).

## Pagination

Pick **offset** or **cursor** per resource API. Both helper families are first-class; don’t mix strategies on one list endpoint without documenting why.

## JSON timestamps

Prefer **unix milliseconds** in JSON bodies. HTTP rate-limit reset headers stay **seconds** (RFC 7231 / common gateway convention).

## Generated fetch client (MVP)

`generateFetchClient` / `zwen client` throw `ClientError` on non-OK responses (`status` + optional `problem` when the body is Problem Details JSON). This is not the same class as server-side `AppError`.
