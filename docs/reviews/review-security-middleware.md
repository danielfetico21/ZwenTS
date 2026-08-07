# Code Review: Security Middleware Packages

Scope: `@zwents/auth`, `@zwents/security`, `@zwents/ratelimit`, `@zwents/idempotency`, `@zwents/otel` (read-only audit).

Checklist coverage: **C1**, **C4**, **C5**, **C13**, **C14** (and related header/CORS safety).

## Summary

Security middleware (CORS, request-id, security headers) is largely solid: deny-by-default CORS, credentials+`*` rejected at construction, request-id CRLF filtering, and headers merged via `ctx.responseHeaders`. Auth correctly gates anonymous/`authorize` paths at runtime, with OpenAPI meta gaps. The highest-risk findings cluster in **idempotency** (stale `complete`/`fail` after lock expiry, no tenant in default fingerprint, dead `maxKeys`) and **ratelimit** (XFF trust by default, soft `maxKeys`). OTEL tests mutate process-global provider/propagator without cleanup.

**Critical: 0 · High: 5** (plus Medium/Low below).

## Checklist status

| ID | Status | Notes |
|----|--------|-------|
| C1 | **Partial** | Expired in-flight prune + waiter reject landed (`store.ts` `pruneExpired`). Residual: stale owner `complete`/`fail` after re-key; waiters/records only pruned on next `start()`. |
| C4 | **Confirmed** | Default key trusts first `X-Forwarded-For` hop; in-memory only; `maxKeys` is not a hard ceiling while buckets remain unexpired. |
| C5 | **Confirmed** | Optional bearer fail-open on invalid tokens (tested); `authorize` must run after auth sets `ctx.auth`; OpenAPI `authorize` hardcodes `bearerAuth`. |
| C13 | **Confirmed** | Stores document single-process; `docs/reliability-notes.md` claims a `maxKeys` ceiling that idempotency does not enforce. |
| C14 | **Confirmed** | `otel` tests call `trace.setGlobalTracerProvider` / `propagation.setGlobalPropagator` and never reset. |

## ✅ Verified OK

- **CORS** (`packages/security/lib/cors.ts`): throws on `credentials` + `origin: "*"`; reflects only allowlisted/predicate origins; `Vary: Origin` when reflecting; preflight `OPTIONS` → 204 without route; no ACAO leak for denied origins.
- **Request ID** (`packages/security/lib/request-id.ts`): rejects CR/LF/NUL, spaces, oversize; does not trim before validate; concurrent isolation covered in tests.
- **Security headers** (`packages/security/lib/security-headers.ts`): applied via `ctx.responseHeaders` so 404/error paths still get them; per-header opt-out works.
- **Auth runtime gates** (`packages/auth/lib/middleware.ts`): `requireAuth` / `authorize` 401 when `ctx.auth` missing; role policy not invoked anonymously; required bearer rejects missing/invalid/empty tokens.
- **Idempotency waiter prune (recent)** (`packages/idempotency/lib/store.ts:66-76`): expired in-flight locks reject waiters then delete; covered by `packages/idempotency/tests/store.test.ts`.
- **Idempotency key safety**: unsafe header values → 400; concurrent same-key single handler execution works under `Promise.all`.
- **Ratelimit**: construction validates `limit`/`windowMs`; concurrent burst enforcement; CR/LF stripped from keys; OPTIONS skipped by default; `user:` key preferred when `ctx.auth` already set.
- **OTEL happy path**: extracts W3C context; sets `ctx.trace`; records thrown `AppError` / generic errors on the throw path; safe no-op without SDK.

## 🐛 Issues Found

### 1. Stale idempotency `complete`/`fail` after lock expiry (no fencing token)

- **Severity:** High
- **Category:** Race Condition
- **Location:** `packages/idempotency/lib/store.ts:108-133` (also prune at `66-76`, `start` at `79-106`)
- **Description:** `pruneExpired` correctly frees an abandoned in-flight key so a new request may `proceed`. The original owner’s later `complete`/`fail` still runs with only the string key: `complete` overwrites whatever record is now present (resolving the *new* owner’s waiters with the *old* response and adopting the new fingerprint), and `fail` deletes the new owner’s lock and rejects its waiters. Empty fingerprint (`existing?.fingerprint ?? ""`) is stored if the key was removed before `complete`.
- **Suggested Fix:** Generation/fencing token per in-flight lease; ignore `complete`/`fail` unless token matches. On mismatch, no-op (or fail closed for the stale owner only).

