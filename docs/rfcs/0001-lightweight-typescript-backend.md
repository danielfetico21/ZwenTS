# RFC 0001: Lightweight, Explicit TypeScript Backend Framework

- **Status:** Accepted
- **Created:** 2026-08-06
- **Accepted:** 2026-08-06
- **Authors:** ZwenTS
- **Upstream inspiration:** Go/Echo simplicity; NestJS pain points as negative design targets
- **Supersedes:** —
- **Follow-on:** [RFC 0002](./0002-repo-bootstrap.md) (repo bootstrap)

---

## 1. Summary

Build a TypeScript backend framework that prioritizes **explicit composition**, **compile-time feedback**, and **minimal runtime magic**. Dependency injection is optional (manual factories first; optional build-time codegen later). Validation is schema-first (Zod). Routing is feature-owned and typed. Middleware is a single ordered pipeline. Per-request state travels via a typed `RequestContext`, not request-scoped DI.

The product shape is a **thin core + optional packages**, not an all-in-one Nest replacement.

---

## 2. Motivation

### 2.1 Problem

NestJS is productive for large teams familiar with Angular-style DI, but in practice it imposes costs that hurt clarity, boot time, testing, and performance predictability:

1. **Decorator / reflection overhead** — `reflect-metadata` and decorators (`@Injectable`, `@Controller`, `@Module`) hide wiring. Circular dependency failures (`Nest can't resolve dependencies of X`) surface at bootstrap, not compile time.
2. **Module boilerplate** — Every feature needs `imports` / `providers` / `exports` / `controllers`. Forgetting an `export` is a silent-until-runtime bug.
3. **Slow cold starts** — DI resolution at bootstrap scales poorly; large monoliths can take seconds to instantiate (hurts serverless and local iteration).
4. **Request-scoped providers** — `Scope.REQUEST` re-instantiates graphs per request; accidental scope leakage tanks throughput.
5. **Unintuitive filter / interceptor ordering** — Guards → Interceptors → Pipes → Filters, plus global vs controller vs method scope, cause “why didn’t my error handler run?” bugs—especially with async errors in RxJS interceptors.
6. **Validation coupled to class-validator / class-transformer** — Decorator reflection disagrees with TypeScript’s structural typing; `whitelist: true` silently strips undecorated fields.
7. **Testing friction** — `Test.createTestingModule()` redeclares module graphs; unit tests become semi-integration tests.
8. **Microservice transporter lock-in** — Built-in transporters work, but error handling is inconsistent and swapping transports requires refactors.
9. **Dual type systems** — DTO classes, interfaces, and OpenAPI decorators drift.
10. **Lifecycle side effects** — `OnModuleInit` / constructor connection opening obscure startup and shutdown.
11. **HTTP adapter opacity** — Streaming, raw body (webhooks), and multipart become harder than on bare Fastify/Hono.
12. **Ecosystem token lock-in** — Third-party packages expect Nest DI tokens and dynamic modules.

Teams already comfortable with **Go/Echo** (explicit registration, no hidden DI, fast startup) experience Nest as philosophical friction. That contrast is the design compass.

### 2.2 Goals

| ID | Goal |
|----|------|
| G1 | Push missing bindings, circular deps, and route/schema mistakes to **compile time** or a static `fw check` step |
| G2 | Keep the default path free of `reflect-metadata` and decorator DI |
| G3 | Sub-second cold boot for typical services; measurable boot budget in CI |
| G4 | Handlers and services are plain functions—unit-testable without a container |
| G5 | One blessed way each for validation, errors, middleware, and composition |
| G6 | Transport-agnostic application services (HTTP / queue / cron adapters stay thin) |
| G7 | OpenAPI and (later) clients generated from the same route+schema definitions |
| G8 | Multi-runtime story (Node first; Bun / Workers as explicit adapters) |

### 2.3 Non-goals

| ID | Non-goal |
|----|----------|
| NG1 | Decorator-based DI or a Nest-compatible module system |
| NG2 | Shipping or wrapping an ORM |
| NG3 | First-class “microservice transporters” (TCP/Redis/Kafka) inside the core |
| NG4 | Mandating class-based controllers or Angular-like folder layout |
| NG5 | Competing with tRPC solely for TS↔TS RPC (we are HTTP/OpenAPI-first) |
| NG6 | Reimplementing an HTTP server—wrap Hono or Fastify |
| NG7 | Supporting multiple validation libraries in core |

---

## 3. Design principles

