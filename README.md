# ZwenTS

Lightweight, explicit TypeScript backend framework — composition over decorator DI, schema-first validation, single middleware pipeline.

**Version:** `0.1.0` (`packages/*`). Docs site: [`apps/docs`](./apps/docs) (`pnpm docs:dev`).

See [RFC 0001](./docs/rfcs/0001-lightweight-typescript-backend.md) and [RFC 0002](./docs/rfcs/0002-repo-bootstrap.md).

## Requirements

- Node.js >= 22
- pnpm 11.x
- TypeScript 7

## Scripts

```bash
pnpm install
pnpm check      # typecheck + oxlint + boundaries + tests
pnpm test
pnpm build
pnpm docs:dev   # VitePress
pnpm pack:local # tarballs → .packs/ for consumer smoke
```

## Packages

| Package | Role |
|---------|------|
| `@zwents/core` | App, middleware, errors, lifecycle, route matching |
| `@zwents/schema` | Zod `route()` binders (params/query/body/output) |
| `@zwents/http` | Hono + Node `listen()` adapter |
| `@zwents/config` | `loadConfig` — typed env, fail-fast |
| `@zwents/openapi` | OpenAPI 3.1 generation + fetch client |
| `@zwents/test` | `startTestApp` HTTP test helper |
| `@zwents/cli` | `zwen` — `routes` / `openapi` / `client` / `check` |
| `@zwents/auth` | Bearer auth + `authorize` / `requireAuth` |
| `@zwents/otel` | `otelHttp()` / `otelHttpMetrics()` — OpenTelemetry (API peer) |
| `@zwents/security` | CORS, security headers, request-id, access-log |
| `@zwents/ratelimit` | Fixed-window rate limit |
| `@zwents/idempotency` | `Idempotency-Key` middleware |
| `@zwents/oxlint-plugin` | Framework lint rules |

## Quick start

```bash
pnpm install
pnpm check
pnpm build
PORT=3000 node examples/minimal/dist/main.js
# GET http://127.0.0.1:3000/hello?shout=true
```

Production backlog: [docs/TODO-production.md](./docs/TODO-production.md).  
Publish: [docs/publish.md](./docs/publish.md). Changelog: [CHANGELOG.md](./CHANGELOG.md).  
Progress: [docs/SESSION-LOG.md](./docs/SESSION-LOG.md).

Packages are deep modules — see [packages/README.md](./packages/README.md).