### 2. Default idempotency fingerprint is not tenant-scoped

- **Severity:** High
- **Category:** Security
- **Location:** `packages/idempotency/lib/idempotency.ts:45-61` (store key = raw header only at `136`)
- **Description:** Default fingerprint is `METHOD path` + body JSON. The store key is solely `Idempotency-Key`. Two principals reusing the same key and body (or an attacker replaying a known key+body) get a cross-user replay (`Idempotent-Replay`) of another user’s response. Route-level `requireAuth` does not partition the store.
- **Suggested Fix:** Default key or fingerprint should include `ctx.auth?.userId` (or explicit `tenantId` option). Document that custom stores/fingerprints must be tenant-aware for multi-user APIs.

### 3. Idempotency `maxKeys` is dead — unbounded store growth

- **Severity:** High
- **Category:** Memory Leak
- **Location:** `packages/idempotency/lib/store.ts:52-53,63` (`maxKeys` assigned, never enforced)
- **Description:** Options and `docs/reliability-notes.md` advertise a `maxKeys` ceiling. Only TTL prune-on-`start` runs. Unique keys (default TTL 24h) can grow the `Map` without bound — DoS via many `Idempotency-Key` values. Test at `store.test.ts:53` passes `maxKeys: 1` but only asserts TTL prune behavior.
- **Suggested Fix:** Enforce eviction (LRU / refuse new keys / drop oldest complete records) when `records.size >= maxKeys`, and add a regression test that size never exceeds the ceiling under non-expired load.

### 4. Rate-limit default key trusts client `X-Forwarded-For` / `X-Real-Ip`

- **Severity:** High
- **Category:** Security
- **Location:** `packages/ratelimit/lib/rate-limit.ts:38-48,22-24`
- **Description:** Without `ctx.auth`, the first XFF hop (or `X-Real-Ip`) becomes the bucket key. Clients can rotate spoofed headers to bypass limits, or collide others’ buckets, unless a trusted proxy overwrites these headers. Comment warns, but default is unsafe on direct exposure. Compounding footgun: if `rateLimit` is registered *before* `bearerAuth`, authenticated traffic never uses `user:` keys (see `examples/notes-api/app.ts` ordering).
- **Suggested Fix:** Default to `"anonymous"` (or connection IP from adapter when available); only enable forwarded headers behind an explicit `trustProxy: true` (or require custom `key`). Document middleware order: auth before rate limit when using user keys.

### 5. Rate-limit `maxKeys` is not a hard ceiling

- **Severity:** High
- **Category:** Memory Leak
- **Location:** `packages/ratelimit/lib/store.ts:54-72`
- **Description:** Every `hit` prunes expired buckets (good). When `size >= maxKeys`, it prunes again then **always** `set`s the new bucket with no post-check. Distinct keys inside an active window grow past `maxKeys` unboundedly (XFF rotation amplifies this). Comment at L55 overclaims “keeps memory bounded.”
- **Suggested Fix:** After prune, if still at capacity, reject the hit (fail open/closed policy) or evict oldest; never insert above `maxKeys`.

### 6. Optional bearer treats invalid tokens as anonymous

- **Severity:** Medium
- **Category:** Security
- **Location:** `packages/auth/lib/middleware.ts:91-98`
- **Description:** With `required: false`, `verify` → `null` continues without `ctx.auth` (covered by `auth-edges.test.ts`). Callers who assume “bad token ⇒ 401” can accidentally serve authenticated-shaped routes that only check optional auth. **needs discussion** whether fail-open is the intended optional-auth semantics (vs 401 on malformed/present-but-invalid).
- **Suggested Fix:** Either document prominently, or add `invalidToken: "reject" | "ignore"` (default reject when header present).

### 7. `authorize` OpenAPI meta ignores custom `securityName`

- **Severity:** Medium
- **Category:** Business Logic
- **Location:** `packages/auth/lib/middleware.ts:171-173` vs `bearerAuth` `securityName` at `67,105-114`; `requireAuth` correctly accepts `securityName` at `128-139`
- **Description:** `authorize()` always tags `require: [{ bearerAuth: [] }]`. Apps using `bearerAuth({ securityName: "apiToken" })` get mismatched OpenAPI security requirements.
- **Suggested Fix:** Accept `{ securityName?: string }` like `requireAuth`, default `"bearerAuth"`.