1. **Explicit over magical** — Wiring readable in source; no runtime provider search.
2. **Compile-time over runtime** — Prefer TypeScript errors and codegen failures over bootstrap exceptions.
3. **DI optional** — Manual factory composition is the default; codegen is opt-in.
4. **Schema as source of truth** — Types inferred from Zod; docs and tests derive from the same schemas.
5. **One pipeline** — Middleware is an ordered array; error handling is an explicit `onError` hook.
6. **Static object graph** — No request-scoped DI by default; per-request data on `RequestContext`.
7. **Thin core, fat recipes** — Optional packages for auth, OTel, rate limit, jobs; core stays small.
8. **Engine-agnostic business code** — Application services never import `Request`/`Response` from the HTTP engine.
9. **Errors that name the culprit** — Framework errors include file/route/provider identity, not reflection stacks.
10. **Convention with escape hatches** — Opinionated scaffold; plain functions always work.

---

## 4. Architecture

### 4.1 Layering

```
┌─────────────────────────────────────────────────────────┐
│  Adapters: HTTP | Queue | Cron | RPC                      │
├─────────────────────────────────────────────────────────┤
│  Routes / consumers (schemas, middleware, thin handlers) │
├─────────────────────────────────────────────────────────┤
│  Application services (use-cases; transport-agnostic)    │
├─────────────────────────────────────────────────────────┤
│  Domain + ports (interfaces at boundaries only)          │
├─────────────────────────────────────────────────────────┤
│  Infra: DB, Redis, HTTP clients, clock, config           │
└─────────────────────────────────────────────────────────┘

Composition root (buildContainer / createApp) wires top → bottom once at boot.
```

### 4.2 Composition root (no decorator DI)

```ts
// container.ts — explicit, typed, no magic
export function buildContainer(config: Config) {
  const db = createDbPool(config.db);
  const clock = createSystemClock();
  const userRepo = createUserRepository(db);
  const userService = createUserService(userRepo, clock);
  const authService = createAuthService(userRepo, config.jwtSecret);
  return { db, clock, userRepo, userService, authService } as const;
}

export type AppContext = ReturnType<typeof buildContainer>;
```

**Scaling rules:**

1. **`AppContext` is a façade** — Handlers receive a slice (`Pick<AppContext, 'userService'>`) or a feature context, not an unbounded bag if avoidable.
2. **Interfaces only at I/O boundaries** (DB, email, payments)—not for every internal service.
3. **No service locator** (`ctx.get('UserService')`).
4. **Lifecycle is explicit** — `createApp` → `start()` → `stop()`; no constructor side effects that open network resources without an obvious start hook.

**Feature-as-function** (middle ground between one giant container and Nest modules):

```ts
export function createUserFeature(deps: { db: Db; clock: Clock }) {
  const repo = createUserRepo(deps.db);
  const service = createUserService(repo, deps.clock);
  return {
    service,
    register(app: App, ctx: { userService: typeof service }) {
      app.route(getUserRoute(ctx));
      app.route(createUserRoute(ctx));
    },
  };
}
```

Root composition:

```ts
const config = loadConfig(ConfigSchema);
const infra = await createInfra(config);
const users = createUserFeature(infra);
const orders = createOrderFeature({ ...infra, users: users.service });

const app = createApp({ context: { users: users.service, orders: orders.service } });
app.use(requestId(), accessLog());
app.onError(problemDetailsHandler());
users.register(app, { userService: users.service });
orders.register(app, { orderService: orders.service });
await app.start({ port: config.PORT });
```

### 4.3 Optional codegen DI (post-MVP)

Wire-like build step for teams that outgrow hand-written factories:

| Aspect | Spec |
|--------|------|
| Input | Typed factory functions; dependencies expressed as types / AST (not `reflect-metadata`) |
| Output | Generated `container.gen.ts` checked into repo or emitted to `dist/` |
| Circularity | Codegen / compile error with file:line |
| Runtime | Generated code is plain functions—no container walk |
| Production | Never run codegen at process start—only build / CI |

**Ship manual composition first.** Codegen is v1+, not a blocker for MVP.

### 4.4 HTTP substrate

Do not reimplement an HTTP server. Wrap one primary engine behind framework types:

| Option | Role |
|--------|------|
| **Hono** (recommended default) | Fast, middleware-native, Node/Bun/Workers |
| **Fastify** (alternative adapter) | Mature plugins, high throughput, schema hooks |

Business code depends on:

