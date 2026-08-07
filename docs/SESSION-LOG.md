# Session log

Living checklist for ZwenTS implementation progress.

## Done

- [x] Bootstrap (pnpm, TS7, Oxlint, deep modules, CI)
- [x] `@zwents/core` — app, middleware, errors, lifecycle, `composeProviders`
- [x] `@zwents/schema` — Zod `route()` + `errors` map
- [x] `@zwents/http` — Hono `listen()`
- [x] `@zwents/config` — `loadConfig`
- [x] `@zwents/test` — `startTestApp`
- [x] `@zwents/openapi` — OpenAPI 3.1 + `generateFetchClient`
- [x] `@zwents/cli` — `zwen routes|openapi|client|check`
- [x] `@zwents/oxlint-plugin` — framework lint rules
- [x] OpenAPI drift CI
- [x] RFC 0001–0006 Accepted
- [x] `@zwents/auth` — bearer + authorize
- [x] RFC 0004 Problem Details profile
- [x] `@zwents/otel` + [docs/otel-recipe.md](./otel-recipe.md)
- [x] Route `errors` → OpenAPI responses
- [x] Client codegen (`zwen client`)
- [x] Result helpers (Tier A/B + HTTP unwrap) — [RFC 0006](./rfcs/0006-result-helpers.md), [recipe](./result-recipe.md)
- [x] `@zwents/security` — `cors`, `securityHeaders`, `requestId` (+ core `responseHeaders`)
- [x] `@zwents/ratelimit` — fixed-window + pluggable store; `ErrorCodes.RATE_LIMITED`
- [x] `@zwents/http` — `maxBodyBytes` (1 MiB) + `requestTimeoutMs` (30s); `PAYLOAD_TOO_LARGE` / `REQUEST_TIMEOUT`
- [x] `@zwents/idempotency` — `Idempotency-Key`, fingerprint conflict, in-flight wait; core `ctx.response`
- [x] Pagination helpers in `@zwents/schema` — offset/cursor query + page builders + cursor codec
- [x] Graceful shutdown — drain + 503, `installProcessSignals`, [recipe](./shutdown-recipe.md)
- [x] `examples/notes-api` — auth + notes CRUD + idempotency; [db-recipe](./db-recipe.md)
- [x] Raw body + multipart — `rawBody`, `input.files`; [body-recipe](./body-recipe.md)
- [x] OpenAPI securitySchemes from `@zwents/auth` metadata (`generateOpenApi`)
- [x] Semver contract — [semver-contract.md](./semver-contract.md)
- [x] Production backlog [TODO-production.md](./TODO-production.md) items 1–10
- [x] OpenAPI `$ref` / `components.schemas` registry (`schemaRefs`, Zod `.meta({ id })`)
- [x] Richer fetch client types (schema `$ref` → TS types, typed body + 200 JSON)
- [x] `zwen gen:wire` — `defineWire` / `wire` + AST codegen (RFC 0005); notes-api example
- [x] Test coverage ~99% lines (`pnpm test:coverage`)
- [x] Reliability pass — races/leaks notes + store prune + serialized `listen.close` ([reliability-notes.md](./reliability-notes.md))
- [x] Parallel code audit — [reviews/](./reviews/) (`review-summary.md`, 0 Critical / 12 High)
- [x] High-fix sprint H1–H12 — timeout/stop, idempotency fencing+scope+maxKeys, multipart stream cap, ratelimit trustProxy+maxKeys, OpenAPI param `$ref`, wire/client ident sanitize
- [x] Medium-fix sprint — auth (invalidToken/scheme/securityName), client init/Headers, output→500, demo auth gate, start serialization, decodeURI 404, onError fallback, close retry, maxFieldBytes, otel status
- [x] Low-fix pass — rawBody fail-closed, CORS/extras CR/LF, query multi-value, start resume, idempotency sweep, CLI cwd gate (skipped oxlint heuristic + OTEL API limit)
- [x] Code quality audit (document-only) — [`docs/reviews/quality/`](./reviews/quality/) (`quality-review-summary.md` + 3 module reviews + tooling baseline)
- [x] Quality Batch 1 (“DRY week”) — `abortReasonAsAppError`, `problemResponse`, securityHeaders table + `setResponseHeader` move, `requireAuth`→`authorize`, openapi `idents.ts`, otel `isAppError`, idempotency `takeInFlight`; listen without Hono wrapper
- [x] Quality Batch 2 (“File splits”) — openapi `json-schema`/`components`/`operations`; wire `parse`/`topo`/`emit`; http `body-read`/`body-multipart`/`body-parse` (public barrels unchanged)
- [x] Quality Batch 3 (API/DX) — `DispatchInput`/`getDispatchInput`, `createRoute<S>()`, client query params, `isSafeToken` + ratelimit skip-unsafe; [proposal](./proposals/quality-batch-3.md)
- [x] Quality Batch 4 (polish) — `problemSchema`, `formatZodIssues` (schema+config), openapi `path-names` + params/security DRY; notes-api `AppError`
- [x] API design & contract audit (document-only) — [`docs/reviews/api-review.md`](./reviews/api-review.md)
- [x] API follow-ups — `problemSchema` instance/extras, `encodeCursor` bare Error, [api-style.md](./api-style.md), bless http/cli wide surfaces in semver-contract, client MVP error docs
- [x] Resilience thin pass — [api-throws.md](./api-throws.md), `sanitizeExtras` on Problem Details, `installProcessSignals({ fatalErrors })`
- [x] Docs site POC — VitePress in [`apps/docs`](../apps/docs) (`pnpm docs:dev` / `docs:build`); guide + recipes + reference
- [x] Local pack + docs clarity — [repo-layout.md](./repo-layout.md), `pnpm pack:local` → `.packs/`, [playground/smoke](../playground/smoke) consumer install
- [x] Example time-tracking (Clockify-like) — [`examples/time-tracking`](../examples/time-tracking) API + Tailwind UI on `:3040`
- [x] Production Phase 2 backlog (→ 0.1.0) — [TODO-production.md](./TODO-production.md) must #11–17 / should #18–22 / later #23–27; no ORM package
- [x] Phase 2 must #11–17 — packages `0.1.0`, Changesets + [publish.md](./publish.md), CHANGELOG, auth/health/db/deploy recipes, client `ClientError`, notes-api `/health`+/`/ready`, docs site pages

## Still open (future)

- [ ] Phase 2 should #18–22 — see [TODO-production.md](./TODO-production.md)
- [ ] Wire: infer deps from TypeScript parameter types (Phase 2 #27)
- [ ] `ResultAsync` / `safeTry` (deferred from RFC 0006; Phase 2 #26)

## Verify

```bash
pnpm check && pnpm build && pnpm openapi:check
pnpm zwen client --app examples/minimal/dist/app.js --out examples/minimal/api-client.ts --name MinimalClient
```
