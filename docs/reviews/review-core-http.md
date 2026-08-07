# Code Review: `@zwents/core` + `@zwents/http`

## Summary

Read-only audit of `packages/core/**` and `packages/http/**` against `docs/reviews/bugs-checklist.md` (C2, C3, C6, C7, C11) plus an independent pass for bugs, security, leaks, races, and business-logic gaps. Overall health is solid for the MVP surface: middleware composition, Problem Details mapping, JSON/raw streaming body caps, and drain/close serialization look intentional and tested. The main open risks are request-timeout race cleanup (C7), multipart size enforcement that depends on `Content-Length` (C11), and `app.stop()` retry overlapping an orphaned first attempt (C6).

### Checklist cross-check

| ID | Status | Notes |
|----|--------|-------|
| **C2** | Verified OK | `listen().close()` serializes via `closeInFlight`; concurrent close covered by tests. |
| **C3** | Verified OK | Abort / oversize paths `cancel()` the reader then `releaseLock()` in `finally`. |
| **C6** | Still open | Leaving `started === true` on `STOP_TIMEOUT` is intentional and tested; orphaned in-flight stop hooks on retry remain a race. |
| **C7** | Still open | `Promise.race([work, whenAborted(...)])` does not attach a sink to the losing `work` promise → unhandled rejection when timeout wins and work later rejects. |
| **C11** | Still open | Multipart `maxBytes` is Content-Length-only; `formData()` / file buffers are not stream-capped. |

## ✅ Verified OK

- **`composeMiddleware`** (`packages/core/lib/middleware.ts:20-40`) — Koa-style left-to-right composition; double-`next()` throws; order covered by tests.
- **`createApp.dispatch` pipeline** (`packages/core/lib/app.ts:121-180`) — App + route middleware, short-circuit via `ctx.respond`, Result unwrap, default/`onError` Problem Details, `responseHeaders` merge on success and error.
- **`app.start` / successful `app.stop`** (`packages/core/lib/app.ts:183-228`) — Start hooks forward, stop hooks reverse; concurrent `stop()` shares `stopInFlight` (tested in `packages/http/tests/shutdown.test.ts`).
- **C2 `listen().close()` serialization** (`packages/http/lib/listen.ts:135-148`) — Concurrent `close()` returns the same promise; `closed` gate makes later calls idempotent; drain + 503 while draining behave as documented.
- **C3 body abort / oversize cleanup** (`packages/http/lib/body.ts:83-156`) — Streaming read enforces byte cap; on abort/oversize, `reader.cancel()` then `releaseLock()`; abort races covered in `body-edges.test.ts`.
- **JSON/raw size limits** (`packages/http/lib/body.ts:64-78`, `300-347`) — Content-Length pre-check + streaming total; defaults (1 MiB) applied in `createFetchHandler`.
- **`createTimeoutSignal` / timer clear** (`packages/http/lib/timeout.ts:12-68`, `packages/http/lib/fetch-handler.ts:105-107`) — Parent abort propagation; timer + parent listener cleared in `finally`.
- **`installProcessSignals`** (`packages/http/lib/shutdown.ts:21-58`) — Duplicate signals ignored while shutting down; uninstall removes listeners.
- **Result helpers + `unwrapHandlerResult`** (`packages/core/lib/result.ts`, `result-http.ts`) — Branding avoids mistaking domain `{ ok }` JSON for `Result`; err path throws into the error handler.
- **Request isolation** (`packages/core/lib/context.ts:64-92`) — Fresh `state` Map / `responseHeaders` per dispatch.

## 🐛 Issues Found

### 1. Fetch-handler timeout race can leave unhandled rejections (C7)

