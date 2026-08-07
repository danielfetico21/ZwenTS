# Code Quality Review: packages/core + packages/http

## Summary

Overall health is strong: both packages stay close to deep-module shape (small public barrels, focused `lib/` files), naming is consistent with RFCs, and the Result / Problem Details / middleware pipeline read clearly. Maintainability drag is concentrated in a few places — repeated abort→`AppError` mapping in `@zwents/http`, a Hono pass-through that adds little, `body.ts` size, and several type-erasure / incomplete public-API seams in `@zwents/core` — not in sprawling god-objects or inconsistent style across the tree.

**Largest files in scope (candidates to split if they keep growing):**

| File | Lines | Note |
|------|------:|------|
| `packages/http/lib/body.ts` | 375 | Highest split value (limited read / multipart / parse) |
| `packages/core/lib/app.ts` | 260 | Dispatch + lifecycle in one closure |
| `packages/core/lib/result.ts` | 172 | Fine as a single helpers module |
| `packages/http/lib/listen.ts` | 169 | Drain/close + adapter wiring |
| `packages/core/lib/route.ts` | 135 | Compile + match — cohesive |
| `packages/http/lib/fetch-handler.ts` | 117 | Fine |
| `packages/http/lib/timeout.ts` | 101 | Would shrink if abort helper is extracted |

## ✅ Well-Structured

- **`composeMiddleware`** (`packages/core/lib/middleware.ts`) — classic Koa-style dispatcher; small, testable, no framework leakage.
- **`errors.ts` + `response.ts` + `result-http.ts`** — clear separation: domain errors → Problem Details → `AppResponse`; handlers can stay Result-oriented without knowing HTTP adapters.
- **`createApp` fluent surface** (`use` / `route` / `onError` / lifecycle) — readable registration API; `dispatch` is a good engine-agnostic seam for tests and adapters.
- **`parseSearchParams`** (`packages/http/lib/query.ts`) — tiny, single-purpose, correct repeated-key behavior.
- **`installProcessSignals`** (`packages/http/lib/shutdown.ts`) — deep enough for its job (idempotent shutdown, testable `exit` hook) without over-abstraction.
- **Result aliases** (`attempt` / `tryAsync` / `andTee` / `toThrowable`) — intentional neverthrow-inspired dual names (RFC 0006), not accidental cruft.

## 🔧 Refactoring Opportunities

### 1. Abort reason → AppError mapping repeated many times
- **Type:** Duplication
- **Location:**
  - `packages/http/lib/timeout.ts:28-36` (parent already aborted)
  - `packages/http/lib/timeout.ts:40-48` (`onParentAbort`)
  - `packages/http/lib/timeout.ts:72-81` (`whenAborted` sync path)
  - `packages/http/lib/timeout.ts:88-96` (`whenAborted` listener)
  - `packages/http/lib/body.ts:36-44` (`throwIfAborted`)
  - `packages/http/lib/body.ts:110-118` (inline race reject — same logic again)
- **Description:** The pattern `isAppError(reason) ? reason : appError(REQUEST_TIMEOUT, { detail, cause })` is copy-pasted with slight detail-string drift (`"Request aborted"` vs `"Request aborted while reading body"`). Future changes to abort semantics must be edited in six places.
- **Suggested Refactor:** Extract `abortReasonAsAppError(reason, detail?)` (or fold into `throwIfAborted` + reuse from `whenAborted` / `createTimeoutSignal` / the `readBytesLimited` race). Keep detail strings as parameters.
- **Effort:** Small

### 2. `listen` rebuilds `Response` instead of reusing `toWebResponse`
- **Type:** Duplication
- **Location:**
  - `packages/http/lib/listen.ts:86-93` (draining 503 path: `JSON.stringify` + `new Response`)
  - `packages/http/lib/fetch-handler.ts:30-56` (`toWebResponse`)
  - `packages/http/lib/fetch-handler.ts:117` (exported from lib, **not** from `packages/http/index.ts`)
- **Description:** Drain rejection hand-rolls what `toWebResponse(problemJson(...))` already does (status, headers, JSON body). The helper is exported from the implementation file but omitted from the package entry — so `listen` cannot import it via the public entry without a barrel change, and the duplicate is the path of least resistance.
- **Suggested Refactor:** Use `toWebResponse(problemJson(...))` in `listen`; either keep `toWebResponse` package-private (same-package `lib/` import is fine per packages/README) or export it from `index.ts` if adapters need it.
- **Effort:** Small

### 3. Hono is a no-op router around the fetch handler
- **Type:** Complexity
- **Location:** `packages/http/lib/listen.ts:104-112` (`new Hono()` + `hono.all("*", …)` + `serve({ fetch: hono.fetch })`); dependency in `packages/http/package.json` (`hono`)
- **Description:** All routing/middleware already lives in `@zwents/core`. Hono only forwards `c.req.raw` to `createFetchHandler`. That is a shallow wrapper: extra dependency, mental model (“is routing in Hono or ZwenTS?”), and a larger install surface for zero behavior.
- **Suggested Refactor:** Pass the fetch handler directly to `@hono/node-server`’s `serve({ fetch: fetchHandler, … })` and drop the `hono` dependency **if** the node-server API accepts a bare `(Request) => Response` (it should). **needs discussion** — keep Hono only if a near-term plan uses its router/middleware.
- **Effort:** Small

