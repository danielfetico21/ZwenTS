# Code Review: schema / openapi / cli / config / oxlint-plugin / examples

## Summary

Read-only audit of `packages/schema/**`, `packages/openapi/**`, `packages/cli/**`, `packages/config/**`, `packages/oxlint-plugin/**`, and `examples/**` against `docs/reviews/bugs-checklist.md` (C8, C9, C10, C12) plus an independent pass for bugs, security, leaks, races, and business-logic gaps.

`@zwents/schema` Result unwrap / branded `isResult` handling looks sound and well tested. The highest-severity findings are: (1) notes-api cross-user idempotency cache replay (C12), (2) OpenAPI parameter `$ref`s left as broken `#/$defs/...` while components live under `#/components/schemas/...` (C9), and (3) wire / OpenAPI client codegen that interpolates unsanitized strings into emitted TypeScript (C10). Config and oxlint-plugin are small and mostly fine.

### Checklist cross-check

| ID | Status | Notes |
|----|--------|-------|
| **C8** | Mostly Verified OK | Branded Result unwrap + Err bypass of output schema are correct; residual edges: output validation surfaced as 400, `rawBody` empty defaults. |
| **C9** | Still open | Params/query (and `schemaRefs: false` param schemas) emit `#/$defs/...` that do not resolve; body/output registry path + rewrite are OK for nested components. Client always throws on non-2xx. |
| **C10** | Still open | Confirmed codegen injection via `functionName`, provider keys, and import specifiers; `--out` can write anywhere the process can write. |
| **C12** | Still open | Ownership checks on get/delete/list are correct; unauthenticated demo token minting; **idempotency fingerprint omits user → cross-user response leak**. |

## ✅ Verified OK

- **C8 Result unwrap** (`packages/schema/lib/route.ts:128-139`) — Uses branded `isResult` / `isErr`; Err returns without output validation; Ok values are re-validated and re-wrapped with `ok(...)`. Plain returns with `output` go through `parseOrThrow`. Covered by `packages/schema/tests/route-result.test.ts`.
- **Result branding vs domain JSON** — Domain `{ ok: true, value }` is not mistaken for `Result` (`@zwents/core` `ResultBrand`); schema route relies on that correctly.
- **`errors` meta copy** (`packages/schema/lib/route.ts:142-145`) — `Object.fromEntries` normalizes numeric status keys to strings for OpenAPI; covered by `route-edges.test.ts`.
- **Pagination helpers** (`packages/schema/lib/pagination.ts`) — Limit bounds asserted at schema construction; cursor charset / length / decode path reject CR/LF/NUL and invalid payloads.
- **OpenAPI body/output/error `$ref` registry** (`packages/openapi/lib/generate.ts:134-187`, `250-294`) — Nested Zod `.meta({ id })` schemas land in `components.schemas` with rewritten refs (see `generate-edges.test.ts` / `generate.test.ts`).
- **OpenAPI security discovery** (`packages/openapi/lib/generate.ts:297-388`) — App + route middleware `Symbol.for("@zwents/auth.security")`; `security: false` clears operation security.
- **Wire topo-sort / cycle / missing deps** (`packages/cli/lib/wire/generate.ts:91-147`) — Fails closed on cycles, missing bindings, unimported factories, duplicate keys, seed conflicts (extensive `wire-gen.test.ts`).
- **notes-api ownership** (`examples/notes-api/lib/notes-service.ts:59-82`, `lib/notes-repo.ts:24-38`) — `get` / `remove` / `list` filter by `userId`; cross-user GET returns 404 (tested in `tests/api.test.ts`).
- **`loadConfig`** (`packages/config/lib/load-config.ts:13-31`) — Fail-fast `CONFIG_ERROR` with issue list; no mutation of `process.env`.
- **oxlint rules surface** (`packages/oxlint-plugin/index.ts`) — `no-reflect-metadata`, `no-decorators`, `require-route-output` behave as documented heuristics.

## 🐛 Issues Found

### 1. notes-api idempotency key is not scoped per user (C12)

- **Severity:** High
- **Category:** Security / Business Logic
- **Location:** `examples/notes-api/app.ts:130` (`idempotency()`); default fingerprint in `@zwents/idempotency` is `METHOD path` + body only (no auth subject)
- **Description:** `POST /notes` uses shared in-memory idempotency with the default fingerprint. Two different authenticated users who send the same `Idempotency-Key` and body receive the first user’s cached response (`Idempotent-Replay: true`), including the other user’s note `id` / content. Reproduced locally: Ada creates a note; Grace replays with the same key/body and gets Ada’s note body.
- **Suggested Fix:** Pass a custom `fingerprint` that includes `ctx.auth?.userId` (and ideally a stable auth principal), or namespace keys as `${userId}:${rawKey}` in example wiring; add a regression test for cross-user key reuse → independent creates (or 409), not replay of the other user’s response.