```ts
type Next = () => Promise<void>;

type Middleware = (ctx: RequestContext, next: Next) => Promise<void>;

type Handler<TInput, TOutput> = (
  ctx: RequestContext,
  input: TInput,
) => Promise<TOutput> | TOutput;

interface App {
  use(...mw: Middleware[]): void;
  route<TDef extends RouteDefinition>(def: TDef): void;
  onError(handler: ErrorHandler): void;
  listen(opts: ListenOptions): Promise<ServerHandle>;
  close(signal?: AbortSignal): Promise<void>;
}
```

Handlers never import engine-specific `Request`/`Response` types.

### 4.5 Router-first, typed routes

Feature folders own routes, handlers, and schemas—no `Module` class.

```ts
const GetUserParams = z.object({ id: z.string().uuid() });
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
});

export const getUser = route({
  method: 'GET',
  path: '/users/:id',
  params: GetUserParams,
  query: z.object({ expand: z.enum(['profile']).optional() }).optional(),
  auth: 'required',
  output: UserSchema,
  errors: {
    401: UnauthorizedSchema,
    404: NotFoundSchema,
  },
  tags: ['users'],
  handler: async (ctx, { params, query }) => {
    return ctx.services.userService.getById(params.id, query?.expand);
  },
});

export function registerUserRoutes(app: App) {
  app.route(getUser);
}
```

**Requirements for “typed, not just explicit”:**

- Path params inferred / validated from `path` + `params` schema
- Body / query / headers use the same binder API
- `output` schema validates (dev/test) or serializes responses
- Declared `errors` map feeds OpenAPI and contract tests
- `route()` returns a value usable in tests and docs without listening
- Route groups: shared prefix, middleware, OpenAPI tags

### 4.6 Schema-first validation

**Blessed library:** Zod (ecosystem + OpenAPI bridges). TypeBox may be an alternate binder package later—not in core simultaneously.

| Concern | Policy |
|---------|--------|
| Body / query / params / headers | Same `validate` / route-field API |
| Coercion | Explicit (`z.coerce`); query values are strings by default |
| Unknown keys | Default `strict()`; stripping is opt-in and documented |
| Failures | Map to stable problem-details issues (path, code, message) |
| Multipart | Separate field schemas + file metadata |
| Raw body | `raw: true` escape hatch (webhooks) |
| Output | Parse/serialize via `output` schema; always in test/dev |

This eliminates class-validator / class-transformer dual-type bugs: **one schema → type + runtime + docs**.

### 4.7 Middleware pipeline

One concept; order is the registration order (Koa/Echo-like):

```ts
app.use(requestId, authenticate, rateLimit);
app.route(route({
  method: 'GET',
  path: '/orders',
  middleware: [authorize('orders:read')],
  // ...
}));
```

**Public ordering contract** (tested in CI):

1. App-level middleware (registration order)
2. Group-level middleware
3. Route-level middleware
4. Handler
5. `onError` if anything throws or rejects

Short-circuit: middleware may respond and skip `next()`, or throw. No separate Guard / Interceptor / Pipe / Filter layers. **Promises only** on the default path (optional Observable interop later).

### 4.8 RequestContext (replaces request-scoped DI)

```ts
type AuthPrincipal = {
  userId: string;
  roles: readonly string[];
};

type RequestContext<S = AppContext> = {
  requestId: string;
  signal: AbortSignal;
  auth: AuthPrincipal | null;
  tenantId?: string;
  logger: Logger;
  trace?: SpanContext;
  services: S;
  /** Engine-agnostic request metadata */
  req: {
    method: string;
    path: string;
    headers: Headers;
  };
};
```

**ALS policy:** Always pass `ctx` into handlers. Optional AsyncLocalStorage mirror for libraries that cannot take `ctx` (e.g. some ORM hooks)—documented as an escape hatch, not the primary API. Do not store authoritative business state only in ALS.

Per-request user/tenant/trace data never requires re-instantiating the service graph.

### 4.9 Errors and results

**Blessed HTTP error shape:** RFC 7807 Problem Details (or a documented subset).

```ts
class AppError extends Error {
  constructor(
    readonly code: string,          // e.g. USER_NOT_FOUND
    readonly status: number,
    readonly detail?: string,
    readonly extras?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(detail ?? code, options);
  }
}
```

