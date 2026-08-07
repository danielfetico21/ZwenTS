# Security checklist

| Item | Prod default |
|------|----------------|
| CORS | Explicit allowlist — not reflect-all |
| `trustProxy` (rate limit) | Off unless behind a trusted proxy |
| `securityHeaders` | On (HSTS off only for local HTTP) |
| Body / multipart limits | Keep caps; no `Infinity` |
| Demo auth | `ALLOW_DEMO_AUTH` unset |
| Multi-instance stores | Redis — [Redis stores](/recipes/redis) |

Full notes: monorepo `docs/security-checklist.md`.