### 2. OpenAPI params/query `$ref`s point at `#/$defs/...` (broken) (C9)

- **Severity:** High
- **Category:** Bug
- **Location:** `packages/openapi/lib/generate.ts:63-67` (`zodToInlineSchema`), `198-235` (`buildParameters`); contrast `resolveSchema` / `ComponentSchemaRegistry` at `238-248`, `134-187`
- **Description:** Path/query parameters always use `zodToInlineSchema` and never the component registry or `rewriteSchemaRefs`. When a param/query field uses a Zod type with `.meta({ id })` (e.g. `NoteId`), the emitted parameter schema is `{ "$ref": "#/$defs/NoteId" }` while the actual schema is registered (if at all) under `#/components/schemas/NoteId`. The parameter object does not embed `$defs`, so the pointer does not resolve. Confirmed with a minimal app: params/query refs stay `#/$defs/NoteId` even though `components.schemas.NoteId` exists. Body/output paths that go through `components.ref()` are fine.
- **Suggested Fix:** Run parameter property schemas through the same registry + ref rewrite as body/output (or inline fully and strip/`$defs`-promote consistently). Add a generate test with `.meta({ id })` on params/query asserting `#/components/schemas/...` (or a self-contained inline schema with local `$defs`).

### 3. Wire codegen interpolates unsanitized identifiers / import paths (C10)

- **Severity:** High
- **Category:** Security / Bug
- **Location:** `packages/cli/lib/wire/generate.ts:178-186` (`functionName`, provider keys, deps, expose); `459-468` (import specifier emission); `292-299` (`functionName` accepted as any string literal)
- **Description:** Emitted TypeScript is built with raw string interpolation. Confirmed:
  - `functionName: "build(); console.log(1); function x"` → `export function build(); console.log(1); function x() {`
  - provider key `"foo-bar"` → `const foo-bar = createDb();` (invalid / injectable)
  - import specifier containing `";\nconsole.log(1);//` breaks out of the generated `import ... from "..."` string  
  Threat model **needs discussion**: trusted first-party `wire.ts` vs running `zwen gen:wire` on untrusted PRs / generated manifests. Separately, `--out` (`generateWireContainer` at `196-199`) writes to any resolvable path with no sandbox.
- **Suggested Fix:** Require emitted names (`functionName`, keys, seeds, deps, expose, factory locals) to match `/^[A-Za-z_][A-Za-z0-9_]*$/`; emit module specifiers via `JSON.stringify`; reject string keys that are not valid identifiers (or quote safely only where TS allows). Optionally confine `--out` under cwd / package root.

### 4. OpenAPI fetch client codegen: unsanitized `operationId` / type names (C9/C10)

- **Severity:** High
- **Category:** Security / Bug
- **Location:** `packages/openapi/lib/client.ts:123-124` (`operationId` used as method name); `161-171` (`export type ${name}`); `12`, `94` (`clientName`)
- **Description:** `generateFetchClient` interpolates OpenAPI `operationId` and component schema keys directly into TypeScript. Confirmed: `operationId: "fetch(){return 1}; async evil"` emits `async fetch(){return 1}; async evil(...)`. When invoked via `zwen client`, names usually come from `generateOpenApi`’s sanitizer, but `generateFetchClient` accepts arbitrary documents and is a public API. Same class of issue as wire codegen.
- **Suggested Fix:** Sanitize method/type/client names to safe identifiers (mirror `sanitizeSchemaName`); refuse or escape illegal `operationId`s; fuzz tests with hostile OpenAPI documents.

### 5. Generated client `...init` overrides method/body/headers; `Headers` spread is broken (C9)

- **Severity:** Medium
- **Category:** Bug / Business Logic
- **Location:** `packages/openapi/lib/client.ts:67-80`
- **Description:** Emitted call is `{ method, headers: { "content-type": "...", ...init?.headers }, body: JSON.stringify(body), ...init }`. Because `...init` is last, callers can unintentionally replace `method` / `body` / `headers`. Spreading `init.headers` when it is a `Headers` instance yields `{}` (non-enumerable), so `Authorization` etc. passed as `Headers` are dropped while `content-type` remains.
- **Suggested Fix:** Spread `init` first, then set `method` / `body` / merged headers; normalize headers with `new Headers(init?.headers)` before setting `content-type`. Document throw-on-error behavior (always `throw` when `!res.ok`) as intentional or offer a Result-style option (**needs discussion** for API stability).

### 6. Unauthenticated demo token minting (C12)