| Rule | Detail |
|------|--------|
| Mapping | Central table: `code` → default status |
| Causes | Chain with `cause`; never leak internals in production bodies |
| Domain | Services may throw `AppError` or return `Result<T, E>`; HTTP adapter maps both |
| Unhandled | 500 + redacted body; full error in logs with `requestId` |
| Framework errors | Include route id / file hint where known |

Pick **one** team style in docs (prefer throw `AppError` for HTTP apps; show Result for pure domain). Do not bless three competing styles in examples.

### 4.10 Config

```ts
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;
export const config = loadConfig(ConfigSchema); // fail-fast at boot
```

- No `process.env.FOO!` in feature code
- Dotenv only in development (explicit)
- Secrets stay in env / secret manager—not in repo

### 4.11 Lifecycle and shutdown

```ts
const app = await createApp({ config, context });
await app.start(); // connect pools, bind port, run onStart hooks in order

process.on('SIGTERM', () => {
  void app.stop({ timeoutMs: 10_000 });
});
```

- Drain in-flight requests within timeout
- Propagate `AbortSignal` to handlers
- Close infra in reverse start order
- Hooks: `onStart` / `onStop` arrays—ordered, explicit, no Nest lifecycle soup

### 4.12 Transport-agnostic use-cases

```ts
// application service — no HTTP types
export function createUserService(repo: UserRepo, clock: Clock) {
  return {
    async getById(id: string) {
      const user = await repo.findById(id);
      if (!user) throw new AppError('USER_NOT_FOUND', 404);
      return user;
    },
    async register(cmd: RegisterUser, ctx: CommandContext) {
      // shared by HTTP handler and queue consumer
    },
  };
}
```

`CommandContext` carries logger, signal, optional `tx`—not cookies or status codes. Adapters translate transport → command.

### 4.13 Data access stance

The framework **does not** ship an ORM. Docs recommend patterns:

- Repository / gateway factories
- Explicit transactions: `db.transaction(async (tx) => …)`; pass `tx` down
- Migrations via Drizzle / Kysely / Prisma (user choice)
- Health checks register DB ping explicitly for readiness

### 4.14 Observability

Core defines interfaces; `@fw/otel` and logging packages implement them:

- Structured logger: `debug | info | warn | error` with bindings (`requestId`, etc.)
- HTTP access log middleware
- OpenTelemetry: HTTP server spans; user instruments DB
- Propagation: `requestId` (+ `traceparent` when OTel enabled)
- Health: `GET /health/live` (process up), `GET /health/ready` (registered checks)

### 4.15 Security defaults (packages + docs)

- Body size limits; safe JSON parsing (prototype pollution hardening)
- Security headers package (Helmet-like)
- CORS helper with explicit origins
- Cookie + CSRF guidance when using cookie sessions
- Trusted proxy / `X-Forwarded-*` policy must be explicit
- Short threat-model doc in the repo

---

## 5. Package layout

```
@fw/core            App, Router, middleware types, errors, lifecycle
@fw/schema          Zod binders, coercion helpers, response parse
@fw/http            Node (and later Bun) adapter over Hono or Fastify
@fw/context         RequestContext helpers; optional ALS
@fw/config          Env loading + fail-fast
@fw/openapi         Spec generation + drift check
@fw/otel            Tracing / metrics middleware
@fw/auth            Authn / authz primitives (JWT, sessions, policies)
@fw/test            Ephemeral listen, inject, fake clock, schema asserts
@fw/cli             fw new | check | openapi | routes | gen:wire
@fw/oxlint-plugin  Ban decorators; require output schemas on public routes (Oxlint JS plugin)
```

**Packaging rules:** ESM-first; no required `reflect-metadata`; tree-shakeable; peer deps (zod, engine) carefully ranged; Node 20+/22 LTS in CI.

**Linting:** Oxlint is the blessed linter (not ESLint). Framework-specific rules ship as an Oxlint JS plugin; structural checks that need full-program analysis live in `fw check`. Details in RFC 0002.

---

## 6. Developer experience

### 6.1 CLI

| Command | Purpose |
|---------|---------|
| `fw new <name>` | Opinionated service scaffold (composition root, feature folder, config) |
| `fw check` | Route conflicts, schema/route wiring, unused exports, basic DI graph if codegen used |
| `fw openapi` | Emit OpenAPI 3.1 from route definitions |
| `fw routes` | Print method + path + auth + tags |
| `fw gen:wire` | Optional container codegen (post-MVP) |
| `fw build` | `tsc` + `fw check` + OpenAPI drift |

### 6.2 Docs generation