- **Severity:** High
- **Category:** Race Condition / Bug
- **Location:** `packages/http/lib/fetch-handler.ts:75-99` (race); `packages/http/lib/timeout.ts:71-100` (`whenAborted`)
- **Description:** When `requestTimeoutMs > 0`, the handler does `Promise.race([work, whenAborted(timeout.signal)])`. If the abort side wins, `work` keeps running. Body reads and handlers that observe the aborted signal typically reject afterward; that rejection is not attached to a `.catch()` / `void work.catch(...)`, so Node can emit `unhandledRejection`. The existing 408 test (`packages/http/tests/limits.test.ts:161-178`) uses a handler that *resolves* after timeout, so it does not catch this path. Separately, when `work` wins, the losing `whenAborted` promise retains an `abort` listener until GC of the controller cycle — low practical impact, but cleanup is asymmetric (**needs discussion** whether to abort-on-clear or explicitly cancel the waiter).
- **Suggested Fix:** Always settle both sides: e.g. `void work.catch(() => undefined)` after the race (or `AbortSignal.any` + structured cancellation), and/or wrap `work` so post-timeout failures are swallowed/logged. Optionally clear `whenAborted` by aborting a linked controller in `finally` so the waiter never stays pending.

### 2. Multipart `maxBytes` is not enforced on the stream (C11)

- **Severity:** High
- **Category:** Security
- **Location:** `packages/http/lib/body.ts:219-244` (`rejectIfContentLengthTooLarge` then `request.formData()`); defaults at lines 28-31; docs acknowledge CL preference in `docs/body-recipe.md`
- **Description:** Total multipart size is checked only via `Content-Length`. If the header is missing or understated, `request.formData()` buffers the entire payload with no streaming byte cap. An attacker can force large in-memory allocations. Per-file limits run *after* `file.arrayBuffer()` (`body.ts:264-270`), so oversized parts are fully buffered before rejection. Non-file field values have a count cap (`maxFields`) but no per-field byte cap.
- **Suggested Fix:** Pre-read with `readBytesLimited` (or a streaming multipart parser) using `multipart.maxBytes`, then parse; enforce per-field max size; reject when `Content-Length` is absent if policy requires it; check file size before retaining buffers when the platform allows (or parse streamingly).

### 3. `STOP_TIMEOUT` leaves orphaned stop hooks that overlap retries (C6)

- **Severity:** High
- **Category:** Race Condition / Business Logic
- **Location:** `packages/core/lib/app.ts:195-228`
- **Description:** On timeout, `Promise.race` rejects and `started` stays `true` (intentional; tested). The losing `run()` is not cancelled and continues executing stop hooks. `stopInFlight` is cleared in `finally`, so a retry can start a second `run()` while the first is still awaiting a slow hook — double `onStop` execution (e.g. double server close / pool teardown). The retry test (`packages/http/tests/shutdown.test.ts:47-70`) expects `attempts === 2` but does not assert non-overlap.
- **Suggested Fix:** Keep `stopInFlight` until the first `run()` fully settles (even after surfacing `STOP_TIMEOUT` to the caller), or cancel/AbortSignal stop hooks and ignore further hook work after timeout; document whether retry re-runs already-completed hooks.

### 4. Concurrent `app.start()` can run start hooks twice

- **Severity:** Medium
- **Category:** Race Condition
- **Location:** `packages/core/lib/app.ts:183-193`
- **Description:** `started` is set only after all start hooks complete. Two overlapping `start()` calls can both pass `if (started)` before either finishes, duplicating side effects. Unlike `stop()`, there is no `startInFlight` gate.
- **Suggested Fix:** Mirror `stopInFlight` with a `startInFlight` promise (second caller awaits or gets `ALREADY_STARTED`).

### 5. Malformed path params throw from `decodeURIComponent`

- **Severity:** Medium
- **Category:** Bug
- **Location:** `packages/core/lib/route.ts:119-124`
- **Description:** `decodeURIComponent(value)` throws `URIError` on sequences like `%` or `%zz`. That escapes the router as an uncaught exception and becomes a generic 500 `INTERNAL_ERROR` instead of 400/`NOT_FOUND`.
- **Suggested Fix:** Try/catch and treat as no-match or `VALIDATION_ERROR` / 400.

### 6. Failed `server.close` then later `close()` reports success