### 4. `body.ts` concentrates three concerns (375 lines)
- **Type:** Complexity
- **Location:** `packages/http/lib/body.ts` (whole file; esp. `readBytesLimited` ~86-159, `readMultipartBody` ~214-307, `parseRequestBody` ~319-367)
- **Description:** Streaming byte cap, multipart field/file limits, and content-type orchestration share abort/limit helpers but are independently evolvable. The file is the largest in scope and the main place HTTP body policy grows.
- **Suggested Refactor:** Split into e.g. `body-read.ts` (bytes/text + `throwIfAborted` / `concatBytes` / `assertMaxBytes`), `body-multipart.ts`, `body-parse.ts` (orchestration + re-exports), with `body.ts` as a thin barrel **or** update `index.ts` to export from the new modules. Prefer internal split first to avoid public API churn.
- **Effort:** Medium

### 5. `matchRoute` is public but its input type is not
- **Type:** Type Safety / Dead Code / Consistency
- **Location:**
  - `packages/core/index.ts:38` — exports `matchRoute`
  - `packages/core/lib/route.ts:73-78` — `CompiledRoute` is **not** exported
  - `packages/core/lib/route.ts:99-107` — `compileRoute` exists but is **not** in `index.ts`
  - No external callers (only `app.ts:144`); core tests do not use `matchRoute` via the entry
- **Description:** Callers outside the package cannot construct a typed `CompiledRoute[]` without reaching into `lib/` (forbidden by packages/README). The export looks like a public matching API but is incomplete — effectively dead/unusable surface.
- **Suggested Refactor:** Either (a) export `compileRoute` + `CompiledRoute` alongside `matchRoute`, or (b) stop exporting `matchRoute` and treat compile/match as package-private to `createApp`. **needs discussion** which surface you want long-term (OpenAPI/CLI may want matching later).
- **Effort:** Small

### 6. Dispatch input is `unknown` + magic state key; shape is really `RawRouteInput`
- **Type:** Type Safety / Consistency
- **Location:**
  - `packages/core/lib/app.ts:45` — `DispatchRequest.input?: unknown`
  - `packages/core/lib/app.ts:142` — `ctx.state.set("@zwents/dispatchInput", request.input)` (stringly key)
  - `packages/core/lib/app.ts:162-174` — runtime object guard + `as Record<string, unknown>` + string-index fields
  - `packages/core/lib/route.ts:20-28` — `RawRouteInput` already models params/query/body/raw/files
  - Cross-package consumer: `packages/idempotency/lib/idempotency.ts:57` — `ctx.state.get("@zwents/dispatchInput")` with another cast
- **Description:** Adapters and core already agree on a structured input, but types do not. The magic state key couples idempotency to a private convention with no shared constant or typed accessor.
- **Suggested Refactor:** Type `DispatchRequest.input` as something like `Omit<RawRouteInput, "params">` (params come from the matcher). Export a `DISPATCH_INPUT_STATE_KEY` (or `getDispatchInput(ctx)`) from `@zwents/core` and use it in idempotency. Narrow in `dispatch` without `Record` string indexing.
- **Effort:** Medium

### 7. Route generics erased at registration
- **Type:** Type Safety
- **Location:**
  - `packages/core/lib/app.ts:105-107` — `compileRoute(definition as RouteDefinition)`
  - `packages/core/lib/app.ts:92-93` — `routes` getter casts `as RouteDefinition<S>`
  - `packages/core/lib/route.ts:68-78` — `RouteMatch` / `CompiledRoute` store unparameterized `RouteDefinition`
- **Description:** `App.route` accepts `RouteDefinition<S, TInput, TOutput>`, then immediately widens to bare `RouteDefinition`. Handlers lose input typing at the storage boundary (tests compensate with casts, e.g. `packages/core/tests/app.test.ts:73`). Acceptable for MVP storage, but it blocks stronger typed dispatch later.
- **Suggested Refactor:** Parameterize `CompiledRoute<S>` at least for services `S`; keep `TInput`/`TOutput` erased if necessary, or store handler as `Handler<S, RawRouteInput, unknown>` after adapter assembly. Full end-to-end typed input likely belongs with `@zwents/schema` — **needs discussion** how much core should preserve.
- **Effort:** Medium (Large if pursuing full TInput inference through `dispatch`)

