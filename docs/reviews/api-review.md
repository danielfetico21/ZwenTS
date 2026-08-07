# API Design & Contract Review

Document-only audit of `@zwents/*` **public** entry points (Prompt A). Examples are out of scope as framework contract.

Related: [semver-contract.md](../semver-contract.md), [RFC 0004](../rfcs/0004-error-problem-details.md), [RFC 0006](../rfcs/0006-result-helpers.md), [quality-review-summary.md](./quality/quality-review-summary.md).

**Versions:** all packages `0.0.0` (pre-1.0 — breaks allowed with changelog; this review prepares the 1.0 surface).

**Entry points:** every package exposes `"."` only, except `@zwents/cli` which also has `"./wire"`.

---

## Public API Inventory

### `@zwents/core`

| Kind | Exports |
|------|---------|
| App | `createApp`, types `App`, `AppOptions`, `DispatchRequest`, `DispatchInput`, `StartOptions`, `LifecycleHook` |
| Context | `createRequestContext`, types `RequestContext`, `RequestMeta`, `AuthPrincipal`, `Logger`, `TraceInfo` |
| Middleware | `composeMiddleware`, types `Middleware`, `Next`, `ErrorHandler` |
| Routes | `compileRoute`, `matchRoute`, types `RouteDefinition`, `CompiledRoute`, `RouteMatch`, `RouteMeta`, `Handler`, `HttpMethod`, `RawRouteInput`, `UploadedFile` |
| Dispatch helpers | `DISPATCH_INPUT_STATE_KEY`, `getDispatchInput` |
| Responses | `json`, `problemJson`, `problemResponse`, `mergeResponseHeaders`, type `AppResponse` |
| Errors | `AppError`, `appError`, `isAppError`, `toProblemDetails`, `problemTypeUri`, `ErrorCodes`, `DefaultStatus`, types `AppErrorOptions`, `ErrorCode`, `FrameworkErrorCode`, `ProblemDetails` |
| Result | `ok`, `err`, `isOk`, `isErr`, `isResult`, `map`, `mapErr`, `andThen`, `orElse`, `flatten`, `combine`, `combineAll`, `match`, `unwrapOr`, `unwrapOrThrow`, `fromThrowable`/`attempt`, `fromPromise`/`tryAsync`, `tap`/`andTee`, `toThrowable` (**@deprecated** → `unwrapOrThrow`), `ResultBrand`, `resultToResponse`, `unwrapHandlerResult`, types `Result`, `OkResult`, `ErrResult`, `MapError` |
| DI MVP | `composeProviders`, types `ProviderMap`, `ComposeOptions` |

### `@zwents/schema`

| Kind | Exports |
|------|---------|
| Routes | `route`, `createRoute`, `parseOrThrow`, types `ZodRouteOptions`, `RouteInput`, `RouteErrors`, `RawBodyMode` |
| Problems | `problemSchema` |
| Zod extras | `formatZodIssues`, types `ZodIssueExtra`, `FormatZodIssuesOptions` |
| Pagination | `offsetPage` / `offsetPageQuery` / `offsetPageSchema`, `cursorPage` / `cursorPageQuery` / `cursorPageSchema`, `encodeCursor` / `decodeCursor`, related types |

### `@zwents/http`

| Kind | Exports |
|------|---------|
| Serve | `listen`, `createFetchHandler`, `toWebResponse`, `installProcessSignals`, types `ListenOptions`, `ListenHandle`, `FetchHandlerOptions`, `InstallProcessSignalsOptions` |
| Body | `parseRequestBody`, `readBytesLimited`, `readTextLimited`, `readJsonBody`, `readRawBody`, `readMultipartBody`, default limit constants, related option/result types (`ReadJsonBodyOptions` = alias of `ReadBodyOptions`) |
| Timeout / query | `createTimeoutSignal`, `whenAborted`, `abortReasonAsAppError`, `parseSearchParams` |

### `@zwents/security`

`cors`, `securityHeaders`, `requestId`, `setResponseHeader`, `isSafeHeaderValue`, `assertSafeHeaderValue`, `isSafeToken` + option types.

### `@zwents/auth`

`bearerAuth`, `requireAuth`, `authorize`, `SECURITY_META`, `getSecurityMeta`, `withSecurityMeta` + OpenAPI security types / `Policy` / `VerifyBearer`.

