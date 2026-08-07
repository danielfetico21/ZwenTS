# Quality tooling baseline

Generated during the code-quality audit. Tools that are **not** in the monorepo were run via `pnpm dlx` (one-shot). The repo uses **oxlint**, not ESLint — `eslint-plugin-sonarjs` was not available without adding ESLint.

## jscpd (copy-paste)

Command: `jscpd packages --ignore '**/dist/**,**/tests/**,**/*.test.ts' --min-lines 8 --min-tokens 50`

| Format | Files | Clones | Duplicated lines |
|--------|------:|-------:|-----------------:|
| typescript | 46 | **1** | **14 (0.24%)** |
| json | 26 | 19 | mostly identical `package.json` / `tsconfig.json` boilerplate |
| Total | 73 | 20 | 5.83% (JSON-dominated) |

**Takeaway:** Meaningful TS clone rate is very low. Remaining DRY issues are structural (same *pattern*, not cloneable token runs) — agents catch those better than jscpd.

Full report: [`jscpd/jscpd-report.json`](./jscpd/jscpd-report.json), console: [`jscpd-console.txt`](./jscpd-console.txt).

## knip (unused files / exports / deps)

See [`knip.txt`](./knip.txt). Notable real signals (noise filtered mentally):

| Signal | Notes |
|--------|--------|
| `createSilentLogger` unused export | `packages/core/lib/context.ts` — candidate to use or un-export |
| `toWebResponse` unused *from package graph* | Exported from lib file but not barrel; quality review wants `listen` to reuse it |
| `LoadAppModuleOptions` / `TimeoutHandle` unused exported types | Minor surface cleanup |
| Result dual exports (`fromThrowable`\|`attempt`, etc.) | **Intentional** RFC 0006 aliases — not cruft |
| “Unused” test/fixture files | **False positives** — Vitest discovers them; knip doesn’t |

## ts-prune

Ran via `pnpm dlx ts-prune -p tsconfig.json`. Output overlapped knip; prefer knip for monorepo workspaces. Raw: [`ts-prune.txt`](./ts-prune.txt).

## eslint-plugin-sonarjs / depcheck

| Tool | Status |
|------|--------|
| eslint + sonarjs | **Skipped** — no ESLint config; cognitive complexity covered manually + file-size list |
| depcheck | **Skipped** — knip covers unused dependencies in this layout |

## Largest production sources

From [`largest-files.txt`](./largest-files.txt) (tests/dist excluded):

| LOC | File |
|----:|------|
| 567 | `packages/cli/lib/wire/generate.ts` |
| 534 | `packages/openapi/lib/generate.ts` |
| 375 | `packages/http/lib/body.ts` |
| 332 | `packages/openapi/lib/client.ts` |
| 290 | `packages/schema/lib/pagination.ts` |
| 260 | `packages/core/lib/app.ts` |

## Type-smell spot check

`rg` over `packages/**/lib`: little/no `any`; occasional `as unknown as` (OpenAPI security meta) and intentional dual Result names. No `@ts-ignore` / `@ts-expect-error` in lib. `console.log` only in CLI + example `main.ts` (appropriate).
