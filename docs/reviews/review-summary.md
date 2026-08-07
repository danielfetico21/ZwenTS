# Code review summary (parallel audit)

Also see the API/contract pass: [`api-review.md`](./api-review.md).

Consolidated from:

- [`review-core-http.md`](./review-core-http.md) — `@zwents/core`, `@zwents/http`
- [`review-security-middleware.md`](./review-security-middleware.md) — auth, security, ratelimit, idempotency, otel
- [`review-schema-openapi-cli.md`](./review-schema-openapi-cli.md) — schema, openapi, cli, config, oxlint, examples

**Status:** Critical / High / Medium / actionable Low **fixed**. Remaining are intentional skips or ops notes.

---

## Fixed (all severities)

See prior sprints for High + Medium. Low fixed this pass:

| Area | Issue | Fix |
|------|--------|-----|
| schema | `rawBody` silent empty default | Fail closed → `INTERNAL_ERROR` |
| security | CORS / extras CR/LF | `assertSafeHeaderValue` + no reflect of hostile Origin |
| http | Duplicate query keys last-wins | `parseSearchParams` → `string \| string[]` |
| core | Partial start re-runs hooks | Resume from next hook index |
| idempotency | Idle prune only on `start()` | Optional `sweepIntervalMs` + `dispose()` |
| cli | Arbitrary `--app` import | Refuse outside cwd unless `--allow-untrusted` |

## Intentionally skipped

| Item | Why |
|------|-----|
| oxlint `require-route-output` identifier-only | Heuristic by design; alias resolution is low ROI |
| OTEL global provider one-shot | `@opentelemetry/api` limitation; tests shut down provider |
| C13 multi-instance stores | Ops / deploy guidance, not a code bug |

---

## Checklist rollup

| ID | Status |
|----|--------|
| C1–C12 | **Fixed** (as applicable) |
| C8 | **Fixed** (output→500 + rawBody fail-closed) |
| C13 | Confirmed ops — document shared Redis/etc. for multi-node |
| C14 | Partial — span status fixed; global restore limited by OTEL API |

---

## Suggested next (product, not audit)

- Shared-store recipes for ratelimit / idempotency (C13)
- Optional oxlint improvements if alias false-negatives hurt in practice
