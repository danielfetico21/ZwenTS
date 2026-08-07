# RFC 0002: Repository Bootstrap

- **Status:** Accepted
- **Created:** 2026-08-06
- **Accepted:** 2026-08-06
- **Authors:** ZwenTS
- **Depends on:** [RFC 0001](./0001-lightweight-typescript-backend.md) (Accepted)
- **Supersedes:** —

---

## 1. Summary

Bootstrap the ZwenTS monorepo so RFC 0001 can be implemented: **pnpm workspaces**, TypeScript project references, **Oxlint** (not ESLint) + **Oxfmt** for lint/format, Vitest, GitHub Actions CI, and an initial package skeleton aligned with RFC 0001 §5.

This RFC decides tooling questions left open in RFC 0001 (monorepo tool, lint, format, brand scope name for packages).

---

## 2. Motivation

RFC 0001 defines the framework philosophy but not how the repo is laid out or gated. Without an early bootstrap:

- Package boundaries drift
- CI/lint choices get re-litigated per PR
- Nest-style ESLint + typescript-eslint stacks reintroduce the slow, heavy DX we are avoiding

Lint and format should match the product values: **fast, explicit, minimal magic**.

---

## 3. Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Package manager | **pnpm** 11.x (`packageManager` pinned) | Strict `node_modules`, workspace-native; Node 22+ required by pnpm 11 |
| Monorepo task runner | **pnpm** scripts + `pnpm -r` / filters; optional **Turborepo** only if cache pain appears | Avoid early abstraction; add Turbo when CI time justifies it |
| Language | TypeScript **7.x**, **ESM-only** packages (`"type": "module"`) | Native TS 7 compiler; no dual CJS publish in MVP |
| Node | **22 LTS** in CI; engines `>=22` | Floor raised with pnpm 11 (dropped Node 20) |
| Lint | **Oxlint** | Rust-speed; native TS/unicorn/node/import rules; JS plugins for framework rules |
| Format | **Oxfmt** (Oxc formatter) if stable enough for the repo; else **Prettier** until Oxfmt is adopted | Prefer one Oxc toolchain; document fallback |
| Typecheck | `tsc -b` with project references | No Babel for library build in MVP |
| Test | **Vitest** | Fast, ESM-friendly; Oxlint has built-in vitest plugin |
| HTTP engine (impl) | **Hono** behind `@fw/http` | RFC 0001 lean; Workers path later |
| Validation | **Zod** 3.x (or 4.x if chosen at implement time—one major, pinned) | RFC 0001 |
| npm scope | **`@zwents/*`** for publishable packages; docs may still say `@fw/*` as a generic placeholder until rename is complete | Real scope = org/product name |
| Docs alias | In RFCs, `@fw/*` ≡ `@zwents/*` until a rename pass updates 0001 | Avoid churn mid-draft |

### 3.1 Why Oxlint instead of ESLint

| Concern | ESLint | Oxlint |
|---------|--------|--------|
| Cold lint on monorepo | Often multi-second–minute with typescript-eslint type-aware rules | Typically sub-second–few seconds native rules |
| Config weight | Flat config + many plugins | `.oxlintrc.json` + selective plugins |
| Framework custom rules | Mature custom plugins | **JS plugins (alpha)** — ESLint-compatible API + faster `createOnce` |
| Philosophy fit | Nest ecosystem default | Matches “fast local iteration” (RFC 0001 G3 / §6.4) |

**Split of responsibility:**

| Check | Tool |
|-------|------|
| Style / bugprone / TS hygiene / `no-explicit-any` (as configured) | Oxlint built-ins |
| Ban decorators / `reflect-metadata` / require route `output` | `@zwents/oxlint-plugin` (JS plugin) |
| Route conflicts, OpenAPI drift, composition graph | `fw check` / CLI (not the linter) |
| Formatting | Oxfmt (or Prettier fallback) |
| Types | `tsc -b` |

We **do not** add ESLint as a parallel linter. If an Oxlint JS plugin API gap blocks a rule, prefer implementing the check in `fw check` (ts-morph / ts-api) over introducing ESLint.

