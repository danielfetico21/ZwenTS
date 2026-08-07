---
name: zwents-conventions
description: >-
  Enforce ZwenTS code conventions: deep modules, DRY/KISS, API style/contract
  consistency, Result/AppError patterns, package boundaries. Use when writing or
  reviewing @zwents/* / examples, or for convention/DRY/KISS checks before push.
---

# ZwenTS conventions (DRY / KISS / deep modules + API consistency)

Sources of truth:

- [packages/README.md](../../../packages/README.md)
- [docs/api-style.md](../../../docs/api-style.md)
- [docs/api-throws.md](../../../docs/api-throws.md)
- [docs/semver-contract.md](../../../docs/semver-contract.md)
- [AGENTS.md](../../../AGENTS.md)

## Hard rules

1. **Deep modules** — import package entrypoints only; never `lib/` from outside (tests too).
2. **No ORM in framework** — app/recipes only.
3. **Explicit composition** — no decorator DI / `reflect-metadata`.
4. **KISS** — no speculative hooks or unused options.
5. **DRY** — extract only when the same logic + failure modes appear twice.
6. **Errors** — request → `appError` / Problem Details; programmer → bare `Error` `@zwents/<pkg>: …`. No `cause`/stack on the wire.
7. **Result** — `Result` / `ResultAsync` at service boundaries; `fromPromise` / `safeTry` at throwy edges.
8. **Middleware** — `ctx.respond` short-circuit without `next()`; headers via `ctx.responseHeaders`.
9. **Concurrency** — no request Maps on modules; injectable stores; test under `Promise.all`.
10. **Tooling** — Oxlint / Oxfmt / Vitest / pnpm only.

## API contract consistency (light — for diffs)

When the diff touches **public exports**:

| Check | Expect |
|-------|--------|
| Naming | Same verb family for same concept (`create`/`get`/`list`/`remove`, not mix `fetch`/`retrieve`) |
| Errors | Same shape as [api-style.md](../../../docs/api-style.md); document throws in JSDoc if new public API |
| null vs undefined | `null` = explicit empty; omit/`undefined` = optional absent |
| Pagination | Stick to existing offset/cursor helpers — don’t invent a third shape |
| Semver | New required positional args / removed exports = breaking; prefer additive options |
| Encapsulation | Don’t export adapter internals without blessing in semver-contract |

Full-surface Prompt A audits → **zwents-audit** (API mode), not this skill alone.

## Smells (judgment)

Duplicated logic · Speculative generality · Wide barrels · God file · Leaky `lib/` · Inconsistent errors

## Output

```markdown
## Conventions
- **Pass / Fail**
- Findings: `must` | `should` | `nit` — location + one-line fix
```

Skip what Oxlint / `lint:boundaries` already catches unless the diff bypasses it.