OpenAPI from route + Zod schemas—**no** `@ApiProperty()` duplication. CI fails if regenerated spec differs from committed artifact.

### 6.3 Testing ergonomics

```ts
test('getById throws NotFound for missing user', async () => {
  const fakeRepo = { findById: async () => null };
  const service = createUserService(fakeRepo, fakeClock);
  await expect(service.getById('x')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
});
```

Route tests: `buildContainer(testConfig)` → register routes → `@fw/test` client. No `TestingModule`.

### 6.4 Local iteration

Hard requirement: **sub-second** restart for typical apps (engine + composition). CI boot benchmark fails on >X% regression (threshold set in implementation RFC / bench suite).

### 6.5 Oxlint

Blessed linter is **Oxlint** (Oxc)—not ESLint. Optional `@fw/oxlint-plugin` rules: ban decorator / `reflect-metadata` usage in app code; require `output` on publicly tagged routes. Prefer native Oxlint + TypeScript rules for `no-explicit-any` and related. Cross-file / graph checks stay in `fw check`.

---

## 7. Stdlib packages (beyond core)

| Package concern | Notes |
|-----------------|-------|
| AuthN | Bearer JWT verify helpers; session cookie helpers |
| AuthZ | `authorize(ctx, permission, resource?)` policy functions—not role decorators |
| Rate limit | Middleware + store interface (memory / Redis) |
| Idempotency | `Idempotency-Key` for POSTs |
| Pagination | Cursor helpers + Zod schemas |
| Uploads | Multipart limits + file meta |
| Jobs | `defineJob({ name, input, handler })` + adapters (in-process, BullMQ, SQS) |
| WebSockets / SSE | Optional adapter packages |
| Client codegen | Post-MVP; OpenAPI → typed client |

Plugin contract: **export middleware or `register(app, opts)` functions**—never dynamic Nest-style modules.

---

## 8. Testing plan

### 8.1 Unit tests

Plain factories + hand-built fakes. Target: full unit suite &lt; 5s; run on save.

### 8.2 Schema / contract tests

Property-based tests (fast-check) on public Zod schemas (empty strings, boundaries, unicode).

### 8.3 Route integration tests

Real router + test DB (in-memory or testcontainers) via `@fw/test` HTTP client; assert status + body against schemas.

### 8.4 OpenAPI drift

Regenerate in CI; `git diff --exit-code` against committed spec. Optional Spectral lint.

### 8.5 Middleware ordering

Dedicated suite: auth failure skips handler; rate-limit headers on 429; app → group → route order. Treat ordering as a **semver public contract**.

### 8.6 Error / chaos paths

Downstream DB/Redis/API failures mid-request → correct status/shape; timeout + `AbortSignal` behavior.

### 8.7 Lifecycle tests

In-flight request completes or aborts cleanly on `stop()`; ready fails when DB check fails.

### 8.8 Performance regression (CI)

| Bench | Gate |
|-------|------|
| Cold boot | Fail if regresses &gt; X% vs baseline |
| Throughput | Representative route set (autocannon/k6 nightly) |
| Memory | Idle + load snapshot |

Publish public comparisons vs Nest+Fastify, plain Fastify, Hono.

### 8.9 Static analysis

`fw check` blocking in CI; type tests (`expectTypeOf` / `tsd`) for route inference.

### 8.10 Security smoke

Malformed JSON, oversized bodies, prototype pollution attempts, static path traversal (if static serving exists).

---

## 9. Migration (Nest → this)

1. **Strangler:** mount new router beside Nest on a path prefix or separate port.
2. **Extract services first:** plain factories callable from Nest providers and new handlers.
3. **Move routes incrementally** with OpenAPI drift as the contract.
4. **Codemod (best-effort, later):** controllers → `route()` stubs.
5. Document “do not wrap Nest modules”—rewrite composition roots.

Without a migration guide, adoption stays greenfield-only.

---

## 10. Phased delivery

### MVP (usable library)

- `@fw/core`, `@fw/schema` (Zod), `@fw/http` (one engine), `@fw/config`, `@fw/openapi`, `@fw/test`, `@fw/cli` (`new`, `check`, `openapi`, `routes`)
- Explicit composition, typed `route()`, Problem Details errors, lifecycle, health endpoints
- Middleware ordering tests + boot bench baseline

### v0.x

- `@fw/auth`, `@fw/otel`, rate limit, idempotency, pagination helpers
- Workers/Bun adapter (if Hono path)
- Jobs interface + one adapter
- Oxlint plugin (`@fw/oxlint-plugin`)

