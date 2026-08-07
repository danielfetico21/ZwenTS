# Security defaults checklist

Use before advocating a ZwenTS app as production-ready.

## HTTP / middleware

| Item | Guidance |
|------|----------|
| CORS | Explicit origin **allowlist** (or predicate). Never `origin: () => true` / reflect-all with credentials in prod. |
| `trustProxy` (rate limit) | Default **off**. Enable only behind a trusted reverse proxy that strips client `X-Forwarded-For`. |
| Security headers | `securityHeaders()` on; disable HSTS only on plain local HTTP. |
| Request ID | `requestId()` early in the stack; echo safe client IDs only. |
| Body limits | Keep `maxBodyBytes` / multipart caps; do not set `Infinity` in prod. |
| Demo auth | `ALLOW_DEMO_AUTH` unset in prod ([auth-recipe.md](./auth-recipe.md)). |

## HTML / browser demos

| Item | Guidance |
|------|----------|
| CSP | Prefer a real CSP in production UIs. Local Tailwind CDN demos often omit CSP — do not copy that to prod. |
| Cookies | `Secure; HttpOnly; SameSite` if you use cookie sessions. |
| Mixed content | HTTPS at the edge. |

## Multi-instance

| Item | Guidance |
|------|----------|
| Rate limit / idempotency stores | Redis (or equivalent) — [redis-stores-recipe.md](./redis-stores-recipe.md) |
| Secrets | Env / secret manager; never commit `.env` |

## Examples in this repo

- `examples/notes-api` — CORS allowlist via `CORS_ORIGIN`
- `examples/time-tracking` — CORS allowlist for local UI hosts (not reflect-all)
