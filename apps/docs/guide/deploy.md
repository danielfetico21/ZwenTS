# Deploy

- Node.js **≥ 22**, ESM
- `pnpm build` then start your entrypoint
- `installProcessSignals(app, { fatalErrors: true })`
- Fail-fast config via `@zwents/config`
- Never set `ALLOW_DEMO_AUTH` in production
- CORS allowlist; `/health` + `/ready` for probes

More: monorepo `docs/deploy-notes.md`, [Graceful shutdown](/recipes/shutdown), [Auth](/recipes/auth), [Database](/recipes/db).
