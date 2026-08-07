# Code quality & refactoring summary

Separate pass from the bug/security audit. **Document only — no inline refactors.**

| Source | Path |
|--------|------|
| Tooling baseline | [`tooling-baseline.md`](./tooling-baseline.md) |
| core + http | [`quality-review-core-http.md`](./quality-review-core-http.md) |
| auth / security / ratelimit / idempotency / otel | [`quality-review-security-middleware.md`](./quality-review-security-middleware.md) |
| schema / openapi / cli / config / oxlint / examples | [`quality-review-schema-openapi-cli.md`](./quality-review-schema-openapi-cli.md) |

**Overall:** Code health is strong (deep modules, low jscpd TS duplication **0.24%**). Debt is mostly **cross-file pattern DRY** and a few **large codegen/body files**, not sprawl or `any`-driven chaos.

---

## Quick wins (Small effort · high clarity)

Do these first when you open a refactor sprint:

| # | Area | Refactor | Why |
|---|------|----------|-----|
| 1 | http | Extract `abortReasonAsAppError` (~6 copy sites in `timeout.ts` / `body.ts`) | ✅ Batch 1 |
| 2 | http | Drain 503 via `toWebResponse(problemJson(…))` instead of hand-rolled `Response` | ✅ Batch 1 |
| 3 | http | Drop Hono pass-through in `listen` **or** document why it stays | ✅ Done (serve fetch directly; keep `@hono/node-server`) |
| 4 | core | Fix `matchRoute` barrel: export `compileRoute`+`CompiledRoute` **or** un-export `matchRoute` | ✅ Done (export both) |
| 5 | middleware | Shared `problemResponse(code, path, detail?)` used by auth / ratelimit / idempotency | ✅ Batch 1 |
| 6 | security | Table-drive `securityHeaders`; move `setResponseHeader` → `header-value.ts` | ✅ Batch 1 |
| 7 | auth | `requireAuth` = `authorize(() => true, options)` | ✅ Batch 1 |
| 8 | openapi | Extract `idents.ts` (`sanitizeIdent` / `uniqueIdent`) shared by generate + client | ✅ Batch 1 |
| 9 | openapi | Dedupe `buildParameters` path/query loops + security `dedupeRequirements` | ✅ Batch 4 |
| 10 | otel | Prefer `isAppError` over duck `{ code, status }` | ✅ Batch 1 |
| 11 | idempotency | `takeInFlight(key, lease)` for complete/fail | ✅ Batch 1 |
| 12 | examples | Shared Problem Zod schema; use `AppError` not `ReturnType<typeof appError>` | ✅ Batch 4 (`problemSchema`) |

---

## Medium effort · structural maintainability

| # | Area | Refactor | Why |
|---|------|----------|-----|
| A | openapi | Split `generate.ts` → json-schema / components / operations | ✅ Batch 2 |
| B | cli wire | Split `wire/generate.ts` → parse / topo / emit | ✅ Batch 2 |
| C | http | Split `body.ts` → read / multipart / parse | ✅ Batch 2 |
| D | openapi | Shared path→name tokenization (colon vs brace params) | ✅ Batch 4 (`path-names.ts`) |
| E | core + idempotency | Typed `DispatchRequest.input` + shared `DISPATCH_INPUT_STATE_KEY` | ✅ Batch 3 |
| F | schema DX | `createRoute<S>()` factory so apps drop `notesRoute` wrappers | ✅ Batch 3 |
| G | openapi client | Query-param parity with OpenAPI **or** document MVP gap | ✅ Batch 3 (query + searchParams) |
| H | security tokens | Shared `isSafeToken` (request-id + idempotency); align ratelimit strip vs reject | ✅ Batch 3 (unsafe key → skip) |
| I | schema/config | Shared Zod-issue → extras formatter | ✅ Batch 4 (`formatZodIssues`) |

---

## Larger / defer — **leave as-is** (reviewed post Batch 4)

No ROI to chase now. Revisit only if the trigger in the note appears.

| Topic | Note |
|-------|------|
| Extract Map prune/evict helper for ratelimit + idempotency | Revisit if a **3rd** memory store lands; eviction semantics already diverge |
| Deep typed `composeProviders` | Wire codegen is the answer — don’t polish the shallow MVP |
| Full `TInput` preservation through `createApp` route table | Schema/long-term; not a core polish item |
| Rich OpenAPI TypeScript model instead of `Record<string, unknown>` | Revisit if generators keep growing and bag typing hurts |
| Drop Result dual aliases (`attempt` / `fromThrowable`, …) | **Do not** — intentional RFC 0006 surface |

---

## Suggested tech-debt batches

### Batch 1 — “DRY week” (1–2 days) — **done**
Items **1, 2, 5, 6, 7, 8, 10, 11** (+ bonus: drop Hono pass-through in `listen`, export `compileRoute`/`CompiledRoute`).

### Batch 2 — “File splits” (2–3 days) — **done**
Items **A, B, C** — pure moves + re-exports; keep public barrels stable.

### Batch 3 — “API / DX decisions” (design then code) — **done**
Items **3, 4, F, G, H, E** — see [`docs/proposals/quality-batch-3.md`](../../proposals/quality-batch-3.md).

### Batch 4 — polish — **done**
Examples (**12**), Zod issue helper (**I**), openapi param/security micro-DRY (**9, D**).

---

## Tooling gaps to optional-add later

- Keep **oxlint**; if you want cognitive-complexity rules, evaluate oxlint plugins or a thin ESLint+sonarjs job — not required given current size.
- Optional CI: `jscpd` on `packages/**/lib` with threshold (e.g. fail if TS duplicated lines > 1%).
- Treat knip “unused tests/fixtures” as ignore patterns if you adopt knip in CI.

---

## What not to chase

- JSON `package.json` / `tsconfig` clones (monorepo boilerplate).
- Example / CLI `console.log` (appropriate).
- Coverage chase past ~98% lines — already healthy.
- Security/race fixes — already covered in [`../review-summary.md`](../review-summary.md).
