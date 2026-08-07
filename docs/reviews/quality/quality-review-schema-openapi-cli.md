# Code Quality Review: schema / openapi / cli / config / oxlint / test / examples

## Summary
These packages are generally readable deep modules with thin public surfaces. Runtime logic in `@zwents/schema` (`parse`, `route` handler body) and `@zwents/config` / `@zwents/test` is small and clear. Maintainability pressure concentrates in three codegen/AST files (`openapi/lib/generate.ts` ~535 LOC, `openapi/lib/client.ts` ~333 LOC, `cli/lib/wire/generate.ts` ~567 LOC) plus duplicated naming/Zod-issue helpers across packages. The biggest design judgment call is whether `route()`’s multi-parameter generics are worth the inference power versus the DX tax visible in `examples/notes-api`.

## ✅ Well-Structured
- `packages/schema/lib/parse.ts` — single-purpose `parseOrThrow` with a clear input-vs-output error split.
- `packages/schema/lib/route.ts` runtime handler — linear validate → call → validate flow; easy to follow despite heavy types.
- `packages/schema/lib/pagination.ts` public API — paired `offset*` / `cursor*` helpers stay consistent and discoverable.
- `packages/openapi/lib/generate.ts` `ComponentSchemaRegistry` — encapsulates Zod registry + `$defs` promotion without leaking into callers.
- `packages/cli/lib/wire/define.ts` — tiny runtime surface that matches codegen expectations; good deep-module split from AST work.
- `packages/cli/lib/app-tools.ts` — thin, testable glue over `@zwents/openapi` (load / check / write).
- `packages/config/lib/load-config.ts` and `packages/test/lib/start-test-app.ts` — minimal, KISS APIs.
- `packages/oxlint-plugin/index.ts` — focused rules with clear docs; no unnecessary abstraction.

## 🔧 Refactoring Opportunities

### 1. Shared identifier sanitization / unique-name helpers
- **Type:** Duplication
- **Location:**
  - `packages/openapi/lib/client.ts` L3–7 (`sanitizeIdent`), L154–163 (`uniqueIdent`)
  - `packages/openapi/lib/generate.ts` L91–96 (`sanitizeSchemaName`), L151–155 (inline collision suffix in `ComponentSchemaRegistry.ref`)
- **Description:** Nearly identical “strip non-ident chars → fallback → digit prefix” logic, plus two copies of “append 2,3,… until unique”. Drift risk if OpenAPI schema names and client type names diverge in sanitization rules.
- **Suggested Refactor:** Extract `packages/openapi/lib/idents.ts` with `sanitizeIdent(name, fallback)` and `uniqueIdent(base, used)`. Have `sanitizeSchemaName` call `sanitizeIdent(name, "Schema")`; reuse `uniqueIdent` in the registry.
- **Effort:** Small

### 2. Path → PascalCase operation/schema name tokenization
- **Type:** Duplication
- **Location:**
  - `packages/openapi/lib/generate.ts` L69–89 (`pascalCase`, `schemaNameHint`) — `:param` → `ByParam`, method + path segments + role
  - `packages/openapi/lib/client.ts` L165–187 (`operationName`) — `{param}` → `ByParam`, method + path segments
- **Description:** Same conceptual algorithm for turning HTTP paths into type/operation names, with different param syntax (`:id` vs `{id}`) and casing (`GetNotes…` vs `getNotes…`). Easy for naming to diverge when one side is fixed.
- **Suggested Refactor:** Shared `pathTokens(path, { paramStyle: "colon" | "brace" })` + `toOperationBaseName(method, tokens)` used by both generators; keep role suffix / `operationId` override at call sites.
- **Effort:** Medium

### 3. Split oversized OpenAPI `generate.ts`
- **Type:** Complexity
- **Location:** `packages/openapi/lib/generate.ts` (full file, ~535 LOC) — Zod→JSON helpers L45–67, registry L134–210, ref rewriting L98–265, operation builders L267–463, `generateOpenApi` L471–527
- **Description:** One file owns security meta discovery, Zod JSON Schema conversion, component registry, parameter materialization, and document assembly. Hard to navigate and review; helpers are not reused by `client.ts` even when concepts overlap.
- **Suggested Refactor:** Split into private modules under `packages/openapi/lib/` e.g. `json-schema.ts` (isZodType, strip, zodToInline, ref rewrite), `components.ts` (registry), `operations.ts` (parameters/responses/security), keep `generate.ts` as the orchestrator exporting `generateOpenApi` / `stringifyOpenApi`.
- **Effort:** Medium

### 4. Client generator: `$ref` handling + method body construction
- **Type:** Duplication / Complexity
- **Location:** `packages/openapi/lib/client.ts`
  - `$ref` resolve duplicated in `schemaToType` L231–241 and `schemaToTypeExpr` L264–274
  - Nested ternary for fetch call shape L96–108
  - `generateFetchClient` itself L15–142 packs type emission + method codegen