### `@zwents/ratelimit`

`rateLimit`, `memoryRateLimitStore` + `RateLimitOptions` / `RateLimitStore` / hit types.

### `@zwents/idempotency`

`idempotency`, `memoryIdempotencyStore` + options / store / record / start-result types.

### `@zwents/otel`

`otelHttp` + `OtelHttpOptions` (peer `@opentelemetry/api`).

### `@zwents/openapi`

`generateOpenApi`, `stringifyOpenApi`, `generateFetchClient` + `GenerateOpenApiOptions` / `OpenApiInfo`.

### `@zwents/config`

`loadConfig` + `LoadConfigOptions`.

### `@zwents/test`

`startTestApp` + `TestApp`.

### `@zwents/cli` (`.` )

`runCli`, `CliUsageError`, `checkApp`, `formatRoutes`, `loadAppModule`, `writeOpenApiFile`, `writeClientFile`, wire runtime + **full wire codegen** (`parseWire*`, `topoSortProviders`, `emitWireContainer`, `generateWireContainer`, AST types), `defineWire` / `wire`.

### `@zwents/cli/wire`

Slim: `defineWire`, `wire` + binding types only.

### `@zwents/oxlint-plugin`

Default export plugin `zwents` with `no-reflect-metadata`, `no-decorators`, `require-route-output`.

---

## ✅ Consistent Patterns

These are the **reference standard** going forward:

1. **Middleware factories** — camelCase capability → `Middleware`; options as `*Options` (`cors`, `bearerAuth`, `rateLimit`, `idempotency`, `otelHttp`, …).
2. **Memory stores** — `memoryXStore` + pluggable `XStore` interface (`rateLimit`, `idempotency`).
3. **App surface** — `createApp` → `use` / `route` / `onError` / `onStart` / `onStop` → `dispatch` | `start`/`stop`.
4. **HTTP adapters** — `createFetchHandler` (portable) + `listen` (Node bind/drain); not competing verbs.
5. **Request/boot errors** — `AppError` + `ErrorCodes` + Problem Details (`problemJson` / `problemResponse` / default `onError`). `CONFIG_ERROR` for boot (`loadConfig`); `VALIDATION_ERROR` for request Zod; output schema failure → `INTERNAL_ERROR`.
6. **Construction-time programmer errors** — bare `Error` with `@zwents/<pkg>: …` (bad limits, bad CORS combo). Not Problem Details.
7. **Middleware short-circuit** — `ctx.respond(problemResponse(...))` and do **not** call `next()` (semver onion contract).
8. **Intentional duals (do not “fix”)** — Result aliases (RFC 0006); `route` / `createRoute<S>()`; `problemJson` / `problemResponse`; `DispatchInput` / `RawRouteInput`; offset **and** cursor pagination helpers.
9. **Deprecation** — `toThrowable` is marked `@deprecated` and still works (alias of `unwrapOrThrow`).
10. **No CRUD verb soup** — framework does not mix `fetch`/`get`/`retrieve` for the same concept.

---

## ⚠️ Inconsistencies Found

### 1. Wide `@zwents/http` root surface
- **Type:** Encapsulation
- **Location:** `@zwents/http` — body readers, timeout helpers, `parseSearchParams`, limit constants alongside `listen` / `createFetchHandler`
- **Description:** Deep-module ideal is a small blessed path; today’s barrel exposes adapter internals as first-class.
- **Impact:** Confusing non-breaking now; narrowing after 1.0 is **breaking**.
- **Suggested Fix:** Before 1.0, either document “advanced / adapter” section or add `@zwents/http/body` (and keep root for serve + shutdown + `toWebResponse`).

### 2. Wire codegen on `@zwents/cli` primary entry
- **Type:** Encapsulation
- **Location:** `@zwents/cli` vs `@zwents/cli/wire`
- **Description:** `./wire` is the slim app manifest API; main entry also exports parse/topo/emit/AST types.
- **Impact:** Confusing non-breaking; narrowing later is **breaking**.
- **Suggested Fix:** Move codegen to `@zwents/cli/codegen` (or document main entry as “programmatic CLI toolkit”). Keep `defineWire`/`wire` on `./wire`.

### 3. `problemSchema` incomplete vs `ProblemDetails` — **fixed**
- Was missing `instance?` / `extras?`; now aligned with `ProblemDetails`.

