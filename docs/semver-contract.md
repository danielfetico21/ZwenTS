# Semver contract

Public stability rules for `@zwents/*` before and after 1.0. Breaking any item below requires a **major** bump (or a documented pre-1.0 exception in the changelog).

## Versions

| Range | Promise |
|-------|---------|
| `0.x` | APIs may change; changelog calls out breaks. Prefer additive changes. From **0.1.0**, treat blessed surfaces in this doc as freeze-lite (breaks only with changelog + minor/major bump). |
| `1.x` | Items in this doc are stable. Removals/renames need a major. |

Release notes: root [CHANGELOG.md](../CHANGELOG.md). Publish: [publish.md](./publish.md).

Package versions may differ within the monorepo; each package’s `package.json` version is authoritative for that package.

## Middleware order

For a matched route, the pipeline is always:

1. App-level middleware (`app.use`), registration order  
2. Route-level middleware (`route({ middleware })`), registration order  
3. Handler  

Semantics that are part of the contract:

- Left-to-right onion wrapping (`composeMiddleware`): outer middleware runs before `next()`, then inner, then after `next()` unwinds reverse.
- Middleware may short-circuit with `ctx.respond(...)` and **must not** call `next()` afterward.
- Auth / rate-limit / idempotency failures that short-circuit skip the handler.
- `ctx.responseHeaders` set before a short-circuit or error are merged onto the final response (including Problem Details).

Changing this order, or making route middleware run before app middleware, is breaking.

## Errors and Problem Details

Blessed error wire shape is RFC 7807 Problem Details as defined in [RFC 0004](./rfcs/0004-error-problem-details.md):

- `Content-Type: application/problem+json`
- Stable fields: `type`, `title`, `status`, `code`, optional `detail` / `instance` / `extras`
- Framework `ErrorCodes.*` names and default statuses are reserved

Breaking changes include renaming framework codes, changing default statuses for those codes, dropping required Problem Details fields, or switching the default error media type away from `application/problem+json`.

Application-specific codes may be added freely; they are not framework semver surface.

## OpenAPI generation

Stable for consumers of `generateOpenApi` / `zwen openapi`:

- OpenAPI **3.1** document root
- Path templating `:id` → `{id}`
- Zod route `meta` → parameters / requestBody / responses
- Auth middleware security metadata → `components.securitySchemes` + operation `security` (unless `security: false` or explicit `security`)
- Body / output / error schemas → `components.schemas` + `$ref` by default (`schemaRefs: false` to inline)

Changing those mappings without a major (post-1.0) is breaking for committed specs and generated clients.

## Blessed wide surfaces (intentional)

These roots stay wide on purpose through 1.0 (adapters / tooling). Apps should prefer the “happy path”; low-level exports remain supported.

| Package | Happy path | Also public (advanced) |
|---------|------------|-------------------------|
| `@zwents/http` | `listen`, `createFetchHandler`, `toWebResponse`, `installProcessSignals` | Body readers/limits, timeout helpers, `parseSearchParams` |
| `@zwents/cli` | `runCli`, `./wire` (`defineWire` / `wire`) | Programmatic OpenAPI/client writers, wire codegen (`parse*` / `emit*` / topo) |
| `@zwents/core` | `createApp`, errors, Result, `composeMiddleware` | `compileRoute` / `matchRoute`, `ResultBrand`, `DISPATCH_INPUT_STATE_KEY` |

Narrowing any of the advanced columns after 1.0 is a **major**. Style notes: [api-style.md](./api-style.md).

## Out of contract

Not guaranteed across minors even after 1.0 unless separately documented:

- Exact JSON Schema shape produced by Zod (`z.toJSONSchema`) for edge Zod types
- Client codegen method names / formatting beyond “callable for documented paths”
- Exact generated client formatting beyond documented behavior (`ClientError` + optional Problem Details parse on `!res.ok`)
- Internal `Symbol.for` keys (discoverable via public helpers only)
- Example apps and recipe docs (informational)

## Recommended composition order

Not a hard runtime requirement, but the documented happy path for middleware stacks:

1. `requestId` / logging / OTEL  
2. `cors` / `securityHeaders`  
3. `rateLimit`  
4. body limits / timeouts (adapter options)  
5. auth (`bearerAuth` / `requireAuth` / `authorize`)  
6. idempotency (mutating routes)  
7. route handler  

Reordering may change which status/headers clients see first; treat app stacks as your own API surface.