- **Description:** `$ref` alias/emit path is copy-pasted; method bodies are built via nested ternaries that are hard to extend (e.g. headers, query). File size is manageable today but change cost is high.
- **Suggested Refactor:** Single `resolveRefType(...)`; extract `emitFetchCall({ method, hasBody })` (early returns / small template helpers); optionally split `types.ts` vs `methods.ts` under `lib/`.
- **Effort:** Medium

### 5. Generated client omits query (and response non-200) that OpenAPI emits
- **Type:** Consistency
- **Location:**
  - Query params emitted: `packages/openapi/lib/generate.ts` L288–305 (`buildParameters` query branch)
  - Client never reads `parameters` / query: `packages/openapi/lib/client.ts` (no `query` / `parameters` usage; only path params L49–51, L150–152)
- **Description:** `generateOpenApi` documents query parameters; `generateFetchClient` only wires path params + JSON body + 200 JSON. Callers get a typed client that cannot express query contracts the same app just documented. **needs discussion** whether this is intentional MVP scope or a gap to close before promoting the client as production-ready.
- **Suggested Refactor:** If in scope: parse operation `parameters` where `in === "query"`, add optional `query?: { … }` arg and append `URLSearchParams`. If out of scope: document the limitation next to `generateFetchClient` and in CLI `zwen client` help so examples/docs stay honest.
- **Effort:** Medium (implement) / Small (document)

### 6. `route()` generics vs readability (**needs discussion**)
- **Type:** Complexity
- **Location:**
  - `packages/schema/lib/route.ts` L19–86, L92–101 — `InferOrUndefined`, `RouteInput` nested conditionals, `ZodRouteOptions` / `route` with 6 type params (`S`, params/query/body/output, `TRaw`)
  - Call-site tax: `examples/notes-api/app.ts` L17–25 (`notesRoute` wrapper re-declares 4 schema params solely to pin `AppServices`)
  - Cast escape hatch: `packages/schema/lib/route.ts` L128–134 (`as RouteInput<…>`)
- **Description:** Inference for handler `input`/`output` is powerful and matches Zod-style APIs, but the type surface is much harder to read than the ~50-line runtime. Apps that care about typed `ctx.services` must re-genericize a thin wrapper. **needs discussion:** keep as-is (document the wrapper pattern), add `createRoute<S>()` / `route.for<S>()` factory to pin services once, or simplify by collapsing optional schema slots (builder / overloads) at the cost of some inference.
- **Suggested Refactor:** Prefer `export function createRoute<S>() { return function route<…>(opts: ZodRouteOptions<S, …>) { … } }` (or equivalent) so examples drop `notesRoute`; leave core inference params unless a builder clearly reduces cognitive load without breaking Zod inference.
- **Effort:** Medium (factory) / Large (full redesign)

### 7. Duplicated Zod issue → extras mapping
- **Type:** Duplication
- **Location:**
  - `packages/schema/lib/parse.ts` L14–18 (`path`, `message`, `code`)
  - `packages/schema/lib/pagination.ts` L281–285 (same shape in `decodeCursor`)
  - `packages/config/lib/load-config.ts` L23–26 (`path`, `message` only — no `code`; root path `"(root)"`)
- **Description:** Same “map Zod issues for `appError` extras” pattern in three places with slightly different shapes. Inconsistent extras make client error handling harder and invite copy-paste bugs.
- **Suggested Refactor:** Shared helper in `@zwents/schema` (e.g. `formatZodIssues(error, { rootPath?: string })`) used by `parseOrThrow` / `decodeCursor`; `@zwents/config` either depends on that small helper or duplicates via a tiny local copy only if package boundaries forbid the dep — **needs discussion** whether config should depend on schema or a neutral shared util.
- **Effort:** Small

### 8. Split CLI wire codegen monolith
- **Type:** Complexity
- **Location:** `packages/cli/lib/wire/generate.ts` (~567 LOC) — parse L52–93 / L213–424, topo L101–158 / L526–560, emit L160–211 / L457–524
- **Description:** AST parsing, cycle detection, and source emission share one module. Individual functions are reasonably named, but the file mixes concerns and makes review/testing of emit vs parse noisier than needed.
- **Suggested Refactor:** Split into `wire/parse.ts`, `wire/topo.ts`, `wire/emit.ts` with `generate.ts` re-exporting the public pipeline (`parseWireSource` → `emitWireContainer` / `generateWireContainer`). Keep `WireCodegenError` + `assertSafeIdent` in a tiny `wire/errors.ts` or `wire/util.ts`.
- **Effort:** Medium

### 9. `buildParameters` path/query loops
- **Type:** Duplication
- **Location:** `packages/openapi/lib/generate.ts` L267–308 — path block L272–286 and query block L288–305
- **Description:** Both branches convert Zod object properties into OpenAPI parameters; only `in`, `required`, and required-set differ.
- **Suggested Refactor:** `appendObjectParams(parameters, { schema, in: "path" | "query", required: "all" | Set<string> }, components)`.
- **Effort:** Small