### 3.2 Oxlint plugin package

```
packages/oxlint-plugin/
  src/
    index.ts          # definePlugin
    rules/
      no-decorators.ts
      no-reflect-metadata.ts
      require-route-output.ts  # AST heuristic; deepen in RFC 0003
```

Config sketch (repo root):

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "node", "import", "vitest", "oxc"],
  "jsPlugins": [
    { "name": "zwents", "specifier": "@zwents/oxlint-plugin" }
  ],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "rules": {
    "typescript/no-explicit-any": "error",
    "zwents/no-decorators": "error",
    "zwents/no-reflect-metadata": "error",
    "zwents/require-route-output": "warn"
  },
  "ignorePatterns": ["**/dist/**", "**/*.gen.ts", "coverage/**"]
}
```

**Note:** JS plugins are alpha; pin `oxlint` and `@oxlint/plugins` versions. Rules that need type-aware multi-file analysis stay in `fw check`.

### 3.3 Format: Oxfmt vs Prettier

1. **Try Oxfmt** at bootstrap for a single Oxc toolchain (lint + format).
2. If Oxfmt lacks IDE/CI maturity for the team, **Prettier 3** with a minimal config (`semi`, `singleQuote`, `printWidth: 100`) is the approved fallback.
3. Do not run both formatters. Do not use ESLint stylistic rules (Oxlint also de-emphasizes token-based style rules).

---

## 4. Repository layout

```
ZwenTS/
  docs/
    rfcs/
      README.md
      0001-...
      0002-...
  packages/
    core/              # @zwents/core
    schema/            # @zwents/schema (Zod binders)
    http/              # @zwents/http (Hono adapter)
    config/            # @zwents/config
    context/           # @zwents/context
    openapi/           # @zwents/openapi
    test/              # @zwents/test
    cli/               # @zwents/cli (fw)
    oxlint-plugin/     # @zwents/oxlint-plugin
  examples/
    minimal/           # composition-root hello world
  benchmarks/
    boot/              # cold-boot harness (baseline later)
  .github/
    workflows/
      ci.yml
  package.json         # private workspace root
  pnpm-workspace.yaml
  tsconfig.base.json
  tsconfig.json        # solution-style references
  .oxlintrc.json
  .oxfmtrc.json        # or prettier.config if fallback
  vitest.workspace.ts
  README.md
  LICENSE
