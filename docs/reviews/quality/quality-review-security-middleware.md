# Code Quality Review: Security Middleware Packages

Scope: `@zwents/auth`, `@zwents/security`, `@zwents/ratelimit`, `@zwents/idempotency`, `@zwents/otel` (lib + index; tests skimmed for consistency).

## Summary

These packages are small, readable deep modules with clear public surfaces and sensible middleware factory shapes. Maintainability pressure is mostly cross-package duplication: Problem Details response construction, CR/LF/NUL + token charset validation, and in-memory Map prune/evict scaffolding. Within packages, the worst local duplication is `securityHeaders` option wiring and idempotency’s repeated `problemJson(appError…)` blocks. Type safety is generally good; the main smells are loose `unknown` casts in auth meta / idempotency fingerprint / otel error shaping. Overall health is good — targeted extractions would pay off without a large redesign.

## ✅ Well-Structured

- **`@zwents/security` header safety seam** (`lib/header-value.ts`): tiny, focused `isSafeHeaderValue` / `assertSafeHeaderValue` used by CORS and security headers — good deep-module example.
- **Auth OpenAPI tagging** (`lib/security-meta.ts` + `withSecurityMeta` on `bearerAuth` / `requireAuth` / `authorize`): clean separation of runtime gate vs discovery metadata.
- **Pluggable stores** (`ratelimit` / `idempotency` `*Store` interfaces + `memory*` defaults): clear injection points; middleware stays free of Redis/etc.
- **Idempotency start result union** (`IdempotencyStartResult`): discriminated `proceed | replay | wait | conflict | overflow` is easy to follow at the call site.
- **CORS construction guards** (`cors.ts`): credentials + `origin: "*"` throws early; origin reflection gated by allowlist/predicate + `isSafeHeaderValue`.
- **OTEL peer-only design** (`otel/lib/http.ts`): resolves tracer per request; safe no-op without SDK; span finish split into `finishFromResponse` / `finishError`.
- **Test layout consistency**: main + `*-edges` suites for auth / ratelimit / idempotency / security; store-focused tests for idempotency eviction — matches package boundaries.

## 🔧 Refactoring Opportunities

### 1. Shared Problem Details respond helper (auth-local helpers not reused elsewhere)

- **Type:** Duplication
- **Location:**
  - `packages/auth/lib/middleware.ts:51-61` (`unauthorized` / `forbidden`)
  - `packages/auth/lib/middleware.ts:87-92,102,140,169,175` (call sites)
  - `packages/ratelimit/lib/rate-limit.ts:133-144`
  - `packages/idempotency/lib/idempotency.ts:122-128,136-142,157-164,169-176,184-190` (five near-identical blocks)
- **Description:** Auth already extracted `unauthorized`/`forbidden` as `problemJson(appError(code, { detail }).toProblemDetails(path))`. Rate limit and idempotency inline the same three-call chain repeatedly. Drift risk: status/code pairing, missing `path`, inconsistent detail wording helpers.
- **Suggested Refactor:** Add something like `problemResponse(code, path, options?)` (or `respondProblem(ctx, …)`) on `@zwents/core` next to `problemJson` / `appError`, then thin wrappers in auth. Collapse idempotency’s five blocks to one local `respondCode(ctx, code, detail)`.
- **Effort:** Small
- **needs discussion:** Whether this belongs in `@zwents/core` vs a private helper copied per package (core grows surface).

### 2. `requireAuth` / `authorize` anonymous gate + OpenAPI options duplicated

- **Type:** Duplication
- **Location:** `packages/auth/lib/middleware.ts:133-148` vs `154-184`
- **Description:** Both read `securityName ?? "bearerAuth"`, wrap with `withSecurityMeta({ require: […] })`, and 401 with `"Authentication required"` when `!ctx.auth`. `requireAuth` is effectively `authorize(() => true)` plus the same OpenAPI require blob.
- **Suggested Refactor:** Implement `requireAuth` as `authorize(() => true, options)` (or extract `gateAuthenticated(options)` used by both). Keep role-array overload only on `authorize`.
- **Effort:** Small

### 3. In-memory Map prune + seq-evict scaffolding duplicated across stores

- **Type:** Duplication
- **Location:**
  - `packages/ratelimit/lib/store.ts:44-47,49-67,71-85` (`pruneExpired`, `evictOldest`, `maxKeys`/`seq`/`clock`)
  - `packages/idempotency/lib/store.ts:79-84,86-96,109-122,126-134` (`pruneExpired`, `evictOldestComplete`, same `maxKeys`/`seq`/`clock` pattern)