- **Severity:** Medium
- **Category:** Security / Business Logic
- **Location:** `examples/notes-api/app.ts:86-97`; `examples/notes-api/lib/tokens.ts:8-19`
- **Description:** `POST /auth/token` issues a bearer token for any `userId` with no credential check. Tokens are random and not hardcoded secrets, but they never expire or revoke and live in the shared in-memory map. README documents the flow; risk is copy-paste into production (**needs discussion** how loudly examples should fail closed).
- **Suggested Fix:** Keep as demo but gate with env (`ALLOW_DEMO_AUTH=1`), add expiry/revocation notes in README, or replace with a clearly fake static mapping used only in tests.

### 7. Output schema failures surfaced as HTTP 400 (C8)

- **Severity:** Medium
- **Category:** Business Logic
- **Location:** `packages/schema/lib/parse.ts:14-24` (`location: "output"`); `packages/schema/lib/route.ts:130-137`
- **Description:** Handler return values that fail `output` validation throw `VALIDATION_ERROR` (400). That is appropriate for request `params`/`query`/`body`, but for `output` it usually indicates a server bug and can teach clients to retry or blame the request. Covered as 400 in `edge.test.ts` today.
- **Suggested Fix:** Map `location: "output"` to `INTERNAL_ERROR` / 500 (or a dedicated code), keep issue details out of public responses in production.

### 8. `rawBody: "utf8"|"bytes"` silently defaults when raw bytes are missing (C8)

- **Severity:** Low
- **Category:** Bug / Business Logic
- **Location:** `packages/schema/lib/route.ts:111-117`
- **Description:** Missing `raw.raw` becomes `""` (utf8) or `new Uint8Array()` (bytes). Webhook HMAC handlers can verify an empty payload instead of failing closed if the HTTP adapter failed to capture raw bytes.
- **Suggested Fix:** When `rawBody` is set and `raw.raw` is missing, throw a clear 400/500; add a test for the missing-raw path.

### 9. `schemaRefs: false` still leaves broken param `$ref`s (C9 related)

- **Severity:** Medium
- **Category:** Bug
- **Location:** `packages/openapi/lib/generate.ts:198-235` with `zodToInlineSchema`
- **Description:** With `schemaRefs: false`, request bodies may include a sibling `$defs` (resolvable relative to that schema object), but path/query parameter schemas still emit bare `#/$defs/NoteId` without embedding `$defs` on the parameter schema — still broken.
- **Suggested Fix:** Same as issue 2; for inline mode, either fully dereference parameter schemas or attach `$defs` onto each parameter schema object.

### 10. CLI loads and executes arbitrary `--app` modules

- **Severity:** Low
- **Category:** Security
- **Location:** `packages/cli/lib/app-tools.ts:13-32`; `packages/cli/lib/bin.ts:49-55`
- **Description:** `loadAppModule` does `import()` of a user-supplied path. Expected for a local codegen CLI; dangerous if wired into CI against untrusted artifacts without isolation (**needs discussion** — document only vs path allowlist).
- **Suggested Fix:** Document explicitly in CLI help/README; optionally refuse paths outside cwd unless `--allow-untrusted`.

### 11. oxlint `require-route-output` only matches bare `route(` identifier

- **Severity:** Low
- **Category:** Bug
- **Location:** `packages/oxlint-plugin/index.ts:75-78`
- **Description:** Aliased imports (`import { route as zodRoute }`) or `schema.route(...)` bypass the rule. Heuristic by design; false negatives only.
- **Suggested Fix:** Resolve imported bindings / report on callee names from `@zwents/schema` if the oxlint API allows.

## 🧪 Regression Tests Needed

1. **notes-api:** User A creates with `Idempotency-Key: K`; user B reuses `K` + same body → must not receive A’s note (`Idempotent-Replay` must not cross users).
2. **openapi generate:** Route with `params`/`query` field typed as `z.string().uuid().meta({ id: "NoteId" })` → parameter schema `$ref` is `#/components/schemas/NoteId` (or fully inlined with local `$defs`), never dangling `#/$defs/NoteId`.
3. **openapi generate:** `schemaRefs: false` + meta-id params → no unresolved `#/$defs` pointers in `parameters`.
4. **wire codegen:** Reject `functionName` / provider keys / deps that are not safe identifiers; reject or escape module specifiers containing quotes/newlines; snapshot that hostile inputs throw `WireCodegenError` instead of emitting executable breakout.
5. **openapi client:** Hostile `operationId` / schema component names → sanitized identifiers or hard error; `init` with `Headers` preserves `Authorization`; `init.body` cannot clobber generated JSON body.
6. **schema route:** Missing `raw` when `rawBody: "utf8"` fails closed; output validation failure returns 500 (if issue 7 accepted).
7. **C8 smoke (already strong):** Keep Err-without-output-validation + Ok-with-output-validation cases; add Ok value that Zod transforms (defaults) to ensure transformed data is what core serializes.
