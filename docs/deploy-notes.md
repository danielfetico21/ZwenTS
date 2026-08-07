# Deploy notes

Minimum checklist for running a ZwenTS app in production.

## Runtime

- Node.js **≥ 22**
- ESM (`"type": "module"`)
- Build packages/app (`tsc` / your bundler) before start
- `installProcessSignals(app, { fatalErrors: true })` in the entrypoint — see [shutdown-recipe.md](./shutdown-recipe.md)

## Config

- Fail-fast env via `@zwents/config` `loadConfig`
- Never enable `ALLOW_DEMO_AUTH` outside local demos
- CORS: explicit origin allowlist (not reflect-all)

## Process model

1. Start → `listen(app, { port, host, drainTimeoutMs, requestTimeoutMs })`
2. Drain on SIGTERM → in-flight finish → `onStop` (DB pools, etc.)
3. Health: [health-recipe.md](./health-recipe.md) (`/health`, `/ready`)

## Dependencies you own

| Concern | In ZwenTS | In your app |
|---------|-----------|-------------|
| HTTP / middleware / errors | yes | — |
| Auth verify hook | bearer helpers | JWT/JWKS or sessions |
| DB / migrations | — | pool + recipe [db-recipe.md](./db-recipe.md) |
| Rate limit / idempotency stores | in-memory default | Redis (or other) for multi-instance |

## Docs site

Consumer docs: `pnpm docs:dev` → [`apps/docs`](../apps/docs).