### v1

- Optional `fw gen:wire`
- Client codegen from OpenAPI
- Nest migration guide + public benches
- Stability / semver policy for middleware order and error shape

---

## 11. Positioning and risks

### 11.1 Wedge

**Nest refugees who want Echo-like explicitness with TypeScript inference and OpenAPI**—not “another decorator framework,” not “tRPC but different.”

Honest comparison docs vs Nest, Fastify, Hono, Elysia, tRPC.

### 11.2 Risks

| Risk | Mitigation |
|------|------------|
| Reinventing Hono/Fastify | Wrap; innovate on composition, schemas, CLI, testing |
| Overlap with tRPC | HTTP + OpenAPI + polyglot clients as the product |
| Crowded “modern TS server” space | Sharper DX for structure/testing/Nest escape; published benches |
| Codegen DI scope creep | Manual composition until real apps demand Wire |
| `RequestContext` god-object | Feature slices; typed middleware extensions |
| Ecosystem cold start | Keep plugin API as plain functions so any npm package works |

---

## 12. Open questions

1. **Default HTTP engine:** Hono vs Fastify for MVP? (Lean Hono if Workers matter; Fastify if Node-only enterprise plugins dominate.)
2. **Package scope name:** `@fw/*` vs project brand (ZwenTS / final name).
3. **Result vs throw:** Enforce one style in scaffold Oxlint rules, or document both with a default?
4. **OpenAPI output:** Commit generated `openapi.json` always, or generate on release only? (Lean: commit for drift CI.)
5. **Monorepo tool / lint / format:** Decided in [RFC 0002](./0002-repo-bootstrap.md).
6. **Brand and repo layout:** single package early vs multi-package from day one (lean multi-package as in §5; bootstrap in RFC 0002).

---

## 13. Success metrics

| Metric | Target |
|--------|--------|
| Cold boot (scaffold app) | &lt; 100ms on reference hardware (exclude DB connect) |
| Unit test suite (scaffold) | &lt; 5s |
| Time to first successful route test for new contributor | &lt; 30 minutes with docs |
| Nest-equivalent “users CRUD + auth + openapi” example | Fewer lines of wiring than Nest module graph; zero decorators |
| CI | `fw check` + OpenAPI drift + boot bench required on main |

---

## 14. Appendix A — End-to-end sketch

```ts
const config = loadConfig(ConfigSchema);
const infra = await createInfra(config);
const users = createUserFeature(infra);
const appCtx = { userService: users.service, clock: infra.clock };

const app = createApp({ context: appCtx });
app.use(requestId(), otel(), accessLog());
app.onError(problemDetailsHandler());
users.register(app, appCtx);

app.route(route({
  method: 'GET',
  path: '/health/ready',
  output: z.object({ status: z.literal('ok') }),
  handler: async () => {
    await infra.health();
    return { status: 'ok' as const };
  },
}));

await app.start({ port: config.PORT });
```

Readable to an Echo developer. That is the north star.

---

## 15. Appendix B — Nest pain → design control

| Nest pain | Control in this design |
|-----------|------------------------|
| Reflection DI / cryptic cycles | Explicit factories; cycles = TS/codegen errors |
| Module imports/exports | Feature `register(app)`; root composition |
| Slow boot / request scope | Static graph; `RequestContext` for request data |
| Guard/Interceptor/Pipe/Filter | Single middleware array + `onError` |
| class-validator drift | Zod infer + OpenAPI from same schema |
| TestingModule | Call functions / `@fw/test` |
| Transporter coupling | Thin adapters; services transport-agnostic |

---

## 16. Unresolved / follow-on RFCs

- [RFC 0002](./0002-repo-bootstrap.md): Repo bootstrap (pnpm workspace, Oxlint, CI, package names) — **Accepted**
- [RFC 0003](./0003-route-openapi.md): `route()` type system and OpenAPI mapping — **Accepted**
- [RFC 0004](./0004-error-problem-details.md): Error code registry and Problem Details profile — **Accepted**
- [RFC 0005](./0005-wire-codegen.md): Optional Wire-style DI codegen — **Accepted** (MVP: `composeProviders`)


---

## Revision history

| Date | Change |
|------|--------|
| 2026-08-06 | Initial draft |
| 2026-08-06 | Accepted; lint blessed as Oxlint (not ESLint); link RFC 0002 |