### 4. Generated fetch client errors are bare `Error`
- **Type:** Error Shape
- **Location:** `@zwents/openapi` `generateFetchClient`
- **Description:** On `!res.ok` the client throws `Error` with status text; does not parse Problem Details / `AppError`.
- **Impact:** Confusing non-breaking (MVP); changing throw type later is **breaking** for generated clients.
- **Suggested Fix:** Document MVP; later additive typed `ClientError` that parses `application/problem+json` when present.

### 5. `encodeCursor` uses `VALIDATION_ERROR` for programmer failures — **fixed**
- Encode failures are now bare `@zwents/schema: …` `Error`; decode stays `VALIDATION_ERROR`.

### 6. Core sometimes constructs `new AppError(...)` instead of `appError(...)`
- **Type:** Error Shape
- **Location:** `@zwents/core` `createApp` (`NOT_FOUND`, `ALREADY_STARTED`, `STOP_TIMEOUT`)
- **Description:** Preferred helper is `appError(ErrorCodes.*, opts)` (status from `DefaultStatus`).
- **Impact:** Cosmetic / non-breaking (statuses match).
- **Suggested Fix:** Standardize framework internals on `appError`.

### 7. null vs undefined for “missing”
- **Type:** Schema
- **Location:** `ctx.auth` (`null`), cursor `nextCursor`/`prevCursor` (`null`), rate-limit `key → null` (skip) vs optional fields (`undefined`)
- **Description:** Two absence dialects without a written rule.
- **Impact:** Confusing non-breaking.
- **Suggested Fix:** Document: **null = explicit empty/skip sentinel**; **undefined = omitted optional**. Keep JSON-friendly cursor nulls.

### 8. Middleware failure style: `respond` vs `throw`
- **Type:** Intuitiveness
- **Location:** auth/ratelimit/idempotency (`respond`) vs schema/http body (`throw AppError`)
- **Description:** Both hit the correct HTTP outcome; authors see two patterns.
- **Impact:** Confusing non-breaking.
- **Suggested Fix:** Style guide: expected HTTP short-circuits → `respond`+`problemResponse`; validation/adapter failures → `throw appError(...)` (shared `onError`).

### 9. Double “route” (`app.route(route({…}))`)
- **Type:** Intuitiveness / Naming
- **Location:** `@zwents/core` `App.route` + `@zwents/schema` `route`
- **Description:** Blessed RFC 0003 composition; surprising on first read. `createRoute<S>()` helps typing, not the name collision.
- **Impact:** Confusing non-breaking.
- **Suggested Fix:** Lead docs/examples with `createRoute` + `app.route(notesRoute({…}))`. Do **not** rename without major.

### 10. Auth layering (`bearerAuth` / `requireAuth` / `authorize`)
- **Type:** Intuitiveness
- **Location:** `@zwents/auth`
- **Description:** Intentional layers (`requireAuth` = `authorize(() => true)`), but easy to assume `requireAuth` alone authenticates.
- **Impact:** Confusing non-breaking.
- **Suggested Fix:** Docs: `bearerAuth` authenticates; `requireAuth`/`authorize` authorize; or use `bearerAuth({ required: true })` alone.

### 11. Low-level core exports without “advanced” labeling
- **Type:** Encapsulation
- **Location:** `compileRoute`/`matchRoute`, `ResultBrand`, `DISPATCH_INPUT_STATE_KEY`, `unwrapHandlerResult`, `composeMiddleware`
- **Description:** Useful for adapters/tests; look like app-level API. Semver already says raw `Symbol.for` keys are out of contract unless via helpers — yet some keys/brands are exported.
- **Impact:** Confusing non-breaking; un-exporting after 1.0 is **breaking**.
- **Suggested Fix:** Prefer `getDispatchInput` / `isResult`; document the rest as advanced (or subpath later).

### 12. `ReadJsonBodyOptions` alias
- **Type:** Naming
- **Location:** `@zwents/http`
- **Description:** Public alias of `ReadBodyOptions` implies JSON-specific options.
- **Impact:** Cosmetic.
- **Suggested Fix:** Prefer `ReadBodyOptions`; deprecate alias before 1.0 if unused externally.