### 10. Security requirement dedupe duplicated
- **Type:** Duplication
- **Location:** `packages/openapi/lib/generate.ts`
  - `collectSecurity` L387–393 (`JSON.stringify` + `seenReq`)
  - `dedupeRequirements` L401–413 (same algorithm)
  - Call site merges both in `buildOperation` L455–456
- **Description:** Two helpers implement identical “stringify requirement objects for Set membership” dedupe; easy to leave one half-updated.
- **Suggested Refactor:** Keep only `dedupeRequirements`; have `collectSecurity` push raw requires and dedupe once at the end (or call `dedupeRequirements` inside `collectSecurity` and delete the standalone if unused elsewhere).
- **Effort:** Small

### 11. OpenAPI document / JsonSchema typed as bags of `unknown`
- **Type:** Type Safety
- **Location:**
  - `packages/openapi/lib/generate.ts` — `JsonSchema = Record<string, unknown>` L27; `generateOpenApi` return L474; operation/response builders returning `Record<string, unknown>` throughout
  - `packages/openapi/lib/client.ts` L1, L15–16 — same bag typing for input documents
- **Description:** Internal builders cast and index string keys everywhere. Acceptable for a thin JSON emitter, but it hides structural mistakes (wrong response shape, missing `content`) until tests. Client and generate share no typed intermediate model.
- **Suggested Refactor:** Introduce minimal internal types (`OpenApiDocument`, `OperationObject`, `MediaTypeObject`) — even partial — for paths/operations/components; keep public return type as `Record<string, unknown>` or a branded document type if you want a stable export. **needs discussion** how much OpenAPI surface to model vs keep JSON-in/JSON-out.
- **Effort:** Medium

### 12. Examples vs framework consistency (Problem schema, services typing, Result types)
- **Type:** Consistency / Naming
- **Location:**
  - Duplicated Problem Zod schema: `examples/minimal/app.ts` L19–25, `examples/notes-api/app.ts` L35–41
  - Services cast: `examples/notes-api/app.ts` L78 (`ctx.services as AppServices`) despite `createApp({ context: services })` and `notesRoute` pinning `S`
  - Awkward error type: `examples/notes-api/lib/notes-service.ts` L31, L35, L43 — `ReturnType<typeof appError>` instead of `AppError`
  - Result usage mixed: create/get/remove return `Result`; list returns a plain object (`notes-service.ts` L69–72) while handlers sometimes return `Result` and sometimes naked values (`app.ts` L146–151 vs L164–166)
- **Description:** Examples are the teaching surface; duplicated Problem schemas and `ReturnType<typeof appError>` don’t match `@zwents/core`’s `ProblemDetails` / `AppError`. The `as AppServices` cast suggests auth middleware typing isn’t flowing the app’s `S` (example limitation or framework gap). Mixed Result/plain returns obscure the recommended pattern from `docs/result-recipe.md`.
- **Suggested Refactor:** Export a shared `problemDetailsSchema` from `@zwents/schema` (or an examples-only shared module); use `AppError` in service signatures; fix or document the bearer `verify` context typing so the cast can go; align example handlers on one Result style.
- **Effort:** Small–Medium

### 13. CLI `openapi` / `client` flag parsing duplication
- **Type:** Duplication
- **Location:** `packages/cli/lib/bin.ts` L71–87 — both commands read `--out` / `--title` / `--version` with the same defaults pattern
- **Description:** Minor, but the two branches will drift when new shared OpenAPI flags are added (servers, schemaRefs, etc.).
- **Suggested Refactor:** `function openApiInfoFlags(args): { out; title; version }` used by both cases; client adds `--name`.
- **Effort:** Small

### 14. `buildResponses` error branch double-assigns
- **Type:** Complexity
- **Location:** `packages/openapi/lib/generate.ts` L347–362
- **Description:** Builds a response object with optional `content: undefined`, then immediately overwrites the whole entry when schema is missing. Nested ternary / double write is harder to read than early structure choice.
- **Suggested Refactor:** Early-return style: if schema → contentful response; else `{ description }`. Same for the 200 branch L334–345 if desired.
- **Effort:** Small

## 📋 Priority Recommendations
1. **Extract OpenAPI ident + path-name helpers** (opportunities 1–2) — highest DRY payoff across `generate.ts` / `client.ts` for little risk.
2. **Decide `route()` DX** (opportunity 6) — **needs discussion**; a `createRoute<S>()` factory would remove example wrappers without rewriting inference.
3. **Split `openapi/lib/generate.ts` and `cli/lib/wire/generate.ts` by concern** (opportunities 3, 8) — best structural maintainability win as these files grow.
4. **Clarify or implement client query-param parity** (opportunity 5) — **needs discussion**; either finish the client or document the MVP gap so CLI/examples don’t oversell.
5. **Unify Zod issue formatting + example Problem/`AppError` patterns** (opportunities 7, 12) — small consistency fixes that improve error extras and teaching quality.
