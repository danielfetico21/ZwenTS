# notes-api example

Small authenticated Notes API showing ZwenTS composition without an ORM.

## Run

```bash
pnpm --filter @zwents/example-notes-api build
pnpm --filter @zwents/example-notes-api start
```

## Flow

Demo token minting requires `ALLOW_DEMO_AUTH=1` (disabled by default):

```bash
ALLOW_DEMO_AUTH=1 pnpm --filter @zwents/example-notes-api start
```

1. `GET /health` / `GET /ready` — liveness / readiness (no auth)
2. `POST /auth/token` `{ "userId": "ada" }` → `{ "token": "tok_…" }`
3. `Authorization: Bearer <token>`
4. `POST /notes` (+ optional `Idempotency-Key`)
5. `GET /notes` paginated
6. `GET|DELETE /notes/:id` (owner only)

## Stack used

- `@zwents/security` — request-id, headers, CORS
- `@zwents/ratelimit`
- `@zwents/auth` — bearer + `requireAuth`
- `@zwents/idempotency` on create
- `@zwents/schema` pagination
- `zwen gen:wire` — composition from [`wire.ts`](./wire.ts) → [`lib/container.gen.ts`](./lib/container.gen.ts)
- In-memory DB — swap via [docs/db-recipe.md](../../docs/db-recipe.md)

## Regenerate container

```bash
pnpm --filter @zwents/example-notes-api gen:wire
```
