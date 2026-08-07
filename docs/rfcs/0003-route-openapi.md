# RFC 0003: Typed `route()` and OpenAPI Mapping

- **Status:** Accepted
- **Created:** 2026-08-06
- **Accepted:** 2026-08-06
- **Depends on:** [RFC 0001](./0001-lightweight-typescript-backend.md), [RFC 0002](./0002-repo-bootstrap.md)

---

## 1. Summary

Formalize how `@zwents/schema` `route()` attaches Zod schemas to core `RouteDefinition.meta`, and how `@zwents/openapi` maps those into OpenAPI 3.1.

## 2. Motivation

RFC 0001 required schema-first routes and docs-from-schema. Implementation landed in schema + openapi packages; this RFC is the contract so CLI, drift CI, and future client codegen share one mapping.

## 3. Route definition contract

### 3.1 Core `RouteDefinition`

```ts
type RouteMeta = {
  tags?: readonly string[];
  schemas?: {
    params?: unknown;
    query?: unknown;
    body?: unknown;
    output?: unknown;
  };
};

type RouteDefinition = {
  method: HttpMethod;
  path: string;
  middleware?: Middleware[];
  handler: Handler;
  meta?: RouteMeta;
};
```

Core stays Zod-free: schemas are `unknown` opaque values.

### 3.2 Schema `route()`

`route({ method, path, params?, query?, body?, output?, tags?, middleware?, handler })`:

1. Wraps `handler` to `parseOrThrow` each present schema (`params` / `query` / `body` before handler; `output` after).
2. Returns a `RouteDefinition` whose `meta.tags` and `meta.schemas` mirror the options.
3. Infers handler `input` / return types from Zod generics.

Validation failures throw `AppError("VALIDATION_ERROR", 400)` with `extras.location` and `extras.issues`.

### 3.3 Raw input shape

Adapters (HTTP) pass into `dispatch`:

```ts
input: { query?: unknown; body?: unknown }
```

Core merges path `params` from the matcher:

```ts
handler(ctx, { params, query, body })
```

## 4. OpenAPI mapping

| Source | OpenAPI |
|--------|---------|
| `path` `/users/:id` | `/users/{id}` |
| `method` | path item key (`get`, `post`, …) |
| `meta.tags` | `operation.tags` |
| `meta.schemas.params` | path `parameters` (always `required: true`) |
| `meta.schemas.query` | query `parameters` (`required` from JSON Schema) |
| `meta.schemas.body` | `requestBody` `application/json` |
| `meta.schemas.output` | `responses.200` `application/json` |
| `meta.errors["404"]` | `responses.404` (`application/problem+json` + `application/json`) |

JSON Schema is produced with Zod 4 `z.toJSONSchema`, stripping `$schema`.

Document envelope:

```ts
{
  openapi: "3.1.0",
  info: { title, version, description? },
  servers?,
  paths
}
```

### 4.1 Components / `$ref`

By default (`schemaRefs: true`), body / output / error Zod schemas are registered under `components.schemas` and referenced with `$ref`.

| Naming | Rule |
|--------|------|
| `.meta({ id: "User" })` | Component name `User` |
| Anonymous body / output | `{Method}{PathTokens}{Body\|Response}` (e.g. `PostUsersByIdBody`) |
| Anonymous errors | `Problem` (shared instance → one component) |
| Nested schemas with `id` | Flattened into `components.schemas`; refs rewritten to `#/components/schemas/{id}` |

Path/query parameter property schemas stay inline. Set `schemaRefs: false` to restore fully inline schemas.

Security schemes from `@zwents/auth` middleware metadata land in `components.securitySchemes` (see auth `withSecurityMeta`).

### 4.2 Client codegen

`generateFetchClient(doc)` / `zwen client` emit a typed `fetch` wrapper: exported types from `components.schemas`, typed path params, typed query params (`URLSearchParams`; no `style`/`explode`), typed JSON bodies, and typed success JSON from **200 / 201 / 202** (first present). On `!res.ok` the client throws `ClientError` with `status` and optional `problem` when the body is Problem Details JSON (not server `AppError`).

**Still MVP / out of scope for the client:** OpenAPI `style`/`explode`, typed non-2xx success unions, and automatic parsing of every documented error schema into distinct TypeScript types (errors remain `ClientError` + optional `problem`).

## 5. Tooling

- `generateOpenApi(app, { info })` — `@zwents/openapi`
- `generateFetchClient(doc)` — thin TS fetch client source
- `zwen openapi|client|check|routes`
- CI: regenerate example spec and `git diff --exit-code` (`pnpm openapi:check`)
- Oxlint `zwents/require-route-output` — warn on `route({...})` without `output`

## 6. Compatibility

Changing path templating (`:id` → `{id}`), meta field names, or Problem Details codes is a **breaking** change for generated docs and clients.

## Revision history

| Date | Change |
|------|--------|
| 2026-08-06 | Accepted — documents shipped schema/openapi behavior |
| 2026-08-06 | Components `$ref` registry + typed client bodies/responses |