### 8. `createApp` mixes request dispatch and process lifecycle
- **Type:** Complexity
- **Location:** `packages/core/lib/app.ts:28-30` / `193-256` (start/stop hooks, in-flight locks, stop timeout race) vs `125-191` (`dispatch` pipeline)
- **Description:** One 260-line closure owns middleware registry, route table, error handler, dispatch, and start/stop serialization. Each concern is clear locally, but the file is the second-largest in core and the lifecycle block is independently testable/reasoned about.
- **Suggested Refactor:** Extract `createLifecycle({ startHooks, stopHooks })` → `{ start, stop, get started }` used inside `createApp`; leave fluent registration + `dispatch` in `app.ts`. Do **not** split unless lifecycle keeps growing.
- **Effort:** Medium

### 9. `composeProviders` container typing is intentionally shallow
- **Type:** Type Safety
- **Location:** `packages/core/lib/compose.ts:6-8`, `24-37` (`ProviderMap` = `Record<string, (deps: Record<string, unknown>) => unknown>` + final cast)
- **Description:** Providers cannot name typed dependencies; seeds and factories are `unknown`-shaped. Comments defer real safety to Wire codegen (RFC 0005). Fine as MVP, but easy for app code to rely on casts (see `packages/core/tests/compose.test.ts`).
- **Suggested Refactor:** Short-term: small generic helper overload or typed `seeds` + inferred keys. Long-term: leave as-is until codegen. **needs discussion** — avoid polishing a surface that Wire will replace.
- **Effort:** Small (incremental) / Large (real typed DI without codegen)

### 10. Inline `import("./…")` types vs normal `import type`
- **Type:** Consistency / Naming
- **Location:**
  - `packages/core/lib/route.ts:31`, `63`
  - `packages/core/lib/context.ts:36`, `41`, `74`
  - `packages/http/lib/listen.ts:15` (`import("@zwents/core").StartOptions`)
- **Description:** Most of the package uses top-level imports; these files use inline type imports. There is no runtime cycle that requires the inline form (`import type` is erased). Slightly harder to grep and inconsistent with `middleware.ts` / `app.ts`.
- **Suggested Refactor:** Replace with `import type { RequestContext } from "./context.js"` (etc.) at file top.
- **Effort:** Small

### 11. Multipart default constants exported inconsistently
- **Type:** Consistency / Dead Code
- **Location:**
  - `packages/http/lib/body.ts:29-34` — defaults defined
  - `packages/http/lib/body.ts:370-375` — exports `DEFAULT_MAX_BODY_BYTES`, `DEFAULT_MULTIPART_MAX_BYTES`, `DEFAULT_MAX_FILE_BYTES`, `DEFAULT_MAX_FILES`
  - **Not exported:** `DEFAULT_MAX_FIELD_BYTES`, `DEFAULT_MAX_FIELDS`
  - `packages/http/index.ts:5-15` — mirrors the partial export set
  - `packages/http/lib/body.ts:369` — `ReadJsonBodyOptions` alias of `ReadBodyOptions` (name suggests JSON-only; type is generic body options)
- **Description:** Callers can align with some defaults but not field limits; the `ReadJsonBodyOptions` alias is a naming leftover that obscures the real type.
- **Suggested Refactor:** Export the remaining defaults (or none of them and document only via option docs). Prefer one options type name (`ReadBodyOptions`) and deprecate/remove `ReadJsonBodyOptions` if unused outside. **needs discussion** before removing the alias (semver / public surface).
- **Effort:** Small

### 12. GET/HEAD empty-body guards duplicated across body readers
- **Type:** Duplication
- **Location:**
  - `packages/http/lib/body.ts:182-184` (`readJsonBody`)
  - `packages/http/lib/body.ts:203-205` (`readRawBody`)
  - `packages/http/lib/body.ts:218-220` (`readMultipartBody`)
  - `packages/http/lib/body.ts:323-325` (`parseRequestBody`)
- **Description:** Same method check with different empty returns. Low severity, but easy to miss one path if method policy changes (e.g. treating `OPTIONS`).
- **Suggested Refactor:** `function isBodylessMethod(method: string): boolean` plus a tiny helper that returns the appropriate empty `ParsedRequestBody` / value. Only worth it when touching `body.ts` for the split (#4).
- **Effort:** Small

## 📋 Priority Recommendations

1. **Extract abort→`AppError` helper** (#1) — best DRY win; touches the hottest reliability path in http; Small effort.
2. **Dedupe drain `Response` via `toWebResponse`** (#2) — immediate consistency between success and shutdown paths; Small.
3. **Decide Hono’s role in `listen`** (#3) — drop the pass-through router or document why it stays; Small, clears a shallow dependency.
4. **Fix `matchRoute` public API completeness** (#5) — export compile types or un-export match; stops a misleading barrel export; Small.
5. **Type dispatch input + shared state key** (#6) — pays off in idempotency and adapter code; Medium; do before more middleware reads `@zwents/dispatchInput`.

Split `body.ts` (#4) next if multipart/limits keep growing; defer deep `composeProviders` typing (#9) and full route generic preservation (#7) until Wire/schema direction is settled (**needs discussion**).
