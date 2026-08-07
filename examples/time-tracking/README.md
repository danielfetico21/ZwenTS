# time-tracking example

Clockify-style **time tracker** demo on ZwenTS: projects, start/stop timer, today’s entries, plus a small Tailwind UI served from the same process.

In-memory store (restart = empty). No ORM — see [docs/db-recipe.md](../../docs/db-recipe.md).

## Run

```bash
pnpm --filter @zwents/example-time-tracking build
pnpm --filter @zwents/example-time-tracking start
```

Open **http://127.0.0.1:3040/** — sign in with any user id (demo token minting is on via `start` script).

## API sketch

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/` | — | HTML UI |
| POST | `/auth/token` | — | `{ userId }` → token (`ALLOW_DEMO_AUTH=1`) |
| GET | `/me` | Bearer | current user |
| GET/POST | `/projects` | Bearer | list / create |
| PATCH/DELETE | `/projects/:id` | Bearer | update / delete |
| GET | `/entries` | Bearer | `?from&to&projectId` (unix ms) |
| GET | `/entries/running` | Bearer | current timer or null |
| POST | `/entries/start` | Bearer | start (one running timer / user) |
| POST | `/entries/stop` | Bearer | stop running (optional `{ id }`) |
| POST | `/entries` | Bearer | manual range `{ startedAt, stoppedAt }` |
| DELETE | `/entries/:id` | Bearer | delete |

## Stack

- `@zwents/core` + `@zwents/schema` routes
- `@zwents/auth` bearer + `requireAuth`
- `@zwents/security` request-id, headers, CORS
- `@zwents/http` `listen` + process signals
