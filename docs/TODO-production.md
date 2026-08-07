# Production surface TODO

Ordered backlog for stable public APIs. Work **one item at a time** with edge-case tests (see `.cursor/skills/zwents-testing` + `zwents-security-middleware`).

**ORM:** out of scope for the framework (RFC 0001 NG2). Document recipes / optional app-level Drizzle|Kysely|pg in `examples/` — never a `@zwents/orm` package.

**Target:** `0.1.0` public-advocable (use in production on Node 22+ with semver + npm + baseline docs). Not Nest-parity.

---

## Phase 1 — surface (done)

| # | Item | Package / place | Status |
|---|------|-----------------|--------|
| 1 | CORS + security headers + request-id echo | `@zwents/security` (+ core `responseHeaders`) | done |
| 2 | Rate limit (in-memory + pluggable store) | `@zwents/ratelimit` | done |
| 3 | Body size limit + request timeout | `@zwents/http` / core signal | done |
| 4 | Idempotency (`Idempotency-Key`) | `@zwents/idempotency` | done |
| 5 | Pagination helpers (cursor/offset) | `@zwents/schema` | done |
| 6 | Graceful shutdown contract + tests | `@zwents/http` + docs | done |
| 7 | Multipart / raw body (webhooks) | `@zwents/http` + schema | done |
| 8 | OpenAPI securitySchemes from auth | `@zwents/openapi` + auth | done |
| 9 | Real example (auth + DB recipe, no ORM package) | `examples/notes-api` + docs | done |
| 10 | Semver contract doc (middleware order, Problem Details) | `docs/semver-contract.md` | done |

---

## Phase 2 — toward 0.1.0

### Must (blocker 0.1.0)

| # | Item | Package / place | Status |
|---|------|-----------------|--------|
| 11 | Release train — bump `0.1.0`, Changesets (or equiv.), publish runbook, CI on tag | root / CI | done |
| 12 | Semver freeze lite — honor [semver-contract.md](./semver-contract.md); CHANGELOG on breaking; blessed exports stable | docs + packages | done |
| 13 | Auth for production (JWT/session recipe); demo `ALLOW_DEMO_AUTH` stays fail-closed | docs + examples | done |
| 14 | Client errors — fetch client parses `application/problem+json` (not bare `Error` on `!ok`) | `@zwents/openapi` / CLI | done |
| 15 | Health endpoints recipe — `GET /health` + `/ready` (deps); snippet in an example | docs + examples | done |
| 16 | Docs site minimum — VitePress: getting started, errors, shutdown, auth, db, deploy; link from root README | `apps/docs` | done |
| 17 | DB recipe „production shape” — pool, `onStop`, transactions, migrations in app (Drizzle/Kysely/pg); no ORM package | [db-recipe.md](./db-recipe.md) + example | done |

### Should (before advocating hard)

| # | Item | Package / place | Status |
|---|------|-----------------|--------|
| 18 | Redis-backed stores — adapters/docs for ratelimit + idempotency | docs / examples | todo |
| 19 | Request logging middleware — structured access log (method, path, status, duration, requestId) | package or recipe on `Logger` | todo |
| 20 | Multipart size enforce on stream (not only `Content-Length`) | `@zwents/http` | todo |
| 21 | OpenAPI/client parity — cheap non-200 typed responses; document remaining MVP gaps | `@zwents/openapi` + docs | todo |
| 22 | Security defaults checklist — CORS allowlist in examples, CSP notes for HTML demos, `trustProxy` docs | docs + examples | todo |

### Later / nice (post-0.1.0)

| # | Item | Package / place | Status |
|---|------|-----------------|--------|
| 23 | Metrics (Prometheus / OTEL metrics) alongside existing traces | `@zwents/otel` or recipe | todo |
| 24 | WebSocket / SSE adapters | `@zwents/http` or separate | todo |
| 25 | Nest-level docs + more examples | `apps/docs` / `examples` | todo |
| 26 | `ResultAsync` / `safeTry` | `@zwents/core` (deferred RFC 0006) | todo |
| 27 | Wire: infer deps from TypeScript parameter types | `@zwents/cli` wire | todo |

### Explicit out of scope

- ORM in `packages/*`
- Decorator DI / `reflect-metadata`
- GraphQL first-class
- Admin UI / dashboard in the framework

---

## Done recently

See [SESSION-LOG.md](./SESSION-LOG.md).