### 8. Bearer scheme match is case-sensitive

- **Severity:** Medium
- **Category:** Bug
- **Location:** `packages/auth/lib/middleware.ts:33-41`
- **Description:** RFC 7235 auth schemes are case-insensitive. `authorization: bearer <token>` fails `startsWith("Bearer ")` and 401s even for valid tokens.
- **Suggested Fix:** Compare scheme case-insensitively; parse token after first SP.

### 9. OTEL marks spans OK without reading response status; globals in tests

- **Severity:** Medium
- **Category:** Bug
- **Location:** `packages/otel/lib/http.ts:79-90,93-95`; tests `packages/otel/tests/http.test.ts:20-41`
- **Description:** (a) Non-throwing `ctx.respond` / handler paths with 5xx never set ERROR or `http.response.status_code` — `finishOk` always runs after `next()`. (b) Tests install a process-global tracer provider and propagator and only `shutdown()` the provider — no restore of prior globals (**C14**), risking cross-suite pollution. **needs discussion** on whether middleware should observe `ctx.response` after `next()`.
- **Suggested Fix:** After `next()`, set status from `ctx.response?.status`; in tests, save/restore or use isolated provider APIs; prefer `afterAll` cleanup of globals.

### 10. Abandoned idempotency waiters only released on a later `start()`

- **Severity:** Low
- **Category:** Memory Leak
- **Location:** `packages/idempotency/lib/store.ts:66-81`
- **Description:** Prune is opportunistic on `start` only. Idle process: expired in-flight records + waiter closures remain until some key is started. HTTP timeouts may end the client request while waiter promises still retain memory.
- **Suggested Fix:** TTL timer per in-flight record, or periodic sweep; ensure waiter reject on timer fire.

### 11. CORS / security-header config values not sanitized for CR/LF

- **Severity:** Low
- **Category:** Security
- **Location:** `packages/security/lib/cors.ts:21-30,71-84`; `packages/security/lib/security-headers.ts:66-69`
- **Description:** Reflected `Origin` (allowlist/predicate) and `extras` header values are not checked for CR/LF. Fetch `Headers` usually blocks this; hostile carriers/`extras` from untrusted config could inject. Request-id path already defends correctly.
- **Suggested Fix:** Reject/strip CR/LF/NUL on any value written to `ctx.responseHeaders`.

### 12. Idempotency caches shallow body references

- **Severity:** Low
- **Category:** Bug
- **Location:** `packages/idempotency/lib/store.ts:137-143`
- **Description:** `cloneResponse` copies `headers` but shares `body` by reference. Later mutation of a cached object mutates future replays.
- **Suggested Fix:** Structured clone / `JSON.parse(JSON.stringify)` for JSON bodies, or document immutability requirement.

## 🧪 Regression Tests Needed

1. **Idempotency fencing:** start A → advance past TTL → start B (proceed) → A `complete`/`fail` must not affect B’s record or waiters.
2. **Tenant isolation:** two different `ctx.auth.userId` values, same idempotency key + body → no cross-replay (once default key includes user).
3. **`maxKeys` hard cap (idempotency + ratelimit):** insert `maxKeys + N` distinct non-expired entries; assert size ≤ ceiling or defined overflow behavior.
4. **Ratelimit trustProxy:** default key ignores client XFF unless opted in; spoofed XFF cannot create unbounded distinct buckets when untrusted.
5. **Auth:** `authorization: bearer <valid>` succeeds; optional auth with present-invalid token policy locked to chosen semantics; `authorize({ securityName })` OpenAPI meta matches custom scheme.
6. **OTEL:** handler/`ctx.respond` 500 without throw → span ERROR + status attribute; test suite restores prior global provider/propagator.
7. **Idle idempotency prune:** in-flight past TTL with no further starts eventually rejects waiters (timer/sweep).

## needs discussion

- Optional bearer **fail-open** on invalid tokens vs reject-when-present.
- Whether default rate-limit key should ever read forwarded headers without explicit trust.
- OTEL: treat non-throw 4xx/5xx from `ctx.response` as span status signals or leave to metrics elsewhere.
- Idempotency overflow policy when hitting `maxKeys`: evict oldest complete vs 503 the new request.