- **Description:** Same structure: `Map` + `maxKeys` default `10_000` + monotonic `seq` + prune-by-expiry + scan-for-oldest-seq eviction before insert. Idempotency adds in-flight waiter rejection and complete-only eviction, but the skeleton is copy-paste. Future fixes (e.g. O(1) eviction index) would need two edits.
- **Suggested Refactor:** Extract a tiny internal helper (e.g. `createSeqMapStore({ maxKeys, isExpired, canEvict })`) — **needs discussion** on home package (`@zwents/core` util vs new `@zwents/memory-store` vs leave duplicated to preserve deep-module isolation). At minimum, align naming (`expiresAt` vs `resetAt` is fine; document the shared algorithm in one comment referencing the other).
- **Effort:** Medium

### 4. Request-id / idempotency key charset + CR/LF/NUL checks duplicated

- **Type:** Duplication
- **Location:**
  - `packages/security/lib/header-value.ts:1-3` (`isSafeHeaderValue`)
  - `packages/security/lib/request-id.ts:6,19-27` (`SAFE_REQUEST_ID` + manual `\r`/`\n`/`\0` checks + dynamic regex)
  - `packages/idempotency/lib/idempotency.ts:13,43-47` (`SAFE_KEY` + same CR/LF/NUL + `[\w.:@-]{1,256}`)
- **Description:** Request-id reimplements CR/LF/NUL instead of calling `isSafeHeaderValue`, then applies the same token charset as idempotency keys (only max length differs: 128 vs 256). Two packages can drift on allowed characters.
- **Suggested Refactor:** Expand `@zwents/security` with e.g. `isSafeToken(value, { maxLength })` (charset + `isSafeHeaderValue`). Use it from `requestId`. For idempotency: **needs discussion** — depend on `@zwents/security` vs duplicate a one-liner vs move token helper into `@zwents/core`.
- **Effort:** Small–Medium

### 5. Rate-limit `sanitizeKey` strips control chars; peers reject — inconsistent policy

- **Type:** Consistency
- **Location:**
  - `packages/ratelimit/lib/rate-limit.ts:57-62,122` (strip `\r\n\0`, truncate)
  - `packages/security/lib/request-id.ts:43` (reject → generate)
  - `packages/idempotency/lib/idempotency.ts:135-143` (reject → 400)
- **Description:** Same threat class (header/key injection via control chars) handled three ways: strip, regenerate, or 400. Stripping can collide distinct malicious keys into one bucket after cleanup — surprising vs reject semantics elsewhere.
- **Suggested Refactor:** Prefer reject/skip for unsafe rate-limit keys (or document strip-as-defense). Share the predicate from opportunity #4; keep truncate-by-`MAX_KEY_LENGTH` if needed.
- **Effort:** Small
- **needs discussion:** Changing strip → reject is a behavior change for custom `key()` returns containing control chars.

### 6. `securityHeaders` option → header mapping is copy-pasted five times

- **Type:** Duplication / Complexity
- **Location:** `packages/security/lib/security-headers.ts:23-30,41-65`
- **Description:** Each of `contentTypeOptions` / `frameOptions` / `referrerPolicy` / `strictTransportSecurity` / `permissionsPolicy` repeats `if (opt !== false) headers[name] = opt ?? DEFAULTS[name]`. Easy to miss asserting a new default or to desync option name ↔ header name.
- **Suggested Refactor:** Table-driven apply, e.g. `const SLOTS = [{ option: "frameOptions", header: "x-frame-options" }, …] as const` looped once; keep `extras` separate.
- **Effort:** Small

### 7. `setResponseHeader` lives in `request-id.ts`

- **Type:** Naming / Consistency
- **Location:** `packages/security/lib/request-id.ts:50-59` (exported via `packages/security/index.ts:7`)
- **Description:** General-purpose safe header setter is colocated with request-id middleware. Readers looking for header utilities check `header-value.ts` first; request-id file mixes correlation IDs and generic response mutation.
- **Suggested Refactor:** Move `setResponseHeader` to `header-value.ts` (or `response-headers.ts`); re-export from package index unchanged.
- **Effort:** Small

### 8. Idempotency middleware: inline type import + repeated problem responses

- **Type:** Consistency / Complexity
- **Location:**
  - `packages/idempotency/lib/idempotency.ts:74` (`response: import("@zwents/core").AppResponse`)
  - `packages/idempotency/lib/idempotency.ts:113-193` (long start-result ladder)