### 13. Middleware factory naming dialects (document, don’t rename)
- **Type:** Naming
- **Location:** `idempotency` (noun) vs `rateLimit` (verb-ish) vs `otelHttp` / `securityHeaders`
- **Description:** Same role, slightly different naming flavors; still camelCase capabilities.
- **Impact:** Cosmetic.
- **Suggested Fix:** Keep as-is; document “capability name → factory” rather than force renames.

### 14. Timestamps — convention, not dual API
- **Type:** Schema
- **Location:** Framework has no shared timestamp helper; examples use unix ms; `RateLimit-Reset` uses seconds (HTTP)
- **Description:** No ISO-vs-ms conflict in the framework API itself.
- **Impact:** Docs gap.
- **Suggested Fix:** Recipe: JSON bodies prefer unix ms; rate-limit headers stay seconds.

---

## 🚨 Breaking Change Risks

| If “fixed” by… | Risk |
|----------------|------|
| Renaming middleware / store factories | Import churn — major post-1.0 |
| Dropping Result dual aliases | **Forbidden** by RFC 0006 / quality review |
| Renaming `route` / `App.route` / `createRoute` | RFC 0003 + oxlint rule target `route` |
| Narrowing `@zwents/http` or `@zwents/cli` barrels | Current wide exports are load-bearing |
| Un-exporting `compileRoute` / `matchRoute` / `ResultBrand` / `DISPATCH_INPUT_STATE_KEY` | Public today |
| Changing `ErrorCodes` names/statuses or Problem Details media type | [semver-contract.md](../semver-contract.md) |
| Changing generated client throw type to `AppError` | Breaks generated clients |
| Changing cursor/`ctx.auth` null → undefined | JSON + `if (!ctx.auth)` patterns |
| Silently removing `toThrowable` | Currently deprecated-but-functional — keep until major |

**Pre-1.0 note:** packages are `0.0.0`. Prefer additive cleanup + deprecation before 1.0 rather than silent removals.

---

## 📋 Recommended Standard

1. **Factories:** camelCase capability → `Middleware` / store; stores named `memoryXStore`.
2. **App registration:** `createApp` → `use` / `route` / `onError` / `onStart` / `onStop`.
3. **HTTP serve:** `createFetchHandler` for adapters; `listen` for Node binding + drain.
4. **Routes:** `route` / `createRoute<S>()` from `@zwents/schema`; register with `app.route(...)`.
5. **Request errors:** `appError(ErrorCodes.*, { detail, extras, cause })` (prefer over `new AppError`).
6. **Wire errors:** Problem Details via `problemResponse` / `problemJson` / default `onError`.
7. **Boot config:** `loadConfig` → `CONFIG_ERROR` only (never per-request).
8. **Factory option bugs:** bare `Error` with `@zwents/<pkg>: …` at construction time.
9. **Middleware HTTP failures:** `ctx.respond(problemResponse(...))` and do not call `next()`.
10. **Validation / body failures:** `throw appError(...)` so `onError` stays shared.
11. **Result:** RFC 0006 names; dual aliases stay; use `@deprecated` for renames, don’t silent-remove.
12. **Absence:** `null` = explicit empty/skip; `undefined` = omitted optional.
13. **Pagination:** pick offset **or** cursor per resource API; both helper families remain.
14. **JSON timestamps:** unix ms unless an HTTP header standard says otherwise.
15. **Public surface:** root entry = deep module; put body/codegen internals on subpaths **before 1.0**.
16. **Auth:** `bearerAuth` authenticates; `authorize` / `requireAuth` authorize (or `bearerAuth({ required: true })`).
17. **OpenAPI Problem docs:** keep `problemSchema` aligned with `ProblemDetails` (optional `instance` / `extras`).
18. **Generated clients:** document MVP `Error` throws; evolve via additive typed errors, not silent type change.

---

## Suggested follow-ups (optional, pre-1.0) — **done**

1. ✅ `problemSchema` includes `instance?` / `extras?`.
2. ✅ `encodeCursor` throws bare `@zwents/schema: …` `Error` (not `VALIDATION_ERROR`).
3. ✅ Style guide: [`docs/api-style.md`](../api-style.md); wide barrels blessed in [`semver-contract.md`](../semver-contract.md).
4. ✅ Generated client MVP errors documented (RFC 0003 §4.2 + `generateFetchClient` JSDoc).

Not worth renaming for cosmetics: middleware factory name dialects, `app.route(route(...))` collision (RFC).
