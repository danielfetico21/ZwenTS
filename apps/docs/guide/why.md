# Why ZwenTS

ZwenTS is a Nest-shaped *idea* (typed routes, middleware, OpenAPI, lifecycle) with a different bet:

**Make composition obvious.** Prefer readable call sites over framework magic.

## Trade-offs we accept

| Nest-style | ZwenTS |
|------------|--------|
| Decorators + reflect-metadata | Plain functions + Zod |
| Module / DI container | Explicit `context` + Wire codegen (optional) |
| Global modules | App-level `use()` order you control |
| Opinionated ORM | None — bring your DB (app-owned; no framework ORM) |

## What you get

1. **`createApp`** — middleware onion, routes, `dispatch` for tests, `start` / `stop` hooks  
2. **`route()`** — Zod validate in/out; OpenAPI from the same schemas  
3. **Problem Details** — reserved `ErrorCodes`, stable wire shape  
4. **Adapters** — `listen` / `createFetchHandler`, body limits, timeouts, drain  
5. **Middleware packages** — auth, CORS/security headers, rate limit, idempotency, OTEL  

## Who it's for

Teams who want TypeScript backends that stay greppable — and who are willing to write `app.use(rateLimit(...))` instead of decorating classes.

If you need Nest's ecosystem (CQRS, Microservices transport plugins, GraphQL first-class), stay on Nest. If you want a smaller core with deep modules, keep reading.