- **Description:** `replay` uses an inline `import()` type instead of a top-level `AppResponse` import (store.ts already imports it normally). The `start` result handling is clear but verbose; combined with five problemJson blocks (#1), the middleware file is harder to scan than the store.
- **Suggested Refactor:** Normal `import type { AppResponse }`; local `respondProblem(ctx, code, detail)` helper; optionally small `handleStartResult` switch for readability (optional — KISS may prefer leaving the ladder).
- **Effort:** Small

### 9. Lease ownership check duplicated in `complete` / `fail`

- **Type:** Duplication
- **Location:** `packages/idempotency/lib/store.ts:161-169` and `184-191`
- **Description:** Identical guard: record exists, `status === "in-flight"`, `lease` matches — otherwise no-op. Easy to update one path and forget the other.
- **Suggested Refactor:** `function takeInFlight(key, lease): InFlightRecord | undefined` used by both `complete` and `fail`.
- **Effort:** Small

### 10. OTEL error shaping ducks `AppError` instead of using `isAppError`

- **Type:** Type Safety / Consistency
- **Location:** `packages/otel/lib/http.ts:28-36,106-124`
- **Description:** `asErrorLike` casts any object to `{ code?: string; status?: number }`. Core already exports `isAppError` with proper narrowing. Duck typing can mis-attribute random thrown objects that happen to have `code`/`status`.
- **Suggested Refactor:** Prefer `isAppError(error)` for the AppError branch; keep a narrow fallback for unknown throws.
- **Effort:** Small

### 11. Auth `SecurityAwareMiddleware` typed with `unknown` parameters

- **Type:** Type Safety
- **Location:** `packages/auth/lib/security-meta.ts:33-36,38-42,45-51`
- **Description:** Tagged middleware type is `(ctx: unknown, next: unknown) => unknown`, then cast through `as`. This erases `Middleware` / `Middleware<S>` at the meta boundary. `withSecurityMeta`’s `T extends (...args: never[]) => unknown` is awkward for callers typing middleware.
- **Suggested Refactor:** Constrain `T extends Middleware` (or `Middleware<any>` / generic `S`) and type `[SECURITY_META]` on that; keep `getSecurityMeta(middleware: unknown)` for discovery from untyped arrays.
- **Effort:** Small
- **needs discussion:** Avoid pulling a hard dependency cycle if `Middleware` typing changes; current looseness may be intentional for openapi’s duplicated reader.

### 12. Construction-time numeric validation ordering inconsistent

- **Type:** Consistency
- **Location:**
  - `packages/ratelimit/lib/rate-limit.ts:93-98` (validate `limit`/`windowMs` before resolving store/defaults)
  - `packages/idempotency/lib/idempotency.ts:95-111` (resolve defaults/`ttlMs`, then validate)
- **Description:** Same class of guard (`Number.isFinite` + `≥ 1`) applied at different points in the factory. Minor, but new middleware will copy whichever pattern is nearest.
- **Suggested Refactor:** Validate raw options first, then apply defaults (ratelimit style). Optional shared `assertPositiveNumber(name, value)` in core — only if a third caller appears.
- **Effort:** Small

### 13. Fingerprint body extract uses structural cast

- **Type:** Type Safety
- **Location:** `packages/idempotency/lib/idempotency.ts:57-69`
- **Description:** Reads `ctx.state.get("@zwents/dispatchInput")` then `input as { body: unknown }` after a partial object check. Works, but the cast bypasses a shared type for dispatch input if one exists (or should exist) in core/schema.
- **Suggested Refactor:** **needs discussion** — export a typed accessor/type guard for `@zwents/dispatchInput` from the package that sets it; use that in `defaultFingerprint` instead of ad-hoc cast.
- **Effort:** Medium

### 14. `requestId` rebuilds RegExp when `maxLength !== 128`

- **Type:** Complexity
- **Location:** `packages/security/lib/request-id.ts:24-27`
- **Description:** Hot path can allocate `new RegExp(\`^[\\w.:@-]{1,${maxLength}}$\`)` per request when custom `maxLength` is set. Unnecessary vs length check + charset test without embedding max in the regex (`SAFE_REQUEST_ID` already implies max 128; for custom max, test `/^[\w.:@-]+$/` + `length <= maxLength`).
- **Suggested Refactor:** `if (!/^[\w.:@-]+$/.test(value)) return false; return value.length <= maxLength` (after empty/CRLF checks). Removes dynamic RegExp and the `DEFAULT_MAX_LENGTH` special case.
- **Effort:** Small

## 📋 Priority Recommendations

1. **Core (or local) `problemResponse` + use in auth / ratelimit / idempotency** — highest DRY payoff; idempotency alone has five copies (**#1**, ties **#8**).
2. **Share safe-token validation; align rate-limit key policy with reject-or-document** (**#4**, **#5**) — one charset/CRLF story across security middleware.
3. **Table-drive `securityHeaders` + move `setResponseHeader` beside `header-value`** (**#6**, **#7**) — small, local, no cross-package debate.
4. **Collapse auth `requireAuth` onto `authorize` + tighten `withSecurityMeta` generics** (**#2**, **#11**) — less auth surface to keep in sync.
5. **Map-store prune/evict helper** (**#3**) — **needs discussion** on package home; only worth it if you expect more in-memory stores or eviction algorithm changes.