```

### 4.1 MVP packages to scaffold (empty or stub exports)

Create package shells with `package.json` + `tsconfig.json` + `src/index.ts` stub:

1. `@zwents/core`
2. `@zwents/schema`
3. `@zwents/http`
4. `@zwents/config`
5. `@zwents/test`
6. `@zwents/cli`
7. `@zwents/oxlint-plugin`

Defer `@zwents/context`, `@zwents/openapi`, `@zwents/otel`, `@zwents/auth` until their first real commit (directories optional).

### 4.2 Package.json conventions

```json
{
  "name": "@zwents/core",
  "version": "0.0.0",
  "private": false,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "typecheck": "tsc -b --pretty false"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

Internal deps use `"@zwents/core": "workspace:*"`.

Root scripts:

```json
{
  "scripts": {
    "build": "pnpm -r run build",
    "typecheck": "tsc -b",
    "lint": "oxlint .",
    "lint:fix": "oxlint --fix .",
    "format": "oxfmt .",
    "format:check": "oxfmt --check .",
    "test": "vitest run",
    "check": "pnpm typecheck && pnpm lint && pnpm test"
  }
}
```

(If Prettier fallback: `format` → `prettier --write .`, etc.)

---

## 5. TypeScript configuration

**`tsconfig.base.json`:**

- `strict`: true (including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — evaluate latter; if too noisy for MVP, enable after first packages stabilize)
- `module`: `NodeNext`
- `moduleResolution`: `NodeNext`
- `target`: `ES2022`
- `declaration`: true
- `declarationMap`: true
- `sourceMap`: true
- `skipLibCheck`: true
- `noEmitOnError`: true
- **`experimentalDecorators` / `emitDecoratorMetadata`: false** (never enable in base)

Each package extends base, sets `composite: true`, `outDir: dist`, `rootDir: src`, and lists project references to workspace deps.

---

## 6. CI

GitHub Actions `ci.yml` on PR + main:

| Job | Steps |
|-----|-------|
| `quality` | pnpm install --frozen-lockfile → typecheck → oxlint → format check → vitest |
| `node-matrix` (optional later) | Node 22 + 24 |

Requirements:

- `pnpm-lock.yaml` committed
- Fail on Oxlint errors
- No ESLint job
- Cache pnpm store

Boot benchmark job can be nightly later (RFC 0001 §8.8)—not required on day-one CI.

---

## 7. Local DX

| Concern | Choice |
|---------|--------|
| Editor | Recommend Oxc / Oxlint VS Code (or Cursor) extension; document settings |
| Pre-commit | Optional **Lefthook** or **simple-git-hooks** running `oxlint` on staged files — not Husky+lint-staged ESLint stacks |
| Env examples | `.env.example` only inside `examples/*` |

---

## 8. Naming: CLI binary

RFC 0001 uses `fw` as the CLI name. Bootstrap decision:

| Option | Pros | Cons |
|--------|------|------|
| `fw` | Short, RFC-compatible | Generic; npm collision risk |
| `zwen` / `zwents` | Branded | Longer |

**Decision:** Ship binary name **`zwen`** with alias docs that `fw` in RFCs means this CLI. Optionally provide `fw` as a secondary bin if the name is free on npm at publish time.

---

## 9. Implementation plan (bootstrap PR sequence)

1. Root workspace: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, LICENSE, README
2. Oxlint + format config; CI workflow green on empty lint
3. Stub packages listed in §4.1 with hello `export {}`
4. `examples/minimal` depending on stubs (compile-only until core exists)
5. `@zwents/oxlint-plugin` with `no-reflect-metadata` + `no-decorators` (MVP rules)
6. Vitest workspace smoke test in `packages/core`

No framework behavior in the bootstrap PR beyond stubs—behavior lands in follow-on implementation PRs guided by RFC 0001 / 0003.

---

## 10. Out of scope

- Publishing to npm (until 0.1.0)
- Turborepo / Nx
- Changesets / release automation (follow-on when first publish looms)
- Docker images
- Implementing `route()` / OpenAPI (RFC 0003)
- Wire codegen (RFC 0005)

---

## 11. Open questions

1. **Exact npm org:** `@zwents` vs `@zwen` — confirm before first publish (workspace may use `@zwents` provisionally).
2. **Oxfmt readiness:** Confirm at implement time; Prettier is the documented fallback (§3.3).
3. **`exactOptionalPropertyTypes`:** Enable from day one or after MVP APIs settle?
4. **Changesets:** Introduce at first public version or earlier for changelog discipline?

---

## 12. Success criteria

- `pnpm install && pnpm check` passes on a clean clone
- No ESLint dependency in the lockfile
- Oxlint runs in CI under a few seconds for the stub monorepo
- `experimentalDecorators` absent from all tsconfigs
- RFC 0001 package map has a real directory home for MVP packages

---

## 13. Appendix — Tool versions (pin at implement time)

Record actual versions in the bootstrap PR; targets as of this RFC:

| Tool | Target |
|------|--------|
| pnpm | 9.x or 10.x |
| TypeScript | **7.x** (native compiler; pin current stable at bootstrap) |
| oxlint | current stable with JS plugins support |
| @oxlint/plugins | matched to oxlint |
| vitest | 3.x |
| hono | current stable (peer of `@zwents/http`) |
| zod | single major, pinned |

---

## Revision history

| Date | Change |
|------|--------|
| 2026-08-06 | Initial draft — Oxlint/Oxfmt, pnpm, `@zwents/*`, Hono |
| 2026-08-06 | Accepted |
| 2026-08-06 | TypeScript **7.x** (not 5.x) as blessed compiler |