- **Severity:** Medium
- **Category:** Bug
- **Location:** `packages/http/lib/listen.ts:139-147`
- **Description:** `closed = true` is set before `await closeServer()`. If `server.close` rejects, concurrent waiters see the rejection, but a later `close()` hits `if (closed) return Promise.resolve()` and reports success despite a failed close.
- **Suggested Fix:** Set `closed = true` only after successful close; or remember the failure and re-reject; clear/reset `closeInFlight` carefully so retries can re-attempt close.

### 7. `onError` handler exceptions escape `dispatch`

- **Severity:** Medium
- **Category:** Bug
- **Location:** `packages/core/lib/app.ts:176-180`
- **Description:** The `catch` block awaits `errorHandler` with no nested try/catch. If the custom handler throws, `dispatch` rejects instead of returning Problem Details — adapters may turn that into an unexpected 500/crash path.
- **Suggested Fix:** Nested catch that falls back to `defaultErrorHandler` / `toProblemDetails`.

### 8. Multipart string fields unbounded by size (C11 related)

- **Severity:** Medium
- **Category:** Security
- **Location:** `packages/http/lib/body.ts:250-261`
- **Description:** Only `maxFields` is enforced for non-file parts. A single huge text field (within a missing/understated Content-Length body) can dominate memory even if file caps are tight.
- **Suggested Fix:** Add `maxFieldBytes` (and optionally total decoded field bytes) and enforce while iterating `form.entries()`.

### 9. Duplicate query keys: last value wins

- **Severity:** Low
- **Category:** Business Logic
- **Location:** `packages/http/lib/fetch-handler.ts:77`
- **Description:** `Object.fromEntries(url.searchParams.entries())` collapses repeated keys to the last value. Callers expecting arrays (`?tag=a&tag=b`) silently lose data. **Needs discussion** if schema/OpenAPI should model multi-value query params.
- **Suggested Fix:** Document current behavior; or collect `string | string[]` when duplicates appear.

### 10. Partial start failure retries re-run successful hooks

- **Severity:** Low
- **Category:** Business Logic
- **Location:** `packages/core/lib/app.ts:183-193`
- **Description:** If start hook N throws, earlier hooks have already run and `started` stays false. A later `start()` re-runs all hooks (possible double-connect). **Needs discussion** whether start should be transactional or idempotent-by-convention.
- **Suggested Fix:** Document “start hooks must be idempotent”; or track completed hooks / provide compensating rollback.

## 🧪 Regression Tests Needed

- **C7:** Timeout wins during body read (slow/streaming POST) → response 408 **and** process emits no `unhandledRejection` (listen to `process.on('unhandledRejection')` for the test window).
- **C7:** Timeout wins while handler throws after abort → still no unhandled rejection; optional assert orphaned work is sunk.
- **C7 (optional):** After successful fast request with timeout enabled, assert abort waiter does not fire later / no leaked timer (fake timers).
- **C11:** Multipart POST with **no** `Content-Length` (or understated CL) and body larger than `multipart.maxBytes` → `PAYLOAD_TOO_LARGE` without unbounded buffering (stream or pre-cap).
- **C11:** Single text field larger than a new `maxFieldBytes` → rejected; oversized file rejected without retaining buffer longer than necessary.
- **C6:** First `stop({ timeoutMs: small })` times out; assert first slow hook is still in-flight; second `stop()` must not interleave (e.g. mutex / attempt counter with overlap detector); or document and test the chosen “wait for orphan” semantics.
- **`start()`:** Concurrent double `start()` → one `ALREADY_STARTED` or single shared in-flight; start hooks run once.
- **Routing:** `GET /users/%zz` (or `/%`) → 400/404 Problem Details, not uncaught `URIError` / opaque 500.
- **`listen.close`:** Mock `server.close` failure → first `close()` rejects; subsequent `close()` either retries or rejects with the same error (not a silent resolve).
- **`onError`:** Custom handler that throws → `dispatch` still returns 500 Problem Details.
- **Query:** `?q=1&q=2` documented expectation (last-wins vs array) covered by an explicit test once behavior is chosen.
