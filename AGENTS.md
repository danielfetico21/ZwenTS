# Agent notes

Packages are deep modules — see [packages/README.md](./packages/README.md) before adding or importing one.

Design source of truth: [docs/rfcs/](./docs/rfcs/).
Session checklist / what landed recently: [docs/SESSION-LOG.md](./docs/SESSION-LOG.md).
Production backlog: [docs/TODO-production.md](./docs/TODO-production.md).
DB wiring (no ORM in core): [docs/db-recipe.md](./docs/db-recipe.md). Example: `examples/notes-api`.

Project skills (`.cursor/skills/`):

- `zwents-testing` — Vitest edge cases
- `zwents-security-middleware` — CORS / headers / ratelimit / idempotency safety
- `zwents-conventions` — deep modules, DRY/KISS, API style/contract
- `zwents-verify` — **after code / before push**: 3 agents on the git diff
- `zwents-audit` — **deep audit**: bugs checklist, Prompt A (API), Prompt B (resilience) → `docs/reviews/`

Prompts: [docs/verify-prompt.md](./docs/verify-prompt.md). Checklist: [docs/reviews/bugs-checklist.md](./docs/reviews/bugs-checklist.md).

## Stack decisions

- Package manager: **pnpm**
- TypeScript: **7.x** (`nodenext`, project references, `customConditions: ["typescript"]`)
- Lint: **Oxlint** (not ESLint)
- Format: **Oxfmt**
- Test: **Vitest**
- HTTP engine: **Hono** behind `@zwents/http`
- Validation: **Zod 4** via `@zwents/schema`
