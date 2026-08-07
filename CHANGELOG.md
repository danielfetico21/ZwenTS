# Changelog

All notable changes to `@zwents/*` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Semver rules: [docs/semver-contract.md](./docs/semver-contract.md).

## 0.1.0 — 2026-08-07

First public-advocable cut. Packages under `packages/*` share version **0.1.0**.

### Added

- Production surface: security, rate limit, idempotency, pagination, shutdown, multipart/raw body, OpenAPI auth schemes
- Generated fetch client throws `ClientError` and parses Problem Details JSON when present; types 200/201/202 success JSON
- `@zwents/security` `accessLog()` middleware
- `@zwents/otel` `otelHttpMetrics()`; `@zwents/http` `sseResponse` / `encodeSseEvent`
- `@zwents/core` `ResultAsync`, `mapAsync`, `andThenAsync`, `safeTry`
- Publish train: Changesets config, [docs/publish.md](./docs/publish.md), tag publish workflow
- Recipes: auth, health/ready, DB, Redis, security checklist, metrics, SSE
- Docs site pages for the above

### Notes

- Still **0.x** — breaks allowed with changelog; prefer additive changes through 0.x
- No ORM package (by design); use [docs/db-recipe.md](./docs/db-recipe.md)
- Demo token minting in examples requires `ALLOW_DEMO_AUTH=1` (fail-closed)
